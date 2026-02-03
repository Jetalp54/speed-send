
import csv
import logging
import io
import json
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.models import Contact, ContactList

logger = logging.getLogger(__name__)

class ContactImporter:
    def __init__(self, db: Session):
        self.db = db

    def import_csv_stream(self, file_content: str, list_id: int, defaults: dict = None):
        """
        Parses CSV string and imports contacts into the simple 'Contact' model.
        Targeted for the User Sender frontend.
        
        Supported Headers (Case Insensitive):
        - email (Required)
        - first_name, firstname
        - last_name, lastname
        - isp
        - geo, country, geo_country
        - city, geo_city
        - tags (comma separated)
        """
        defaults = defaults or {}
        # Handle BOM if present
        if file_content.startswith('\ufeff'):
            file_content = file_content[1:]
            
        csv_file = io.StringIO(file_content)
        reader = csv.DictReader(csv_file)
        
        # Normalize headers validation
        if not reader.fieldnames:
            raise ValueError("CSV file is empty or missing headers")
             
        headers_map = {h.lower().strip(): h for h in reader.fieldnames}
        
        # Find email column
        email_col = next((h for h in headers_map if 'email' in h), None)
        if not email_col:
             raise ValueError("CSV must have an 'email' column")
        email_header = headers_map[email_col]

        logger.info(f"Importing to List {list_id}. Headers found: {list(headers_map.keys())}")

        batch_size = 1000
        batch = []
        count = 0
        
        # Valid column mappings
        first_name_col = next((h for h in headers_map if h in ['first_name', 'firstname', 'first name']), None)
        last_name_col = next((h for h in headers_map if h in ['last_name', 'lastname', 'last name']), None)
        isp_col = next((h for h in headers_map if h in ['isp', 'carrier']), None)
        
        # Geo / Country
        country_col = next((h for h in headers_map if h in ['geo', 'country', 'geo_country', 'location']), None)
        city_col = next((h for h in headers_map if h in ['city', 'geo_city']), None)
        
        # Tags
        tags_col = next((h for h in headers_map if 'tags' in h), None)
        
        for row in reader:
            # Clean email
            raw_email = row.get(email_header, '')
            if raw_email:
                email = raw_email.strip().lower()
            else:
                continue
                
            if not email or '@' not in email:
                continue
            
            # Extract fields with correct fallbacks
            # Priority: CSV Value -> Default Value -> None
            c_isp = row.get(headers_map[isp_col]) if isp_col else defaults.get('isp')
            c_country = row.get(headers_map[country_col]) if country_col else defaults.get('geo_country')
            c_city = row.get(headers_map[city_col]) if city_col else defaults.get('geo_city')
            
            c_data = {
                'contact_list_id': list_id,
                'email': email,
                'first_name': row.get(headers_map[first_name_col]) if first_name_col else None,
                'last_name': row.get(headers_map[last_name_col]) if last_name_col else None,
                'isp': c_isp,
                'geo_country': c_country,
                'geo_city': c_city,
                'tags': []
            }
            
            # Parse tags
            final_tags = []
            # 1. Add CSV tags
            if tags_col:
                raw_tags = row.get(headers_map[tags_col])
                if raw_tags:
                    final_tags.extend([t.strip() for t in raw_tags.replace('|', ',').split(',') if t.strip()])
            
            # 2. Add Default tags
            if 'tags' in defaults and defaults['tags']:
                default_tags = defaults['tags']
                if isinstance(default_tags, list):
                    final_tags.extend(default_tags)
                elif isinstance(default_tags, str):
                    final_tags.extend([t.strip() for t in default_tags.split(',') if t.strip()])
            
            c_data['tags'] = list(set(final_tags)) # Unique

            batch.append(c_data)
            
            if len(batch) >= batch_size:
                self._process_batch_simple(batch)
                count += len(batch)
                batch = []
                
        if batch:
            self._process_batch_simple(batch)
            count += len(batch)
            
        return count

    def _process_batch_simple(self, contacts_data: list):
        """
        Inserts contacts into the 'contacts' table.
        Handled Duplicates: Skips if email exists in this list.
        """
        if not contacts_data:
            return

        # 1. Identify existing emails in this list to avoid constraint errors
        # (Assuming uniqueness is preferred per list, though simple model allows dups unless logic prevents it)
        # We will retrieve existing emails for this list to filter them out.
        
        list_id = contacts_data[0]['contact_list_id']
        emails = {c['email'] for c in contacts_data}
        
        # Query existing in this list
        existing_q = self.db.query(Contact.email).filter(
            Contact.contact_list_id == list_id,
            Contact.email.in_(emails)
        ).all()
        
        existing_emails = {r[0] for r in existing_q}
        
        # Filter out existing
        to_insert = []
        for c in contacts_data:
            if c['email'] not in existing_emails:
                # Add to DB
                # Note: We must create model instances
                # or use bulk_insert_mappings if performance is critical.
                # bulk_save_objects is faster for Core, but let's use model instances for safety.
                # Actually, bulk_insert_mappings is best here.
                to_insert.append(c)
                # Add to existing_emails to prevent duplicates strictly within this batch (e.g. valid csv dups)
                existing_emails.add(c['email'])

        if to_insert:
            self.db.bulk_insert_mappings(Contact, to_insert)
            self.db.commit()
