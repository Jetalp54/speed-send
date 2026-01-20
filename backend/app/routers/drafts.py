from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app import models, schemas
from app.database import get_db
from typing import List, Dict
import math
from datetime import datetime
import asyncio
from concurrent.futures import ThreadPoolExecutor, as_completed
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import logging

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
        status='draft',
        emails_per_user=draft_data.emails_per_user,
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
        emails_per_user=draft_data.emails_per_user
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
            status=campaign.status or 'draft',
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
        joinedload(models.DraftCampaign.selected_accounts).joinedload(models.DraftCampaignAccount.account),
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
        status=campaign.status or 'draft',
        recipients_count=recipients_count,
        users_count=len(campaign.selected_users),
        emails_per_user=campaign.emails_per_user or 0
    )

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
        status=campaign.status or 'draft',
        recipients_count=0,
        users_count=0,
        emails_per_user=campaign.emails_per_user or 0
    )

@router.delete("/drafts/{draft_id}")
def delete_draft_campaign(draft_id: int, db: Session = Depends(get_db)):
    """
    Delete a draft campaign and all associated data.
    """
    campaign = db.query(models.DraftCampaign).filter(models.DraftCampaign.id == draft_id).first()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Draft campaign not found")

    db.delete(campaign)
    db.commit()
    
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
    
    # Create Gmail drafts for each user
    total_drafts_created = 0
    failed_users = []
    successful_users = []
    
    # Make a copy of recipients list for distribution
    remaining_recipients = all_recipients.copy()
    
    # Worker function to process one user's drafts
    def process_user_drafts(user_index, user):
        """Process draft creation for a single user (runs in parallel)"""
        print(f"DEBUG: Processing user {user_index + 1}/{len(users)}: {user.email}")
        logger.info(f"Processing user {user_index + 1}/{len(users)}: {user.email}")
        
        # ALL users should get ALL recipients (shared distribution)
        user_recipients = all_recipients
        
        print(f"DEBUG: User {user.email} assigned {len(user_recipients)} recipients")
        logger.info(f"Assigned {len(user_recipients)} recipients to user {user.email}")
        
        user_drafts_created = 0
        user_failed = []
        
        for i in range(campaign.emails_per_user):
            print(f"DEBUG: Creating draft {i+1} for user {user.email}")
            logger.info(f"Creating draft {i+1}/{campaign.emails_per_user} for user {user.email}")
            try:
                gmail_draft_id = create_gmail_draft(
                    user_id=user.id,
                    subject=campaign.subject,
                    from_name=campaign.from_name,
                    body_html=campaign.body_html,
                    recipients=user_recipients,
                    db=db,
                    use_custom_headers=campaign.use_custom_headers,
                    custom_headers=campaign.custom_headers
                )
                
                # Save draft to database
                draft = models.GmailDraft(
                    draft_campaign_id=campaign.id,
                    user_id=user.id,
                    gmail_draft_id=gmail_draft_id,
                    status='created',
                    recipients=user_recipients
                )
                db.add(draft)
                db.flush()
                
                user_drafts_created += 1
                print(f"DEBUG: SUCCESS creating draft for {user.email}")
                logger.info(f"Successfully created draft for user {user.email}")
                
            except HTTPException as he:
                print(f"DEBUG: HTTPException for {user.email}: {he.detail}")
                logger.error(f"HTTPException for user {user.email}: {he.detail}")
                user_failed.append({"email": user.email, "error": he.detail})
                continue
            except Exception as e:
                print(f"DEBUG: EXCEPTION for {user.email}: {str(e)}")
                import traceback
                traceback.print_exc()
                logger.error(f"Failed to create draft for user {user.email}: {str(e)}")
                logger.error(f"Traceback: {traceback.format_exc()}")
                user_failed.append({"email": user.email, "error": str(e)})
                continue
        
        return {
            "user_email": user.email,
            "drafts_created": user_drafts_created,
            "failed": user_failed
        }
    
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
    
    # Update campaign status
    campaign.status = 'uploaded'
    db.commit()
    
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

def create_gmail_draft(user_id: int, subject: str, from_name: str, body_html: str, recipients: List[str], db: Session, use_custom_headers: bool = False, custom_headers: str = None) -> str:
    """
    Create a Gmail draft using Google Cloud API.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"REAL GMAIL API: Starting draft creation for user {user_id}")
    
    try:
        # Get user and their service account
        user = db.query(models.WorkspaceUser).filter(models.WorkspaceUser.id == user_id).first()
        if not user:
            raise Exception(f"User with ID {user_id} not found")
        
        logger.info(f"Found user: {user.email}")
        
        service_account = user.service_account
        if not service_account:
            raise Exception(f"No service account found for user {user.email}")
        
        logger.info(f"Found service account: {service_account.client_email}")
        
        # Decrypt service account credentials
        from app.encryption import EncryptionService
        encryption_service = EncryptionService()
        service_account_json = encryption_service.decrypt(service_account.encrypted_json)
        
        logger.info("Service account credentials decrypted successfully")
        
        # Initialize Google Workspace Service
        from app.google_api import GoogleWorkspaceService
        google_service = GoogleWorkspaceService(service_account_json)
        
        logger.info("Google Workspace Service initialized")
        
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
        import base64
        
        # Create multipart message
        message = MIMEMultipart('alternative')
        
        logger.info(f"CUSTOM HEADERS DEBUG - use_custom_headers: {use_custom_headers}")
        logger.info(f"CUSTOM HEADERS DEBUG - custom_headers: {custom_headers}")
        
        # Process custom headers if enabled
        if use_custom_headers and custom_headers:
            from app.template_engine import TemplateEngine
            
            logger.info("CUSTOM HEADERS DEBUG - Processing custom headers")
            
            # Prepare context for template engine
            recipient_email = recipients[0] if recipients else ""
            context = {
                'smtp': user.email,
                'from': from_name or '',
                'subject': subject or '',
                'to': recipient_email,
                'domain': user.email.split('@')[1] if '@' in user.email else 'localhost'
            }
            
            logger.info(f"CUSTOM HEADERS DEBUG - Context: {context}")
            
            # Process custom headers with template engine
            processed_headers = TemplateEngine.process_template(custom_headers, context)
            
            logger.info(f"CUSTOM HEADERS DEBUG - Processed headers:\n{processed_headers}")
            
            # Parse and apply custom headers (ONLY if non-empty)
            headers_applied = 0
            for line in processed_headers.split('\n'):
                line = line.strip()
                if ':' in line:
                    key, value = line.split(':', 1)
                    key = key.strip()
                    value = value.strip()
                    
                    logger.info(f"CUSTOM HEADERS DEBUG - Parsing line: {key} = {value}")
                    
                    # Skip empty values
                    if not value:
                        logger.info(f"CUSTOM HEADERS DEBUG - Skipping empty value for: {key}")
                        continue
                    
                    # Apply header
                    logger.info(f"CUSTOM HEADERS DEBUG - Setting header: {key} = {value}")
                    if key.lower() in ['to', 'from', 'subject', 'date', 'message-id', 'reply-to', 'cc', 'bcc']:
                        message[key] = value
                        headers_applied += 1
                    else:
                        message[key] = value
                        headers_applied += 1
            
            logger.info(f"CUSTOM HEADERS DEBUG - Total headers applied: {headers_applied}")
            
            # Ensure To header is set
            if 'To' not in message:
                message['To'] = recipient_email
                logger.info(f"CUSTOM HEADERS DEBUG - Set default To header: {recipient_email}")
        else:
            logger.info("CUSTOM HEADERS DEBUG - Using standard headers (custom headers disabled or empty)")
            # Standard headers (no custom)
            message['To'] = ', '.join(recipients)
            message['From'] = f"{from_name} <{user.email}>" if from_name else user.email
            message['Subject'] = subject
        
        logger.info(f"CUSTOM HEADERS DEBUG - Final message headers: From={message.get('From')}, Subject={message.get('Subject')}, To={message.get('To')}")
        
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
    campaign.status = 'launched'
    
    db.commit()
    
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
    drafts_to_launch = db.query(models.GmailDraft).filter(models.GmailDraft.status == 'created').all()
    
    launched_count = 0
    failed_count = 0
    details = []

    for draft in drafts_to_launch:
        try:
            draft.status = 'sent'
            draft.sent_at = datetime.utcnow()
            launched_count += 1
            details.append({"draft_id": str(draft.id), "status": "sent"})
        except Exception as e:
            failed_count += 1
            details.append({"draft_id": str(draft.id), "status": "failed", "error": str(e)})

    db.commit()

    return schemas.DraftLaunchResponse(
        total_launched=launched_count,
        total_failed=failed_count,
        details=details
    )