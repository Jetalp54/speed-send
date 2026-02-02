
import psycopg2
import os

def migrate():
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        # Fallback for local testing if needed
        db_url = "postgresql://postgres:postgres@localhost:5432/gmail_saas"
    
    print(f"Connecting to database for V3 migration...")
    
    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()
        
        print("Adding tracking columns to campaigns...")
        try:
            cur.execute("ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS opens_count INTEGER DEFAULT 0;")
            cur.execute("ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS clicks_count INTEGER DEFAULT 0;")
            cur.execute("ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS bounces_count INTEGER DEFAULT 0;")
            print("✅ campaigns updated.")
        except Exception as e:
            print(f"Error updating campaigns: {e}")

        print("Adding tracking columns to email_logs...")
        try:
            cur.execute("ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS opens_count INTEGER DEFAULT 0;")
            cur.execute("ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS clicks_count INTEGER DEFAULT 0;")
            print("✅ email_logs updated.")
        except Exception as e:
            print(f"Error updating email_logs: {e}")

        # Fix: Ensure TrackingEvent has the new columns if they were missed
        print("Ensuring TrackingEvent draft_campaign_id exists...")
        try:
            cur.execute("ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS draft_campaign_id INTEGER;")
            print("✅ tracking_events verified.")
        except Exception as e:
            print(f"Error verifying tracking_events: {e}")

        cur.close()
        conn.close()
        print("🚀 V3 Migration finished successfully!")
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
