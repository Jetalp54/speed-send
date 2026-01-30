"""
Live Logs Router - SSE (Server-Sent Events) for Real-Time Log Streaming

ARCHITECURE CHANGE:
Replaced in-memory deque with REDIS Pub/Sub.
This is CRITICAL because Gunicorn runs multiple workers.
In-memory logs in Worker A are NOT visible to Client connected to Worker B.
Redis Pub/Sub bridges this gap.
"""

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from datetime import datetime
import asyncio
import json
import logging
from redis import asyncio as aioredis
from app.config import settings

router = APIRouter(tags=["live-logs"])
logger = logging.getLogger(__name__)

# Redis Channel Name
LOG_CHANNEL = "live_logs_channel"

# Redis Connection Pool (Lazy initialization)
_redis = None

async def get_redis():
    global _redis
    if _redis is None:
        _redis = await aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis

def emit_log(log_entry: dict):
    """
    Publish a log entry to Redis Channel.
    This is synchronous wrapper that fires-and-forgets an async task
    because calling context might be sync.
    """
    try:
        # Add timestamp if missing
        if 'timestamp' not in log_entry:
            log_entry['timestamp'] = datetime.utcnow().isoformat()
            
        # We need a small async loop to publish since aioredis is async
        # Or we can use a sync redis client just for publishing if high volume
        # For simplicity and performance in sync context, we'll offload
        
        # NOTE: If emit_log is called from Celery, we need sync Redis
        # If called from FastAPI (Async), we await
        
        # Helper to run async in thread if needed, but for now let's assume
        # simple async/sync detection or use sync redis for publish
        import redis
        r = redis.from_url(settings.REDIS_URL, decode_responses=True)
        r.publish(LOG_CHANNEL, json.dumps(log_entry))
        
        # Also log to standard output (docker logs)
        logger.info(f"[LIVE] {log_entry.get('message', '')}")
            
    except Exception as e:
        logger.error(f"Failed to emit live log: {e}")


async def log_stream_generator(request: Request):
    """
    Generator that subscribes to Redis and yields SSE messages.
    """
    redis = await get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(LOG_CHANNEL)
    
    try:
        # 1. Send connection established message
        yield f"data: {json.dumps({'level': 'info', 'message': 'Connected to Redis Log Stream', 'timestamp': datetime.utcnow().isoformat()})}\n\n"
        
        # 2. Listen for messages
        async for message in pubsub.listen():
            if await request.is_disconnected():
                break
                
            if message['type'] == 'message':
                # SSE format: "data: <json>\n\n"
                yield f"data: {message['data']}\n\n"
                
    except asyncio.CancelledError:
        pass
    finally:
        await pubsub.unsubscribe(LOG_CHANNEL)

@router.get("/live-logs/stream")
async def stream_logs(request: Request):
    """
    SSE Endpoint. Connects client to Redis Pub/Sub stream.
    """
    return StreamingResponse(
        log_stream_generator(request),
        media_type="text/event-stream"
    )

@router.post("/live-logs/clear")
async def clear_logs():
    """
    Clear logs is now client-side only since we stream.
    We just return success.
    """
    return {"status": "cleared"}

    """Get the most recent log entries (last 100)."""
    return {
        "logs": get_recent_logs(100),
        "total_in_buffer": len(_log_buffer)
    }


@router.post("/live-logs/clear")
async def clear_logs():
    """Clear the log buffer."""
    with _log_lock:
        _log_buffer.clear()
    
    emit_log({
        "level": "info",
        "message": "📋 Log buffer cleared",
        "data": {}
    })
    
    return {"message": "Logs cleared successfully"}
