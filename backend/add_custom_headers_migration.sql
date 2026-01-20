-- Migration: Add custom headers and template fields to draft_campaigns
-- Run this on your database

ALTER TABLE draft_campaigns 
ADD COLUMN IF NOT EXISTS use_custom_headers BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS custom_headers TEXT,
ADD COLUMN IF NOT EXISTS body_format VARCHAR(10) DEFAULT 'html',
ADD COLUMN IF NOT EXISTS body_template TEXT;

-- Verify the columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'draft_campaigns'
AND column_name IN ('use_custom_headers', 'custom_headers', 'body_format', 'body_template');
