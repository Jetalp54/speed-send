
import sys
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Add current directory to path to import app modules if needed
sys.path.append(os.getcwd())

# Database URL (adjust if needed, assuming default from docker-compose)
DATABASE_URL = "postgresql://postgres:postgres@db:5432/gmail_saas"

def fix_tracking_domains():
    try:
        engine = create_engine(DATABASE_URL)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
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
            
        # Force the first one to be active and ssl_active=True just in case (though we removed requirement, better safe)
        print("\n🔧 Forcing first domain to ACTIVE...")
        db.execute(text("UPDATE tracking_domains SET status = 'active', ssl_active = true WHERE id = :id"), {"id": domains[0].id})
        db.commit()
        print("✅ First domain updated to ACTIVE status.")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    fix_tracking_domains()
