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
