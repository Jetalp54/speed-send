"""
Live Logs Router - SSE (Server-Sent Events) for Real-Time Log Streaming

Provides a live log stream for monitoring:
- Scheduled Resume processes
- Launch processes  
- Upload processes
- Resume Now processes
"""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from collections import deque
from datetime import datetime
import asyncio
import json
import logging
import threading

router = APIRouter(tags=["live-logs"])
logger = logging.getLogger(__name__)

# In-memory circular buffer for recent logs (thread-safe)
MAX_LOG_ENTRIES = 1000
_log_buffer = deque(maxlen=MAX_LOG_ENTRIES)
_log_lock = threading.Lock()

# Active SSE connections
_active_connections = set()


def emit_log(log_entry: dict):
    """
    Emit a log entry to the buffer and all active SSE connections.
    
    Args:
        log_entry: Dict with keys: timestamp, level, campaign_id, message, data
    """
    with _log_lock:
        # Add timestamp if not present
        if 'timestamp' not in log_entry:
            log_entry['timestamp'] = datetime.utcnow().isoformat()
        
        # Add to buffer
        _log_buffer.append(log_entry)
        
        # Log to console as well
        logger.info(f"[LIVE] {log_entry.get('message', '')}")


def get_recent_logs(count: int = 100):
    """Get the most recent N log entries."""
    with _log_lock:
        return list(_log_buffer)[-count:]


async def log_stream_generator():
    """
    Generator for SSE log streaming.
    Yields recent logs immediately, then streams new ones.
    """
    # Send recent logs first (last 50)
    recent_logs = get_recent_logs(50)
    for log in recent_logs:
        yield f"data: {json.dumps(log)}\n\n"
    
    # Keep connection alive and stream new logs
    last_size = len(_log_buffer)
    
    while True:
        await asyncio.sleep(0.1)  # Check for new logs every 100ms
        
        current_size = len(_log_buffer)
        if current_size > last_size:
            # New logs available
            with _log_lock:
                new_logs = list(_log_buffer)[last_size:]
            
            for log in new_logs:
                yield f"data: {json.dumps(log)}\n\n"
            
            last_size = current_size


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
