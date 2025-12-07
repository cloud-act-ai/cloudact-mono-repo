-- Procedure: sp_run_subscription_costs_pipeline
-- Runs Stage 1 (daily cost calc) then Stage 2 (standardized table load).
CREATE OR REPLACE PROCEDURE `gac-prod-471220.procedure_testsing`.sp_run_subscription_costs_pipeline(
  p_start_date DATE,
  p_end_date DATE,
  p_org_slug STRING
)
BEGIN
  --------------------------------------------------------------------------------
  -- PROCEDURE: sp_run_subscription_costs_pipeline
  -- PURPOSE: Orchestrates the calculation of daily amortized costs and 
  --          conversion to FOCUS 1.2 standard.
  --          DYNAMIC VERSION.
  -- 
  -- INPUTS:
  --   p_start_date: Start of current processing window (inclusive)
  --   p_end_date:   End of current processing window (inclusive)
  --   p_org_slug:   (Optional) Run for specific org only. If NULL, runs for all.
  --------------------------------------------------------------------------------
  
  -- === DYNAMIC CONFIGURATION ===
  DECLARE v_project_id STRING DEFAULT 'gac-prod-471220';
  DECLARE v_dataset_id STRING DEFAULT 'procedure_testsing';
  DECLARE v_sql STRING;

  -- 1. Parameter Validation
  ASSERT p_start_date IS NOT NULL AS "p_start_date cannot be NULL";
  ASSERT p_end_date IS NOT NULL AS "p_end_date cannot be NULL";
  ASSERT p_end_date >= p_start_date AS "p_end_date must be >= p_start_date";

  -- 2. Stage 1: Calculate Daily Costs (Dynamic Call)
  SET v_sql = FORMAT("""
    CALL `%s.%s.sp_calculate_subscription_plan_costs_daily`(@p_start, @p_end, @p_org_slug)
  """, v_project_id, v_dataset_id);
  EXECUTE IMMEDIATE v_sql USING p_start_date AS p_start, p_end_date AS p_end, p_org_slug AS p_org_slug;

  -- 3. Stage 2: Convert to Standard Schema (Dynamic Call)
  SET v_sql = FORMAT("""
    CALL `%s.%s.sp_convert_subscription_costs_daily_to_standard_1_2`(@p_start, @p_end, @p_org_slug)
  """, v_project_id, v_dataset_id);
  EXECUTE IMMEDIATE v_sql USING p_start_date AS p_start, p_end_date AS p_end, p_org_slug AS p_org_slug;

  -- 4. Completion
  SELECT 'Pipeline Completed Successfully (Dynamic)' AS status;
EXCEPTION WHEN ERROR THEN
  SELECT @@error.message;
  RAISE USING MESSAGE = @@error.message;
END;
