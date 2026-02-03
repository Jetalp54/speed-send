
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.tasks_data import import_contacts_task
from app.celery_app import celery_app
import shutil
import os
import uuid

router = APIRouter(prefix="/contacts-enterprise", tags=["contacts-enterprise"])

@router.post("/import/async")
async def import_contacts_async(
    list_id: int,
    default_isp: str = None,
    default_geo_country: str = None,
    default_geo_city: str = None,
    default_tags: str = None,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload CSV for background import.
    Returns task_id.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be CSV")
        
    # Save to temp
    temp_dir = "temp_uploads"
    os.makedirs(temp_dir, exist_ok=True)
    
    file_id = str(uuid.uuid4())
    file_path = os.path.join(temp_dir, f"{file_id}.csv")
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")
        
    # Prepare defaults
    defaults = {
        "isp": default_isp,
        "geo_country": default_geo_country,
        "geo_city": default_geo_city,
        "tags": default_tags
    }
        
    # Trigger Task
    task = import_contacts_task.delay(file_path, list_id, defaults)
    
    return {
        "message": "Import started",
        "task_id": task.id,
        "filename": file.filename
    }

@router.get("/import/status/{task_id}")
async def get_import_status(task_id: str):
    """
    Check import progress.
    """
    task_result = celery_app.AsyncResult(task_id)
    
    response = {
        "task_id": task_id,
        "status": task_result.status,
        "result": task_result.result
    }
    
    return response
