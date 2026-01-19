from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import logging
import json

from app.database import get_db
from app.database import get_db
from app.models import ServiceAccount, WorkspaceUser, DraftCampaignAccount, DraftCampaignUser, GmailDraft, CampaignSender, EmailLog
from app.schemas import ServiceAccountCreate, ServiceAccountUpdate, ServiceAccountResponse, WorkspaceUserResponse
from app.encryption import EncryptionService
from app.google_api import GoogleWorkspaceService

router = APIRouter(prefix="/accounts", tags=["accounts"])
logger = logging.getLogger(__name__)

@router.get("/", response_model=List[ServiceAccountResponse])
async def list_service_accounts(db: Session = Depends(get_db)):
    """List all service accounts"""
    try:
        logger.info("Fetching service accounts...")
        accounts = db.query(ServiceAccount).all()
        logger.info(f"Found {len(accounts)} service accounts")
        return accounts
    except Exception as e:
        logger.error(f"Failed to fetch service accounts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=ServiceAccountResponse)
async def create_service_account(account: ServiceAccountCreate, db: Session = Depends(get_db)):
    """Create a new service account"""
    try:
        logger.info(f"Creating service account: {account.name}")
        
        # Validate JSON content
        if not account.json_content:
            raise HTTPException(status_code=400, detail="JSON content is required")
        
        # Handle JSON content - it could be dict or string
        json_content = account.json_content
        if isinstance(json_content, dict):
            json_content = json.dumps(json_content)
        elif isinstance(json_content, str):
            # Validate it's valid JSON
            try:
                json.loads(json_content)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid JSON format in json_content")
        
        # Encrypt the JSON content
        encryption_service = EncryptionService()
        encrypted_json = encryption_service.encrypt(json_content)
        
        # Extract client_email and other fields from JSON if not provided
        parsed_json = json.loads(json_content) if isinstance(json_content, str) else json_content
        client_email = account.client_email or parsed_json.get('client_email', '')
        if not client_email:
            raise HTTPException(status_code=400, detail="client_email is required in JSON content")
        domain = account.domain or (client_email.split('@')[1] if '@' in client_email else '')
        project_id = account.project_id or parsed_json.get('project_id', '')
        
        # Create service account
        db_account = ServiceAccount(
            name=account.name,
            client_email=client_email,
            domain=domain,
            project_id=project_id,
            admin_email=account.admin_email,
            encrypted_json=encrypted_json
        )
        
        db.add(db_account)
        db.commit()
        db.refresh(db_account)
        
        logger.info(f"Successfully created service account: {db_account.name} (ID: {db_account.id})")
        return db_account
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create service account: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{account_id}", response_model=ServiceAccountResponse)
async def get_service_account(account_id: int, db: Session = Depends(get_db)):
    """Get a specific service account"""
    account = db.query(ServiceAccount).filter(ServiceAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Service account not found")
    return account

@router.put("/{account_id}", response_model=ServiceAccountResponse)
async def update_service_account(
    account_id: int, 
    account_update: ServiceAccountUpdate, 
    db: Session = Depends(get_db)
):
    """Update a service account"""
    account = db.query(ServiceAccount).filter(ServiceAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Service account not found")
    
    try:
        # Update fields
        update_data = account_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(account, field, value)
        
        db.commit()
        db.refresh(account)
        
        logger.info(f"Successfully updated service account: {account.name}")
        return account
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update service account: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{account_id}")
async def delete_service_account(account_id: int, db: Session = Depends(get_db)):
    """Delete a service account"""
    account = db.query(ServiceAccount).filter(ServiceAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Service account not found")
    
    try:
        # 1. Delete DraftCampaignAccount records linked to this account
        db.query(DraftCampaignAccount).filter(DraftCampaignAccount.service_account_id == account_id).delete()
        
        # 1.1 Delete CampaignSender assignments
        db.query(CampaignSender).filter(CampaignSender.service_account_id == account_id).delete()

        # 1.2 Delete EmailLogs associated with this account
        db.query(EmailLog).filter(EmailLog.service_account_id == account_id).delete()
        
        # 2. Find all users for this account
        workspace_users = db.query(WorkspaceUser).filter(WorkspaceUser.service_account_id == account_id).all()
        user_ids = [u.id for u in workspace_users]
        
        if user_ids:
            # 3. Delete GmailDraft records for these users
            db.query(GmailDraft).filter(GmailDraft.user_id.in_(user_ids)).delete(synchronize_session=False)
            
            # 4. Delete DraftCampaignUser records for these users
            db.query(DraftCampaignUser).filter(DraftCampaignUser.user_id.in_(user_ids)).delete(synchronize_session=False)
            
            # 5. Delete WorkspaceUser records (now safe from FK constraints)
            db.query(WorkspaceUser).filter(WorkspaceUser.service_account_id == account_id).delete(synchronize_session=False)
        
        # 6. Finally delete the service account
        db.delete(account)
        db.commit()
        
        logger.info(f"Successfully deleted service account: {account.name}")
        return {"message": "Service account deleted successfully"}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete service account: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{account_id}/sync")
async def sync_service_account(
    account_id: int,
    request_data: dict,
    db: Session = Depends(get_db)
):
    """Sync workspace users for a service account"""
    try:
        logger.info(f"Syncing service account {account_id}...")
        
        # Get service account
        account = db.query(ServiceAccount).filter(ServiceAccount.id == account_id).first()
        if not account:
            raise HTTPException(status_code=404, detail="Service account not found")
        
        # Extract admin_email from request data
        admin = request_data.get('admin_email') or account.admin_email
        if not admin:
            raise HTTPException(status_code=400, detail="Admin email is required for sync")
        
        logger.info(f"Using admin email: {admin}")
        
        # Decrypt service account JSON
        try:
            decrypted_json = account.get_json_content()
            if not decrypted_json:
                raise HTTPException(status_code=400, detail="Failed to decrypt service account JSON")
        except Exception as e:
            logger.error(f"Failed to decrypt JSON: {e}")
            raise HTTPException(status_code=400, detail="Failed to decrypt service account credentials")
        
        # Create Google service
        try:
            google_service = GoogleWorkspaceService(decrypted_json)
            logger.info("Google Workspace service initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Google service: {e}")
            raise HTTPException(status_code=400, detail=f"Failed to initialize Google service: {str(e)}")
        
        # Fetch users from Google Workspace
        try:
            logger.info(f"Fetching users from Google Workspace (admin: {admin})...")
            users = google_service.fetch_workspace_users(admin)
            logger.info(f"Fetched {len(users)} users from Google Workspace")
        except Exception as e:
            logger.error(f"Failed to fetch users from Google: {e}")
            raise HTTPException(status_code=400, detail=f"Failed to fetch users from Google Workspace: {str(e)}")
        
        # Clear existing users for this account
        db.query(WorkspaceUser).filter(WorkspaceUser.service_account_id == account_id).delete()
        
        # Save users to database
        saved_users = []
        for user_data in users:
            user = WorkspaceUser(
                service_account_id=account_id,
                email=user_data['email'],
                full_name=user_data.get('full_name', ''),
                first_name=user_data.get('first_name', ''),
                last_name=user_data.get('last_name', ''),
                is_active=user_data.get('is_active', True),
                quota_limit=100,  # Default quota
                emails_sent_today=0
            )
            db.add(user)
            saved_users.append(user)
        
        # Update account total_users count
        account.total_users = len(saved_users)
        account.last_synced = func.now()
        
        db.commit()
        
        logger.info(f"Successfully synced {len(saved_users)} users for account {account.name}")
        return {
            "success": True,
            "message": f"Successfully synced {len(saved_users)} users",
            "user_count": len(saved_users),
            "account_name": account.name
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to sync service account: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{account_id}/users", response_model=List[WorkspaceUserResponse])
async def get_account_users(account_id: int, db: Session = Depends(get_db)):
    """Get all users for a specific service account"""
    try:
        logger.info(f"Fetching users for account {account_id}...")
        
        users = db.query(WorkspaceUser).filter(
            WorkspaceUser.service_account_id == account_id
        ).all()
        
        logger.info(f"Found {len(users)} users for account {account_id}")
        return users
        
    except Exception as e:
        logger.error(f"Failed to fetch users for account {account_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))