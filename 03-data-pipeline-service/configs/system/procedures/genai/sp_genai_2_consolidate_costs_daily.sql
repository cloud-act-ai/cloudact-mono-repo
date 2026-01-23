-- ================================================================================
-- PROCEDURE: sp_genai_2_consolidate_costs_daily
-- LOCATION: {project_id}.organizations (central dataset)
-- OPERATES ON: {project_id}.{p_dataset_id} (per-customer dataset)
--
-- PURPOSE: Consolidates costs from all 3 GenAI flows (PAYG, Commitment, Infrastructure)
--          into a unified costs table for reporting and FOCUS conversion.
--
-- INPUTS:
--   p_project_id: GCP Project ID
--   p_dataset_id: Customer dataset (e.g., 'acme_corp_prod')
--   p_cost_date: Date to consolidate costs for
--
-- OUTPUT: Consolidated records in genai_costs_daily_unified table
--
-- HIERARCHY: Uses 5-field x_hierarchy_* model (entity_id, entity_name, level_code, path, path_names)
-- ================================================================================

CREATE OR REPLACE PROCEDURE `{project_id}.organizations`.sp_genai_2_consolidate_costs_daily(
  p_project_id STRING,
  p_dataset_id STRING,
  p_cost_date DATE,
  p_credential_id STRING,
  p_pipeline_id STRING,
  p_run_id STRING
)
OPTIONS(strict_mode=TRUE)
BEGIN
  DECLARE v_rows_deleted INT64 DEFAULT 0;
  DECLARE v_rows_inserted INT64 DEFAULT 0;
  DECLARE v_total_cost FLOAT64 DEFAULT 0.0;
  DECLARE v_pipeline_id STRING DEFAULT COALESCE(p_pipeline_id, 'genai_consolidate');
  DECLARE v_run_id STRING DEFAULT COALESCE(p_run_id, GENERATE_UUID());

  -- Validation
  ASSERT p_project_id IS NOT NULL AS "p_project_id cannot be NULL";
  ASSERT p_dataset_id IS NOT NULL AS "p_dataset_id cannot be NULL";
  ASSERT p_cost_date IS NOT NULL AS "p_cost_date cannot be NULL";

  BEGIN TRANSACTION;

    -- Step 1: Delete existing records for this date AND credential (idempotent)
    IF p_credential_id IS NOT NULL THEN
      EXECUTE IMMEDIATE FORMAT("""
        DELETE FROM `%s.%s.genai_costs_daily_unified`
        WHERE cost_date = @p_date
          AND x_credential_id = @p_credential_id
      """, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date, p_credential_id AS p_credential_id;
    ELSE
      EXECUTE IMMEDIATE FORMAT("""
        DELETE FROM `%s.%s.genai_costs_daily_unified`
        WHERE cost_date = @p_date
      """, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date;
    END IF;

    SET v_rows_deleted = @@row_count;

    -- Step 2: Insert PAYG costs
    -- Uses 5-field x_hierarchy_* model
    EXECUTE IMMEDIATE FORMAT("""
      INSERT INTO `%s.%s.genai_costs_daily_unified`
      (cost_date, x_org_slug, cost_type, provider, model, instance_type, gpu_type,
       region, input_cost_usd, output_cost_usd, commitment_cost_usd, overage_cost_usd,
       infrastructure_cost_usd, total_cost_usd, discount_applied_pct,
       usage_quantity, usage_unit,
       x_hierarchy_entity_id, x_hierarchy_entity_name, x_hierarchy_level_code,
       x_hierarchy_path, x_hierarchy_path_names,
       source_table, consolidated_at,
       x_ingestion_id, x_ingestion_date, x_genai_provider,
       x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
      SELECT
        cost_date,
        x_org_slug,
        'payg' as cost_type,
        provider,
        model,
        NULL as instance_type,
        NULL as gpu_type,
        region,
        input_cost_usd,
        output_cost_usd,
        NULL as commitment_cost_usd,
        NULL as overage_cost_usd,
        NULL as infrastructure_cost_usd,
        total_cost_usd,
        discount_applied_pct,
        total_tokens as usage_quantity,
        'tokens' as usage_unit,
        x_hierarchy_entity_id, x_hierarchy_entity_name, x_hierarchy_level_code,
        x_hierarchy_path, x_hierarchy_path_names,
        'genai_payg_costs_daily' as source_table,
        CURRENT_TIMESTAMP() as consolidated_at,
        GENERATE_UUID() as x_ingestion_id,
        @p_date as x_ingestion_date,
        x_genai_provider,
        COALESCE(x_pipeline_id, @p_pipeline_id) as x_pipeline_id,
        COALESCE(x_credential_id, @p_credential_id) as x_credential_id,
        COALESCE(x_pipeline_run_date, @p_date) as x_pipeline_run_date,
        COALESCE(x_run_id, @p_run_id) as x_run_id,
        COALESCE(x_ingested_at, CURRENT_TIMESTAMP()) as x_ingested_at
      FROM `%s.%s.genai_payg_costs_daily`
      WHERE cost_date = @p_date
        AND (@p_credential_id IS NULL OR x_credential_id = @p_credential_id)
    """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
    USING p_cost_date AS p_date, p_credential_id AS p_credential_id,
          v_pipeline_id AS p_pipeline_id, v_run_id AS p_run_id;

    -- Step 3: Insert Commitment costs
    EXECUTE IMMEDIATE FORMAT("""
      INSERT INTO `%s.%s.genai_costs_daily_unified`
      (cost_date, x_org_slug, cost_type, provider, model, instance_type, gpu_type,
       region, input_cost_usd, output_cost_usd, commitment_cost_usd, overage_cost_usd,
       infrastructure_cost_usd, total_cost_usd, discount_applied_pct,
       usage_quantity, usage_unit,
       x_hierarchy_entity_id, x_hierarchy_entity_name, x_hierarchy_level_code,
       x_hierarchy_path, x_hierarchy_path_names,
       source_table, consolidated_at,
       x_ingestion_id, x_ingestion_date, x_genai_provider,
       x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
      SELECT
        cost_date,
        x_org_slug,
        'commitment' as cost_type,
        provider,
        model,
        NULL as instance_type,
        NULL as gpu_type,
        region,
        NULL as input_cost_usd,
        NULL as output_cost_usd,
        commitment_cost_usd,
        overage_cost_usd,
        NULL as infrastructure_cost_usd,
        total_cost_usd,
        0.0 as discount_applied_pct,
        provisioned_units as usage_quantity,
        'ptu_hours' as usage_unit,
        x_hierarchy_entity_id, x_hierarchy_entity_name, x_hierarchy_level_code,
        x_hierarchy_path, x_hierarchy_path_names,
        'genai_commitment_costs_daily' as source_table,
        CURRENT_TIMESTAMP() as consolidated_at,
        GENERATE_UUID() as x_ingestion_id,
        @p_date as x_ingestion_date,
        x_genai_provider,
        COALESCE(x_pipeline_id, @p_pipeline_id) as x_pipeline_id,
        COALESCE(x_credential_id, @p_credential_id) as x_credential_id,
        COALESCE(x_pipeline_run_date, @p_date) as x_pipeline_run_date,
        COALESCE(x_run_id, @p_run_id) as x_run_id,
        COALESCE(x_ingested_at, CURRENT_TIMESTAMP()) as x_ingested_at
      FROM `%s.%s.genai_commitment_costs_daily`
      WHERE cost_date = @p_date
        AND (@p_credential_id IS NULL OR x_credential_id = @p_credential_id)
    """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
    USING p_cost_date AS p_date, p_credential_id AS p_credential_id,
          v_pipeline_id AS p_pipeline_id, v_run_id AS p_run_id;

    -- Step 4: Insert Infrastructure costs
    EXECUTE IMMEDIATE FORMAT("""
      INSERT INTO `%s.%s.genai_costs_daily_unified`
      (cost_date, x_org_slug, cost_type, provider, model, instance_type, gpu_type,
       region, input_cost_usd, output_cost_usd, commitment_cost_usd, overage_cost_usd,
       infrastructure_cost_usd, total_cost_usd, discount_applied_pct,
       usage_quantity, usage_unit,
       x_hierarchy_entity_id, x_hierarchy_entity_name, x_hierarchy_level_code,
       x_hierarchy_path, x_hierarchy_path_names,
       source_table, consolidated_at,
       x_ingestion_id, x_ingestion_date, x_genai_provider,
       x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
      SELECT
        cost_date,
        x_org_slug,
        'infrastructure' as cost_type,
        provider,
        NULL as model,
        instance_type,
        gpu_type,
        region,
        NULL as input_cost_usd,
        NULL as output_cost_usd,
        NULL as commitment_cost_usd,
        NULL as overage_cost_usd,
        total_cost_usd as infrastructure_cost_usd,
        total_cost_usd,
        ROUND((discount_applied_usd / NULLIF(base_cost_usd, 0)) * 100, 2) as discount_applied_pct,
        gpu_hours as usage_quantity,
        'gpu_hours' as usage_unit,
        x_hierarchy_entity_id, x_hierarchy_entity_name, x_hierarchy_level_code,
        x_hierarchy_path, x_hierarchy_path_names,
        'genai_infrastructure_costs_daily' as source_table,
        CURRENT_TIMESTAMP() as consolidated_at,
        GENERATE_UUID() as x_ingestion_id,
        @p_date as x_ingestion_date,
        x_genai_provider,
        COALESCE(x_pipeline_id, @p_pipeline_id) as x_pipeline_id,
        COALESCE(x_credential_id, @p_credential_id) as x_credential_id,
        COALESCE(x_pipeline_run_date, @p_date) as x_pipeline_run_date,
        COALESCE(x_run_id, @p_run_id) as x_run_id,
        COALESCE(x_ingested_at, CURRENT_TIMESTAMP()) as x_ingested_at
      FROM `%s.%s.genai_infrastructure_costs_daily`
      WHERE cost_date = @p_date
        AND (@p_credential_id IS NULL OR x_credential_id = @p_credential_id)
    """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
    USING p_cost_date AS p_date, p_credential_id AS p_credential_id,
          v_pipeline_id AS p_pipeline_id, v_run_id AS p_run_id;

    -- Get total count and cost
    EXECUTE IMMEDIATE FORMAT("""
      SELECT COUNT(*), COALESCE(SUM(total_cost_usd), 0)
      FROM `%s.%s.genai_costs_daily_unified`
      WHERE cost_date = @p_date
    """, p_project_id, p_dataset_id)
    INTO v_rows_inserted, v_total_cost
    USING p_cost_date AS p_date;

  COMMIT TRANSACTION;

  -- Log consolidation result
  SELECT
    p_cost_date as cost_date,
    v_rows_deleted as rows_deleted,
    v_rows_inserted as rows_inserted,
    v_total_cost as total_cost_usd,
    CURRENT_TIMESTAMP() as executed_at;

EXCEPTION WHEN ERROR THEN
  RAISE USING MESSAGE = CONCAT('sp_genai_2_consolidate_costs_daily Failed: ', @@error.message);
END;
