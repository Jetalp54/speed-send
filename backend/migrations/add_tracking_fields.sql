-- Migration: Add new fields to tracking_events table
-- Run this on your database after setting up tracking server

-- Add new GeoIP fields
ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS geo_city VARCHAR(100);
ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS geo_region VARCHAR(100);

-- Add device detection fields  
ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS device_type VARCHAR(20);
ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS os VARCHAR(50);
ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS browser VARCHAR(50);

-- Create unsubscribe_tokens table
CREATE TABLE IF NOT EXISTS unsubscribe_tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(64) UNIQUE NOT NULL,
    campaign_id INTEGER NOT NULL,
    email_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON unsubscribe_tokens(token);
CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_campaign ON unsubscribe_tokens(campaign_id);

-- Update tracking_events to support unsubscribe event type
-- (event_type column already allows any string, just document it)
COMMENT ON COLUMN tracking_events.event_type IS 'Event type: open, click, unsubscribe';
