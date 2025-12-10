-- ============================================
-- Rate Limiting and Scheduled Cleanup
-- ============================================
-- This migration adds:
-- 1. Database-backed rate limiting (works across instances)
-- 2. Scheduled cleanup jobs for expired data
--
-- CRITICAL: Replaces in-memory rate limiting which doesn't
-- work in multi-instance deployments (Cloud Run, Vercel, etc.)
-- ============================================

-- Rate limiting table for distributed rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,  -- 'checkout', 'invite', 'api_call', etc.
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id, action_type, window_start)
);

-- Enable RLS (only service_role can access)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies = only service_role can access
COMMENT ON TABLE rate_limits IS 'Distributed rate limiting. Only accessible via service_role.';

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_action ON rate_limits(user_id, action_type, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup ON rate_limits(window_start);

-- ============================================
-- Rate Limiting Functions
-- ============================================

-- Check and increment rate limit atomically
-- Returns TRUE if within limit, FALSE if exceeded
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_action_type TEXT,
  p_max_requests INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_current_count INTEGER;
BEGIN
  -- Calculate window start (truncate to window boundary)
  v_window_start := date_trunc('second', NOW()) -
    ((EXTRACT(EPOCH FROM NOW())::INTEGER % p_window_seconds) * INTERVAL '1 second');

  -- Try to insert or update atomically
  INSERT INTO rate_limits (user_id, action_type, window_start, request_count)
  VALUES (p_user_id, p_action_type, v_window_start, 1)
  ON CONFLICT (user_id, action_type, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING request_count INTO v_current_count;

  -- Check if within limit
  RETURN v_current_count <= p_max_requests;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get current rate limit count
CREATE OR REPLACE FUNCTION get_rate_limit_count(
  p_user_id UUID,
  p_action_type TEXT,
  p_window_seconds INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  v_window_start := date_trunc('second', NOW()) -
    ((EXTRACT(EPOCH FROM NOW())::INTEGER % p_window_seconds) * INTERVAL '1 second');

  SELECT COALESCE(request_count, 0) INTO v_count
  FROM rate_limits
  WHERE user_id = p_user_id
    AND action_type = p_action_type
    AND window_start = v_window_start;

  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Cleanup Functions
-- ============================================

-- Cleanup old rate limit entries
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits(retention_hours INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM rate_limits
  WHERE window_start < NOW() - (retention_hours || ' hours')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup expired invites
CREATE OR REPLACE FUNCTION cleanup_expired_invites()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE invites
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < NOW();
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Master cleanup function (call periodically)
CREATE OR REPLACE FUNCTION run_scheduled_cleanup()
RETURNS TABLE(
  rate_limits_deleted INTEGER,
  webhook_events_deleted INTEGER,
  deletion_tokens_deleted INTEGER,
  invites_expired INTEGER
) AS $$
DECLARE
  v_rate_limits INTEGER;
  v_webhooks INTEGER;
  v_tokens INTEGER;
  v_invites INTEGER;
BEGIN
  -- Cleanup rate limits older than 24 hours
  SELECT cleanup_old_rate_limits(24) INTO v_rate_limits;

  -- Cleanup webhook events older than 24 hours
  SELECT cleanup_old_webhook_events(24) INTO v_webhooks;

  -- Cleanup expired deletion tokens
  SELECT cleanup_expired_deletion_tokens() INTO v_tokens;

  -- Expire old invites
  SELECT cleanup_expired_invites() INTO v_invites;

  RETURN QUERY SELECT v_rate_limits, v_webhooks, v_tokens, v_invites;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Additional Indexes for Performance
-- ============================================

-- Index for owner lookup (common query pattern)
CREATE INDEX IF NOT EXISTS idx_org_members_owner
ON organization_members(org_id)
WHERE role = 'owner' AND status = 'active';

-- Index for active members per org
CREATE INDEX IF NOT EXISTS idx_org_members_active_org
ON organization_members(org_id, status)
WHERE status = 'active';

-- Index for user's active memberships
CREATE INDEX IF NOT EXISTS idx_org_members_user_active
ON organization_members(user_id, status)
WHERE status = 'active';

-- ============================================
-- Comments
-- ============================================

COMMENT ON FUNCTION check_rate_limit IS 'Atomic rate limit check and increment. Returns TRUE if within limit.';
COMMENT ON FUNCTION run_scheduled_cleanup IS 'Master cleanup function. Call via cron or scheduled task.';

-- ============================================
-- Cron Job Setup (if pg_cron extension available)
-- ============================================
-- Uncomment if pg_cron is enabled in Supabase:
--
-- SELECT cron.schedule('cleanup-all', '0 2 * * *', 'SELECT run_scheduled_cleanup()');
--
-- This runs cleanup daily at 2 AM UTC.
