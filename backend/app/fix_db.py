import os
import sys
from sqlalchemy import create_engine, text
import time

# Get DB URL from env or default
# In docker-compose, this should be available
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("DATABASE_URL not set. Trying default postgresql://user:password@db/app")
    DATABASE_URL = "postgresql://user:password@db/app"

def fix_schema():
    print(f"Connecting to database...")
    try:
        engine = create_engine(DATABASE_URL)
        with engine.connect() as conn:
            print("Connected. Checking columns...")
            
            # Add use_custom_headers
            try:
                conn.execute(text("ALTER TABLE draft_campaigns ADD COLUMN IF NOT EXISTS use_custom_headers BOOLEAN DEFAULT FALSE"))
                print("- Added use_custom_headers")
            except Exception as e:
                print(f"- Error adding use_custom_headers: {e}")
                
            # Add custom_headers
            try:
                conn.execute(text("ALTER TABLE draft_campaigns ADD COLUMN IF NOT EXISTS custom_headers TEXT"))
                print("- Added custom_headers")
            except Exception as e:
                print(f"- Error adding custom_headers: {e}")
                
            # Add body_format
            try:
                conn.execute(text("ALTER TABLE draft_campaigns ADD COLUMN IF NOT EXISTS body_format VARCHAR DEFAULT 'html'"))
                print("- Added body_format")
            except Exception as e:
                print(f"- Error adding body_format: {e}")
                
            # Add body_template
            try:
                conn.execute(text("ALTER TABLE draft_campaigns ADD COLUMN IF NOT EXISTS body_template TEXT"))
                print("- Added body_template")
            except Exception as e:
                print(f"- Error adding body_template: {e}")

            # ==========================================
            # Fix Tracking Events (Missing Columns)
            # ==========================================
            tracking_cols = [
                ("user_agent", "TEXT"),
                ("user_agent_type", "VARCHAR(50)"),
                ("geo_country", "VARCHAR(2)"),
                ("geo_city", "VARCHAR(100)"),
                ("geo_region", "VARCHAR(100)"),
                ("ip_hash", "VARCHAR(64)"),
                ("device_type", "VARCHAR(20)"),
                ("os", "VARCHAR(50)"),
                ("browser", "VARCHAR(50)")
            ]
            
            for col_name, col_type in tracking_cols:
                try:
                    # distinct 'tracking_events' table
                    conn.execute(text(f"ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
                    print(f"- Checked/Added tracking_events.{col_name}")
                except Exception as e:
                    print(f"- Error checking {col_name}: {e}")

            conn.commit()
            print("Schema update completed successfully.")
    except Exception as e:
        print(f"CRITICAL ERROR: {e}")

if __name__ == "__main__":
    fix_schema()
