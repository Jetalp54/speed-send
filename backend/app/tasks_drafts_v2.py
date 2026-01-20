# ULTRA-OPTIMIZED Celery tasks v2 - Maximum performance edition
# Uses: Redis caching + Connection pooling + Smart rate limiting + Real-time progress

from celery import group
from app.celery_app import celery_app
from app.database import SessionLocal
from app import models
from app.performance import get_performance_cache, get_client_pool, get_rate_limiter
from datetime import datetime
import logging
import time

logger = logging.getLogger(__name__)

@celery_app.task(bind=True, max_retries=2, time_limit=300)
def upload_drafts_optimized_task(self, campaign_id, user_id, subject, from_name, body_html, recipients, emails_per_user, task_group_id, use_custom_headers=False, custom_headers=None):
    """
    OPTIMIZED: Upload drafts for ONE user with caching + connection pooling.
    Performance improvements:
    - Cached credentials (no repeated decryption)
    - Connection pooling (reuse Gmail API clients)
    - Real-time progress updates
    - Smart batch sizing
    """
    db = SessionLocal()
    cache = get_performance_cache()
    client_pool = get_client_pool()
    rate_limiter = get_rate_limiter()
    
    try:
        user = db.query(models.WorkspaceUser).filter(models.WorkspaceUser.id == user_id).first()
        if not user:
            return {"success": False, "error": "User not found"}
        
        # Try to get cached credentials first (HUGE performance boost)
        service_account_json = cache.get_cached_credentials(user_id)
        
        if not service_account_json:
            # Cache miss - decrypt and cache for next time
            from app.encryption import EncryptionService
            service_account = user.service_account
            if not service_account:
                return {"success": False, "error": "No service account"}
            
            encryption_service = EncryptionService()
            service_account_json = encryption_service.decrypt(service_account.encrypted_json)
            cache.cache_credentials(user_id, service_account_json, ttl=3600)
        
        # Get Gmail API client (pooled connection)
        from app.google_api import GoogleWorkspaceService
        from app.config import settings
        
        google_service = GoogleWorkspaceService(service_account_json)
        credentials = google_service.get_delegated_credentials(user.email, settings.GMAIL_SCOPES)
        gmail_service = client_pool.get_or_create_client(user.email, credentials)
        
        drafts_created = 0
        failed = 0
        
        # Optimized batch processing
        batch_size = rate_limiter.calculate_optimal_batch_size(emails_per_user, 1)
        
        for i in range(emails_per_user):
            try:
                # Check rate limit before proceeding
                if not rate_limiter.can_proceed(user.email):
                    time.sleep(0.1)  # Brief pause if approaching limit
                
                # Create email message
                from email.mime.text import MIMEText
                from email.mime.multipart import MIMEMultipart
                import base64
                from app.template_engine import TemplateEngine
                
                message = MIMEMultipart('alternative')
                
                # Process custom headers if enabled
                if use_custom_headers and custom_headers:
                    # Prepare context for template engine
                    recipient_email = recipients[i % len(recipients)] if recipients else ""
                    context = {
                        'smtp': user.email,
                        'from': from_name or 'Sender',
                        'subject': subject or '',
                        'to': recipient_email,
                        'domain': user.email.split('@')[1] if '@' in user.email else 'localhost'
                    }
                    
                    # Process custom headers with template engine
                    processed_headers = TemplateEngine.process_template(custom_headers, context)
                    
                    # Parse and apply custom headers
                    for line in processed_headers.split('\n'):
                        line = line.strip()
                        if ':' in line:
                            key, value = line.split(':', 1)
                            key = key.strip()
                            value = value.strip()
                            # Standard headers
                            if key.lower() in ['to', 'from', 'subject', 'date', 'message-id', 'reply-to', 'cc', 'bcc']:
                                message[key] = value
                            # Other custom headers
                            else:
                                message[key] = value
                    
                    # Ensure To header is set (Gmail requires it)
                    if 'To' not in message:
                        message['To'] = recipient_email
                else:
                    # Standard headers (no custom)
                    message['To'] = ', '.join(recipients)
                    message['From'] = f"{from_name} <{user.email}>" if from_name else user.email
                    message['Subject'] = subject
                
                html_part = MIMEText(body_html, 'html')
                message.attach(html_part)
                
                raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
                
                # Create draft via Gmail API (using pooled connection)
                result = gmail_service.users().drafts().create(
                    userId='me',
                    body={'message': {'raw': raw_message}}
                ).execute()
                
                gmail_draft_id = result['id']
                
                # Save to database
                draft = models.GmailDraft(
                    draft_campaign_id=campaign_id,
                    user_id=user_id,
                    gmail_draft_id=gmail_draft_id,
                    status='created',
                    recipients=recipients
                )
                db.add(draft)
                db.flush()
                
                drafts_created += 1
                
                # Update real-time progress
                cache.update_progress(task_group_id, drafts_created, emails_per_user, "processing")
                
            except Exception as e:
                logger.error(f"Failed to create draft {i+1} for user {user.email}: {str(e)}")
                failed += 1
                db.rollback()
                continue
        
        db.commit()
        
        # Final progress update
        cache.update_progress(task_group_id, drafts_created, emails_per_user, "completed")
        
        return {
            "success": True,
            "user_email": user.email,
            "drafts_created": drafts_created,
            "failed": failed
        }
        
    except Exception as e:
        logger.error(f"Upload task failed for user {user_id}: {str(e)}")
        db.rollback()
        return {"success": False, "error": str(e)}
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=2, time_limit=180)
def launch_drafts_optimized_task(self, user_id, draft_ids, task_group_id):
    """
    OPTIMIZED: Launch drafts using Gmail Batch API + connection pooling.
    Performance improvements:
    - Connection pooling (reuse API clients)
    - Intelligent batch sizing (up to 100 per request)
    - Real-time progress tracking
    - Smart rate limiting
    """
    db = SessionLocal()
    cache = get_performance_cache()
    client_pool = get_client_pool()
    rate_limiter = get_rate_limiter()
    
    try:
        user = db.query(models.WorkspaceUser).filter(models.WorkspaceUser.id == user_id).first()
        if not user:
            return {"success": False, "error": "User not found"}
        
        # Get cached credentials
        service_account_json = cache.get_cached_credentials(user_id)
        
        if not service_account_json:
            from app.encryption import EncryptionService
            service_account = user.service_account
            if not service_account:
                return {"success": False, "error": "No service account"}
            
            encryption_service = EncryptionService()
            service_account_json = encryption_service.decrypt(service_account.encrypted_json)
            cache.cache_credentials(user_id, service_account_json, ttl=3600)
        
        # Get pooled Gmail client
        from app.google_api import GoogleWorkspaceService
        from app.config import settings
        
        google_service = GoogleWorkspaceService(service_account_json)
        credentials = google_service.get_delegated_credentials(user.email, settings.GMAIL_SCOPES)
        gmail_service = client_pool.get_or_create_client(user.email, credentials)
        
        sent_count = 0
        failed_count = 0
        total_drafts = len(draft_ids)
        
        # Batch callback for real-time updates
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
                sent_count += 1
            
            # Update progress in real-time
            cache.update_progress(task_group_id, sent_count + failed_count, total_drafts, "processing")
        
        # Process in optimized batches
        batch_size = 100  # Gmail API max
        
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
            
            # Execute batch with rate limit check
            if not rate_limiter.can_proceed(user.email):
                time.sleep(0.1)
            
            batch.execute()
        
        db.commit()
        
        # Final progress
        cache.update_progress(task_group_id, total_drafts, total_drafts, "completed")
        
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


def queue_optimized_upload(campaign_id, users, subject, from_name, body_html, recipients, emails_per_user, use_custom_headers=False, custom_headers=None):
    """Queue optimized upload tasks with progress tracking"""
    import uuid
    task_group_id = str(uuid.uuid4())
    
    tasks = [
        upload_drafts_optimized_task.s(
            campaign_id, user.id, subject, from_name, body_html, recipients, emails_per_user, task_group_id,
            use_custom_headers, custom_headers
        )
        for user in users
    ]
    
    job = group(tasks)
    result = job.apply_async()
    
    # Initialize progress tracking
    cache = get_performance_cache()
    cache.update_progress(task_group_id, 0, len(users) * emails_per_user, "queued")
    
    return result, task_group_id


def queue_optimized_launch(drafts_by_user):
    """Queue optimized launch tasks with progress tracking"""
    import uuid
    task_group_id = str(uuid.uuid4())
    
    tasks = [
        launch_drafts_optimized_task.s(user_id, [d.id for d in drafts], task_group_id)
        for user_id, drafts in drafts_by_user.items()
    ]
    
    job = group(tasks)
    result = job.apply_async()
    
    # Initialize progress
    cache = get_performance_cache()
    total_drafts = sum(len(drafts) for drafts in drafts_by_user.values())
    cache.update_progress(task_group_id, 0, total_drafts, "queued")
    
    return result, task_group_id
