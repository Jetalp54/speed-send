
import logging
from cryptography.fernet import Fernet
from app.config import settings
import base64
import json
from app.celery_app import celery_app
from app.database import SessionLocal
from app.models import TrackingEvent, LinkMap
import hashlib
import re

logger = logging.getLogger(__name__)

def inject_tracking_links(db, html_content: str, campaign_id: int, email_log_id: int) -> str:
    """
    Scans HTML for <a> tags, replaces hrefs with tracking links,
    and appends the open tracking pixel.
    """
    from app.models import Campaign, TrackingDomain # Lazy import to avoid circular dep
    
    # Defaults
    base_url = settings.API_BASE_URL.rstrip('/')
    
    # Check for Custom Domain
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if campaign and campaign.tracking_domain_id:
        domain = db.query(TrackingDomain).filter(TrackingDomain.id == campaign.tracking_domain_id).first()
        if domain and domain.status == 'active' and domain.ssl_active:
            # Use custom domain
            base_url = f"https://{domain.domain}"
    
    # 1. Open Pixel
    
    # 1. Open Pixel
    open_token = OpaqueSigner.sign(email_log_id)
    pixel_html = f'<img src="{base_url}/t/o/{open_token}.png" width="1" height="1" style="display:none;" alt="" />'
    
    if "</body>" in html_content:
        html_content = html_content.replace("</body>", f"{pixel_html}</body>")
    else:
        html_content += pixel_html

    # 2. Click Tracking
    # Regex to find href attributes in <a> tags
    # Handle single or double quotes
    # Capture group 1: Quote char, Group 2: URL
    
    def replace_link(match):
        quote = match.group(1)
        original_url = match.group(2)
        
        # Skip mailto, tel, #, empty
        if not original_url or original_url.startswith(('mailto:', 'tel:', '#')) or 'unsubscribe' in original_url.lower():
             # We skip unsubscribe for now or handle it separately? 
             # Ideally tracking clicks on unsubscribe is good too, but usually it's unique link.
             # Let's track everything except mailto/tel/#
             pass
        
        if original_url.startswith(('mailto:', 'tel:', '#')) or not original_url.strip():
            return match.group(0) # Return unchanged
            
        # Get or Create LinkMap
        # Optimization: We theoretically should cache this per job, but safe to DB lookup for now.
        link_map = db.query(LinkMap).filter(
            LinkMap.campaign_id == campaign_id,
            LinkMap.original_url == original_url
        ).first()
        
        if not link_map:
            link_map = LinkMap(campaign_id=campaign_id, original_url=original_url)
            db.add(link_map)
            db.flush() # Get ID
            
        click_token = OpaqueSigner.sign(email_log_id, link_map.id)
        return f'href={quote}{base_url}/t/c/{click_token}{quote}'

    # Simple regex for href="..." or href='...'
    # Pattern: href=(['"])(.*?)\1
    pattern = re.compile(r'href=([\'"])(.*?)\1', re.IGNORECASE)
    
    try:
        html_content = pattern.sub(replace_link, html_content)
    except Exception as e:
        logger.error(f"Failed to replace links for email_log_id {email_log_id}: {e}")
    
    return html_content

class OpaqueSigner:
    """
    Handles deterministic but irreversible (to user) token generation.
    Uses Fernet (AES-128) encryption.
    """
    _fernet = None

    @classmethod
    def get_fernet(cls):
        if cls._fernet is None:
            # key must be 32 url-safe base64-encoded bytes
            # We assume settings.ENCRYPTION_KEY is suitable or we derive it.
            # If plain string, we might need to hash it to get 32 bytes valid key.
            # Simplified: Use a specific key for tracking if needed, or re-use main ENCRYPTION_KEY (if proper format).
            try:
                key = settings.ENCRYPTION_KEY
                # Ensure it's bytes
                if isinstance(key, str):
                    key = key.encode()
                # Fernet key must be 32 base64-encoded bytes
                # If key is short/raw, we hash & b64encode
                if len(key) != 44: # Standard Fernet key length
                     m = hashlib.sha256()
                     m.update(key)
                     key = base64.urlsafe_b64encode(m.digest())
                cls._fernet = Fernet(key)
            except Exception as e:
                logger.error(f"Failed to init Fernet: {e}")
                raise e
        return cls._fernet

    @classmethod
    def sign(cls, email_log_id: int, link_map_id: int = 0) -> str:
        """
        Create opaque ID containing IDs.
        Format: "v1:email_log_id:link_map_id"
        """
        f = cls.get_fernet()
        payload = f"v1:{email_log_id}:{link_map_id}".encode()
        token = f.encrypt(payload)
        # Verify it's URL safe (Fernet output is URL safe base64)
        return token.decode()

    @classmethod
    def unsign(cls, token: str):
        """
        Decrypt opaque ID.
        Returns: (email_log_id, link_map_id)
        """
        try:
            f = cls.get_fernet()
            payload = f.decrypt(token.encode()).decode()
            # Parse "v1:123:456"
            parts = payload.split(':')
            if len(parts) != 3 or parts[0] != 'v1':
                raise ValueError("Invalid token format")
            
            return int(parts[1]), int(parts[2])
        except Exception as e:
             logger.warning(f"Failed to unsign token: {str(e)}")
             return None, None

@celery_app.task
def log_tracking_event_task(event_data):
    """
    Async task to write tracking event to DB.
    """
    db = SessionLocal()
    try:
        # Anonymize IP if present (GDPR compliance)
        ip_address = event_data.get('ip')
        ip_hash = None
        if ip_address:
             m = hashlib.sha256()
             m.update(ip_address.encode())
             # Salt with daily key in full production, simplified here
             ip_hash = m.hexdigest()

        event = TrackingEvent(
            event_type=event_data['event_type'],
            campaign_id=event_data['campaign_id'],
            email_log_id=event_data.get('email_log_id'),
            link_map_id=event_data.get('link_map_id'),
            user_agent=event_data.get('user_agent'),
            user_agent_type=event_data.get('user_agent_type', 'unknown'),
            iso_country=event_data.get('geo_country'), # Changed from geo_country to match typical schema naming or keep logic
            ip_hash=ip_hash
        )
        db.add(event)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to log tracking event: {e}")
        db.rollback()
    finally:
        db.close()
