
import logging
import json
import redis
import redis.asyncio as aioredis
from datetime import datetime
from app.config import settings

logger = logging.getLogger(__name__)

class LogManager:
    """
    Centralized manager for live logging.
    Handles both Synchronous (standard execution) and Asynchronous (FastAPI/asyncio) contexts.
    Robustness: Swallows connection errors to prevent crashing the main app, but logs them to stderr.
    """
    
    CHANNEL = "live_logs"
    
    @staticmethod
    def _format_log(log_entry: dict):
        """Ensure log entry has timestamp and consistent structure."""
        if 'timestamp' not in log_entry:
            log_entry['timestamp'] = datetime.utcnow().isoformat()
        if 'level' not in log_entry:
            log_entry['level'] = 'info'
        return json.dumps(log_entry)

    @classmethod
    def emit_sync(cls, log_entry: dict):
        """
        FIRE-AND-FORGET: Synchronous emission (for drafts.py, tasks, standard functions).
        """
        try:
            message = cls._format_log(log_entry)
            
            # Connect and Publish (Short-lived connection for robustness in threaded env)
            r = redis.from_url(settings.REDIS_URL, decode_responses=True)
            r.publish(cls.CHANNEL, message)
            r.close()
            
            # Also write to stdout for Docker logs
            logger.info(f"[LIVE-SYNC] {log_entry.get('message')}")
            
        except Exception as e:
            # NEVER crash the application because logging failed
            logger.error(f"LogManager Sync Error: {e}")

    @classmethod
    async def emit_async(cls, log_entry: dict):
        """
        Async emission (for FastAPI routers).
        """
        try:
            message = cls._format_log(log_entry)
            
            redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            await redis_client.publish(cls.CHANNEL, message)
            await redis_client.close()
            
            logger.info(f"[LIVE-ASYNC] {log_entry.get('message')}")
            
        except Exception as e:
            logger.error(f"LogManager Async Error: {e}")
            
    @classmethod
    async def get_stream_generator(cls, request):
        """
        Yields SSE formatted messages from Redis.
        """
        redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(cls.CHANNEL)
        
        try:
            # Initial connection confirmation
            connect_msg = {
                'level': 'system',
                'message': 'Connected to Live Log Stream',
                'timestamp': datetime.utcnow().isoformat()
            }
            yield f"data: {json.dumps(connect_msg)}\n\n"
            
            async for message in pubsub.listen():
                if await request.is_disconnected():
                    logger.info("Client disconnected from log stream")
                    break
                
                if message['type'] == 'message':
                    yield f"data: {message['data']}\n\n"
                    
        except Exception as e:
            logger.error(f"LogStream Error: {e}")
            error_msg = {
                'level': 'error', 
                'message': f"Stream connection error: {str(e)}", 
                'timestamp': datetime.utcnow().isoformat()
            }
            yield f"data: {json.dumps(error_msg)}\n\n"
        finally:
            await pubsub.unsubscribe(cls.CHANNEL)
            await redis_client.close()
