-- ================================================================================
-- PROCEDURE: sp_convert_genai_to_focus_1_3
-- LOCATION: {project_id}.organizations (central dataset)
-- OPERATES ON: {project_id}.{p_dataset_id} (per-customer dataset)
--
-- PURPOSE: Converts GenAI unified costs to FOCUS 1.3 standard format
--          for unified cost reporting and analysis.
--
-- INPUTS:
--   p_project_id: GCP Project ID
--   p_dataset_id: Customer dataset (e.g., 'acme_corp_prod')
--   p_cost_date: Date to convert costs for
--
-- OUTPUT: Records inserted into cost_data_standard_1_3 table
-- ================================================================================

CREATE OR REPLACE PROCEDURE `{project_id}.organizations`.sp_convert_genai_to_focus_1_3(
  p_project_id STRING,
  p_dataset_id STRING,
  p_cost_date DATE,
  p_credential_id STRING,  -- MT-001 FIX: Add credential_id for multi-account isolation (pass NULL if not filtering)
  p_pipeline_id STRING,    -- STATE-001 FIX: Add lineage params (pass NULL for default 'genai_to_focus')
  p_run_id STRING          -- Pass NULL for auto-generated UUID
)
OPTIONS(strict_mode=TRUE)
BEGIN
  DECLARE v_rows_inserted INT64 DEFAULT 0;
  -- Handle NULL defaults inside procedure body for BigQuery compatibility
  DECLARE v_pipeline_id STRING DEFAULT COALESCE(p_pipeline_id, 'genai_to_focus');
  DECLARE v_run_id STRING DEFAULT COALESCE(p_run_id, GENERATE_UUID());

  -- Validation
  ASSERT p_project_id IS NOT NULL AS "p_project_id cannot be NULL";
  ASSERT p_dataset_id IS NOT NULL AS "p_dataset_id cannot be NULL";
  ASSERT p_cost_date IS NOT NULL AS "p_cost_date cannot be NULL";

  BEGIN TRANSACTION;

    -- Step 1: Delete existing GenAI FOCUS records for this date AND credential (idempotent)
    -- MT-001 FIX: Add credential_id filter to prevent deleting other credentials' data
    IF p_credential_id IS NOT NULL THEN
      EXECUTE IMMEDIATE FORMAT("""
        DELETE FROM `%s.%s.cost_data_standard_1_3`
        WHERE ChargePeriodStart = @p_date
          AND x_genai_cost_type IS NOT NULL
          AND x_credential_id = @p_credential_id
      """, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date, p_credential_id AS p_credential_id;
    ELSE
      EXECUTE IMMEDIATE FORMAT("""
        DELETE FROM `%s.%s.cost_data_standard_1_3`
        WHERE ChargePeriodStart = @p_date
          AND x_genai_cost_type IS NOT NULL
      """, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date;
    END IF;

    -- Step 2: Insert GenAI costs into FOCUS 1.3 table with lineage columns (STATE-001 FIX)
    EXECUTE IMMEDIATE FORMAT("""
      INSERT INTO `%s.%s.cost_data_standard_1_3`
      (ChargePeriodStart, ChargePeriodEnd, BillingPeriodStart, BillingPeriodEnd,
       InvoiceIssuerName, ServiceProviderName, ServiceCategory, ServiceName,
       ResourceId, ResourceName, ResourceType, Region,
       UsageAmount, UsageUnit, PricingCategory, PricingUnit,
       EffectiveCost, BilledCost, ListCost, ListUnitPrice,
       ContractedCost, ContractedUnitPrice,
       CostCategory, ChargeType, ChargeFrequency, ChargePeriodType,
       SubAccountId, SubAccountName,
       x_genai_cost_type, x_genai_provider, x_genai_model,
       x_hierarchy_dept_id, x_hierarchy_dept_name,
       x_hierarchy_project_id, x_hierarchy_project_name,
       x_hierarchy_team_id, x_hierarchy_team_name,
       x_hierarchy_validated_at,  -- Issue #8-11 FIX: Add hierarchy validation timestamp
       -- STATE-001 FIX: Required lineage columns for FOCUS 1.3 (Issue #1: snake_case)
       x_pipeline_id, x_run_id, x_data_quality_score, x_created_at,
       x_credential_id, x_pipeline_run_date, x_ingested_at)
      SELECT
        cost_date as ChargePeriodStart,
        cost_date as ChargePeriodEnd,
        DATE_TRUNC(cost_date, MONTH) as BillingPeriodStart,
        LAST_DAY(cost_date, MONTH) as BillingPeriodEnd,

        -- Provider name mapping
        CASE provider
          WHEN 'openai' THEN 'OpenAI'
          WHEN 'anthropic' THEN 'Anthropic'
          WHEN 'gemini' THEN 'Google'
          WHEN 'azure_openai' THEN 'Microsoft'
          WHEN 'aws_bedrock' THEN 'Amazon Web Services'
          WHEN 'gcp_vertex' THEN 'Google Cloud'
          WHEN 'gcp_gpu' THEN 'Google Cloud'
          WHEN 'aws_gpu' THEN 'Amazon Web Services'
          WHEN 'azure_gpu' THEN 'Microsoft'
          ELSE provider
        END as InvoiceIssuerName,

        CASE provider
          WHEN 'openai' THEN 'OpenAI'
          WHEN 'anthropic' THEN 'Anthropic'
          WHEN 'gemini' THEN 'Google AI'
          WHEN 'azure_openai' THEN 'Azure OpenAI'
          WHEN 'aws_bedrock' THEN 'AWS Bedrock'
          WHEN 'gcp_vertex' THEN 'Vertex AI'
          WHEN 'gcp_gpu' THEN 'Google Cloud Compute'
          WHEN 'aws_gpu' THEN 'Amazon EC2'
          WHEN 'azure_gpu' THEN 'Azure Virtual Machines'
          ELSE provider
        END as ServiceProviderName,

        -- Service category based on cost type
        CASE cost_type
          WHEN 'infrastructure' THEN 'Compute'
          ELSE 'AI and Machine Learning'
        END as ServiceCategory,

        -- Service name
        CASE cost_type
          WHEN 'payg' THEN CONCAT(UPPER(SUBSTR(provider, 1, 1)), LOWER(SUBSTR(provider, 2)), ' API')
          WHEN 'commitment' THEN CONCAT(UPPER(SUBSTR(provider, 1, 1)), LOWER(SUBSTR(provider, 2)), ' Commitment')
          WHEN 'infrastructure' THEN CONCAT(UPPER(SUBSTR(provider, 1, 1)), LOWER(SUBSTR(provider, 2)), ' GPU/TPU')
        END as ServiceName,

        -- Resource identification
        COALESCE(model, instance_type, 'default') as ResourceId,
        COALESCE(model, instance_type, provider) as ResourceName,
        cost_type as ResourceType,
        COALESCE(region, 'global') as Region,

        -- Usage
        usage_quantity as UsageAmount,
        usage_unit as UsageUnit,

        CASE cost_type
          WHEN 'commitment' THEN 'Committed'
          WHEN 'infrastructure' THEN CASE
            WHEN usage_unit = 'spot' THEN 'Spot'
            ELSE 'On-Demand'
          END
          ELSE 'On-Demand'
        END as PricingCategory,

        usage_unit as PricingUnit,

        -- Costs
        total_cost_usd as EffectiveCost,
        total_cost_usd as BilledCost,
        ROUND(total_cost_usd / (1 - COALESCE(discount_applied_pct, 0) / 100), 2) as ListCost,
        NULL as ListUnitPrice,
        CASE WHEN cost_type = 'commitment' THEN total_cost_usd ELSE NULL END as ContractedCost,
        NULL as ContractedUnitPrice,

        -- Charge attributes
        'Usage' as CostCategory,
        'Usage' as ChargeType,
        'Usage-Based' as ChargeFrequency,
        'Daily' as ChargePeriodType,

        -- Account
        org_slug as SubAccountId,
        org_slug as SubAccountName,

        -- Extension fields
        cost_type as x_genai_cost_type,
        provider as x_genai_provider,
        model as x_genai_model,
        hierarchy_dept_id as x_hierarchy_dept_id,
        hierarchy_dept_name as x_hierarchy_dept_name,
        hierarchy_project_id as x_hierarchy_project_id,
        hierarchy_project_name as x_hierarchy_project_name,
        hierarchy_team_id as x_hierarchy_team_id,
        hierarchy_team_name as x_hierarchy_team_name,
        -- Issue #8-11 FIX: Set validation timestamp when hierarchy IDs present
        CASE
          WHEN hierarchy_dept_id IS NOT NULL OR hierarchy_project_id IS NOT NULL OR hierarchy_team_id IS NOT NULL
          THEN CURRENT_TIMESTAMP()
          ELSE NULL
        END as x_hierarchy_validated_at,

        -- STATE-001 FIX: Lineage values for FOCUS 1.3 (Issue #1: snake_case)
        COALESCE(x_pipeline_id, @p_pipeline_id) as x_pipeline_id,
        COALESCE(x_run_id, @p_run_id) as x_run_id,
        100.0 as x_data_quality_score,  -- GenAI consolidated costs are high quality
        CURRENT_TIMESTAMP() as x_created_at,
        COALESCE(x_credential_id, @p_credential_id, 'internal') as x_credential_id,
        COALESCE(x_pipeline_run_date, cost_date) as x_pipeline_run_date,
        COALESCE(x_ingested_at, CURRENT_TIMESTAMP()) as x_ingested_at

      FROM `%s.%s.genai_costs_daily_unified`
      WHERE cost_date = @p_date
        AND total_cost_usd > 0
        AND (@p_credential_id IS NULL OR x_credential_id = @p_credential_id)
    """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
    USING p_cost_date AS p_date, p_credential_id AS p_credential_id,
          v_pipeline_id AS p_pipeline_id, v_run_id AS p_run_id;

    SET v_rows_inserted = @@row_count;

  COMMIT TRANSACTION;

  -- Log conversion result
  SELECT
    p_cost_date as cost_date,
    v_rows_inserted as rows_inserted,
    'cost_data_standard_1_3' as target_table,
    CURRENT_TIMESTAMP() as executed_at;

-- Issue #16-18 FIX: Add error handling
EXCEPTION WHEN ERROR THEN
  -- BigQuery auto-rollbacks on error inside transaction, so no explicit ROLLBACK needed
  RAISE USING MESSAGE = CONCAT('sp_convert_genai_to_focus_1_3 Failed: ', @@error.message);
END;
