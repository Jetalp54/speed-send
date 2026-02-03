# Ultra-high-speed parallel draft operations using Celery + Gevent
# Handles 600+ users simultaneously (12 accounts × 50 users each)

from celery import group
from app.celery_app import celery_app
from app.database import SessionLocal
from app import models
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

@celery_app.task(bind=True, max_retries=2)
def upload_drafts_for_user_task(self, campaign_id, user_id, subject, from_name, body_html, recipients, emails_per_user, recipient_metadata=None):
    """
    Celery task: Upload drafts for ONE user.
    This task runs in parallel with other user tasks (gevent allows 1000s of concurrent tasks).
    """
    db = SessionLocal()
    
    try:
        from app.routers.drafts import create_gmail_draft
        
        user = db.query(models.WorkspaceUser).filter(models.WorkspaceUser.id == user_id).first()
        if not user:
            return {"success": False, "error": "User not found"}
        
        drafts_created = 0
        
        for i in range(emails_per_user):
            try:
                # Get contact_list_id for this recipient from metadata
                contact_list_id = None
                if recipient_metadata:
                    # Taking the first recipient's list ID specifically if it's broad, 
                    # but create_gmail_draft takes a list of recipients.
                    # In this setup, recipients is a list (usually len=1 or 50).
                    # We'll take the first one as representative.
                    contact_list_id = recipient_metadata.get(recipients[0])

                gmail_draft_id = create_gmail_draft(
                    user_id=user_id,
                    subject=subject,
                    from_name=from_name,
                    body_html=body_html,
                    recipients=recipients,
                    db=db,
                    campaign_id=campaign_id,
                    contact_list_id=contact_list_id
                )
                
                draft = models.GmailDraft(
                    draft_campaign_id=campaign_id,
                    user_id=user_id,
                    gmail_draft_id=gmail_draft_id,
                    status='created',
                    recipients=recipients,
                    contact_list_id=contact_list_id
                )
                db.add(draft)
                drafts_created += 1
                
            except Exception as e:
                logger.error(f"Failed to create draft {i+1} for user {user.email}: {str(e)}")
                db.rollback()
                continue
        
        db.commit()
        return {
            "success": True,
            "user_email": user.email,
            "drafts_created": drafts_created
        }
        
    except Exception as e:
        logger.error(f"Upload task failed for user {user_id}: {str(e)}")
        db.rollback()
        return {"success": False, "error": str(e)}
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=2)
def launch_drafts_for_user_task(self, user_id, draft_ids):
    """
    Celery task: Launch all drafts for ONE user using Gmail Batch API.
    Runs in parallel with 600+ other user tasks.
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
        from googleapiclient.http import BatchHttpRequest
        
        encryption_service = EncryptionService()
        service_account_json = encryption_service.decrypt(service_account.encrypted_json)
        google_service = GoogleWorkspaceService(service_account_json)
        credentials = google_service.get_delegated_credentials(user.email, settings.GMAIL_SCOPES)
        gmail_service = build('gmail', 'v1', credentials=credentials)
        
        sent_count = 0
        failed_count = 0
        
        # Use Gmail Batch API to send multiple drafts in one HTTP request (up to 100 per batch)
        def batch_callback(request_id, response, exception):
            nonlocal sent_count, failed_count
            draft_id = int(request_id)
            draft = db.query(models.GmailDraft).filter(models.GmailDraft.id == draft_id).first()
            
            if exception:
                logger.error(f"Failed to send draft {draft_id}: {str(exception)}")
                if draft:
                    draft.status = 'failed'
                failed_count += 1
            else:
                if draft:
                    draft.status = 'sent'
                    draft.sent_at = datetime.utcnow()
                    draft.gmail_message_id = response.get('id')
                    
                    # --- NEW: Create EmailLog for Unified Tracking ---
                    # This allows opens/clicks to be linked to a specific recipient
                    try:
                        for recipient_email in (draft.recipients or []):
                            email_log = models.EmailLog(
                                campaign_id=None, # It's a Draft Campaign
                                service_account_id=service_account.id,
                                sender_email=user.email,
                                recipient_email=recipient_email,
                                message_id=response.get('id'),
                                status=models.EmailStatus.SENT,
                                sent_at=datetime.utcnow(),
                                contact_list_id=draft.contact_list_id
                            )
                            db.add(email_log)
                        db.flush()
                    except Exception as log_err:
                        logger.error(f"Failed to create EmailLog for draft {draft_id}: {log_err}")
                sent_count += 1
        
        # Process drafts in batches of 100 (Gmail API limit)
        batch_size = 100
        for i in range(0, len(draft_ids), batch_size):
            batch_draft_ids = draft_ids[i:i + batch_size]
            batch = gmail_service.new_batch_http_request(callback=batch_callback)
            
            for draft_id in batch_draft_ids:
                draft = db.query(models.GmailDraft).filter(models.GmailDraft.id == draft_id).first()
                if draft:
                    batch.add(
                        gmail_service.users().drafts().send(
                            userId='me',
                            body={'id': draft.gmail_draft_id}
                        ),
                        request_id=str(draft_id)
                    )
            
            batch.execute()
        
        db.commit()
        return {
            "success": True,
            "user_email": user.email,
            "sent": sent_count,
            "failed": failed_count
        }
        
    except Exception as e:
        logger.error(f"Launch task failed for user {user_id}: {str(e)}")
        db.rollback()
        return {"success": False, "error": str(e)}
    finally:
        db.close()


def queue_upload_tasks(campaign_id, users, subject, from_name, body_html, recipients, emails_per_user, recipient_metadata=None):
    """
    Queue upload tasks for ALL users in parallel.
    Returns: Celery GroupResult for monitoring progress.
    """
    tasks = [
        upload_drafts_for_user_task.s(
            campaign_id, user.id, subject, from_name, body_html, recipients, emails_per_user, recipient_metadata
        )
        for user in users
    ]
    
    job = group(tasks)
    result = job.apply_async()
    
    logger.info(f"Queued {len(users)} upload tasks (campaign {campaign_id})")
    return result


def queue_launch_tasks(drafts_by_user):
    """
    Queue launch tasks for ALL users in parallel.
    Returns: Celery GroupResult for monitoring progress.
    """
    tasks = [
        launch_drafts_for_user_task.s(user_id, [d.id for d in drafts])
        for user_id, drafts in drafts_by_user.items()
    ]
    
    job = group(tasks)
    result = job.apply_async()
    
    logger.info(f"Queued {len(drafts_by_user)} launch tasks")
    return result
