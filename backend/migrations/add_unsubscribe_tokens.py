"""
Unsubscribe Token Model for Tracking
Add this migration after updating models.py
"""
from sqlalchemy import Column, Integer, String, DateTime, func
from app.database import Base

class UnsubscribeToken(Base):
    """Token-based unsubscribe management"""
    __tablename__ = "unsubscribe_tokens"
    
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, index=True, nullable=False)
    campaign_id = Column(Integer, nullable=False)
    email_hash = Column(String(64), nullable=False)  # SHA-256 of email
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    used_at = Column(DateTime(timezone=True), nullable=True)
