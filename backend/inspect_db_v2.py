import sys
import os
from sqlalchemy import inspect, text

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.database import engine

def inspect_db():
    inspector = inspect(engine)
    
    tables = ['draft_campaigns', 'draft_campaign_users', 'draft_campaign_accounts', 'draft_campaign_contacts']
    
    for table in tables:
        print(f"\n--- Table: {table} ---")
        try:
            columns = inspector.get_columns(table)
            for column in columns:
                print(f"  - {column['name']}: {column['type']}")
        except Exception as e:
            print(f"  Error inspecting {table}: {e}")

    print("\n--- Testing Select ---")
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT id, name FROM draft_campaigns LIMIT 1"))
            row = result.fetchone()
            print(f"  Query success: {row}")
    except Exception as e:
        print(f"  Query failed: {e}")

if __name__ == "__main__":
    inspect_db()
