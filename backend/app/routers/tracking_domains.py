from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.services.domain_provisioner import DomainProvisioner
from pydantic import BaseModel
from typing import List, Optional
import datetime

router = APIRouter()

class TrackingDomainCreate(BaseModel):
    domain: str
    ip_address: str
    root_password: str # Only used for provisioning, not stored

class TrackingDomainResponse(BaseModel):
    id: int
    domain: str
    ip_address: str
    status: str
    ssl_active: bool
    provisioning_log: Optional[str] = None
    created_at: datetime.datetime
    
    class Config:
        from_attributes = True

@router.post("/tracking-domains", response_model=TrackingDomainResponse)
def add_tracking_domain(
    domain_data: TrackingDomainCreate, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db)
):
    """
    Register a new tracking domain and start provisioning.
    """
    # Check uniqueness
    exists = db.query(models.TrackingDomain).filter(models.TrackingDomain.domain == domain_data.domain).first()
    if exists:
        raise HTTPException(status_code=400, detail="Domain already registered")
    
    # Create DB Entry
    new_domain = models.TrackingDomain(
        domain=domain_data.domain,
        ip_address=domain_data.ip_address,
        status='provisioning',
        ssl_active=False,
        provisioning_log="Starting provisioning..."
    )
    db.add(new_domain)
    db.commit()
    db.refresh(new_domain)
    
    # Start Provisioning in Background
    provisioner = DomainProvisioner(db, new_domain.id)
    background_tasks.add_task(
        provisioner.provision, 
        domain_data.ip_address, 
        domain_data.root_password, 
        domain_data.domain
    )
    
    return new_domain

@router.get("/tracking-domains", response_model=List[TrackingDomainResponse])
def get_tracking_domains(db: Session = Depends(get_db)):
    return db.query(models.TrackingDomain).order_by(models.TrackingDomain.created_at.desc()).all()

@router.delete("/tracking-domains/{domain_id}")
def delete_tracking_domain(domain_id: int, db: Session = Depends(get_db)):
    domain = db.query(models.TrackingDomain).filter(models.TrackingDomain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
        
    db.delete(domain)
    db.commit()
    return {"message": "Domain removed"}
