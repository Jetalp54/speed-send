"""
Core tracking logic: token decryption, event logging, analytics
"""
import hashlib
import base64
import logging
from cryptography.fernet import Fernet
from user_agents import parse as parse_user_agent
from app.config import settings
from app.models import TrackingEvent, LinkMap, EmailLog, UnsubscribeToken
from app.geoip import GeoIPResolver
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

logger = logging.getLogger(__name__)

class TokenDecryptor:
    """Handles token encryption/decryption using Fernet"""
    _fernet = None
    
    @classmethod
    def get_fernet(cls):
        if cls._fernet is None:
            try:
                key = settings.ENCRYPTION_KEY
                if isinstance(key, str):
                    key = key.encode()
                # Ensure 32-byte key for Fernet
                if len(key) != 44:
                    m = hashlib.sha256()
                    m.update(key)
                    key = base64.urlsafe_b64encode(m.digest())
                cls._fernet = Fernet(key)
            except Exception as e:
                logger.error(f"Failed to initialize Fernet: {e}")
                raise
        return cls._fernet
    
    @classmethod
    def decrypt(cls, token: str) -> tuple:
        """
        Decrypt token to get (email_log_id, link_map_id)
        Format: "v1:email_log_id:link_map_id"
        """
        try:
            f = cls.get_fernet()
            payload = f.decrypt(token.encode()).decode()
            parts = payload.split(':')
            if len(parts) != 3 or parts[0] != 'v1':
                raise ValueError("Invalid token format")
            return int(parts[1]), int(parts[2])
        except Exception as e:
            logger.warning(f"Failed to decrypt token: {e}")
            return None, None

class DeviceParser:
    """Parse user agent string to extract device, OS, browser"""
    
    @staticmethod
    def parse(user_agent_string: str) -> dict:
        """
        Returns: {
            'device_type': 'mobile'|'tablet'|'desktop',
            'os': 'iOS 15.0',
            'browser': 'Safari 15.0',
            'is_bot': True|False
        }
        """
        try:
            ua = parse_user_agent(user_agent_string)
            
            # Determine device type
            if ua.is_mobile:
                device_type = 'mobile'
            elif ua.is_tablet:
                device_type = 'tablet'
            else:
                device_type = 'desktop'
            
            return {
                'device_type': device_type,
                'os': f"{ua.os.family} {ua.os.version_string}",
                'browser': f"{ua.browser.family} {ua.browser.version_string}",
                'is_bot': ua.is_bot
            }
        except Exception as e:
            logger.error(f"Failed to parse user agent: {e}")
            return {
                'device_type': 'unknown',
                'os': 'unknown',
                'browser': 'unknown',
                'is_bot': False
            }

async def log_tracking_event(
    db: AsyncSession,
    event_type: str,
    campaign_id: int,
    email_log_id: int = None,
    link_map_id: int = None,
    ip_address: str = None,
    user_agent: str = None
):
    """
    Log tracking event to database with geo and device detection
    """
    try:
        # Hash IP for privacy
        ip_hash = None
        if ip_address:
            m = hashlib.sha256()
            m.update(f"{ip_address}{settings.IP_SALT}".encode())
            ip_hash = m.hexdigest()
        
        # Geo resolution
        geo_data = GeoIPResolver.resolve(ip_address) if ip_address else None
        
        # Device parsing
        device_data = DeviceParser.parse(user_agent) if user_agent else {}
        
        # Create event
        event = TrackingEvent(
            event_type=event_type,
            campaign_id=campaign_id,
            email_log_id=email_log_id,
            link_map_id=link_map_id,
            user_agent=user_agent,
            user_agent_type=device_data.get('device_type', 'unknown'),
            geo_country=geo_data.get('country') if geo_data else None,
            geo_city=geo_data.get('city') if geo_data else None,
            geo_region=geo_data.get('region') if geo_data else None,
            ip_hash=ip_hash,
            device_type=device_data.get('device_type'),
            os=device_data.get('os'),
            browser=device_data.get('browser')
        )
        
        db.add(event)
        await db.commit()
        
        logger.info(f"Logged {event_type} event for campaign {campaign_id}")
        
    except Exception as e:
        logger.error(f"Failed to log tracking event: {e}")
        await db.rollback()

def hash_email(email: str) -> str:
    """Hash email for privacy-safe storage"""
    m = hashlib.sha256()
    m.update(email.lower().encode())
    return m.hexdigest()
