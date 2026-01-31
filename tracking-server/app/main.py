"""
FastAPI Tracking Server
Handles open/click tracking, unsubscribe, and analytics collection
"""
from fastapi import FastAPI, Request, Response, Depends, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import base64
import logging

from app.database import get_db
from app.models import TrackingEvent, LinkMap, EmailLog, UnsubscribeToken
from app.tracking import TokenDecryptor, log_tracking_event, hash_email
from app.config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Email Tracking Server",
    description="High-performance tracking server for email opens, clicks, and unsubscribes",
    version="1.0.0"
)

# 1x1 Transparent PNG pixel
TRANSPARENT_PIXEL = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)

@app.get("/")
async def root():
    """Health check"""
    return {"status": "ok", "service": "tracking-server", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "service": "tracking-server",
        "timestamp": "2026-01-31T13:00:00Z"
    }

@app.get("/t/o/{token}.png")
async def track_open(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Open tracking pixel endpoint
    Returns 1x1 transparent PNG
    """
    # Decrypt token
    email_log_id, _ = TokenDecryptor.decrypt(token)
    
    if email_log_id:
        try:
            # Get campaign ID from email log
            result = await db.execute(
                select(EmailLog.campaign_id).where(EmailLog.id == email_log_id)
            )
            row = result.first()
            
            if row:
                campaign_id = row[0]
                
                # Log tracking event (async, fire-and-forget)
                await log_tracking_event(
                    db=db,
                    event_type='open',
                    campaign_id=campaign_id,
                    email_log_id=email_log_id,
                    ip_address=request.client.host,
                    user_agent=request.headers.get('user-agent')
                )
        except Exception as e:
            logger.error(f"Error tracking open: {e}")
    
    # Always return pixel (never fail)
    return Response(
        content=TRANSPARENT_PIXEL,
        media_type="image/png",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )

@app.get("/t/c/{token}")
async def track_click(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Click tracking redirect endpoint
    Logs click and redirects to original URL
    """
    # Decrypt token
    email_log_id, link_map_id = TokenDecryptor.decrypt(token)
    
    if not email_log_id or not link_map_id:
        raise HTTPException(status_code=404, detail="Invalid or expired link")
    
    # Get destination URL
    result = await db.execute(
        select(LinkMap).where(LinkMap.id == link_map_id)
    )
    link_map = result.scalar_one_or_none()
    
    if not link_map:
        raise HTTPException(status_code=404, detail="Link not found")
    
    # Get campaign ID
    result = await db.execute(
        select(EmailLog.campaign_id).where(EmailLog.id == email_log_id)
    )
    row = result.first()
    campaign_id = row[0] if row else link_map.campaign_id
    
    # Log tracking event
    try:
        await log_tracking_event(
            db=db,
            event_type='click',
            campaign_id=campaign_id,
            email_log_id=email_log_id,
            link_map_id=link_map_id,
            ip_address=request.client.host,
            user_agent=request.headers.get('user-agent')
        )
    except Exception as e:
        logger.error(f"Error tracking click: {e}")
    
    # Redirect to original URL
    return RedirectResponse(url=link_map.original_url, status_code=302)

@app.get("/u/{token}")
async def unsubscribe(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Unsubscribe endpoint
    Shows confirmation page and marks email as unsubscribed
    """
    # Validate token
    result = await db.execute(
        select(UnsubscribeToken).where(UnsubscribeToken.token == token)
    )
    unsub_token = result.scalar_one_or_none()
    
    if not unsub_token:
        return HTMLResponse(
            content="<h1>Invalid Unsubscribe Link</h1><p>This link is invalid or has expired.</p>",
            status_code=404
        )
    
    # Log unsubscribe event
    try:
        await log_tracking_event(
            db=db,
            event_type='unsubscribe',
            campaign_id=unsub_token.campaign_id,
            ip_address=request.client.host,
            user_agent=request.headers.get('user-agent')
        )
        
        # Mark token as used
        if not unsub_token.used_at:
            unsub_token.used_at = datetime.utcnow()
            await db.commit()
        
    except Exception as e:
        logger.error(f"Error processing unsubscribe: {e}")
    
    # Show confirmation page
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Unsubscribed Successfully</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            h1 { color: #28a745; }
            p { color: #333; line-height: 1.6; }
        </style>
    </head>
    <body>
        <h1>✓ Unsubscribed Successfully</h1>
        <p>You have been successfully removed from this mailing list.</p>
        <p>You will no longer receive emails from this campaign.</p>
        <p><small>If you believe this was a mistake, please contact support.</small></p>
    </body>
    </html>
    """
    
    return HTMLResponse(content=html_content)

@app.on_event("startup")
async def startup_event():
    """Initialize resources on startup"""
    logger.info("Tracking server starting up...")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup resources on shutdown"""
    from app.geoip import GeoIPResolver
    GeoIPResolver.close()
    logger.info("Tracking server shutting down...")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        workers=settings.WORKERS,
        log_level="info"
    )
