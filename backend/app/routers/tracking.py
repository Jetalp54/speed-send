
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
# Logger for this module
logger = logging.getLogger("app.routers.tracking")

def get_client_ip(request: Request) -> str:
    """
    Extract real client IP from headers or request with trace logging.
    """
    headers = dict(request.headers)
    
    # Priority list of headers commonly used by proxies
    headers_to_check = [
        "x-forwarded-for",
        "x-real-ip",
        "cf-connecting-ip", # Cloudflare
        "forwarded"
    ]
    
    for header in headers_to_check:
        val = request.headers.get(header)
        if val:
            # For X-Forwarded-For, get the leftmost (client) IP
            if header == "x-forwarded-for":
                ip = val.split(",")[0].strip()
            else:
                ip = val.strip()
            
            if ip:
                return ip

    return request.client.host if request.client else "unknown"

router = APIRouter()

@router.get("/")
async def tracking_root():
    """
    Landing page for the tracking domain.
    """
    return Response(
        content="""
        <html>
            <head>
                <title>Secure Tracking Link</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; color: #333; }
                    .container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
                    h1 { color: #2d3748; font-size: 24px; margin-bottom: 10px; }
                    p { color: #718096; line-height: 1.5; margin-bottom: 20px; }
                    .status-badge { background: #e6fffa; color: #2c7a7b; padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; display: inline-block; }
                    .logo { font-size: 40px; margin-bottom: 15px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="logo">📡</div>
                    <h1>Link Tracking System</h1>
                    <p>This is a secure tracking endpoint used for email analytics.</p>
                    <div class="status-badge">● System Online</div>
                </div>
            </body>
        </html>
        """,
        media_type="text/html"
    )

# 1x1 Transparent PNG
TRANSPARENT_PIXEL = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)

@router.get("/t/o/{opaque_id}.png")
@router.head("/t/o/{opaque_id}.png")
async def track_open(opaque_id: str, request: Request):
    """
    Open Tracking Pixel.
    """
    host = request.headers.get("host")
    client_ip = get_client_ip(request)
    logger.info(f"📡 [TRACKING-REQUEST] Open | Host: {host} | IP: {client_ip} | ID: {opaque_id}")
    
    # Trace log headers for debugging proxy setup issues
    logger.debug(f"🔍 [TRACE] Headers: {dict(request.headers)}")
    
    if request.method == "HEAD":
        return Response(
            content=TRANSPARENT_PIXEL, 
            media_type="image/png",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "X-Tracking-System": "fastapi-backend"
            }
        )

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
                     'ip': get_client_ip(request),
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

@router.get("/t/c/{opaque_id}")
@router.head("/t/c/{opaque_id}")
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
         'ip': get_client_ip(request)
    }
    log_tracking_event_task.delay(event_data)
    logger.info(f"✅ TRACKING LOGGED: Click for Campaign {campaign_id}, Link {link_map_id}")
    
    return RedirectResponse(url=link_map.original_url)


# --- EXPLICIT TRACKING ---

@router.get("/t/u/{opaque_id}")
async def track_unsubscribe(opaque_id: str, request: Request, db: Session = Depends(get_db)):
    """
    Unsubscribe Tracking.
    """
    logger.info(f"📡 TRACKING RECEIVED: Unsubscribe via Opaque ID {opaque_id}")
    
    email_log_id, _ = OpaqueSigner.unsign(opaque_id)
    if not email_log_id:
        return Response(content="Invalid unsubscribe link", status_code=400)

    email_log = db.query(models.EmailLog).filter(models.EmailLog.id == email_log_id).first()
    if email_log:
        event_data = {
            'event_type': 'unsubscribe',
            'campaign_id': email_log.campaign_id,
            'email_log_id': email_log_id,
            'user_agent': request.headers.get('user-agent'),
            'ip': get_client_ip(request)
        }
        log_tracking_event_task.delay(event_data)
        logger.info(f"✅ TRACKING LOGGED: Unsubscribe for Campaign {email_log.campaign_id}")

    # Standard "You have been unsubscribed" page or redirect
    return Response(
        content="<html><body><div style='text-align:center; padding: 50px;'><h1>Unsubscribed</h1><p>You have been successfully removed from our mailing list.</p></div></body></html>",
        media_type="text/html"
    )

@router.get("/t/pixel.png")
@router.head("/t/pixel.png")
async def track_pixel_explicit(request: Request, c: int = None, d: int = None, r: str = None):
    host = request.headers.get("host")
    client_ip = get_client_ip(request)
    logger.info(f"📡 [TRACKING-REQUEST] Explicit Pixel | Host: {host} | IP: {client_ip} | c={c}, d={d}")
    
    # Trace log headers
    logger.debug(f"🔍 [TRACE] Explicit Headers: {dict(request.headers)}")
    
    if request.method == "HEAD":
        return Response(
            content=TRANSPARENT_PIXEL, 
            media_type="image/png",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "X-Tracking-System": "fastapi-backend"
            }
        )

    if c or d:
        try:
            event_data = {
                'event_type': 'open',
                'campaign_id': c,
                'draft_campaign_id': d,
                'email_log_id': None,
                'recipient': r,
                'user_agent': request.headers.get('user-agent'),
                'ip': get_client_ip(request)
            }
            log_tracking_event_task.delay(event_data)
            logger.info(f"✅ EXPLICIT OPEN RECEIVED: c={c}, d={d}. Dispatched to worker.")
        except Exception as e:
            logger.error(f"❌ Tracking Error: {e}")
            pass
            
    return Response(
        content=TRANSPARENT_PIXEL, 
        media_type="image/png", 
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
    )

@router.get("/t/redirect")
@router.head("/t/redirect")
async def track_redirect_explicit(request: Request, url: str, c: int = None, d: int = None, r: str = None):
    logger.info(f"📡 TRACKING RECEIVED: Explicit Redirect to {url} for Campaign {c}, Draft {d}")
    if request.method == "HEAD":
        return Response(status_code=200)

    if not url:
        raise HTTPException(status_code=400, detail="Missing URL")
        
    if c or d:
        try:
            event_data = {
                'event_type': 'click',
                'campaign_id': c,
                'draft_campaign_id': d,
                'email_log_id': None,
                'recipient': r,
                'link_url': url,
                'user_agent': request.headers.get('user-agent'),
                'ip': get_client_ip(request)
            }
            log_tracking_event_task.delay(event_data)
            logger.info(f"✅ EXPLICIT CLICK RECEIVED: to {url}, c={c}, d={d}. Dispatched to worker.")
        except Exception as e:
            logger.error(f"❌ Tracking Redirect Error: {e}")
            pass
            
    return RedirectResponse(url=url)
