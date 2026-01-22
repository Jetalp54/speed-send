-- Migration: Enterprise Schema V1
-- Upgrades sending engine, tracking, contacts, and analytics

BEGIN;

-- 1. SENDING ENGINE
-- ---------------------------------------------------------------------

-- Job Status Enum (if PostgreSQL < 11, we use text check)
-- DO THIS CAREFULLY: IF EXISTS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_status') THEN
        CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'retrying');
    END IF;
END$$;

-- SendJob Table
CREATE TABLE IF NOT EXISTS send_jobs (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
    service_account_id INTEGER REFERENCES service_accounts(id),
    status job_status DEFAULT 'pending',
    batch_size INTEGER DEFAULT 50,
    retry_count INTEGER DEFAULT 0,
    priority INTEGER DEFAULT 1,
    worker_node VARCHAR(255),
    locked_until TIMESTAMPTZ,
    recipient_ids JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_send_jobs_status ON send_jobs(status);
CREATE INDEX IF NOT EXISTS idx_send_jobs_campaign_id ON send_jobs(campaign_id);

-- EmailLog Updates
ALTER TABLE email_logs 
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255),
ADD COLUMN IF NOT EXISTS message_id VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_logs_idempotency ON email_logs(idempotency_key);


-- 2. PRIVACY-SAFE TRACKING
-- ---------------------------------------------------------------------

-- LinkMap
CREATE TABLE IF NOT EXISTS link_maps (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
    original_url TEXT NOT NULL,
    opaque_id VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_link_maps_opaque_id ON link_maps(opaque_id);

-- TrackingEvent
CREATE TABLE IF NOT EXISTS tracking_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(20) NOT NULL, -- 'open', 'click'
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
    email_log_id INTEGER REFERENCES email_logs(id),
    link_map_id INTEGER REFERENCES link_maps(id),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    user_agent TEXT,
    user_agent_type VARCHAR(50),
    geo_country VARCHAR(2),
    ip_hash VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_campaign_id ON tracking_events(campaign_id);


-- 3. ENTERPRISE CONTACTS
-- ---------------------------------------------------------------------

-- EnterpriseContact
CREATE TABLE IF NOT EXISTS contacts_enterprise (
    id SERIAL PRIMARY KEY,
    workspace_id INTEGER DEFAULT 0,
    email_hash VARCHAR(64) NOT NULL UNIQUE,
    email_encrypted TEXT,
    attributes JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_ent_email_hash ON contacts_enterprise(email_hash);

-- ContactTag
CREATE TABLE IF NOT EXISTS contact_tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL
);

-- ListMember
CREATE TABLE IF NOT EXISTS list_members (
    id SERIAL PRIMARY KEY,
    contact_list_id INTEGER NOT NULL REFERENCES contact_lists(id),
    contact_id INTEGER NOT NULL REFERENCES contacts_enterprise(id),
    status VARCHAR(20) DEFAULT 'active',
    tags JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(contact_list_id, contact_id)
);


-- 4. ANALYTICS AGGREGATION
-- ---------------------------------------------------------------------

-- DailyCampaignStats
CREATE TABLE IF NOT EXISTS stats_campaign_daily (
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
    date DATE NOT NULL,
    sent INTEGER DEFAULT 0,
    delivered INTEGER DEFAULT 0,
    opens_unique INTEGER DEFAULT 0,
    clicks_unique INTEGER DEFAULT 0,
    bounces INTEGER DEFAULT 0,
    complaints INTEGER DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (campaign_id, date)
);

COMMIT;
