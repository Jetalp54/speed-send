from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models import WorkspaceUser
from app.schemas import WorkspaceUserResponse

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=List[WorkspaceUserResponse])
async def list_workspace_users(
    service_account_id: Optional[int] = None,
    is_active: Optional[bool] = None,
    skip: int = 0,
    limit: int = 1000,
    db: Session = Depends(get_db)
):
    """
    List workspace users with optional filters
    """
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        logger.info("🔄 Fetching workspace users...")
        query = db.query(WorkspaceUser)
        
        if service_account_id:
            query = query.filter(WorkspaceUser.service_account_id == service_account_id)
            logger.info(f"🔍 Filtering by service_account_id: {service_account_id}")
        
        if is_active is not None:
            query = query.filter(WorkspaceUser.is_active == is_active)
            logger.info(f"🔍 Filtering by is_active: {is_active}")
        
        # FORCE EXCLUDE admin-like accounts from listing (senders must be normal users)
        from sqlalchemy import not_, func, or_, and_
        from app.models import ServiceAccount
        
        # Get all service account admin emails
        admin_emails = db.query(ServiceAccount.admin_email).filter(
            ServiceAccount.admin_email.isnot(None)
        ).all()
        admin_email_list = [email[0] for email in admin_emails if email[0]]
        
        # Common admin patterns (email and names)
        admin_locals = [
            'admin', 'administrator', 'postmaster', 'abuse', 'support', 
            'noreply', 'no-reply', 'donotreply', 'do-not-reply'
        ]
        
        # Admin name patterns to exclude
        admin_name_patterns = [
            'admin', 'administrator', 'postmaster', 'abuse', 'support',
            'system', 'automation', 'bot', 'test', 'demo', 'sample',
            'noreply', 'no-reply', 'donotreply', 'do-not-reply'
        ]
        
        # Build exclusion conditions
        conditions = []
        
        # Exclude exact admin email matches
        if admin_email_list:
            conditions.append(not_(WorkspaceUser.email.in_(admin_email_list)))
        
        # Exclude admin email patterns
        for local in admin_locals:
            conditions.append(not_(func.lower(WorkspaceUser.email).like(f"{local}@%")))
        
        # Exclude admin name patterns (full_name, first_name, last_name)
        for pattern in admin_name_patterns:
            # Check full_name
            conditions.append(not_(func.lower(WorkspaceUser.full_name).like(f"%{pattern}%")))
            # Check first_name
            conditions.append(not_(func.lower(WorkspaceUser.first_name).like(f"%{pattern}%")))
            # Check last_name
            conditions.append(not_(func.lower(WorkspaceUser.last_name).like(f"%{pattern}%")))
        
        # Apply all conditions
        if conditions:
            query = query.filter(and_(*conditions)) if len(conditions) > 1 else query.filter(conditions[0])
        
        logger.info(f"🚫 Excluded admin emails: {admin_email_list}")
        logger.info(f"🚫 Excluded admin patterns: {admin_locals}")
        
        users = query.offset(skip).limit(limit).all()
        logger.info(f"✅ Found {len(users)} workspace users")
        
        return users
        
    except Exception as e:
        logger.error(f"❌ Failed to list workspace users: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list workspace users: {str(e)}")


@router.get("/{user_id}", response_model=WorkspaceUserResponse)
async def get_workspace_user(
    user_id: int,
    db: Session = Depends(get_db)
):
    """
    Get a specific workspace user
    """
    user = db.query(WorkspaceUser).filter(WorkspaceUser.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user


@router.patch("/{user_id}")
async def update_workspace_user(
    user_id: int,
    is_active: Optional[bool] = None,
    quota_limit: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Update workspace user settings
    """
    user = db.query(WorkspaceUser).filter(WorkspaceUser.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if is_active is not None:
        user.is_active = is_active
    
    if quota_limit is not None:
        user.quota_limit = quota_limit
    
    db.commit()
    db.refresh(user)
    
    return user

