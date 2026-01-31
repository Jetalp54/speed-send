"""
Database connection for tracking server
Connects to main backend database (read and write to tracking tables)
"""
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

# Async database engine
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker as async_sessionmaker

# Convert postgresql:// to postgresql+asyncpg://
async_db_url = settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

# Async engine
async_engine = create_async_engine(async_db_url, pool_pre_ping=True, echo=False)
AsyncSessionLocal = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

# Sync engine (for migrations or admin tasks)
sync_engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)

Base = declarative_base()

# Dependency for FastAPI
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
