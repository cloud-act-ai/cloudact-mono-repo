-- ================================================================================
-- PROCEDURE: sp_cloud_1_convert_to_focus
-- LOCATION: {project_id}.organizations (central dataset)
-- OPERATES ON: {project_id}.{p_dataset_id} (per-customer dataset)
--
-- PURPOSE: Converts cloud provider billing costs (GCP, AWS, Azure, OCI) to FOCUS 1.3
--          standard format for unified cost reporting and analysis.
--
-- INPUTS:
--   p_project_id: GCP Project ID
--   p_dataset_id: Customer dataset (e.g., 'acme_corp_prod')
--   p_cost_date: Date to convert costs for
--   p_provider: Cloud provider ('gcp', 'aws', 'azure', 'oci', or 'all')
--
-- OUTPUT: Records inserted into cost_data_standard_1_3 table
--
-- HIERARCHY: Uses 5-field x_hierarchy_* model (entity_id, entity_name, level_code, path, path_names)
-- ================================================================================

CREATE OR REPLACE PROCEDURE `{project_id}.organizations`.sp_cloud_1_convert_to_focus(
  p_project_id STRING,
  p_dataset_id STRING,
  p_cost_date DATE,
  p_provider STRING,
  p_pipeline_id STRING,
  p_credential_id STRING,
  p_run_id STRING
)
OPTIONS(strict_mode=TRUE)
BEGIN
  DECLARE v_rows_inserted INT64 DEFAULT 0;
  DECLARE v_org_slug STRING;
  DECLARE v_org_exists INT64 DEFAULT 0;

  -- Extract org_slug from dataset_id using safe extraction
  -- Pattern: {org_slug}_{env} where env is prod/stage/dev/local/test
  -- Handles edge cases like org_slug = "acme_prod_team" → extracts "acme_prod_team" not "acme"
  SET v_org_slug = REGEXP_EXTRACT(p_dataset_id, r'^(.+?)_(?:prod|stage|dev|local|test)$');

  -- Fallback: if no match, assume entire dataset_id is org_slug (for backward compatibility)
  IF v_org_slug IS NULL THEN
    SET v_org_slug = p_dataset_id;
  END IF;

  -- Validation
  ASSERT p_project_id IS NOT NULL AS "p_project_id cannot be NULL";
  ASSERT p_dataset_id IS NOT NULL AS "p_dataset_id cannot be NULL";

  -- Security: Verify org_slug exists in org_profiles to prevent unauthorized access
  EXECUTE IMMEDIATE FORMAT("""
    SELECT COUNT(*) FROM `%s.organizations.org_profiles`
    WHERE org_slug = @v_org_slug
  """, p_project_id)
  INTO v_org_exists USING v_org_slug AS v_org_slug;
  ASSERT v_org_exists = 1 AS "Organization not found or unauthorized access";
  ASSERT p_cost_date IS NOT NULL AS "p_cost_date cannot be NULL";
  ASSERT p_provider IN ('gcp', 'aws', 'azure', 'oci', 'all') AS "p_provider must be gcp, aws, azure, oci, or all";
  ASSERT p_pipeline_id IS NOT NULL AS "p_pipeline_id cannot be NULL";
  ASSERT p_credential_id IS NOT NULL AS "p_credential_id cannot be NULL";
  ASSERT p_run_id IS NOT NULL AS "p_run_id cannot be NULL";

  BEGIN TRANSACTION;

    -- Delete existing cloud FOCUS records for this date and provider(s)
    IF p_provider = 'all' THEN
      EXECUTE IMMEDIATE FORMAT("""
        DELETE FROM `%s.%s.cost_data_standard_1_3`
        WHERE DATE(ChargePeriodStart) = @p_date
          AND x_source_system IN ('cloud_gcp_billing_raw_daily', 'cloud_aws_billing_raw_daily',
                                  'cloud_azure_billing_raw_daily', 'cloud_oci_billing_raw_daily')
      """, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date;
    ELSE
      EXECUTE IMMEDIATE FORMAT("""
        DELETE FROM `%s.%s.cost_data_standard_1_3`
        WHERE DATE(ChargePeriodStart) = @p_date
          AND x_source_system = CONCAT('cloud_', @p_provider, '_billing_raw_daily')
      """, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date, p_provider AS p_provider;
    END IF;

    -- ============================================================================
    -- GCP Billing to FOCUS 1.3
    -- Uses 5-field x_hierarchy_* model (NEW design)
    -- FOCUS 1.3 compliant: Includes pricing details, credits, and adjustment info
    -- ============================================================================
    IF p_provider IN ('gcp', 'all') THEN
      EXECUTE IMMEDIATE FORMAT("""
        INSERT INTO `%s.%s.cost_data_standard_1_3`
        (BillingAccountId, ChargePeriodStart, ChargePeriodEnd, BillingPeriodStart, BillingPeriodEnd,
         InvoiceIssuerName, ServiceProviderName, HostProviderName,
         ServiceCategory, ServiceName, ServiceSubcategory,
         ResourceId, ResourceName, ResourceType, RegionId, RegionName,
         ConsumedQuantity, ConsumedUnit, PricingCategory, PricingUnit,
         PricingQuantity, ListUnitPrice, ContractedUnitPrice,
         ContractedCost, EffectiveCost, BilledCost, ListCost, BillingCurrency,
         ChargeCategory, ChargeClass, ChargeType, ChargeFrequency,
         SubAccountId, SubAccountName,
         SkuId, SkuPriceDetails,
         Tags,
         x_source_system, x_source_record_id, x_updated_at,
         x_cloud_provider, x_cloud_account_id,
         -- 5-field hierarchy model (NEW design)
         x_hierarchy_entity_id, x_hierarchy_entity_name,
         x_hierarchy_level_code, x_hierarchy_path, x_hierarchy_path_names,
         x_hierarchy_validated_at,
         x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
        -- CTE to lookup hierarchy from resource tags
        WITH hierarchy_lookup AS (
          SELECT
            entity_id,
            entity_name,
            level_code,
            path,
            path_names
          FROM `%s.organizations.org_hierarchy`
          WHERE org_slug = @v_org_slug
            AND end_date IS NULL
        )
        SELECT
          billing_account_id as BillingAccountId,
          TIMESTAMP(usage_start_time) as ChargePeriodStart,
          TIMESTAMP(usage_end_time) as ChargePeriodEnd,
          TIMESTAMP(DATE_TRUNC(DATE(usage_start_time), MONTH)) as BillingPeriodStart,
          TIMESTAMP(LAST_DAY(DATE(usage_start_time), MONTH)) as BillingPeriodEnd,

          'Google Cloud Platform' as InvoiceIssuerName,
          'Google Cloud' as ServiceProviderName,
          'Google Cloud' as HostProviderName,

          CASE
            WHEN service_id LIKE '%%compute%%' THEN 'Compute'
            WHEN service_id LIKE '%%storage%%' THEN 'Storage'
            WHEN service_id LIKE '%%bigquery%%' THEN 'Database'
            WHEN service_id LIKE '%%network%%' THEN 'Networking'
            ELSE 'Other'
          END as ServiceCategory,
          COALESCE(service_description, service_id) as ServiceName,
          COALESCE(sku_description, 'Default') as ServiceSubcategory,

          COALESCE(resource_global_name, resource_name) as ResourceId,
          resource_name as ResourceName,
          'GCP Resource' as ResourceType,
          COALESCE(location_region, location_location, 'global') as RegionId,
          COALESCE(location_region, location_location, 'Global') as RegionName,

          CAST(usage_amount AS NUMERIC) as ConsumedQuantity,
          usage_unit as ConsumedUnit,
          CASE cost_type
            WHEN 'regular' THEN 'On-Demand'
            WHEN 'tax' THEN 'Tax'
            ELSE 'On-Demand'
          END as PricingCategory,
          usage_pricing_unit as PricingUnit,

          -- FOCUS 1.3: Pricing details from GCP billing
          CAST(usage_amount_in_pricing_units AS NUMERIC) as PricingQuantity,
          CAST(price_list_price AS NUMERIC) as ListUnitPrice,
          CAST(price_effective_price AS NUMERIC) as ContractedUnitPrice,

          CAST(cost AS NUMERIC) as ContractedCost,
          -- EffectiveCost = gross cost + credits (credits are negative, so this subtracts them)
          CAST(cost + COALESCE(credits_total, 0) AS NUMERIC) as EffectiveCost,
          CAST(cost AS NUMERIC) as BilledCost,
          CAST(COALESCE(cost_at_list, cost) AS NUMERIC) as ListCost,
          COALESCE(currency, 'USD') as BillingCurrency,

          'Usage' as ChargeCategory,
          -- ChargeClass: 'Correction' if this is an adjustment, NULL otherwise
          CASE
            WHEN JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(adjustment_info_json), '$.id') IS NOT NULL THEN 'Correction'
            ELSE NULL
          END as ChargeClass,
          COALESCE(cost_type, 'Usage') as ChargeType,
          'Usage-Based' as ChargeFrequency,

          @v_org_slug as SubAccountId,
          COALESCE(project_name, project_id) as SubAccountName,

          sku_id as SkuId,
          -- SkuPriceDetails: Include pricing tier, credits, and consumption model
          JSON_OBJECT(
            'sku_description', sku_description,
            'service_id', service_id,
            'price_unit', price_unit,
            'price_tier_start_amount', price_tier_start_amount,
            'price_pricing_unit_quantity', price_pricing_unit_quantity,
            'credits_total', credits_total,
            'credits_json', SAFE.PARSE_JSON(credits_json),
            'invoice_month', invoice_month,
            'adjustment_info', SAFE.PARSE_JSON(adjustment_info_json),
            'consumption_model', SAFE.PARSE_JSON(consumption_model_json)
          ) as SkuPriceDetails,

          COALESCE(SAFE.PARSE_JSON(labels_json), JSON_OBJECT()) as Tags,

          'cloud_gcp_billing_raw_daily' as x_source_system,
          GENERATE_UUID() as x_source_record_id,
          CURRENT_TIMESTAMP() as x_updated_at,
          'gcp' as x_cloud_provider,
          billing_account_id as x_cloud_account_id,

          -- 5-field hierarchy model (NEW design)
          h.entity_id as x_hierarchy_entity_id,
          h.entity_name as x_hierarchy_entity_name,
          h.level_code as x_hierarchy_level_code,
          h.path as x_hierarchy_path,
          h.path_names as x_hierarchy_path_names,
          CASE WHEN h.entity_id IS NOT NULL THEN CURRENT_TIMESTAMP() ELSE NULL END as x_hierarchy_validated_at,

          -- Lineage columns (REQUIRED)
          @p_pipeline_id as x_pipeline_id,
          @p_credential_id as x_credential_id,
          @p_date as x_pipeline_run_date,
          @p_run_id as x_run_id,
          CURRENT_TIMESTAMP() as x_ingested_at

        FROM `%s.%s.cloud_gcp_billing_raw_daily` b
        LEFT JOIN hierarchy_lookup h ON h.entity_id = COALESCE(
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.cost_center'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.team'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.department'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.entity_id')
        )
        WHERE DATE(b.usage_start_time) = @p_date
          AND b.cost > 0
      """, p_project_id, p_dataset_id, p_project_id, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date, p_pipeline_id AS p_pipeline_id, p_credential_id AS p_credential_id, p_run_id AS p_run_id, v_org_slug AS v_org_slug;

      SET v_rows_inserted = v_rows_inserted + @@row_count;
    END IF;

    -- ============================================================================
    -- AWS Billing to FOCUS 1.3
    -- Uses 5-field x_hierarchy_* model (NEW design)
    -- ============================================================================
    IF p_provider IN ('aws', 'all') THEN
      EXECUTE IMMEDIATE FORMAT("""
        INSERT INTO `%s.%s.cost_data_standard_1_3`
        (BillingAccountId, ChargePeriodStart, ChargePeriodEnd, BillingPeriodStart, BillingPeriodEnd,
         InvoiceIssuerName, ServiceProviderName, HostProviderName,
         ServiceCategory, ServiceName, ServiceSubcategory,
         ResourceId, ResourceName, ResourceType, RegionId, RegionName,
         ConsumedQuantity, ConsumedUnit, PricingCategory, PricingUnit,
         ContractedCost, EffectiveCost, BilledCost, ListCost, BillingCurrency,
         ChargeCategory, ChargeType, ChargeFrequency,
         SubAccountId, SubAccountName,
         SkuId, SkuPriceDetails,
         Tags,
         x_source_system, x_source_record_id, x_updated_at,
         x_cloud_provider, x_cloud_account_id,
         CommitmentDiscountId, CommitmentDiscountType,
         -- 5-field hierarchy model (NEW design)
         x_hierarchy_entity_id, x_hierarchy_entity_name,
         x_hierarchy_level_code, x_hierarchy_path, x_hierarchy_path_names,
         x_hierarchy_validated_at,
         x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
        -- CTE to lookup hierarchy from resource tags
        WITH hierarchy_lookup AS (
          SELECT
            entity_id,
            entity_name,
            level_code,
            path,
            path_names
          FROM `%s.organizations.org_hierarchy`
          WHERE org_slug = @v_org_slug
            AND end_date IS NULL
        )
        SELECT
          b.payer_account_id as BillingAccountId,
          COALESCE(b.usage_start_time, TIMESTAMP(b.usage_date)) as ChargePeriodStart,
          COALESCE(b.usage_end_time, TIMESTAMP(DATE_ADD(b.usage_date, INTERVAL 1 DAY))) as ChargePeriodEnd,
          TIMESTAMP(b.billing_period_start) as BillingPeriodStart,
          TIMESTAMP(b.billing_period_end) as BillingPeriodEnd,

          'Amazon Web Services' as InvoiceIssuerName,
          'AWS' as ServiceProviderName,
          'AWS' as HostProviderName,

          CASE
            WHEN b.service_code LIKE '%%EC2%%' OR b.product_code LIKE '%%EC2%%' THEN 'Compute'
            WHEN b.service_code LIKE '%%S3%%' THEN 'Storage'
            WHEN b.service_code LIKE '%%RDS%%' THEN 'Database'
            WHEN b.service_code LIKE '%%Lambda%%' THEN 'Compute'
            ELSE 'Other'
          END as ServiceCategory,
          COALESCE(b.product_name, b.service_code, b.product_code) as ServiceName,
          COALESCE(b.operation, 'Default') as ServiceSubcategory,

          b.resource_id as ResourceId,
          b.resource_id as ResourceName,
          COALESCE(b.usage_type, 'AWS Resource') as ResourceType,
          COALESCE(b.region, 'global') as RegionId,
          COALESCE(b.region, 'Global') as RegionName,

          CAST(b.usage_amount AS NUMERIC) as ConsumedQuantity,
          b.usage_unit as ConsumedUnit,
          CASE
            WHEN b.reservation_arn IS NOT NULL THEN 'Committed'
            WHEN b.savings_plan_arn IS NOT NULL THEN 'Committed'
            ELSE 'On-Demand'
          END as PricingCategory,
          b.pricing_unit as PricingUnit,

          CAST(COALESCE(b.net_unblended_cost, b.unblended_cost) AS NUMERIC) as ContractedCost,
          CAST(COALESCE(b.net_unblended_cost, b.unblended_cost) AS NUMERIC) as EffectiveCost,
          CAST(b.unblended_cost AS NUMERIC) as BilledCost,
          CAST(COALESCE(b.public_on_demand_cost, b.unblended_cost) AS NUMERIC) as ListCost,
          COALESCE(b.currency, 'USD') as BillingCurrency,

          CASE b.line_item_type
            WHEN 'Tax' THEN 'Tax'
            WHEN 'Credit' THEN 'Credit'
            ELSE 'Usage'
          END as ChargeCategory,
          COALESCE(b.line_item_type, 'Usage') as ChargeType,
          'Usage-Based' as ChargeFrequency,

          @v_org_slug as SubAccountId,
          COALESCE(b.linked_account_name, b.linked_account_id) as SubAccountName,

          CONCAT(b.product_code, '/', b.usage_type) as SkuId,
          JSON_OBJECT('service_code', b.service_code, 'product_code', b.product_code, 'usage_type', b.usage_type) as SkuPriceDetails,

          COALESCE(SAFE.PARSE_JSON(b.resource_tags_json), JSON_OBJECT()) as Tags,

          'cloud_aws_billing_raw_daily' as x_source_system,
          GENERATE_UUID() as x_source_record_id,
          CURRENT_TIMESTAMP() as x_updated_at,
          'aws' as x_cloud_provider,
          b.payer_account_id as x_cloud_account_id,

          COALESCE(b.reservation_arn, b.savings_plan_arn) as CommitmentDiscountId,
          CASE
            WHEN b.reservation_arn IS NOT NULL THEN 'Reserved Instance'
            WHEN b.savings_plan_arn IS NOT NULL THEN 'Savings Plan'
            ELSE NULL
          END as CommitmentDiscountType,

          -- 5-field hierarchy model (NEW design)
          h.entity_id as x_hierarchy_entity_id,
          h.entity_name as x_hierarchy_entity_name,
          h.level_code as x_hierarchy_level_code,
          h.path as x_hierarchy_path,
          h.path_names as x_hierarchy_path_names,
          CASE WHEN h.entity_id IS NOT NULL THEN CURRENT_TIMESTAMP() ELSE NULL END as x_hierarchy_validated_at,

          -- Lineage columns (REQUIRED)
          @p_pipeline_id as x_pipeline_id,
          @p_credential_id as x_credential_id,
          @p_date as x_pipeline_run_date,
          @p_run_id as x_run_id,
          CURRENT_TIMESTAMP() as x_ingested_at

        FROM `%s.%s.cloud_aws_billing_raw_daily` b
        LEFT JOIN hierarchy_lookup h ON h.entity_id = COALESCE(
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.cost_center'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.team'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.department'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.entity_id'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.cost_category_json), '$.cost_center'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.cost_category_json), '$.entity_id')
        )
        WHERE b.usage_date = @p_date
          AND b.unblended_cost > 0
      """, p_project_id, p_dataset_id, p_project_id, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date, p_pipeline_id AS p_pipeline_id, p_credential_id AS p_credential_id, p_run_id AS p_run_id, v_org_slug AS v_org_slug;

      SET v_rows_inserted = v_rows_inserted + @@row_count;
    END IF;

    -- ============================================================================
    -- Azure Billing to FOCUS 1.3
    -- Uses 5-field x_hierarchy_* model (NEW design)
    -- ============================================================================
    IF p_provider IN ('azure', 'all') THEN
      EXECUTE IMMEDIATE FORMAT("""
        INSERT INTO `%s.%s.cost_data_standard_1_3`
        (BillingAccountId, ChargePeriodStart, ChargePeriodEnd, BillingPeriodStart, BillingPeriodEnd,
         InvoiceIssuerName, ServiceProviderName, HostProviderName,
         ServiceCategory, ServiceName, ServiceSubcategory,
         ResourceId, ResourceName, ResourceType, RegionId, RegionName,
         ConsumedQuantity, ConsumedUnit, PricingCategory, PricingUnit,
         ContractedCost, EffectiveCost, BilledCost, ListCost, BillingCurrency,
         ChargeCategory, ChargeType, ChargeFrequency,
         SubAccountId, SubAccountName,
         SkuId, SkuPriceDetails,
         Tags,
         x_source_system, x_source_record_id, x_updated_at,
         x_cloud_provider, x_cloud_account_id,
         CommitmentDiscountId, CommitmentDiscountName, CommitmentDiscountType,
         -- 5-field hierarchy model (NEW design)
         x_hierarchy_entity_id, x_hierarchy_entity_name,
         x_hierarchy_level_code, x_hierarchy_path, x_hierarchy_path_names,
         x_hierarchy_validated_at,
         x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
        -- CTE to lookup hierarchy from resource tags
        WITH hierarchy_lookup AS (
          SELECT
            entity_id,
            entity_name,
            level_code,
            path,
            path_names
          FROM `%s.organizations.org_hierarchy`
          WHERE org_slug = @v_org_slug
            AND end_date IS NULL
        )
        SELECT
          b.subscription_id as BillingAccountId,
          TIMESTAMP(b.usage_date) as ChargePeriodStart,
          TIMESTAMP(DATE_ADD(b.usage_date, INTERVAL 1 DAY)) as ChargePeriodEnd,
          TIMESTAMP(b.billing_period_start) as BillingPeriodStart,
          TIMESTAMP(b.billing_period_end) as BillingPeriodEnd,

          'Microsoft Azure' as InvoiceIssuerName,
          'Microsoft Azure' as ServiceProviderName,
          'Microsoft' as HostProviderName,

          COALESCE(b.meter_category, 'Other') as ServiceCategory,
          COALESCE(b.service_name, b.meter_category) as ServiceName,
          COALESCE(b.meter_subcategory, 'Default') as ServiceSubcategory,

          b.resource_id as ResourceId,
          b.resource_name as ResourceName,
          COALESCE(b.resource_type, 'Azure Resource') as ResourceType,
          COALESCE(b.resource_location, 'global') as RegionId,
          COALESCE(b.resource_location, 'Global') as RegionName,

          CAST(b.usage_quantity AS NUMERIC) as ConsumedQuantity,
          b.unit_of_measure as ConsumedUnit,
          COALESCE(b.pricing_model, 'On-Demand') as PricingCategory,
          b.unit_of_measure as PricingUnit,

          CAST(b.cost_in_billing_currency AS NUMERIC) as ContractedCost,
          CAST(b.cost_in_billing_currency AS NUMERIC) as EffectiveCost,
          CAST(b.cost_in_billing_currency AS NUMERIC) as BilledCost,
          CAST(COALESCE(b.usage_quantity * b.unit_price, b.cost_in_billing_currency) AS NUMERIC) as ListCost,
          COALESCE(b.billing_currency, 'USD') as BillingCurrency,

          CASE b.charge_type
            WHEN 'Refund' THEN 'Credit'
            WHEN 'Purchase' THEN 'Purchase'
            ELSE 'Usage'
          END as ChargeCategory,
          COALESCE(b.charge_type, 'Usage') as ChargeType,
          'Usage-Based' as ChargeFrequency,

          @v_org_slug as SubAccountId,
          COALESCE(b.subscription_name, b.subscription_id) as SubAccountName,

          b.meter_id as SkuId,
          JSON_OBJECT('meter_name', b.meter_name, 'meter_category', b.meter_category, 'service_tier', b.service_tier) as SkuPriceDetails,

          COALESCE(SAFE.PARSE_JSON(b.resource_tags_json), JSON_OBJECT()) as Tags,

          'cloud_azure_billing_raw_daily' as x_source_system,
          GENERATE_UUID() as x_source_record_id,
          CURRENT_TIMESTAMP() as x_updated_at,
          'azure' as x_cloud_provider,
          b.subscription_id as x_cloud_account_id,

          b.reservation_id as CommitmentDiscountId,
          b.reservation_name as CommitmentDiscountName,
          CASE
            WHEN b.reservation_id IS NOT NULL THEN 'Reservation'
            WHEN b.benefit_id IS NOT NULL THEN 'Savings Plan'
            ELSE NULL
          END as CommitmentDiscountType,

          -- 5-field hierarchy model (NEW design)
          h.entity_id as x_hierarchy_entity_id,
          h.entity_name as x_hierarchy_entity_name,
          h.level_code as x_hierarchy_level_code,
          h.path as x_hierarchy_path,
          h.path_names as x_hierarchy_path_names,
          CASE WHEN h.entity_id IS NOT NULL THEN CURRENT_TIMESTAMP() ELSE NULL END as x_hierarchy_validated_at,

          -- Lineage columns (REQUIRED)
          @p_pipeline_id as x_pipeline_id,
          @p_credential_id as x_credential_id,
          @p_date as x_pipeline_run_date,
          @p_run_id as x_run_id,
          CURRENT_TIMESTAMP() as x_ingested_at

        FROM `%s.%s.cloud_azure_billing_raw_daily` b
        LEFT JOIN hierarchy_lookup h ON h.entity_id = COALESCE(
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.cost_center'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.team'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.department'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.entity_id')
        )
        WHERE b.usage_date = @p_date
          AND b.cost_in_billing_currency > 0
      """, p_project_id, p_dataset_id, p_project_id, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date, p_pipeline_id AS p_pipeline_id, p_credential_id AS p_credential_id, p_run_id AS p_run_id, v_org_slug AS v_org_slug;

      SET v_rows_inserted = v_rows_inserted + @@row_count;
    END IF;

    -- ============================================================================
    -- OCI Billing to FOCUS 1.3
    -- Uses 5-field x_hierarchy_* model (NEW design)
    -- ============================================================================
    IF p_provider IN ('oci', 'all') THEN
      EXECUTE IMMEDIATE FORMAT("""
        INSERT INTO `%s.%s.cost_data_standard_1_3`
        (BillingAccountId, ChargePeriodStart, ChargePeriodEnd, BillingPeriodStart, BillingPeriodEnd,
         InvoiceIssuerName, ServiceProviderName, HostProviderName,
         ServiceCategory, ServiceName, ServiceSubcategory,
         ResourceId, ResourceName, ResourceType, RegionId, RegionName,
         ConsumedQuantity, ConsumedUnit, PricingCategory, PricingUnit,
         ContractedCost, EffectiveCost, BilledCost, ListCost, BillingCurrency,
         ChargeCategory, ChargeType, ChargeFrequency,
         SubAccountId, SubAccountName,
         SkuId, SkuPriceDetails,
         Tags,
         x_source_system, x_source_record_id, x_updated_at,
         x_cloud_provider, x_cloud_account_id,
         -- 5-field hierarchy model (NEW design)
         x_hierarchy_entity_id, x_hierarchy_entity_name,
         x_hierarchy_level_code, x_hierarchy_path, x_hierarchy_path_names,
         x_hierarchy_validated_at,
         x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
        -- CTE to lookup hierarchy from resource tags
        WITH hierarchy_lookup AS (
          SELECT
            entity_id,
            entity_name,
            level_code,
            path,
            path_names
          FROM `%s.organizations.org_hierarchy`
          WHERE org_slug = @v_org_slug
            AND end_date IS NULL
        )
        SELECT
          b.tenancy_id as BillingAccountId,
          TIMESTAMP(b.usage_date) as ChargePeriodStart,
          TIMESTAMP(DATE_ADD(b.usage_date, INTERVAL 1 DAY)) as ChargePeriodEnd,
          TIMESTAMP(DATE_TRUNC(b.usage_date, MONTH)) as BillingPeriodStart,
          TIMESTAMP(LAST_DAY(b.usage_date, MONTH)) as BillingPeriodEnd,

          'Oracle Cloud Infrastructure' as InvoiceIssuerName,
          'OCI' as ServiceProviderName,
          'Oracle' as HostProviderName,

          CASE
            WHEN b.service_name LIKE '%%COMPUTE%%' THEN 'Compute'
            WHEN b.service_name LIKE '%%STORAGE%%' THEN 'Storage'
            WHEN b.service_name LIKE '%%DATABASE%%' THEN 'Database'
            WHEN b.service_name LIKE '%%NETWORK%%' THEN 'Networking'
            ELSE 'Other'
          END as ServiceCategory,
          b.service_name as ServiceName,
          COALESCE(b.sku_name, 'Default') as ServiceSubcategory,

          b.resource_id as ResourceId,
          b.resource_name as ResourceName,
          'OCI Resource' as ResourceType,
          COALESCE(b.region, 'global') as RegionId,
          COALESCE(b.region, 'Global') as RegionName,

          CAST(b.usage_quantity AS NUMERIC) as ConsumedQuantity,
          b.unit as ConsumedUnit,
          CASE
            WHEN b.overage_flag = 'Y' THEN 'Overage'
            ELSE 'On-Demand'
          END as PricingCategory,
          b.unit as PricingUnit,

          CAST(b.cost AS NUMERIC) as ContractedCost,
          CAST(b.cost AS NUMERIC) as EffectiveCost,
          CAST(b.cost AS NUMERIC) as BilledCost,
          CAST(COALESCE(b.usage_quantity * b.unit_price, b.cost) AS NUMERIC) as ListCost,
          COALESCE(b.currency, 'USD') as BillingCurrency,

          'Usage' as ChargeCategory,
          'Usage' as ChargeType,
          'Usage-Based' as ChargeFrequency,

          @v_org_slug as SubAccountId,
          COALESCE(b.compartment_name, b.compartment_id) as SubAccountName,

          b.sku_part_number as SkuId,
          JSON_OBJECT('sku_name', b.sku_name, 'service_name', b.service_name, 'compartment_path', b.compartment_path) as SkuPriceDetails,

          COALESCE(SAFE.PARSE_JSON(b.freeform_tags_json), JSON_OBJECT()) as Tags,

          'cloud_oci_billing_raw_daily' as x_source_system,
          GENERATE_UUID() as x_source_record_id,
          CURRENT_TIMESTAMP() as x_updated_at,
          'oci' as x_cloud_provider,
          b.tenancy_id as x_cloud_account_id,

          -- 5-field hierarchy model (NEW design)
          h.entity_id as x_hierarchy_entity_id,
          h.entity_name as x_hierarchy_entity_name,
          h.level_code as x_hierarchy_level_code,
          h.path as x_hierarchy_path,
          h.path_names as x_hierarchy_path_names,
          CASE WHEN h.entity_id IS NOT NULL THEN CURRENT_TIMESTAMP() ELSE NULL END as x_hierarchy_validated_at,

          -- Lineage columns (REQUIRED)
          @p_pipeline_id as x_pipeline_id,
          @p_credential_id as x_credential_id,
          @p_date as x_pipeline_run_date,
          @p_run_id as x_run_id,
          CURRENT_TIMESTAMP() as x_ingested_at

        FROM `%s.%s.cloud_oci_billing_raw_daily` b
        LEFT JOIN hierarchy_lookup h ON h.entity_id = COALESCE(
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.freeform_tags_json), '$.cost_center'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.freeform_tags_json), '$.team'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.freeform_tags_json), '$.department'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.freeform_tags_json), '$.entity_id'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.defined_tags_json), '$.cost_center'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.defined_tags_json), '$.entity_id')
        )
        WHERE b.usage_date = @p_date
          AND b.cost > 0
      """, p_project_id, p_dataset_id, p_project_id, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date, p_pipeline_id AS p_pipeline_id, p_credential_id AS p_credential_id, p_run_id AS p_run_id, v_org_slug AS v_org_slug;

      SET v_rows_inserted = v_rows_inserted + @@row_count;
    END IF;

  COMMIT TRANSACTION;

  -- Log conversion result
  SELECT
    p_cost_date as cost_date,
    p_provider as provider,
    v_rows_inserted as rows_inserted,
    'cost_data_standard_1_3' as target_table,
    CURRENT_TIMESTAMP() as executed_at;

EXCEPTION WHEN ERROR THEN
  -- BigQuery auto-rollbacks on error inside transaction, so no explicit ROLLBACK needed
  -- PRO-011: Enhanced error message with provider and date context
  RAISE USING MESSAGE = CONCAT(
    'sp_cloud_1_convert_to_focus Failed for provider=', p_provider,
    ', cost_date=', CAST(p_cost_date AS STRING),
    ': ', @@error.message
  );
END;
