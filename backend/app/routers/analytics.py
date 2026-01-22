
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models import DailyCampaignStats, Campaign
from typing import List, Dict

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("/campaign/{campaign_id}")
async def get_campaign_analytics(campaign_id: int, db: Session = Depends(get_db)):
    """
    Get aggregated analytics for a campaign from the cache/aggregation table.
    Very fast read.
    """
    # 1. Fetch Aggregated Data
    stats = db.query(DailyCampaignStats).filter(
        DailyCampaignStats.campaign_id == campaign_id
    ).order_by(DailyCampaignStats.date).all()
    
    if not stats:
        # If no stats yet (e.g. just started), returns zeroes or try to fetch from main table?
        # Enterprise way: Returns empty structure or zeros.
        return {
            "campaign_id": campaign_id,
            "total_sent": 0,
            "total_delivered": 0,
            "unique_opens": 0,
            "unique_clicks": 0,
            "daily_breakdown": []
        }

    # 2. Sum up totals
    total_sent = sum(s.sent for s in stats)
    total_delivered = sum(s.delivered for s in stats)
    total_opens = sum(s.opens_unique for s in stats)
    total_clicks = sum(s.clicks_unique for s in stats)
    
    # 3. Format Breakdown
    breakdown = []
    for s in stats:
        breakdown.append({
            "date": s.date,
            "sent": s.sent,
            "delivered": s.delivered,
            "opens_unique": s.opens_unique,
            "clicks_unique": s.clicks_unique,
            "bounces": s.bounces,
            "complaints": s.complaints
        })

    return {
        "campaign_id": campaign_id,
        "total_sent": total_sent,
        "total_delivered": total_delivered,
        "unique_opens": total_opens,
        "unique_clicks": total_clicks,
        "daily_breakdown": breakdown
    }
