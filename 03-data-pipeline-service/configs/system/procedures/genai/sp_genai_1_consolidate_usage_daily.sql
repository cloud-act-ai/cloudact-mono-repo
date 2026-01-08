-- ================================================================================
-- PROCEDURE: sp_genai_1_consolidate_usage_daily
-- LOCATION: {project_id}.organizations (central dataset)
-- OPERATES ON: {project_id}.{p_dataset_id} (per-customer dataset)
--
-- PURPOSE: Consolidates usage from all 3 GenAI flows (PAYG, Commitment, Infrastructure)
--          into a unified usage table for reporting and FOCUS conversion.
--
-- INPUTS:
--   p_project_id: GCP Project ID
--   p_dataset_id: Customer dataset (e.g., 'acme_corp_prod')
--   p_usage_date: Date to consolidate usage for
--
-- OUTPUT: Consolidated records in genai_usage_daily_unified table
-- ================================================================================

CREATE OR REPLACE PROCEDURE `{project_id}.organizations`.sp_genai_1_consolidate_usage_daily(
  p_project_id STRING,
  p_dataset_id STRING,
  p_usage_date DATE,
  p_credential_id STRING,  -- MT-001 FIX: Add credential_id for multi-account isolation (pass NULL if not filtering)
  p_pipeline_id STRING,    -- STATE-001 FIX: Add lineage params (pass NULL for default 'genai_consolidate_usage')
  p_run_id STRING          -- Pass NULL for auto-generated UUID
)
OPTIONS(strict_mode=TRUE)
BEGIN
  DECLARE v_rows_deleted INT64 DEFAULT 0;
  DECLARE v_rows_inserted INT64 DEFAULT 0;
  -- Handle NULL defaults inside procedure body for BigQuery compatibility
  DECLARE v_pipeline_id STRING DEFAULT COALESCE(p_pipeline_id, 'genai_consolidate_usage');
  DECLARE v_run_id STRING DEFAULT COALESCE(p_run_id, GENERATE_UUID());

  -- Validation
  ASSERT p_project_id IS NOT NULL AS "p_project_id cannot be NULL";
  ASSERT p_dataset_id IS NOT NULL AS "p_dataset_id cannot be NULL";
  ASSERT p_usage_date IS NOT NULL AS "p_usage_date cannot be NULL";

  BEGIN TRANSACTION;

    -- Step 1: Delete existing records for this date AND credential (idempotent)
    -- MT-001 FIX: Add credential_id filter to prevent deleting other credentials' data
    IF p_credential_id IS NOT NULL THEN
      EXECUTE IMMEDIATE FORMAT("""
        DELETE FROM `%s.%s.genai_usage_daily_unified`
        WHERE usage_date = @p_date
          AND x_credential_id = @p_credential_id
      """, p_project_id, p_dataset_id)
      USING p_usage_date AS p_date, p_credential_id AS p_credential_id;
    ELSE
      -- Backward compatible: if no credential_id provided, delete all for date
      EXECUTE IMMEDIATE FORMAT("""
        DELETE FROM `%s.%s.genai_usage_daily_unified`
        WHERE usage_date = @p_date
      """, p_project_id, p_dataset_id)
      USING p_usage_date AS p_date;
    END IF;

    SET v_rows_deleted = @@row_count;

    -- Step 2: Insert PAYG usage (token-based) with lineage columns (STATE-001 FIX)
    -- HIERARCHY-001 FIX: Use 20 hierarchy fields (10 levels x 2 fields each)
    EXECUTE IMMEDIATE FORMAT("""
      INSERT INTO `%s.%s.genai_usage_daily_unified`
      (usage_date, org_slug, cost_type, provider, model, instance_type, gpu_type,
       region, input_tokens, output_tokens, cached_tokens, total_tokens,
       ptu_units, used_units, utilization_pct, gpu_hours, instance_hours,
       request_count,
       hierarchy_level_1_id, hierarchy_level_1_name,
       hierarchy_level_2_id, hierarchy_level_2_name,
       hierarchy_level_3_id, hierarchy_level_3_name,
       hierarchy_level_4_id, hierarchy_level_4_name,
       hierarchy_level_5_id, hierarchy_level_5_name,
       hierarchy_level_6_id, hierarchy_level_6_name,
       hierarchy_level_7_id, hierarchy_level_7_name,
       hierarchy_level_8_id, hierarchy_level_8_name,
       hierarchy_level_9_id, hierarchy_level_9_name,
       hierarchy_level_10_id, hierarchy_level_10_name,
       source_table, consolidated_at,
       x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
      SELECT
        usage_date,
        org_slug,
        'payg' as cost_type,
        provider,
        model,
        NULL as instance_type,
        NULL as gpu_type,
        region,
        input_tokens,
        output_tokens,
        cached_input_tokens as cached_tokens,
        total_tokens,
        NULL as ptu_units,
        NULL as used_units,
        NULL as utilization_pct,
        NULL as gpu_hours,
        NULL as instance_hours,
        request_count,
        hierarchy_level_1_id, hierarchy_level_1_name,
        hierarchy_level_2_id, hierarchy_level_2_name,
        hierarchy_level_3_id, hierarchy_level_3_name,
        hierarchy_level_4_id, hierarchy_level_4_name,
        hierarchy_level_5_id, hierarchy_level_5_name,
        hierarchy_level_6_id, hierarchy_level_6_name,
        hierarchy_level_7_id, hierarchy_level_7_name,
        hierarchy_level_8_id, hierarchy_level_8_name,
        hierarchy_level_9_id, hierarchy_level_9_name,
        hierarchy_level_10_id, hierarchy_level_10_name,
        'genai_payg_usage_raw' as source_table,
        CURRENT_TIMESTAMP() as consolidated_at,
        -- STATE-001 FIX: Use procedure's own pipeline_id for consolidation lineage
        @p_pipeline_id as x_pipeline_id,
        COALESCE(x_credential_id, @p_credential_id) as x_credential_id,
        @p_date as x_pipeline_run_date,
        @p_run_id as x_run_id,
        CURRENT_TIMESTAMP() as x_ingested_at
      FROM `%s.%s.genai_payg_usage_raw`
      WHERE usage_date = @p_date
        AND (@p_credential_id IS NULL OR x_credential_id = @p_credential_id)
    """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
    USING p_usage_date AS p_date, p_credential_id AS p_credential_id,
          v_pipeline_id AS p_pipeline_id, v_run_id AS p_run_id;

    -- Step 3: Insert Commitment usage (PTU/GSU) with lineage columns (STATE-001 FIX)
    -- HIERARCHY-001 FIX: Use 20 hierarchy fields (10 levels x 2 fields each)
    EXECUTE IMMEDIATE FORMAT("""
      INSERT INTO `%s.%s.genai_usage_daily_unified`
      (usage_date, org_slug, cost_type, provider, model, instance_type, gpu_type,
       region, input_tokens, output_tokens, cached_tokens, total_tokens,
       ptu_units, used_units, utilization_pct, gpu_hours, instance_hours,
       request_count,
       hierarchy_level_1_id, hierarchy_level_1_name,
       hierarchy_level_2_id, hierarchy_level_2_name,
       hierarchy_level_3_id, hierarchy_level_3_name,
       hierarchy_level_4_id, hierarchy_level_4_name,
       hierarchy_level_5_id, hierarchy_level_5_name,
       hierarchy_level_6_id, hierarchy_level_6_name,
       hierarchy_level_7_id, hierarchy_level_7_name,
       hierarchy_level_8_id, hierarchy_level_8_name,
       hierarchy_level_9_id, hierarchy_level_9_name,
       hierarchy_level_10_id, hierarchy_level_10_name,
       source_table, consolidated_at,
       x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
      SELECT
        usage_date,
        org_slug,
        'commitment' as cost_type,
        provider,
        model,
        NULL as instance_type,
        NULL as gpu_type,
        region,
        NULL as input_tokens,
        NULL as output_tokens,
        NULL as cached_tokens,
        NULL as total_tokens,
        provisioned_units as ptu_units,
        used_units,
        utilization_pct,
        NULL as gpu_hours,
        NULL as instance_hours,
        request_count,
        hierarchy_level_1_id, hierarchy_level_1_name,
        hierarchy_level_2_id, hierarchy_level_2_name,
        hierarchy_level_3_id, hierarchy_level_3_name,
        hierarchy_level_4_id, hierarchy_level_4_name,
        hierarchy_level_5_id, hierarchy_level_5_name,
        hierarchy_level_6_id, hierarchy_level_6_name,
        hierarchy_level_7_id, hierarchy_level_7_name,
        hierarchy_level_8_id, hierarchy_level_8_name,
        hierarchy_level_9_id, hierarchy_level_9_name,
        hierarchy_level_10_id, hierarchy_level_10_name,
        'genai_commitment_usage_raw' as source_table,
        CURRENT_TIMESTAMP() as consolidated_at,
        -- STATE-001 FIX: Use procedure's own pipeline_id for consolidation lineage
        @p_pipeline_id as x_pipeline_id,
        COALESCE(x_credential_id, @p_credential_id) as x_credential_id,
        @p_date as x_pipeline_run_date,
        @p_run_id as x_run_id,
        CURRENT_TIMESTAMP() as x_ingested_at
      FROM `%s.%s.genai_commitment_usage_raw`
      WHERE usage_date = @p_date
        AND (@p_credential_id IS NULL OR x_credential_id = @p_credential_id)
    """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
    USING p_usage_date AS p_date, p_credential_id AS p_credential_id,
          v_pipeline_id AS p_pipeline_id, v_run_id AS p_run_id;

    -- Step 4: Insert Infrastructure usage (GPU/TPU) with lineage columns (STATE-001 FIX)
    -- HIERARCHY-001 FIX: Use 20 hierarchy fields (10 levels x 2 fields each)
    EXECUTE IMMEDIATE FORMAT("""
      INSERT INTO `%s.%s.genai_usage_daily_unified`
      (usage_date, org_slug, cost_type, provider, model, instance_type, gpu_type,
       region, input_tokens, output_tokens, cached_tokens, total_tokens,
       ptu_units, used_units, utilization_pct, gpu_hours, instance_hours,
       request_count,
       hierarchy_level_1_id, hierarchy_level_1_name,
       hierarchy_level_2_id, hierarchy_level_2_name,
       hierarchy_level_3_id, hierarchy_level_3_name,
       hierarchy_level_4_id, hierarchy_level_4_name,
       hierarchy_level_5_id, hierarchy_level_5_name,
       hierarchy_level_6_id, hierarchy_level_6_name,
       hierarchy_level_7_id, hierarchy_level_7_name,
       hierarchy_level_8_id, hierarchy_level_8_name,
       hierarchy_level_9_id, hierarchy_level_9_name,
       hierarchy_level_10_id, hierarchy_level_10_name,
       source_table, consolidated_at,
       x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
      SELECT
        usage_date,
        org_slug,
        'infrastructure' as cost_type,
        provider,
        NULL as model,
        instance_type,
        gpu_type,
        region,
        NULL as input_tokens,
        NULL as output_tokens,
        NULL as cached_tokens,
        NULL as total_tokens,
        NULL as ptu_units,
        NULL as used_units,
        avg_gpu_utilization_pct as utilization_pct,
        gpu_hours,
        hours_used as instance_hours,
        NULL as request_count,
        hierarchy_level_1_id, hierarchy_level_1_name,
        hierarchy_level_2_id, hierarchy_level_2_name,
        hierarchy_level_3_id, hierarchy_level_3_name,
        hierarchy_level_4_id, hierarchy_level_4_name,
        hierarchy_level_5_id, hierarchy_level_5_name,
        hierarchy_level_6_id, hierarchy_level_6_name,
        hierarchy_level_7_id, hierarchy_level_7_name,
        hierarchy_level_8_id, hierarchy_level_8_name,
        hierarchy_level_9_id, hierarchy_level_9_name,
        hierarchy_level_10_id, hierarchy_level_10_name,
        'genai_infrastructure_usage_raw' as source_table,
        CURRENT_TIMESTAMP() as consolidated_at,
        -- STATE-001 FIX: Use procedure's own pipeline_id for consolidation lineage
        @p_pipeline_id as x_pipeline_id,
        COALESCE(x_credential_id, @p_credential_id) as x_credential_id,
        @p_date as x_pipeline_run_date,
        @p_run_id as x_run_id,
        CURRENT_TIMESTAMP() as x_ingested_at
      FROM `%s.%s.genai_infrastructure_usage_raw`
      WHERE usage_date = @p_date
        AND (@p_credential_id IS NULL OR x_credential_id = @p_credential_id)
    """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
    USING p_usage_date AS p_date, p_credential_id AS p_credential_id,
          v_pipeline_id AS p_pipeline_id, v_run_id AS p_run_id;

    -- Get total inserted count
    EXECUTE IMMEDIATE FORMAT("""
      SELECT COUNT(*) FROM `%s.%s.genai_usage_daily_unified`
      WHERE usage_date = @p_date
    """, p_project_id, p_dataset_id)
    INTO v_rows_inserted
    USING p_usage_date AS p_date;

  COMMIT TRANSACTION;

  -- Log consolidation result
  SELECT
    p_usage_date as usage_date,
    v_rows_deleted as rows_deleted,
    v_rows_inserted as rows_inserted,
    CURRENT_TIMESTAMP() as executed_at;

-- Issue #16-18 FIX: Add error handling
EXCEPTION WHEN ERROR THEN
  -- BigQuery auto-rollbacks on error inside transaction, so no explicit ROLLBACK needed
  RAISE USING MESSAGE = CONCAT('sp_genai_1_consolidate_usage_daily Failed: ', @@error.message);
END;
