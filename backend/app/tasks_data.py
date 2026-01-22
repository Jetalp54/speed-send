
from app.celery_app import celery_app
from app.database import SessionLocal
from app.services.contact_import import ContactImporter
import logging
import os

logger = logging.getLogger(__name__)

@celery_app.task(bind=True)
def import_contacts_task(self, file_path: str, list_id: int):
    """
    Async task to import contacts from CSV.
    Updates task state with progress.
    """
    db = SessionLocal()
    try:
        logger.info(f"Starting import for list {list_id} from {file_path}")
        importer = ContactImporter(db)
        
        # Read file content
        # For very large files, stream reading is better.
        # Importer expects string content or stream. 
        # Let's adjust importer to take file object or read file here.
        # Simplified: Read text here.
        
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        count = importer.import_csv_stream(content, list_id)
        
        # Cleanup
        if os.path.exists(file_path):
            os.remove(file_path)
            
        logger.info(f"Import task completed. Imported {count} contacts.")
        return {"status": "completed", "count": count}
        
    except Exception as e:
        logger.error(f"Import task failed: {e}")
        return {"status": "failed", "error": str(e)}
    finally:
        db.close()
