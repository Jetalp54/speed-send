# ENTERPRISE-GRADE PERFORMANCE LAYER
# Redis caching + Connection pooling + Smart rate limiting

import redis
import json
import hashlib
from datetime import datetime, timedelta
from typing import Dict, Optional
import logging
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

logger = logging.getLogger(__name__)

class PerformanceCache:
    """Redis-based caching for credentials and API clients"""
    
    def __init__(self, redis_url: str = "redis://redis:6379/1"):
        self.redis_client = redis.from_url(redis_url, decode_responses=True)
        self.redis_binary = redis.from_url(redis_url, decode_responses=False)
        
    def cache_credentials(self, user_id: int, service_account_json: str, ttl: int = 3600):
        """Cache decrypted service account credentials (avoid repeated decryption)"""
        key = f"creds:sa:{user_id}"
        self.redis_client.setex(key, ttl, service_account_json)
        logger.info(f"Cached credentials for user {user_id}")
    
    def get_cached_credentials(self, user_id: int) -> Optional[str]:
        """Retrieve cached credentials"""
        key = f"creds:sa:{user_id}"
        return self.redis_client.get(key)
    
    def cache_gmail_token(self, user_email: str, token_data: dict, ttl: int = 3500):
        """Cache Gmail API access tokens (reuse until expiry)"""
        key = f"token:gmail:{user_email}"
        self.redis_client.setex(key, ttl, json.dumps(token_data))
    
    def get_gmail_token(self, user_email: str) -> Optional[dict]:
        """Get cached Gmail token"""
        key = f"token:gmail:{user_email}"
        data = self.redis_client.get(key)
        return json.loads(data) if data else None
    
    def increment_rate_limit(self, user_email: str, window: int = 60) -> int:
        """Track API calls for rate limiting (Gmail: 250 quota units/user/second)"""
        key = f"rate:gmail:{user_email}"
        pipe = self.redis_client.pipeline()
        pipe.incr(key)
        pipe.expire(key, window)
        result = pipe.execute()
        return result[0]
    
    def update_progress(self, task_id: str, completed: int, total: int, status: str = "processing"):
        """Real-time progress tracking"""
        key = f"progress:{task_id}"
        data = {
            "completed": completed,
            "total": total,
            "percentage": round((completed / total) * 100, 2) if total > 0 else 0,
            "status": status,
            "updated_at": datetime.utcnow().isoformat()
        }
        self.redis_client.setex(key, 300, json.dumps(data))
    
    def get_progress(self, task_id: str) -> Optional[dict]:
        """Get task progress"""
        key = f"progress:{task_id}"
        data = self.redis_client.get(key)
        return json.loads(data) if data else None


class GmailClientPool:
    """Connection pool for Gmail API clients (reuse authenticated sessions)"""
    
    def __init__(self, cache: PerformanceCache):
        self.cache = cache
        self._pool: Dict[str, tuple] = {}  # user_email -> (service, expires_at)
    
    def get_or_create_client(self, user_email: str, credentials: Credentials, force_new: bool = False):
        """Get cached Gmail client or create new one"""
        now = datetime.utcnow()
        
        # Check in-memory pool first
        if not force_new and user_email in self._pool:
            service, expires_at = self._pool[user_email]
            if expires_at > now:
                logger.debug(f"Reusing pooled Gmail client for {user_email}")
                return service
        
        # Create new client
        logger.info(f"Creating fresh Gmail API client for {user_email}")
        service = build('gmail', 'v1', credentials=credentials, cache_discovery=False)
        
        # Cache for 50 minutes (tokens expire in 60 minutes)
        expires_at = now + timedelta(minutes=50)
        self._pool[user_email] = (service, expires_at)
        
        return service
    
    def cleanup_expired(self):
        """Remove expired clients from pool"""
        now = datetime.utcnow()
        expired = [email for email, (_, exp) in self._pool.items() if exp <= now]
        for email in expired:
            del self._pool[email]
        if expired:
            logger.info(f"Cleaned up {len(expired)} expired Gmail clients")


class SmartRateLimiter:
    """Intelligent rate limiting to maximize throughput"""
    
    def __init__(self, cache: PerformanceCache):
        self.cache = cache
        
        # Gmail API Quotas (conservative limits for safety)
        self.QUOTA_PER_USER_PER_SECOND = 200  # Gmail allows 250, we use 200 for buffer
        self.BATCH_SIZE_OPTIMAL = 100  # Gmail batch API limit
        self.MAX_CONCURRENT_REQUESTS = 10  # Max parallel requests per user
    
    def can_proceed(self, user_email: str) -> bool:
        """Check if we can make API call without hitting rate limit"""
        current_rate = self.cache.increment_rate_limit(user_email, window=1)
        return current_rate <= self.QUOTA_PER_USER_PER_SECOND
    
    def calculate_optimal_batch_size(self, total_drafts: int, users_count: int) -> int:
        """Calculate optimal batch size based on workload"""
        avg_drafts_per_user = total_drafts / users_count
        
        if avg_drafts_per_user <= 20:
            return 20  # Small batches for low volume
        elif avg_drafts_per_user <= 50:
            return 50  # Medium batches
        else:
            return 100  # Max batch size for high volume
    
    def get_stagger_delay(self, user_index: int, total_users: int) -> float:
        """Calculate stagger delay to distribute load"""
        if total_users <= 50:
            return 0  # No delay for small batches
        elif total_users <= 200:
            return user_index * 0.01  # 10ms stagger
        else:
            return user_index * 0.02  # 20ms stagger for large batches


# Global instances (singleton pattern)
_perf_cache = None
_client_pool = None
_rate_limiter = None

def get_performance_cache() -> PerformanceCache:
    global _perf_cache
    if _perf_cache is None:
        _perf_cache = PerformanceCache()
    return _perf_cache

def get_client_pool() -> GmailClientPool:
    global _client_pool
    if _client_pool is None:
        _client_pool = GmailClientPool(get_performance_cache())
    return _client_pool

def get_rate_limiter() -> SmartRateLimiter:
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = SmartRateLimiter(get_performance_cache())
    return _rate_limiter
