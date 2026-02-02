
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
import httpx

logger = logging.getLogger("app.services.tracking")

def inject_tracking_links(db, html_content: str, campaign_id: int, email_log_id: int) -> str:
    """
    Scans HTML for <a> tags, replaces hrefs with tracking links,
    and appends the open tracking pixel.
    """
    from app.models import Campaign, TrackingDomain # Lazy import to avoid circular dep
    
    # Priority 1: Use external tracking domain from settings (RECOMMENDED)
    if settings.USE_EXTERNAL_TRACKING and settings.TRACKING_DOMAIN:
        base_url = settings.TRACKING_DOMAIN.rstrip('/')
        logger.info(f"Using external tracking domain: {base_url}")
    else:
        # Priority 2: Check for campaign-specific custom domain
        base_url = settings.API_BASE_URL.rstrip('/')
        
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if campaign and campaign.tracking_domain_id:
            domain = db.query(TrackingDomain).filter(TrackingDomain.id == campaign.tracking_domain_id).first()
            if domain and domain.status == 'active' and domain.ssl_active:
                # Use campaign-specific custom domain
                base_url = f"https://{domain.domain}"
                logger.info(f"Using campaign tracking domain: {base_url}")
    
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
            try:
                key = settings.ENCRYPTION_KEY
                if isinstance(key, str):
                    key = key.encode()
                if len(key) != 44:
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

@celery_app.task(name='app.services.tracking.log_tracking_event_task')
def log_tracking_event_task(event_data):
    """
    Async task to write tracking event to DB.
    """
    logger.info(f"⚙️ EXECUTING TASK: logging {event_data['event_type']} for Cam:{event_data.get('campaign_id')} Draft:{event_data.get('draft_campaign_id')}")
    db = SessionLocal()
    # Log database name for debugging connection issues
    db_name = db.get_bind().url.database
    logger.info(f"⚙️ EXECUTING TASK | DB: {db_name} | logging {event_data['event_type']} for Cam:{event_data.get('campaign_id')} Draft:{event_data.get('draft_campaign_id')}")
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
            campaign_id=event_data.get('campaign_id'),
            draft_campaign_id=event_data.get('draft_campaign_id'),
            email_log_id=event_data.get('email_log_id'),
            link_map_id=event_data.get('link_map_id'),
            user_agent=event_data.get('user_agent'),
            user_agent_type=event_data.get('user_agent_type', 'unknown'),
            # Fix: Use correct model field names
            geo_country=event_data.get('geo_country'),
            geo_city=event_data.get('geo_city'),
            geo_region=event_data.get('geo_region'),
            ip_hash=ip_hash,
            # Extended fields
            device_type=event_data.get('device_type'),
            os=event_data.get('os'),
            browser=event_data.get('browser')
        )
        
        # --- NEW: Geo-Location Lookup ---
        if ip_address and ip_address not in ["127.0.0.1", "unknown"]:
            try:
                logger.info(f"📍 Attempting Geo-Location lookup for IP: {ip_address}")
                # Use a fast, free GeoIP API (ip-api.com)
                # Note: In heavy production, use a local MaxMind DB
                with httpx.Client(timeout=3.0) as client:
                    response = client.get(f"http://ip-api.com/json/{ip_address}?fields=status,message,country,regionName,city")
                    if response.status_code == 200:
                        geo_data = response.json()
                        if geo_data.get("status") == "success":
                            event.geo_country = geo_data.get("country")
                            event.geo_region = geo_data.get("regionName")
                            geo_city = geo_data.get("city")
                            event.geo_city = geo_city
                            logger.info(f"✅ Resolved Location: {geo_city}, {event.geo_country}")
                        else:
                            logger.warning(f"⚠️ GeoIP API returned status {geo_data.get('status')}: {geo_data.get('message')}")
                    else:
                        logger.warning(f"⚠️ GeoIP API HTTP error: {response.status_code}")
            except Exception as geo_err:
                logger.warning(f"❌ GeoIP Lookup exception for {ip_address}: {geo_err}")

        db.add(event)
        
        # --- NEW: Real-time counter updates ---
        from app.models import Campaign, EmailLog, DraftCampaign
        
        c_id = event_data.get('campaign_id')
        d_id = event_data.get('draft_campaign_id')

        # 1. AUTO-RESOLVE: If c_id is provided but it's actually a Draft, link it
        if c_id and not d_id:
            # Check if this ID exists in draft_campaigns
            is_draft = db.query(DraftCampaign).filter(DraftCampaign.id == c_id).first()
            if is_draft:
                d_id = c_id
                # CRITICAL: If we found it's a draft, we MUST clear the campaign__id 
                # on the event object or the database will throw a ForeignKeyViolation 
                # because the ID doesn't exist in the "campaigns" table.
                event.draft_campaign_id = d_id
                event.campaign_id = None 
                # Re-sync local variable for the update logic below
                c_id = None 
                logger.info(f"🔄 Auto-resolved Campaign ID {event_data.get('campaign_id')} as Draft ID {d_id}. Cleared campaign_id to avoid DB error.")

        # 2. Update Campaign Stats
        if c_id:
            campaign = db.query(Campaign).filter(Campaign.id == c_id).first()
            if campaign and hasattr(campaign, 'opens_count'):
                if event_data['event_type'] == 'open':
                    campaign.opens_count = (campaign.opens_count or 0) + 1
                elif event_data['event_type'] == 'click':
                    campaign.clicks_count = (campaign.clicks_count or 0) + 1
                logger.info(f"📈 Updated Campaign {c_id} counters")
        
        # 3. Update Draft Campaign Stats
        if d_id:
            draft = db.query(DraftCampaign).filter(DraftCampaign.id == d_id).first()
            if draft and hasattr(draft, 'opens_count'):
                if event_data['event_type'] == 'open':
                    draft.opens_count = (draft.opens_count or 0) + 1
                elif event_data['event_type'] == 'click':
                    draft.clicks_count = (draft.clicks_count or 0) + 1
                logger.info(f"📈 Updated Draft {d_id} counters")
        
        # 3. Update Email Log Stats (if linked)
        email_log_id = event_data.get('email_log_id')
        if email_log_id:
            log = db.query(EmailLog).filter(EmailLog.id == email_log_id).first()
            if log and hasattr(log, 'opens_count'):
                if event_data['event_type'] == 'open':
                    log.opens_count = (log.opens_count or 0) + 1
                elif event_data['event_type'] == 'click':
                    log.clicks_count = (log.clicks_count or 0) + 1
        
        db.commit()
        logger.info(f"✅ TRACKING LOGGED: Event recorded in database for email_log_id={email_log_id or 'explicit'}")
    except Exception as e:
        logger.error(f"❌ Failed to log tracking event: {e}")
        db.rollback()
    finally:
        db.close()
