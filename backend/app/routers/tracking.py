
from fastapi import APIRouter, Request, HTTPException, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app import models
from app.services.tracking import OpaqueSigner, log_tracking_event_task
from app.database import SessionLocal 
from fastapi import Depends
import base64

router = APIRouter()

# 1x1 Transparent PNG
TRANSPARENT_PIXEL = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)

@router.get("/t/o/{opaque_id}.png")
async def track_open(opaque_id: str, request: Request):
    """
    Open Tracking Pixel.
    Decodes ID -> Logs Event -> Returns Pixel.
    """
    # 1. Decode ID
    email_log_id, _ = OpaqueSigner.unsign(opaque_id)
    
    if email_log_id:
        # 2. Async Log (Fire & Forget)
        # We need campaign_id.
        # Ideally, we should fetch it or include it in token.
        # Including in token increases size. Fetching is DB hit.
        # For open tracking, we usually can afford 1 DB read or just log the ID 
        # and let the aggregation step resolve the campaign_id.
        # HOWEVER, the prompt required raw events schema has campaign_id non-nullable.
        # So we must fetch or redesign. 
        # Using a quick DB lookup here. 
        # Optimization: Use Redis cache for EmailLogId -> CampaignId mapping?
        # For now, simplistic DB lookup.
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
                 # GeoIP would happen here or in worker
                 }
                 # SYNC CALL: Immediate update for "Real Pattern" analytics
                 log_tracking_event_task(event_data)
             db.close()
        except Exception as e:
             # Log error but don't fail pixel
             print(f"Tracking Open Error: {e}")
             pass

    # 3. Return Pixel
    return Response(
        content=TRANSPARENT_PIXEL, 
        media_type="image/png", 
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
    )

@router.get("/t/c/{opaque_id}")
async def track_click(opaque_id: str, request: Request, db: Session = Depends(get_db)):
    """
    Click Tracking Redirect.
    Decodes ID -> Logs Event -> Redirects.
    """
    # 1. Decode ID
    email_log_id, link_map_id = OpaqueSigner.unsign(opaque_id)
    
    if not email_log_id or not link_map_id:
        # Invalid token or tampering
        # Fallback to homepage or 404? 
        # Better to 404 to avoid confusion.
        raise HTTPException(status_code=404, detail="Link expired or invalid")
        
    # 2. Lookup Destination
    link_map = db.query(models.LinkMap).filter(models.LinkMap.id == link_map_id).first()
    if not link_map:
        raise HTTPException(status_code=404, detail="Link destination not found")
        
    # 3. Async Log
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
    # SYNC CALL: Immediate update
    log_tracking_event_task(event_data)
    
    # 4. Redirect
    return RedirectResponse(url=link_map.original_url)


# ==========================================
# EXPLICIT TRACKING (For Drafts / Static Links)
# ==========================================

@router.get("/t/pixel.png")
async def track_pixel_explicit(c: int = None, r: str = None, request: Request = None):
    """
    Explicit Open Tracking for Drafts (PNG).
    c = campaign_id
    r = recipient_email (optional)
    """
    if c:
        try:
            # Synchronous Log for reliability
            event_data = {
                'event_type': 'open',
                'campaign_id': c,
                'email_log_id': None,
                'recipient': r,
                'user_agent': request.headers.get('user-agent') if request else None,
                'ip': request.client.host if request else None,
                'geo_country': 'XX' # To be filled by geolocation middleware or logic
            }
            # Execute directly, no delay (fixes "Demo" feel of laggy analytics)
            log_tracking_event_task(event_data)
        except Exception as e:
            print(f"Tracking Error: {e}")
            pass
            
    return Response(
        content=TRANSPARENT_PIXEL, 
        media_type="image/png", 
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
    )

@router.get("/t/redirect")
async def track_redirect_explicit(url: str, c: int = None, r: str = None, request: Request = None):
    """
    Explicit Click Tracking for Drafts.
    """
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
                'user_agent': request.headers.get('user-agent') if request else None,
                'ip': request.client.host if request else None
            }
            log_tracking_event_task(event_data)
        except Exception:
            pass
            
    return RedirectResponse(url=url)
