from app.celery_app import celery_app
from app.database import SessionLocal
from app.models import Campaign, CampaignStatus
from app.state_machine import transition_campaign_status
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

@celery_app.task(bind=True)
def check_stuck_campaigns(self):
    """
    Periodic task to check for campaigns stuck in intermediate states.
    - PREPARING > 30 minutes -> FAILED
    - SENDING > 4 hours without update -> PAUSED
    """
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        logger.info(f"Running maintenance check for stuck campaigns at {now}")
        
        # 1. Check PREPARING stuck
        preparing_timeout_threshold = now - timedelta(minutes=30)
        stuck_preparing = db.query(Campaign).filter(
            Campaign.status == CampaignStatus.PREPARING,
            Campaign.updated_at < preparing_timeout_threshold
        ).all()
        
        if stuck_preparing:
            logger.info(f"Found {len(stuck_preparing)} campaigns stuck in PREPARING")
        
        for campaign in stuck_preparing:
            logger.warning(f"Campaign {campaign.id} stuck in PREPARING since {campaign.updated_at}. Failing it.")
            try:
                transition_campaign_status(
                    db,
                    campaign.id,
                    CampaignStatus.FAILED,
                    triggered_by="maintenance:timeout_check",
                    metadata={"reason": "Stuck in PREPARING > 30 mins"}
                )
            except Exception as e:
                logger.error(f"Failed to transition stuck campaign {campaign.id}: {e}")
                
        # 2. Check SENDING stuck (no updates for 4 hours)
        sending_timeout_threshold = now - timedelta(hours=4)
        stuck_sending = db.query(Campaign).filter(
            Campaign.status == CampaignStatus.SENDING,
            Campaign.updated_at < sending_timeout_threshold
        ).all()
        
        if stuck_sending:
             logger.info(f"Found {len(stuck_sending)} campaigns stuck in SENDING (inactive > 4h)")

        for campaign in stuck_sending:
            logger.warning(f"Campaign {campaign.id} stuck in SENDING since {campaign.updated_at}. Pausing it.")
            try:
                transition_campaign_status(
                    db,
                    campaign.id,
                    CampaignStatus.PAUSED,
                    triggered_by="maintenance:timeout_check",
                    metadata={"reason": "Stuck in SENDING > 4 hours (no activity)"}
                )
            except Exception as e:
                logger.error(f"Failed to transition stuck campaign {campaign.id}: {e}")

    finally:
        db.close()
