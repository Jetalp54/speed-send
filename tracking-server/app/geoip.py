"""
GeoIP Detection using MaxMind GeoLite2
"""
import geoip2.database
import geoip2.errors
import logging
from app.config import settings
from typing import Optional, Dict

logger = logging.getLogger(__name__)

class GeoIPResolver:
    _reader = None
    
    @classmethod
    def get_reader(cls):
        """Lazy load GeoIP database"""
        if cls._reader is None:
            try:
                cls._reader = geoip2.database.Reader(settings.GEOIP_DB_PATH)
                logger.info(f"GeoIP database loaded from {settings.GEOIP_DB_PATH}")
            except Exception as e:
                logger.error(f"Failed to load GeoIP database: {e}")
                cls._reader = False  # Mark as failed
        return cls._reader if cls._reader != False else None
    
    @classmethod
    def resolve(cls, ip_address: str) -> Optional[Dict[str, str]]:
        """
        Resolve IP to geographic location
        Returns: {'country': 'US', 'city': 'New York', 'region': 'NY'}
        """
        reader = cls.get_reader()
        if not reader:
            return None
        
        try:
            response = reader.city(ip_address)
            return {
                'country': response.country.iso_code,
                'city': response.city.name,
                'region': response.subdivisions.most_specific.iso_code if response.subdivisions else None
            }
        except geoip2.errors.AddressNotFoundError:
            logger.debug(f"IP {ip_address} not found in GeoIP database")
            return None
        except Exception as e:
            logger.error(f"GeoIP lookup error for {ip_address}: {e}")
            return None
    
    @classmethod
    def close(cls):
        """Close database connection"""
        if cls._reader and cls._reader != False:
            cls._reader.close()
            cls._reader = None
