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
        
        # FORCE Emails per Persona = 1
        emails_per_user = 1
        
        # Tracking Injection Setup
        base_url = settings.TRACKING_DOMAIN.rstrip('/') if settings.TRACKING_DOMAIN else settings.API_BASE_URL.rstrip('/')
        import re
        from urllib.parse import quote
        
        naked_pixel_pattern = r'(src=["\']https://[^"\']+/t/pixel\.png)(["\'])'
        link_pattern = r'\[tracking_link\](https?://[^\[]+)\[/tracking_link\]'

        # Optimized batch processing
        batch_size = rate_limiter.calculate_optimal_batch_size(emails_per_user, 1)
        
        # The line '"total_drafts": len(users),' from the instruction is syntactically incorrect here.
        # Assuming it was a placeholder or an accidental inclusion, it is omitted to maintain valid Python syntax.
        
        for i in range(emails_per_user):
            try:
                # Check rate limit before proceeding
                if not rate_limiter.can_proceed(user.email):
                    time.sleep(0.1)  # Brief pause if approaching limit
                
                # Create email message
                from email.mime.text import MIMEText
                from email.mime.multipart import MIMEMultipart
                from email.message import Message
                import base64
                from app.template_engine import TemplateEngine
                
                message = None
                if recipients:
                    recipient_email = recipients[i % len(recipients)]
                else:
                    recipient_email = ""

                # Customize Body with Per-User Tracking
                current_body_html = body_html
                
                if campaign_id and current_body_html:
                    # 1. Hydrate "Naked" Pixels
                    def add_campaign_param(match):
                        return f'{match.group(1)}?c={campaign_id}&r={quote(recipient_email)}{match.group(2)}'
                    current_body_html = re.sub(naked_pixel_pattern, add_campaign_param, current_body_html)
                    
                    # 2. Replace [tracking_pixel] placeholder
                    if '[tracking_pixel]' in current_body_html:
                        pixel_url = f"{base_url}/t/pixel.png?c={campaign_id}&r={quote(recipient_email)}"
                        
                        # Handle usage inside src attributes
                        current_body_html = current_body_html.replace('src="[tracking_pixel]"', f'src="{pixel_url}"')
                        current_body_html = current_body_html.replace("src='[tracking_pixel]'", f"src='{pixel_url}'")
                        
                        # Handle standalone usage
                        pixel_tag = f'<img src="{pixel_url}" width="1" height="1" style="display:none;" alt="" />'
                        current_body_html = current_body_html.replace('[tracking_pixel]', pixel_tag)
                    
                    # 3. Replace [tracking_link] placeholders
                    matches = re.findall(link_pattern, current_body_html)
                    for original_url in matches:
                        encoded_url = quote(original_url)
                        tracking_url = f"{base_url}/t/redirect?url={encoded_url}&c={campaign_id}&r={quote(recipient_email)}"
                        current_body_html = current_body_html.replace(f'[tracking_link]{original_url}[/tracking_link]', tracking_url)

                if use_custom_headers and custom_headers:
                     # Prepare context for template engine
                    context = {
                        'smtp': user.email,
                        'from': from_name or '',  # Use empty if not provided
                        'subject': subject or '',  # Use empty if not provided
                        'to': recipient_email,
                        'domain': user.email.split('@')[1] if '@' in user.email else 'localhost'
                    }
                    
                    # Process custom headers with template engine
                    processed_headers = TemplateEngine.process_template(custom_headers, context)
                    
                    # Parse headers to inspect Content-Type
                    header_lines = [line.strip() for line in processed_headers.split('\n') if line.strip()]
                    parsed_headers = []
                    for line in header_lines:
                        if ':' in line:
                            k, v = line.split(':', 1)
                            parsed_headers.append((k.strip(), v.strip()))
                    
                    # Determine Content-Type strategy
                    content_type_val = next((v for k, v in parsed_headers if k.lower() == 'content-type'), None)
                    
                    if content_type_val:
                        # User provided Content-Type
                        if 'multipart' in content_type_val.lower():
                            # User providing raw multipart body with boundaries
                            message = Message()
                            message.set_payload(body_html)
                        else:
                            # User providing text (html/plain/etc)
                            # Let MIMEText handle encoding of the body_html string
                            subtype = 'html' if 'html' in content_type_val.lower() else 'plain'
                            message = MIMEText(current_body_html, subtype)
                    else:
                        # Fallback: User used custom headers but didn't specify Content-Type -> Default HTML
                        message = MIMEText(current_body_html, 'html')
                    
                    # Apply headers (overwriting any defaults set by MIMEText/Message)
                    for k, v in parsed_headers:
                        if not v: continue
                        # Remove default header if exists (e.g. from MIMEText init)
                        if k in message:
                            del message[k]
                        message[k] = v
                    
                    # Ensure To header in case user forgot it
                    if 'To' not in message and recipient_email:
                        message['To'] = recipient_email

                else:
                    # Standard behavior (No custom headers)
                    message = MIMEMultipart('alternative')
                    message['To'] = recipient_email
                    message['From'] = f"{from_name} <{user.email}>" if from_name else user.email
                    message['Subject'] = subject
                    
                    html_part = MIMEText(current_body_html, 'html')
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
                    status=models.DraftStatus.CREATED.value,
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
                    draft.status = models.DraftStatus.FAILED.value
                failed_count += 1
            else:
                if draft:
                    # GmailDraft model uses string status or could be mapped. 
                    # Assuming we want 'sent' or 'completed' for individual drafts? 
                    # The model definition has status as String currently. 
                    # Let's use 'sent' to match previous logic logic or update model if needed.
                    # Wait, DraftStatus is for Campaign. GmailDraft has its own status string? 
                    # Checking models.py... GmailDraft status is String(50), default='created'. 
                    # It does NOT use an Enum in the model definition I saw earlier (lines 313-321 of models.py).
                    # 'status = Column(String(50), default='created')'
                    # So 'sent' is fine here as a string.
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
            from app.services.quota import QuotaManager
            
            # Check rate limit (per user)
            if not QuotaManager.check_rate_limit(user.email, limit_per_sec=10):
                time.sleep(0.1)
                
            # Check daily quota
            batch_len = len(batch_draft_ids)
            if not QuotaManager.check_and_reserve(user.service_account_id, batch_len):
                logger.warning(f"Quota exceeded for SA {user.service_account_id} during launch. Skipping batch.")
                # Mark these as failed
                for draft_id in batch_draft_ids:
                     draft = db.query(models.GmailDraft).filter(models.GmailDraft.id == draft_id).first()
                     if draft:
                         draft.status = 'failed'
                         draft.error_message = "Daily Quota Exceeded"
                db.commit()
                continue # Skip this batch
            
            batch.execute()
            
            # Sync DB after batch
            QuotaManager.sync_usage_to_db(user.service_account_id)
        
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
            campaign_id, user.id, subject, from_name, body_html, recipients, 1, task_group_id,
            use_custom_headers, custom_headers
        )
        for user in users
    ]
    
    job = group(tasks)
    result = job.apply_async()
    
    # Initialize progress tracking
    cache = get_performance_cache()
    cache.update_progress(task_group_id, 0, len(users), "queued")
    
    return result, task_group_id


def queue_optimized_launch(drafts_by_user):
    """Queue optimized launch tasks with progress tracking"""
    import uuid
    from celery import chord
    task_group_id = str(uuid.uuid4())
    
    # Get campaign ID from the first draft (assuming all are from same campaign)
    # We need to pass campaign_id to finalize task
    # drafts_by_user is {user_id: [draft objects]}
    # We can't access draft objects here easily if they are detached, 
    # but we can assume the caller passed valid drafts. 
    # Actually, the caller passed ORM objects.
    
    campaign_id = None
    total_drafts = 0
    header_tasks = []
    
    for user_id, drafts in drafts_by_user.items():
        if not campaign_id and drafts:
            campaign_id = drafts[0].draft_campaign_id
        
        total_drafts += len(drafts)
        header_tasks.append(
            launch_drafts_optimized_task.s(user_id, [d.id for d in drafts], task_group_id)
        )
    
    if not header_tasks:
        return None, task_group_id

    # Initialize progress
    cache = get_performance_cache()
    cache.update_progress(task_group_id, 0, total_drafts, "queued")
    
    # Use chord: Header tasks -> Finalize task
    callback = finalize_launch_task.s(campaign_id, task_group_id)
    job = chord(header_tasks)(callback)
    
    return job, task_group_id


@celery_app.task(bind=True)
def finalize_launch_task(self, results, campaign_id, task_group_id):
    """
    Finalize the launch process:
    1. Aggregate results
    2. Update Campaign status to COMPLETED (or FAILED)
    3. Update progress cache
    """
    db = SessionLocal()
    try:
        logger.info(f"Finalizing launch for campaign {campaign_id}")
        
        total_sent = 0
        total_failed = 0
        
        # Aggregate results from list of dicts
        if isinstance(results, list):
            for res in results:
                if isinstance(res, dict) and res.get('success'):
                    total_sent += res.get('sent', 0)
                    total_failed += res.get('failed', 0)
        
        logger.info(f"Launch Totals: {total_sent} sent, {total_failed} failed")
        
        # Update Campaign Status
        campaign = db.query(models.DraftCampaign).filter(models.DraftCampaign.id == campaign_id).first()
        if campaign:
            if total_sent > 0:
                campaign.status = models.DraftStatus.COMPLETED
                logger.info(f"Campaign {campaign_id} marked as COMPLETED")
            else:
                 # If everything failed, mark as FAILED (or could be COMPLETED with 0 sent?)
                 # Use FAILED to alert user
                 campaign.status = models.DraftStatus.FAILED
                 logger.info(f"Campaign {campaign_id} marked as FAILED (0 sent)")
            
            db.commit()
            
        # Update progress to 100%
        cache = get_performance_cache()
        cache.update_progress(task_group_id, total_sent + total_failed, total_sent + total_failed, "completed")
        
        return {
            "campaign_id": campaign_id,
            "status": "completed" if total_sent > 0 else "failed",
            "total_sent": total_sent,
            "total_failed": total_failed
        }
        
    except Exception as e:
        logger.error(f"Failed to finalize launch for campaign {campaign_id}: {str(e)}")
        return {"success": False, "error": str(e)}
    finally:
        db.close()
