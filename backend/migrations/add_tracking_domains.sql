-- Create tracking_domains table
CREATE TABLE IF NOT EXISTS tracking_domains (
    id SERIAL PRIMARY KEY,
    domain VARCHAR(255) NOT NULL UNIQUE,
    ip_address VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending',
    ssl_active BOOLEAN DEFAULT FALSE,
    provisioning_log TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_checked_at TIMESTAMP WITH TIME ZONE
);

-- Add tracking_domain_id to campaigns
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS tracking_domain_id INTEGER REFERENCES tracking_domains(id) ON DELETE SET NULL;

-- Add tracking_domain_id to draft_campaigns
ALTER TABLE draft_campaigns 
ADD COLUMN IF NOT EXISTS tracking_domain_id INTEGER REFERENCES tracking_domains(id) ON DELETE SET NULL;

-- Index for domain lookups
CREATE INDEX IF NOT EXISTS idx_tracking_domains_domain ON tracking_domains(domain);
