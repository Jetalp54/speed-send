# SCHEDULED DRAFT RESUME SYSTEM
# Auto-launch ALL Gmail drafts at intervals with configurable repetitions

from celery import group
from app.celery_app import celery_app
from app.database import SessionLocal
from app import models
from datetime import datetime
import logging
import time

logger = logging.getLogger(__name__)

@celery_app.task(bind=True, max_retries=2)
def resume_all_user_drafts_task(self, user_id, batch_size=50):
    """
    Resume (send) ALL Gmail drafts for ONE user.
    Fetches drafts directly from Gmail API, not just app-created ones.
    """
    db = SessionLocal()
    
    try:
        user = db.query(models.WorkspaceUser).filter(models.WorkspaceUser.id == user_id).first()
        if not user:
            return {"success": False, "error": "User not found"}
        
        service_account = user.service_account
        if not service_account:
            return {"success": False, "error": "No service account"}
        
        # Setup Gmail API
        from app.encryption import EncryptionService
        from app.google_api import GoogleWorkspaceService
        from app.config import settings
        from googleapiclient.discovery import build
        
        encryption_service = EncryptionService()
        service_account_json = encryption_service.decrypt(service_account.encrypted_json)
        google_service = GoogleWorkspaceService(service_account_json)
        credentials = google_service.get_delegated_credentials(user.email, settings.GMAIL_SCOPES)
        gmail_service = build('gmail', 'v1', credentials=credentials)
        
        # Fetch ALL drafts from Gmail (not just our app's drafts)
        logger.info(f"📧 Fetching ALL Gmail drafts for {user.email}")
        drafts_response = gmail_service.users().drafts().list(userId='me').execute()
        gmail_drafts = drafts_response.get('drafts', [])
        
        if not gmail_drafts:
            logger.info(f"No drafts found for {user.email}")
            return {"success": True, "user_email": user.email, "sent": 0, "message": "No drafts to send"}
        
        logger.info(f"Found {len(gmail_drafts)} drafts for {user.email}")
        
        sent_count = 0
        failed_count = 0
        
        # Send drafts in batches using Gmail Batch API
        for i in range(0, len(gmail_drafts), batch_size):
            batch_drafts = gmail_drafts[i:i + batch_size]
            batch = gmail_service.new_batch_http_request()
            
            def batch_callback(request_id, response, exception):
                nonlocal sent_count, failed_count
                if exception:
                    logger.error(f"Failed to send draft: {str(exception)}")
                    failed_count += 1
                else:
                    sent_count += 1
            
            for draft in batch_drafts:
                batch.add(
                    gmail_service.users().drafts().send(
                        userId='me',
                        body={'id': draft['id']}
                    ),
                    request_id=draft['id'],
                    callback=batch_callback
                )
            
            batch.execute()
            
            # Small delay between batches to respect rate limits
            if i + batch_size < len(gmail_drafts):
                time.sleep(0.1)
        
        logger.info(f"✅ Resume complete for {user.email}: {sent_count} sent, {failed_count} failed")
        
        return {
            "success": True,
            "user_email": user.email,
            "total_drafts": len(gmail_drafts),
            "sent": sent_count,
            "failed": failed_count
        }
        
    except Exception as e:
        logger.error(f"Resume task failed for user {user_id}: {str(e)}")
        return {"success": False, "error": str(e)}
    finally:
        db.close()


@celery_app.task(bind=True)
def scheduled_resume_iteration(self, draft_campaign_id, iteration_number, total_iterations, interval_seconds=1):
    """
    Execute ONE iteration of scheduled resume.
    This task is called repeatedly by the scheduler.
    """
    db = SessionLocal()
    
    try:
        logger.info(f"🔄 SCHEDULED RESUME - Iteration {iteration_number}/{total_iterations} for campaign {draft_campaign_id} (Interval: {interval_seconds}s)")
        
        # Get campaign and its users
        campaign = db.query(models.DraftCampaign).filter(models.DraftCampaign.id == draft_campaign_id).first()
        if not campaign:
            return {"success": False, "error": "Campaign not found"}
        
        # Get selected users
        from sqlalchemy.orm import joinedload
        campaign = db.query(models.DraftCampaign).options(
            joinedload(models.DraftCampaign.selected_users).joinedload(models.DraftCampaignUser.user)
        ).filter(models.DraftCampaign.id == draft_campaign_id).first()
        
        users = [assoc.user for assoc in campaign.selected_users if assoc.user]
        
        if not users:
            return {"success": False, "error": "No users found"}
        
        logger.info(f"Resuming drafts for {len(users)} users")
        
        # Launch resume tasks for ALL users in parallel
        tasks = [resume_all_user_drafts_task.s(user.id) for user in users]
        job = group(tasks)
        result = job.apply_async()
        
        # Wait for completion (with timeout)
        try:
            results = result.get(timeout=120)  # 2 minute timeout
        except Exception as e:
            logger.warning(f"Timeout waiting for user tasks: {e}")
            # Continue anyway
            results = [] 
        
        total_sent = 0
        total_failed = 0
        if isinstance(results, list):
             total_sent = sum(r.get('sent', 0) for r in results if isinstance(r, dict) and r.get('success'))
             total_failed = sum(r.get('failed', 0) for r in results if isinstance(r, dict) and r.get('success'))
        
        logger.info(f"✅ Iteration {iteration_number} complete: {total_sent} sent, {total_failed} failed")
        
        # Schedule next iteration if needed
        if iteration_number < total_iterations:
            # Schedule next iteration
            scheduled_resume_iteration.apply_async(
                args=[draft_campaign_id, iteration_number + 1, total_iterations, interval_seconds],
                countdown=interval_seconds
            )
            logger.info(f"⏰ Next iteration scheduled in {interval_seconds} seconds")
        else:
            logger.info(f"🎉 SCHEDULED RESUME COMPLETE - All {total_iterations} iterations finished")
            # Update campaign status
            campaign.status = 'completed'
            db.commit()
        
        return {
            "success": True,
            "iteration": iteration_number,
            "total_sent": total_sent,
            "total_failed": total_failed,
            "next_iteration": iteration_number < total_iterations
        }
        
    except Exception as e:
        logger.error(f"Scheduled iteration failed: {str(e)}")
        return {"success": False, "error": str(e)}
    finally:
        db.close()


def start_scheduled_resume(draft_campaign_id, repetitions, interval_seconds=1):
    """
    Start scheduled resume process.
    
    Args:
        draft_campaign_id: ID of the draft campaign
        repetitions: Number of times to repeat the resume
        interval_seconds: Seconds between each repetition
    """
    db = SessionLocal()
    
    try:
        # Update campaign with schedule config
        campaign = db.query(models.DraftCampaign).filter(
            models.DraftCampaign.id == draft_campaign_id
        ).first()
        
        if not campaign:
            raise Exception("Campaign not found")
        
        # Store schedule config (you might want to add these fields to the model)
        campaign.status = 'scheduled'
        db.commit()
        
        logger.info(f"🚀 Starting scheduled resume: {repetitions} repetitions, {interval_seconds}s interval")
        
        # Start the first iteration immediately
        result = scheduled_resume_iteration.apply_async(
            args=[draft_campaign_id, 1, repetitions, interval_seconds]
        )
        
        return {
            "success": True,
            "task_id": result.id,
            "repetitions": repetitions,
            "interval": interval_seconds,
            "message": f"Scheduled resume started: {repetitions} iterations"
        }
        
    finally:
        db.close()
