"""
Minimal database models for tracking server (read-only access to main DB)
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.database import Base

class TrackingEvent(Base):
    """Matches backend/app/models.py TrackingEvent"""
    __tablename__ = "tracking_events"
    
    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(20), nullable=False)  # 'open', 'click', 'unsubscribe'
    
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    email_log_id = Column(Integer, ForeignKey("email_logs.id"), nullable=True)
    link_map_id = Column(Integer, ForeignKey("link_maps.id"), nullable=True)
    
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    
    # Privacy-safe Metadata
    user_agent = Column(Text)
    user_agent_type = Column(String(50))  # 'mobile', 'desktop', 'bot'
    geo_country = Column(String(2))
    geo_city = Column(String(100))
    geo_region = Column(String(100))
    ip_hash = Column(String(64))  # Anonymized IP
    
    # Device detection
    device_type = Column(String(20))  # 'mobile', 'tablet', 'desktop'
    os = Column(String(50))
    browser = Column(String(50))

class LinkMap(Base):
    """Matches backend/app/models.py LinkMap"""
    __tablename__ = "link_maps"
    
    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    original_url = Column(Text, nullable=False)
    opaque_id = Column(String(64), unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class EmailLog(Base):
    """Minimal EmailLog for lookups"""
    __tablename__ = "email_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, nullable=False)
    recipient_email = Column(String(255))

class UnsubscribeToken(Base):
    """New table for unsubscribe management"""
    __tablename__ = "unsubscribe_tokens"
    
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, index=True, nullable=False)
    campaign_id = Column(Integer, nullable=False)
    email_hash = Column(String(64), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    used_at = Column(DateTime(timezone=True), nullable=True)
