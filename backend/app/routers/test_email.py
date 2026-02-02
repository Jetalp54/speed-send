from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models import ServiceAccount, WorkspaceUser
from app.google_api import GoogleWorkspaceService
from app.encryption import encryption_service
import logging

router = APIRouter(prefix="/test-email", tags=["test-email"])

class TestEmailRequest(BaseModel):
    recipient_email: str
    subject: str
    body_html: str
    body_plain: str
    from_name: str
    sender_account_id: int
    sender_user_id: Optional[int] = None

@router.post("")
async def send_test_email(
    request: TestEmailRequest,
    db: Session = Depends(get_db)
):
    """
    Send a direct test email without creating a campaign
    """
    logger = logging.getLogger(__name__)
    
    try:
        logger.info(f"🧪 DIRECT TEST EMAIL REQUEST: {request.recipient_email}")
        logger.info(f"📧 Subject: {request.subject}")
        logger.info(f"👤 From Name: {request.from_name}")
        logger.info(f"🔑 Sender Account ID: {request.sender_account_id}")
        
        # Get service account
        logger.info("🔍 Looking up service account...")
        service_account = db.query(ServiceAccount).filter(
            ServiceAccount.id == request.sender_account_id
        ).first()
        
        if not service_account:
            logger.error(f"❌ Service account not found: {request.sender_account_id}")
            raise HTTPException(status_code=404, detail="Service account not found")
        
        logger.info(f"✅ Found service account: {service_account.client_email}")
        
        # Get specific user if provided, otherwise get first active user
        if request.sender_user_id:
            logger.info(f"🔍 Looking up specific user: {request.sender_user_id}")
            user = db.query(WorkspaceUser).filter(
                WorkspaceUser.id == request.sender_user_id,
                WorkspaceUser.service_account_id == request.sender_account_id,
                WorkspaceUser.is_active == True
            ).first()
            
            if not user:
                logger.error(f"❌ Specific user not found or inactive: {request.sender_user_id}")
                raise HTTPException(status_code=404, detail="Specified user not found or inactive")
        else:
            logger.info("🔍 Looking up first active user...")
            user = db.query(WorkspaceUser).filter(
                WorkspaceUser.service_account_id == request.sender_account_id,
                WorkspaceUser.is_active == True
            ).first()
            
            if not user:
                logger.error(f"❌ No active users found for account: {request.sender_account_id}")
                raise HTTPException(status_code=404, detail="No active users found in this account. Please sync users first.")
        
        logger.info(f"✅ Found user: {user.email}")
        
        # Decrypt service account JSON
        logger.info("🔐 Decrypting service account JSON...")
        try:
            decrypted_json = encryption_service.decrypt(service_account.encrypted_json)
            logger.info("✅ Service account JSON decrypted successfully")
        except Exception as e:
            logger.error(f"❌ Failed to decrypt service account JSON: {e}")
            raise HTTPException(status_code=500, detail="Failed to decrypt service account credentials")
        
        # Create Google service
        logger.info("🌐 Creating Google Workspace service...")
        try:
            google_service = GoogleWorkspaceService(decrypted_json)
            logger.info("✅ Google Workspace service created")
        except Exception as e:
            logger.error(f"❌ Failed to create Google service: {e}")
            raise HTTPException(status_code=500, detail="Failed to initialize Google Workspace service")
        
        # Pre-check Gmail enabled for the user to avoid failedPrecondition
        if not google_service.is_gmail_enabled(user.email):
            logger.error("❌ Gmail service not enabled for this user")
            raise HTTPException(status_code=400, detail="Gmail service is not enabled for this user. Enable Gmail or choose another sender.")
        
        # Send email directly
        logger.info("📤 Sending test email...")
        try:
            # Check if we should use custom headers (for testing)
            # For now, use regular send_email for test endpoint
            
            # Hydrate body_html with test pixel param to avoid broken image
            # Although we won't get analytics for test emails (no campaign_id),
            # this prevents the "broken image" icon in the client.
            if request.body_html:
                import re
                # Fix Naked Pixel
                naked_pixel_pattern = r'(src=["\']https://[^"\']+/t/pixel\.png)(["\'])'
                # Use c=0 for test
                def add_test_param(match):
                    return f'{match.group(1)}?c=0{match.group(2)}'
                
                request.body_html = re.sub(naked_pixel_pattern, add_test_param, request.body_html)

            message_id = google_service.send_email(
                sender_email=user.email,
                recipient_email=request.recipient_email,
                subject=request.subject,
                body_html=request.body_html,
                body_plain=request.body_plain,
                from_name=request.from_name,
                custom_headers={},
                attachments=[]
            )
            
            logger.info(f"✅ TEST EMAIL SENT SUCCESSFULLY!")
            logger.info(f"📧 Message ID: {message_id}")
            logger.info(f"👤 Sender: {user.email}")
            logger.info(f"📬 Recipient: {request.recipient_email}")
            
            return {
                "message": "Test email sent successfully",
                "message_id": message_id,
                "sender_email": user.email,
                "recipient_email": request.recipient_email,
                "subject": request.subject
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to send email via Google API: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to send email via Google API: {str(e)}")
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"❌ UNEXPECTED ERROR in test email: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
