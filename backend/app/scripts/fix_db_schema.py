from sqlalchemy import create_engine, text
import os
import sys

# Add parent dir to path to find app
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from app.config import settings

def fix_schema():
    print(f"Connecting to DB: {settings.DATABASE_URL}")
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT")
        
        # 1. Fix DraftCampaigns table
        try:
            print("Checking draft_campaigns table...")
            # Check if column exists
            try:
                conn.execute(text("SELECT test_after_email FROM draft_campaigns LIMIT 1"))
                print(" - test_after_email already exists.")
            except Exception:
                print(" - Adding test_after_email column...")
                conn.execute(text("ALTER TABLE draft_campaigns ADD COLUMN test_after_email VARCHAR(255)"))

            try:
                conn.execute(text("SELECT test_after_count FROM draft_campaigns LIMIT 1"))
                print(" - test_after_count already exists.")
            except Exception:
                print(" - Adding test_after_count column...")
                conn.execute(text("ALTER TABLE draft_campaigns ADD COLUMN test_after_count INTEGER DEFAULT 0"))
                
        except Exception as e:
            print(f"Error fixing draft_campaigns: {e}")

        # 2. Fix Campaigns table
        try:
            print("Checking campaigns table...")
            try:
                conn.execute(text("SELECT test_after_email FROM campaigns LIMIT 1"))
                print(" - test_after_email already exists.")
            except Exception:
                print(" - Adding test_after_email column...")
                conn.execute(text("ALTER TABLE campaigns ADD COLUMN test_after_email VARCHAR(255)"))

            try:
                conn.execute(text("SELECT test_after_count FROM campaigns LIMIT 1"))
                print(" - test_after_count already exists.")
            except Exception:
                print(" - Adding test_after_count column...")
                conn.execute(text("ALTER TABLE campaigns ADD COLUMN test_after_count INTEGER DEFAULT 0"))

        except Exception as e:
            print(f"Error fixing campaigns: {e}")

        print("Schema fix complete.")

if __name__ == "__main__":
    fix_schema()
