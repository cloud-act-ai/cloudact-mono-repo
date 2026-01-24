-- ================================================================================
-- MIGRATION: Fix Subscription Schema Drift
-- Purpose: Synchronize org_slug and x_org_slug columns across subscription tables
--
-- ISSUE: Tables have both org_slug (position 1) AND x_org_slug (last position)
--        but schema files define only x_org_slug
--        Data was populated in org_slug but x_org_slug was NULL
--
-- This migration:
-- 1. Updates x_org_slug to match org_slug where NULL
-- 2. Does NOT drop org_slug column (would require table recreation in BigQuery)
--
-- IMPORTANT: BigQuery doesn't support DROP COLUMN, so we keep both columns
--            and ensure they are synchronized. The procedure handles this with COALESCE.
--
-- USAGE:
--   Replace {project_id} and {dataset_id} before running
--   Run for each org dataset that needs fixing
-- ================================================================================

-- Step 1: Sync x_org_slug in subscription_plans
UPDATE `{project_id}.{dataset_id}.subscription_plans`
SET x_org_slug = org_slug
WHERE x_org_slug IS NULL AND org_slug IS NOT NULL;

-- Step 2: Sync x_org_slug in subscription_plan_costs_daily
UPDATE `{project_id}.{dataset_id}.subscription_plan_costs_daily`
SET x_org_slug = org_slug
WHERE x_org_slug IS NULL AND org_slug IS NOT NULL;

-- Step 3: Sync org_slug in subscription_plan_costs_daily (reverse sync)
UPDATE `{project_id}.{dataset_id}.subscription_plan_costs_daily`
SET org_slug = x_org_slug
WHERE org_slug IS NULL AND x_org_slug IS NOT NULL;

-- Verification query (run after migration)
-- SELECT
--   'subscription_plans' as table_name,
--   COUNT(*) as total,
--   COUNTIF(org_slug IS NULL) as null_org_slug,
--   COUNTIF(x_org_slug IS NULL) as null_x_org_slug,
--   COUNTIF(org_slug != x_org_slug) as mismatched
-- FROM `{project_id}.{dataset_id}.subscription_plans`
-- UNION ALL
-- SELECT
--   'subscription_plan_costs_daily' as table_name,
--   COUNT(*) as total,
--   COUNTIF(org_slug IS NULL) as null_org_slug,
--   COUNTIF(x_org_slug IS NULL) as null_x_org_slug,
--   COUNTIF(org_slug != x_org_slug) as mismatched
-- FROM `{project_id}.{dataset_id}.subscription_plan_costs_daily`;
