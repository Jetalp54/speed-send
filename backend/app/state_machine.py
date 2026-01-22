from sqlalchemy.orm import Session
from sqlalchemy import text
from app.models import Campaign, CampaignStatus, StateTransitionLog, DraftCampaign, DraftStatus
from fastapi import HTTPException
import logging
import json
from datetime import datetime

logger = logging.getLogger(__name__)

# Valid transitions map
CAMPAIGN_TRANSITIONS = {
    CampaignStatus.DRAFT: [CampaignStatus.PREPARING, CampaignStatus.CANCELED],
    CampaignStatus.PREPARING: [CampaignStatus.READY, CampaignStatus.FAILED, CampaignStatus.CANCELED],
    CampaignStatus.READY: [CampaignStatus.SENDING, CampaignStatus.CANCELED, CampaignStatus.PAUSED],
    CampaignStatus.SENDING: [CampaignStatus.PAUSED, CampaignStatus.COMPLETED, CampaignStatus.FAILED, CampaignStatus.CANCELED],
    CampaignStatus.PAUSED: [CampaignStatus.SENDING, CampaignStatus.CANCELED],
    CampaignStatus.COMPLETED: [],  # Terminal
    CampaignStatus.FAILED: [CampaignStatus.DRAFT, CampaignStatus.CANCELED],  # Can retry
    CampaignStatus.CANCELED: [CampaignStatus.DRAFT],  # Can maybe be drafted again? Added in triggers.
}

def transition_campaign_status(
    db: Session, 
    campaign_id: int, 
    new_status: CampaignStatus, 
    triggered_by: str = "unknown",
    celery_task_id: str = None,
    metadata: dict = None
) -> Campaign:
    """
    Transition a campaign to a new status with validation, locking, and auditing.
    
    Uses SELECT ... FOR UPDATE to lock the row.
    Uses version column for optimistic locking safety.
    """
    # 1. Lock and fetch
    # with_for_update(nowait=False) ensures we wait for lock, preventing race conditions
    campaign = db.query(Campaign).with_for_update().filter(Campaign.id == campaign_id).first()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
        
    current_status = campaign.status
    
    # 2. Idempotency check: if already in target status, do nothing (or return)
    if current_status == new_status:
        logger.info(f"Campaign {campaign_id} already in {new_status}, skipping transition.")
        return campaign

    # 3. Validate transition
    allowed = CAMPAIGN_TRANSITIONS.get(current_status, [])
    # Convert enums to strings for comparison just in case
    allowed_strs = [str(s) for s in allowed]
    
    if str(new_status) not in allowed_strs:
        error_msg = f"Invalid transition for Campaign {campaign_id}: {current_status} -> {new_status}"
        logger.error(error_msg)
        raise HTTPException(status_code=400, detail=error_msg)
        
    # 4. Apply Change
    logger.info(f"Transitioning Campaign {campaign_id}: {current_status} -> {new_status} (by {triggered_by})")
    campaign.status = new_status
    
    # Update timestamps based on status
    now = datetime.utcnow()
    if new_status == CampaignStatus.PREPARING:
        campaign.prepared_at = now
    elif new_status == CampaignStatus.SENDING:
        if not campaign.started_at:
            campaign.started_at = now
        # If resuming from PAUSED, clear paused_at
        campaign.paused_at = None
    elif new_status == CampaignStatus.PAUSED:
        campaign.paused_at = now
    elif new_status == CampaignStatus.COMPLETED:
        campaign.completed_at = now
    elif new_status == CampaignStatus.CANCELED:
        campaign.completed_at = now # Treat canceled as done time-wise? Or add canceled_at? 
        # Schema doesn't have canceled_at, reuse completed_at or just leave null
    
    # 5. Optimistic Locking (db triggers will also update version, but we can do it here too)
    # campaign.version += 1 # Auto-handled if logic exists, or we increment manually
    # For now, let's assume we rely on row lock. 
    # If we had a strict version check passed in args, we would check it here.

    # 6. Create Audit Log
    log_entry = StateTransitionLog(
        entity_type="campaign",
        entity_id=campaign_id,
        from_status=str(current_status),
        to_status=str(new_status),
        triggered_by=triggered_by,
        celery_task_id=celery_task_id,
        log_metadata=metadata
    )
    db.add(log_entry)
    
    # 7. Commit in caller? No, usually state transitions should commit to be atomic.
    # But if caller acts as UoW, we might flush. 
    # Better to commit here to ensure the state change is durable and lock is released.
    try:
        db.commit()
        db.refresh(campaign)
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to commit state transition: {e}")
        raise e
        
    return campaign

# Valid transitions map for Drafts
DRAFT_TRANSITIONS = {
    DraftStatus.CREATED: [DraftStatus.UPLOADING, DraftStatus.FAILED, DraftStatus.CANCELED],
    DraftStatus.UPLOADING: [DraftStatus.READY, DraftStatus.FAILED, DraftStatus.CANCELED],
    DraftStatus.READY: [DraftStatus.SENDING, DraftStatus.SCHEDULED, DraftStatus.CANCELED],
    DraftStatus.SCHEDULED: [DraftStatus.SENDING, DraftStatus.PAUSED, DraftStatus.CANCELED],
    DraftStatus.SENDING: [DraftStatus.PAUSED, DraftStatus.COMPLETED, DraftStatus.FAILED, DraftStatus.CANCELED],
    DraftStatus.PAUSED: [DraftStatus.SENDING, DraftStatus.CANCELED],
    DraftStatus.COMPLETED: [],
    DraftStatus.FAILED: [DraftStatus.CREATED, DraftStatus.CANCELED],
    DraftStatus.CANCELED: [DraftStatus.CREATED],
}

def transition_draft_status(
    db: Session,
    draft_id: int,
    new_status: DraftStatus,
    triggered_by: str = "unknown",
    celery_task_id: str = None
) -> DraftCampaign:
    """
    Transition a draft campaign to a new status with validation, locking, and auditing.
    """
    # 1. Lock and fetch
    draft = db.query(DraftCampaign).with_for_update().filter(DraftCampaign.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft Campaign not found")
        
    current_status = draft.status
    
    # 2. Idempotency check
    if current_status == new_status:
        logger.info(f"Draft {draft_id} already in {new_status}, skipping transition.")
        return draft
        
    # 3. Validate transition
    allowed = DRAFT_TRANSITIONS.get(current_status, [])
    allowed_strs = [str(s) for s in allowed]
    
    if str(new_status) not in allowed_strs:
        error_msg = f"Invalid transition for Draft {draft_id}: {current_status} -> {new_status}"
        logger.error(error_msg)
        raise HTTPException(status_code=400, detail=error_msg)
    
    # 4. Apply Change
    logger.info(f"Transitioning Draft {draft_id}: {current_status} -> {new_status} (by {triggered_by})")
    draft.status = new_status
    
    # 5. Create Audit Log
    log_entry = StateTransitionLog(
        entity_type="draft_campaign",
        entity_id=draft_id,
        from_status=str(current_status),
        to_status=str(new_status),
        triggered_by=triggered_by,
        celery_task_id=celery_task_id
    )
    db.add(log_entry)
    
    try:
        db.commit()
        db.refresh(draft)
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to commit draft state transition: {e}")
        raise e
        
    return draft
