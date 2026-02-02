
from fastapi import APIRouter, Request, HTTPException, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app import models
from app.services.tracking import OpaqueSigner, log_tracking_event_task
from app.database import SessionLocal 
from fastapi import Depends
import base64

import logging
logger = logging.getLogger(__name__)

router = APIRouter()

# 1x1 Transparent PNG
TRANSPARENT_PIXEL = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)

@router.get("/t/o/{opaque_id}.png", methods=["GET", "HEAD"])
async def track_open(opaque_id: str, request: Request):
    """
    Open Tracking Pixel.
    """
    logger.info(f"📡 TRACKING RECEIVED: Open via Opaque ID {opaque_id}")
    email_log_id, _ = OpaqueSigner.unsign(opaque_id)
    
    if email_log_id:
        try:
             db = SessionLocal()
             log = db.query(models.EmailLog).filter(models.EmailLog.id == email_log_id).first()
             if log:
                 event_data = {
                     'event_type': 'open',
                     'campaign_id': log.campaign_id,
                     'email_log_id': email_log_id,
                     'user_agent': request.headers.get('user-agent'),
                     'ip': request.client.host,
                 }
                 log_tracking_event_task.delay(event_data)
                 logger.info(f"✅ TRACKING LOGGED: Open for Campaign {log.campaign_id}, Log {email_log_id}")
             db.close()
        except Exception as e:
             logger.error(f"❌ Tracking Open Error: {e}")
             pass

    return Response(
        content=TRANSPARENT_PIXEL, 
        media_type="image/png", 
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
    )

@router.get("/t/c/{opaque_id}", methods=["GET", "HEAD"])
async def track_click(opaque_id: str, request: Request, db: Session = Depends(get_db)):
    """
    Click Tracking Redirect.
    """
    logger.info(f"📡 TRACKING RECEIVED: Click via Opaque ID {opaque_id}")
    if request.method == "HEAD":
        return Response(status_code=200)
    email_log_id, link_map_id = OpaqueSigner.unsign(opaque_id)
    
    if not email_log_id or not link_map_id:
        raise HTTPException(status_code=404, detail="Link expired or invalid")
        
    link_map = db.query(models.LinkMap).filter(models.LinkMap.id == link_map_id).first()
    if not link_map:
        raise HTTPException(status_code=404, detail="Link destination not found")
        
    email_log = db.query(models.EmailLog).filter(models.EmailLog.id == email_log_id).first()
    campaign_id = email_log.campaign_id if email_log else link_map.campaign_id
    
    event_data = {
         'event_type': 'click',
         'campaign_id': campaign_id,
         'email_log_id': email_log_id,
         'link_map_id': link_map_id,
         'user_agent': request.headers.get('user-agent'),
         'ip': request.client.host
    }
    log_tracking_event_task.delay(event_data)
    logger.info(f"✅ TRACKING LOGGED: Click for Campaign {campaign_id}, Link {link_map_id}")
    
    return RedirectResponse(url=link_map.original_url)


# --- EXPLICIT TRACKING ---

@router.get("/t/pixel.png", methods=["GET", "HEAD"])
async def track_pixel_explicit(request: Request, c: int = None, r: str = None):
    logger.info(f"📡 TRACKING RECEIVED: Explicit Pixel for Campaign {c}")
    if request.method == "HEAD":
        return Response(content=TRANSPARENT_PIXEL, media_type="image/png")
    if c:
        try:
            event_data = {
                'event_type': 'open',
                'campaign_id': c,
                'email_log_id': None,
                'recipient': r,
                'user_agent': request.headers.get('user-agent'),
                'ip': request.client.host
            }
            log_tracking_event_task.delay(event_data)
            logger.info(f"✅ TRACKING LOGGED: Explicit Open for Campaign {c}")
        except Exception as e:
            logger.error(f"❌ Tracking Error: {e}")
            pass
            
    return Response(
        content=TRANSPARENT_PIXEL, 
        media_type="image/png", 
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
    )

@router.get("/t/redirect", methods=["GET", "HEAD"])
async def track_redirect_explicit(request: Request, url: str, c: int = None, r: str = None):
    logger.info(f"📡 TRACKING RECEIVED: Explicit Redirect to {url} for Campaign {c}")
    if request.method == "HEAD":
        return Response(status_code=200)
    if not url:
        raise HTTPException(status_code=400, detail="Missing URL")
        
    if c:
        try:
            event_data = {
                'event_type': 'click',
                'campaign_id': c,
                'email_log_id': None,
                'recipient': r,
                'link_url': url,
                'user_agent': request.headers.get('user-agent'),
                'ip': request.client.host
            }
            log_tracking_event_task.delay(event_data)
            logger.info(f"✅ TRACKING LOGGED: Explicit Click for Campaign {c}")
        except Exception as e:
            logger.error(f"❌ Tracking Redirect Error: {e}")
            pass
            
    return RedirectResponse(url=url)
