from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

# Create database engine with basic settings
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=50,       # Increased from 10 to support 50 persistent connections
    max_overflow=100,   # Increased from 20 to allow 150 total concurrent bursts
    pool_recycle=3600,
    pool_timeout=60     # Increased timeout to prevent early failures during bursts
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create base class for models
Base = declarative_base()


# Dependency for getting database session with robust handling
def get_db():
    db = SessionLocal()
    try:
        yield db
        # Explicitly commit any pending changes before closing
        db.commit()
    except Exception:
        # Rollback on any exception
        db.rollback()
        raise
    finally:
        # Always close the connection
        db.close()

