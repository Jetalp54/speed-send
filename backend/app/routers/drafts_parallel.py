# Thread-safe parallel processing helpers for draft operations
from concurrent.futures import ThreadPoolExecutor, as_completed
from app.database import SessionLocal
from app import models
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

def upload_drafts_parallel(campaign_id, users, all_recipients, emails_per_user, subject, from_name, body_html, max_workers=50):
    """
    Upload drafts for all users in parallel with thread-safe DB sessions.
    Returns: (total_created, successful_users, failed_users)
    """
    from app.routers.drafts import create_gmail_draft
    from fastapi import HTTPException
    
    def process_user_drafts(user):
        """Process draft creation for ONE user with its own DB session"""
        thread_db = SessionLocal()  # Thread-safe: each thread gets own session
        
        try:
            user_drafts_created = 0
            user_failed = []
            
            for i in range(emails_per_user):
                try:
                    gmail_draft_id = create_gmail_draft(
                        user_id=user.id,
                        subject=subject,
                        from_name=from_name,
                        body_html=body_html,
                        recipients=all_recipients,
                        db=thread_db
                    )
                    
                    draft = models.GmailDraft(
                        draft_campaign_id=campaign_id,
                        user_id=user.id,
                        gmail_draft_id=gmail_draft_id,
                        status='created',
                        recipients=all_recipients
                    )
                    thread_db.add(draft)
                    thread_db.flush()
                    user_drafts_created += 1
                    
                except Exception as e:
                    logger.error(f"Draft creation failed for {user.email}: {str(e)}")
                    user_failed.append({"email": user.email, "error": str(e)})
                    thread_db.rollback()
                    continue
            
            thread_db.commit()
            return {
                "user_email": user.email,
                "drafts_created": user_drafts_created,
                "failed": user_failed
            }
        finally:
            thread_db.close()
    
    # Process all users in parallel
    total_created = 0
    successful_users = []
    failed_users = []
    
    with ThreadPoolExecutor(max_workers=min(max_workers, len(users))) as executor:
        futures = {executor.submit(process_user_drafts, user): user for user in users}
        
        for future in as_completed(futures):
            try:
                result = future.result()
                if result["drafts_created"] > 0:
                    successful_users.append(result["user_email"])
                    total_created += result["drafts_created"]
                if result["failed"]:
                    failed_users.extend(result["failed"])
            except Exception as e:
                user = futures[future]
                logger.error(f"Thread failed for {user.email}: {str(e)}")
                failed_users.append({"email": user.email, "error": str(e)})
    
    return (total_created, successful_users, failed_users)


def launch_drafts_parallel(draft_campaign_id, drafts_by_user, max_workers=50):
    """
    Launch all drafts in parallel with thread-safe DB sessions.
    Returns: (total_launched, total_failed, details)
    """
    def launch_user_drafts(user_id, user_drafts):
        """Launch all drafts for ONE user with its own DB session"""
        thread_db = SessionLocal()
        
        try:
            user_total_launched = 0
            user_total_failed = 0
            user_details = []
            
            # Get user
            user = thread_db.query(models.WorkspaceUser).filter(models.WorkspaceUser.id == user_id).first()
            if not user:
                return (0, len(user_drafts), [])
            
            service_account = user.service_account
            if not service_account:
                return (0, len(user_drafts), [])
            
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
            
            # Send all drafts for this user
            for draft in user_drafts:
                # Re-fetch draft in this thread's session
                draft_obj = thread_db.query(models.GmailDraft).filter(models.GmailDraft.id == draft.id).first()
                if not draft_obj:
                    continue
                    
                try:
                    result = gmail_service.users().drafts().send(
                        userId='me',
                        body={'id': draft_obj.gmail_draft_id}
                    ).execute()
                    
                    draft_obj.status = 'sent'
                    draft_obj.sent_at = datetime.utcnow()
                    draft_obj.gmail_message_id = result.get('id')
                    
                    user_total_launched += 1
                    user_details.append({
                        "draft_id": str(draft_obj.id),
                        "user_email": user.email,
                        "status": "sent"
                    })
                except Exception as e:
                    draft_obj.status = 'failed'
                    user_total_failed += 1
                    user_details.append({
                        "draft_id": str(draft_obj.id),
                        "user_email": user.email,
                        "status": "failed",
                        "error": str(e)
                    })
            
            thread_db.commit()
            return (user_total_launched, user_total_failed, user_details)
        
        except Exception as e:
            logger.error(f"Launch failed for user {user_id}: {str(e)}")
            thread_db.rollback()
            return (0, len(user_drafts), [])
        finally:
            thread_db.close()
    
    # Launch for all users in parallel
    total_launched = 0
    total_failed = 0
    all_details = []
    
    with ThreadPoolExecutor(max_workers=min(max_workers, len(drafts_by_user))) as executor:
        futures = {
            executor.submit(launch_user_drafts, user_id, user_drafts): user_id 
            for user_id, user_drafts in drafts_by_user.items()
        }
        
        for future in as_completed(futures):
            try:
                launched, failed, details = future.result()
                total_launched += launched
                total_failed += failed
                all_details.extend(details)
            except Exception as e:
                user_id = futures[future]
                logger.error(f"Thread failed for user {user_id}: {str(e)}")
    
    return (total_launched, total_failed, all_details)
