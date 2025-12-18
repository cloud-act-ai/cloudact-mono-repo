-- Migration 21: Add weekly and monthly pipeline limits
-- Purpose: Store pipeline execution limits per week and month (from Stripe)
-- Pattern: Dynamic limits populated by Stripe webhook

-- ============================================
-- ADD PIPELINE LIMIT COLUMNS
-- ============================================
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS pipelines_per_week_limit INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pipelines_per_month_limit INTEGER DEFAULT 0;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON COLUMN organizations.pipelines_per_week_limit IS 'Maximum pipeline runs per week (from Stripe product metadata: pipelinesPerWeek)';
COMMENT ON COLUMN organizations.pipelines_per_month_limit IS 'Maximum pipeline runs per month (from Stripe product metadata: pipelinesPerMonth)';

-- ============================================
-- MIGRATION VERIFICATION
-- ============================================
DO $$
DECLARE
    col_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO col_count
    FROM information_schema.columns
    WHERE table_name = 'organizations'
      AND column_name IN ('pipelines_per_week_limit', 'pipelines_per_month_limit');

    IF col_count = 2 THEN
        RAISE NOTICE 'Migration 21: Pipeline limit columns added successfully';
    ELSE
        RAISE WARNING 'Migration 21: Expected 2 columns, found %', col_count;
    END IF;
END $$;
