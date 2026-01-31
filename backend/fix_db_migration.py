
import sys
import os
import psycopg2
from urllib.parse import urlparse

# Add parent directory to path to import config if needed
sys.path.append(os.getcwd())

# Database URL from config (hardcoded for reliability in this script)
DB_URL = "postgresql://gmailsaas:gmailsaas123@localhost:5432/gmail_saas"

def fix_database():
    print(f"Connecting to {DB_URL}...")
    try:
        conn = psycopg2.connect(DB_URL)
        conn.autocommit = True
        cur = conn.cursor()
        
        print("Checking/Adding 'version' column to 'campaigns' table...")
        cur.execute("ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;")
        
        print("Success! 'version' column added.")
        conn.close()
    except Exception as e:
        print(f"Error: {e}")
        print("Could not connect to database from host. Ensure localhost:5432 is accessible.")

if __name__ == "__main__":
    fix_database()
