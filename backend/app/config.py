from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql://gmailsaas:gmailsaas123@localhost:5432/gmail_saas"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ENCRYPTION_KEY: str = "your-encryption-key-32-bytes-long"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Application
    ENVIRONMENT: str = "development"
    API_V1_PREFIX: str = "/api/v1"
    PROJECT_NAME: str = "Gmail Bulk Sender SaaS"
    VERSION: str = "1.0.0"
    API_BASE_URL: str = "http://localhost:8000" # Base URL for tracking links (fallback)
    
    # External Tracking Server (IMPORTANT: Set this in production)
    TRACKING_DOMAIN: Optional[str] = None  # e.g., "https://track.yourdomain.com"
    USE_EXTERNAL_TRACKING: bool = False  # Set to True to use external tracking server
    
    # CORS
    BACKEND_CORS_ORIGINS: list = ["http://localhost:3000", "http://localhost:8000"]
    
    # Email Sending Configuration
    DEFAULT_RATE_LIMIT: int = 500
    WORKSPACE_RATE_LIMIT: int = 2000
    CONCURRENCY_PER_ACCOUNT: int = 5
    GLOBAL_CONCURRENCY: int = 50
    
    # Google API Scopes (Must match what's authorized in Google Admin Console)
    GMAIL_SCOPES: list = [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.insert',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.readonly'
    ]
    ADMIN_SCOPES: list = [
        'https://www.googleapis.com/auth/admin.directory.user',
        'https://www.googleapis.com/auth/admin.directory.user.security',
        'https://www.googleapis.com/auth/admin.directory.orgunit',
        'https://www.googleapis.com/auth/admin.directory.domain.readonly'
    ]
    
    # File Storage
    SERVICE_ACCOUNTS_DIR: str = "service_accounts"
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

