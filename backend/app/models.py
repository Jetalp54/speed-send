from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Date, JSON, ForeignKey, Enum, func
from sqlalchemy.orm import relationship
import enum
from app.database import Base

# Enums
class AccountStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"

class CampaignStatus(str, enum.Enum):
    DRAFT = "draft"
    PREPARING = "preparing"
    READY = "ready"
    SENDING = "sending"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"

class EmailStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    BOUNCED = "bounced"

class DraftStatus(str, enum.Enum):
    CREATED = "created"       # Was 'draft'
    UPLOADING = "uploading"   # Async upload in progress
    READY = "ready"           # Was 'uploaded'
    SCHEDULED = "scheduled"   # Waiting for scheduler
    SENDING = "sending"       # Was 'launched' (partially)
    PAUSED = "paused"         # Stopped by user/system
    COMPLETED = "completed"   # All sent
    FAILED = "failed"         # Critical error
    CANCELED = "canceled"     # Stopped by user

class JobStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"

# Service Accounts
class ServiceAccount(Base):
    __tablename__ = "service_accounts"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    client_email = Column(String(255), nullable=False, unique=True)
    domain = Column(String(255), nullable=True)
    project_id = Column(String(255))
    admin_email = Column(String(255))
    
    # Encrypted JSON content
    encrypted_json = Column(Text, nullable=False)
    
    # Status and limits
    status = Column(Enum(AccountStatus), default=AccountStatus.ACTIVE)
    total_users = Column(Integer, default=0)
    daily_limit = Column(Integer, default=2000)
    daily_sent = Column(Integer, default=0)
    daily_reset_date = Column(Date, default=func.current_date())
    total_sent_all_time = Column(Integer, default=0)
    quota_limit = Column(Integer, default=500)
    quota_used_today = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_synced = Column(DateTime(timezone=True))
    
    # Relationships
    workspace_users = relationship("WorkspaceUser", back_populates="service_account", cascade="all, delete-orphan")
    campaigns = relationship("Campaign", secondary="campaign_senders", back_populates="sender_accounts")
    
    def get_json_content(self):
        """Decrypt and return the JSON content"""
        from app.encryption import EncryptionService
        try:
            encryption_service = EncryptionService()
            return encryption_service.decrypt(self.encrypted_json)
        except Exception:
            return {}

# Workspace Users
class WorkspaceUser(Base):
    __tablename__ = "workspace_users"
    
    id = Column(Integer, primary_key=True, index=True)
    service_account_id = Column(Integer, ForeignKey("service_accounts.id"), nullable=False)
    email = Column(String(255), nullable=False)
    full_name = Column(String(255))
    first_name = Column(String(255))
    last_name = Column(String(255))
    
    # Status and limits
    is_active = Column(Boolean, default=True)
    emails_sent_today = Column(Integer, default=0)
    quota_limit = Column(Integer, default=100)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_used = Column(DateTime(timezone=True))
    
    # Relationships
    service_account = relationship("ServiceAccount", back_populates="workspace_users")
    gmail_drafts = relationship("GmailDraft", back_populates="user", cascade="all, delete-orphan")

# Contact Lists
class ContactList(Base):
    __tablename__ = "contact_lists"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    contacts = relationship("Contact", back_populates="contact_list", cascade="all, delete-orphan")
    
    @property
    def recipients(self):
        """Extract email addresses from contacts for frontend compatibility"""
        return [contact.email for contact in self.contacts] if self.contacts else []

# Contacts
class Contact(Base):
    __tablename__ = "contacts"
    
    id = Column(Integer, primary_key=True, index=True)
    contact_list_id = Column(Integer, ForeignKey("contact_lists.id"), nullable=False)
    email = Column(String(255), nullable=False)
    first_name = Column(String(255))
    last_name = Column(String(255))
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    contact_list = relationship("ContactList", back_populates="contacts")

# Data Lists (Alternative to Contact Lists)
class DataList(Base):
    __tablename__ = "data_lists"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    recipients = Column(JSON)  # List of email addresses
    total_recipients = Column(Integer, default=0)
    list_type = Column(String(50), default='custom')  # custom, imported, etc.
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

# Campaigns
class Campaign(Base):
    __tablename__ = "campaigns"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    
    # Email content
    subject = Column(String(998), nullable=False)
    body_html = Column(Text)
    body_plain = Column(Text)
    
    # Sender info
    from_name = Column(String(255))
    from_email = Column(String(255))
    reply_to = Column(String(255))
    return_path = Column(String(255))
    
    # Recipients
    recipients = Column(JSON)
    total_recipients = Column(Integer, default=0)
    
    # Sending configuration
    sender_rotation = Column(String(50), default="round_robin")
    use_ip_pool = Column(Boolean, default=False)
    ip_pool = Column(JSON)
    custom_headers = Column(JSON)
    attachments = Column(JSON)
    header_type = Column(String(50), default="existing")  # "existing" or "100_percent"
    custom_header = Column(Text)  # Custom header format for 100% header type
    
    # Status and progress
    status = Column(Enum(CampaignStatus), default=CampaignStatus.DRAFT)
    sent_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    pending_count = Column(Integer, default=0)
    
    # Rate limiting
    rate_limit = Column(Integer, default=500)
    concurrency = Column(Integer, default=5)
    
    # Testing
    is_test = Column(Boolean, default=False)
    test_recipients = Column(JSON)
    test_after_email = Column(String(255))
    test_after_count = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    prepared_at = Column(DateTime(timezone=True))
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    paused_at = Column(DateTime(timezone=True))
    
    # Celery task tracking
    celery_task_id = Column(String(255), index=True)
    
    # Relationships
    sender_accounts = relationship("ServiceAccount", secondary="campaign_senders", back_populates="campaigns")
    email_logs = relationship("EmailLog", back_populates="campaign", cascade="all, delete-orphan")
    
    # Optimistic locking
    version = Column(Integer, default=1, nullable=False)

# Campaign Senders (Many-to-Many)
class CampaignSender(Base):
    __tablename__ = "campaign_senders"
    
    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False)
    service_account_id = Column(Integer, ForeignKey("service_accounts.id"), nullable=False)

# Email Logs
class EmailLog(Base):
    __tablename__ = "email_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False)
    service_account_id = Column(Integer, ForeignKey("service_accounts.id"), nullable=False)
    sender_email = Column(String(255), nullable=False)
    recipient_email = Column(String(255), nullable=False)
    recipient_name = Column(String(255))
    
    # Email details
    subject = Column(String(998))
    status = Column(Enum(EmailStatus), default=EmailStatus.PENDING)
    error_message = Column(Text)
    
    # Enterprise fields
    idempotency_key = Column(String(255), unique=True, index=True) # campaign_id + recipient_hash
    message_id = Column(String(255)) # Gmail Message ID (Provider reference)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    sent_at = Column(DateTime(timezone=True))
    
    # Relationships
    campaign = relationship("Campaign", back_populates="email_logs")

# Draft Campaigns
class DraftCampaign(Base):
    __tablename__ = "draft_campaigns"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    from_name = Column(String(255))
    subject = Column(String(998), nullable=False)
    body_html = Column(Text)
    status = Column(String(50), default='draft')
    emails_per_user = Column(Integer, default=1)
    
    # Advanced customization fields
    use_custom_headers = Column(Boolean, default=False)
    custom_headers = Column(Text)  # Custom email headers template
    body_format = Column(String(10), default='html')  # 'html' or 'txt'
    body_template = Column(Text)  # Body with template tags
    
    # Testing automation
    test_after_email = Column(String(255))
    test_after_count = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    selected_accounts = relationship("DraftCampaignAccount", back_populates="draft_campaign", cascade="all, delete-orphan")
    selected_users = relationship("DraftCampaignUser", back_populates="draft_campaign", cascade="all, delete-orphan")
    selected_contacts = relationship("DraftCampaignContact", back_populates="draft_campaign", cascade="all, delete-orphan")
    gmail_drafts = relationship("GmailDraft", back_populates="draft_campaign", cascade="all, delete-orphan")

# Draft Campaign Accounts
class DraftCampaignAccount(Base):
    __tablename__ = "draft_campaign_accounts"
    
    id = Column(Integer, primary_key=True, index=True)
    draft_campaign_id = Column(Integer, ForeignKey("draft_campaigns.id"), nullable=False)
    service_account_id = Column(Integer, ForeignKey("service_accounts.id"), nullable=False)
    
    # Relationships
    draft_campaign = relationship("DraftCampaign", back_populates="selected_accounts")
    service_account = relationship("ServiceAccount")

# Draft Campaign Users
class DraftCampaignUser(Base):
    __tablename__ = "draft_campaign_users"
    
    id = Column(Integer, primary_key=True, index=True)
    draft_campaign_id = Column(Integer, ForeignKey("draft_campaigns.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("workspace_users.id"), nullable=False)
    
    # Relationships
    draft_campaign = relationship("DraftCampaign", back_populates="selected_users")
    user = relationship("WorkspaceUser")

# Draft Campaign Contacts
class DraftCampaignContact(Base):
    __tablename__ = "draft_campaign_contacts"
    
    id = Column(Integer, primary_key=True, index=True)
    draft_campaign_id = Column(Integer, ForeignKey("draft_campaigns.id", ondelete="CASCADE"), nullable=False)
    contact_list_id = Column(Integer, ForeignKey("contact_lists.id", ondelete="CASCADE"), nullable=False)
    
    # Relationships
    draft_campaign = relationship("DraftCampaign", back_populates="selected_contacts")
    contact_list = relationship("ContactList")

# Gmail Drafts
class GmailDraft(Base):
    __tablename__ = "gmail_drafts"
    
    id = Column(Integer, primary_key=True, index=True)
    draft_campaign_id = Column(Integer, ForeignKey("draft_campaigns.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("workspace_users.id"), nullable=False)
    gmail_draft_id = Column(String(255))
    gmail_message_id = Column(String(255))
    status = Column(String(50), default='created')
    recipients = Column(JSON)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    sent_at = Column(DateTime(timezone=True))
    
    # Relationships
    draft_campaign = relationship("DraftCampaign", back_populates="gmail_drafts")
    user = relationship("WorkspaceUser", back_populates="gmail_drafts")

# State Transition Logs (Audit)
class StateTransitionLog(Base):
    __tablename__ = "state_transition_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String(50), nullable=False)  # 'campaign' or 'draft_campaign'
    entity_id = Column(Integer, nullable=False, index=True)
    from_status = Column(String(50), nullable=False)
    to_status = Column(String(50), nullable=False)
    triggered_by = Column(String(100))  # 'api', 'celery_task', etc.
    celery_task_id = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    log_metadata = Column(JSON)

# ==========================================
# ENTERPRISE ENGINE MODELS (Phase 1 Upgrade)
# ==========================================

# 1. Sending Engine
class SendJob(Base):
    __tablename__ = "send_jobs"
    
    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False)
    service_account_id = Column(Integer, ForeignKey("service_accounts.id"), nullable=True) # Assigned worker SA
    
    status = Column(Enum(JobStatus), default=JobStatus.PENDING, index=True)
    batch_size = Column(Integer, default=50)
    retry_count = Column(Integer, default=0)
    priority = Column(Integer, default=1) # 1=Low, 2=Normal, 3=High
    
    # Locking & Worker affinity
    worker_node = Column(String(255)) 
    locked_until = Column(DateTime(timezone=True))
    
    # Payload (IDs of recipients to process in this chunk)
    recipient_ids = Column(JSON) # List of Contact IDs or Email hashes
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    campaign = relationship("Campaign")
    service_account = relationship("ServiceAccount")

# 2. Privacy-Safe Tracking
class LinkMap(Base):
    __tablename__ = "link_maps"
    
    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    original_url = Column(Text, nullable=False)
    opaque_id = Column(String(64), unique=True, index=True) # The code in the URL
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class TrackingEvent(Base):
    __tablename__ = "tracking_events"
    
    id = Column(Integer, primary_key=True, index=True) # BigInteger in Prod
    event_type = Column(String(20), nullable=False) # 'open', 'click'
    
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    email_log_id = Column(Integer, ForeignKey("email_logs.id"), nullable=True)
    link_map_id = Column(Integer, ForeignKey("link_maps.id"), nullable=True)
    
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    
    # Privacy-safe Metadata
    user_agent = Column(Text) # Raw UA
    user_agent_type = Column(String(50)) # 'mobile', 'desktop', 'bot'
    geo_country = Column(String(2))
    ip_hash = Column(String(64)) # Anonymized IP
    
    # Relationships
    campaign = relationship("Campaign")
    # email_log = relationship("EmailLog") # Optional to avoid heavy joins

# 3. Enterprise Contacts (Scalable)
class EnterpriseContact(Base):
    __tablename__ = "contacts_enterprise"
    
    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, default=0) # Tenant isolation
    
    email_hash = Column(String(64), unique=True, index=True, nullable=False) # SHA-256
    email_encrypted = Column(Text) # Reversible if needed
    
    attributes = Column(JSON) # {name: "...", company: "..."}
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class ContactTag(Base):
    __tablename__ = "contact_tags"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False)

class ListMember(Base):
    __tablename__ = "list_members"
    
    id = Column(Integer, primary_key=True, index=True)
    contact_list_id = Column(Integer, ForeignKey("contact_lists.id"), nullable=False, index=True)
    contact_id = Column(Integer, ForeignKey("contacts_enterprise.id"), nullable=False, index=True)
    
    status = Column(String(20), default='active') # 'active', 'unsubscribed', 'bounced'
    tags = Column(JSON) # List of tag strings
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Composite unique constraint would be added in SQL or __table_args__
    # relationship triggers
    enterprise_contact = relationship("EnterpriseContact")
    contact_list = relationship("ContactList")

# 4. Analytics Aggregation
class DailyCampaignStats(Base):
    __tablename__ = "stats_campaign_daily"
    
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), primary_key=True)
    date = Column(Date, primary_key=True)
    
    sent = Column(Integer, default=0)
    delivered = Column(Integer, default=0)
    opens_unique = Column(Integer, default=0)
    clicks_unique = Column(Integer, default=0)
    bounces = Column(Integer, default=0)
    complaints = Column(Integer, default=0)
    
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())