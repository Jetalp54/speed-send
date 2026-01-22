
import logging
from sqlalchemy.orm import Session
from app import models
from app.models import Campaign, SendJob, JobStatus, ServiceAccount
from datetime import datetime
import math

logger = logging.getLogger(__name__)

class JobAllocator:
    @staticmethod
    def split_campaign_into_jobs(db: Session, campaign_id: int, batch_size: int = 50) -> int:
        """
        Splits a campaign into multiple SendJob rows.
        Returns the number of jobs created.
        """
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")
            
        if not campaign.recipients:
            logger.warning(f"Campaign {campaign_id} has no recipients to allocate.")
            return 0
            
        recipients = campaign.recipients # List of email strings or dicts
        total_recipients = len(recipients)
        total_jobs = math.ceil(total_recipients / batch_size)
        
        logger.info(f"Allocating Campaign {campaign_id}: {total_recipients} recipients -> {total_jobs} jobs (size {batch_size})")
        
        # Pre-fetch Senders if we want to pre-assign them (Round Robin)
        # OR we can leave service_account_id NULL and let the worker pick it up dynamically.
        # Strict Enterprise Rule: "Auto-rotate senders".
        # Dynamic assignment at runtime is safer for quota management.
        # We will create jobs with service_account_id=None initially.
        
        jobs_created = 0
        for i in range(0, total_recipients, batch_size):
            batch = recipients[i : i + batch_size]
            
            job = SendJob(
                campaign_id=campaign_id,
                status=JobStatus.PENDING,
                batch_size=len(batch),
                retry_count=0,
                priority=2, # Normal
                recipient_ids=batch, # Store the actual list of recipients for this batch
                created_at=datetime.utcnow()
            )
            db.add(job)
            jobs_created += 1
            
        try:
            db.commit()
            logger.info(f"Successfully allocated {jobs_created} jobs for Campaign {campaign_id}")
            return jobs_created
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to allocate jobs for Campaign {campaign_id}: {str(e)}")
            raise e
