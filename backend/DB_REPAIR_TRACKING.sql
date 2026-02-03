
-- Add missing columns to tracking_events table
ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50);
ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS device_type VARCHAR(20);
ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS os VARCHAR(50);
ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS browser VARCHAR(50);
ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS geo_country VARCHAR(2);
ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS geo_city VARCHAR(100);
ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS geo_region VARCHAR(100);
ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS ip_hash VARCHAR(64);
ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS user_agent_type VARCHAR(50);
