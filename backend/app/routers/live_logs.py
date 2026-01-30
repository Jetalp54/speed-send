import logging
import json
import asyncio
from datetime import datetime
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from app.config import settings
import redis
import redis.asyncio as aioredis

router = APIRouter()
logger = logging.getLogger(__name__)

LOG_CHANNEL = "live_logs"

def emit_log(log_entry: dict):
    """
    Publish a log entry to Redis Channel.
    Synchronous wrapper for use in standard functions and Celery tasks.
    """
    try:
        # Add timestamp if missing
        if 'timestamp' not in log_entry:
            log_entry['timestamp'] = datetime.utcnow().isoformat()
            
        # Use sync client for publish
        r = redis.from_url(settings.REDIS_URL, decode_responses=True)
        r.publish(LOG_CHANNEL, json.dumps(log_entry))
        
        # Also log to standard output for container logs
        logger.info(f"[LIVE] {log_entry.get('message', '')}")
            
    except Exception as e:
        logger.error(f"Failed to emit live log: {e}")


async def log_stream_generator(request: Request):
    """
    Async generator that subscribes to Redis and yields SSE messages.
    """
    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = redis_client.pubsub()
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
                
    except Exception as e:
        logger.error(f"Stream error: {e}")
    finally:
        await pubsub.unsubscribe(LOG_CHANNEL)
        await redis_client.close()

@router.get("/live-logs/stream")
async def stream_logs(request: Request):
    """
    SSE Endpoint. Connects client to Redis Pub/Sub stream.
    """
    return StreamingResponse(
        log_stream_generator(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.post("/live-logs/clear")
async def clear_logs():
    """
    Clear logs is client-side only (visual clear).
    """
    return {"status": "cleared"}

@router.get("/live-logs/recent")
async def get_recent():
    """
    Stub for backward compatibility. 
    New logs are streaming only, but we keep this to prevent 404s if frontend polls.
    """
    return {"logs": []}
