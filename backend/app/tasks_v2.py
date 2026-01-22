"""
V2 PowerMTA Engine - Redis-backed pre-generation and instant resume
Implements the full V2 architecture with preparation phase and instant sending.
"""

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models import Campaign, EmailLog, WorkspaceUser, ServiceAccount, CampaignStatus, EmailStatus
from app.google_api import GoogleWorkspaceService, substitute_variables, process_custom_header_tags
from app.encryption import encryption_service
from app.state_machine import transition_campaign_status
from datetime import datetime
import logging
import json
import redis
from typing import List, Dict
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import uuid

logger = logging.getLogger(__name__)

# Redis connection
redis_client = redis.from_url("redis://redis:6379/0", decode_responses=True)


def get_campaign_redis_key(campaign_id: int) -> str:
    """Get Redis key for campaign task queue"""
    return f"campaign:{campaign_id}:tasks"


def get_campaign_progress_key(campaign_id: int) -> str:
    """Get Redis key for campaign progress tracking"""
    return f"campaign:{campaign_id}:progress"

def get_campaign_logs_key(campaign_id: int) -> str:
    """Get Redis key for campaign live logs list"""
    return f"campaign:{campaign_id}:logs"

def append_campaign_log(campaign_id: int, message: str) -> None:
    """Append a timestamped log line to Redis list for live viewing."""
    try:
        from datetime import datetime
        entry = {"ts": datetime.utcnow().isoformat() + "Z", "message": message}
        redis_client.rpush(get_campaign_logs_key(campaign_id), json.dumps(entry))
        # keep only last 5000 entries
        redis_client.ltrim(get_campaign_logs_key(campaign_id), -5000, -1)
    except Exception:
        pass


def _is_admin_email(user_email: str, service_account_admin_email: str | None, user_name: str = None) -> bool:
    """ULTRA-AGGRESSIVE admin detection to exclude admin addresses from sender pool.
    Excludes:
    - Exact match with configured ServiceAccount.admin_email
    - Common admin aliases: admin@, administrator@, postmaster@
    - Google default addresses: abuse@, support@
    - No-reply patterns: noreply@, no-reply@, donotreply@
    - System addresses: system@, automation@, bot@
    - Admin names: admin, administrator, postmaster, system, automation, bot, test, demo
    - ANY user that matches the admin email used for sync
    """
    if not user_email:
        return False
    
    email_lower = user_email.strip().lower()
    
    # CRITICAL: Check exact admin email match (this is the most important check)
    if service_account_admin_email and email_lower == service_account_admin_email.strip().lower():
        return True
    
    # Extract local part (before @) for pattern matching
    local_part = email_lower.split("@")[0]
    
    # COMPREHENSIVE admin patterns
    admin_patterns = {
        'admin', 'administrator', 'postmaster', 'abuse', 'support',
        'noreply', 'no-reply', 'donotreply', 'do-not-reply',
        'system', 'automation', 'bot', 'nobot', 'no-bot',
        'test', 'testing', 'demo', 'sample'
    }
    
    # Check if local part matches any admin pattern
    for pattern in admin_patterns:
        if local_part == pattern or local_part.startswith(pattern + '.') or local_part.startswith(pattern + '_'):
            return True
    
    # Check user name for admin patterns
    if user_name:
        name_lower = user_name.strip().lower()
        for pattern in admin_patterns:
            if pattern in name_lower:
                return True
    
    return False


@celery_app.task(name='app.tasks_v2.prepare_campaign_redis')
def prepare_campaign_redis(campaign_id: int):
    """
    V2 Preparation: Pre-generate all email tasks and store in Redis
    This makes the later resume instant - no generation time.
    
    Args:
        campaign_id: ID of campaign to prepare
    """
    db = SessionLocal()
    request_id = str(uuid.uuid4())[:8]
    
    try:
        logger.info(f"[{request_id}] 🎯 V2 PREPARE START: Campaign {campaign_id}")
        append_campaign_log(campaign_id, f"🎯 PREPARE START - campaign {campaign_id}")
        start_time = time.time()
        
        # Get campaign
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            raise Exception(f"Campaign {campaign_id} not found")
        
        # Check if campaign was canceled during preparation
        if campaign.status == CampaignStatus.CANCELED:
            logger.info(f"[{request_id}] ❌ Preparation for Campaign {campaign_id} aborted: Campaign was canceled.")
            append_campaign_log(campaign_id, "❌ PREPARATION ABORTED: Campaign was canceled.")
            return {"campaign_id": campaign_id, "status": "canceled", "message": "Preparation aborted due to cancellation"}
        
        transition_campaign_status(
            db,
            campaign_id,
            CampaignStatus.PREPARING,
            triggered_by="celery:prepare_campaign_redis",
            celery_task_id=prepare_campaign_redis.request.id
        )
        # Note: prepared_at is set by the state machine
        db.commit()
        
        # Get sender accounts
        sender_accounts = campaign.sender_accounts
        logger.info(f"[{request_id}] 🔍 Sender accounts found: {len(sender_accounts) if sender_accounts else 0}")
        if not sender_accounts:
            # Try to get sender accounts from CampaignSender table
            campaign_senders = db.query(CampaignSender).filter(CampaignSender.campaign_id == campaign_id).all()
            logger.info(f"[{request_id}] 🔍 CampaignSender records: {len(campaign_senders)}")
            if campaign_senders:
                sender_accounts = [db.query(ServiceAccount).filter(ServiceAccount.id == cs.service_account_id).first() for cs in campaign_senders]
                sender_accounts = [sa for sa in sender_accounts if sa]  # Filter out None values
                logger.info(f"[{request_id}] 🔍 Sender accounts from CampaignSender: {len(sender_accounts)}")
        
        if not sender_accounts:
            raise Exception("No sender accounts configured")
        
        # Build sender pool
        sender_pool = []
        logger.info(f"[{request_id}] 🔍 Building sender pool from {len(sender_accounts)} accounts")
        
        for account in sender_accounts:
            logger.info(f"[{request_id}] 🔍 Processing account: {account.name} (ID: {account.id})")
            users = db.query(WorkspaceUser).filter(
                WorkspaceUser.service_account_id == account.id,
                WorkspaceUser.is_active == True
            ).all()
            logger.info(f"[{request_id}] 🔍 Found {len(users)} active users for account {account.name}")
            
            # Decrypt once during preparation
            try:
                decrypted_json = encryption_service.decrypt(account.encrypted_json)
                logger.info(f"[{request_id}] 🔍 Successfully decrypted JSON for account {account.name}")
            except Exception as e:
                logger.error(f"[{request_id}] ❌ Failed to decrypt JSON for account {account.name}: {e}")
                continue
            
            for user in users:
                # Skip admin addresses (must not be used as senders)
                if _is_admin_email(user.email, getattr(account, 'admin_email', None), user.full_name):
                    continue
                sender_pool.append({
                    'service_account_id': account.id,
                    'service_account_json': decrypted_json,
                    'user_email': user.email,
                    'user_id': user.id
                })
        
        logger.info(f"[{request_id}] 🔍 Total sender pool size: {len(sender_pool)}")
        if not sender_pool:
            raise Exception("No active users available")
        
        logger.info(f"[{request_id}] 👥 Sender pool: {len(sender_pool)} users across {len(sender_accounts)} accounts")
        
        # Create email logs if they don't exist
        existing_logs_count = db.query(EmailLog).filter(EmailLog.campaign_id == campaign_id).count()
        
        if existing_logs_count == 0:
            logger.info(f"[{request_id}] 📝 Creating {len(campaign.recipients)} email logs with EQUAL distribution...")
            
            # EQUAL DISTRIBUTION: Calculate exact emails per sender
            total_recipients = len(campaign.recipients)
            total_senders = len(sender_pool)
            emails_per_sender = total_recipients // total_senders
            extra_emails = total_recipients % total_senders
            
            logger.info(f"[{request_id}] 📊 EQUAL DISTRIBUTION: {total_recipients} emails ÷ {total_senders} senders = {emails_per_sender} emails per sender (+ {extra_emails} extra)")
            
            # Distribute emails equally
            sender_index = 0
            emails_for_current_sender = emails_per_sender + (1 if sender_index < extra_emails else 0)
            emails_assigned = 0
            
            for idx, recipient in enumerate(campaign.recipients):
                # Check if we need to move to next sender
                if emails_assigned >= emails_for_current_sender:
                    sender_index += 1
                    emails_for_current_sender = emails_per_sender + (1 if sender_index < extra_emails else 0)
                    emails_assigned = 0
                
                sender = sender_pool[sender_index]
                emails_assigned += 1
                
                db.add(EmailLog(
                    campaign_id=campaign_id,
                    recipient_email=recipient.get('email'),
                    recipient_name=recipient.get('variables', {}).get('name', ''),
                    sender_email=sender['user_email'],
                    service_account_id=sender['service_account_id'],
                    subject=campaign.subject,
                    status=EmailStatus.PENDING,
                ))
            db.commit()
            logger.info(f"[{request_id}] ✅ Email logs created with EQUAL distribution")
        
        # Basic validation before generating tasks
        # 1) Recipients must exist
        if not campaign.recipients or len(campaign.recipients) == 0:
            append_campaign_log(campaign_id, "❌ No recipients provided")
            raise Exception("No recipients provided")

        # 2) Header/fields validation depending on mode
        if campaign.header_type == '100_percent':
            if not campaign.custom_header or len(str(campaign.custom_header).strip()) == 0:
                append_campaign_log(campaign_id, "❌ 100% Header mode requires Custom Header text")
                raise Exception("100% Header mode requires custom_header to be provided")
        else:
            # Existing/Gmail-built header path requires subject and from_name
            if not campaign.subject or len(str(campaign.subject).strip()) == 0:
                append_campaign_log(campaign_id, "❌ Subject is required when not using 100% Header")
                raise Exception("Subject is required when not using 100% Header")
            if not campaign.from_name or len(str(campaign.from_name).strip()) == 0:
                append_campaign_log(campaign_id, "❌ From name is required when not using 100% Header")
                raise Exception("From name is required when not using 100% Header")

        # Fetch all email logs
        email_logs = db.query(EmailLog).filter(
            EmailLog.campaign_id == campaign_id,
            EmailLog.status.in_([EmailStatus.PENDING, EmailStatus.FAILED])
        ).all()
        
        logger.info(f"[{request_id}] 📦 Preparing {len(email_logs)} tasks for Redis...")
        
        # Pre-generate all tasks and push to Redis
        redis_key = get_campaign_redis_key(campaign_id)
        redis_client.delete(redis_key)  # Clear any old tasks
        
        # Check if test_after is configured
        test_after_enabled = campaign.test_after_email and campaign.test_after_count > 0
        if test_after_enabled:
            logger.info(f"[{request_id}] 🧪 Test After enabled: {campaign.test_after_count} emails -> {campaign.test_after_email}")
        
        # Group tasks by sender
        sender_batches = {}
        task_counter = 0  # Track position for test_after
        
        for email_log in email_logs:
            sender_email = email_log.sender_email
            
            if sender_email not in sender_batches:
                # Find sender data
                sender = next((s for s in sender_pool if s['user_email'] == sender_email), None)
                if not sender:
                    logger.warning(f"[{request_id}] ⚠️ No sender found for {sender_email}, using first available")
                    sender = sender_pool[0]
                
                sender_batches[sender_email] = {
                    'sender': sender,
                    'tasks': []
                }
            
            # Get recipient variables
            recipient_data = next(
                (r for r in campaign.recipients if r['email'] == email_log.recipient_email),
                {'email': email_log.recipient_email, 'variables': {}}
            )
            
            # Pre-render subject and body with strong string coercion
            def _to_str(val):
                if val is None:
                    return ""
                if isinstance(val, str):
                    return val
                if isinstance(val, list):
                    return "\n".join([str(x) for x in val])
                try:
                    import json as _json
                    return _json.dumps(val)
                except Exception:
                    return str(val)

            variables = recipient_data.get('variables', {})
            final_subject = _to_str(substitute_variables(campaign.subject, variables))
            final_body_html = _to_str(substitute_variables(campaign.body_html, variables)) if campaign.body_html is not None else ""
            final_body_plain = _to_str(substitute_variables(campaign.body_plain, variables)) if campaign.body_plain is not None else ""
            
            # CRITICAL: Log body content to ensure it's not lost
            logger.info(f"[{request_id}] 📝 Task body_html length: {len(final_body_html)}, body_plain length: {len(final_body_plain)}")
            if campaign.header_type == '100_percent':
                logger.info(f"[{request_id}] 🔍 100% Header mode - body_html: {final_body_html[:100] if final_body_html else 'EMPTY'}...")
            
            # Check if we should use custom headers
            custom_header_text = None
            logger.info(f"Campaign {campaign_id} - header_type: {campaign.header_type}, custom_header: {campaign.custom_header[:100] if campaign.custom_header else 'None'}...")
            if campaign.header_type == '100_percent' and campaign.custom_header:
                custom_header_text = campaign.custom_header
                logger.info(f"Using custom header for campaign {campaign_id}: {custom_header_text[:100]}...")
            else:
                logger.info(f"Not using custom headers - header_type: {campaign.header_type}, has_custom_header: {bool(campaign.custom_header)}")
            
            task = {
                'email_log_id': email_log.id,
                'recipient_email': email_log.recipient_email,
                'subject': _to_str(final_subject),
                'body_html': _to_str(final_body_html),  # CRITICAL: Always include HTML body
                'body_plain': _to_str(final_body_plain),  # CRITICAL: Always include plain body
                'from_name': campaign.from_name,
                'custom_headers': campaign.custom_headers or {},
                'attachments': campaign.attachments,
                'custom_header_text': custom_header_text,
            }
            
            # Validate task has body content
            if not task['body_html'] and not task['body_plain']:
                logger.warning(f"[{request_id}] ⚠️ WARNING: Task has NO body content! body_html='{task['body_html']}', body_plain='{task['body_plain']}'")
            elif not task['body_html']:
                logger.warning(f"[{request_id}] ⚠️ WARNING: Task has NO HTML body! Only plain text available.")
            
            sender_batches[sender_email]['tasks'].append(task)
            task_counter += 1
            
            # Add test_after email if needed (only after the specified count)
            if test_after_enabled and task_counter > 0 and task_counter % campaign.test_after_count == 0:
                test_task = {
                    'email_log_id': None,  # Special test task
                    'recipient_email': campaign.test_after_email,
                    'subject': _to_str(f"[TEST AFTER {task_counter}] {final_subject}"),
                    'body_html': _to_str(f"<p><strong>Test After Email #{task_counter}</strong></p><p>This is a test email sent after {task_counter} campaign emails.</p>{final_body_html}"),
                    'body_plain': _to_str(f"Test After Email #{task_counter}\n\nThis is a test email sent after {task_counter} campaign emails.\n\n{final_body_plain}"),
                    'from_name': campaign.from_name,
                    'custom_headers': campaign.custom_headers or {},
                    'attachments': campaign.attachments,
                    'is_test_after': True,
                    'test_after_count': task_counter
                }
                sender_batches[sender_email]['tasks'].append(test_task)
                logger.info(f"[{request_id}] 🧪 Added test_after email at position {task_counter}")
        
        # Push batches to Redis
        task_count = 0
        for sender_email, batch_data in sender_batches.items():
            redis_task = {
                'campaign_id': campaign_id,
                'sender': batch_data['sender'],
                'tasks': batch_data['tasks']
            }
            redis_client.rpush(redis_key, json.dumps(redis_task))
            task_count += len(batch_data['tasks'])
        
        logger.info(f"[{request_id}] ✅ Pushed {len(sender_batches)} sender batches ({task_count} tasks) to Redis")
        append_campaign_log(campaign_id, f"✅ Prepared {task_count} tasks in {len(sender_batches)} batches")
        
        # Initialize progress tracker
        progress_key = get_campaign_progress_key(campaign_id)
        redis_client.hset(progress_key, mapping={
            'total': task_count,
            'sent': 0,
            'failed': 0,
            'pending': task_count,
            'test_after_enabled': '1' if test_after_enabled else '0',
            'test_after_email': campaign.test_after_email or '',
            'test_after_count': campaign.test_after_count or 0
        })
        redis_client.expire(progress_key, 86400)  # 24 hour expiry
        
        # Mark campaign as READY
        transition_campaign_status(
            db, 
            campaign_id, 
            CampaignStatus.READY, 
            triggered_by="celery:prepare_campaign_redis",
            celery_task_id=prepare_campaign_redis.request.id
        )
        campaign.pending_count = task_count
        campaign.sent_count = 0
        campaign.failed_count = 0
        # Ensure total_recipients is set correctly
        campaign.total_recipients = len(campaign.recipients)
        db.commit()
        
        elapsed = time.time() - start_time
        logger.info(f"[{request_id}] 🎉 V2 PREPARE COMPLETE in {elapsed:.2f}s - Campaign {campaign_id} READY")
        append_campaign_log(campaign_id, "🎉 PREPARE COMPLETE - status READY")
        
        return {
            'campaign_id': campaign_id,
            'status': 'ready',
            'total_tasks': task_count,
            'sender_count': len(sender_batches),
            'preparation_time': elapsed
        }
        
    except Exception as e:
        logger.error(f"[{request_id}] ❌ Preparation failed: {e}")
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if campaign:
            try:
                transition_campaign_status(
                    db,
                    campaign_id,
                    CampaignStatus.FAILED,
                    triggered_by="celery:prepare_campaign_redis:error",
                    celery_task_id=prepare_campaign_redis.request.id,
                    metadata={"error": str(e)}
                )
            except Exception:
                pass # Already logged
            db.commit()
        raise
    
    finally:
        db.close()


@celery_app.task(name='app.tasks_v2.resume_campaign_instant')
def resume_campaign_instant(campaign_id: int):
    """
    V2 Resume: Instantly fan out all pre-generated tasks from Redis
    No generation time - everything is ready to send NOW.
    
    Args:
        campaign_id: ID of campaign to resume
    """
    db = SessionLocal()
    request_id = str(uuid.uuid4())[:8]
    
    try:
        logger.info(f"[{request_id}] ⚡ V2 RESUME START: Campaign {campaign_id}")
        append_campaign_log(campaign_id, "⚡ RESUME START")
        start_time = time.time()
        
        # Get campaign
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            raise Exception(f"Campaign {campaign_id} not found")
        
        if campaign.status not in [CampaignStatus.READY, CampaignStatus.PAUSED, CampaignStatus.SENDING]:
            raise Exception(f"Campaign must be READY, PAUSED, or SENDING. Current: {campaign.status}")
        
        # If already SENDING, just continue with the existing process
        if campaign.status == CampaignStatus.SENDING:
            logger.info(f"[{request_id}] ⚠️ Campaign already SENDING, continuing with existing process...")
        
        transition_campaign_status(
            db,
            campaign_id,
            CampaignStatus.SENDING,
            triggered_by="celery:resume_campaign_instant",
            celery_task_id=resume_campaign_instant.request.id
        )
        db.commit()
        
        # Fetch all tasks from Redis
        redis_key = get_campaign_redis_key(campaign_id)
        task_batches = []
        
        while True:
            batch_json = redis_client.lpop(redis_key)
            if not batch_json:
                break
            task_batches.append(json.loads(batch_json))
        
        if not task_batches:
            raise Exception("No tasks found in Redis. Campaign may not be prepared.")
        
        logger.info(f"[{request_id}] 🚀 Launching {len(task_batches)} sender batches instantly...")
        
        # Fan out to Celery workers - ALL AT ONCE
        from celery import group
        celery_tasks = [
            execute_sender_batch_v2.s(batch_data, campaign_id, request_id)
            for batch_data in task_batches
        ]
        
        job = group(celery_tasks)
        result = job.apply_async()
        
        # Dispatch tasks and let them run asynchronously
        logger.info(f"[{request_id}] ✅ All batches dispatched in {time.time() - start_time:.2f}s")
        append_campaign_log(campaign_id, f"✅ Dispatched {len(celery_tasks)} sender batches")
        logger.info(f"[{request_id}] 🎉 V2 RESUME COMPLETE - Tasks dispatched asynchronously")
        
        # Note: We don't wait for completion here to avoid Celery anti-pattern
        # The individual tasks will update the campaign status when they complete
        # We don't check email status here because the tasks are still running asynchronously
        
        return {
            'campaign_id': campaign_id,
            'status': 'completed',
            'total_time': time.time() - start_time
        }
        
    except Exception as e:
        logger.error(f"[{request_id}] ❌ Resume failed: {e}")
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if campaign:
            try:
                transition_campaign_status(
                    db,
                    campaign_id,
                    CampaignStatus.FAILED,
                    triggered_by="celery:resume_campaign_instant:error",
                    celery_task_id=resume_campaign_instant.request.id,
                    metadata={"error": str(e)}
                )
            except Exception:
                pass
            db.commit()
        raise
    
    finally:
        db.close()


@celery_app.task(name='app.tasks_v2.execute_sender_batch_v2')
def execute_sender_batch_v2(batch_data: Dict, campaign_id: int, request_id: str):
    """
    Execute a single sender's batch using thread pool
    With configurable 5ms micro-delay per email
    
    Args:
        batch_data: Dict with sender info and pre-rendered tasks
        campaign_id: Campaign ID
        request_id: Request tracking ID
    """
    db = SessionLocal()
    sender = batch_data['sender']
    tasks = batch_data['tasks']
    sender_email = sender['user_email']
    
    # NO DELAY - Send emails instantly
    MICRO_DELAY = 0.0  # ZERO delay - send ALL emails instantly
    
    try:
        logger.info(f"[{request_id}] 👤 Sender {sender_email}: Executing {len(tasks)} tasks")
        append_campaign_log(campaign_id, f"👤 Sender {sender_email}: executing {len(tasks)} tasks")
        start_time = time.time()
        
        # Initialize Google service once
        google_service = GoogleWorkspaceService(sender['service_account_json'])
        
        # Thread pool for parallel sending
        max_threads = min(len(tasks), 50)  # Up to 50 parallel per sender
        
        results = []
        futures = []
        
        # Add a periodic check for campaign status
        status_check_interval = 10  # Check status every 10 emails
        emails_processed_in_batch = 0

        with ThreadPoolExecutor(max_workers=max_threads) as executor:
            for task in tasks:
                # Periodically check campaign status
                if emails_processed_in_batch % status_check_interval == 0:
                    db.refresh(campaign) # Refresh campaign object to get latest status
                    if campaign.status == CampaignStatus.PAUSED:
                        logger.info(f"[{request_id}] ⏸️ Campaign {campaign_id} paused. Stopping sender {sender_email} batch.")
                        append_campaign_log(campaign_id, f"⏸️ Campaign paused. Sender {sender_email} batch stopped.")
                        # Mark remaining tasks in this batch as pending
                        for remaining_task in tasks[emails_processed_in_batch:]:
                            email_log = db.query(EmailLog).filter(EmailLog.id == remaining_task['email_log_id']).first()
                            if email_log and email_log.status == EmailStatus.PENDING:
                                email_log.status = EmailStatus.PENDING # Ensure it remains pending
                        db.commit()
                        return # Exit the task
                    elif campaign.status == CampaignStatus.CANCELED:
                        logger.info(f"[{request_id}] ❌ Campaign {campaign_id} canceled. Stopping sender {sender_email} batch.")
                        append_campaign_log(campaign_id, f"❌ Campaign canceled. Sender {sender_email} batch stopped.")
                        # Mark remaining tasks in this batch as failed
                        for remaining_task in tasks[emails_processed_in_batch:]:
                            email_log = db.query(EmailLog).filter(EmailLog.id == remaining_task['email_log_id']).first()
                            if email_log and email_log.status == EmailStatus.PENDING:
                                email_log.status = EmailStatus.FAILED
                                email_log.error_message = "Campaign canceled"
                                email_log.failed_at = datetime.utcnow()
                        db.commit()
                        return # Exit the task
                
                # Check quota before sending
                from app.services.quota import QuotaManager
                
                # Check rate limit (per user)
                if not QuotaManager.check_rate_limit(sender_email, limit_per_sec=10):
                    time.sleep(0.1) # Soft throttle
                    
                # Atomic Quota Reservation
                # We reserve 1 email at a time here because we are inside the loop
                # Ideally we reserve batch_size at start, but for now strict per-email check is safer
                if not QuotaManager.check_and_reserve(sender['service_account_id'], 1):
                    logger.warning(f"[{request_id}] 🛑 Quota exceeded for SA {sender['service_account_id']}. Stopping batch.")
                    append_campaign_log(campaign_id, f"🛑 Quota exceeded for sender {sender_email}. Stopping.")
                    # Mark remaining as FAILED (or could be PENDING for retry tomorrow)
                    # For V2 "Speed Send", we fail them to stop the queue.
                    for remaining_task in tasks[emails_processed_in_batch:]:
                        email_log = db.query(EmailLog).filter(EmailLog.id == remaining_task['email_log_id']).first()
                        if email_log and email_log.status == EmailStatus.PENDING:
                            email_log.status = EmailStatus.FAILED
                            email_log.error_message = "Daily User/SA Quota Exceeded"
                            email_log.failed_at = datetime.utcnow()
                    db.commit()
                    return

                future = executor.submit(
                    send_prerendered_email,
                    google_service,
                    sender_email,
                    task,
                    campaign_id,
                    MICRO_DELAY
                )
                futures.append((future, task))
                emails_processed_in_batch += 1
            
            # Collect results
            for future, task in futures:
                success, message_id, error = future.result()
                
                # CIRCUIT BREAKER: Check for 403 User Rate Limit
                if not success and "403" in str(error) and "limit" in str(error).lower():
                    logger.error(f"[{request_id}] 🔌 Circuit Breaker tripped for {sender_email} (403 Rate Limit)")
                    # We could pause the campaign or just this sender
                    # For now, just log heavily
                    pass
                
                results.append({
                    'email_log_id': task['email_log_id'],
                    'success': success,
                    'message_id': message_id,
                    'error': error
                })

        # Sync quota usage to DB after batch
        QuotaManager.sync_usage_to_db(sender['service_account_id'])
        
        elapsed = time.time() - start_time
        
        # Batch DB update
        sent = 0
        failed = 0
        test_after_sent = 0
        
        # Fetch campaign again to ensure latest status for final update
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign: # Campaign might have been deleted during processing
            logger.warning(f"[{request_id}] ⚠️ Campaign {campaign_id} not found during final batch update.")
            return

        # If campaign was paused/canceled by another process, don't update counts
        if campaign.status in [CampaignStatus.PAUSED, CampaignStatus.CANCELED]:
            logger.info(f"[{request_id}] ⚠️ Campaign {campaign_id} status is {campaign.status}. Skipping final batch count updates.")
            return

        for result in results:
            # Handle test_after emails (no email_log_id)
            if result['email_log_id'] is None:
                if result['success']:
                    test_after_sent += 1
                    logger.info(f"[{request_id}] 🧪 Test After email sent successfully to {result.get('recipient_email', 'unknown')}")
                else:
                    logger.warning(f"[{request_id}] 🧪 Test After email failed: {result['error']}")
                continue
            
            # Handle regular campaign emails
            email_log = db.query(EmailLog).filter(EmailLog.id == result['email_log_id']).first()
            if email_log:
                if result['success']:
                    email_log.status = EmailStatus.SENT
                    email_log.message_id = result['message_id']
                    email_log.sent_at = datetime.utcnow()
                    sent += 1
                else:
                    email_log.status = EmailStatus.FAILED
                    email_log.error_message = result['error']
                    email_log.failed_at = datetime.utcnow()
                    failed += 1
                    try:
                        append_campaign_log(campaign_id, f"❌ Send failed for {task.get('recipient_email')}: {result['error']}")
                    except Exception:
                        pass
        
        # Update campaign counters
        campaign.sent_count += sent
        campaign.failed_count += failed
        campaign.pending_count = max(0, campaign.pending_count - len(results))
        
        # Check if campaign is complete (no more pending emails)
        if campaign.pending_count == 0:
            # All emails have been processed, mark campaign as completed
            transition_campaign_status(
                db,
                campaign_id,
                CampaignStatus.COMPLETED,
                triggered_by="celery:execute_sender_batch_v2",
                celery_task_id=request_id
            )
            # campaign.completed_at = datetime.utcnow() # Handled by state machine
            logger.info(f"[{request_id}] 🎉 Campaign {campaign_id} completed: {campaign.sent_count} sent, {campaign.failed_count} failed")
            append_campaign_log(campaign_id, f"🎉 Campaign completed: {campaign.sent_count} sent, {campaign.failed_count} failed")
        
        # Update user stats
        user = db.query(WorkspaceUser).filter(
            WorkspaceUser.service_account_id == sender['service_account_id'],
            WorkspaceUser.email == sender_email
        ).first()
        if user:
            user.emails_sent_today += sent
            user.last_used = datetime.utcnow()
        
        db.commit()
        
        # Update Redis progress
        progress_key = get_campaign_progress_key(campaign_id)
        redis_client.hincrby(progress_key, 'sent', sent)
        redis_client.hincrby(progress_key, 'failed', failed)
        redis_client.hincrby(progress_key, 'pending', -len(results))
        
        # Log results with test_after info
        test_after_info = f", {test_after_sent} test_after" if test_after_sent > 0 else ""
        logger.info(f"[{request_id}] ✅ Sender {sender_email}: {len(tasks)} tasks in {elapsed:.2f}s ({len(tasks)/elapsed:.1f}/sec){test_after_info}")
        append_campaign_log(campaign_id, f"✅ Sender {sender_email}: sent {sent}, failed {failed}")

        # Note: Test After emails are already included in the task queue during preparation
        # No need to send additional test emails during execution
        
        logger.info(f"[{request_id}] 📊 Sender {sender_email}: {sent} sent, {failed} failed")
        
    except Exception as e:
        logger.error(f"[{request_id}] ❌ Sender {sender_email} failed: {e}")
        
        # Mark all as failed
        for task in tasks:
            email_log = db.query(EmailLog).filter(EmailLog.id == task['email_log_id']).first()
            if email_log and email_log.status == EmailStatus.PENDING:
                email_log.status = EmailStatus.FAILED
                email_log.error_message = str(e)
                email_log.failed_at = datetime.utcnow()
        
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if campaign:
            campaign.failed_count += len(tasks)
            campaign.pending_count = max(0, campaign.pending_count - len(tasks))
        
        db.commit()
        raise
    
    finally:
        db.close()


def send_prerendered_email(
    google_service: GoogleWorkspaceService,
    sender_email: str,
    task: Dict,
    campaign_id: int,
    micro_delay: float = 0.0
) -> tuple:
    """
    Send a pre-rendered email (no variable substitution needed)
    NO DELAYS - Send instantly
    
    Args:
        google_service: Initialized Google API service
        sender_email: Sender email
        task: Pre-rendered task dict
        micro_delay: NO DELAY - always 0.0 for instant sending
    
    Returns:
        (success: bool, message_id: str, error: str)
    """
    try:
        # Skip if Gmail not enabled for this user
        if not google_service.is_gmail_enabled(sender_email):
            append_campaign_log(campaign_id, f"⚠️ Gmail disabled for {sender_email} - skipping")
            return False, None, "Gmail service not enabled for this user"
        
        # NO DELAY - Send emails instantly
        # Removed time.sleep() completely for maximum speed
        
        # Process custom headers if needed
        custom_headers = task.get('custom_headers', {})
        if not isinstance(custom_headers, dict):
            custom_headers = {}
        if task.get('custom_header_text'):
            # Prefer SMTP if enabled to better preserve 100% custom headers
            import os
            if os.getenv('SMTP_ENABLED', 'false').lower() == 'true':
                try:
                    from app.services.mailer import send_via_smtp
                    from email import message_from_string as _msg_from_str
                    raw_email_str = google_service._build_raw_email_with_headers(
                        sender_email=sender_email,
                        recipient_email=task['recipient_email'],
                        subject=task['subject'],
                        body_html=task['body_html'],
                        body_plain=task['body_plain'],
                        from_name=task.get('from_name'),
                        custom_headers=custom_headers,
                        attachments=task.get('attachments')
                    )
                    smtp_msg = _msg_from_str(raw_email_str)
                    send_via_smtp(smtp_msg)
                    return (True, smtp_msg.get('Message-ID'), None)
                except Exception as smtp_e:
                    logger.warning(f"SMTP send failed, falling back to Gmail: {smtp_e}")
            logger.info(f"Processing custom header text: {task['custom_header_text'][:100]}...")
            # Process custom header tags for 100% header type
            # Derive a display name if not provided
            sender_display = task.get('from_name') or ''
            if not sender_display:
                try:
                    local = sender_email.split('@')[0]
                    parts = [p for p in local.replace('_',' ').replace('-',' ').split('.') if p]
                    sender_display = ' '.join(w.capitalize() for w in parts if w) or local
                except Exception:
                    sender_display = sender_email
            processed_header = process_custom_header_tags(
                header_text=task['custom_header_text'],
                recipient_email=task['recipient_email'],
                sender_name=sender_display,
                subject=task['subject'],
                smtp_username=sender_email,
                domain=sender_email.split('@')[1] if '@' in sender_email else None
            )
            
            logger.info(f"Processed header: {processed_header[:200]}...")
            
            # Parse the processed header into individual headers
            header_lines = processed_header.strip().split('\n')
            for line in header_lines:
                if ':' in line:
                    key, value = line.split(':', 1)
                    custom_headers[key.strip()] = value.strip()
            
            logger.info(f"Final custom headers: {custom_headers}")
        else:
            logger.info("No custom header text found in task")
        
        # Send (everything is already prepared)
        # Use custom header method if we have custom_header_text
        if task.get('custom_header_text'):
            # Normalize header names to canonical casing expected by MTAs
            if custom_headers:
                canonical = {}
                mapping = {
                    'mime-version': 'MIME-Version',
                    'content-type': 'Content-Type',
                    'message-id': 'Message-ID',
                    'list-unsubscribe': 'List-Unsubscribe',
                    'received': 'Received',
                    'from': 'From',
                    'subject': 'Subject',
                    'date': 'Date',
                    'to': 'To',
                    'feedback-id': 'Feedback-ID'
                }
                for k, v in custom_headers.items():
                    key = mapping.get(k.lower(), k)
                    canonical[key] = v if isinstance(v, str) else str(v)
                # Ensure To header present
                canonical.setdefault('To', task['recipient_email'])
                custom_headers = canonical
            logger.info(f"Using send_email_with_custom_headers method - custom_headers: {custom_headers}")
            # CRITICAL: Log body content before sending
            logger.info(f"📧 Sending email - body_html length: {len(task.get('body_html', '') or '')}, body_plain length: {len(task.get('body_plain', '') or '')}")
            if not task.get('body_html'):
                logger.warning(f"⚠️ WARNING: body_html is EMPTY before sending!")
            
            message_id = google_service.send_email_with_custom_headers(
                sender_email=sender_email,
                recipient_email=task['recipient_email'],
                subject=task['subject'],
                body_html=task.get('body_html') or '',  # Ensure not None
                body_plain=task.get('body_plain') or '',  # Ensure not None
                from_name=task.get('from_name'),
                custom_headers=custom_headers,
                attachments=task.get('attachments')
            )
        else:
            logger.info(f"Using regular send_email method - no custom_header_text")
            message_id = google_service.send_email(
                sender_email=sender_email,
                recipient_email=task['recipient_email'],
                subject=task['subject'],
                body_html=task['body_html'],
                body_plain=task['body_plain'],
                from_name=task.get('from_name'),
                custom_headers=custom_headers,
                attachments=task.get('attachments')
            )
        
        return (True, message_id, None)
    
    except Exception as e:
        # Enhanced error logging with type information for debugging
        html_type = type(task.get('body_html')).__name__
        text_type = type(task.get('body_plain')).__name__
        subject_type = type(task.get('subject')).__name__
        error_msg = f"{str(e)} | html_type={html_type} text_type={text_type} subject_type={subject_type}"
        
        try:
            append_campaign_log(campaign_id, f"❌ Send failed for {task.get('recipient_email')}: {error_msg}")
            logger.error(f"Send failed for {task.get('recipient_email')} | sender={sender_email} | {error_msg}")
        except Exception:
            pass
        return (False, None, error_msg)

