from celery import Task, states, chord, group
from celery.exceptions import Ignore
from app.celery_app import celery_app
from app.database import SessionLocal
from app.models import Campaign, EmailLog, WorkspaceUser, ServiceAccount, CampaignStatus, EmailStatus
from app.google_api import GoogleWorkspaceService, substitute_variables
from app.encryption import encryption_service
from app.state_machine import transition_campaign_status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import time
import logging
from typing import List, Dict
import asyncio
from concurrent.futures import ThreadPoolExecutor
import threading

logger = logging.getLogger(__name__)


class CampaignTask(Task):
    """Base task with campaign pause/resume support"""
    
    def __init__(self):
        self._is_paused = False
        self._campaign_id = None
    
    def check_if_paused(self, campaign_id: int, db: Session) -> bool:
        """Check if campaign is paused"""
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if campaign and campaign.status == CampaignStatus.PAUSED:
            return True
        return False
    
    def wait_if_paused(self, campaign_id: int, db: Session):
        """Wait while campaign is paused"""
        while self.check_if_paused(campaign_id, db):
            time.sleep(5)  # Check every 5 seconds
            db.refresh(db.query(Campaign).filter(Campaign.id == campaign_id).first())


@celery_app.task(bind=True, base=CampaignTask, name='app.tasks.send_campaign_emails')
def send_campaign_emails(self, campaign_id: int):
    """
    PowerMTA-style instant parallel email sending
    Sends ALL emails simultaneously across all users
    
    Args:
        campaign_id: ID of the campaign to send
    """
    db = SessionLocal()
    
    try:
        # Get campaign
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            raise Exception(f"Campaign {campaign_id} not found")
        
        # Update campaign status
        # Update campaign status
        transition_campaign_status(
            db,
            campaign_id,
            CampaignStatus.SENDING,
            triggered_by="celery:send_campaign_emails",
            celery_task_id=self.request.id
        )
        campaign.celery_task_id = self.request.id
        db.commit()
        
        # Get sender accounts and their users
        sender_accounts = campaign.sender_accounts
        if not sender_accounts:
            raise Exception("No sender accounts configured")
        
        # Build pool of available senders with their credentials
        sender_pool = []
        for account in sender_accounts:
            users = db.query(WorkspaceUser).filter(
                WorkspaceUser.service_account_id == account.id,
                WorkspaceUser.is_active == True
            ).all()
            
            # Decrypt service account JSON once
            try:
                # Check if encrypted_json exists and is not empty
                if not account.encrypted_json:
                    logger.error(f"❌ Empty encrypted JSON for account {account.name}")
                    continue
                    
                decrypted_json = encryption_service.decrypt(account.encrypted_json)
                logger.info(f"🔍 Successfully decrypted JSON for account {account.name}")
            except Exception as e:
                logger.error(f"❌ Failed to decrypt JSON for account {account.name} (ID: {account.id}): {str(e)}")
                
                # Try to use the model's get_json_content method as a fallback
                try:
                    decrypted_json = account.get_json_content()
                    if decrypted_json:
                        logger.info(f"🔍 Successfully decrypted JSON using fallback method for account {account.name}")
                    else:
                        logger.error(f"❌ Fallback decryption also failed for account {account.name}")
                        continue
                except Exception as fallback_error:
                    logger.error(f"❌ Fallback decryption failed with error: {str(fallback_error)}")
                    continue
            
            from app.tasks_v2 import _is_admin_email
            for user in users:
                # Exclude admin addresses from senders
                if _is_admin_email(user.email, getattr(account, 'admin_email', None)):
                    continue
                sender_pool.append({
                    'service_account_id': account.id,
                    'service_account_json': decrypted_json,
                    'user_email': user.email,
                    'user_id': user.id
                })
        
        if not sender_pool:
            raise Exception("No active users available for sending")
        
        logger.info(f"🚀 PowerMTA Mode: Campaign {campaign_id} with {len(sender_pool)} senders → {campaign.total_recipients} recipients")
        
        # Create email log entries if they don't exist
        email_logs = db.query(EmailLog).filter(
            EmailLog.campaign_id == campaign_id,
            EmailLog.status == EmailStatus.PENDING
        ).all()
        
        if not email_logs:
            for recipient in campaign.recipients:
                email_log = EmailLog(
                    campaign_id=campaign_id,
                    recipient_email=recipient['email'],
                    recipient_name=recipient.get('variables', {}).get('name', ''),
                    subject=campaign.subject,
                    status=EmailStatus.PENDING
                )
                db.add(email_log)
            db.commit()
            email_logs = db.query(EmailLog).filter(
                EmailLog.campaign_id == campaign_id,
                EmailLog.status == EmailStatus.PENDING
            ).all()
        
        # PowerMTA Mode: Distribute emails evenly across all senders
        # EQUAL DISTRIBUTION: Group emails by sender for equal distribution
        emails_per_sender = {}
        
        # Initialize all senders with empty lists
        for sender in sender_pool:
            sender_key = sender['user_email']
            emails_per_sender[sender_key] = {
                'sender': sender,
                'emails': []
            }
        
        # Distribute emails equally among senders
        for idx, email_log in enumerate(email_logs):
            # Use round-robin but ensure equal distribution
            sender_index = idx % len(sender_pool)
            sender = sender_pool[sender_index]
            sender_key = sender['user_email']
            
            # Get recipient variables
            recipient_data = next(
                (r for r in campaign.recipients if r['email'] == email_log.recipient_email),
                {'email': email_log.recipient_email, 'variables': {}}
            )
            
            emails_per_sender[sender_key]['emails'].append({
                'email_log_id': email_log.id,
                'recipient_email': email_log.recipient_email,
                'variables': recipient_data.get('variables', {}),
            })
        
        # Log distribution details
        total_emails = len(email_logs)
        total_senders = len(sender_pool)
        avg_per_sender = total_emails // total_senders
        extra_emails = total_emails % total_senders
        
        logger.info(f"📊 EQUAL DISTRIBUTION: {total_emails} emails ÷ {total_senders} senders = {avg_per_sender} emails per sender (+ {extra_emails} extra)")
        for sender_key, data in emails_per_sender.items():
            logger.info(f"   👤 {sender_key}: {len(data['emails'])} emails")
        
        # INSTANT PARALLEL SENDING - All senders fire simultaneously
        # Create one task per sender (not per email)
        tasks = []
        for sender_email, data in emails_per_sender.items():
            task = send_bulk_from_single_sender.s(
                campaign_id=campaign_id,
                sender_data=data['sender'],
                email_batch=data['emails'],
                subject=campaign.subject,
                body_html=campaign.body_html,
                body_plain=campaign.body_plain,
                custom_headers=campaign.custom_headers,
                attachments=campaign.attachments,
                from_name=campaign.from_name
            )
            tasks.append(task)
        
        # Fire all tasks simultaneously
        logger.info(f"⚡ FIRING {len(tasks)} parallel senders NOW!")
        start_time = time.time()
        
        job = group(tasks)
        result = job.apply_async()
        
        # Wait for all to complete - NO TIMEOUT LIMIT
        try:
            logger.info(f"⏳ Waiting for {len(tasks)} parallel senders to complete...")
            result.get(timeout=None)  # NO TIMEOUT - wait until ALL emails are sent
            elapsed = time.time() - start_time
            logger.info(f"✅ Campaign {campaign_id} completed in {elapsed:.2f} seconds!")
        except Exception as e:
            logger.error(f"Campaign {campaign_id} error: {e}")
        
        # Mark campaign as completed - check actual results
        db.refresh(campaign)
        if campaign.status == CampaignStatus.SENDING:
            # Get actual counts from database
            actual_sent = db.query(EmailLog).filter(
                EmailLog.campaign_id == campaign_id,
                EmailLog.status == EmailStatus.SENT
            ).count()
            actual_failed = db.query(EmailLog).filter(
                EmailLog.campaign_id == campaign_id,
                EmailLog.status == EmailStatus.FAILED
            ).count()
            
            # Update counts
            campaign.sent_count = actual_sent
            campaign.failed_count = actual_failed
            campaign.pending_count = campaign.total_recipients - actual_sent - actual_failed
            
            # Determine final status
            # Determine final status
            if actual_failed == 0:
                transition_campaign_status(
                    db,
                    campaign_id,
                    CampaignStatus.COMPLETED,
                    triggered_by="celery:send_campaign_emails:complete",
                    celery_task_id=self.request.id
                )
                logger.info(f"✅ Campaign {campaign_id} COMPLETED: {actual_sent} sent, 0 failed")
            else:
                success_rate = actual_sent / (actual_sent + actual_failed)
                if success_rate >= 0.5:  # 50% success rate threshold
                    transition_campaign_status(
                        db,
                        campaign_id,
                        CampaignStatus.COMPLETED,
                        triggered_by="celery:send_campaign_emails:complete_partial",
                        celery_task_id=self.request.id
                    )
                    logger.info(f"✅ Campaign {campaign_id} COMPLETED: {actual_sent} sent, {actual_failed} failed ({success_rate:.1%} success rate)")
                else:
                    try:
                        transition_campaign_status(
                            db,
                            campaign_id,
                            CampaignStatus.FAILED,
                            triggered_by="celery:send_campaign_emails:failed_threshold",
                            celery_task_id=self.request.id
                        )
                    except Exception:
                        pass
                    logger.info(f"❌ Campaign {campaign_id} FAILED: {actual_sent} sent, {actual_failed} failed ({success_rate:.1%} success rate)")
            
            # campaign.completed_at = datetime.utcnow() # Handled by state machine
            db.commit()
        
        logger.info(f"📧 Final: {campaign.sent_count} sent, {campaign.failed_count} failed")
        
    except Exception as e:
        logger.error(f"Campaign {campaign_id} failed: {e}")
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if campaign:
            try:
                transition_campaign_status(
                    db,
                    campaign_id,
                    CampaignStatus.FAILED,
                    triggered_by="celery:send_campaign_emails:exception",
                    celery_task_id=self.request.id,
                    metadata={"error": str(e)}
                )
            except Exception:
                pass
            db.commit()
        raise
    
    finally:
        db.close()


# Import PowerMTA-style bulk sending
from app.tasks_powermta import send_bulk_from_single_sender


@celery_app.task(bind=True, name='app.tasks.send_single_email')
def send_single_email(
    self,
    email_log_id: int,
    campaign_id: int,
    sender_account_id: int,
    sender_email: str,
    recipient_email: str,
    subject: str,
    body_html: str = None,
    body_plain: str = None,
    variables: Dict = None,
    custom_headers: Dict = None,
    attachments: List = None,
    from_name: str = None
):
    """
    Send a single email
    
    Args:
        email_log_id: ID of the email log entry
        campaign_id: ID of the campaign
        sender_account_id: ID of service account to use
        sender_email: Email to send from
        recipient_email: Email to send to
        subject: Email subject
        body_html: HTML body
        body_plain: Plain text body
        variables: Variables for substitution
        custom_headers: Custom email headers
        attachments: List of attachments
    """
    db = SessionLocal()
    
    try:
        # Get email log
        email_log = db.query(EmailLog).filter(EmailLog.id == email_log_id).first()
        if not email_log:
            raise Exception(f"Email log {email_log_id} not found")
        
        # Update status
        email_log.status = EmailStatus.SENDING
        email_log.sender_email = sender_email
        email_log.service_account_id = sender_account_id
        db.commit()
        
        # Get service account
        service_account = db.query(ServiceAccount).filter(
            ServiceAccount.id == sender_account_id
        ).first()
        
        if not service_account:
            raise Exception(f"Service account {sender_account_id} not found")
        
        # Decrypt service account JSON
        try:
            # Check if encrypted_json exists and is not empty
            if not service_account.encrypted_json:
                logger.error(f"❌ Empty encrypted JSON for service account {service_account.name}")
                raise Exception("Empty encrypted JSON for service account")
                
            decrypted_json = encryption_service.decrypt(service_account.encrypted_json)
            logger.info(f"🔍 Successfully decrypted JSON for service account {service_account.name}")
        except Exception as e:
            logger.error(f"❌ Failed to decrypt JSON for service account {service_account.name} (ID: {service_account.id}): {str(e)}")
            
            # Try to use the model's get_json_content method as a fallback
            try:
                decrypted_json = service_account.get_json_content()
                if decrypted_json:
                    logger.info(f"🔍 Successfully decrypted JSON using fallback method for service account {service_account.name}")
                else:
                    logger.error(f"❌ Fallback decryption also failed for service account {service_account.name}")
                    raise Exception("Failed to decrypt service account credentials")
            except Exception as fallback_error:
                logger.error(f"❌ Fallback decryption failed with error: {str(fallback_error)}")
                raise Exception("Failed to decrypt service account credentials")
        
        # Initialize Google API service
        google_service = GoogleWorkspaceService(decrypted_json)
        
        # Substitute variables in subject and body
        variables = variables or {}
        final_subject = substitute_variables(subject, variables)
        final_body_html = substitute_variables(body_html, variables) if body_html else None
        final_body_plain = substitute_variables(body_plain, variables) if body_plain else None
        
        # Send email
        message_id = google_service.send_email(
            sender_email=sender_email,
            recipient_email=recipient_email,
            subject=final_subject,
            body_html=final_body_html,
            body_plain=final_body_plain,
            from_name=from_name,
            custom_headers=custom_headers,
            attachments=attachments
        )
        
        # Update email log
        email_log.status = EmailStatus.SENT
        email_log.message_id = message_id
        email_log.sent_at = datetime.utcnow()
        
        # Update campaign counters
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if campaign:
            campaign.sent_count += 1
            campaign.pending_count = max(0, campaign.pending_count - 1)
        
        # Update workspace user stats
        workspace_user = db.query(WorkspaceUser).filter(
            WorkspaceUser.service_account_id == sender_account_id,
            WorkspaceUser.email == sender_email
        ).first()
        if workspace_user:
            workspace_user.emails_sent_today += 1
            workspace_user.last_used = datetime.utcnow()
        
        db.commit()
        
        # Check if we need to send a test email
        if campaign and campaign.test_after_count > 0 and campaign.test_after_email:
            logger.info(f"🧪 Test After Check: sent_count={campaign.sent_count}, test_after_count={campaign.test_after_count}, test_after_email={campaign.test_after_email}")
            if campaign.sent_count > 0 and campaign.sent_count % campaign.test_after_count == 0:
                try:
                    logger.info(f"🧪 Sending test email after {campaign.sent_count} emails sent")
                    
                    # Send test email using the same campaign content
                    test_subject = f"[TEST AFTER {campaign.sent_count}] {campaign.subject}"
                    test_body_html = campaign.body_html or ""
                    test_body_plain = campaign.body_plain or ""
                    
                    message_id = google_service.send_email(
                        sender_email=sender_email,
                        recipient_email=campaign.test_after_email,
                        subject=test_subject,
                        body_html=test_body_html,
                        body_plain=test_body_plain,
                        from_name=campaign.from_name
                    )
                    
                    logger.info(f"✅ Test email sent successfully: {message_id}")
                    
                except Exception as e:
                    logger.error(f"❌ Failed to send test email: {e}")
        
        logger.info(f"Email sent: {recipient_email} via {sender_email}")
        
    except Exception as e:
        logger.error(f"Failed to send email {email_log_id}: {e}")
        
        # Update email log
        email_log = db.query(EmailLog).filter(EmailLog.id == email_log_id).first()
        if email_log:
            email_log.retry_count += 1
            
            if email_log.retry_count < email_log.max_retries:
                # Schedule retry
                email_log.status = EmailStatus.RETRY
                email_log.error_message = str(e)
                email_log.next_retry_at = datetime.utcnow() + timedelta(minutes=5 * email_log.retry_count)
                db.commit()
                
                # Retry with exponential backoff
                raise self.retry(exc=e, countdown=60 * email_log.retry_count)
            else:
                # Max retries reached
                email_log.status = EmailStatus.FAILED
                email_log.error_message = str(e)
                email_log.failed_at = datetime.utcnow()
                
                # Update campaign counters
                campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
                if campaign:
                    campaign.failed_count += 1
                    campaign.pending_count = max(0, campaign.pending_count - 1)
                
                db.commit()
        
        raise
    
    finally:
        db.close()


@celery_app.task(name='app.tasks.sync_workspace_users')
def sync_workspace_users(service_account_id: int, admin_email: str):
    """
    Sync users from Google Workspace
    
    Args:
        service_account_id: ID of service account
        admin_email: Admin email for delegation
    """
    db = SessionLocal()
    
    try:
        logger.info(f"🔄 Starting user sync for account {service_account_id} with admin {admin_email}")
        
        # Get service account
        service_account = db.query(ServiceAccount).filter(
            ServiceAccount.id == service_account_id
        ).first()
        
        if not service_account:
            logger.error(f"❌ Service account {service_account_id} not found")
            raise Exception(f"Service account {service_account_id} not found")
        
        logger.info(f"📧 Service account: {service_account.client_email}")
        
        # Decrypt service account JSON
        try:
            # Check if encrypted_json exists and is not empty
            if not service_account.encrypted_json:
                logger.error(f"❌ Empty encrypted JSON for service account {service_account.name}")
                raise Exception("Empty encrypted JSON for service account")
                
            decrypted_json = encryption_service.decrypt(service_account.encrypted_json)
            logger.info("✅ Decrypted service account JSON")
        except Exception as e:
            logger.error(f"❌ Failed to decrypt JSON for service account {service_account.name} (ID: {service_account.id}): {str(e)}")
            
            # Try to use the model's get_json_content method as a fallback
            try:
                decrypted_json = service_account.get_json_content()
                if decrypted_json:
                    logger.info("✅ Decrypted service account JSON using fallback method")
                else:
                    logger.error("❌ Fallback decryption also failed")
                    raise Exception("Failed to decrypt service account credentials")
            except Exception as fallback_error:
                logger.error(f"❌ Fallback decryption failed with error: {str(fallback_error)}")
                raise Exception("Failed to decrypt service account credentials")
        
        # Initialize Google API service
        try:
            google_service = GoogleWorkspaceService(decrypted_json)
            logger.info("✅ Initialized Google Workspace Service")
        except Exception as e:
            logger.error(f"❌ Failed to initialize Google service: {str(e)}")
            raise
        
        # Fetch users
        logger.info(f"🔍 Fetching users from Google Workspace (admin: {admin_email})...")
        try:
            users = google_service.fetch_workspace_users(admin_email)
            logger.info(f"✅ Fetched {len(users)} users from Google Workspace")
        except Exception as e:
            logger.error(f"❌ Failed to fetch users from Google: {str(e)}")
            raise
        
        # Update database
        for user_data in users:
            existing_user = db.query(WorkspaceUser).filter(
                WorkspaceUser.service_account_id == service_account_id,
                WorkspaceUser.email == user_data['email']
            ).first()
            
            if existing_user:
                # Update existing user
                existing_user.full_name = user_data['full_name']
                existing_user.first_name = user_data['first_name']
                existing_user.last_name = user_data['last_name']
                existing_user.is_active = user_data['is_active']
                existing_user.updated_at = datetime.utcnow()
            else:
                # Create new user
                new_user = WorkspaceUser(
                    service_account_id=service_account_id,
                    email=user_data['email'],
                    full_name=user_data['full_name'],
                    first_name=user_data['first_name'],
                    last_name=user_data['last_name'],
                    is_active=user_data['is_active']
                )
                db.add(new_user)
        
        # Update service account metadata
        service_account.total_users = len(users)
        service_account.last_synced = datetime.utcnow()
        
        db.commit()
        
        logger.info(f"Synced {len(users)} users for service account {service_account_id}")
        
    except Exception as e:
        logger.error(f"Failed to sync users for service account {service_account_id}: {e}")
        raise
    
    finally:
        db.close()

