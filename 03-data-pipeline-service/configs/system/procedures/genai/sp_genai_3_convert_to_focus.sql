-- ================================================================================
-- PROCEDURE: sp_genai_3_convert_to_focus
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
--
-- HIERARCHY: Uses 5-field x_hierarchy_* model (entity_id, entity_name, level_code, path, path_names)
-- ================================================================================

CREATE OR REPLACE PROCEDURE `{project_id}.organizations`.sp_genai_3_convert_to_focus(
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
  DECLARE v_org_slug STRING;
  DECLARE v_currency STRING DEFAULT 'USD';
  -- Handle NULL defaults inside procedure body for BigQuery compatibility
  DECLARE v_pipeline_id STRING DEFAULT COALESCE(p_pipeline_id, 'genai_to_focus');
  DECLARE v_run_id STRING DEFAULT COALESCE(p_run_id, GENERATE_UUID());

  -- Validation
  ASSERT p_project_id IS NOT NULL AS "p_project_id cannot be NULL";
  ASSERT p_dataset_id IS NOT NULL AS "p_dataset_id cannot be NULL";
  ASSERT p_cost_date IS NOT NULL AS "p_cost_date cannot be NULL";

  -- BUG SEC-01 FIX: Validate identifiers to prevent SQL injection
  ASSERT REGEXP_CONTAINS(p_project_id, r'^[a-z][a-z0-9\-]*[a-z0-9]$')
    AS "Invalid project_id format - must match GCP project naming rules";
  ASSERT REGEXP_CONTAINS(p_dataset_id, r'^[a-zA-Z_][a-zA-Z0-9_]*$')
    AS "Invalid dataset_id format - must be valid BigQuery dataset name";

  -- BUG VAL-04 FIX: Add date validation
  ASSERT p_cost_date <= CURRENT_DATE()
    AS "p_cost_date cannot be in the future";
  ASSERT p_cost_date >= DATE('2020-01-01')
    AS "p_cost_date must be after 2020-01-01";

  -- FIX #4: Extract org_slug from dataset_id (format: {org_slug}_prod)
  SET v_org_slug = REGEXP_EXTRACT(p_dataset_id, r'^(.+)_prod$');

  -- FIX #4: Query org currency from org_profiles
  -- SEC-001 FIX: Use parameterized query to prevent SQL injection
  BEGIN
    EXECUTE IMMEDIATE FORMAT("""
      SELECT default_currency FROM `%s.organizations.org_profiles`
      WHERE org_slug = @org_slug
    """, p_project_id)
    INTO v_currency
    USING v_org_slug AS org_slug;
  EXCEPTION WHEN ERROR THEN
    -- If query fails, keep default USD
    SET v_currency = 'USD';
  END;

  BEGIN TRANSACTION;

    -- Step 1: Delete existing GenAI FOCUS records for this date AND credential (idempotent)
    -- FIX #3: Add credential_id filter to prevent deleting other credentials' data
    IF p_credential_id IS NOT NULL THEN
      EXECUTE IMMEDIATE FORMAT("""
        DELETE FROM `%s.%s.cost_data_standard_1_3`
        WHERE DATE(ChargePeriodStart) = @p_date
          AND x_genai_cost_type IS NOT NULL
          AND x_credential_id = @p_credential_id
      """, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date, p_credential_id AS p_credential_id;
    ELSE
      EXECUTE IMMEDIATE FORMAT("""
        DELETE FROM `%s.%s.cost_data_standard_1_3`
        WHERE DATE(ChargePeriodStart) = @p_date
          AND x_genai_cost_type IS NOT NULL
      """, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date;
    END IF;

    -- Step 2: Insert GenAI costs into FOCUS 1.3 table with lineage columns (STATE-001 FIX)
    -- Uses 5-field x_hierarchy_* model
    EXECUTE IMMEDIATE FORMAT("""
      INSERT INTO `%s.%s.cost_data_standard_1_3`
      (ChargePeriodStart, ChargePeriodEnd, BillingPeriodStart, BillingPeriodEnd,
       BillingAccountId, BillingCurrency, HostProviderName,
       InvoiceIssuerName, ServiceProviderName, ServiceCategory, ServiceName,
       ResourceId, ResourceName, ResourceType, RegionId, RegionName,
       ConsumedQuantity, ConsumedUnit, PricingCategory, PricingUnit,
       EffectiveCost, BilledCost, ListCost, ListUnitPrice,
       ContractedCost, ContractedUnitPrice,
       ChargeCategory, ChargeType, ChargeFrequency,
       SubAccountId, SubAccountName,
       x_genai_cost_type, x_genai_provider, x_genai_model,
       x_hierarchy_entity_id, x_hierarchy_entity_name, x_hierarchy_level_code,
       x_hierarchy_path, x_hierarchy_path_names,
       x_hierarchy_validated_at,
       x_ingestion_date,
       x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at,
       x_data_quality_score, x_created_at)
      SELECT
        TIMESTAMP(cost_date) as ChargePeriodStart,
        TIMESTAMP(cost_date) as ChargePeriodEnd,
        TIMESTAMP(DATE_TRUNC(cost_date, MONTH)) as BillingPeriodStart,
        TIMESTAMP(LAST_DAY(cost_date, MONTH)) as BillingPeriodEnd,

        -- Required billing fields
        x_org_slug as BillingAccountId,
        @v_currency as BillingCurrency,  -- FIX #4: Use org's currency
        'CloudAct' as HostProviderName,

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

        -- Service category: Use lowercase 'genai' for frontend compatibility
        -- Infrastructure costs (GPUs) are also classified as genai since they support LLM workloads
        'genai' as ServiceCategory,

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
        COALESCE(region, 'global') as RegionId,
        COALESCE(region, 'global') as RegionName,

        -- FIX #9: ConsumedQuantity based on cost_type
        CAST(
          CASE
            WHEN cost_type = 'payg' THEN usage_quantity  -- tokens
            WHEN cost_type = 'commitment' THEN usage_quantity  -- provisioned_units (already in usage_quantity)
            WHEN cost_type = 'infrastructure' THEN usage_quantity  -- gpu_hours
            ELSE usage_quantity
          END AS NUMERIC
        ) as ConsumedQuantity,

        usage_unit as ConsumedUnit,

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
        CAST(total_cost_usd AS NUMERIC) as EffectiveCost,
        CAST(total_cost_usd AS NUMERIC) as BilledCost,
        CAST(ROUND(total_cost_usd / (1 - COALESCE(discount_applied_pct, 0) / 100), 2) AS NUMERIC) as ListCost,
        CAST(NULL AS NUMERIC) as ListUnitPrice,
        CASE WHEN cost_type = 'commitment' THEN CAST(total_cost_usd AS NUMERIC) ELSE CAST(0 AS NUMERIC) END as ContractedCost,
        CAST(0 AS NUMERIC) as ContractedUnitPrice,

        -- Charge attributes
        'Usage' as ChargeCategory,
        'Usage' as ChargeType,
        -- FIX #10: ChargeFrequency based on cost_type
        CASE
          WHEN cost_type = 'commitment' THEN 'Recurring'
          ELSE 'Usage-Based'
        END as ChargeFrequency,

        -- Account
        x_org_slug as SubAccountId,
        x_org_slug as SubAccountName,

        -- Extension fields
        cost_type as x_genai_cost_type,
        provider as x_genai_provider,
        model as x_genai_model,

        -- 5-field hierarchy model (NEW design)
        x_hierarchy_entity_id,
        x_hierarchy_entity_name,
        x_hierarchy_level_code,
        x_hierarchy_path,
        x_hierarchy_path_names,

        -- Set validation timestamp when any hierarchy field is set
        CASE
          WHEN x_hierarchy_entity_id IS NOT NULL
          THEN CURRENT_TIMESTAMP()
          ELSE NULL
        END as x_hierarchy_validated_at,

        -- STATE-001 FIX: Lineage values for FOCUS 1.3 (Issue #1: snake_case)
        cost_date as x_ingestion_date,
        COALESCE(x_pipeline_id, @p_pipeline_id) as x_pipeline_id,
        COALESCE(x_credential_id, @p_credential_id, 'internal') as x_credential_id,
        COALESCE(x_pipeline_run_date, cost_date) as x_pipeline_run_date,
        COALESCE(x_run_id, @p_run_id) as x_run_id,
        COALESCE(x_ingested_at, CURRENT_TIMESTAMP()) as x_ingested_at,
        100.0 as x_data_quality_score,  -- GenAI consolidated costs are high quality
        CURRENT_TIMESTAMP() as x_created_at

      FROM `%s.%s.genai_costs_daily_unified`
      WHERE cost_date = @p_date
        AND total_cost_usd > 0
        AND (@p_credential_id IS NULL OR x_credential_id = @p_credential_id)
    """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
    USING p_cost_date AS p_date, p_credential_id AS p_credential_id,
          v_pipeline_id AS p_pipeline_id, v_run_id AS p_run_id, v_currency AS v_currency;

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
  RAISE USING MESSAGE = CONCAT('sp_genai_3_convert_to_focus Failed: ', @@error.message);
END;
