import psycopg2
import sys

def run_migration():
    # Database connection parameters
    # Extracted from the user's environment and previous findings
    db_params = {
        "dbname": "gmail_saas",
        "user": "gmailsaas",
        "password": "gmailsaas123",
        "host": "localhost",
        "port": "5432"
    }

    print(f"Attempting migration on {db_params['dbname']} at {db_params['host']}...")

    try:
        # Try primary connection
        conn = psycopg2.connect(**db_params)
    except Exception as e:
        print(f"Primary connection failed: {e}")
        print("Retrying with 127.0.0.1...")
        try:
            db_params["host"] = "127.0.0.1"
            conn = psycopg2.connect(**db_params)
        except Exception as e2:
            print(f"Retry failed: {e2}")
            return

    conn.autocommit = True
    cur = conn.cursor()
    print("Connected to database.")

    # List of columns to add
    migrations = [
        ("contacts", "isp", "VARCHAR(255)"),
        ("contacts", "geo_country", "VARCHAR(2)"),
        ("contacts", "geo_city", "VARCHAR(100)"),
        ("contacts", "tags", "JSONB"),
        ("email_logs", "contact_list_id", "INTEGER"),
        ("email_logs", "unsubscribes_count", "INTEGER DEFAULT 0"),
        ("gmail_drafts", "contact_list_id", "INTEGER"),
        ("campaigns", "tracking_domain_id", "INTEGER"),
        ("draft_campaigns", "recipient_metadata", "JSONB DEFAULT '{}'")
    ]

    for table, col, col_type in migrations:
        try:
            # PostgreSQL "ADD COLUMN IF NOT EXISTS" is safe
            cur.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {col_type};")
            print(f"  ✔ {table}.{col} assured.")
        except Exception as e:
            print(f"  ✖ Error on {table}.{col}: {e}")

    # Create missing tables for tracking
    new_tables = [
        """
        CREATE TABLE IF NOT EXISTS tracking_domains (
            id SERIAL PRIMARY KEY,
            domain VARCHAR(255) UNIQUE NOT NULL,
            ip_address VARCHAR(50),
            status VARCHAR(50) DEFAULT 'pending',
            ssl_active BOOLEAN DEFAULT FALSE,
            provisioning_log TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_checked_at TIMESTAMP WITH TIME ZONE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS task_logs (
            id SERIAL PRIMARY KEY,
            campaign_id INTEGER,
            level VARCHAR(20) DEFAULT 'info',
            message TEXT,
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            data JSONB
        );
        """
    ]

    for sql in new_tables:
        try:
            cur.execute(sql)
            print("  ✔ Tracking/Task tables assured.")
        except Exception as e:
            print(f"  ✖ Error creating tables: {e}")

    cur.close()
    conn.close()
    print("🏁 Migration completed successfully.")

if __name__ == "__main__":
    run_migration()
