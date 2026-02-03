from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
import logging

from app.database import get_db
from app.models import ContactList, Contact
from app.schemas import (
    ContactListCreate, ContactListUpdate, ContactListResponse,
    ContactCreate, ContactUpdate, ContactResponse
)

router = APIRouter(prefix="/contacts", tags=["contacts"])
logger = logging.getLogger(__name__)

# Contact Lists
@router.get("/lists", response_model=List[ContactListResponse])
async def list_contact_lists(db: Session = Depends(get_db)):
    """List all contact lists"""
    try:
        logger.info("Fetching contact lists...")
        contact_lists = db.query(ContactList).options(joinedload(ContactList.contacts)).all()
        logger.info(f"Found {len(contact_lists)} contact lists")
        return contact_lists
    except Exception as e:
        logger.error(f"Failed to fetch contact lists: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/lists", response_model=ContactListResponse)
async def create_contact_list(contact_list: ContactListCreate, db: Session = Depends(get_db)):
    """Create a new contact list"""
    try:
        logger.info(f"Creating contact list: {contact_list.name}")
        
        db_contact_list = ContactList(
            name=contact_list.name,
            description=contact_list.description
        )
        
        db.add(db_contact_list)
        db.commit()
        db.refresh(db_contact_list)
        
        logger.info(f"Successfully created contact list: {db_contact_list.name} (ID: {db_contact_list.id})")
        return db_contact_list
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create contact list: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/lists/{list_id}", response_model=ContactListResponse)
async def get_contact_list(list_id: int, db: Session = Depends(get_db)):
    """Get a specific contact list"""
    contact_list = db.query(ContactList).filter(ContactList.id == list_id).first()
    if not contact_list:
        raise HTTPException(status_code=404, detail="Contact list not found")
    return contact_list

@router.put("/lists/{list_id}", response_model=ContactListResponse)
async def update_contact_list(
    list_id: int,
    contact_list_update: ContactListUpdate,
    db: Session = Depends(get_db)
):
    """Update a contact list"""
    contact_list = db.query(ContactList).filter(ContactList.id == list_id).first()
    if not contact_list:
        raise HTTPException(status_code=404, detail="Contact list not found")
    
    try:
        # Update fields
        update_data = contact_list_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(contact_list, field, value)
        
        db.commit()
        db.refresh(contact_list)
        
        logger.info(f"Successfully updated contact list: {contact_list.name}")
        return contact_list
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update contact list: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/lists/{list_id}")
async def delete_contact_list(list_id: int, db: Session = Depends(get_db)):
    """Delete a contact list"""
    contact_list = db.query(ContactList).filter(ContactList.id == list_id).first()
    if not contact_list:
        raise HTTPException(status_code=404, detail="Contact list not found")
    
    try:
        # Delete associations with draft campaigns first (avoid FK constraint error)
        try:
             from app.models import DraftCampaignContact
             # Use synchronize_session=False for bulk delete
             db.query(DraftCampaignContact).filter(DraftCampaignContact.contact_list_id == list_id).delete(synchronize_session=False)
             db.flush()
        except Exception as e:
            logger.error(f"Could not clear draft associations for list {list_id}: {e}")
            # Do not suppress, let it fail so we know
            raise 

        db.delete(contact_list)
        db.commit()
        
        logger.info(f"Successfully deleted contact_list: {contact_list.name}")
        return {"message": "Contact list deleted successfully"}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete contact list: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Contacts
@router.get("", response_model=List[ContactResponse])
async def list_contacts(
    contact_list_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """List all contacts, optionally filtered by contact list"""
    try:
        logger.info("Fetching contacts...")
        query = db.query(Contact)
        
        if contact_list_id:
            query = query.filter(Contact.contact_list_id == contact_list_id)
            logger.info(f"Filtering by contact list ID: {contact_list_id}")
        
        contacts = query.all()
        logger.info(f"Found {len(contacts)} contacts")
        return contacts
        
    except Exception as e:
        logger.error(f"Failed to fetch contacts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", response_model=ContactResponse)
async def create_contact(contact: ContactCreate, db: Session = Depends(get_db)):
    """Create a new contact"""
    try:
        logger.info(f"Creating contact: {contact.email}")
        
        # Check if contact list exists
        contact_list = db.query(ContactList).filter(ContactList.id == contact.contact_list_id).first()
        if not contact_list:
            raise HTTPException(status_code=404, detail="Contact list not found")
        
        db_contact = Contact(
            contact_list_id=contact.contact_list_id,
            email=contact.email,
            first_name=contact.first_name,
            last_name=contact.last_name,
            isp=contact.isp,
            geo_country=contact.geo_country,
            geo_city=contact.geo_city,
            tags=contact.tags
        )
        
        db.add(db_contact)
        db.commit()
        db.refresh(db_contact)
        
        logger.info(f"Successfully created contact: {db_contact.email} (ID: {db_contact.id})")
        return db_contact
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create contact: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{contact_id}", response_model=ContactResponse)
async def get_contact(contact_id: int, db: Session = Depends(get_db)):
    """Get a specific contact"""
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact

@router.put("/{contact_id}", response_model=ContactResponse)
async def update_contact(
    contact_id: int,
    contact_update: ContactUpdate,
    db: Session = Depends(get_db)
):
    """Update a contact"""
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    try:
        # Update fields
        update_data = contact_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(contact, field, value)
        
        db.commit()
        db.refresh(contact)
        
        logger.info(f"Successfully updated contact: {contact.email}")
        return contact
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update contact: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{contact_id}")
async def delete_contact(contact_id: int, db: Session = Depends(get_db)):
    """Delete a contact"""
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    try:
        db.delete(contact)
        db.commit()
        
        logger.info(f"Successfully deleted contact: {contact.email}")
        return {"message": "Contact deleted successfully"}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete contact: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Bulk operations
@router.post("/bulk-import")
async def bulk_import_contacts(
    contact_list_id: int,
    contacts: List[ContactCreate],
    db: Session = Depends(get_db)
):
    """Bulk import contacts into a contact list"""
    try:
        logger.info(f"Bulk importing {len(contacts)} contacts into list {contact_list_id}")
        
        # Check if contact list exists
        contact_list = db.query(ContactList).filter(ContactList.id == contact_list_id).first()
        if not contact_list:
            raise HTTPException(status_code=404, detail="Contact list not found")
        
        # Create contacts
        created_contacts = []
        for contact_data in contacts:
            contact = Contact(
                contact_list_id=contact_list_id,
                email=contact_data.email,
                first_name=contact_data.first_name,
                last_name=contact_data.last_name,
                isp=contact_data.isp,
                geo_country=contact_data.geo_country,
                geo_city=contact_data.geo_city,
                tags=contact_data.tags
            )
            db.add(contact)
            created_contacts.append(contact)
        
        db.commit()
        
        logger.info(f"Successfully bulk imported {len(created_contacts)} contacts")
        return {
            "message": f"Successfully imported {len(created_contacts)} contacts",
            "count": len(created_contacts)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to bulk import contacts: {e}")
        raise HTTPException(status_code=500, detail=str(e))