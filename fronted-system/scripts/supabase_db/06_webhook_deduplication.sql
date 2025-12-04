-- ============================================
-- Webhook Event Deduplication Table
-- ============================================
-- This migration creates a table for atomic webhook event deduplication.
-- Uses INSERT ... ON CONFLICT to atomically claim events.
--
-- CRITICAL: This solves the race condition between check and claim.
-- ============================================

-- Create webhook events table for atomic deduplication
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  instance_id TEXT  -- Optional: track which instance processed
);

-- Enable RLS but allow service_role only
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- No policies = only service_role can access
COMMENT ON TABLE stripe_webhook_events IS 'Atomic deduplication for Stripe webhook events. Only accessible via service_role.';

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON stripe_webhook_events(processed_at);

-- Cleanup function to remove old events (call periodically)
CREATE OR REPLACE FUNCTION cleanup_old_webhook_events(retention_hours INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM stripe_webhook_events
  WHERE processed_at < NOW() - (retention_hours || ' hours')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
