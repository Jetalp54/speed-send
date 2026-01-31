import logging
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from app.services.log_manager import LogManager

from datetime import datetime

router = APIRouter()
logger = logging.getLogger(__name__)

# Keep for backward compatibility import (if any other files import emit_log)
def emit_log(log_entry: dict):
    LogManager.emit_sync(log_entry)

@router.get("/live-logs/stream")
async def stream_logs(request: Request):
    """
    SSE Endpoint. Connects client to Redis Pub/Sub stream via LogManager.
    """
    return StreamingResponse(
        LogManager.get_stream_generator(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.post("/live-logs/clear")
async def clear_logs():
    return {"status": "cleared"}

@router.get("/live-logs/recent")
async def get_recent():
    """
    Get the last 100 logs from history.
    Useful for catching up if the SSE stream was late to connect.
    """
    import redis.asyncio as aioredis
    from app.config import settings
    
    try:
        redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        # Get last 100 logs (lrange 0 99)
        # Redis List is typically LPUSH, so 0 is the newest.
        logs_raw = await redis_client.lrange("live_logs_history", 0, 99)
        await redis_client.close()
        
        # Parse JSON strings back to objects
        logs = []
        for log_str in logs_raw:
             try:
                 logs.append(json.loads(log_str))
             except:
                 pass
                 
        # Reverse to show oldest first in UI if needed, but Console usually appends.
        # Console expects chronological order (oldest -> newest).
        # LPUSH means index 0 is NEWEST. So we need to reverse.
        return {"logs": logs[::-1]}
    except Exception as e:
        logger.error(f"Failed to fetch recent logs: {e}")
        return {"logs": []}

@router.post("/live-logs/test")
async def test_log_emission():
    """
    Manually trigger a test log to verify the pipeline.
    """
    LogManager.emit_sync({
        "level": "warning", 
        "message": "🟡 MANUAL TEST LOG: If you see this, the system is working!",
        "timestamp": datetime.utcnow().isoformat()
    })
    return {"status": "sent"}
