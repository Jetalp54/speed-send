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

            conn.commit()
            print("Schema update completed successfully.")
    except Exception as e:
        print(f"CRITICAL ERROR: {e}")

if __name__ == "__main__":
    fix_schema()
