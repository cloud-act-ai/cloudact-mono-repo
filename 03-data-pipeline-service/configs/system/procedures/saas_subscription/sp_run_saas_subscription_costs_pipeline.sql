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
--   p_start_date: Start of processing window (inclusive, defaults to earliest effective_date or month start)
--   p_end_date:   End of processing window (inclusive, defaults to today)
--
-- USAGE:
--   -- Run for a specific customer
--   CALL `your-project-id.organizations`.sp_run_saas_subscription_costs_pipeline(
--     'your-project-id',
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
  -- Declare local variables for defaulting dates
  DECLARE v_start_date DATE;
  DECLARE v_end_date DATE;
  DECLARE v_effective_start_date DATE;

  -- 1. Parameter Validation (required params)
  ASSERT p_project_id IS NOT NULL AS "p_project_id cannot be NULL";
  ASSERT p_dataset_id IS NOT NULL AS "p_dataset_id cannot be NULL";

  -- 2. Get earliest effective_date from active subscription plans
  -- This allows us to calculate costs from when subscriptions actually started
  EXECUTE IMMEDIATE FORMAT("""
    SELECT MIN(effective_date)
    FROM `%s.%s.saas_subscription_plans`
    WHERE status = 'active'
      AND effective_date IS NOT NULL
  """, p_project_id, p_dataset_id)
  INTO v_effective_start_date;

  -- 3. Default dates if not provided
  -- Priority: provided start_date > earliest effective_date > first of current month
  SET v_start_date = COALESCE(
    p_start_date,
    v_effective_start_date,
    DATE_TRUNC(CURRENT_DATE(), MONTH)
  );
  SET v_end_date = COALESCE(p_end_date, CURRENT_DATE());

  -- Validate date range
  ASSERT v_end_date >= v_start_date AS "p_end_date must be >= p_start_date";

  -- 2. Stage 1: Calculate Daily Costs
  -- Note: Using direct CALL - procedures must be in same project as orchestrator
  CALL `{project_id}.organizations`.sp_calculate_saas_subscription_plan_costs_daily(
    p_project_id, p_dataset_id, v_start_date, v_end_date
  );

  -- 3. Stage 2: Convert to FOCUS 1.2 Standard
  CALL `{project_id}.organizations`.sp_convert_saas_costs_to_focus_1_2(
    p_project_id, p_dataset_id, v_start_date, v_end_date
  );

  -- 4. Completion
  SELECT 'SaaS Subscription Costs Pipeline Completed' AS status,
         p_project_id AS project_id,
         p_dataset_id AS dataset_id,
         v_start_date AS start_date,
         v_end_date AS end_date;

EXCEPTION WHEN ERROR THEN
  SELECT @@error.message AS error_message;
  RAISE USING MESSAGE = CONCAT('Pipeline Failed: ', @@error.message);
END;
