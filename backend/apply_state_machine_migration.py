import os
import sys
from sqlalchemy import create_engine, text
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def load_env_file(env_path):
    """Load .env file into os.environ"""
    if not os.path.exists(env_path):
        logger.warning(f".env file not found at {env_path}")
        return
        
    logger.info(f"Loading .env from {env_path}")
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            try:
                key, value = line.split('=', 1)
                os.environ[key.strip()] = value.strip()
            except ValueError:
                pass

def get_database_url():
    # Try looking for .env in current and parent directories
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Check backend/.env
    backend_env = os.path.join(current_dir, '.env')
    if os.path.exists(backend_env):
        load_env_file(backend_env)
        
    # Check root .env (parent of backend)
    root_env = os.path.join(os.path.dirname(current_dir), '.env')
    if os.path.exists(root_env):
        load_env_file(root_env)
        
    url = os.environ.get('DATABASE_URL')
    if not url:
        # Construct from components if available
        user = os.environ.get('POSTGRES_USER')
        password = os.environ.get('POSTGRES_PASSWORD')
        db = os.environ.get('POSTGRES_DB')
        host = os.environ.get('POSTGRES_HOST', 'localhost')
        port = os.environ.get('POSTGRES_PORT', '5432')
        
        if user and password and db:
            url = f"postgresql://{user}:{password}@{host}:{port}/{db}"
            
    return url

def apply_migration():
    logger.info("Starting migration application (Standalone Mode)...")
    
    database_url = get_database_url()
    
    if not database_url:
        # Fallback to default for docker-compose if env vars missing
        logger.warning("DATABASE_URL not found in env. Using default for dev environment...")
        database_url = "postgresql://gmailsaas:gmailsaas123@localhost:5432/gmail_saas"
        
    logger.info(f"Target Database: {database_url.split('@')[-1]}") 

    try:
        engine = create_engine(database_url)
        
        # Read SQL file
        migration_file = os.path.join(os.path.dirname(__file__), 'migrations', 'add_state_machine_support.sql')
        logger.info(f"Reading migration file: {migration_file}")
        
        with open(migration_file, 'r') as f:
            sql_content = f.read()
            
        with engine.connect() as conn:
            logger.info("Connected to database.")
            
            # Execute the SQL script
            try:
                # SQLAlchemy text() might struggle with $$ blocks if we don't be careful
                # But usually it passes the string to driver.
                conn.execute(text(sql_content))
                conn.commit()
                logger.info("Migration executed successfully!")
            except Exception as e:
                logger.error(f"Error executing migration: {e}")
                raise e
                
    except Exception as e:
        logger.critical(f"Migration failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    apply_migration()
