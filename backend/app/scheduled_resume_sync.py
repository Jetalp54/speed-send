# SYNCHRONOUS SCHEDULED RESUME - PowerMTA Style
# Sends drafts at regular intervals for all users in parallel
# No Celery dependency - uses threading for scheduling

import threading
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Dict, List, Any

from app.database import SessionLocal
from app import models

logger = logging.getLogger(__name__)

# Global dictionary to track active scheduled resume processes
_active_schedules: Dict[int, Dict[str, Any]] = {}


def send_user_drafts_batch(user_id: int) -> Dict[str, Any]:
    """
    Send all Gmail drafts for a single user.
    This runs in a separate thread per user.
    
    Returns:
        Dict with success status, user_email, sent count, failed count
    """
    db = SessionLocal()
    
    try:
        user = db.query(models.WorkspaceUser).filter(models.WorkspaceUser.id == user_id).first()
        if not user:
            return {"success": False, "user_id": user_id, "error": "User not found"}
        
        service_account = user.service_account
        if not service_account:
            return {"success": False, "user_email": user.email, "error": "No service account"}
        
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
        
        # Fetch ALL drafts from Gmail
        logger.info(f"📧 Fetching drafts for {user.email}")
        drafts_response = gmail_service.users().drafts().list(userId='me').execute()
        gmail_drafts = drafts_response.get('drafts', [])
        
        if not gmail_drafts:
            logger.info(f"No drafts found for {user.email}")
            return {"success": True, "user_email": user.email, "sent": 0, "failed": 0, "message": "No drafts"}
        
        sent_count = 0
        failed_count = 0
        
        # Send drafts using batch API for efficiency
        batch_size = 50
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
            
            # Small delay between batches
            if i + batch_size < len(gmail_drafts):
                time.sleep(0.05)
        
        logger.info(f"✅ {user.email}: {sent_count} sent, {failed_count} failed")
        
        return {
            "success": True,
            "user_email": user.email,
            "total_drafts": len(gmail_drafts),
            "sent": sent_count,
            "failed": failed_count
        }
        
    except Exception as e:
        logger.error(f"Error sending drafts for user {user_id}: {str(e)}")
        return {"success": False, "user_id": user_id, "error": str(e)}
    finally:
        db.close()


def execute_resume_iteration(campaign_id: int, iteration: int, total_iterations: int, interval_ms: int):
    """
    Execute ONE iteration of scheduled resume for ALL users in parallel.
    This function is called by threading.Timer at scheduled intervals.
    
    Args:
        campaign_id: Draft campaign ID
        iteration: Current iteration number (1-based)
        total_iterations: Total number of repetitions
        interval_ms: Milliseconds between iterations (e.g., 100ms, 500ms, 1000ms)
    """
    db = SessionLocal()
    
    try:
        logger.info(f"🔄 SCHEDULED RESUME - Iteration {iteration}/{total_iterations} for campaign {campaign_id} (Interval: {interval_ms}ms)")
        
        # Get campaign and its users
        from sqlalchemy.orm import joinedload
        campaign = db.query(models.DraftCampaign).options(
            joinedload(models.DraftCampaign.selected_users).joinedload(models.DraftCampaignUser.user)
        ).filter(models.DraftCampaign.id == campaign_id).first()
        
        if not campaign:
            logger.error(f"Campaign {campaign_id} not found")
            return
        
        users = [assoc.user for assoc in campaign.selected_users if assoc.user]
        
        if not users:
            logger.warning(f"No users found for campaign {campaign_id}")
            return
        
        logger.info(f"Processing {len(users)} users in parallel...")
        
        # Process all users IN PARALLEL using ThreadPoolExecutor
        max_workers = min(100, len(users))  # Up to 100 concurrent threads
        total_sent = 0
        total_failed = 0
        successful_users = 0
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all user tasks
            future_to_user = {executor.submit(send_user_drafts_batch, user.id): user for user in users}
            
            # Collect results as they complete
            for future in as_completed(future_to_user):
                user = future_to_user[future]
                try:
                    result = future.result()
                    if result.get("success"):
                        total_sent += result.get("sent", 0)
                        total_failed += result.get("failed", 0)
                        if result.get("sent", 0) > 0:
                            successful_users += 1
                except Exception as e:
                    logger.error(f"Exception for user {user.email}: {str(e)}")
                    total_failed += 1
        
        logger.info(f"✅ Iteration {iteration} complete: {total_sent} sent from {successful_users} users, {total_failed} failed")
        
        # Update tracking
        if campaign_id in _active_schedules:
            _active_schedules[campaign_id]["last_iteration"] = iteration
            _active_schedules[campaign_id]["total_sent"] += total_sent
            _active_schedules[campaign_id]["total_failed"] += total_failed
        
        # Schedule next iteration if needed
        if iteration < total_iterations:
            # Convert milliseconds to seconds for timer
            interval_seconds = interval_ms / 1000.0
            logger.info(f"⏰ Scheduling iteration {iteration + 1} in {interval_ms}ms ({interval_seconds:.3f}s)...")
            timer = threading.Timer(
                interval_seconds,
                execute_resume_iteration,
                args=[campaign_id, iteration + 1, total_iterations, interval_ms]
            )
            timer.daemon = True  # Allow program to exit even if timer is pending
            timer.start()
            
            if campaign_id in _active_schedules:
                _active_schedules[campaign_id]["next_timer"] = timer
        else:
            logger.info(f"🎉 SCHEDULED RESUME COMPLETE - All {total_iterations} iterations finished for campaign {campaign_id}")
            
            # Update campaign status
            from app.state_machine import transition_draft_status, DraftStatus
            try:
                transition_draft_status(db, campaign_id, DraftStatus.COMPLETED, triggered_by="scheduled_resume_complete")
            except Exception as e:
                logger.error(f"Failed to update campaign status: {e}")
            
            # Clean up tracking
            if campaign_id in _active_schedules:
                del _active_schedules[campaign_id]
        
    except Exception as e:
        logger.error(f"Iteration {iteration} failed: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
    finally:
        db.close()


def start_scheduled_resume_sync(campaign_id: int, repetitions: int, interval_ms: int) -> Dict[str, Any]:
    """
    Start PowerMTA-style scheduled resume process with millisecond precision.
    Sends drafts every X milliseconds for X repetitions, processing all users in parallel.
    
    Args:
        campaign_id: Draft campaign ID
        repetitions: Number of times to repeat sending
        interval_ms: Milliseconds between each repetition (e.g., 100ms, 500ms, 1000ms)
        
    Returns:
        Dict with success status and execution info
    """
    db = SessionLocal()
    
    try:
        # Validate campaign
        campaign = db.query(models.DraftCampaign).filter(
            models.DraftCampaign.id == campaign_id
        ).first()
        
        if not campaign:
            return {"success": False, "error": "Campaign not found"}
        
        # Update campaign status
        from app.state_machine import transition_draft_status, DraftStatus
        try:
            transition_draft_status(db, campaign_id, DraftStatus.SENDING, triggered_by="scheduled_resume_start")
        except Exception as e:
            logger.warning(f"Could not update campaign status: {e}")
        
        # Initialize tracking
        _active_schedules[campaign_id] = {
            "started_at": datetime.utcnow(),
            "repetitions": repetitions,
            "interval_ms": interval_ms,
            "last_iteration": 0,
            "total_sent": 0,
            "total_failed": 0,
            "next_timer": None
        }
        
        logger.info(f"🚀 Starting SYNCHRONOUS scheduled resume: {repetitions} repetitions, {interval_ms}ms interval ({interval_ms/1000.0:.3f}s)")
        logger.info(f"Campaign {campaign_id}: Processing ALL users in parallel each iteration")
        
        # Start first iteration in a background thread immediately
        # This allows the API to return quickly while processing continues
        first_iteration_thread = threading.Thread(
            target=execute_resume_iteration,
            args=[campaign_id, 1, repetitions, interval_ms],
            daemon=True  # Daemon thread won't prevent program exit
        )
        first_iteration_thread.start()
        
        return {
            "success": True,
            "message": f"Scheduled resume started: {repetitions} repetitions every {interval_ms}ms",
            "campaign_id": campaign_id,
            "repetitions": repetitions,
            "interval_ms": interval_ms,
            "interval_seconds": interval_ms / 1000.0,
            "mode": "synchronous_threaded",
            "note": "Processing all users in parallel. Check backend logs for progress."
        }
        
    except Exception as e:
        logger.error(f"Failed to start scheduled resume: {str(e)}")
        return {"success": False, "error": str(e)}
    finally:
        db.close()


def get_schedule_status(campaign_id: int) -> Dict[str, Any]:
    """
    Get the current status of a scheduled resume process.
    
    Returns:
        Dict with status info or None if not found
    """
    if campaign_id not in _active_schedules:
        return {"active": False, "message": "No active schedule for this campaign"}
    
    schedule_info = _active_schedules[campaign_id]
    return {
        "active": True,
        "started_at": schedule_info["started_at"].isoformat(),
        "current_iteration": schedule_info["last_iteration"],
        "total_iterations": schedule_info["repetitions"],
        "interval_ms": schedule_info["interval_ms"],
        "interval_seconds": schedule_info["interval_ms"] / 1000.0,
        "total_sent": schedule_info["total_sent"],
        "total_failed": schedule_info["total_failed"]
    }


def cancel_scheduled_resume(campaign_id: int) -> Dict[str, Any]:
    """
    Cancel an active scheduled resume process.
    
    Returns:
        Dict with success status
    """
    if campaign_id not in _active_schedules:
        return {"success": False, "error": "No active schedule found"}
    
    schedule_info = _active_schedules[campaign_id]
    
    # Cancel the next timer if it exists
    if schedule_info.get("next_timer"):
        schedule_info["next_timer"].cancel()
    
    # Remove from tracking
    del _active_schedules[campaign_id]
    
    logger.info(f"🛑 Cancelled scheduled resume for campaign {campaign_id}")
    
    return {
        "success": True,
        "message": f"Scheduled resume cancelled for campaign {campaign_id}",
        "iterations_completed": schedule_info["last_iteration"],
        "total_sent": schedule_info["total_sent"]
    }
