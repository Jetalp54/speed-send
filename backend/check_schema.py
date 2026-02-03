
from app.database import engine
from sqlalchemy import inspect

inspector = inspect(engine)
columns = [c['name'] for c in inspector.get_columns('contacts')]
print(f"Columns in 'contacts' table: {columns}")

if 'isp' in columns and 'geo_country' in columns:
    print("SUCCESS: Columns exist.")
else:
    print("FAILURE: Missing columns.")
