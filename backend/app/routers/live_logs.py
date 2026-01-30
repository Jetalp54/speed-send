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
            new_log_count = current_count - sent_count
            new_logs = current_buffer[-new_log_count:]
            
            for log in new_logs:
                yield f"data: {json.dumps(log)}\n\n"
            
            sent_count = current_count
        
        # Send periodic ping to keep connection alive
        if current_count == sent_count:
            yield f": ping\n\n"


@router.get("/live-logs/stream")
async def stream_logs():
    """
    SSE endpoint for streaming live logs.
    
    Client usage:
    ```javascript
    const eventSource = new EventSource('/api/v1/live-logs/stream');
    eventSource.onmessage = (event) => {
        const log = JSON.parse(event.data);
        console.log(log.message);
    };
    ```
    """
    return StreamingResponse(
        log_stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )


@router.get("/live-logs/recent")
async def get_recent():
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
