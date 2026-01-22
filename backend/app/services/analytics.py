
from sqlalchemy.orm import Session
from sqlalchemy import func, text, distinct
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.models import Campaign, EmailLog, TrackingEvent, DailyCampaignStats, EmailStatus
import logging
from datetime import date

logger = logging.getLogger(__name__)

class AnalyticsService:
    def __init__(self, db: Session):
        self.db = db

    def aggregate_campaign_stats(self, campaign_id: int):
        """
        Aggregates stats for a campaign and updates DailyCampaignStats.
        For simplicity in this version, we aggregate ALL time into today's date
        or we aggregate Total and store in Daily with date=today (snapshot).
        
        Proper Time-Series: Group by date(created_at/timestamp).
        Simplified Enterprise: Just get totals and update the row for 'today' or a single row per campaign if we don't need history.
        
        Let's do: Total Aggregate (Snapshot) stored in a row keyed by today's date? 
        Or just 1 row per campaign?
        Model `DailyCampaignStats` has (campaign_id, date) PK. 
        So we should group by date.
        """
        try:
            # 1. Email Logs Stats (Sent, Delivered, Bounces, Complaints/Failed)
            # Group by Date(sent_at)
            # This can be expensive. 
            # Optimization: Only query since last update? 
            # For now: Full Re-calc (Correctness > Speed for <1M).
            
            # Simple approach: Calculate TOTALS and put them in a record for today (cumulative)
            # OR Group by Date.
            # Let's group by Date(sent_at) for EmailLog
            
            # Query: Date, Status, Count
            email_stats = self.db.query(
                func.date(EmailLog.sent_at).label('d'),
                EmailLog.status,
                func.count(EmailLog.id)
            ).filter(
                EmailLog.campaign_id == campaign_id,
                EmailLog.sent_at.isnot(None)
            ).group_by(
                func.date(EmailLog.sent_at),
                EmailLog.status
            ).all()
            
            # 2. Tracking Stats (Opens, Clicks)
            # Group by Date(timestamp)
            track_stats = self.db.query(
                func.date(TrackingEvent.timestamp).label('d'),
                TrackingEvent.event_type,
                func.count(distinct(TrackingEvent.email_log_id)) # Unique per day? Or Unique Total?
                # Usually Unique Open is Unique Person. If processed on day X and Y, is it 2 unique opens?
                # Standard: Unique per Campaign.
                # If we split by day, we might double count unique users across days.
                # Complexity!
                # Simplified: Just count raw events per day for trends, 
                # AND maintain a "Total" record.
            ).filter(
                TrackingEvent.campaign_id == campaign_id
            ).group_by(
                func.date(TrackingEvent.timestamp),
                TrackingEvent.event_type
            ).all()

            # Process into dictionary: Date -> Stats
            data_map = {} 
            
            # Helper
            def get_rec(d):
                if not d: return None
                if d not in data_map:
                    data_map[d] = {
                        'sent': 0, 'delivered': 0, 'opens_unique': 0, 
                        'clicks_unique': 0, 'bounces': 0, 'complaints': 0
                    }
                return data_map[d]

            for d, status, count in email_stats:
                r = get_rec(d)
                if not r: continue
                if status == EmailStatus.SENT:
                    r['sent'] += count
                    r['delivered'] += count # Assumption: Sent = Delivered until bounced
                elif status == EmailStatus.BOUNCED:
                    r['bounces'] += count
                elif status == EmailStatus.FAILED:
                    r['bounces'] += count # Treat fail as hard bounce/fail

            for d, etype, count in track_stats:
                 r = get_rec(d)
                 if not r: continue
                 if etype == 'open':
                     r['opens_unique'] = count # This is actually Unique-Per-Day in this query
                 elif etype == 'click':
                     r['clicks_unique'] = count

            # Upsert
            for d, stats in data_map.items():
                stmt = pg_insert(DailyCampaignStats).values(
                    campaign_id=campaign_id,
                    date=d,
                    **stats
                )
                stmt = stmt.on_conflict_do_update(
                    index_elements=['campaign_id', 'date'],
                    set_=stats
                )
                self.db.execute(stmt)
            
            self.db.commit()
            return len(data_map)
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to aggregate stats for campaign {campaign_id}: {e}")
            raise e
