
import logging
from app.database import engine
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def add_column_if_not_exists(conn, table, column, definition):
    try:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
        conn.commit()
        logger.info(f"Added column {column} to {table}")
    except Exception as e:
        # Ignore if exists (error code would be nice but simple try-catch works for "if not exists" logic in app context)
        # Using IF NOT EXISTS in SQL is better if DB supports it (Postgres does)
        # But let's try strict SQL first
        logger.info(f"Column {column} might already exist or error: {e}")
        conn.rollback()

def repair():
    with engine.connect() as conn:
        logger.info("Starting Schema Repair...")
        
        cols = [
            ("ip_address", "VARCHAR(50)"),
            ("geo_country", "VARCHAR(2)"),
            ("geo_city", "VARCHAR(100)"),
            ("device_type", "VARCHAR(20)"),
            ("browser", "VARCHAR(50)"),
            ("os", "VARCHAR(50)"),
            ("ip_hash", "VARCHAR(64)"),
            ("user_agent_type", "VARCHAR(50)"),
            ("geo_region", "VARCHAR(100)")
        ]
        
        for col, defn in cols:
            sql = f"ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS {col} {defn}"
            try:
                conn.execute(text(sql))
                conn.commit()
                logger.info(f"Executed: {sql}")
            except Exception as e:
                logger.error(f"Failed to add {col}: {e}")
                conn.rollback()

        logger.info("Schema Repair Completed.")

if __name__ == "__main__":
    repair()
