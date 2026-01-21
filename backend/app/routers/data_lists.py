from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import logging

from app.database import get_db
from app.models import DataList
from app.schemas import DataListCreate, DataListUpdate, DataListResponse

router = APIRouter(prefix="/data-lists", tags=["data-lists"])
logger = logging.getLogger(__name__)

@router.get("", response_model=List[DataListResponse])
async def list_data_lists(db: Session = Depends(get_db)):
    """List all data lists"""
    try:
        logger.info("Fetching data lists...")
        data_lists = db.query(DataList).all()
        logger.info(f"Found {len(data_lists)} data lists")
        return data_lists
    except Exception as e:
        logger.error(f"Failed to fetch data lists: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", response_model=DataListResponse)
async def create_data_list(data_list: DataListCreate, db: Session = Depends(get_db)):
    """Create a new data list"""
    try:
        logger.info(f"Creating data list: {data_list.name}")
        
        # Calculate total recipients
        total_recipients = len(data_list.recipients) if data_list.recipients else 0
        
        db_data_list = DataList(
            name=data_list.name,
            description=data_list.description,
            recipients=data_list.recipients,
            total_recipients=total_recipients,
            list_type=data_list.list_type
        )
        
        db.add(db_data_list)
        db.commit()
        db.refresh(db_data_list)
        
        logger.info(f"Successfully created data list: {db_data_list.name} (ID: {db_data_list.id})")
        return db_data_list
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create data list: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{list_id}", response_model=DataListResponse)
async def get_data_list(list_id: int, db: Session = Depends(get_db)):
    """Get a specific data list"""
    data_list = db.query(DataList).filter(DataList.id == list_id).first()
    if not data_list:
        raise HTTPException(status_code=404, detail="Data list not found")
    return data_list

@router.put("/{list_id}", response_model=DataListResponse)
async def update_data_list(
    list_id: int,
    data_list_update: DataListUpdate,
    db: Session = Depends(get_db)
):
    """Update a data list"""
    data_list = db.query(DataList).filter(DataList.id == list_id).first()
    if not data_list:
        raise HTTPException(status_code=404, detail="Data list not found")
    
    try:
        # Update fields
        update_data = data_list_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(data_list, field, value)
        
        # Recalculate total recipients if recipients were updated
        if 'recipients' in update_data and update_data['recipients'] is not None:
            data_list.total_recipients = len(update_data['recipients'])
        
        db.commit()
        db.refresh(data_list)
        
        logger.info(f"Successfully updated data list: {data_list.name}")
        return data_list
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update data list: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{list_id}")
async def delete_data_list(list_id: int, db: Session = Depends(get_db)):
    """Delete a data list"""
    data_list = db.query(DataList).filter(DataList.id == list_id).first()
    if not data_list:
        raise HTTPException(status_code=404, detail="Data list not found")
    
    try:
        db.delete(data_list)
        db.commit()
        
        logger.info(f"Successfully deleted data list: {data_list.name}")
        return {"message": "Data list deleted successfully"}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete data list: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/search/{query}", response_model=List[DataListResponse])
async def search_data_lists(query: str, db: Session = Depends(get_db)):
    """Search data lists by name or description"""
    try:
        logger.info(f"Searching data lists for: {query}")
        
        data_lists = db.query(DataList).filter(
            DataList.name.ilike(f"%{query}%") | 
            DataList.description.ilike(f"%{query}%")
        ).all()
        
        logger.info(f"Found {len(data_lists)} data lists matching query")
        return data_lists
        
    except Exception as e:
        logger.error(f"Failed to search data lists: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{list_id}/add-recipients")
async def add_recipients_to_list(
    list_id: int,
    recipients: List[str],
    db: Session = Depends(get_db)
):
    """Add recipients to an existing data list"""
    try:
        logger.info(f"Adding {len(recipients)} recipients to data list {list_id}")
        
        data_list = db.query(DataList).filter(DataList.id == list_id).first()
        if not data_list:
            raise HTTPException(status_code=404, detail="Data list not found")
        
        # Add new recipients to existing list
        existing_recipients = data_list.recipients or []
        new_recipients = [email for email in recipients if email not in existing_recipients]
        updated_recipients = existing_recipients + new_recipients
        
        data_list.recipients = updated_recipients
        data_list.total_recipients = len(updated_recipients)
        
        db.commit()
        db.refresh(data_list)
        
        logger.info(f"Successfully added {len(new_recipients)} new recipients to data list")
        return {
            "message": f"Successfully added {len(new_recipients)} new recipients",
            "total_recipients": data_list.total_recipients,
            "new_recipients_added": len(new_recipients)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to add recipients to data list: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{list_id}/remove-recipients")
async def remove_recipients_from_list(
    list_id: int,
    recipients: List[str],
    db: Session = Depends(get_db)
):
    """Remove recipients from a data list"""
    try:
        logger.info(f"Removing {len(recipients)} recipients from data list {list_id}")
        
        data_list = db.query(DataList).filter(DataList.id == list_id).first()
        if not data_list:
            raise HTTPException(status_code=404, detail="Data list not found")
        
        # Remove recipients from existing list
        existing_recipients = data_list.recipients or []
        updated_recipients = [email for email in existing_recipients if email not in recipients]
        
        data_list.recipients = updated_recipients
        data_list.total_recipients = len(updated_recipients)
        
        db.commit()
        db.refresh(data_list)
        
        removed_count = len(existing_recipients) - len(updated_recipients)
        logger.info(f"Successfully removed {removed_count} recipients from data list")
        return {
            "message": f"Successfully removed {removed_count} recipients",
            "total_recipients": data_list.total_recipients,
            "recipients_removed": removed_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to remove recipients from data list: {e}")
        raise HTTPException(status_code=500, detail=str(e))