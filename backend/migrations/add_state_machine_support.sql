-- Add version column for optimistic locking
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL;

-- Create state transition logs table
CREATE TABLE IF NOT EXISTS state_transition_logs (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,  -- 'campaign' or 'draft_campaign'
    entity_id INTEGER NOT NULL,
    from_status VARCHAR(50) NOT NULL,
    to_status VARCHAR(50) NOT NULL,
    triggered_by VARCHAR(100),  -- 'api', 'celery_task', etc.
    celery_task_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_stl_entity ON state_transition_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_stl_created ON state_transition_logs(created_at);

-- Function to validate campaign status transitions
CREATE OR REPLACE FUNCTION validate_campaign_transition()
RETURNS TRIGGER AS $$
DECLARE
    -- Define valid transitions as an array of allowed [from, to] pairs
    valid_transitions TEXT[][] := ARRAY[
        ['draft', 'preparing'], 
        ['draft', 'canceled'],
        ['preparing', 'ready'], 
        ['preparing', 'failed'], 
        ['preparing', 'canceled'],
        ['ready', 'sending'], 
        ['ready', 'canceled'],
        ['ready', 'paused'], -- Allow pausing from ready if needed, though usually sending first
        ['sending', 'paused'], 
        ['sending', 'completed'], 
        ['sending', 'failed'], 
        ['sending', 'canceled'],
        ['paused', 'sending'], 
        ['paused', 'canceled'],
        ['failed', 'draft'], -- Retry flow: failed -> draft (to edit) -> preparing
        ['failed', 'canceled'],
        ['canceled', 'draft'] -- Allow reviving canceled campaigns as draft
    ];
    i INTEGER;
    is_valid BOOLEAN := FALSE;
BEGIN
    -- If status hasn't changed, allow encryption/other updates
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;
    
    -- Check if the transition is in the allowed list
    FOR i IN 1..array_length(valid_transitions, 1) LOOP
        IF valid_transitions[i][1] = OLD.status::TEXT AND valid_transitions[i][2] = NEW.status::TEXT THEN
            is_valid := TRUE;
            EXIT;
        END IF;
    END LOOP;
    
    IF NOT is_valid THEN
        RAISE EXCEPTION 'Invalid campaign status transition from % to %', OLD.status, NEW.status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce the validation
DROP TRIGGER IF EXISTS trg_validate_campaign_status ON campaigns;
CREATE TRIGGER trg_validate_campaign_status
    BEFORE UPDATE OF status ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION validate_campaign_transition();
