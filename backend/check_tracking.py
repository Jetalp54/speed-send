
from app.database import engine
from sqlalchemy import inspect

inspector = inspect(engine)
columns = [c['name'] for c in inspector.get_columns('tracking_events')]
print(f"Columns in 'tracking_events': {columns}")

if 'ip_address' not in columns:
    print("MISSING: ip_address")
else:
    print("EXISTS: ip_address")
