-- ============================================================================
-- Schema Migration: Add 10-Level Hierarchy Fields to All Cost Tables
-- ============================================================================
-- Purpose: Fix BUG #21-#29 (HIGH severity) - Missing 10-level hierarchy fields
-- Tables affected: 9 tables (genai_*, subscription_*)
-- Fields added: 20 per table (x_hierarchy_level_1_id through x_hierarchy_level_10_id/name)
--
-- INSTRUCTIONS:
-- 1. Set your org_slug below
-- 2. Set your GCP project ID
-- 3. Run for each organization that needs migration
-- 4. This is SAFE to run multiple times (uses IF NOT EXISTS)
-- ============================================================================

-- CONFIGURATION (UPDATE THESE)
DECLARE org_slug STRING DEFAULT 'acme_inc_01062026';  -- Replace with your org slug
DECLARE project_id STRING DEFAULT 'cloudact-testing-1';  -- Replace with your project ID
DECLARE dataset_name STRING DEFAULT CONCAT(org_slug, '_prod');

-- ============================================================================
-- TABLE 1: genai_payg_costs_daily
-- ============================================================================
BEGIN
  EXECUTE IMMEDIATE FORMAT("""
    ALTER TABLE `%s.%s.genai_payg_costs_daily`
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_id STRING OPTIONS(description='Level 1 entity ID (e.g., DEPT-CFO)'),
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_name STRING OPTIONS(description='Level 1 entity name (e.g., Finance)'),
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_id STRING OPTIONS(description='Level 2 entity ID (e.g., PROJ-BU1)'),
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_name STRING OPTIONS(description='Level 2 entity name (e.g., Business Unit 1)'),
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_id STRING OPTIONS(description='Level 3 entity ID (e.g., TEAM-PLAT)'),
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_name STRING OPTIONS(description='Level 3 entity name (e.g., Platform Team)'),
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_name STRING
  """, project_id, dataset_name);
  SELECT 'genai_payg_costs_daily: Migration complete' AS status;
EXCEPTION WHEN ERROR THEN
  SELECT FORMAT('genai_payg_costs_daily: ERROR - %s', @@error.message) AS status;
END;

-- ============================================================================
-- TABLE 2: genai_commitment_costs_daily
-- ============================================================================
BEGIN
  EXECUTE IMMEDIATE FORMAT("""
    ALTER TABLE `%s.%s.genai_commitment_costs_daily`
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_name STRING
  """, project_id, dataset_name);
  SELECT 'genai_commitment_costs_daily: Migration complete' AS status;
EXCEPTION WHEN ERROR THEN
  SELECT FORMAT('genai_commitment_costs_daily: ERROR - %s', @@error.message) AS status;
END;

-- ============================================================================
-- TABLE 3: genai_infrastructure_costs_daily
-- ============================================================================
BEGIN
  EXECUTE IMMEDIATE FORMAT("""
    ALTER TABLE `%s.%s.genai_infrastructure_costs_daily`
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_name STRING
  """, project_id, dataset_name);
  SELECT 'genai_infrastructure_costs_daily: Migration complete' AS status;
EXCEPTION WHEN ERROR THEN
  SELECT FORMAT('genai_infrastructure_costs_daily: ERROR - %s', @@error.message) AS status;
END;

-- ============================================================================
-- TABLE 4: genai_costs_daily_unified
-- ============================================================================
BEGIN
  EXECUTE IMMEDIATE FORMAT("""
    ALTER TABLE `%s.%s.genai_costs_daily_unified`
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_name STRING
  """, project_id, dataset_name);
  SELECT 'genai_costs_daily_unified: Migration complete' AS status;
EXCEPTION WHEN ERROR THEN
  SELECT FORMAT('genai_costs_daily_unified: ERROR - %s', @@error.message) AS status;
END;

-- ============================================================================
-- TABLE 5: subscription_plan_costs_daily
-- ============================================================================
BEGIN
  EXECUTE IMMEDIATE FORMAT("""
    ALTER TABLE `%s.%s.subscription_plan_costs_daily`
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_name STRING
  """, project_id, dataset_name);
  SELECT 'subscription_plan_costs_daily: Migration complete' AS status;
EXCEPTION WHEN ERROR THEN
  SELECT FORMAT('subscription_plan_costs_daily: ERROR - %s', @@error.message) AS status;
END;

-- ============================================================================
-- TABLE 6: genai_payg_usage_raw
-- ============================================================================
BEGIN
  EXECUTE IMMEDIATE FORMAT("""
    ALTER TABLE `%s.%s.genai_payg_usage_raw`
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_name STRING
  """, project_id, dataset_name);
  SELECT 'genai_payg_usage_raw: Migration complete' AS status;
EXCEPTION WHEN ERROR THEN
  SELECT FORMAT('genai_payg_usage_raw: ERROR - %s', @@error.message) AS status;
END;

-- ============================================================================
-- TABLE 7: genai_commitment_usage_raw
-- ============================================================================
BEGIN
  EXECUTE IMMEDIATE FORMAT("""
    ALTER TABLE `%s.%s.genai_commitment_usage_raw`
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_name STRING
  """, project_id, dataset_name);
  SELECT 'genai_commitment_usage_raw: Migration complete' AS status;
EXCEPTION WHEN ERROR THEN
  SELECT FORMAT('genai_commitment_usage_raw: ERROR - %s', @@error.message) AS status;
END;

-- ============================================================================
-- TABLE 8: genai_infrastructure_usage_raw
-- ============================================================================
BEGIN
  EXECUTE IMMEDIATE FORMAT("""
    ALTER TABLE `%s.%s.genai_infrastructure_usage_raw`
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_name STRING
  """, project_id, dataset_name);
  SELECT 'genai_infrastructure_usage_raw: Migration complete' AS status;
EXCEPTION WHEN ERROR THEN
  SELECT FORMAT('genai_infrastructure_usage_raw: ERROR - %s', @@error.message) AS status;
END;

-- ============================================================================
-- TABLE 9: subscription_plans
-- ============================================================================
BEGIN
  EXECUTE IMMEDIATE FORMAT("""
    ALTER TABLE `%s.%s.subscription_plans`
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_name STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_id STRING,
    ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_name STRING
  """, project_id, dataset_name);
  SELECT 'subscription_plans: Migration complete' AS status;
EXCEPTION WHEN ERROR THEN
  SELECT FORMAT('subscription_plans: ERROR - %s', @@error.message) AS status;
END;

-- ============================================================================
-- SUMMARY
-- ============================================================================
SELECT '✅ Migration complete for all 9 tables!' AS summary;
SELECT 'Next steps:' AS next_steps;
SELECT '1. Update JSON schema files in 02-api-service/configs/setup/organizations/onboarding/schemas/' AS step_1;
SELECT '2. Run fix_deprecated_hierarchy_code.py to update processor code' AS step_2;
SELECT '3. Test cost queries to verify hierarchy fields work' AS step_3;
