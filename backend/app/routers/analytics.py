
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
    # ... (existing code) ...
    stats = db.query(DailyCampaignStats).filter(
        DailyCampaignStats.campaign_id == campaign_id
    ).order_by(DailyCampaignStats.date).all()
    
    if not stats:
        return {
            "campaign_id": campaign_id,
            "total_sent": 0,
            "total_delivered": 0,
            "unique_opens": 0,
            "unique_clicks": 0,
            "daily_breakdown": []
        }

    total_sent = sum(s.sent for s in stats)
    total_delivered = sum(s.delivered for s in stats)
    total_opens = sum(s.opens_unique for s in stats)
    total_clicks = sum(s.clicks_unique for s in stats)
    
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

from app import models, schemas
from datetime import datetime, timedelta

@router.get("/draft/{draft_id}", response_model=schemas.GranularAnalyticsResponse)
async def get_draft_analytics(draft_id: int, db: Session = Depends(get_db)):
    """
    Detailed granular analytics for a draft campaign.
    Aggregates data from raw tracking_events.
    """
    # 1. Base Totals
    total_opens = db.query(models.TrackingEvent).filter(
        models.TrackingEvent.draft_campaign_id == draft_id,
        models.TrackingEvent.event_type == 'open'
    ).count()
    
    unique_opens = db.query(models.TrackingEvent.ip_hash).filter(
        models.TrackingEvent.draft_campaign_id == draft_id,
        models.TrackingEvent.event_type == 'open'
    ).distinct().count()
    
    total_clicks = db.query(models.TrackingEvent).filter(
        models.TrackingEvent.draft_campaign_id == draft_id,
        models.TrackingEvent.event_type == 'click'
    ).count()
    
    unique_clicks = db.query(models.TrackingEvent.ip_hash).filter(
        models.TrackingEvent.draft_campaign_id == draft_id,
        models.TrackingEvent.event_type == 'click'
    ).distinct().count()

    # 2. Distributions
    def get_distribution(column):
        results = db.query(column, func.count(column)).filter(
            models.TrackingEvent.draft_campaign_id == draft_id
        ).group_by(column).order_by(func.count(column).desc()).limit(10).all()
        return [schemas.AnalyticsPoint(label=str(r[0]) if r[0] else "Unknown", value=r[1]) for r in results]

    geo_countries = get_distribution(models.TrackingEvent.geo_country)
    geo_cities = get_distribution(models.TrackingEvent.geo_city)
    device_types = get_distribution(models.TrackingEvent.device_type)
    browsers = get_distribution(models.TrackingEvent.browser)
    os_systems = get_distribution(models.TrackingEvent.os)

    # 3. Time-series (Last 24 hours / Last 7 days)
    # Group by hour for last 24h
    now = datetime.utcnow()
    day_ago = now - timedelta(days=1)
    
    # We'll do a simple daily breakdown for now to show the concept
    timeseries_q = db.query(
        func.date_trunc('hour', models.TrackingEvent.timestamp).label('hour'),
        func.count(models.TrackingEvent.id).filter(models.TrackingEvent.event_type == 'open').label('opens'),
        func.count(models.TrackingEvent.id).filter(models.TrackingEvent.event_type == 'click').label('clicks')
    ).filter(
        models.TrackingEvent.draft_campaign_id == draft_id,
        models.TrackingEvent.timestamp >= day_ago
    ).group_by('hour').order_by('hour').all()

    timeseries = [
        schemas.AnalyticsTimeSeries(
            timestamp=r.hour.isoformat(),
            opens=r.opens,
            clicks=r.clicks
        ) for r in timeseries_q
    ]

    # 4. Recent Events
    recent_events_q = db.query(models.TrackingEvent).filter(
        models.TrackingEvent.draft_campaign_id == draft_id
    ).order_by(models.TrackingEvent.timestamp.desc()).limit(15).all()
    
    recent_events = []
    for e in recent_events_q:
        recent_events.append({
            "id": e.id,
            "event_type": e.event_type,
            "timestamp": e.timestamp.isoformat(),
            "geo_country": e.geo_country,
            "geo_city": e.geo_city,
            "os": e.os,
            "browser": e.browser,
            "device": e.device_type
        })

    return schemas.GranularAnalyticsResponse(
        draft_id=draft_id,
        total_opens=total_opens,
        unique_opens=unique_opens,
        total_clicks=total_clicks,
        unique_clicks=unique_clicks,
        geo_countries=geo_countries,
        geo_cities=geo_cities,
        device_types=device_types,
        browsers=browsers,
        os_systems=os_systems,
        timeseries=timeseries,
        recent_events=recent_events
    )
@router.get("/summary", response_model=schemas.GranularAnalyticsResponse)
async def get_global_analytics(db: Session = Depends(get_db)):
    """
    Global aggregate analytics across all campaigns.
    """
    # 1. Base Totals
    total_opens = db.query(models.TrackingEvent).filter(
        models.TrackingEvent.event_type == 'open'
    ).count()
    
    unique_opens = db.query(models.TrackingEvent.ip_hash).filter(
        models.TrackingEvent.event_type == 'open'
    ).distinct().count()
    
    total_clicks = db.query(models.TrackingEvent).filter(
        models.TrackingEvent.event_type == 'click'
    ).count()
    
    unique_clicks = db.query(models.TrackingEvent.ip_hash).filter(
        models.TrackingEvent.event_type == 'click'
    ).distinct().count()

    # 2. Distributions
    def get_distribution(column):
        results = db.query(column, func.count(column)).group_by(column).order_by(func.count(column).desc()).limit(10).all()
        return [schemas.AnalyticsPoint(label=str(r[0]) if r[0] else "Unknown", value=r[1]) for r in results]

    geo_countries = get_distribution(models.TrackingEvent.geo_country)
    geo_cities = get_distribution(models.TrackingEvent.geo_city)
    device_types = get_distribution(models.TrackingEvent.device_type)
    browsers = get_distribution(models.TrackingEvent.browser)
    os_systems = get_distribution(models.TrackingEvent.os)

    # 3. Time-series (Last 24 hours)
    now = datetime.utcnow()
    day_ago = now - timedelta(days=1)
    
    timeseries_q = db.query(
        func.date_trunc('hour', models.TrackingEvent.timestamp).label('hour'),
        func.count(models.TrackingEvent.id).filter(models.TrackingEvent.event_type == 'open').label('opens'),
        func.count(models.TrackingEvent.id).filter(models.TrackingEvent.event_type == 'click').label('clicks')
    ).filter(
        models.TrackingEvent.timestamp >= day_ago
    ).group_by('hour').order_by('hour').all()

    timeseries = [
        schemas.AnalyticsTimeSeries(
            timestamp=r.hour.isoformat(),
            opens=r.opens,
            clicks=r.clicks
        ) for r in timeseries_q
    ]

    # 4. Recent Events
    recent_events_q = db.query(models.TrackingEvent).order_by(models.TrackingEvent.timestamp.desc()).limit(20).all()
    
    recent_events = []
    for e in recent_events_q:
        recent_events.append({
            "id": e.id,
            "event_type": e.event_type,
            "timestamp": e.timestamp.isoformat(),
            "geo_country": e.geo_country,
            "geo_city": e.geo_city,
            "os": e.os,
            "browser": e.browser,
            "device": e.device_type
        })

    return schemas.GranularAnalyticsResponse(
        draft_id=0, # 0 means global
        total_opens=total_opens,
        unique_opens=unique_opens,
        total_clicks=total_clicks,
        unique_clicks=unique_clicks,
        geo_countries=geo_countries,
        geo_cities=geo_cities,
        device_types=device_types,
        browsers=browsers,
        os_systems=os_systems,
        timeseries=timeseries,
        recent_events=recent_events
    )
