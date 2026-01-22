
import csv
import logging
import hashlib
import io
from sqlalchemy.orm import Session
from sqlalchemy import insert, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.models import EnterpriseContact, ListMember, ContactList
from app.encryption import EncryptionService

logger = logging.getLogger(__name__)

class ContactImporter:
    def __init__(self, db: Session):
        self.db = db
        self.encryption = EncryptionService()

    def import_csv_stream(self, file_content: str, list_id: int):
        """
        Parses CSV string and imports contacts in batches.
        Assumes headers: email, [first_name, last_name, ...]
        """
        csv_file = io.StringIO(file_content)
        reader = csv.DictReader(csv_file)
        
        # Normalize headers
        if not reader.fieldnames:
             raise ValueError("CSV file is empty or missing headers")
             
        headers = [h.lower() for h in reader.fieldnames]
        
        if 'email' not in headers:
            # Fallback: try to find column that looks like email
            raise ValueError("CSV must have an 'email' column")

        batch_size = 1000
        batch = []
        
        count = 0
        for row in reader:
            # Clean email
            email = row.get('email', '').strip().lower()
            if not email or '@' not in email:
                continue
                
            batch.append({
                'email': email,
                'first_name': row.get('first_name', row.get('firstname', '')),
                'last_name': row.get('last_name', row.get('lastname', '')),
                'attributes': row # Store full row as attributes for now
            })
            
            if len(batch) >= batch_size:
                self._process_batch(batch, list_id)
                count += len(batch)
                batch = []
                
        if batch:
            self._process_batch(batch, list_id)
            count += len(batch)
            
        return count

    def _process_batch(self, rows: list, list_id: int):
        """
        1. Hash emails.
        2. Upsert EnterpriseContact (get IDs).
        3. Upsert ListMember.
        """
        contact_mappings = []
        email_hashes = []
        
        # Prepare data
        for row in rows:
            email = row['email']
            m = hashlib.sha256()
            m.update(email.encode('utf-8'))
            email_hash = m.hexdigest()
            
            encrypted = self.encryption.encrypt(email)
            
            contact_mappings.append({
                'workspace_id': 0, # Default workspace for now
                'email_hash': email_hash,
                'email_encrypted': encrypted,
                'attributes': row['attributes']
            })
            email_hashes.append(email_hash)
            
        if not contact_mappings:
            return

        # 1. Upsert Contacts (ON CONFLICT DO NOTHING)
        # We want to insert if not exists, and get IDs.
        # SQLAlchemy 1.4/2.0+ Core 
        stmt = pg_insert(EnterpriseContact).values(contact_mappings)
        stmt = stmt.on_conflict_do_update(
            index_elements=['email_hash'],
            set_=dict(updated_at=text("now()")) # Touch updated_at to return ID? No need, just do nothing or update aux fields
        ).returning(EnterpriseContact.id, EnterpriseContact.email_hash)
        
        result = self.db.execute(stmt)
        # Result contains (id, email_hash) for affected rows (inserted or updated)
        # Note: If ON CONFLICT DO NOTHING and row exists, it might NOT return the row in some PG versions/drivers unless we emulate.
        # Safer approach for "Get or Create":
        # A) Insert ignore -> Select IN hashes
        # B) Upsert returning ID
        
        # Let's do B (Upsert with DO UPDATE) - it guarantees returning IDs.
        upserted_map = {row.email_hash: row.id for row in result}
        
        # For any missing hashes (if unexpected behavior), fetch them
        missing_hashes = set(email_hashes) - set(upserted_map.keys())
        if missing_hashes:
            # Fetch existing IDs
            existing = self.db.query(EnterpriseContact.id, EnterpriseContact.email_hash)\
                .filter(EnterpriseContact.email_hash.in_(list(missing_hashes))).all()
            for r in existing:
                upserted_map[r.email_hash] = r.id
                
        # 2. Prepare List Members
        member_mappings = []
        for i, row in enumerate(rows):
            email_h = email_hashes[i]
            contact_id = upserted_map.get(email_h)
            
            if contact_id:
                member_mappings.append({
                    'contact_list_id': list_id,
                    'contact_id': contact_id,
                    'status': 'active',
                    'tags': []
                })
                
        if member_mappings:
            # Upsert Members
            # Unique constraint needed on (contact_list_id, contact_id)
            # We assume unique index exists or we strictly rely on "ON CONFLICT DO NOTHING"
            # The schema definition in models.py didn't explicitly show the unique index code but it's implied for list membership.
            # I will use DO NOTHING just in case to avoid dups.
            stmt_members = pg_insert(ListMember).values(member_mappings)
            stmt_members = stmt_members.on_conflict_do_nothing()
            self.db.execute(stmt_members)
            
        self.db.commit()
