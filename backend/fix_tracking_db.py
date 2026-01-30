
import sys
import os
from sqlalchemy import text

# Add current directory to path
sys.path.append(os.getcwd())

# Import from the app's own database configuration
# This ensures we use the same connection string and network settings as the running app
import sys
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Add current directory to path
sys.path.append(os.getcwd())

from app.config import settings

def fix_tracking_domains():
    db = None
    try:
        # Override host to 'postgres' which is the docker-compose service name
        # The internal app uses strict env vars, but 'db' alias might be missing in some contexts
        # 'postgres' is the canonical service name defined in docker-compose.yml
        db_url = settings.DATABASE_URL
        if "@db:" in db_url or "@gmail_saas_db:" in db_url:
             pass 
        else:
             # Force correct internal hostname if it looks like localhost
             print(f"⚠️ Original DB URL: {db_url}")
             db_url = db_url.replace("localhost", "postgres")
             db_url = db_url.replace("@db:", "@postgres:")
             print(f"🔧 Revised DB URL: {db_url}")

        engine = create_engine(db_url)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        
        print("🔌 Connecting to database...")
        db = SessionLocal()
        
        print("🔍 Checking Tracking Domains...")
        result = db.execute(text("SELECT id, domain, status, ssl_active FROM tracking_domains"))
        domains = result.fetchall()
        
        if not domains:
            print("❌ No tracking domains found in database!")
            return
            
        print(f"✅ Found {len(domains)} domains:")
        for d in domains:
            print(f"   - ID: {d.id}, Domain: {d.domain}, Status: {d.status}, SSL: {d.ssl_active}")
            
        # Force the first one to be active and ssl_active=True
        first_domain_id = domains[0][0] # Access by index since it's a Row object (or .id if mapped)
        
        print(f"\n🔧 Forcing domain ID {first_domain_id} to ACTIVE...")
        db.execute(text("UPDATE tracking_domains SET status = 'active', ssl_active = true WHERE id = :id"), {"id": first_domain_id})
        db.commit()
        print("✅ Domain updated successfully.")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        if db:
            db.close()

if __name__ == "__main__":
    fix_tracking_domains()
