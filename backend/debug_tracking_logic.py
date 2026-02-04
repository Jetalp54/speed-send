import sys
import os
from datetime import datetime

# Add project root to path
sys.path.append(os.getcwd())

from app.database import SessionLocal
from app.models import LinkMap, EmailLog
from app.services.tracking import OpaqueSigner

def test_tracking_flow():
    db = SessionLocal()
    try:
        print("--- Testing Tracking Logic ---")
        
        # 1. Create Dummy LinkMap
        original_url = "https://example.com"
        link_map = LinkMap(campaign_id=1, original_url=original_url)
        db.add(link_map)
        db.commit()
        db.refresh(link_map)
        print(f"Created LinkMap ID: {link_map.id} -> {original_url}")
        
        # 2. Sign Token
        email_log_id = 99999
        token = OpaqueSigner.sign(email_log_id, link_map.id)
        print(f"Generated Token: {token}")
        
        # 3. Unsign Token
        decoded_log_id, decoded_link_id = OpaqueSigner.unsign(token)
        print(f"Decoded: LogID={decoded_log_id}, LinkMapID={decoded_link_id}")
        
        if decoded_link_id == link_map.id and decoded_log_id == email_log_id:
            print("SUCCESS: Token encode/decode match.")
        else:
            print("FAILURE: Token mismatch.")
            
    except Exception as e:
        print(f"ERROR: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    test_tracking_flow()
