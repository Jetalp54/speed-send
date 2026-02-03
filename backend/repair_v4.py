import logging
from sqlalchemy import create_engine, text, inspect
import os

# Manual setup for standalone execution
DB_USER = "gmailsaas"
DB_PASS = "gmailsaas123"
DB_HOST = "localhost"
DB_PORT = "5432"
DB_NAME = "gmail_saas"

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("db_repair_v4")

def repair_db():
    try:
        engine = create_engine(DATABASE_URL)
        logger.info(f"🚀 Connecting to {DB_NAME} at {DB_HOST}...")
        
        # Test connection
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("✅ Connection successful.")
    except Exception as e:
        logger.error(f"❌ Connection failed: {e}")
        return

    migrations = [
        # Table: contacts
        ("contacts", "isp", "VARCHAR(255)"),
        ("contacts", "geo_country", "VARCHAR(2)"),
        ("contacts", "geo_city", "VARCHAR(100)"),
        ("contacts", "tags", "JSONB OVERRIDING_COL_TYPE"), # Just a note, JSONB is fine
        
        # Table: email_logs
        ("email_logs", "contact_list_id", "INTEGER"),
        ("email_logs", "unsubscribes_count", "INTEGER DEFAULT 0"),
        
        # Table: gmail_drafts
        ("gmail_drafts", "contact_list_id", "INTEGER"),
        
        # Table: campaigns
        ("campaigns", "tracking_domain_id", "INTEGER"),
        
        # Table: draft_campaigns
        ("draft_campaigns", "recipient_metadata", "JSONB DEFAULT '{}'"),
    ]

    inspector = inspect(engine)
    
    with engine.begin() as conn:
        for table, column, col_type in migrations:
            # Check if table exists
            if not inspector.has_table(table):
                logger.warning(f"⚠️ Table {table} does not exist, skipping column addition.")
                continue

            # Check if column exists
            columns = [c['name'] for c in inspector.get_columns(table)]
            if column not in columns:
                try:
                    logger.info(f"➕ Adding column {column} to table {table}...")
                    # Normalize col_type for the script
                    final_type = col_type.split(' ')[0]
                    if 'JSONB' in col_type:
                        final_type = "JSONB"
                    
                    if 'DEFAULT' in col_type:
                        # Append default part
                        default_part = col_type[col_type.find('DEFAULT'):]
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {final_type} {default_part};"))
                    else:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {final_type};"))
                        
                    logger.info(f"✅ Column {column} added to {table}.")
                except Exception as e:
                    logger.warning(f"⚠️ Could not add column {column} to {table}: {e}")
            else:
                logger.info(f"ℹ️ Column {column} already exists in {table}.")

    # Create missing tables if any (TrackingDomain, TaskLog, etc.)
    # Since we can't import Base, we'll do them manually if we know them
    new_tables = [
        """
        CREATE TABLE IF NOT EXISTS tracking_domains (
            id SERIAL PRIMARY KEY,
            domain VARCHAR(255) UNIQUE NOT NULL,
            ip_address VARCHAR(50),
            status VARCHAR(50) DEFAULT 'pending',
            ssl_active BOOLEAN DEFAULT FALSE,
            provisioning_log TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_checked_at TIMESTAMP WITH TIME ZONE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS task_logs (
            id SERIAL PRIMARY KEY,
            campaign_id INTEGER,
            level VARCHAR(20) DEFAULT 'info',
            message TEXT,
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            data JSONB
        );
        """
    ]
    
    with engine.begin() as conn:
        for sql in new_tables:
            try:
                conn.execute(text(sql))
                logger.info("✅ Ensured table existence via manual SQL.")
            except Exception as e:
                logger.error(f"❌ Error creating table: {e}")

    logger.info("🏁 Repair v4 completed!")

if __name__ == "__main__":
    repair_db()
