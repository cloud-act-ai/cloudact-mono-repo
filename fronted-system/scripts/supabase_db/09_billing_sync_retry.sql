-- ============================================
-- Billing Sync Retry Queue
-- ============================================
-- This migration adds:
-- 1. Failed sync retry table for Stripe → BigQuery sync failures
-- 2. Plan change audit log table
-- 3. Functions for retry queue management
--
-- CRITICAL: Fixes the "silent sync failure" issue where backend
-- sync fails but user sees success. Failed syncs are queued for retry.
-- ============================================

-- Failed sync retry queue
CREATE TABLE IF NOT EXISTS billing_sync_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_slug TEXT NOT NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL,  -- 'plan_change', 'checkout', 'webhook', 'cancellation'
  payload JSONB NOT NULL,   -- Full sync payload for retry
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_retry_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Enable RLS (only service_role can access)
ALTER TABLE billing_sync_queue ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE billing_sync_queue IS 'Queue for failed Stripe→BigQuery sync retries. Only accessible via service_role.';

-- Indexes for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_billing_sync_queue_pending
ON billing_sync_queue(status, next_retry_at)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_billing_sync_queue_org
ON billing_sync_queue(org_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_sync_queue_cleanup
ON billing_sync_queue(created_at)
WHERE status IN ('completed', 'failed');

-- ============================================
-- Plan Change Audit Log
-- ============================================

CREATE TABLE IF NOT EXISTS plan_change_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  org_slug TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,  -- 'upgrade', 'downgrade', 'cancel', 'reactivate'
  old_plan TEXT,
  new_plan TEXT,
  old_price DECIMAL(10,2),
  new_price DECIMAL(10,2),
  stripe_subscription_id TEXT,
  stripe_event_id TEXT,  -- For webhook-triggered changes
  sync_status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'synced', 'failed'
  sync_error TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE plan_change_audit ENABLE ROW LEVEL SECURITY;

-- Allow org owners to view their audit log
CREATE POLICY "Owners can view plan change audit"
ON plan_change_audit FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_members.org_id = plan_change_audit.org_id
      AND organization_members.user_id = auth.uid()
      AND organization_members.role = 'owner'
      AND organization_members.status = 'active'
  )
);

COMMENT ON TABLE plan_change_audit IS 'Audit trail for all subscription plan changes.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_plan_change_audit_org
ON plan_change_audit(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plan_change_audit_user
ON plan_change_audit(user_id, created_at DESC);

-- ============================================
-- Sync Queue Management Functions
-- ============================================

-- Add item to sync queue
CREATE OR REPLACE FUNCTION add_to_billing_sync_queue(
  p_org_slug TEXT,
  p_org_id UUID,
  p_sync_type TEXT,
  p_payload JSONB,
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO billing_sync_queue (org_slug, org_id, sync_type, payload, error_message)
  VALUES (p_org_slug, p_org_id, p_sync_type, p_payload, p_error_message)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get next items to retry (with lock)
CREATE OR REPLACE FUNCTION get_pending_billing_syncs(p_limit INTEGER DEFAULT 10)
RETURNS SETOF billing_sync_queue AS $$
BEGIN
  RETURN QUERY
  UPDATE billing_sync_queue
  SET status = 'processing',
      last_retry_at = NOW()
  WHERE id IN (
    SELECT id FROM billing_sync_queue
    WHERE status = 'pending'
      AND next_retry_at <= NOW()
      AND retry_count < max_retries
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark sync as completed
CREATE OR REPLACE FUNCTION complete_billing_sync(p_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE billing_sync_queue
  SET status = 'completed',
      completed_at = NOW()
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark sync as failed and schedule retry
CREATE OR REPLACE FUNCTION fail_billing_sync(
  p_id UUID,
  p_error_message TEXT
)
RETURNS VOID AS $$
DECLARE
  v_retry_count INTEGER;
  v_max_retries INTEGER;
BEGIN
  SELECT retry_count, max_retries INTO v_retry_count, v_max_retries
  FROM billing_sync_queue WHERE id = p_id;

  IF v_retry_count + 1 >= v_max_retries THEN
    -- Max retries reached, mark as permanently failed
    UPDATE billing_sync_queue
    SET status = 'failed',
        retry_count = retry_count + 1,
        error_message = p_error_message,
        completed_at = NOW()
    WHERE id = p_id;
  ELSE
    -- Schedule for retry with exponential backoff (1min, 2min, 4min, 8min, 16min)
    UPDATE billing_sync_queue
    SET status = 'pending',
        retry_count = retry_count + 1,
        error_message = p_error_message,
        next_retry_at = NOW() + ((2 ^ retry_count) * INTERVAL '1 minute')
    WHERE id = p_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup old completed/failed syncs
CREATE OR REPLACE FUNCTION cleanup_old_billing_syncs(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM billing_sync_queue
  WHERE status IN ('completed', 'failed')
    AND created_at < NOW() - (retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get sync queue stats (for monitoring)
CREATE OR REPLACE FUNCTION get_billing_sync_stats()
RETURNS TABLE(
  pending_count BIGINT,
  processing_count BIGINT,
  failed_count BIGINT,
  completed_today BIGINT,
  oldest_pending TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'processing'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COUNT(*) FILTER (WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '24 hours'),
    MIN(created_at) FILTER (WHERE status = 'pending')
  FROM billing_sync_queue;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Update run_scheduled_cleanup to include billing sync cleanup
-- ============================================

CREATE OR REPLACE FUNCTION run_scheduled_cleanup()
RETURNS TABLE(
  rate_limits_deleted INTEGER,
  webhook_events_deleted INTEGER,
  deletion_tokens_deleted INTEGER,
  invites_expired INTEGER,
  billing_syncs_deleted INTEGER
) AS $$
DECLARE
  v_rate_limits INTEGER;
  v_webhooks INTEGER;
  v_tokens INTEGER;
  v_invites INTEGER;
  v_billing_syncs INTEGER;
BEGIN
  -- Cleanup rate limits older than 24 hours
  SELECT cleanup_old_rate_limits(24) INTO v_rate_limits;

  -- Cleanup webhook events older than 24 hours
  SELECT cleanup_old_webhook_events(24) INTO v_webhooks;

  -- Cleanup expired deletion tokens
  SELECT cleanup_expired_deletion_tokens() INTO v_tokens;

  -- Expire old invites
  SELECT cleanup_expired_invites() INTO v_invites;

  -- Cleanup old billing syncs (30 days retention)
  SELECT cleanup_old_billing_syncs(30) INTO v_billing_syncs;

  RETURN QUERY SELECT v_rate_limits, v_webhooks, v_tokens, v_invites, v_billing_syncs;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Comments
-- ============================================

COMMENT ON FUNCTION add_to_billing_sync_queue IS 'Add a failed sync to the retry queue';
COMMENT ON FUNCTION get_pending_billing_syncs IS 'Get pending syncs for processing (with row-level lock)';
COMMENT ON FUNCTION complete_billing_sync IS 'Mark a sync as successfully completed';
COMMENT ON FUNCTION fail_billing_sync IS 'Mark sync as failed and schedule retry with exponential backoff';
COMMENT ON FUNCTION get_billing_sync_stats IS 'Get queue statistics for monitoring dashboards';
