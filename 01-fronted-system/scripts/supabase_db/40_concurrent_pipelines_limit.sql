-- Migration: 40_concurrent_pipelines_limit.sql
-- Purpose: Add concurrent_pipelines_limit column to organizations table
-- BILLING-AUDIT-001: Ensure Supabase stores concurrent pipeline limit from Stripe metadata

-- =============================================
-- STEP 1: Add column
-- =============================================
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS concurrent_pipelines_limit INTEGER NOT NULL DEFAULT 2;

-- =============================================
-- STEP 2: Add index for quota enforcement queries
-- =============================================
-- Not needed - concurrent_pipelines_limit is not used as a filter condition

-- =============================================
-- STEP 3: Add comment
-- =============================================
COMMENT ON COLUMN organizations.concurrent_pipelines_limit IS 'Maximum concurrent pipeline executions (from Stripe product metadata: concurrentPipelines). Default: 2';

-- =============================================
-- VERIFICATION
-- =============================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'concurrent_pipelines_limit'
  ) THEN
    RAISE NOTICE 'SUCCESS: concurrent_pipelines_limit column added to organizations table';
  ELSE
    RAISE EXCEPTION 'FAILED: concurrent_pipelines_limit column not found';
  END IF;
END $$;
