from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import logging
import asyncio
import json

from app.database import get_db
from app.models import (
    Campaign, CampaignStatus, ServiceAccount, EmailLog, EmailStatus,
    CampaignSender, WorkspaceUser
)
from app.schemas import (
    CampaignCreate, CampaignUpdate, CampaignResponse,
    CampaignControl, EmailLogResponse, CampaignStatistics
)
from app.tasks import send_campaign_emails
from fastapi import Response, Request
from fastapi.responses import StreamingResponse
# Correctly import the updated functions
from app.daily_limits import get_all_accounts_statistics, get_account_statistics
from app.tasks_v2 import get_campaign_progress_key
import redis
import json

router = APIRouter(prefix="/campaigns")

# Module logger
logger = logging.getLogger(__name__)

# Redis connection (read-only usage here)
redis_client = redis.from_url("redis://redis:6379/0", decode_responses=True)

def _logs_key(campaign_id: int) -> str:
    return f"campaign:{campaign_id}:logs"

@router.get("", response_model=List[CampaignResponse])
async def list_campaigns(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = db.query(Campaign)
    if status:
        query = query.filter(Campaign.status == status)
    campaigns = query.order_by(Campaign.created_at.desc()).offset(skip).limit(limit).all()
    return campaigns

@router.get("/{campaign_id}/", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: int,
    db: Session = Depends(get_db)
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign

@router.post("", response_model=CampaignResponse)
async def create_campaign(
    campaign: CampaignCreate,
    db: Session = Depends(get_db)
):
    try:
        logger.info(f"🔍 Creating campaign with sender_account_ids: {campaign.sender_account_ids}")
        sender_accounts = db.query(ServiceAccount).filter(
            ServiceAccount.id.in_(campaign.sender_account_ids)
        ).all()
        logger.info(f"🔍 Found {len(sender_accounts)} sender accounts")
        if not sender_accounts:
            raise HTTPException(status_code=400, detail="No sender accounts found")
        
        # CRITICAL: Log body_html to ensure it's being saved correctly
        logger.info(f"📝 Creating campaign - body_html length: {len(campaign.body_html) if campaign.body_html else 0}, body_plain length: {len(campaign.body_plain) if campaign.body_plain else 0}")
        if campaign.body_html:
            logger.info(f"📝 body_html preview (first 200 chars): {campaign.body_html[:200]}...")
        else:
            logger.warning(f"⚠️ WARNING: body_html is None or empty when creating campaign!")
        
        new_campaign = Campaign(
            name=campaign.name,
            subject=campaign.subject,
            body_html=campaign.body_html,
            body_plain=campaign.body_plain,
            from_name=campaign.from_name,
            recipients=campaign.recipients,
            total_recipients=len(campaign.recipients),
            pending_count=len(campaign.recipients),
            status=CampaignStatus.DRAFT,
            header_type=campaign.header_type,
            custom_header=campaign.custom_header
        )
        db.add(new_campaign)
        db.flush()

        for account in sender_accounts:
            association = CampaignSender(campaign_id=new_campaign.id, service_account_id=account.id)
            db.add(association)
            logger.info(f"🔍 Created CampaignSender association: campaign_id={new_campaign.id}, service_account_id={account.id}")
        
        db.commit()
        db.refresh(new_campaign)
        logger.info(f"📝 Campaign {new_campaign.id} created in DRAFT status")
        return new_campaign
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create campaign: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create campaign: {str(e)}")

@router.patch("/{campaign_id}/", response_model=CampaignResponse)
async def update_campaign(
    campaign_id: int,
    campaign_update: CampaignUpdate,
    db: Session = Depends(get_db)
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    update_data = campaign_update.dict(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(campaign, key, value)
    
    if 'sender_account_ids' in update_data:
        db.query(CampaignSender).filter(CampaignSender.campaign_id == campaign_id).delete()
        for account_id in update_data['sender_account_ids']:
            association = CampaignSender(campaign_id=campaign_id, service_account_id=account_id)
            db.add(association)

    campaign.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(campaign)
    return campaign

@router.post("/{campaign_id}/launch/")
async def launch_campaign(
    campaign_id: int,
    db: Session = Depends(get_db)
):
    # This is a legacy endpoint, the new flow uses prepare -> resume
    raise HTTPException(status_code=400, detail="Legacy launch endpoint. Use /prepare and /resume instead.")

@router.delete("/{campaign_id}/")
async def delete_campaign(
    campaign_id: int,
    db: Session = Depends(get_db)
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status in [CampaignStatus.SENDING, CampaignStatus.PREPARING]:
        raise HTTPException(status_code=400, detail="Cannot delete active campaigns")
    db.delete(campaign)
    db.commit()
    return {"message": "Campaign deleted successfully"}

# --- New lifecycle endpoints ---

@router.post("/{campaign_id}/prepare/")
async def prepare_campaign_endpoint(
    campaign_id: int,
    db: Session = Depends(get_db)
):
    from app.tasks_v2 import prepare_campaign_redis
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status not in [CampaignStatus.DRAFT, CampaignStatus.FAILED]:
        raise HTTPException(status_code=400, detail=f"Can only prepare DRAFT/FAILED campaigns. Current: {campaign.status}")
    
    try:
        task = prepare_campaign_redis.delay(campaign_id)
        campaign.status = CampaignStatus.PREPARING
        db.commit()
        return {"message": "Campaign preparation started", "task_id": str(task.id)}
    except Exception as e:
        logger.error(f"Failed to start campaign preparation: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start preparation: {str(e)}")

@router.post("/{campaign_id}/control/")
async def control_campaign_endpoint(
    campaign_id: int,
    control: CampaignControl,
    db: Session = Depends(get_db)
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    if control.action == "pause":
        if campaign.status not in [CampaignStatus.SENDING]:
            raise HTTPException(status_code=400, detail=f"Cannot pause campaign in {campaign.status} status.")
        campaign.status = CampaignStatus.PAUSED
        campaign.paused_at = datetime.utcnow()
        db.commit()
        logger.info(f"Campaign {campaign_id} paused.")
        return {"message": "Campaign paused successfully"}

    elif control.action == "resume":
        if campaign.status not in [CampaignStatus.PAUSED, CampaignStatus.READY]:
            raise HTTPException(status_code=400, detail=f"Cannot resume campaign in {campaign.status} status.")
        
        # If it was paused, set to sending and re-trigger the resume task
        campaign.status = CampaignStatus.SENDING
        campaign.paused_at = None # Clear paused_at
        db.commit()
        
        # Re-trigger the resume task to continue sending
        from app.tasks_v2 import resume_campaign_instant
        task = resume_campaign_instant.delay(campaign_id)
        campaign.celery_task_id = str(task.id) # Update task ID if a new one is created
        db.commit()

        logger.info(f"Campaign {campaign_id} resumed.")
        return {"message": "Campaign resumed successfully", "task_id": str(task.id)}

    elif control.action == "cancel":
        if campaign.status in [CampaignStatus.COMPLETED, CampaignStatus.CANCELED]:
            raise HTTPException(status_code=400, detail=f"Cannot cancel campaign in {campaign.status} status.")
        
        campaign.status = CampaignStatus.CANCELED
        campaign.completed_at = datetime.utcnow() # Mark as completed for tracking purposes
        db.commit()

        # Clear Redis task queue for this campaign
        redis_key = f"campaign:{campaign_id}:tasks"
        redis_client.delete(redis_key)
        logger.info(f"Campaign {campaign_id} canceled and Redis queue cleared.")
        return {"message": "Campaign canceled successfully"}

    else:
        raise HTTPException(status_code=400, detail="Invalid control action specified.")

@router.post("/{campaign_id}/resume/")
async def resume_campaign_endpoint(
    campaign_id: int,
    db: Session = Depends(get_db)
):
    from app.tasks_v2 import resume_campaign_instant
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status not in [CampaignStatus.READY, CampaignStatus.PAUSED]:
        raise HTTPException(status_code=400, detail=f"Campaign must be READY or PAUSED. Current: {campaign.status}")

    try:
        task = resume_campaign_instant.delay(campaign_id)
        campaign.status = CampaignStatus.SENDING
        campaign.celery_task_id = str(task.id)
        campaign.started_at = datetime.utcnow()
        db.commit()
        return {"message": "Campaign resumed", "task_id": str(task.id)}
    except Exception as e:
        logger.error(f"Failed to resume campaign: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to resume: {str(e)}")

@router.post("/{campaign_id}/duplicate/", response_model=CampaignResponse)
async def duplicate_campaign(
    campaign_id: int,
    db: Session = Depends(get_db)
):
    """Duplicate an existing campaign"""
    try:
        original_campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not original_campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        
        # Create new campaign with same data but new name
        new_campaign = Campaign(
            name=f"{original_campaign.name} (Copy)",
            subject=original_campaign.subject,
            body_html=original_campaign.body_html,
            body_plain=original_campaign.body_plain,
            from_name=original_campaign.from_name,
            recipients=original_campaign.recipients,
            total_recipients=original_campaign.total_recipients,
            pending_count=original_campaign.pending_count,
            status=CampaignStatus.DRAFT,
            header_type=original_campaign.header_type,
            custom_header=original_campaign.custom_header
        )
        
        db.add(new_campaign)
        db.flush()
        
        # Copy sender accounts
        original_senders = db.query(CampaignSender).filter(CampaignSender.campaign_id == campaign_id).all()
        for sender in original_senders:
            new_sender = CampaignSender(campaign_id=new_campaign.id, service_account_id=sender.service_account_id)
            db.add(new_sender)
        
        db.commit()
        db.refresh(new_campaign)
        
        logger.info(f"Campaign {campaign_id} duplicated as {new_campaign.id}")
        return new_campaign
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to duplicate campaign: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to duplicate campaign: {str(e)}")

# Return plain dict to avoid strict response validation issues causing 422
@router.get("/statistics/")
async def get_general_statistics(db: Session = Depends(get_db)):
    """
    Get comprehensive campaign and account statistics using a single DB session.
    """
    try:
        account_stats = get_all_accounts_statistics(db=db)
        logger.info(f"🔍 Account stats: {account_stats}")
        
        total_campaigns = db.query(Campaign).count()
        active_campaigns = db.query(Campaign).filter(Campaign.status == CampaignStatus.SENDING).count()
        completed_campaigns = db.query(Campaign).filter(Campaign.status == CampaignStatus.COMPLETED).count()
        
        today_start = datetime.combine(datetime.now().date(), datetime.min.time())
        today_sent = db.query(EmailLog).filter(EmailLog.status == EmailStatus.SENT, EmailLog.created_at >= today_start).count()
        total_sent = db.query(EmailLog).filter(EmailLog.status == EmailStatus.SENT).count()
        
        total_daily_limit = sum(acc.get('daily_limit', 0) for acc in account_stats)
        total_sent_today = sum(acc.get('daily_sent', 0) for acc in account_stats)

        # Build a permissive dict response to avoid any validation issues
        response_data = {
            "accounts": account_stats or [],
            "campaigns": {"total": total_campaigns, "active": active_campaigns, "completed": completed_campaigns},
            "emails": {"sent_today": today_sent, "sent_all_time": total_sent},
            "daily_limits": {
                "total_daily_limit": total_daily_limit,
                "total_sent_today": total_sent_today,
                "total_remaining": total_daily_limit - total_sent_today,
            },
        }
        logger.info("Statistics response (dict) created successfully")
        return response_data
    except Exception as e:
        logger.error(f"Error getting statistics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get statistics: {str(e)}")

@router.get("/{campaign_id}/progress/")
async def get_campaign_progress(
    campaign_id: int,
    db: Session = Depends(get_db)
):
    """Return current progress counters and status.
    Combines Redis progress hash with DB campaign status.
    """
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    progress = redis_client.hgetall(get_campaign_progress_key(campaign_id)) or {}
    # cast numbers safely
    def to_int(v):
        try:
            return int(v)
        except Exception:
            return 0
    response = {
        "status": campaign.status if campaign else None,
        "total": to_int(progress.get("total")),
        "sent": to_int(progress.get("sent")),
        "failed": to_int(progress.get("failed")),
        "pending": to_int(progress.get("pending")),
    }
    return response

@router.get("/{campaign_id}/logs/live")
async def get_campaign_logs_live(
    campaign_id: int,
    offset: int = 0,
    limit: int = 200
):
    """Return log lines from Redis list with pagination by offset.
    Client can poll with the returned next_offset.
    """
    key = _logs_key(campaign_id)
    length = redis_client.llen(key)
    if offset < 0:
        offset = 0
    if offset >= length:
        return {"items": [], "next_offset": length}
    end = min(length - 1, offset + limit - 1)
    raw_items = redis_client.lrange(key, offset, end) or []
    items = []
    for raw in raw_items:
        try:
            items.append(json.loads(raw))
        except Exception:
            items.append({"ts": None, "message": raw})
    return {"items": items, "next_offset": end + 1}


@router.get("/{campaign_id}/logs/", response_model=List[EmailLogResponse])
async def get_campaign_logs(
    campaign_id: int,
    status: Optional[EmailStatus] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = db.query(EmailLog).filter(EmailLog.campaign_id == campaign_id)
    if status:
        query = query.filter(EmailLog.status == status)
    logs = query.order_by(EmailLog.created_at.desc()).offset(skip).limit(limit).all()
    return logs
