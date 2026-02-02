
from app.celery_app import celery_app
from app.database import SessionLocal
from app import models
from app.models import SendJob, JobStatus, EmailLog, EmailStatus
from app.services.quota import QuotaManager
from app.performance import get_client_pool, get_rate_limiter
from app.google_api import GoogleWorkspaceService
from app.config import settings
from sqlalchemy.orm import joinedload
from datetime import datetime, timedelta
import logging
import time
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

# Config
MAX_RETRIES = 3
LOCK_TIMEOUT_SECONDS = 300

@celery_app.task
def job_orchestrator():
    """
    Periodic Task: Finds PENDING jobs and dispatches them to worker queues.
    Runs every minute (configured in beat).
    """
    db = SessionLocal()
    try:
        # Find pending jobs (limit to avoid flooding)
        pending_jobs = db.query(SendJob).filter(
            SendJob.status == JobStatus.PENDING
        ).order_by(SendJob.priority.desc(), SendJob.created_at.asc()).limit(100).all()
        
        if not pending_jobs:
            return "No pending jobs"
            
        dispatched = 0
        for job in pending_jobs:
            # Optimistic lock: set to PROCESSING immediately
            job.status = JobStatus.PROCESSING
            job.locked_until = datetime.utcnow() + timedelta(seconds=LOCK_TIMEOUT_SECONDS)
            db.commit() # Commit state change
            
            # Dispatch to appropriate queue based on priority
            queue_name = "send_normal"
            if job.priority >= 3:
                queue_name = "send_high"
            elif job.priority <= 1:
                queue_name = "send_low"
            
            process_send_job.apply_async(args=[job.id], queue=queue_name)
            dispatched += 1
            
        logger.info(f"Orchestrator dispatched {dispatched} jobs")
        return f"Dispatched {dispatched} jobs"
        
    except Exception as e:
        logger.error(f"Orchestrator failed: {e}")
        return f"Error: {e}"
    finally:
        db.close()

@celery_app.task(bind=True, max_retries=MAX_RETRIES)
def process_send_job(self, job_id):
    """
    Worker Task: Processes a single SendJob.
    """
    db = SessionLocal()
    client_pool = get_client_pool()
    rate_limiter = get_rate_limiter()
    
    try:
        job = db.query(SendJob).options(joinedload(SendJob.campaign)).filter(SendJob.id == job_id).first()
        if not job:
            logger.error(f"Job {job_id} not found")
            return
            
        logger.info(f"Processing Job {job_id} for Campaign {job.campaign_id}")
        
        # 1. Select Sender (Round Robin / Load Balancing logic here)
        # For Phase 1, we just pick the first available active account or use campaign assignment
        # Logic: Find account with quota
        # This is where we plug in the CampaignSender rotation logic
        # Simplified for now: Get campaign senders
        campaign = job.campaign
        senders = campaign.sender_accounts
        
        selected_sender = None
        for sender in senders:
             if QuotaManager.check_and_reserve(sender.id, job.batch_size):
                 selected_sender = sender
                 break
        
        if not selected_sender:
            logger.warning(f"No senders with quota available for Job {job_id}. Re-queuing.")
            # Reset to PENDING to try again later
            job.status = JobStatus.PENDING
            job.locked_until = None
            db.commit()
            # Backoff
            raise self.retry(countdown=60 * 5) # Retry in 5 mins
            
        # Update Job with assigned sender
        job.service_account_id = selected_sender.id
        db.commit()
        
        # 2. Prepare Sender Client
        from app.encryption import EncryptionService
        encryption_service = EncryptionService()
        sa_json = encryption_service.decrypt(selected_sender.encrypted_json)
        
        google_service = GoogleWorkspaceService(sa_json)
        # We need a user to impersonate. 
        # Strategy: Each sender account has workspace users. We need to pick one.
        # Ideally, Campaign has `from_email`. We must verify `from_email` belongs to `selected_sender`.
        # For now, let's assume `from_email` is valid or use the first user in SA.
        
        sender_email = campaign.from_email
        # TODO: strict check if sender_email is in selected_sender.workspace_users
        
        credentials = google_service.get_delegated_credentials(sender_email, settings.GMAIL_SCOPES)
        gmail_client = client_pool.get_or_create_client(sender_email, credentials)
        
        # 3. Process Recipients
        recipients = job.recipient_ids # List of emails
        sent_count = 0
        failed_count = 0
        
        for recipient in recipients:
             # Idempotency Check
             # campaign_id + recipient (hash or email)
             # We assume recipient is string email here.
             idempotency_key = f"{campaign.id}_{recipient}"
             
             existing_log = db.query(EmailLog).filter(EmailLog.idempotency_key == idempotency_key).first()
             if existing_log and existing_log.status == EmailStatus.SENT:
                 logger.info(f"Skipping {recipient} (Already Sent)")
                 continue
                 
             try:
                 # Check rate limit per second
                 if not rate_limiter.can_proceed(sender_email):
                     time.sleep(0.1)
                 
                 # 3.1 Create PENDING EmailLog (Needed for tracking ID)
                 if not existing_log:
                     log = EmailLog(
                         campaign_id=campaign.id,
                         service_account_id=selected_sender.id,
                         sender_email=sender_email,
                         recipient_email=recipient,
                         status=EmailStatus.PENDING, # Start as PENDING
                         idempotency_key=idempotency_key,
                         sent_at=None
                     )
                     db.add(log)
                     db.flush() # Get ID for tracking
                 else:
                     log = existing_log
                     # If it was failed, we reuse it? 
                     # Only if not SENT. Loop check above handles SENT.
                 
                 # 3.2 Inject Tracking
                 # Note: If we had personalization ({{name}}), do it here before tracking injection
                 # but after retrieving contact data.
                 
                 from app.services.tracking import inject_tracking_links
                 tracked_html = inject_tracking_links(db, campaign.body_html, campaign.id, log.id)
                 
                 # 3.3 Construct Message
                 msg = MIMEMultipart()
                 msg['to'] = recipient
                 msg['from'] = f"{campaign.from_name} <{sender_email}>"
                 msg['subject'] = campaign.subject
                 msg.attach(MIMEText(tracked_html, 'html'))
                 
                 raw_msg = base64.urlsafe_b64encode(msg.as_bytes()).decode()
                 
                 # 3.4 Send
                 res = gmail_client.users().messages().send(userId='me', body={'raw': raw_msg}).execute()
                 message_id = res.get('id')
                 
                 # 3.5 Update Log (Success)
                 log.status = EmailStatus.SENT
                 log.message_id = message_id
                 log.sent_at = datetime.utcnow()
                 db.commit() # Commit per email? Or batch?
                 # Batch is better for perf, but "Enterprise" with Celery needs reliability.
                 # If we crash, we want to know who we sent to.
                 # Committing per email is safer for now.
                 
                 sent_count += 1
                 
             except Exception as e:
                 logger.error(f"Failed to send to {recipient}: {e}")
                 failed_count += 1
                 # Log Failure
                 if log:
                    log.status = EmailStatus.FAILED
                    log.error_message = str(e)
                    db.commit()
        
        # 4. Job Completion
        job.status = JobStatus.COMPLETED if failed_count == 0 else JobStatus.FAILED  # Or PARTIAL?
        job.updated_at = datetime.utcnow()
        db.commit()
        
        # 5. Sync Quota
        QuotaManager.sync_usage_to_db(selected_sender.id)
        
        return f"Job {job_id}: Sent {sent_count}, Failed {failed_count}"

    except Exception as e:
        logger.error(f"Job {job_id} failed crtically: {e}")
        db.rollback()
        # Retry mechanism (handled by Celery max_retries)
        self.retry(exc=e, countdown=60)
    finally:
        db.close()

@celery_app.task
def update_analytics_task():
    """
    Periodic Task: Updates aggregated stats for all active campaigns and drafts.
    Runs every 30-60 seconds (configured in beat).
    """
    db = SessionLocal()
    try:
        from app.models import Campaign, CampaignStatus, DraftCampaign
        from app.services.analytics import AnalyticsService
        
        analytics = AnalyticsService(db)
        count = 0
        draft_count = 0
        
        # 1. Update Campaigns (Sending/Completed/Paused)
        campaigns = db.query(Campaign).filter(
            Campaign.status.in_([CampaignStatus.SENDING, CampaignStatus.COMPLETED, CampaignStatus.PAUSED])
        ).limit(100).all() # Limit per run
        
        for campaign in campaigns:
            try:
                analytics.aggregate_campaign_stats(campaign.id)
                count += 1
            except Exception as e:
                logger.error(f"Failed to update stats for campaign {campaign.id}: {e}")
        
        # 2. Update Drafts (Only those with logs or activity)
        # For simplicity, update all active drafts (limit to avoid impact)
        drafts = db.query(DraftCampaign).order_by(DraftCampaign.created_at.desc()).limit(100).all()
        for draft in drafts:
            try:
                analytics.aggregate_draft_stats(draft.id)
                draft_count += 1
            except Exception as e:
                logger.error(f"Failed to update stats for draft {draft.id}: {e}")
                
        logger.info(f"Updated analytics for {count} campaigns and {draft_count} drafts")
        return f"Updated {count} campaigns, {draft_count} drafts"
        
    except Exception as e:
        logger.error(f"Analytics task failed: {e}")
        return f"Error: {e}"
    finally:
        db.close()
