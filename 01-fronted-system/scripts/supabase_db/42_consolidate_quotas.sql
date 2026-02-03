-- Migration 42: Consolidate Quota Management
-- Date: 2026-02-01
-- Purpose: Consolidate quota limits and usage tracking into a unified system
--
-- This migration:
-- 1. Adds quota limit columns to organizations table
-- 2. Creates org_quotas table for usage tracking
-- 3. Adds RLS policies (service_role only)
-- 4. Creates helper functions for atomic quota operations
-- 5. Adds performance indexes

-- =============================================
-- STEP 1: Verify quota limit columns on organizations
-- =============================================
-- Note: These columns should already exist from previous migrations.
-- The correct column names are:
--   pipelines_per_day_limit (not daily_limit)
--   pipelines_per_month_limit (not monthly_limit)
--   concurrent_pipelines_limit (not concurrent_limit)
--   seat_limit
--   providers_limit
-- This step is a no-op if columns already exist.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS pipelines_per_day_limit INTEGER DEFAULT 6,
  ADD COLUMN IF NOT EXISTS pipelines_per_month_limit INTEGER DEFAULT 180,
  ADD COLUMN IF NOT EXISTS concurrent_pipelines_limit INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS seat_limit INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS providers_limit INTEGER DEFAULT 3;

-- Add comments for documentation
COMMENT ON COLUMN organizations.pipelines_per_day_limit IS 'Maximum pipeline runs per day (from Stripe product metadata: pipelinesPerDay). Default: 6 (Starter)';
COMMENT ON COLUMN organizations.pipelines_per_month_limit IS 'Maximum pipeline runs per month (from Stripe product metadata: pipelinesPerMonth). Default: 180 (Starter)';
COMMENT ON COLUMN organizations.concurrent_pipelines_limit IS 'Maximum concurrent pipeline executions (from Stripe product metadata: concurrentPipelines). Default: 1 (Starter)';
COMMENT ON COLUMN organizations.seat_limit IS 'Maximum team members (from Stripe product metadata: seats). Default: 2 (Starter)';
COMMENT ON COLUMN organizations.providers_limit IS 'Maximum providers/integrations (from Stripe product metadata: providers). Default: 3 (Starter)';

-- =============================================
-- STEP 2: Create org_quotas table for usage tracking
-- =============================================
CREATE TABLE IF NOT EXISTS org_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Usage counters
  pipelines_run_today INTEGER NOT NULL DEFAULT 0,
  pipelines_run_month INTEGER NOT NULL DEFAULT 0,
  concurrent_running INTEGER NOT NULL DEFAULT 0,

  -- Stats for monitoring/debugging
  pipelines_succeeded_today INTEGER NOT NULL DEFAULT 0,
  pipelines_failed_today INTEGER NOT NULL DEFAULT 0,
  max_concurrent_reached INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  last_pipeline_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one row per org per day
  UNIQUE(org_id, usage_date)
);

-- Add table comment
COMMENT ON TABLE org_quotas IS 'Daily usage tracking for organization quota enforcement. One row per org per day.';

-- Add column comments
COMMENT ON COLUMN org_quotas.usage_date IS 'Date for this usage record (UTC). New row created each day.';
COMMENT ON COLUMN org_quotas.pipelines_run_today IS 'Number of pipelines run today (resets daily)';
COMMENT ON COLUMN org_quotas.pipelines_run_month IS 'Running total of pipelines for current month';
COMMENT ON COLUMN org_quotas.concurrent_running IS 'Currently executing pipelines (increment on start, decrement on complete)';
COMMENT ON COLUMN org_quotas.pipelines_succeeded_today IS 'Pipelines that completed successfully today';
COMMENT ON COLUMN org_quotas.pipelines_failed_today IS 'Pipelines that failed today';
COMMENT ON COLUMN org_quotas.max_concurrent_reached IS 'Highest concurrent count reached today (for analytics)';
COMMENT ON COLUMN org_quotas.last_pipeline_at IS 'Timestamp of last pipeline execution';

-- =============================================
-- STEP 3: Add indexes for performance
-- =============================================
-- Primary lookup: org_id + usage_date (covered by UNIQUE constraint)

-- Index for finding today's quota by org
CREATE INDEX IF NOT EXISTS idx_org_quotas_org_date
  ON org_quotas(org_id, usage_date DESC);

-- Note: No functional index for monthly aggregation
-- date_trunc() is STABLE, not IMMUTABLE, so can't be used in index
-- Monthly queries will use the org_id + date range from idx_org_quotas_org_date

-- Index for cleanup of old records
CREATE INDEX IF NOT EXISTS idx_org_quotas_date
  ON org_quotas(usage_date);

-- =============================================
-- STEP 4: Enable RLS - service_role only
-- =============================================
ALTER TABLE org_quotas ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (for idempotency)
DROP POLICY IF EXISTS "Service role full access to org_quotas" ON org_quotas;

-- Service role can do everything (used by API/Pipeline services)
CREATE POLICY "Service role full access to org_quotas"
  ON org_quotas
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- No policies for authenticated users - quotas are managed server-side only
-- This prevents users from manipulating their own quota usage

-- =============================================
-- STEP 5: Helper function - get_or_create_quota
-- =============================================
-- Returns today's quota row, creates if not exists
-- Uses INSERT ... ON CONFLICT for atomicity

CREATE OR REPLACE FUNCTION get_or_create_quota(p_org_id UUID)
RETURNS org_quotas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota org_quotas;
  v_today DATE := CURRENT_DATE;
BEGIN
  -- Try to get existing record
  SELECT * INTO v_quota
  FROM org_quotas
  WHERE org_id = p_org_id
    AND usage_date = v_today;

  -- If not found, create new one
  IF NOT FOUND THEN
    -- Calculate current month's usage from previous days
    INSERT INTO org_quotas (org_id, usage_date, pipelines_run_month)
    SELECT
      p_org_id,
      v_today,
      COALESCE(SUM(pipelines_run_today), 0)
    FROM org_quotas
    WHERE org_id = p_org_id
      AND date_trunc('month', usage_date) = date_trunc('month', v_today)
      AND usage_date < v_today
    ON CONFLICT (org_id, usage_date)
    DO NOTHING
    RETURNING * INTO v_quota;

    -- Handle race condition - if conflict, select the existing row
    IF v_quota IS NULL THEN
      SELECT * INTO v_quota
      FROM org_quotas
      WHERE org_id = p_org_id
        AND usage_date = v_today;
    END IF;
  END IF;

  RETURN v_quota;
END;
$$;

COMMENT ON FUNCTION get_or_create_quota(UUID) IS 'Get or create today''s quota record for an organization. Thread-safe.';

-- =============================================
-- STEP 6: Helper function - increment_pipeline_count
-- =============================================
-- Atomically increment pipelines_run_today and concurrent_running
-- Returns the updated quota row

CREATE OR REPLACE FUNCTION increment_pipeline_count(p_org_id UUID)
RETURNS org_quotas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota org_quotas;
BEGIN
  -- Ensure today's record exists
  PERFORM get_or_create_quota(p_org_id);

  -- Atomic update with row lock
  UPDATE org_quotas
  SET
    pipelines_run_today = pipelines_run_today + 1,
    pipelines_run_month = pipelines_run_month + 1,
    concurrent_running = concurrent_running + 1,
    max_concurrent_reached = GREATEST(max_concurrent_reached, concurrent_running + 1),
    last_pipeline_at = NOW(),
    updated_at = NOW()
  WHERE org_id = p_org_id
    AND usage_date = CURRENT_DATE
  RETURNING * INTO v_quota;

  RETURN v_quota;
END;
$$;

COMMENT ON FUNCTION increment_pipeline_count(UUID) IS 'Atomically increment pipeline counters when starting a pipeline. Updates daily, monthly, and concurrent counts.';

-- =============================================
-- STEP 7: Helper function - decrement_concurrent
-- =============================================
-- Atomically decrement concurrent_running (called when pipeline completes)
-- Also updates success/failure counts

CREATE OR REPLACE FUNCTION decrement_concurrent(
  p_org_id UUID,
  p_succeeded BOOLEAN DEFAULT true
)
RETURNS org_quotas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota org_quotas;
BEGIN
  -- Atomic update - ensure concurrent doesn't go negative
  UPDATE org_quotas
  SET
    concurrent_running = GREATEST(concurrent_running - 1, 0),
    pipelines_succeeded_today = CASE WHEN p_succeeded THEN pipelines_succeeded_today + 1 ELSE pipelines_succeeded_today END,
    pipelines_failed_today = CASE WHEN NOT p_succeeded THEN pipelines_failed_today + 1 ELSE pipelines_failed_today END,
    updated_at = NOW()
  WHERE org_id = p_org_id
    AND usage_date = CURRENT_DATE
  RETURNING * INTO v_quota;

  -- If no row for today (edge case: pipeline spans midnight),
  -- just return null - the counters will be correct for the new day
  RETURN v_quota;
END;
$$;

COMMENT ON FUNCTION decrement_concurrent(UUID, BOOLEAN) IS 'Atomically decrement concurrent count when pipeline completes. Updates success/failure stats.';

-- =============================================
-- STEP 8: Helper function - check_quota_available
-- =============================================
-- Returns true if organization can run another pipeline
-- Checks daily, monthly, and concurrent limits

CREATE OR REPLACE FUNCTION check_quota_available(p_org_id UUID)
RETURNS TABLE (
  can_run BOOLEAN,
  reason TEXT,
  daily_used INTEGER,
  daily_limit INTEGER,
  monthly_used INTEGER,
  monthly_limit INTEGER,
  concurrent_used INTEGER,
  concurrent_limit INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org organizations;
  v_quota org_quotas;
BEGIN
  -- Get organization limits
  SELECT * INTO v_org
  FROM organizations
  WHERE id = p_org_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false::BOOLEAN,
      'Organization not found'::TEXT,
      0, 0, 0, 0, 0, 0;
    RETURN;
  END IF;

  -- Get or create today's quota
  v_quota := get_or_create_quota(p_org_id);

  -- Check concurrent limit first (most common blocker)
  IF v_quota.concurrent_running >= COALESCE(v_org.concurrent_pipelines_limit, 1) THEN
    RETURN QUERY SELECT
      false::BOOLEAN,
      'Concurrent pipeline limit reached'::TEXT,
      v_quota.pipelines_run_today,
      COALESCE(v_org.pipelines_per_day_limit, 6),
      v_quota.pipelines_run_month,
      COALESCE(v_org.pipelines_per_month_limit, 180),
      v_quota.concurrent_running,
      COALESCE(v_org.concurrent_pipelines_limit, 1);
    RETURN;
  END IF;

  -- Check daily limit
  IF v_quota.pipelines_run_today >= COALESCE(v_org.pipelines_per_day_limit, 6) THEN
    RETURN QUERY SELECT
      false::BOOLEAN,
      'Daily pipeline limit reached'::TEXT,
      v_quota.pipelines_run_today,
      COALESCE(v_org.pipelines_per_day_limit, 6),
      v_quota.pipelines_run_month,
      COALESCE(v_org.pipelines_per_month_limit, 180),
      v_quota.concurrent_running,
      COALESCE(v_org.concurrent_pipelines_limit, 1);
    RETURN;
  END IF;

  -- Check monthly limit
  IF v_quota.pipelines_run_month >= COALESCE(v_org.pipelines_per_month_limit, 180) THEN
    RETURN QUERY SELECT
      false::BOOLEAN,
      'Monthly pipeline limit reached'::TEXT,
      v_quota.pipelines_run_today,
      COALESCE(v_org.pipelines_per_day_limit, 6),
      v_quota.pipelines_run_month,
      COALESCE(v_org.pipelines_per_month_limit, 180),
      v_quota.concurrent_running,
      COALESCE(v_org.concurrent_pipelines_limit, 1);
    RETURN;
  END IF;

  -- All checks passed
  RETURN QUERY SELECT
    true::BOOLEAN,
    NULL::TEXT,
    v_quota.pipelines_run_today,
    COALESCE(v_org.pipelines_per_day_limit, 6),
    v_quota.pipelines_run_month,
    COALESCE(v_org.pipelines_per_month_limit, 180),
    v_quota.concurrent_running,
    COALESCE(v_org.concurrent_pipelines_limit, 1);
END;
$$;

COMMENT ON FUNCTION check_quota_available(UUID) IS 'Check if organization can run another pipeline. Returns availability status and current usage vs limits.';

-- =============================================
-- STEP 9: Helper function - reset_monthly_quotas
-- =============================================
-- Reset monthly counters at start of new month
-- Called by scheduled job or on first access of new month

CREATE OR REPLACE FUNCTION reset_monthly_quotas()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- This is handled automatically by get_or_create_quota
  -- which calculates month totals from current month's daily records
  -- This function is kept for manual resets if needed

  -- Return count of organizations with quota records this month
  SELECT COUNT(DISTINCT org_id) INTO v_count
  FROM org_quotas
  WHERE date_trunc('month', usage_date) = date_trunc('month', CURRENT_DATE);

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION reset_monthly_quotas() IS 'Utility function for monthly quota management. Monthly totals are calculated automatically from daily records.';

-- =============================================
-- STEP 10: Cleanup function for old quota records
-- =============================================
-- Keep 90 days of history, delete older records

CREATE OR REPLACE FUNCTION cleanup_old_quota_records(p_days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM org_quotas
  WHERE usage_date < (CURRENT_DATE - p_days_to_keep);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION cleanup_old_quota_records(INTEGER) IS 'Delete quota records older than specified days (default 90). Run periodically for maintenance.';

-- =============================================
-- STEP 11: Grant permissions
-- =============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON org_quotas TO service_role;
GRANT EXECUTE ON FUNCTION get_or_create_quota(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION increment_pipeline_count(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION decrement_concurrent(UUID, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION check_quota_available(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION reset_monthly_quotas() TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_quota_records(INTEGER) TO service_role;

-- =============================================
-- VERIFICATION
-- =============================================
DO $$
DECLARE
  v_table_exists BOOLEAN;
  v_column_count INTEGER;
  v_function_count INTEGER;
BEGIN
  -- Check table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'org_quotas'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'FAILED: org_quotas table not created';
  END IF;

  -- Check organizations columns (using correct column names)
  SELECT COUNT(*) INTO v_column_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'organizations'
    AND column_name IN ('pipelines_per_day_limit', 'pipelines_per_month_limit', 'concurrent_pipelines_limit', 'seat_limit', 'providers_limit');

  IF v_column_count < 5 THEN
    RAISE WARNING 'Migration 42: Expected 5 limit columns on organizations, found %', v_column_count;
  END IF;

  -- Check functions exist
  SELECT COUNT(*) INTO v_function_count
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name IN (
      'get_or_create_quota',
      'increment_pipeline_count',
      'decrement_concurrent',
      'check_quota_available'
    );

  IF v_function_count < 4 THEN
    RAISE WARNING 'Migration 42: Expected 4 helper functions, found %', v_function_count;
  ELSE
    RAISE NOTICE 'SUCCESS: Migration 42 - Quota consolidation complete';
    RAISE NOTICE '  - org_quotas table created';
    RAISE NOTICE '  - 5 limit columns added to organizations';
    RAISE NOTICE '  - 4 helper functions created';
  END IF;
END $$;

-- Migration tracking is handled by the migration job
-- (removed self-registration to avoid schema mismatch)
