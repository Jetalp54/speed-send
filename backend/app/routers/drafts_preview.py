# DRAFT TEMPLATE PREVIEW & TEST ENDPOINTS

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models
from app.template_engine import TemplateEngine
from pydantic import BaseModel
from typing import Optional
import logging

logger = logging.getLogger(__name__)
router_preview = APIRouter()

class TemplatePreviewRequest(BaseModel):
    headers: Optional[str] = None
    body: Optional[str] = None
    sample_smtp: str = "user@example.com"
    sample_from: str = "John Doe"
    sample_subject: str = "Test Subject"
    sample_to: str = "recipient@example.com"

class TestEmailRequest(BaseModel):
    recipient: str  # Frontend sends 'recipient', not 'test_recipient'
    sender_user_id: Optional[int] = None  # Specific user to send from
    save_recipient: bool = False  # Whether to save this recipient to campaign
    use_custom_headers: bool = False
    custom_headers: Optional[str] = None
    body_template: Optional[str] = None
    from_name: Optional[str] = None
    subject: Optional[str] = None  # Optional - use campaign subject if not provided

@router_preview.post("/drafts/preview")
def preview_template(request: TemplatePreviewRequest):
    """
    Preview template with sample data.
    Shows how tags will be replaced in headers and body.
    """
    try:
        context = {
            'smtp': request.sample_smtp,
            'from': request.sample_from,
            'subject': request.sample_subject,
            'to': request.sample_to,
            'domain': request.sample_smtp.split('@')[1] if '@' in request.sample_smtp else 'localhost'
        }
        
        result = {}
        
        if request.headers:
            # Validate headers first
            is_valid, error = TemplateEngine.validate_template(request.headers)
            if not is_valid:
                raise HTTPException(status_code=400, detail=f"Headers validation error: {error}")
            
            result['headers'] = TemplateEngine.process_template(request.headers, context)
        
        if request.body:
            # Validate body
            is_valid, error = TemplateEngine.validate_template(request.body)
            if not is_valid:
                raise HTTPException(status_code=400, detail=f"Body validation error: {error}")
            
            result['body'] = TemplateEngine.process_template(request.body, context)
        
        return {
            "success": True,
            "preview": result,
            "note": "Random generation tags will produce different values each time"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Preview failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router_preview.post("/drafts/{draft_id}/test-send")
def send_test_email(draft_id: int, request: TestEmailRequest, db: Session = Depends(get_db)):
    """
    Send test email with template processing.
    Allows admin to test draft before uploading to all users.
    """
    from sqlalchemy.orm import joinedload
    
    try:
        # Get campaign
        campaign = db.query(models.DraftCampaign).options(
            joinedload(models.DraftCampaign.selected_users).joinedload(models.DraftCampaignUser.user)
        ).filter(models.DraftCampaign.id == draft_id).first()
        
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        
        # Get first user for testing (or specific user if sender_user_id provided)
        if not campaign.selected_users:
            raise HTTPException(status_code=400, detail="No users selected")
        
        # Find the requested user or use the first one
        test_user = None
        if request.sender_user_id:
            for user_assoc in campaign.selected_users:
                if user_assoc.user and user_assoc.user.id == request.sender_user_id:
                    test_user = user_assoc.user
                    break
            if not test_user:
                raise HTTPException(status_code=400, detail=f"User with ID {request.sender_user_id} not found in campaign")
        else:
            test_user = campaign.selected_users[0].user
            
        if not test_user:
            raise HTTPException(status_code=400, detail="User not found")
        
        # Setup context
        context = {
            'smtp': test_user.email,
            'from': request.from_name or campaign.from_name or "Test Sender",
            'subject': request.subject or campaign.subject,  # Use campaign subject if not provided
            'to': request.recipient,
            'domain': test_user.email.split('@')[1] if '@' in test_user.email else 'localhost'
        }
        
        # Process templates
        if request.use_custom_headers and request.custom_headers:
            processed_headers = TemplateEngine.process_template(request.custom_headers, context)
        else:
            processed_headers = TemplateEngine.process_template(TemplateEngine.get_default_headers(), context)
        
        processed_body = TemplateEngine.process_template(
            request.body_template or campaign.body_html or "",
            context
        )
        
        # Create and send draft
        from app.encryption import EncryptionService
        from app.google_api import GoogleWorkspaceService
        from app.config import settings
        from googleapiclient.discovery import build
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        import base64
        
        service_account = test_user.service_account
        if not service_account:
            raise HTTPException(status_code=400, detail="No service account")
        
        encryption_service = EncryptionService()
        service_account_json = encryption_service.decrypt(service_account.encrypted_json)
        google_service = GoogleWorkspaceService(service_account_json)
        credentials = google_service.get_delegated_credentials(test_user.email, settings.GMAIL_SCOPES)
        gmail_service = build('gmail', 'v1', credentials=credentials)
        
        # Create email message
        message = MIMEMultipart('alternative')
        message['To'] = request.recipient
        message['From'] = f"{context['from']} <{test_user.email}>"
        message['Subject'] = context['subject']
        
        # Add custom headers if enabled
        if request.use_custom_headers:
            # Parse custom headers and add to message
            for line in processed_headers.split('\n'):
                if ':' in line:
                    key, value = line.split(':', 1)
                    key = key.strip()
                    value = value.strip()
                    if key.lower() not in ['to', 'from', 'subject']:  # Don't override main headers
                        message[key] = value
        
        html_part = MIMEText(processed_body, 'html')
        message.attach(html_part)
        
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        
        # Send via Gmail (not as draft, as direct send)
        result = gmail_service.users().messages().send(
            userId='me',
            body={'raw': raw_message}
        ).execute()
        
        logger.info(f"Test email sent to {request.recipient}")
        
        # Save recipient to campaign if requested
        if request.save_recipient:
            saved_recipients = campaign.saved_test_recipients or []
            if request.recipient not in saved_recipients:
                saved_recipients.append(request.recipient)
                campaign.saved_test_recipients = saved_recipients
                db.commit()
        
        return {
            "success": True,
            "message": f"Test email sent to {request.recipient}",
            "message_id": result.get('id'),
            "preview": {
                "headers": processed_headers,
                "body_preview": processed_body[:500] + "..." if len(processed_body) > 500 else processed_body
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Test send failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router_preview.get("/drafts/template-tags/reference")
def get_template_tags_reference():
    """
    Get reference guide for all available template tags.
    """
    return {
        "random_generation_tags": {
            "[rndn_N]": {
                "description": "Random digits (0-9)",
                "example": "[rndn_10] → 1234567890",
                "charset": "0-9"
            },
            "[rnda_N]": {
                "description": "Random alphanumeric (A-Z a-z 0-9)",
                "example": "[rnda_8] → aB3cD4eF",
                "charset": "A-Z a-z 0-9"
            },
            "[rndl_N]": {
                "description": "Random lowercase (a-z)",
                "example": "[rndl_6] → abcdef",
                "charset": "a-z"
            },
            "[rndu_N]": {
                "description": "Random uppercase (A-Z)",
                "example": "[rndu_6] → ABCDEF",
                "charset": "A-Z"
            },
            "[rnds_N]": {
                "description": "Random symbols",
                "example": "[rnds_5] → *-_#@",
                "charset": "*-_#@!$%&+=?"
            },
            "[rndlu_N]": {
                "description": "Random letters (A-Z a-z)",
                "example": "[rndlu_8] → AbCdEfGh",
                "charset": "A-Z a-z"
            },
            "[rndln_N]": {
                "description": "Random lowercase + digits (a-z 0-9)",
                "example": "[rndln_8] → abc123de",
                "charset": "a-z 0-9"
            },
            "[rndun_N]": {
                "description": "Random uppercase + digits (A-Z 0-9)",
                "example": "[rndun_8] → ABC123DE",
                "charset": "A-Z 0-9"
            }
        },
        "system_tags": {
            "[smtp]": "SMTP username (user's email address)",
            "[from]": "From name",
            "[subject]": "Email subject",
            "[to]": "Recipient email address",
            "[date]": "Current date/time (RFC 2822 format)",
            "[Message-ID]": "Unique message ID"
        },
        "usage_notes": [
            "N in random tags represents the length (1-256)",
            "Random tags generate different values each time",
            "System tags are replaced with actual values",
            "Tags are case-sensitive"
        ],
        "default_headers": TemplateEngine.get_default_headers()
    }
