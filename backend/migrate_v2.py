
import psycopg2
import os
import time

def migrate():
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        print("DATABASE_URL not set")
        return

    print(f"Connecting to {db_url}...")
    
    # Simple parsing of postgresql://user:pass@host:port/db
    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()
        
        print("Adding columns to draft_campaigns...")
        try:
            cur.execute("ALTER TABLE draft_campaigns ADD COLUMN IF NOT EXISTS opens_count INTEGER DEFAULT 0;")
            cur.execute("ALTER TABLE draft_campaigns ADD COLUMN IF NOT EXISTS clicks_count INTEGER DEFAULT 0;")
            cur.execute("ALTER TABLE draft_campaigns ADD COLUMN IF NOT EXISTS bounces_count INTEGER DEFAULT 0;")
            print("✅ draft_campaigns updated.")
        except Exception as e:
            print(f"Error updating draft_campaigns: {e}")

        print("Updating tracking_events...")
        try:
            # Make campaign_id nullable
            cur.execute("ALTER TABLE tracking_events ALTER COLUMN campaign_id DROP NOT NULL;")
            # Add draft_campaign_id
            cur.execute("ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS draft_campaign_id INTEGER;")
            # Add foreign key constraint if it doesn't exist
            try:
                cur.execute("ALTER TABLE tracking_events ADD CONSTRAINT fk_tracking_events_draft_campaign_id FOREIGN KEY (draft_campaign_id) REFERENCES draft_campaigns(id);")
            except:
                 pass # Constraint might already exist
            print("✅ tracking_events updated.")
        except Exception as e:
            print(f"Error updating tracking_events: {e}")

        cur.close()
        conn.close()
        print("🚀 Migration finished successfully!")
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
