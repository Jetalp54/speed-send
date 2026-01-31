"""
Tracking Server Configuration
Environment variables for production deployment
"""
import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql://gmailsaas:gmailsaas123@localhost:5432/gmail_saas"
    )
    
    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/1")
    
    # Security
    ENCRYPTION_KEY: str = os.getenv("ENCRYPTION_KEY", "your-encryption-key-32-bytes-long")
    
    # GeoIP
    GEOIP_DB_PATH: str = os.getenv("GEOIP_DB_PATH", "/usr/share/GeoIP/GeoLite2-City.mmdb")
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8001
    WORKERS: int = 4
    
    # Tracking Domain
    TRACKING_DOMAIN: str = os.getenv("TRACKING_DOMAIN", "track.yourdomain.com")
    
    # Privacy
    IP_SALT: str = os.getenv("IP_SALT", "random-salt-for-ip-hashing")
    DATA_RETENTION_DAYS: int = 90
    
    class Config:
        env_file = ".env"

settings = Settings()
