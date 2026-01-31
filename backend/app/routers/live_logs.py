import logging
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from fastapi import APIRouter, Request, Depends
from fastapi.responses import StreamingResponse
from app.services.log_manager import LogManager
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import TaskLog

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
async def get_recent(db: Session = Depends(get_db), limit: int = 100, after_id: int = 0):
    """
    Get recent logs from the database.
    Supports polling via 'after_id'.
    """
    query = db.query(TaskLog).order_by(TaskLog.id.asc())
    
    if after_id > 0:
        query = query.filter(TaskLog.id > after_id)
    else:
        # If no cursor, get last N
        # We need to subquery or just slice. 
        # Simpler: Get last N by desc, then reverse in code
        logs = db.query(TaskLog).order_by(TaskLog.id.desc()).limit(limit).all()
        return {"logs": [log_to_dict(l) for l in reversed(logs)]}

    logs = query.limit(limit).all()
    return {"logs": [log_to_dict(l) for l in logs]}

def log_to_dict(log: TaskLog):
    return {
        "id": log.id,
        "campaign_id": log.campaign_id,
        "level": log.level,
        "message": log.message,
        "timestamp": log.timestamp.isoformat() if log.timestamp else None,
        "data": log.data
    }

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
