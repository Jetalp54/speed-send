
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
    pixel_html = f'<img src="{base_url}/t/pixel.png?c={campaign_id}" width="1" height="1" style="display:none;" alt="" />'
    
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
    db = SessionLocal()
    # Log database name for debugging connection issues
    db_name = db.get_bind().url.database
    
    # --- MOVED UP: Auto-Resolve Campaign/Draft ID ---
    # Must happen BEFORE creating TrackingEvent to avoid Foreign Key Violation
    c_id = event_data.get('campaign_id')
    d_id = event_data.get('draft_campaign_id')
    
    from app.models import DraftCampaign
    if c_id and not d_id:
        # Check if this ID exists in draft_campaigns
        is_draft = db.query(DraftCampaign).filter(DraftCampaign.id == c_id).first()
        if is_draft:
            d_id = c_id
            c_id = None # CLEAR campaign_id effectively
            logger.info(f"🔄 Auto-resolved Campaign ID {event_data.get('campaign_id')} as Draft ID {d_id}. Cleared campaign_id to avoid DB error.")

    logger.info(f"⚙️ EXECUTING TASK | DB: {db_name} | logging {event_data['event_type']} for Cam:{c_id} Draft:{d_id}")
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
            campaign_id=c_id, # Use resolved ID
            draft_campaign_id=d_id, # Use resolved ID
            email_log_id=event_data.get('email_log_id'),
            link_map_id=event_data.get('link_map_id'),
            user_agent=event_data.get('user_agent'),
            user_agent_type=event_data.get('user_agent_type', 'unknown'),
            # Fix: Use correct model field names
            geo_country=event_data.get('geo_country'),
            geo_city=event_data.get('geo_city'),
            geo_region=event_data.get('geo_region'),
            ip_hash=ip_hash,
            ip_address=ip_address, # Raw IP
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
                    response = client.get(f"http://ip-api.com/json/{ip_address}?fields=status,message,countryCode,regionName,city")
                    if response.status_code == 200:
                        geo_data = response.json()
                        if geo_data.get("status") == "success":
                            event.geo_country = geo_data.get("countryCode")
                            event.geo_region = geo_data.get("regionName")
                            geo_city = geo_data.get("city")
                            event.geo_city = geo_city
                            logger.info(f"✅ Resolved Location: {geo_city}, {event.geo_country}")
                            
                            # --- NEW: Update Contact Metadata ---
                            if email_log_id:
                                log = db.query(models.EmailLog).filter(models.EmailLog.id == email_log_id).first()
                                if log:
                                    contact = db.query(models.Contact).filter(models.Contact.email == log.recipient_email).first()
                                    if contact:
                                        contact.geo_country = event.geo_country
                                        contact.geo_city = event.geo_city
                                        # ISP Detection (Heuristic or API if available)
                                        # For now, we take from geo_data if provided by IP-API
                                        contact.isp = geo_data.get("isp", "Unknown")
                                        logger.info(f"📍 Updated Contact {contact.email} with Geo/ISP")
                        else:
                            logger.warning(f"⚠️ GeoIP API returned status {geo_data.get('status')}: {geo_data.get('message')}")
                    else:
                        logger.warning(f"⚠️ GeoIP API HTTP error: {response.status_code}")
            except Exception as geo_err:
                logger.warning(f"❌ GeoIP Lookup exception for {ip_address}: {geo_err}")

        db.add(event)
        try:
            db.commit() # Commit event IMMEDIATELY so it counts
            db.refresh(event)
        except Exception as e:
            logger.error(f"❌ Failed to commit tracking event: {e}")
            db.rollback()
            return
        
        # --- NEW: Real-time counter updates ---
        from app.models import Campaign, EmailLog, DraftCampaign
        
        # c_id and d_id are already defined at top

        # 1. AUTO-RESOLVE: Moved to top of function

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
        
        # 3. Update Email Log Stats & Handle Auto-Segmentation
        email_log_id = event_data.get('email_log_id')
        source_list_id = None
        recipient_email = None

        if email_log_id:
            from app.models import EmailLog, ContactList, Contact
            log = db.query(EmailLog).filter(EmailLog.id == email_log_id).first()
            if log:
                # Update counters on the log itself
                if event_data['event_type'] == 'open':
                    log.opens_count = (log.opens_count or 0) + 1
                elif event_data['event_type'] == 'click':
                    log.clicks_count = (log.clicks_count or 0) + 1
                elif event_data['event_type'] == 'unsubscribe':
                    if hasattr(log, 'unsubscribes_count'):
                        log.unsubscribes_count = (log.unsubscribes_count or 0) + 1
                
                source_list_id = getattr(log, 'contact_list_id', None)
                recipient_email = log.recipient_email
        else:
            # Explicit tracking (no log ID) -> Use &r= param
            recipient_email = event_data.get('recipient')

        # --- AUTO-SEGMENTATION LOGIC (Shared) ---
        if recipient_email and d_id:
             logger.info(f"🔍 Checking Auto-Segmentation for {recipient_email} in Draft {d_id}")
             # If source list not known from log, try to resolve from draft's contacts
             if not source_list_id:
                 # Ensure DraftCampaign is imported
                 from app.models import DraftCampaign
                 draft_campaign = db.query(DraftCampaign).filter(DraftCampaign.id == d_id).first()
                 if draft_campaign:
                     # Check connection: Draft -> ContactList -> Contact(email)
                     from app.models import DraftCampaignContact, ContactList, Contact
                     
                     # Find which of the draft's lists contains this recipient
                     # Simplified: Just check if this email exists in any list linked to this Draft
                     found_contact = db.query(Contact).join(
                         DraftCampaignContact, DraftCampaignContact.contact_list_id == Contact.contact_list_id
                     ).filter(
                         DraftCampaignContact.draft_campaign_id == d_id,
                         Contact.email == recipient_email
                     ).first()
                     
                     if found_contact:
                         source_list_id = found_contact.contact_list_id
                         logger.info(f"✅ Found source list via Draft: {source_list_id}")
                     
                     # Fallback 2: If still not found, try to find ANY contact with this email
                     # This handles cases where logical link Draft->List is broken but user exists
                     if not source_list_id:
                         any_contact = db.query(Contact).filter(Contact.email == recipient_email).first()
                         if any_contact:
                             source_list_id = any_contact.contact_list_id
                             logger.info(f"⚠️ Auto-segmentation: Used GLOBAL lookup for {recipient_email} -> List {source_list_id}")
                         else:
                             logger.warning(f"❌ Auto-segmentation failed: Contact {recipient_email} not found in DB.")
            
             # If we identified a linked source list, copy contact to Action List
             if source_list_id:
                # Ensure imports again just in case
                from app.models import ContactList, Contact
                source_list = db.query(ContactList).filter(ContactList.id == source_list_id).first()
                if source_list:
                    target_list_name = f"{source_list.name}_{event_data['event_type']}"
                    logger.info(f"🎯 Target List Name: {target_list_name}")
                    
                    target_list = db.query(ContactList).filter(ContactList.name == target_list_name).first()
                    if not target_list:
                        target_list = ContactList(
                            name=target_list_name,
                            description=f"Auto-segment: {event_data['event_type']} from {source_list.name}"
                        )
                        db.add(target_list)
                        db.flush()
                        logger.info(f"🆕 Created new segment list: {target_list.id}")
                    
                    # Check if already in target list
                    existing = db.query(Contact).filter(
                        Contact.contact_list_id == target_list.id,
                        Contact.email == recipient_email
                    ).first()
                    
                    if not existing:
                        # Copy contact details from source (if found) or create new partial contact
                        orig = db.query(Contact).filter(
                             Contact.contact_list_id == source_list_id,
                             Contact.email == recipient_email
                        ).first()

                        if not orig:
                            # Fallback: Find contact in ANY list to get details
                             orig = db.query(Contact).filter(
                                  Contact.email == recipient_email
                             ).first()
                        
                        new_c = Contact(
                            contact_list_id=target_list.id,
                            email=recipient_email,
                            first_name=orig.first_name if orig else None,
                            last_name=orig.last_name if orig else None,
                            isp=orig.isp if orig else None,
                            geo_country=orig.geo_country if orig else None,
                            geo_city=orig.geo_city if orig else None,
                            tags=orig.tags if orig else []
                        )
                        db.add(new_c)
                        logger.info(f"👥 Segments: {recipient_email} -> {target_list_name}")
                    else:
                        logger.info(f"ℹ️ Contact {recipient_email} already in {target_list_name}")
        
        try:
            db.commit()
            logger.info(f"✅ STATS UPDATED: Event recorded in database for email_log_id={email_log_id or 'explicit'}")
        except Exception as e:
            logger.error(f"❌ Failed to update stats/segments: {e}")
            db.rollback() # Only rolls back stats updates
    except Exception as e:
        logger.error(f"❌ Failed to log tracking event (outer): {e}")
        # db.rollback() # Handled inside
    finally:
        db.close()
