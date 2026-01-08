-- ================================================================================
-- PROCEDURE: sp_convert_cloud_costs_to_focus_1_3
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
-- ================================================================================

CREATE OR REPLACE PROCEDURE `{project_id}.organizations`.sp_convert_cloud_costs_to_focus_1_3(
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
    -- ============================================================================
    IF p_provider IN ('gcp', 'all') THEN
      EXECUTE IMMEDIATE FORMAT("""
        -- CTE to expand hierarchy from tags
        WITH hierarchy_lookup AS (
          SELECT
            entity_id,
            entity_name,
            CASE WHEN ARRAY_LENGTH(path_ids) >= 1 THEN path_ids[OFFSET(0)] ELSE NULL END AS level_1_id,
            CASE WHEN ARRAY_LENGTH(path_ids) >= 2 THEN path_ids[OFFSET(1)] ELSE NULL END AS level_2_id,
            CASE WHEN ARRAY_LENGTH(path_ids) >= 3 THEN path_ids[OFFSET(2)] ELSE NULL END AS level_3_id,
            CASE WHEN ARRAY_LENGTH(path_ids) >= 4 THEN path_ids[OFFSET(3)] ELSE NULL END AS level_4_id,
            CASE WHEN ARRAY_LENGTH(path_ids) >= 5 THEN path_ids[OFFSET(4)] ELSE NULL END AS level_5_id,
            CASE WHEN ARRAY_LENGTH(path_ids) >= 6 THEN path_ids[OFFSET(5)] ELSE NULL END AS level_6_id,
            CASE WHEN ARRAY_LENGTH(path_ids) >= 7 THEN path_ids[OFFSET(6)] ELSE NULL END AS level_7_id,
            CASE WHEN ARRAY_LENGTH(path_ids) >= 8 THEN path_ids[OFFSET(7)] ELSE NULL END AS level_8_id,
            CASE WHEN ARRAY_LENGTH(path_ids) >= 9 THEN path_ids[OFFSET(8)] ELSE NULL END AS level_9_id,
            CASE WHEN ARRAY_LENGTH(path_ids) >= 10 THEN path_ids[OFFSET(9)] ELSE NULL END AS level_10_id,
            CASE WHEN ARRAY_LENGTH(path_names) >= 1 THEN path_names[OFFSET(0)] ELSE NULL END AS level_1_name,
            CASE WHEN ARRAY_LENGTH(path_names) >= 2 THEN path_names[OFFSET(1)] ELSE NULL END AS level_2_name,
            CASE WHEN ARRAY_LENGTH(path_names) >= 3 THEN path_names[OFFSET(2)] ELSE NULL END AS level_3_name,
            CASE WHEN ARRAY_LENGTH(path_names) >= 4 THEN path_names[OFFSET(3)] ELSE NULL END AS level_4_name,
            CASE WHEN ARRAY_LENGTH(path_names) >= 5 THEN path_names[OFFSET(4)] ELSE NULL END AS level_5_name,
            CASE WHEN ARRAY_LENGTH(path_names) >= 6 THEN path_names[OFFSET(5)] ELSE NULL END AS level_6_name,
            CASE WHEN ARRAY_LENGTH(path_names) >= 7 THEN path_names[OFFSET(6)] ELSE NULL END AS level_7_name,
            CASE WHEN ARRAY_LENGTH(path_names) >= 8 THEN path_names[OFFSET(7)] ELSE NULL END AS level_8_name,
            CASE WHEN ARRAY_LENGTH(path_names) >= 9 THEN path_names[OFFSET(8)] ELSE NULL END AS level_9_name,
            CASE WHEN ARRAY_LENGTH(path_names) >= 10 THEN path_names[OFFSET(9)] ELSE NULL END AS level_10_name
          FROM `%s.organizations.org_hierarchy`
          WHERE org_slug = @v_org_slug
            AND end_date IS NULL
        )
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
         -- Issue #3 FIX: snake_case for x_* fields
         x_cloud_provider, x_cloud_account_id,
         -- 10-level hierarchy extension fields (v15.0) - populated from resource tags
         x_hierarchy_level_1_id, x_hierarchy_level_1_name,
         x_hierarchy_level_2_id, x_hierarchy_level_2_name,
         x_hierarchy_level_3_id, x_hierarchy_level_3_name,
         x_hierarchy_level_4_id, x_hierarchy_level_4_name,
         x_hierarchy_level_5_id, x_hierarchy_level_5_name,
         x_hierarchy_level_6_id, x_hierarchy_level_6_name,
         x_hierarchy_level_7_id, x_hierarchy_level_7_name,
         x_hierarchy_level_8_id, x_hierarchy_level_8_name,
         x_hierarchy_level_9_id, x_hierarchy_level_9_name,
         x_hierarchy_level_10_id, x_hierarchy_level_10_name,
         x_hierarchy_validated_at,
         x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
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

          CAST(cost AS NUMERIC) as ContractedCost,
          CAST(cost AS NUMERIC) as EffectiveCost,
          CAST(cost AS NUMERIC) as BilledCost,
          CAST(COALESCE(cost_at_list, cost) AS NUMERIC) as ListCost,
          COALESCE(currency, 'USD') as BillingCurrency,

          'Usage' as ChargeCategory,
          COALESCE(cost_type, 'Usage') as ChargeType,
          'Usage-Based' as ChargeFrequency,

          @v_org_slug as SubAccountId,
          COALESCE(project_name, project_id) as SubAccountName,

          sku_id as SkuId,
          JSON_OBJECT('sku_description', sku_description, 'service_id', service_id) as SkuPriceDetails,

          COALESCE(SAFE.PARSE_JSON(labels_json), JSON_OBJECT()) as Tags,

          'cloud_gcp_billing_raw_daily' as x_source_system,
          GENERATE_UUID() as x_source_record_id,
          CURRENT_TIMESTAMP() as x_updated_at,
          -- Issue #3 FIX: snake_case for x_* fields
          'gcp' as x_cloud_provider,
          billing_account_id as x_cloud_account_id,
          -- 10-level hierarchy from resource tags (v15.0)
          -- Looks for 'cost_center', 'team', 'department', or 'entity_id' labels
          h.level_1_id as x_hierarchy_level_1_id,
          h.level_1_name as x_hierarchy_level_1_name,
          h.level_2_id as x_hierarchy_level_2_id,
          h.level_2_name as x_hierarchy_level_2_name,
          h.level_3_id as x_hierarchy_level_3_id,
          h.level_3_name as x_hierarchy_level_3_name,
          h.level_4_id as x_hierarchy_level_4_id,
          h.level_4_name as x_hierarchy_level_4_name,
          h.level_5_id as x_hierarchy_level_5_id,
          h.level_5_name as x_hierarchy_level_5_name,
          h.level_6_id as x_hierarchy_level_6_id,
          h.level_6_name as x_hierarchy_level_6_name,
          h.level_7_id as x_hierarchy_level_7_id,
          h.level_7_name as x_hierarchy_level_7_name,
          h.level_8_id as x_hierarchy_level_8_id,
          h.level_8_name as x_hierarchy_level_8_name,
          h.level_9_id as x_hierarchy_level_9_id,
          h.level_9_name as x_hierarchy_level_9_name,
          h.level_10_id as x_hierarchy_level_10_id,
          h.level_10_name as x_hierarchy_level_10_name,
          CASE WHEN h.level_1_id IS NOT NULL THEN CURRENT_TIMESTAMP() ELSE NULL END as x_hierarchy_validated_at,
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
      """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date, p_pipeline_id AS p_pipeline_id, p_credential_id AS p_credential_id, p_run_id AS p_run_id, v_org_slug AS v_org_slug;

      SET v_rows_inserted = v_rows_inserted + @@row_count;
    END IF;

    -- ============================================================================
    -- AWS Billing to FOCUS 1.3
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
         -- Issue #3 FIX: snake_case for x_* fields
         x_cloud_provider, x_cloud_account_id,
         CommitmentDiscountId, CommitmentDiscountType,
         x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
        SELECT
          payer_account_id as BillingAccountId,
          COALESCE(usage_start_time, TIMESTAMP(usage_date)) as ChargePeriodStart,
          COALESCE(usage_end_time, TIMESTAMP(DATE_ADD(usage_date, INTERVAL 1 DAY))) as ChargePeriodEnd,
          TIMESTAMP(billing_period_start) as BillingPeriodStart,
          TIMESTAMP(billing_period_end) as BillingPeriodEnd,

          'Amazon Web Services' as InvoiceIssuerName,
          'AWS' as ServiceProviderName,
          'AWS' as HostProviderName,

          CASE
            WHEN service_code LIKE '%%EC2%%' OR product_code LIKE '%%EC2%%' THEN 'Compute'
            WHEN service_code LIKE '%%S3%%' THEN 'Storage'
            WHEN service_code LIKE '%%RDS%%' THEN 'Database'
            WHEN service_code LIKE '%%Lambda%%' THEN 'Compute'
            ELSE 'Other'
          END as ServiceCategory,
          COALESCE(product_name, service_code, product_code) as ServiceName,
          COALESCE(operation, 'Default') as ServiceSubcategory,

          resource_id as ResourceId,
          resource_id as ResourceName,
          COALESCE(usage_type, 'AWS Resource') as ResourceType,
          COALESCE(region, 'global') as RegionId,
          COALESCE(region, 'Global') as RegionName,

          CAST(usage_amount AS NUMERIC) as ConsumedQuantity,
          usage_unit as ConsumedUnit,
          CASE
            WHEN reservation_arn IS NOT NULL THEN 'Committed'
            WHEN savings_plan_arn IS NOT NULL THEN 'Committed'
            ELSE 'On-Demand'
          END as PricingCategory,
          pricing_unit as PricingUnit,

          CAST(COALESCE(net_unblended_cost, unblended_cost) AS NUMERIC) as ContractedCost,
          CAST(COALESCE(net_unblended_cost, unblended_cost) AS NUMERIC) as EffectiveCost,
          CAST(unblended_cost AS NUMERIC) as BilledCost,
          CAST(COALESCE(public_on_demand_cost, unblended_cost) AS NUMERIC) as ListCost,
          COALESCE(currency, 'USD') as BillingCurrency,

          CASE line_item_type
            WHEN 'Tax' THEN 'Tax'
            WHEN 'Credit' THEN 'Credit'
            ELSE 'Usage'
          END as ChargeCategory,
          COALESCE(line_item_type, 'Usage') as ChargeType,
          'Usage-Based' as ChargeFrequency,

          @v_org_slug as SubAccountId,
          COALESCE(linked_account_name, linked_account_id) as SubAccountName,

          CONCAT(product_code, '/', usage_type) as SkuId,
          JSON_OBJECT('service_code', service_code, 'product_code', product_code, 'usage_type', usage_type) as SkuPriceDetails,

          COALESCE(SAFE.PARSE_JSON(resource_tags_json), JSON_OBJECT()) as Tags,

          'cloud_aws_billing_raw_daily' as x_source_system,
          GENERATE_UUID() as x_source_record_id,
          CURRENT_TIMESTAMP() as x_updated_at,
          -- Issue #3 FIX: snake_case for x_* fields
          'aws' as x_cloud_provider,
          payer_account_id as x_cloud_account_id,

          COALESCE(reservation_arn, savings_plan_arn) as CommitmentDiscountId,
          CASE
            WHEN reservation_arn IS NOT NULL THEN 'Reserved Instance'
            WHEN savings_plan_arn IS NOT NULL THEN 'Savings Plan'
            ELSE NULL
          END as CommitmentDiscountType,
          -- Lineage columns (REQUIRED)
          @p_pipeline_id as x_pipeline_id,
          @p_credential_id as x_credential_id,
          @p_date as x_pipeline_run_date,
          @p_run_id as x_run_id,
          CURRENT_TIMESTAMP() as x_ingested_at

        FROM `%s.%s.cloud_aws_billing_raw_daily`
        WHERE usage_date = @p_date
          AND unblended_cost > 0
      """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date, p_pipeline_id AS p_pipeline_id, p_credential_id AS p_credential_id, p_run_id AS p_run_id, v_org_slug AS v_org_slug;

      SET v_rows_inserted = v_rows_inserted + @@row_count;
    END IF;

    -- ============================================================================
    -- Azure Billing to FOCUS 1.3
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
         -- Issue #3 FIX: snake_case for x_* fields
         x_cloud_provider, x_cloud_account_id,
         CommitmentDiscountId, CommitmentDiscountName,
         x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
        SELECT
          subscription_id as BillingAccountId,
          TIMESTAMP(usage_date) as ChargePeriodStart,
          TIMESTAMP(DATE_ADD(usage_date, INTERVAL 1 DAY)) as ChargePeriodEnd,
          TIMESTAMP(billing_period_start) as BillingPeriodStart,
          TIMESTAMP(billing_period_end) as BillingPeriodEnd,

          'Microsoft Azure' as InvoiceIssuerName,
          'Azure' as ServiceProviderName,
          'Microsoft' as HostProviderName,

          COALESCE(meter_category, 'Other') as ServiceCategory,
          COALESCE(service_name, meter_category) as ServiceName,
          COALESCE(meter_subcategory, 'Default') as ServiceSubcategory,

          resource_id as ResourceId,
          resource_name as ResourceName,
          COALESCE(resource_type, 'Azure Resource') as ResourceType,
          COALESCE(resource_location, 'global') as RegionId,
          COALESCE(resource_location, 'Global') as RegionName,

          CAST(usage_quantity AS NUMERIC) as ConsumedQuantity,
          unit_of_measure as ConsumedUnit,
          COALESCE(pricing_model, 'On-Demand') as PricingCategory,
          unit_of_measure as PricingUnit,

          CAST(cost_in_billing_currency AS NUMERIC) as ContractedCost,
          CAST(cost_in_billing_currency AS NUMERIC) as EffectiveCost,
          CAST(cost_in_billing_currency AS NUMERIC) as BilledCost,
          CAST(COALESCE(usage_quantity * unit_price, cost_in_billing_currency) AS NUMERIC) as ListCost,
          COALESCE(billing_currency, 'USD') as BillingCurrency,

          CASE charge_type
            WHEN 'Refund' THEN 'Credit'
            WHEN 'Purchase' THEN 'Purchase'
            ELSE 'Usage'
          END as ChargeCategory,
          COALESCE(charge_type, 'Usage') as ChargeType,
          'Usage-Based' as ChargeFrequency,

          @v_org_slug as SubAccountId,
          COALESCE(subscription_name, subscription_id) as SubAccountName,

          meter_id as SkuId,
          JSON_OBJECT('meter_name', meter_name, 'meter_category', meter_category, 'service_tier', service_tier) as SkuPriceDetails,

          COALESCE(SAFE.PARSE_JSON(resource_tags_json), JSON_OBJECT()) as Tags,

          'cloud_azure_billing_raw_daily' as x_source_system,
          GENERATE_UUID() as x_source_record_id,
          CURRENT_TIMESTAMP() as x_updated_at,
          -- Issue #3 FIX: snake_case for x_* fields
          'azure' as x_cloud_provider,
          subscription_id as x_cloud_account_id,

          reservation_id as CommitmentDiscountId,
          reservation_name as CommitmentDiscountName,
          -- Lineage columns (REQUIRED)
          @p_pipeline_id as x_pipeline_id,
          @p_credential_id as x_credential_id,
          @p_date as x_pipeline_run_date,
          @p_run_id as x_run_id,
          CURRENT_TIMESTAMP() as x_ingested_at

        FROM `%s.%s.cloud_azure_billing_raw_daily`
        WHERE usage_date = @p_date
          AND cost_in_billing_currency > 0
      """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date, p_pipeline_id AS p_pipeline_id, p_credential_id AS p_credential_id, p_run_id AS p_run_id, v_org_slug AS v_org_slug;

      SET v_rows_inserted = v_rows_inserted + @@row_count;
    END IF;

    -- ============================================================================
    -- OCI Billing to FOCUS 1.3
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
         -- Issue #3 FIX: snake_case for x_* fields
         x_cloud_provider, x_cloud_account_id,
         -- 10-level hierarchy extension fields (v15.0) - populated from resource tags
         x_hierarchy_level_1_id, x_hierarchy_level_1_name,
         x_hierarchy_level_2_id, x_hierarchy_level_2_name,
         x_hierarchy_level_3_id, x_hierarchy_level_3_name,
         x_hierarchy_level_4_id, x_hierarchy_level_4_name,
         x_hierarchy_level_5_id, x_hierarchy_level_5_name,
         x_hierarchy_level_6_id, x_hierarchy_level_6_name,
         x_hierarchy_level_7_id, x_hierarchy_level_7_name,
         x_hierarchy_level_8_id, x_hierarchy_level_8_name,
         x_hierarchy_level_9_id, x_hierarchy_level_9_name,
         x_hierarchy_level_10_id, x_hierarchy_level_10_name,
         x_hierarchy_validated_at,
                  x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
        SELECT
          tenancy_id as BillingAccountId,
          TIMESTAMP(usage_date) as ChargePeriodStart,
          TIMESTAMP(DATE_ADD(usage_date, INTERVAL 1 DAY)) as ChargePeriodEnd,
          TIMESTAMP(DATE_TRUNC(usage_date, MONTH)) as BillingPeriodStart,
          TIMESTAMP(LAST_DAY(usage_date, MONTH)) as BillingPeriodEnd,

          'Oracle Cloud Infrastructure' as InvoiceIssuerName,
          'OCI' as ServiceProviderName,
          'Oracle' as HostProviderName,

          CASE
            WHEN service_name LIKE '%%COMPUTE%%' THEN 'Compute'
            WHEN service_name LIKE '%%STORAGE%%' THEN 'Storage'
            WHEN service_name LIKE '%%DATABASE%%' THEN 'Database'
            WHEN service_name LIKE '%%NETWORK%%' THEN 'Networking'
            ELSE 'Other'
          END as ServiceCategory,
          service_name as ServiceName,
          COALESCE(sku_name, 'Default') as ServiceSubcategory,

          resource_id as ResourceId,
          resource_name as ResourceName,
          'OCI Resource' as ResourceType,
          COALESCE(region, 'global') as RegionId,
          COALESCE(region, 'Global') as RegionName,

          CAST(usage_quantity AS NUMERIC) as ConsumedQuantity,
          unit as ConsumedUnit,
          CASE
            WHEN overage_flag = 'Y' THEN 'Overage'
            ELSE 'On-Demand'
          END as PricingCategory,
          unit as PricingUnit,

          CAST(cost AS NUMERIC) as ContractedCost,
          CAST(cost AS NUMERIC) as EffectiveCost,
          CAST(cost AS NUMERIC) as BilledCost,
          CAST(COALESCE(usage_quantity * unit_price, cost) AS NUMERIC) as ListCost,
          COALESCE(currency, 'USD') as BillingCurrency,

          'Usage' as ChargeCategory,
          'Usage' as ChargeType,
          'Usage-Based' as ChargeFrequency,

          @v_org_slug as SubAccountId,
          COALESCE(compartment_name, compartment_id) as SubAccountName,

          sku_part_number as SkuId,
          JSON_OBJECT('sku_name', sku_name, 'service_name', service_name, 'compartment_path', compartment_path) as SkuPriceDetails,

          COALESCE(SAFE.PARSE_JSON(freeform_tags_json), JSON_OBJECT()) as Tags,

          'cloud_oci_billing_raw_daily' as x_source_system,
          GENERATE_UUID() as x_source_record_id,
          CURRENT_TIMESTAMP() as x_updated_at,
          -- Issue #3 FIX: snake_case for x_* fields
          'oci' as x_cloud_provider,
          tenancy_id as x_cloud_account_id,
          -- Lineage columns (REQUIRED)
          @p_pipeline_id as x_pipeline_id,
          @p_credential_id as x_credential_id,
          @p_date as x_pipeline_run_date,
          @p_run_id as x_run_id,
          CURRENT_TIMESTAMP() as x_ingested_at

        FROM `%s.%s.cloud_oci_billing_raw_daily`
        WHERE usage_date = @p_date
          AND cost > 0
      """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
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
  RAISE USING MESSAGE = CONCAT('sp_convert_cloud_costs_to_focus_1_3 Failed: ', @@error.message);
END;
