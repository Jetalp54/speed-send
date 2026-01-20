# SCHEDULED RESUME API ENDPOINTS
# PowerMTA-style scheduled draft launching

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.tasks_scheduled_resume import start_scheduled_resume, resume_all_user_drafts_task
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)
router_resume = APIRouter()

class ScheduledResumeConfig(BaseModel):
    repetitions: int  # Number of times to repeat
    interval_seconds: int = 1  # Seconds between each repetition

@router_resume.post("/drafts/{draft_id}/resume-now")
def resume_all_drafts_now(draft_id: int, db: Session = Depends(get_db)):
    """
    RESUME ALL GMAIL DRAFTS immediately for all users in this campaign.
    Sends ALL drafts found in users' Gmail accounts (not just app-created ones).
    
    This is like clicking "Send All Drafts" - sends everything immediately.
    """
    from sqlalchemy.orm import joinedload
    from celery import group
    
    campaign = db.query(models.DraftCampaign).options(
        joinedload(models.DraftCampaign.selected_users).joinedload(models.DraftCampaignUser.user)
    ).filter(models.DraftCampaign.id == draft_id).first()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    users = [assoc.user for assoc in campaign.selected_users if assoc.user]
    
    if not users:
        raise HTTPException(status_code=400, detail="No users found")
    
    logger.info(f"🚀 RESUME NOW: Launching all drafts for {len(users)} users")
    
    # Launch resume tasks for ALL users in parallel
    tasks = [resume_all_user_drafts_task.s(user.id) for user in users]
    job = group(tasks)
    result = job.apply_async()
    
    return {
        "success": True,
        "message": f"Resume queued for {len(users)} users",
        "task_id": result.id,
        "users_count": len(users),
        "mode": "immediate"
    }


@router_resume.post("/drafts/{draft_id}/resume-scheduled")
def resume_all_drafts_scheduled(
    draft_id: int,
    config: ScheduledResumeConfig,
    db: Session = Depends(get_db)
):
    """
    START SCHEDULED RESUME (PowerMTA-style).
    
    Automatically resumes (sends) ALL Gmail drafts at regular intervals.
    
    Example: repetitions=20, interval_seconds=1
    - Iteration 1: Resume all drafts (immediate)
    - Wait 1 second
    - Iteration 2: Resume all drafts
    - Wait 1 second
    - ... continues for 20 iterations
    
    Perfect for:
    - Warming up accounts gradually
    - Spreading out large email blasts
    - Rate limit management
    """
    campaign = db.query(models.DraftCampaign).filter(models.DraftCampaign.id == draft_id).first()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    if config.repetitions < 1 or config.repetitions > 1000:
        raise HTTPException(status_code=400, detail="Repetitions must be between 1 and 1000")
    
    if config.interval_seconds < 1 or config.interval_seconds > 3600:
        raise HTTPException(status_code=400, detail="Interval must be between 1 and 3600 seconds")
    
    logger.info(f"🔄 SCHEDULED RESUME: Campaign {draft_id}, {config.repetitions} reps, {config.interval_seconds}s interval")
    
    # Start the scheduled resume process
    result = start_scheduled_resume(
        draft_campaign_id=draft_id,
        repetitions=config.repetitions,
        interval_seconds=config.interval_seconds
    )
    
    return {
        **result,
        "config": {
            "repetitions": config.repetitions,
            "interval_seconds": config.interval_seconds,
            "total_duration_estimate": f"{config.repetitions * config.interval_seconds} seconds"
        }
    }


@router_resume.post("/drafts/{draft_id}/resume-stop")
def stop_scheduled_resume(draft_id: int, db: Session = Depends(get_db)):
    """
    STOP ongoing scheduled resume for a campaign.
    """
    campaign = db.query(models.DraftCampaign).filter(models.DraftCampaign.id == draft_id).first()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Update status to stop future iterations
    campaign.status = 'stopped'
    db.commit()
    
    logger.info(f"🛑 STOPPED scheduled resume for campaign {draft_id}")
    
    return {
        "success": True,
        "message": "Scheduled resume stopped",
        "note": "Current iteration will complete, but no new iterations will start"
    }


@router_resume.get("/drafts/{draft_id}/resume-status")
def get_resume_status(draft_id: int, db: Session = Depends(get_db)):
    """
    Get status of scheduled resume for a campaign.
    """
    campaign = db.query(models.DraftCampaign).filter(models.DraftCampaign.id == draft_id).first()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Get user count
    from sqlalchemy.orm import joinedload
    campaign_with_users = db.query(models.DraftCampaign).options(
        joinedload(models.DraftCampaign.selected_users)
    ).filter(models.DraftCampaign.id == draft_id).first()
    
    users_count = len(campaign_with_users.selected_users)
    
    return {
        "campaign_id": draft_id,
        "campaign_name": campaign.name,
        "status": campaign.status,
        "users_count": users_count,
        "is_scheduled": campaign.status == 'scheduled',
        "is_stopped": campaign.status == 'stopped',
        "is_completed": campaign.status == 'completed'
    }
