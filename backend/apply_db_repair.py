import os
import sys
import logging
from sqlalchemy import text, inspect
from app.database import engine, Base
from app import models

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("db_repair")

def repair_db():
    logger.info("🚀 Starting database schema repair...")
    
    # 1. Create all new tables that might be missing
    try:
        logger.info("Creating any missing tables...")
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Table creation check completed.")
    except Exception as e:
        logger.error(f"❌ Error during table creation: {e}")

    # 2. Add missing columns to existing tables
    # (SQLAlchemy create_all doesn't add columns to existing tables)
    
    migrations = [
        # Table: contacts
        ("contacts", "isp", "VARCHAR(255)"),
        ("contacts", "geo_country", "VARCHAR(2)"),
        ("contacts", "geo_city", "VARCHAR(100)"),
        ("contacts", "tags", "JSONB"),
        
        # Table: email_logs
        ("email_logs", "contact_list_id", "INTEGER"),
        ("email_logs", "unsubscribes_count", "INTEGER DEFAULT 0"),
        
        # Table: gmail_drafts
        ("gmail_drafts", "contact_list_id", "INTEGER"),
        
        # Table: campaigns
        ("campaigns", "tracking_domain_id", "INTEGER"),
        
        # Table: draft_campaigns
        ("draft_campaigns", "recipient_metadata", "JSONB DEFAULT '{}'"),
        ("draft_campaigns", "list_start_index", "INTEGER DEFAULT 0"),
        ("draft_campaigns", "list_send_limit", "INTEGER"),
    ]

    inspector = inspect(engine)
    
    with engine.begin() as conn:
        for table, column, col_type in migrations:
            # Check if column exists
            columns = [c['name'] for c in inspector.get_columns(table)]
            if column not in columns:
                try:
                    logger.info(f"➕ Adding column {column} to table {table}...")
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type};"))
                    logger.info(f"✅ Column {column} added to {table}.")
                except Exception as e:
                    logger.warning(f"⚠️ Could not add column {column} to {table}: {e}")
            else:
                logger.info(f"ℹ️ Column {column} already exists in {table}.")

    # 3. Add Foreign Key constraints if missing (Safe attempt)
    constraints = [
        ("email_logs", "fk_email_logs_contact_list", "contact_list_id", "contact_lists", "id"),
        ("gmail_drafts", "fk_gmail_drafts_contact_list", "contact_list_id", "contact_lists", "id"),
        ("campaigns", "fk_campaigns_tracking_domain", "tracking_domain_id", "tracking_domains", "id"),
    ]
    
    with engine.begin() as conn:
        for table, const_name, col, ref_table, ref_col in constraints:
            try:
                # Simple attempt - if it fails (e.g. exists), we just log and continue
                logger.info(f"🔗 Adding FK constraint {const_name} on {table}({col})...")
                conn.execute(text(f"ALTER TABLE {table} ADD CONSTRAINT {const_name} FOREIGN KEY ({col}) REFERENCES {ref_table} ({ref_col}) ON DELETE SET NULL;"))
            except Exception:
                # logger.debug(f"ℹ️ Constraint {const_name} might already exist or could not be added.")
                pass

    logger.info("🏁 Database repair completed successfully!")

if __name__ == "__main__":
    repair_db()
