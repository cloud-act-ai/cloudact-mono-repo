-- ================================================================================
-- PROCEDURE: sp_run_saas_subscription_costs_pipeline
-- LOCATION: {project_id}.organizations (central dataset - created once)
-- OPERATES ON: {project_id}.{p_dataset_id} (per-customer dataset)
--
-- PURPOSE: Orchestrates the SaaS subscription cost calculation pipeline.
--          Stage 1: Calculate daily amortized costs
--          Stage 2: Convert to FOCUS 1.2 standard format
--
-- INPUTS:
--   p_project_id: GCP Project ID (dynamic)
--   p_dataset_id: Customer dataset ID (e.g., 'acme_corp_prod')
--   p_start_date: Start of processing window (inclusive)
--   p_end_date:   End of processing window (inclusive)
--
-- USAGE:
--   -- Run for a specific customer
--   CALL `gac-prod-471220.organizations`.sp_run_saas_subscription_costs_pipeline(
--     'gac-prod-471220',
--     'acme_corp_prod',
--     DATE('2024-01-01'),
--     DATE('2024-01-31')
--   );
--
-- FLOW:
--   1. Onboarding creates tables in customer dataset ({org_slug}_prod)
--   2. This procedure is created ONCE in organizations dataset
--   3. Pipeline endpoint calls this procedure for each customer
--   4. Scheduler runs daily for all active customers
-- ================================================================================

CREATE OR REPLACE PROCEDURE `{project_id}.organizations`.sp_run_saas_subscription_costs_pipeline(
  p_project_id STRING,
  p_dataset_id STRING,
  p_start_date DATE,
  p_end_date DATE
)
BEGIN
  DECLARE v_sql STRING;

  -- 1. Parameter Validation
  ASSERT p_project_id IS NOT NULL AS "p_project_id cannot be NULL";
  ASSERT p_dataset_id IS NOT NULL AS "p_dataset_id cannot be NULL";
  ASSERT p_start_date IS NOT NULL AS "p_start_date cannot be NULL";
  ASSERT p_end_date IS NOT NULL AS "p_end_date cannot be NULL";
  ASSERT p_end_date >= p_start_date AS "p_end_date must be >= p_start_date";

  -- 2. Stage 1: Calculate Daily Costs
  SET v_sql = FORMAT("""
    CALL `%s.organizations`.sp_calculate_saas_subscription_plan_costs_daily(@p_project, @p_dataset, @p_start, @p_end)
  """, p_project_id);
  EXECUTE IMMEDIATE v_sql
  USING p_project_id AS p_project, p_dataset_id AS p_dataset, p_start_date AS p_start, p_end_date AS p_end;

  -- 3. Stage 2: Convert to FOCUS 1.2 Standard
  SET v_sql = FORMAT("""
    CALL `%s.organizations`.sp_convert_saas_costs_to_focus_1_2(@p_project, @p_dataset, @p_start, @p_end)
  """, p_project_id);
  EXECUTE IMMEDIATE v_sql
  USING p_project_id AS p_project, p_dataset_id AS p_dataset, p_start_date AS p_start, p_end_date AS p_end;

  -- 4. Completion
  SELECT 'SaaS Subscription Costs Pipeline Completed' AS status,
         p_project_id AS project_id,
         p_dataset_id AS dataset_id,
         p_start_date AS start_date,
         p_end_date AS end_date;

EXCEPTION WHEN ERROR THEN
  SELECT @@error.message AS error_message;
  RAISE USING MESSAGE = CONCAT('Pipeline Failed: ', @@error.message);
END;
