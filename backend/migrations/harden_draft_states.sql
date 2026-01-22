-- Migration: Harden Draft Campaign States
-- Enforces strict state lifecycle using CHECK constraints and Triggers

BEGIN;

-- 1. Create temporary enum mapping function (for migration safety)
-- Map old statuses to new standard if needed
UPDATE draft_campaigns SET status = 'created' WHERE status = 'draft';
UPDATE draft_campaigns SET status = 'ready' WHERE status = 'uploaded';
UPDATE draft_campaigns SET status = 'sending' WHERE status = 'launched';

-- 2. Add CHECK constraint to enforce valid states
ALTER TABLE draft_campaigns 
ADD CONSTRAINT check_draft_status_valid 
CHECK (status IN ('created', 'uploading', 'ready', 'scheduled', 'sending', 'paused', 'completed', 'failed', 'canceled'));

-- 3. Create or Replace validation function
CREATE OR REPLACE FUNCTION validate_draft_transition_func()
RETURNS TRIGGER AS $$
DECLARE
    valid_transitions JSONB := '{
        "created": ["uploading", "failed", "canceled"],
        "uploading": ["ready", "failed", "canceled"],
        "ready": ["sending", "scheduled", "canceled"],
        "scheduled": ["sending", "paused", "canceled"],
        "sending": ["paused", "completed", "failed", "canceled"],
        "paused": ["sending", "canceled"],
        "failed": ["created", "canceled"],
        "completed": [],
        "canceled": ["created"]
    }';
    allowed_next_states JSONB;
BEGIN
    -- Allow same-status updates (idempotency)
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Get allowed transitions for current state
    allowed_next_states := valid_transitions -> OLD.status;

    -- If no transitions defined (terminal state) or new status not allowed
    IF allowed_next_states IS NULL OR NOT (allowed_next_states @> to_jsonb(NEW.status)) THEN
        RAISE EXCEPTION 'Invalid Draft Transition: % -> %', OLD.status, NEW.status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Attach Trigger to draft_campaigns
DROP TRIGGER IF EXISTS validate_draft_transition ON draft_campaigns;

CREATE TRIGGER validate_draft_transition
BEFORE UPDATE OF status ON draft_campaigns
FOR EACH ROW
EXECUTE FUNCTION validate_draft_transition_func();

COMMIT;
