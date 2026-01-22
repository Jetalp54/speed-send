"""
Distributed Quota Management Service
Uses Redis for real-time token buckets and daily counters.
Synchronizes with PostgreSQL for persistence.
"""
import redis
import logging
from datetime import datetime, date
from app.database import SessionLocal
from app.models import ServiceAccount, WorkspaceUser
from app.config import settings

logger = logging.getLogger(__name__)

# Redis Connection (Reuse existing URL from config)
redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

class QuotaManager:
    """
    Manages quotas and rate limits for Service Accounts and Users.
    Enforces:
    1. Daily Limit (e.g., 2000 emails/day per Service Account)
    2. Per-Second Rate Limit (e.g., 10 emails/sec per User)
    3. Global Safety Limits
    """

    @staticmethod
    def get_service_account_daily_key(service_account_id: int) -> str:
        today = date.today().isoformat()
        return f"quota:sa:{service_account_id}:daily:{today}"

    @staticmethod
    def get_user_rate_limit_key(user_email: str) -> str:
        return f"ratelimit:user:{user_email}"

    @staticmethod
    def check_and_reserve(service_account_id: int, count: int) -> bool:
        """
        Check if SA has enough daily quota and reserve it atomically.
        Returns True if reservation successful, False if limit exceeded.
        """
        key = QuotaManager.get_service_account_daily_key(service_account_id)
        
        # Get current daily limit from DB (or cache)
        # For performance, we fetch from DB only if cache missing
        limit_key = f"quota:sa:{service_account_id}:limit"
        daily_limit = redis_client.get(limit_key)
        
        if daily_limit is None:
            db = SessionLocal()
            try:
                sa = db.query(ServiceAccount).filter(ServiceAccount.id == service_account_id).first()
                if sa:
                    daily_limit = sa.daily_limit if sa.daily_limit is not None else 2000
                    redis_client.setex(limit_key, 300, daily_limit) # Cache for 5 mins
                else:
                    return False # SA not found
            finally:
                db.close()
        
        try:
            daily_limit = int(daily_limit)
        except (TypeError, ValueError):
            daily_limit = 2000 # Fallback default
        
        # Atomic increment check
        # INCRBY returns the new value
        new_usage = redis_client.incrby(key, count)
        
        # Set expiry for this key (24h) if it's new
        if new_usage == count:
            redis_client.expire(key, 86400)
            
        if new_usage > daily_limit:
            # Rollback the increment if it exceeded limit
            # This is "optimistic" reservation. If failed, we revert.
            redis_client.decrby(key, count)
            logger.warning(f"Quota exceeded for SA {service_account_id}: Limit {daily_limit}, Attempted {new_usage}")
            return False
            
        return True

    @staticmethod
    def sync_usage_to_db(service_account_id: int):
        """
        Flush Redis counter to DB for persistence.
        Should be called periodically or after batch completion.
        """
        key = QuotaManager.get_service_account_daily_key(service_account_id)
        current_usage = redis_client.get(key)
        
        if current_usage:
            db = SessionLocal()
            try:
                sa = db.query(ServiceAccount).filter(ServiceAccount.id == service_account_id).first()
                if sa:
                    # We trust Redis as the source of truth for "today"
                    # But we only increase, never decrease DB (safety)
                    redis_val = int(current_usage)
                    if redis_val > sa.daily_sent:
                        sa.daily_sent = redis_val
                        sa.last_synced = datetime.utcnow()
                        db.commit()
            except Exception as e:
                logger.error(f"Failed to sync quota to DB: {e}")
            finally:
                db.close()

    @staticmethod
    def check_rate_limit(user_email: str, limit_per_sec: int = 10) -> bool:
        """
        Simple Token Bucket / Window for rate limiting.
        Returns True if allowed, False if throttled.
        """
        key = QuotaManager.get_user_rate_limit_key(user_email)
        current = redis_client.incr(key)
        
        if current == 1:
            redis_client.expire(key, 1) # Window resets every second
            
        if current > limit_per_sec:
            return False
            
        return True
