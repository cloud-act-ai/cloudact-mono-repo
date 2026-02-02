-- ============================================
-- Drop Billing Sync Infrastructure
-- ============================================
-- This migration removes billing sync tables and functions
-- that are no longer needed after consolidating to Supabase.
--
-- Previously, these were used for Stripe -> BigQuery sync retries.
-- Now that quotas and subscriptions are managed in Supabase,
-- this infrastructure is obsolete.
-- ============================================

-- Drop functions first (reverse order of creation)
DROP FUNCTION IF EXISTS get_billing_sync_stats();
DROP FUNCTION IF EXISTS cleanup_old_billing_syncs(INTEGER);
DROP FUNCTION IF EXISTS fail_billing_sync(UUID, TEXT);
DROP FUNCTION IF EXISTS complete_billing_sync(UUID);
DROP FUNCTION IF EXISTS get_pending_billing_syncs(INTEGER);
DROP FUNCTION IF EXISTS add_to_billing_sync_queue(TEXT, UUID, TEXT, JSONB, TEXT);

-- Update run_scheduled_cleanup to remove billing sync cleanup
-- Recreate without the billing_syncs_deleted column
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

  -- Note: billing sync cleanup removed (tables dropped)

  RETURN QUERY SELECT v_rate_limits, v_webhooks, v_tokens, v_invites;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop indexes (will be dropped with table, but explicit for clarity)
DROP INDEX IF EXISTS idx_billing_sync_queue_pending;
DROP INDEX IF EXISTS idx_billing_sync_queue_org;
DROP INDEX IF EXISTS idx_billing_sync_queue_cleanup;

-- Drop the billing_sync_queue table
DROP TABLE IF EXISTS billing_sync_queue CASCADE;

-- Drop the plan_change_audit table if it exists
-- Note: Keeping this table for now as it may have audit value
-- Uncomment below to drop if confirmed not needed:
-- DROP TABLE IF EXISTS plan_change_audit CASCADE;

-- ============================================
-- Comments
-- ============================================
COMMENT ON FUNCTION run_scheduled_cleanup IS 'Cleanup scheduled maintenance (billing sync removed)';
