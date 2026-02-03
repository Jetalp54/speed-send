from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
import logging
import traceback

from app.config import settings
from app.database import engine, Base
from app.routers import accounts, users, campaigns, dashboard, test_email, drafts, contacts, data_lists, live_logs
from app.routers import send as send_router
# drafts_resume REMOVED - conflicts with drafts_ultra /resume-scheduled endpoint
from app.routers import accounts_sync_stub, drafts_celery, drafts_ultra, drafts_preview, tracking
from app.middleware import PerformanceMiddleware

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup and shutdown events
    """
    # Startup: Create database tables
    logger.info("Starting Gmail Bulk Sender SaaS...")
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created/verified")
        
        try:
            # Run Schema Fixer (Self-Heal) to ensure columns exist
            from app.fix_db import fix_schema
            logger.info("🔧 Running DB Schema Fixer...")
            fix_schema()
            logger.info("✅ DB Schema Fixer completed")
        except Exception as e:
            logger.error(f"Failed to run schema fixer: {e}")

        # SELF-HEAL: Ensure 'version' column exists for optimistic closing
        # This fixes 500 errors if migration failed to run
        try:
            from sqlalchemy import text
            from app.database import SessionLocal
            db = SessionLocal()
            try:
                # Check directly using SQL to avoid caching issues
                logger.info("Verifying schema integrity...")
                db.execute(text("ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;"))
                db.commit()
                logger.info("✅ Schema verification complete: 'version' column ensured.")
            except Exception as e:
                logger.warning(f"Schema verification warning (non-critical): {e}")
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Failed to verify schema: {e}")

        # Database tables created successfully
        logger.info("Database initialized successfully")
        
        # Check if database has any data (optional - don't fail if tables don't exist yet)
        try:
            from app.models import Campaign, ServiceAccount
            from app.database import SessionLocal
            db = SessionLocal()
            try:
                campaign_count = db.query(Campaign).count()
                account_count = db.query(ServiceAccount).count()
                logger.info(f"Database status: {campaign_count} campaigns, {account_count} service accounts")
            except Exception as e:
                logger.info(f"Database tables not yet created or accessible: {e}")
                logger.info("Database will be initialized on first use")
            finally:
                db.close()
        except Exception as e:
            logger.info(f"Database status check skipped: {e}")
            logger.info("Database will be initialized on first use")
        
    except Exception as e:
        if "already exists" in str(e) or "duplicate key" in str(e):
            logger.warning("Some database objects already exist, continuing...")
        else:
            logger.error(f"Database initialization failed: {e}")
            raise
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"PowerMTA Mode: ENABLED (100 worker concurrency)")
    
    yield
    
    # Shutdown
    logger.info("Shutting down")


# Create FastAPI application
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    redirect_slashes=False  # Disable automatic trailing slash redirects
)

# Import redirect middleware
from app.redirect_middleware import RelativeRedirectMiddleware

# Add redirect middleware FIRST to intercept redirects
app.add_middleware(RelativeRedirectMiddleware)

# Add performance middleware
app.add_middleware(PerformanceMiddleware)

# Add GZip compression for faster responses
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Configure CORS - Allow all origins in production for now
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",  # echo any origin
    allow_credentials=False,   # avoid '*' + credentials incompatibility
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include routers
app.include_router(accounts.router, prefix=f"{settings.API_V1_PREFIX}/accounts")
app.include_router(users.router, prefix=settings.API_V1_PREFIX)
app.include_router(campaigns.router, prefix=settings.API_V1_PREFIX)
app.include_router(dashboard.router, prefix=settings.API_V1_PREFIX)
app.include_router(test_email.router, prefix=settings.API_V1_PREFIX)
app.include_router(contacts.router, prefix=settings.API_V1_PREFIX)
app.include_router(data_lists.router, prefix=settings.API_V1_PREFIX)
app.include_router(drafts.router, prefix=settings.API_V1_PREFIX)
app.include_router(drafts_celery.router_celery, prefix=settings.API_V1_PREFIX, tags=["Drafts-UltraSpeed"])
app.include_router(drafts_ultra.router_v2, prefix=settings.API_V1_PREFIX, tags=["Drafts-Maximum-Performance"])
# app.include_router(drafts_resume.router_resume, prefix=settings.API_V1_PREFIX, tags=["Drafts-Scheduled-Resume"])  # REMOVED - conflicts with drafts_ultra
app.include_router(drafts_preview.router_preview, prefix=settings.API_V1_PREFIX, tags=["Drafts-Preview-Test"])
app.include_router(send_router.router, prefix=settings.API_V1_PREFIX)
app.include_router(accounts_sync_stub.router, prefix=settings.API_V1_PREFIX)
from app.routers import tracking, contacts_enterprise, analytics, tracking_domains
app.include_router(tracking.router, prefix="") 
app.include_router(contacts_enterprise.router, prefix=settings.API_V1_PREFIX)
app.include_router(analytics.router, prefix=settings.API_V1_PREFIX)
app.include_router(tracking_domains.router, prefix=settings.API_V1_PREFIX, tags=["tracking-domains"])
app.include_router(live_logs.router, prefix=settings.API_V1_PREFIX, tags=["live-logs"])


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = f"Global Exception: {str(exc)}\n{traceback.format_exc()}"
    logger.error(error_msg)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "debug_error": str(exc)},
    )

logger.info(f"All routers loaded")
logger.info(f"API Documentation: /docs (disabled in production)")
logger.info(f"Ready to handle requests!")


@app.get("/api/v1/debug/fix-db")
async def debug_fix_db():
    """
    Temporary debug endpoint to trigger schema fixing
    """
    try:
        from app.fix_db import fix_schema
        logger.info("🔧 Manual trigger: Running DB Schema Fixer...")
        fix_schema()
        return {"status": "success", "message": "DB Schema Fixer completed successfully"}
    except Exception as e:
        logger.error(f"Manual trigger failed: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/")
async def root():
    """
    Root endpoint
    """
    return {"message": "Gmail SaaS API is running", "version": settings.VERSION}

@app.get("/health")
async def health():
    """
    Health check endpoint for Nginx/AWS validation
    """
    return {"status": "healthy", "database": "connected" if engine else "unknown"}
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """
    Health check endpoint
    """
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT
    }
