from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app import models, schemas
from app.database import get_db
from typing import List, Dict, Optional
import math
from datetime import datetime
import asyncio
from concurrent.futures import ThreadPoolExecutor, as_completed
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import logging
from app.state_machine import transition_draft_status
from app.models import DraftStatus
from pydantic import BaseModel

logger = logging.getLogger(__name__)
from googleapiclient.errors import HttpError
import json

router = APIRouter()

@router.post("/drafts", response_model=schemas.DraftCampaignResponse)
def create_draft_campaign(draft_data: schemas.DraftCampaignCreate, db: Session = Depends(get_db)):
    """
    Creates a new Draft Campaign with selected accounts, users, and contacts.
    """
    logger.info(f"Creating draft campaign: {draft_data.name}")
    logger.info(f"Selected accounts: {draft_data.selected_account_ids}")
    logger.info(f"Selected users: {draft_data.selected_user_ids}")
    logger.info(f"Selected contact lists: {draft_data.selected_contact_list_ids}")
    logger.info(f"DEBUG: use_custom_headers={draft_data.use_custom_headers}")
    logger.info(f"DEBUG: custom_headers length={len(draft_data.custom_headers) if draft_data.custom_headers else 0}")
    
    # Create the draft campaign
    new_draft_campaign = models.DraftCampaign(
        name=draft_data.name,
        subject=draft_data.subject,
        from_name=draft_data.from_name,
        body_html=draft_data.body_html,
        status=DraftStatus.CREATED,
        emails_per_user=draft_data.emails_per_user,
        test_after_email=draft_data.test_after_email,
        test_after_count=draft_data.test_after_count,
        # Custom headers fields
        use_custom_headers=draft_data.use_custom_headers,
        custom_headers=draft_data.custom_headers,
        body_format=draft_data.body_format,
        body_template=draft_data.body_template
    )
    db.add(new_draft_campaign)
    db.flush()  # Get the ID before committing
    
    # Save selected accounts
    for account_id in draft_data.selected_account_ids:
        # ... (rest of code) ...

    # ... (skipping to update_draft_campaign part in user's imagination or handled by multi-replace if I needed to, but here focusing on CREATE and UPDATE separately is safer if blocks are far apart)
        draft_account = models.DraftCampaignAccount(
            draft_campaign_id=new_draft_campaign.id,
            service_account_id=account_id
        )
        db.add(draft_account)
    
    # Save selected users
    for user_id in draft_data.selected_user_ids:
        draft_user = models.DraftCampaignUser(
            draft_campaign_id=new_draft_campaign.id,
            user_id=user_id
        )
        db.add(draft_user)
    
    # Save selected contact lists
    for contact_list_id in draft_data.selected_contact_list_ids:
        draft_contact = models.DraftCampaignContact(
                draft_campaign_id=new_draft_campaign.id,
            contact_list_id=contact_list_id
        )
        db.add(draft_contact)

    db.commit()
    db.refresh(new_draft_campaign)
    
    # Debug: Check what was actually saved
    logger.info(f"Created draft campaign ID: {new_draft_campaign.id}")
    logger.info(f"Saved {len(draft_data.selected_account_ids)} accounts")
    logger.info(f"Saved {len(draft_data.selected_user_ids)} users") 
    logger.info(f"Saved {len(draft_data.selected_contact_list_ids)} contact lists")

    return schemas.DraftCampaignResponse(
        id=new_draft_campaign.id,
        name=new_draft_campaign.name,
        subject=new_draft_campaign.subject,
        from_name=new_draft_campaign.from_name,
        created_at=new_draft_campaign.created_at,
        total_drafts=0,
        drafts_by_user={},
        status='draft',
        recipients_count=0,
        users_count=len(draft_data.selected_user_ids),
        emails_per_user=draft_data.emails_per_user,
        # Content fields
        body_html=new_draft_campaign.body_html,
        use_custom_headers=new_draft_campaign.use_custom_headers,
        custom_headers=new_draft_campaign.custom_headers,
        body_format=new_draft_campaign.body_format,
        body_template=new_draft_campaign.body_template,
        # Test fields
        test_after_email=new_draft_campaign.test_after_email,
        test_after_count=new_draft_campaign.test_after_count or 0
    )

@router.get("/drafts", response_model=List[schemas.DraftCampaignResponse])
def get_draft_campaigns(db: Session = Depends(get_db)):
    """
    Get all draft campaigns with their associations.
    """
    draft_campaigns = db.query(models.DraftCampaign).options(
        joinedload(models.DraftCampaign.selected_accounts).joinedload(models.DraftCampaignAccount.service_account),
        joinedload(models.DraftCampaign.selected_users).joinedload(models.DraftCampaignUser.user),
        joinedload(models.DraftCampaign.selected_contacts).joinedload(models.DraftCampaignContact.contact_list),
        joinedload(models.DraftCampaign.gmail_drafts).joinedload(models.GmailDraft.user)
    ).all()
    
    # Load contacts separately to avoid complex joins
    for campaign in draft_campaigns:
        for contact_assoc in campaign.selected_contacts:
            if contact_assoc.contact_list:
                # Load contacts for this contact list
                contact_list = db.query(models.ContactList).options(
                    joinedload(models.ContactList.contacts)
                ).filter(models.ContactList.id == contact_assoc.contact_list.id).first()
                if contact_list:
                    contact_assoc.contact_list.contacts = contact_list.contacts
    
    response = []
    for campaign in draft_campaigns:
        total_drafts = len(campaign.gmail_drafts)
        drafts_by_user = {}
        for draft in campaign.gmail_drafts:
            if draft.user:
                user_email = draft.user.email
                drafts_by_user[user_email] = drafts_by_user.get(user_email, 0) + 1
        
        # Calculate recipients count from selected contact lists
        recipients_count = 0
        for contact_assoc in campaign.selected_contacts:
            if contact_assoc.contact_list:
                contacts_in_list = contact_assoc.contact_list.contacts or []
                recipients_count += len(contacts_in_list)
                logger.info(f"Contact list {contact_assoc.contact_list.name} has {len(contacts_in_list)} contacts")
        
        logger.info(f"Campaign {campaign.name}: {recipients_count} recipients, {len(campaign.selected_users)} users")
        logger.info(f"Selected contacts: {len(campaign.selected_contacts)}")
        logger.info(f"Selected users: {len(campaign.selected_users)}")
        for contact_assoc in campaign.selected_contacts:
            if contact_assoc.contact_list:
                logger.info(f"Contact list: {contact_assoc.contact_list.name}, contacts: {len(contact_assoc.contact_list.contacts or [])}")
            else:
                logger.info(f"Contact association has no contact_list")
        
        response.append(schemas.DraftCampaignResponse(
            id=campaign.id,
            name=campaign.name,
            subject=campaign.subject,
            from_name=campaign.from_name,
            created_at=campaign.created_at,
            total_drafts=total_drafts,
            drafts_by_user=drafts_by_user,
            status=campaign.status or DraftStatus.CREATED.value,
            recipients_count=recipients_count,
            users_count=len(campaign.selected_users),
            emails_per_user=campaign.emails_per_user or 0
        ))
    return response

@router.get("/drafts/{draft_id}", response_model=schemas.DraftCampaignResponse)
def get_draft_campaign(draft_id: int, db: Session = Depends(get_db)):
    """
    Get a specific draft campaign with its associations.
    """
    campaign = db.query(models.DraftCampaign).options(
        joinedload(models.DraftCampaign.selected_accounts).joinedload(models.DraftCampaignAccount.service_account),
        joinedload(models.DraftCampaign.selected_users).joinedload(models.DraftCampaignUser.user),
        joinedload(models.DraftCampaign.selected_contacts).joinedload(models.DraftCampaignContact.contact_list),
        joinedload(models.DraftCampaign.gmail_drafts).joinedload(models.GmailDraft.user)
    ).filter(models.DraftCampaign.id == draft_id).first()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Draft campaign not found")

    total_drafts = len(campaign.gmail_drafts)
    drafts_by_user = {}
    for draft in campaign.gmail_drafts:
        if draft.user:
            user_email = draft.user.email
            drafts_by_user[user_email] = drafts_by_user.get(user_email, 0) + 1

    # Calculate recipients count
    recipients_count = 0
    for contact_assoc in campaign.selected_contacts:
        if contact_assoc.contact_list:
            recipients_count += len(contact_assoc.contact_list.contacts)

    return schemas.DraftCampaignResponse(
        id=campaign.id,
        name=campaign.name,
        subject=campaign.subject,
        from_name=campaign.from_name,
        created_at=campaign.created_at,
        total_drafts=total_drafts,
        drafts_by_user=drafts_by_user,
        status=campaign.status or DraftStatus.CREATED.value,
        recipients_count=recipients_count,
        users_count=len(campaign.selected_users),
        emails_per_user=campaign.emails_per_user or 0,
        # Content fields
        body_html=campaign.body_html,
        use_custom_headers=campaign.use_custom_headers,
        custom_headers=campaign.custom_headers,
        body_format=campaign.body_format,
        body_template=campaign.body_template,
        # Test fields
        test_after_email=campaign.test_after_email,
        test_after_count=campaign.test_after_count or 0
    )

# Redundant get_draft_campaign removed (it was defined twice in original file)

@router.patch("/drafts/{draft_id}", response_model=schemas.DraftCampaignResponse)
def update_draft_campaign(draft_id: int, draft_data: schemas.DraftCampaignUpdate, db: Session = Depends(get_db)):
    """
    Update a draft campaign.
    """
    campaign = db.query(models.DraftCampaign).filter(models.DraftCampaign.id == draft_id).first()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Draft campaign not found")
    
    if draft_data.name is not None:
        campaign.name = draft_data.name
    if draft_data.subject is not None:
        campaign.subject = draft_data.subject
    if draft_data.from_name is not None:
        campaign.from_name = draft_data.from_name
    if draft_data.body_html is not None:
        campaign.body_html = draft_data.body_html
    if draft_data.use_custom_headers is not None:
        campaign.use_custom_headers = draft_data.use_custom_headers
    if draft_data.custom_headers is not None:
        campaign.custom_headers = draft_data.custom_headers
    if draft_data.body_format is not None:
        campaign.body_format = draft_data.body_format
    if draft_data.body_template is not None:
        campaign.body_template = draft_data.body_template
    if draft_data.test_after_email is not None:
        campaign.test_after_email = draft_data.test_after_email
    if draft_data.test_after_count is not None:
        campaign.test_after_count = draft_data.test_after_count
    
    db.commit()
    db.refresh(campaign)
    
    return schemas.DraftCampaignResponse(
        id=campaign.id,
        name=campaign.name,
        subject=campaign.subject,
        from_name=campaign.from_name,
        created_at=campaign.created_at,
        total_drafts=0,
        drafts_by_user={},
        status=campaign.status or DraftStatus.CREATED.value,
        recipients_count=0,
        users_count=0,
        emails_per_user=campaign.emails_per_user or 0,
        # Content fields
        body_html=campaign.body_html,
        use_custom_headers=campaign.use_custom_headers,
        custom_headers=campaign.custom_headers,
        body_format=campaign.body_format,
        body_template=campaign.body_template,
        # Test fields
        test_after_email=campaign.test_after_email,
        test_after_count=campaign.test_after_count or 0
    )

@router.delete("/drafts/{draft_id}")
def delete_draft_campaign(draft_id: int, db: Session = Depends(get_db)):
    """
    Delete a draft campaign and all associated data.
    """
    campaign = db.query(models.DraftCampaign).filter(models.DraftCampaign.id == draft_id).first()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Draft campaign not found")

    try:
        # Manual Cascade Deletion (Enterprise Reliability)
        # 1. Delete associations
        from sqlalchemy import text
        db.execute(text("DELETE FROM draft_campaign_accounts WHERE draft_campaign_id = :id"), {"id": draft_id})
        db.execute(text("DELETE FROM draft_campaign_users WHERE draft_campaign_id = :id"), {"id": draft_id})
        db.execute(text("DELETE FROM draft_campaign_contacts WHERE draft_campaign_id = :id"), {"id": draft_id})
        
        # 2. Delete generated drafts
        db.execute(text("DELETE FROM gmail_drafts WHERE draft_campaign_id = :id"), {"id": draft_id})
        
        # 3. Delete the campaign itself
        db.delete(campaign)
        db.commit()
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        if hasattr(e, 'orig') and hasattr(e.orig, 'pgerror'):
            error_msg += f" | DB Error: {e.orig.pgerror}"
        logger.error(f"Failed to delete draft campaign {draft_id}: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Failed to delete draft: {error_msg}")
    
    return {"detail": f"Draft campaign '{campaign.name}' and all its associated data have been deleted."}

@router.post("/drafts/{draft_id}/upload", response_model=schemas.DraftUploadResponse)
def upload_drafts_to_users(draft_id: int, db: Session = Depends(get_db)):
    """
    Upload draft messages to selected users via Google Cloud API.
    """
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"UPLOAD FUNCTION CALLED: Starting upload for draft {draft_id}")
    
    campaign = db.query(models.DraftCampaign).options(
        joinedload(models.DraftCampaign.selected_users).joinedload(models.DraftCampaignUser.user),
        joinedload(models.DraftCampaign.selected_contacts).joinedload(models.DraftCampaignContact.contact_list)
    ).filter(models.DraftCampaign.id == draft_id).first()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Draft campaign not found")
    
    logger.info(f"Campaign found: {campaign.name}")
    logger.info(f"Number of selected_users associations: {len(campaign.selected_users)}")
    
    if not campaign.selected_users:
        raise HTTPException(status_code=400, detail="No users selected for this campaign")
    
    if not campaign.selected_contacts:
        raise HTTPException(status_code=400, detail="No contact lists selected for this campaign")
    
    # Load contacts for each contact list
    for contact_assoc in campaign.selected_contacts:
        if contact_assoc.contact_list:
            contact_list = db.query(models.ContactList).options(
                joinedload(models.ContactList.contacts)
            ).filter(models.ContactList.id == contact_assoc.contact_list.id).first()
            if contact_list:
                contact_assoc.contact_list.contacts = contact_list.contacts
    
    # Get all recipients from selected contact lists
    all_recipients = []
    for contact_assoc in campaign.selected_contacts:
        if contact_assoc.contact_list:
            contacts = contact_assoc.contact_list.contacts or []
            logger.info(f"Contact list '{contact_assoc.contact_list.name}' has {len(contacts)} contacts")
            all_recipients.extend([contact.email for contact in contacts])
    
    logger.info(f"Total recipients collected: {len(all_recipients)}")
    
    if not all_recipients:
        raise HTTPException(status_code=400, detail="No recipients found in selected contact lists")
    
    # Get all users from selected users
    users = [assoc.user for assoc in campaign.selected_users if assoc.user]
    logger.info(f"Total users to process: {len(users)}")
    for i, user in enumerate(users):
        logger.info(f"User {i+1}: {user.email} (ID: {user.id})")
    
    if not users:
        raise HTTPException(status_code=400, detail="No valid users found in selection")
    
    # Calculate recipients per user
    recipients_per_user = math.ceil(len(all_recipients) / len(users))
    logger.info(f"Recipients per user: {recipients_per_user}")

    # Transition to UPLOADING state
    transition_draft_status(
        db, 
        campaign.id, 
        DraftStatus.UPLOADING, 
        triggered_by="api:upload_drafts"
    )
    
    # Create Gmail drafts for each user
    total_drafts_created = 0
    failed_users = []
    successful_users = []
    
    # Make a copy of recipients list for distribution
    remaining_recipients = all_recipients.copy()
    
    # Worker function to process one user's drafts
    def process_user_drafts(user_index, user):
        """Process draft creation for a single user (runs in parallel)"""
        # Create a new DB session for this thread
        from app.database import SessionLocal
        thread_db = SessionLocal()
        
        try:
            print(f"DEBUG: Processing user {user_index + 1}/{len(users)}: {user.email}")
            logger.info(f"Processing user {user_index + 1}/{len(users)}: {user.email}")
            
            # ALL users should get ALL recipients (shared distribution)
            user_recipients = all_recipients
            
            print(f"DEBUG: User {user.email} assigned {len(user_recipients)} recipients")
            logger.info(f"Assigned {len(user_recipients)} recipients to user {user.email}")
            
            user_drafts_created = 0
            user_failed = []
            
            # Re-attach user to this thread's session
            thread_user = thread_db.merge(user)
            
            for i in range(campaign.emails_per_user):
                print(f"DEBUG: Creating draft {i+1} for user {thread_user.email}")
                logger.info(f"Creating draft {i+1}/{campaign.emails_per_user} for user {thread_user.email}")
                try:
                    gmail_draft_id = create_gmail_draft(
                        user_id=thread_user.id,
                        subject=campaign.subject,
                        from_name=campaign.from_name,
                        body_html=campaign.body_html,
                        recipients=user_recipients,
                        db=thread_db,  # Use thread-local DB
                        use_custom_headers=campaign.use_custom_headers,
                        custom_headers=campaign.custom_headers,
                        campaign_id=campaign.id  # Pass campaign ID for tracking
                    )
                    
                    # Save draft to database
                    draft = models.GmailDraft(
                        draft_campaign_id=campaign.id,
                        user_id=thread_user.id,
                        gmail_draft_id=gmail_draft_id,
                        status='created',
                        recipients=user_recipients
                    )
                    thread_db.add(draft)
                    thread_db.commit() # Commit immediately in thread
                    
                    user_drafts_created += 1
                    logger.info(f"Successfully created draft for user {thread_user.email}")

                    # Test After X Automation
                    if campaign.test_after_count > 0 and campaign.test_after_email:
                        if user_drafts_created % campaign.test_after_count == 0:
                            logger.info(f"TEST AUTOMATION: Creating test draft after {user_drafts_created} emails for {thread_user.email}")
                            try:
                                test_draft_id = create_gmail_draft(
                                    user_id=thread_user.id,
                                    subject=campaign.subject,
                                    from_name=campaign.from_name,
                                    body_html=campaign.body_html,
                                    recipients=[campaign.test_after_email],
                                    db=thread_db,
                                    use_custom_headers=campaign.use_custom_headers,
                                    custom_headers=campaign.custom_headers,
                                    campaign_id=campaign.id
                                )
                                # Save test draft to DB (marked as 'created')
                                test_draft = models.GmailDraft(
                                    draft_campaign_id=campaign.id,
                                    user_id=thread_user.id,
                                    gmail_draft_id=test_draft_id,
                                    status='created',
                                    recipients=[campaign.test_after_email]
                                )
                                thread_db.add(test_draft)
                                thread_db.commit()
                                logger.info(f"TEST AUTOMATION: Test draft created successfully")
                            except Exception as te:
                                logger.error(f"TEST AUTOMATION FAILED: {str(te)}")
                    
                except HTTPException as he:
                    msg = f"HTTPException for user {thread_user.email}: {he.detail}"
                    print(f"DEBUG: {msg}")
                    logger.error(msg)
                    user_failed.append({"email": thread_user.email, "error": he.detail})
                    thread_db.rollback()
                    continue
                except Exception as e:
                    msg = f"Failed to create draft for user {thread_user.email}: {str(e)}"
                    print(f"DEBUG: {msg}")
                    logger.error(msg)
                    import traceback
                    logger.error(f"Traceback: {traceback.format_exc()}")
                    user_failed.append({"email": thread_user.email, "error": str(e)})
                    thread_db.rollback()
                    continue
            
            return {
                "user_email": thread_user.email,
                "drafts_created": user_drafts_created,
                "failed": user_failed
            }
        finally:
            thread_db.close()
    
    # Process all users in parallel using ThreadPoolExecutor
    max_workers = min(50, len(users))  # Up to 50 concurrent workers
    logger.info(f"Starting parallel draft creation with {max_workers} workers")
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all user processing tasks
        futures = {executor.submit(process_user_drafts, idx, user): user for idx, user in enumerate(users)}
        
        # Collect results as they complete
        for future in as_completed(futures):
            user = futures[future]
            try:
                result = future.result()
                if result["drafts_created"] > 0:
                    successful_users.append(result["user_email"])
                    total_drafts_created += result["drafts_created"]
                    logger.info(f"Completed {result['drafts_created']} drafts for user {result['user_email']}")
                if result["failed"]:
                    failed_users.extend(result["failed"])
            except Exception as e:
                logger.error(f"Failed to process user {user.email}: {str(e)}")
                failed_users.append({"email": user.email, "error": str(e)})
    
    print(f"DEBUG: Finished processing all users. Total drafts: {total_drafts_created}")
    
    # Update campaign status based on success
    if total_drafts_created > 0:
        transition_draft_status(
            db, 
            campaign.id, 
            DraftStatus.READY, # Was UPLOADED
            triggered_by="api:upload_drafts"
        )
    else:
        # If ZERO drafts were created, do not set to READY.
        # This prevents "Launch" from appearing and trying to launch 0 drafts.
        # Capture the first error to show to the user
        error_detail = "Unknown error"
        if failed_users:
            # failed_users is a list of dicts: {'email': ..., 'error': ...}
            first_fail = failed_users[0]
            error_detail = f"Failed to create drafts. Error for {first_fail.get('email', 'user')}: {first_fail.get('error', 'Unknown')}"
        
        logger.error(f"Upload resulted in 0 drafts created. Setting status to FAILED. Detail: {error_detail}")
        transition_draft_status(
            db, 
            campaign.id, 
            DraftStatus.FAILED,
            triggered_by="api:upload_drafts_failed"
        )
        # Raise exception so frontend sees the error immediately
        raise HTTPException(status_code=400, detail=error_detail)
    
    logger.info(f"UPLOAD COMPLETE: Total drafts created: {total_drafts_created}")
    logger.info(f"Successful users: {successful_users}")
    logger.info(f"Failed users: {failed_users}")
    
    return schemas.DraftUploadResponse(
        success=True,
        message=f"Successfully uploaded {total_drafts_created} drafts to {len(successful_users)} users",
        total_drafts=total_drafts_created,
        users_count=len(successful_users),
        details={
            "recipients_count": len(all_recipients),
            "successful_users": successful_users,
            "failed_users": failed_users
        }
    )

def create_gmail_draft(user_id: int, subject: str, from_name: str, body_html: str, recipients: List[str], db: Session, use_custom_headers: bool = False, custom_headers: str = None, campaign_id: int = None) -> str:
    """
    Create a Gmail draft using Google Cloud API.
    """
    import logging
    import re
    from urllib.parse import quote
    logger = logging.getLogger(__name__)
    
    logger.info(f"REAL GMAIL API: Starting draft creation for user {user_id}")
    
    # ======== TRACKING REPLACEMENT (EXPLICIT / STATICAL) ========
    try:
        tracking_domain = db.query(models.TrackingDomain).filter(
            models.TrackingDomain.status == 'active'
            # No SSL check here to match previous fix
        ).first()
        
        if tracking_domain:
            logger.info(f"🔍 Found active tracking domain: {tracking_domain.domain}")
            
            # 1. Replace tracking pixel
            if '[tracking_pixel]' in body_html:
                # Use explicit pixel endpoint with campaign ID
                pixel_params = f"?c={campaign_id}" if campaign_id else ""
                pixel_url = f"https://{tracking_domain.domain}/t/pixel.gif{pixel_params}"
                body_html = body_html.replace('[tracking_pixel]', pixel_url)
                logger.info(f"✅ REPLACED [tracking_pixel] with {pixel_url}")
            
            # 2. Replace tracking links: [tracking_link]URL[/tracking_link]
            pattern = r'\[tracking_link\](https?://[^\[]+)\[/tracking_link\]'
            matches = re.findall(pattern, body_html)
            if matches:
                logger.info(f"🔗 Found {len(matches)} tracking link placeholders")
                for original_url in matches:
                    encoded_url = quote(original_url)
                    tracking_params = f"?url={encoded_url}"
                    if campaign_id:
                        tracking_params += f"&c={campaign_id}"
                        
                    tracking_url = f"https://{tracking_domain.domain}/t/redirect{tracking_params}"
                    body_html = body_html.replace(f'[tracking_link]{original_url}[/tracking_link]', tracking_url)
                    logger.info(f"✅ REPLACED link: {original_url[:50]}...")
        else:
            logger.warning("⚠️ NO ACTIVE TRACKING DOMAIN FOUND - Placeholders will NOT be replaced!")
    except Exception as e:
        logger.error(f"❌ Tracking replacement failed: {e}")
    # ============================================================
        
        # Get delegated credentials for the user
        from app.config import settings
        credentials = google_service.get_delegated_credentials(
            user.email, 
            settings.GMAIL_SCOPES
        )
        
        logger.info(f"Delegated credentials created for {user.email}")
        
        # Build Gmail service
        from googleapiclient.discovery import build
        gmail_service = build('gmail', 'v1', credentials=credentials)
        
        logger.info("Gmail service built successfully")
        
        # Create the email message
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        from email.message import Message
        import base64
        
        message = None
        recipient_email = recipients[0] if recipients else ""
        
        logger.info(f"CUSTOM HEADERS DEBUG - use_custom_headers: {use_custom_headers}")
        
        # Process custom headers if enabled
        if use_custom_headers and custom_headers:
            from app.template_engine import TemplateEngine
            logger.info("CUSTOM HEADERS DEBUG - Processing custom headers with smart MIME handling")
            
            # Prepare context for template engine
            context = {
                'smtp': user.email,
                'from': from_name or '',
                'subject': subject or '',
                'to': recipient_email,
                'domain': user.email.split('@')[1] if '@' in user.email else 'localhost'
            }
            
            # Process custom headers with template engine
            processed_headers = TemplateEngine.process_template(custom_headers, context)
            
            # Parse headers
            # Handle both literal \n (from textarea) and actual newlines
            raw_headers = processed_headers.replace('\\n', '\n').replace('\r\n', '\n')
            header_lines = [line.strip() for line in raw_headers.split('\n') if line.strip()]
            
            parsed_headers = []
            for line in header_lines:
                if ':' in line:
                    k, v = line.split(':', 1)
                    parsed_headers.append((k.strip(), v.strip()))
            
            # Determine MIME Strategy
            content_type_val = next((v for k, v in parsed_headers if k.lower() == 'content-type'), None)
            logger.info(f"CUSTOM HEADERS DEBUG - Detected Content-Type: {content_type_val}")
            
            if content_type_val:
                if 'multipart' in content_type_val.lower():
                     # User-defined multipart (raw structure in body)
                     logger.info("Using raw Message() for multipart")
                     message = Message()
                     message.set_payload(body_html)
                else:
                     # User-defined text/* (auto-encode body)
                     subtype = 'html' if 'html' in content_type_val.lower() else 'plain'
                     logger.info(f"Using MIMEText for text/{subtype}")
                     message = MIMEText(body_html, subtype)
            else:
                # Default fallback
                logger.info("Fallback to MIMEText('html')")
                message = MIMEText(body_html, 'html')

            # Apply Headers
            headers_applied = 0
            for k, v in parsed_headers:
                if not v: continue
                # Remove default header if exists (e.g. from MIMEText init)
                if k in message: del message[k]
                
                # SPECIAL SAFETY CHECK: Ensure no newlines in value (prevent "embedded header" error)
                safe_value = v.replace('\n', ' ').replace('\r', ' ')
                message[k] = safe_value
                headers_applied += 1
                
            if 'To' not in message and recipient_email:
                message['To'] = recipient_email
                
            logger.info(f"CUSTOM HEADERS DEBUG - Applied {headers_applied} custom headers")
            
        else:
            logger.info("Using standard MIMEMultipart logic")
            # Create multipart message
            message = MIMEMultipart('alternative')
            message['To'] = ', '.join(recipients)
            message['From'] = f"{from_name} <{user.email}>" if from_name else user.email
            message['Subject'] = subject
            
            # Add HTML body
            html_part = MIMEText(body_html, 'html')
            message.attach(html_part)
        
        # Encode message
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        
        # Create draft
        draft_body = {
            'message': {
                'raw': raw_message
            }
        }
        
        logger.info(f"Creating Gmail draft for user {user.email} with {len(recipients)} recipients")
        logger.info(f"Recipients: {recipients}")
        logger.info(f"Subject: {subject}")
        
        result = gmail_service.users().drafts().create(
            userId='me',
            body=draft_body
        ).execute()
        
        draft_id = result['id']
        logger.info(f"Gmail draft created successfully: {draft_id}")
        logger.info(f"REAL GMAIL API: Draft creation completed for user {user.email}")
        return draft_id
        
    except Exception as e:
        logger.error(f"REAL GMAIL API ERROR: Failed to create Gmail draft: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to create Gmail draft: {str(e)}")

@router.post("/drafts/{draft_id}/launch")
def launch_drafts(draft_id: int, db: Session = Depends(get_db)):
    """
    Launch (send) all drafts for a specific campaign using Gmail API.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    campaign = db.query(models.DraftCampaign).filter(models.DraftCampaign.id == draft_id).first()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Draft campaign not found")
    
    # Get all drafts for this campaign
    drafts = db.query(models.GmailDraft).filter(models.GmailDraft.draft_campaign_id == draft_id).all()
    
    if not drafts:
        raise HTTPException(status_code=400, detail="No drafts found for this campaign")
    
    total_launched = 0
    total_failed = 0
    details = []
    
    # Group drafts by user for efficient API calls
    drafts_by_user = {}
    for draft in drafts:
        if draft.user_id not in drafts_by_user:
            drafts_by_user[draft.user_id] = []
        drafts_by_user[draft.user_id].append(draft)
    
    # Send drafts for each user
    for user_id, user_drafts in drafts_by_user.items():
        try:
            # Get user and service account
            user = db.query(models.WorkspaceUser).filter(models.WorkspaceUser.id == user_id).first()
            if not user:
                logger.error(f"User with ID {user_id} not found")
                continue
                
            service_account = user.service_account
            if not service_account:
                logger.error(f"No service account found for user {user.email}")
                continue
            
            # Decrypt service account credentials
            from app.encryption import EncryptionService
            encryption_service = EncryptionService()
            service_account_json = encryption_service.decrypt(service_account.encrypted_json)
            
            # Initialize Google Workspace Service
            from app.google_api import GoogleWorkspaceService
            google_service = GoogleWorkspaceService(service_account_json)
            
            # Get delegated credentials for the user
            from app.config import settings
            credentials = google_service.get_delegated_credentials(
                user.email, 
                settings.GMAIL_SCOPES
            )
            
            # Build Gmail service
            from googleapiclient.discovery import build
            gmail_service = build('gmail', 'v1', credentials=credentials)
            
            logger.info(f"🚀 Launching {len(user_drafts)} drafts for user {user.email}")
            
            # Send each draft
            for draft in user_drafts:
                try:
                    # Send the draft
                    result = gmail_service.users().drafts().send(
                        userId='me',
                        body={'id': draft.gmail_draft_id}
                    ).execute()
                    
                    # Update draft status
                    draft.status = 'sent'
                    draft.sent_at = datetime.utcnow()
                    draft.gmail_message_id = result.get('id')
                    
                    total_launched += 1
                    details.append({
                        "draft_id": str(draft.id),
                        "gmail_draft_id": draft.gmail_draft_id,
                        "user_email": user.email,
                        "status": "sent",
                        "message_id": result.get('id')
                    })
                    
                    logger.info(f"✅ Draft {draft.id} sent successfully for user {user.email}")
                    
                except Exception as e:
                    logger.error(f"❌ Failed to send draft {draft.id} for user {user.email}: {str(e)}")
                    draft.status = 'failed'
                    total_failed += 1
                    details.append({
                        "draft_id": str(draft.id),
                        "gmail_draft_id": draft.gmail_draft_id,
                        "user_email": user.email,
                        "status": "failed",
                        "error": str(e)
                    })
        
        except Exception as e:
            logger.error(f"❌ Failed to process drafts for user {user_id}: {str(e)}")
            # Mark all drafts for this user as failed
            for draft in user_drafts:
                draft.status = 'failed'
                total_failed += 1
                details.append({
                    "draft_id": str(draft.id),
                    "gmail_draft_id": draft.gmail_draft_id,
                    "user_email": user.email if 'user' in locals() else f"user_{user_id}",
                    "status": "failed",
                    "error": str(e)
                })
    
    # Update campaign status
    transition_draft_status(
        db,
        campaign.id,
        DraftStatus.SENDING, # Was LAUNCHED
        triggered_by="api:launch_drafts"
    )
    
    logger.info(f"🎯 Launch completed: {total_launched} sent, {total_failed} failed")
    
    return {
        "total_launched": total_launched,
        "total_failed": total_failed,
        "details": details
    }

@router.post("/drafts/launch", response_model=schemas.DraftLaunchResponse)
def launch_all_drafts(db: Session = Depends(get_db)):
    """
    Launch all uploaded drafts across all campaigns.
    """
    # 1. Fetch all drafts that are in 'created' status (meaning uploaded to Gmail but not sent)
    drafts_to_launch = db.query(models.GmailDraft).filter(models.GmailDraft.status == 'created').all()
    
    if not drafts_to_launch:
        return {
            "total_launched": 0,
            "total_failed": 0,
            "details": []
        }

    total_launched = 0
    total_failed = 0
    details = []

    # 2. Group drafts by user_id to avoid initializing Google Service repeatedly
    drafts_by_user = {}
    for draft in drafts_to_launch:
        if draft.user_id not in drafts_by_user:
            drafts_by_user[draft.user_id] = []
        drafts_by_user[draft.user_id].append(draft)

    # 3. Iterate through each user and their drafts
    for user_id, user_drafts in drafts_by_user.items():
        try:
            # Get user and service account
            user = db.query(models.WorkspaceUser).filter(models.WorkspaceUser.id == user_id).first()
            if not user:
                logger.error(f"User with ID {user_id} not found")
                continue
                
            service_account = user.service_account
            if not service_account:
                logger.error(f"No service account found for user {user.email}")
                continue
            
            # Decrypt service account credentials
            from app.encryption import EncryptionService
            encryption_service = EncryptionService()
            service_account_json = encryption_service.decrypt(service_account.encrypted_json)
            
            # Initialize Google Workspace Service
            from app.google_api import GoogleWorkspaceService
            google_service = GoogleWorkspaceService(service_account_json)
            
            # Get delegated credentials for the user
            from app.config import settings
            credentials = google_service.get_delegated_credentials(
                user.email, 
                settings.GMAIL_SCOPES
            )
            
            # Build Gmail service
            from googleapiclient.discovery import build
            gmail_service = build('gmail', 'v1', credentials=credentials)
            
            logger.info(f"🚀 Launching {len(user_drafts)} drafts for user {user.email}")
            
            # Send each draft
            for draft in user_drafts:
                try:
                    # Send the draft
                    result = gmail_service.users().drafts().send(
                        userId='me',
                        body={'id': draft.gmail_draft_id}
                    ).execute()
                    
                    # Update draft status
                    draft.status = 'sent'
                    draft.sent_at = datetime.utcnow()
                    draft.gmail_message_id = result.get('id')
                    
                    total_launched += 1
                    details.append({
                        "draft_id": str(draft.id),
                        "gmail_draft_id": draft.gmail_draft_id,
                        "user_email": user.email,
                        "status": "sent",
                        "message_id": result.get('id')
                    })
                    
                    # Log success
                    logger.info(f"✅ Draft {draft.id} sent successfully for user {user.email}")
                    
                except Exception as e:
                    logger.error(f"❌ Failed to send draft {draft.id} for user {user.email}: {str(e)}")
                    draft.status = 'failed'
                    total_failed += 1
                    details.append({
                        "draft_id": str(draft.id),
                        "gmail_draft_id": draft.gmail_draft_id,
                        "user_email": user.email,
                        "status": "failed",
                        "error": str(e)
                    })
        
        except Exception as e:
            logger.error(f"❌ Failed to process drafts for user {user_id}: {str(e)}")
            # Mark all drafts for this user as failed
            for draft in user_drafts:
                draft.status = 'failed'
                total_failed += 1
                details.append({
                    "draft_id": str(draft.id),
                    "gmail_draft_id": draft.gmail_draft_id,
                    "user_email": user.email if 'user' in locals() else f"user_{user_id}",
                    "status": "failed",
                    "error": str(e)
                })

    # 4. Commit all changes to DB
    try:
        db.commit()
    except Exception as e:
        logger.error(f"Failed to commit transaction: {e}")
        db.rollback()

    logger.info(f"🎯 Launch All completed: {total_launched} sent, {total_failed} failed")

    return schemas.DraftLaunchResponse(
        total_launched=total_launched,
        total_failed=total_failed,
        details=details
    )


@router.post("/drafts/{draft_id}/duplicate")
def duplicate_draft_campaign(draft_id: int, db: Session = Depends(get_db)):
    """
    Duplicate a draft campaign with all its associations (users, accounts, contacts).
    This is a SERVER-SIDE duplication that copies everything.
    """
    # Get original campaign with all associations
    original = db.query(models.DraftCampaign).options(
        joinedload(models.DraftCampaign.selected_accounts),
        joinedload(models.DraftCampaign.selected_users),
        joinedload(models.DraftCampaign.selected_contacts)
    ).filter(models.DraftCampaign.id == draft_id).first()
    
    if not original:
        raise HTTPException(status_code=404, detail="Draft campaign not found")
    
    # Create new campaign with copied content
    new_campaign = models.DraftCampaign(
        name=f"{original.name} (Copy)",
        from_name=original.from_name,
        subject=original.subject,
        body_html=original.body_html,
        status=DraftStatus.CREATED,
        emails_per_user=original.emails_per_user,
        test_after_email=original.test_after_email,
        test_after_count=original.test_after_count,
        use_custom_headers=original.use_custom_headers,
        custom_headers=original.custom_headers,
        body_format=original.body_format,
        body_template=original.body_template
    )
    db.add(new_campaign)
    db.flush()  # Get ID
    
    # Copy account associations
    for assoc in original.selected_accounts:
        new_assoc = models.DraftCampaignAccount(
            draft_campaign_id=new_campaign.id,
            service_account_id=assoc.service_account_id
        )
        db.add(new_assoc)
    
    # Copy user associations
    for assoc in original.selected_users:
        new_assoc = models.DraftCampaignUser(
            draft_campaign_id=new_campaign.id,
            user_id=assoc.user_id
        )
        db.add(new_assoc)
    
    # Copy contact list associations
    for assoc in original.selected_contacts:
        new_assoc = models.DraftCampaignContact(
            draft_campaign_id=new_campaign.id,
            contact_list_id=assoc.contact_list_id
        )
        db.add(new_assoc)
    
    db.commit()
    db.refresh(new_campaign)
    
    logger.info(f"Duplicated campaign {draft_id} -> {new_campaign.id}")
    logger.info(f"Copied {len(original.selected_accounts)} accounts, {len(original.selected_users)} users, {len(original.selected_contacts)} contacts")
    
    # Return full response
    return schemas.DraftCampaignResponse(
        id=new_campaign.id,
        name=new_campaign.name,
        subject=new_campaign.subject,
        from_name=new_campaign.from_name,
        created_at=new_campaign.created_at,
        total_drafts=0,
        drafts_by_user={},
        status=new_campaign.status or DraftStatus.CREATED.value,
        recipients_count=0,
        users_count=len(original.selected_users),
        emails_per_user=new_campaign.emails_per_user or 0,
        body_html=new_campaign.body_html,
        use_custom_headers=new_campaign.use_custom_headers,
        custom_headers=new_campaign.custom_headers,
        body_format=new_campaign.body_format,
        body_template=new_campaign.body_template,
        test_after_email=new_campaign.test_after_email,
        test_after_count=new_campaign.test_after_count or 0
    )


class DraftTestRequest(BaseModel):
    recipient: str
    sender_user_id: int
    save_recipient: bool = True

@router.post("/drafts/{draft_id}/test-send")
def send_test_draft(
    draft_id: int, 
    request: DraftTestRequest, 
    db: Session = Depends(get_db)
):
    """
    Send a test email for a draft campaign using a specific sender and recipient.
    Also saves the recipient to the campaign's saved list.
    """
    # 1. Get Campaign
    campaign = db.query(models.DraftCampaign).filter(models.DraftCampaign.id == draft_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Draft campaign not found")
        
    # 2. Get User/Sender
    user = db.query(models.WorkspaceUser).filter(models.WorkspaceUser.id == request.sender_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Sender user not found")
        
    # 3. Save recipient if requested
    if request.save_recipient:
        current_saved = campaign.saved_test_recipients or []
        if request.recipient not in current_saved:
            # Create new list to ensure change tracking
            updated_list = list(current_saved)
            updated_list.append(request.recipient)
            campaign.saved_test_recipients = updated_list
            db.add(campaign)
            db.commit() # Commit the saved recipient
            
    try:
        # 4. Prepare Email Content (Render Template)
        # We use the same rendering logic as actual campaigns
        template_body = campaign.body_html
        subject = campaign.subject
        from_name = campaign.from_name
        
        # Simple tag replacement (same as in create_gmail_draft usually)
        rendered_body = template_body.replace("[First Name]", "Test User").replace("[Email]", request.recipient)
        
        # 5. Send via Gmail API
        service_account = user.service_account
        if not service_account:
            raise HTTPException(status_code=400, detail="User has no service account")
            
        from app.encryption import EncryptionService
        from app.google_api import GoogleWorkspaceService
        from app.config import settings
        from googleapiclient.discovery import build
        import base64
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        
        encryption_service = EncryptionService()
        service_account_json = encryption_service.decrypt(service_account.encrypted_json)
        google_service = GoogleWorkspaceService(service_account_json)
        credentials = google_service.get_delegated_credentials(user.email, settings.GMAIL_SCOPES)
        gmail_service = build('gmail', 'v1', credentials=credentials)
        
        # Create MIME Message
        message = MIMEMultipart()
        message['to'] = request.recipient
        message['subject'] = subject
        
        # Handle From header
        if from_name:
            message['from'] = f"{from_name} <{user.email}>"
        else:
            message['from'] = user.email
            
        # Add Custom Headers if enabled
        if campaign.use_custom_headers and campaign.custom_headers:
            # Parse custom headers (simple line-by-line)
            for line in campaign.custom_headers.split('\\n'):
                if ':' in line:
                    key, value = line.split(':', 1)
                    # Don't overwrite essential headers unless intentional
                    if key.lower().strip() not in ['to', 'from', 'subject']:
                        message[key.strip()] = value.strip()

        # Attach Body
        msg = MIMEText(rendered_body, 'html')
        message.attach(msg)
        
        # Encode
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
        
        # Send
        sent_message = gmail_service.users().messages().send(
            userId='me',
            body={'raw': raw_message}
        ).execute()
        
        logger.info(f"✅ Test email sent to {request.recipient} via {user.email}")
        
        return {
            "success": True,
            "message": f"Test email sent to {request.recipient}",
            "message_id": sent_message.get('id')
        }
        
    except Exception as e:
        logger.error(f"❌ Test send failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send test email: {str(e)}")


class DraftPreviewTestRequest(DraftTestRequest):
    subject: str
    body_html: str
    from_name: Optional[str] = None
    use_custom_headers: bool = False
    custom_headers: Optional[str] = None

@router.post("/drafts/test-preview")
def send_draft_preview_test(
    request: DraftPreviewTestRequest, 
    db: Session = Depends(get_db)
):
    """
    Send a test email for a draft that hasn't been saved yet (Preview Mode).
    Takes content from request body.
    """
    # 1. Get User/Sender
    user = db.query(models.WorkspaceUser).filter(models.WorkspaceUser.id == request.sender_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Sender user not found")
            
    try:
        # 2. Prepare Email Content
        template_body = request.body_html
        subject = request.subject
        from_name = request.from_name
        
        # Simple tag replacement
        rendered_body = template_body.replace("[First Name]", "Test User").replace("[Email]", request.recipient)
        
        # 3. Send via Gmail API
        service_account = user.service_account
        if not service_account:
            raise HTTPException(status_code=400, detail="User has no service account")
            
        from app.encryption import EncryptionService
        from app.google_api import GoogleWorkspaceService
        from app.config import settings
        from googleapiclient.discovery import build
        import base64
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        
        encryption_service = EncryptionService()
        service_account_json = encryption_service.decrypt(service_account.encrypted_json)
        google_service = GoogleWorkspaceService(service_account_json)
        credentials = google_service.get_delegated_credentials(user.email, settings.GMAIL_SCOPES)
        gmail_service = build('gmail', 'v1', credentials=credentials)
        
        # Create MIME Message
        message = MIMEMultipart()
        
        # Parse custom headers first to check for From/Subject overrides
        custom_from = None
        custom_subject = None
        other_custom_headers = []
        
        if request.use_custom_headers and request.custom_headers:
            # Process custom headers with template engine for tag replacement
            from app.template_engine import TemplateEngine
            context = {
                'smtp': user.email,
                'from': from_name or '',
                'subject': subject or '',
                'to': request.recipient,
                'domain': user.email.split('@')[1] if '@' in user.email else 'localhost'
            }
            processed_custom_headers = TemplateEngine.process_template(request.custom_headers, context)
            
            for line in processed_custom_headers.split('\n'):
                line = line.strip()
                if line and ':' in line:
                    key, value = line.split(':', 1)
                    key = key.strip()
                    value = value.strip()
                    
                    # Check for From/Subject overrides
                    if key.lower() == 'from':
                        custom_from = value
                    elif key.lower() == 'subject':
                        custom_subject = value
                    elif key.lower() != 'to':  # Don't override To
                        other_custom_headers.append((key, value))
        
        # Set headers - use custom if provided, otherwise use defaults
        message['to'] = request.recipient
        
        if custom_from:
            message['from'] = custom_from
        elif from_name:
            message['from'] = f"{from_name} <{user.email}>"
        else:
            message['from'] = user.email
        
        message['subject'] = custom_subject if custom_subject else subject
        
        # Add remaining custom headers
        for key, value in other_custom_headers:
            message[key] = value

        # Attach Body
        msg = MIMEText(rendered_body, 'html')
        message.attach(msg)
        
        # Encode
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
        
        # Send
        sent_message = gmail_service.users().messages().send(
            userId='me',
            body={'raw': raw_message}
        ).execute()
        
        logger.info(f"✅ Preview Test email sent to {request.recipient} via {user.email}")
        
        return {
            "success": True,
            "message": f"Test email sent to {request.recipient}",
            "message_id": sent_message.get('id')
        }
        
    except Exception as e:
        logger.error(f"❌ Preview Test send failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send test email: {str(e)}")