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
--   p_start_date: Start date for date range conversion
--   p_end_date: End date for date range conversion (if NULL, uses p_start_date for single day)
--   p_provider: Cloud provider ('gcp', 'aws', 'azure', 'oci', or 'all')
--
-- OUTPUT: Records inserted into cost_data_standard_1_3 table
--
-- USAGE:
--   -- Single date:
--   CALL sp_cloud_1_convert_to_focus('project', 'dataset', DATE('2026-01-01'), NULL, 'gcp', 'pipe', 'cred', 'run')
--   -- Date range (60 days):
--   CALL sp_cloud_1_convert_to_focus('project', 'dataset', DATE('2025-11-24'), DATE('2026-01-23'), 'gcp', 'pipe', 'cred', 'run')
--
-- HIERARCHY: Uses 5-field x_hierarchy_* model (entity_id, entity_name, level_code, path, path_names)
-- ================================================================================

CREATE OR REPLACE PROCEDURE `{project_id}.organizations`.sp_cloud_1_convert_to_focus(
  p_project_id STRING,
  p_dataset_id STRING,
  p_start_date DATE,
  p_end_date DATE,  -- If NULL, uses p_start_date (single date mode)
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
  DECLARE v_effective_end_date DATE;

  -- If end_date is NULL, use start_date (single date mode for backward compatibility)
  SET v_effective_end_date = COALESCE(p_end_date, p_start_date);

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
  ASSERT p_start_date IS NOT NULL AS "p_start_date cannot be NULL";
  ASSERT p_provider IN ('gcp', 'aws', 'azure', 'oci', 'all') AS "p_provider must be gcp, aws, azure, oci, or all";
  ASSERT p_pipeline_id IS NOT NULL AS "p_pipeline_id cannot be NULL";
  ASSERT p_credential_id IS NOT NULL AS "p_credential_id cannot be NULL";
  ASSERT p_run_id IS NOT NULL AS "p_run_id cannot be NULL";

  BEGIN TRANSACTION;

    -- Delete existing cloud FOCUS records for date range and provider(s)
    IF p_provider = 'all' THEN
      EXECUTE IMMEDIATE FORMAT("""
        DELETE FROM `%s.%s.cost_data_standard_1_3`
        WHERE DATE(ChargePeriodStart) BETWEEN @p_start AND @p_end
          AND x_source_system IN ('cloud_gcp_billing_raw_daily', 'cloud_aws_billing_raw_daily',
                                  'cloud_azure_billing_raw_daily', 'cloud_oci_billing_raw_daily')
      """, p_project_id, p_dataset_id)
      USING p_start_date AS p_start, v_effective_end_date AS p_end;
    ELSE
      EXECUTE IMMEDIATE FORMAT("""
        DELETE FROM `%s.%s.cost_data_standard_1_3`
        WHERE DATE(ChargePeriodStart) BETWEEN @p_start AND @p_end
          AND x_source_system = CONCAT('cloud_', @p_provider, '_billing_raw_daily')
      """, p_project_id, p_dataset_id)
      USING p_start_date AS p_start, v_effective_end_date AS p_end, p_provider AS p_provider;
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
          -- Convert ARRAY<STRING> to STRING (org_hierarchy.path_names is REPEATED)
          ARRAY_TO_STRING(h.path_names, ' > ') as x_hierarchy_path_names,
          CASE WHEN h.entity_id IS NOT NULL THEN CURRENT_TIMESTAMP() ELSE NULL END as x_hierarchy_validated_at,

          -- Lineage columns (REQUIRED)
          @p_pipeline_id as x_pipeline_id,
          @p_credential_id as x_credential_id,
          @p_start as x_pipeline_run_date,
          @p_run_id as x_run_id,
          CURRENT_TIMESTAMP() as x_ingested_at

        FROM `%s.%s.cloud_gcp_billing_raw_daily` b
        LEFT JOIN hierarchy_lookup h ON h.entity_id = COALESCE(
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.cost_center'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.team'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.department'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.entity_id')
        )
        WHERE DATE(b.usage_start_time) BETWEEN @p_start AND @p_end
          AND b.cost > 0
      """, p_project_id, p_dataset_id, p_project_id, p_project_id, p_dataset_id)
      USING p_start_date AS p_start, v_effective_end_date AS p_end, p_pipeline_id AS p_pipeline_id, p_credential_id AS p_credential_id, p_run_id AS p_run_id, v_org_slug AS v_org_slug;

      SET v_rows_inserted = v_rows_inserted + @@row_count;
    END IF;

    -- ============================================================================
    -- AWS Billing to FOCUS 1.3
    -- Uses 5-field x_hierarchy_* model (NEW design)
    -- FOCUS 1.3 compliant: Includes pricing details, discounts, commitment info
    --
    -- AWS CUR FIELD MAPPINGS:
    -- - BilledCost: unblended_cost (gross cost before credits)
    -- - EffectiveCost: net_unblended_cost (net cost after credits/discounts)
    -- - ListCost: public_on_demand_cost (full retail price)
    -- - ContractedCost: amortized_cost (RI/SP amortized)
    -- - ConsumedQuantity: usage_amount
    -- - ConsumedUnit: usage_unit
    -- - ChargeCategory: Credit for negative costs, Tax for tax line items
    -- - SubAccountId: linked_account_id (member account in AWS Organizations)
    -- ============================================================================
    IF p_provider IN ('aws', 'all') THEN
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

          -- ServiceCategory: Map AWS product families to FOCUS categories
          CASE
            WHEN UPPER(COALESCE(b.product_family, b.service_code)) LIKE '%%COMPUTE%%' THEN 'Compute'
            WHEN b.service_code IN ('AmazonEC2', 'AWSLambda', 'AmazonECS', 'AmazonEKS') THEN 'Compute'
            WHEN UPPER(COALESCE(b.product_family, b.service_code)) LIKE '%%STORAGE%%' THEN 'Storage'
            WHEN b.service_code IN ('AmazonS3', 'AmazonEBS', 'AmazonEFS', 'AmazonGlacier') THEN 'Storage'
            WHEN UPPER(COALESCE(b.product_family, b.service_code)) LIKE '%%DATABASE%%' THEN 'Database'
            WHEN b.service_code IN ('AmazonRDS', 'AmazonDynamoDB', 'AmazonRedshift', 'AmazonElastiCache') THEN 'Database'
            WHEN UPPER(COALESCE(b.product_family, b.service_code)) LIKE '%%NETWORK%%' THEN 'Networking'
            WHEN b.service_code IN ('AmazonVPC', 'AmazonCloudFront', 'AWSDirectConnect', 'AmazonRoute53') THEN 'Networking'
            WHEN b.service_code LIKE '%%AI%%' OR b.service_code LIKE '%%ML%%' OR b.service_code IN ('AmazonSageMaker', 'AmazonBedrock') THEN 'AI/ML'
            ELSE 'Other'
          END as ServiceCategory,
          COALESCE(b.product_name, b.service_code, b.product_code) as ServiceName,
          COALESCE(b.operation, 'Default') as ServiceSubcategory,

          b.resource_id as ResourceId,
          COALESCE(b.resource_name, b.resource_id) as ResourceName,
          COALESCE(b.usage_type, 'AWS Resource') as ResourceType,
          COALESCE(b.region, 'global') as RegionId,
          COALESCE(b.region, 'Global') as RegionName,

          -- Usage metrics
          CAST(b.usage_amount AS NUMERIC) as ConsumedQuantity,
          b.usage_unit as ConsumedUnit,
          CASE
            WHEN b.reservation_arn IS NOT NULL THEN 'Committed'
            WHEN b.savings_plan_arn IS NOT NULL THEN 'Committed'
            WHEN b.line_item_type = 'SavingsPlanCoveredUsage' THEN 'Committed'
            WHEN b.line_item_type = 'DiscountedUsage' THEN 'Committed'
            ELSE 'On-Demand'
          END as PricingCategory,
          b.pricing_unit as PricingUnit,

          -- FOCUS 1.3: Pricing details from AWS CUR
          CAST(COALESCE(b.pricing_quantity, b.usage_amount) AS NUMERIC) as PricingQuantity,
          CAST(b.public_on_demand_rate AS NUMERIC) as ListUnitPrice,
          CAST(b.unblended_rate AS NUMERIC) as ContractedUnitPrice,

          -- FOCUS 1.3: Cost calculations
          -- ContractedCost = amortized cost (spreads RI/SP upfront across usage)
          CAST(COALESCE(b.amortized_cost, b.unblended_cost) AS NUMERIC) as ContractedCost,
          -- EffectiveCost = net cost after credits/discounts (what you actually pay)
          CAST(COALESCE(b.net_unblended_cost, b.unblended_cost) AS NUMERIC) as EffectiveCost,
          -- BilledCost = gross unblended cost (before credits)
          CAST(b.unblended_cost AS NUMERIC) as BilledCost,
          -- ListCost = public on-demand cost (without any discounts)
          CAST(COALESCE(b.public_on_demand_cost, b.unblended_cost) AS NUMERIC) as ListCost,
          COALESCE(b.currency, 'USD') as BillingCurrency,

          -- ChargeCategory: Map AWS line_item_type to FOCUS categories
          CASE b.line_item_type
            WHEN 'Tax' THEN 'Tax'
            WHEN 'Credit' THEN 'Credit'
            WHEN 'Refund' THEN 'Credit'
            WHEN 'Fee' THEN 'Fee'
            WHEN 'RIFee' THEN 'Purchase'
            WHEN 'SavingsPlanRecurringFee' THEN 'Purchase'
            WHEN 'SavingsPlanUpfrontFee' THEN 'Purchase'
            ELSE 'Usage'
          END as ChargeCategory,
          -- ChargeClass: Correction for credits/refunds
          CASE
            WHEN b.line_item_type IN ('Credit', 'Refund') THEN 'Correction'
            WHEN b.unblended_cost < 0 THEN 'Correction'
            ELSE NULL
          END as ChargeClass,
          COALESCE(b.line_item_type, 'Usage') as ChargeType,
          CASE
            WHEN b.line_item_type IN ('RIFee', 'SavingsPlanRecurringFee') THEN 'Recurring'
            WHEN b.line_item_type = 'SavingsPlanUpfrontFee' THEN 'One-Time'
            ELSE 'Usage-Based'
          END as ChargeFrequency,

          -- SubAccount: AWS linked account (member account in AWS Organizations)
          b.linked_account_id as SubAccountId,
          COALESCE(b.linked_account_name, b.linked_account_id) as SubAccountName,

          -- SKU details
          CONCAT(COALESCE(b.product_code, 'AWS'), '/', COALESCE(b.usage_type, 'Unknown')) as SkuId,
          -- SkuPriceDetails: Include discounts, RI/SP info, and product attributes
          JSON_OBJECT(
            'service_code', b.service_code,
            'product_code', b.product_code,
            'usage_type', b.usage_type,
            'operation', b.operation,
            'product_family', b.product_family,
            'instance_type', b.product_instance_type,
            'operating_system', b.product_operating_system,
            'tenancy', b.product_tenancy,
            'discount_edp_amount', b.discount_edp_amount,
            'discount_private_rate_amount', b.discount_private_rate_amount,
            'discount_bundled_amount', b.discount_bundled_amount,
            'discount_total_amount', b.discount_total_amount,
            'invoice_id', b.invoice_id,
            'bill_type', b.bill_type,
            'line_item_description', b.line_item_description
          ) as SkuPriceDetails,

          COALESCE(SAFE.PARSE_JSON(b.resource_tags_json), JSON_OBJECT()) as Tags,

          'cloud_aws_billing_raw_daily' as x_source_system,
          GENERATE_UUID() as x_source_record_id,
          CURRENT_TIMESTAMP() as x_updated_at,
          'aws' as x_cloud_provider,
          b.payer_account_id as x_cloud_account_id,

          -- Commitment discounts (RI or Savings Plan)
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
          -- Convert ARRAY<STRING> to STRING (org_hierarchy.path_names is REPEATED)
          ARRAY_TO_STRING(h.path_names, ' > ') as x_hierarchy_path_names,
          CASE WHEN h.entity_id IS NOT NULL THEN CURRENT_TIMESTAMP() ELSE NULL END as x_hierarchy_validated_at,

          -- Lineage columns (REQUIRED)
          @p_pipeline_id as x_pipeline_id,
          @p_credential_id as x_credential_id,
          @p_start as x_pipeline_run_date,
          @p_run_id as x_run_id,
          CURRENT_TIMESTAMP() as x_ingested_at

        FROM `%s.%s.cloud_aws_billing_raw_daily` b
        LEFT JOIN hierarchy_lookup h ON h.entity_id = COALESCE(
          -- Look for hierarchy entity in resource tags (common patterns)
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.cost_center'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.CostCenter'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.team'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.Team'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.department'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.Department'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.entity_id'),
          -- Also check AWS Cost Categories for hierarchy
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.cost_category_json), '$.cost_center'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.cost_category_json), '$.CostCenter'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.cost_category_json), '$.entity_id')
        )
        WHERE b.usage_date BETWEEN @p_start AND @p_end
          -- Include all line items (positive costs, credits, taxes)
          -- Credits have negative unblended_cost
          AND (b.unblended_cost != 0 OR b.line_item_type IN ('Credit', 'Tax', 'Refund', 'Fee'))
      """, p_project_id, p_dataset_id, p_project_id, p_project_id, p_dataset_id)
      USING p_start_date AS p_start, v_effective_end_date AS p_end, p_pipeline_id AS p_pipeline_id, p_credential_id AS p_credential_id, p_run_id AS p_run_id, v_org_slug AS v_org_slug;

      SET v_rows_inserted = v_rows_inserted + @@row_count;
    END IF;

    -- ============================================================================
    -- Azure Billing to FOCUS 1.3
    -- Uses 5-field x_hierarchy_* model (NEW design)
    -- FOCUS 1.3 compliant: Includes pricing details, credits, and commitment discounts
    --
    -- AZURE FIELD MAPPINGS:
    -- - BilledCost: cost_in_billing_currency (gross cost before credits)
    -- - EffectiveCost: cost_in_billing_currency - azure_credit_applied (net cost)
    -- - ListCost: usage_quantity * payg_price (pay-as-you-go pricing)
    -- - ConsumedQuantity: usage_quantity
    -- - ConsumedUnit: unit_of_measure
    -- - PricingCategory: pricing_model (OnDemand, Reservation, SavingsPlan, Spot)
    -- - ChargeCategory: Mapped from charge_type (Usage, Credit, Tax, Purchase, Refund)
    -- - SubAccountId: subscription_id (Azure subscription = FOCUS SubAccount)
    -- ============================================================================
    IF p_provider IN ('azure', 'all') THEN
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
          -- BillingAccountId: Use billing_account_id if available, else subscription_id
          COALESCE(b.billing_account_id, b.subscription_id) as BillingAccountId,

          -- Charge period from usage timestamps or derive from usage_date
          COALESCE(b.usage_start_time, TIMESTAMP(b.usage_date)) as ChargePeriodStart,
          COALESCE(b.usage_end_time, TIMESTAMP(DATE_ADD(b.usage_date, INTERVAL 1 DAY))) as ChargePeriodEnd,
          TIMESTAMP(b.billing_period_start) as BillingPeriodStart,
          TIMESTAMP(b.billing_period_end) as BillingPeriodEnd,

          -- Invoice/Service Provider: Handle marketplace vs first-party
          CASE
            WHEN b.publisher_type = 'Marketplace' THEN COALESCE(b.publisher_name, 'Azure Marketplace')
            ELSE 'Microsoft Azure'
          END as InvoiceIssuerName,
          CASE
            WHEN b.publisher_type = 'Marketplace' THEN COALESCE(b.publisher_name, 'Third Party')
            ELSE 'Microsoft Azure'
          END as ServiceProviderName,
          'Microsoft' as HostProviderName,

          -- Service categorization using meter_category (Azure's service taxonomy)
          CASE
            WHEN b.meter_category IN ('Virtual Machines', 'Container Instances', 'Azure App Service', 'Functions') THEN 'Compute'
            WHEN b.meter_category IN ('Storage', 'Bandwidth', 'Data Lake Storage') THEN 'Storage'
            WHEN b.meter_category IN ('Azure Cosmos DB', 'SQL Database', 'Azure Database for PostgreSQL', 'Azure Database for MySQL') THEN 'Database'
            WHEN b.meter_category IN ('Virtual Network', 'Load Balancer', 'VPN Gateway', 'ExpressRoute', 'Azure DNS') THEN 'Networking'
            WHEN b.meter_category IN ('Key Vault', 'Microsoft Defender for Cloud', 'Azure Active Directory') THEN 'Security'
            WHEN b.meter_category IN ('Azure OpenAI Service', 'Cognitive Services', 'Machine Learning') THEN 'AI/ML'
            ELSE COALESCE(b.service_family, 'Other')
          END as ServiceCategory,
          COALESCE(b.service_name, b.meter_category, b.consumed_service) as ServiceName,
          COALESCE(b.meter_subcategory, b.meter_name, 'Default') as ServiceSubcategory,

          -- Resource identification
          b.resource_id as ResourceId,
          b.resource_name as ResourceName,
          COALESCE(b.resource_type, 'Azure Resource') as ResourceType,
          COALESCE(b.resource_location, b.meter_region, 'global') as RegionId,
          COALESCE(b.resource_location, b.meter_region, 'Global') as RegionName,

          -- Usage metrics (FOCUS 1.3: ConsumedQuantity, ConsumedUnit)
          CAST(b.usage_quantity AS NUMERIC) as ConsumedQuantity,
          b.unit_of_measure as ConsumedUnit,

          -- Pricing category: Map Azure pricing_model to FOCUS PricingCategory
          CASE b.pricing_model
            WHEN 'Reservation' THEN 'Committed'
            WHEN 'SavingsPlan' THEN 'Committed'
            WHEN 'Spot' THEN 'Dynamic'
            ELSE 'On-Demand'
          END as PricingCategory,
          COALESCE(b.pricing_unit, b.unit_of_measure) as PricingUnit,

          -- FOCUS 1.3: Pricing details
          CAST(COALESCE(b.pricing_quantity, b.usage_quantity) AS NUMERIC) as PricingQuantity,
          CAST(COALESCE(b.payg_price, b.unit_price) AS NUMERIC) as ListUnitPrice,
          CAST(b.effective_price AS NUMERIC) as ContractedUnitPrice,

          -- FOCUS 1.3 Cost Fields:
          -- ContractedCost: Cost at negotiated/effective price
          CAST(b.cost_in_billing_currency AS NUMERIC) as ContractedCost,
          -- EffectiveCost: Net cost after credits applied (credits reduce cost)
          CAST(b.cost_in_billing_currency - COALESCE(b.azure_credit_applied, 0) AS NUMERIC) as EffectiveCost,
          -- BilledCost: Gross cost as it appears on invoice
          CAST(b.cost_in_billing_currency AS NUMERIC) as BilledCost,
          -- ListCost: What it would cost at pay-as-you-go pricing
          CAST(COALESCE(b.usage_quantity * b.payg_price, b.usage_quantity * b.unit_price, b.cost_in_billing_currency) AS NUMERIC) as ListCost,
          COALESCE(b.billing_currency, 'USD') as BillingCurrency,

          -- FOCUS 1.3 ChargeCategory: Standardize Azure charge_type
          CASE b.charge_type
            WHEN 'Usage' THEN 'Usage'
            WHEN 'Purchase' THEN 'Purchase'
            WHEN 'Refund' THEN 'Credit'
            WHEN 'Credit' THEN 'Credit'
            WHEN 'RoundingAdjustment' THEN 'Adjustment'
            WHEN 'UnusedReservation' THEN 'Usage'
            WHEN 'UnusedSavingsPlan' THEN 'Usage'
            WHEN 'Tax' THEN 'Tax'
            ELSE 'Usage'
          END as ChargeCategory,
          -- ChargeClass: Identify corrections/adjustments
          CASE
            WHEN b.charge_type IN ('Refund', 'RoundingAdjustment') THEN 'Correction'
            ELSE NULL
          END as ChargeClass,
          COALESCE(b.charge_type, 'Usage') as ChargeType,
          COALESCE(b.frequency, 'Usage-Based') as ChargeFrequency,

          -- SubAccount: Azure subscription = FOCUS SubAccount
          b.subscription_id as SubAccountId,
          COALESCE(b.subscription_name, b.subscription_id) as SubAccountName,

          -- SKU details with comprehensive pricing info
          b.meter_id as SkuId,
          JSON_OBJECT(
            'meter_name', b.meter_name,
            'meter_category', b.meter_category,
            'meter_subcategory', b.meter_subcategory,
            'service_tier', b.service_tier,
            'service_family', b.service_family,
            'product_name', b.product_name,
            'consumed_service', b.consumed_service,
            'payg_price', b.payg_price,
            'unit_price', b.unit_price,
            'effective_price', b.effective_price,
            'azure_credit_applied', b.azure_credit_applied,
            'is_azure_credit_eligible', b.is_azure_credit_eligible,
            'cost_center', b.cost_center,
            'invoice_section_name', b.invoice_section_name,
            'billing_profile_name', b.billing_profile_name,
            'additional_info', SAFE.PARSE_JSON(b.additional_info_json)
          ) as SkuPriceDetails,

          COALESCE(SAFE.PARSE_JSON(b.resource_tags_json), JSON_OBJECT()) as Tags,

          'cloud_azure_billing_raw_daily' as x_source_system,
          GENERATE_UUID() as x_source_record_id,
          CURRENT_TIMESTAMP() as x_updated_at,
          'azure' as x_cloud_provider,
          b.subscription_id as x_cloud_account_id,

          -- Commitment Discount: Reservations and Savings Plans
          COALESCE(b.reservation_id, b.savings_plan_id, b.benefit_id) as CommitmentDiscountId,
          COALESCE(b.reservation_name, b.savings_plan_name, b.benefit_name) as CommitmentDiscountName,
          CASE
            WHEN b.reservation_id IS NOT NULL THEN 'Reservation'
            WHEN b.savings_plan_id IS NOT NULL THEN 'Savings Plan'
            WHEN b.benefit_id IS NOT NULL THEN 'Benefit'
            ELSE NULL
          END as CommitmentDiscountType,

          -- 5-field hierarchy model (NEW design)
          h.entity_id as x_hierarchy_entity_id,
          h.entity_name as x_hierarchy_entity_name,
          h.level_code as x_hierarchy_level_code,
          h.path as x_hierarchy_path,
          -- Convert ARRAY<STRING> to STRING (org_hierarchy.path_names is REPEATED)
          ARRAY_TO_STRING(h.path_names, ' > ') as x_hierarchy_path_names,
          CASE WHEN h.entity_id IS NOT NULL THEN CURRENT_TIMESTAMP() ELSE NULL END as x_hierarchy_validated_at,

          -- Lineage columns (REQUIRED)
          @p_pipeline_id as x_pipeline_id,
          @p_credential_id as x_credential_id,
          @p_start as x_pipeline_run_date,
          @p_run_id as x_run_id,
          CURRENT_TIMESTAMP() as x_ingested_at

        FROM `%s.%s.cloud_azure_billing_raw_daily` b
        LEFT JOIN hierarchy_lookup h ON h.entity_id = COALESCE(
          -- Check cost_center field first (direct from Azure)
          b.cost_center,
          -- Then check resource tags
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.cost_center'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.CostCenter'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.team'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.Team'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.department'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.Department'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.resource_tags_json), '$.entity_id')
        )
        WHERE b.usage_date BETWEEN @p_start AND @p_end
          -- Include all charges: positive costs AND credits (negative values or Credit charge_type)
          AND (b.cost_in_billing_currency != 0 OR b.charge_type IN ('Credit', 'Refund'))
      """, p_project_id, p_dataset_id, p_project_id, p_project_id, p_dataset_id)
      USING p_start_date AS p_start, v_effective_end_date AS p_end, p_pipeline_id AS p_pipeline_id, p_credential_id AS p_credential_id, p_run_id AS p_run_id, v_org_slug AS v_org_slug;

      SET v_rows_inserted = v_rows_inserted + @@row_count;
    END IF;

    -- ============================================================================
    -- OCI Billing to FOCUS 1.3
    -- Uses 5-field x_hierarchy_* model (NEW design)
    -- FOCUS 1.3 compliant: Includes pricing details, credits, and charge categories
    -- OCI-specific: Uses usage_start_time/usage_end_time, cost_type, my_cost, credits
    -- ============================================================================
    IF p_provider IN ('oci', 'all') THEN
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
          b.tenancy_id as BillingAccountId,
          -- OCI uses usage_start_time/usage_end_time (TIMESTAMP)
          b.usage_start_time as ChargePeriodStart,
          b.usage_end_time as ChargePeriodEnd,
          TIMESTAMP(DATE_TRUNC(DATE(b.usage_start_time), MONTH)) as BillingPeriodStart,
          TIMESTAMP(LAST_DAY(DATE(b.usage_start_time), MONTH)) as BillingPeriodEnd,

          'Oracle Cloud Infrastructure' as InvoiceIssuerName,
          'OCI' as ServiceProviderName,
          'Oracle' as HostProviderName,

          -- Service categorization based on OCI service names
          CASE
            WHEN UPPER(b.service_name) LIKE '%%COMPUTE%%' OR UPPER(b.service_name) LIKE '%%VM%%' THEN 'Compute'
            WHEN UPPER(b.service_name) LIKE '%%STORAGE%%' OR UPPER(b.service_name) LIKE '%%OBJECT%%' THEN 'Storage'
            WHEN UPPER(b.service_name) LIKE '%%DATABASE%%' OR UPPER(b.service_name) LIKE '%%AUTONOMOUS%%' THEN 'Database'
            WHEN UPPER(b.service_name) LIKE '%%NETWORK%%' OR UPPER(b.service_name) LIKE '%%VCN%%' OR UPPER(b.service_name) LIKE '%%LOAD%%' THEN 'Networking'
            WHEN UPPER(b.service_name) LIKE '%%AI%%' OR UPPER(b.service_name) LIKE '%%ML%%' OR UPPER(b.service_name) LIKE '%%GENAI%%' THEN 'AI/ML'
            WHEN UPPER(b.service_name) LIKE '%%CONTAINER%%' OR UPPER(b.service_name) LIKE '%%KUBERNETES%%' THEN 'Containers'
            ELSE 'Other'
          END as ServiceCategory,
          COALESCE(b.service_name, 'Unknown') as ServiceName,
          COALESCE(b.sku_name, 'Default') as ServiceSubcategory,

          b.resource_id as ResourceId,
          b.resource_name as ResourceName,
          COALESCE(b.platform_type, 'OCI Resource') as ResourceType,
          COALESCE(b.region, 'global') as RegionId,
          COALESCE(b.region, 'Global') as RegionName,

          CAST(b.usage_quantity AS NUMERIC) as ConsumedQuantity,
          b.unit as ConsumedUnit,
          -- PricingCategory based on overage and cost type
          CASE
            WHEN b.overage_flag = 'Y' THEN 'Overage'
            WHEN LOWER(COALESCE(b.cost_type, '')) = 'credit' THEN 'Credit'
            ELSE 'On-Demand'
          END as PricingCategory,
          b.unit as PricingUnit,

          -- FOCUS 1.3: Pricing details from OCI
          CAST(b.computed_quantity AS NUMERIC) as PricingQuantity,
          CAST(b.list_rate AS NUMERIC) as ListUnitPrice,
          CAST(b.unit_price AS NUMERIC) as ContractedUnitPrice,

          -- Cost fields: BilledCost is gross, EffectiveCost is net (after credits)
          CAST(b.cost AS NUMERIC) as ContractedCost,
          -- EffectiveCost: Use my_cost if available (net cost), else gross + credits
          CAST(COALESCE(b.my_cost, b.cost + COALESCE(b.credits_total, 0)) AS NUMERIC) as EffectiveCost,
          CAST(b.cost AS NUMERIC) as BilledCost,
          -- ListCost: Use list_rate * quantity if available, else fall back to cost
          CAST(COALESCE(b.usage_quantity * b.list_rate, b.cost) AS NUMERIC) as ListCost,
          COALESCE(b.currency, 'USD') as BillingCurrency,

          -- ChargeCategory from OCI cost_type: Usage, Credit, Tax, etc.
          CASE LOWER(COALESCE(b.cost_type, 'usage'))
            WHEN 'credit' THEN 'Credit'
            WHEN 'tax' THEN 'Tax'
            WHEN 'adjustment' THEN 'Adjustment'
            WHEN 'refund' THEN 'Credit'
            ELSE 'Usage'
          END as ChargeCategory,
          -- ChargeClass: 'Correction' if is_correction is true
          CASE
            WHEN b.is_correction = TRUE THEN 'Correction'
            ELSE NULL
          END as ChargeClass,
          COALESCE(b.cost_type, 'Usage') as ChargeType,
          'Usage-Based' as ChargeFrequency,

          -- SubAccount: Use compartment for OCI account hierarchy
          b.compartment_id as SubAccountId,
          COALESCE(b.compartment_name, b.compartment_id) as SubAccountName,

          b.sku_part_number as SkuId,
          -- SkuPriceDetails: Include all OCI-specific pricing and metadata
          JSON_OBJECT(
            'sku_name', b.sku_name,
            'service_name', b.service_name,
            'compartment_path', b.compartment_path,
            'platform_type', b.platform_type,
            'subscription_id', b.subscription_id,
            'billing_period', b.billing_period,
            'overage_flag', b.overage_flag,
            'credits_total', b.credits_total,
            'credits_json', SAFE.PARSE_JSON(b.credits_json),
            'availability_domain', b.availability_domain
          ) as SkuPriceDetails,

          -- Merge freeform_tags and defined_tags for Tags field
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
          -- Convert ARRAY<STRING> to STRING (org_hierarchy.path_names is REPEATED)
          ARRAY_TO_STRING(h.path_names, ' > ') as x_hierarchy_path_names,
          CASE WHEN h.entity_id IS NOT NULL THEN CURRENT_TIMESTAMP() ELSE NULL END as x_hierarchy_validated_at,

          -- Lineage columns (REQUIRED)
          @p_pipeline_id as x_pipeline_id,
          @p_credential_id as x_credential_id,
          @p_start as x_pipeline_run_date,
          @p_run_id as x_run_id,
          CURRENT_TIMESTAMP() as x_ingested_at

        FROM `%s.%s.cloud_oci_billing_raw_daily` b
        LEFT JOIN hierarchy_lookup h ON h.entity_id = COALESCE(
          -- Try freeform tags first (user-defined)
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.freeform_tags_json), '$.cost_center'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.freeform_tags_json), '$.team'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.freeform_tags_json), '$.department'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.freeform_tags_json), '$.entity_id'),
          -- Then try defined tags (namespace.key format may vary)
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.defined_tags_json), '$.cost_center'),
          JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.defined_tags_json), '$.entity_id'),
          -- Fall back to compartment_id as hierarchy entity
          b.compartment_id
        )
        -- Filter by usage_start_time (TIMESTAMP) for OCI data
        WHERE DATE(b.usage_start_time) BETWEEN @p_start AND @p_end
          -- Include all cost types for FOCUS compliance (credits have negative cost or cost_type='credit')
          AND (b.cost != 0 OR LOWER(COALESCE(b.cost_type, '')) = 'credit')
      """, p_project_id, p_dataset_id, p_project_id, p_project_id, p_dataset_id)
      USING p_start_date AS p_start, v_effective_end_date AS p_end, p_pipeline_id AS p_pipeline_id, p_credential_id AS p_credential_id, p_run_id AS p_run_id, v_org_slug AS v_org_slug;

      SET v_rows_inserted = v_rows_inserted + @@row_count;
    END IF;

  COMMIT TRANSACTION;

  -- Log conversion result
  SELECT
    p_start_date as start_date,
    v_effective_end_date as end_date,
    p_provider as provider,
    v_rows_inserted as rows_inserted,
    'cost_data_standard_1_3' as target_table,
    CURRENT_TIMESTAMP() as executed_at;

EXCEPTION WHEN ERROR THEN
  -- BigQuery auto-rollbacks on error inside transaction, so no explicit ROLLBACK needed
  -- PRO-011: Enhanced error message with provider and date context
  RAISE USING MESSAGE = CONCAT(
    'sp_cloud_1_convert_to_focus Failed for provider=', p_provider,
    ', date_range=', CAST(p_start_date AS STRING), ' to ', CAST(v_effective_end_date AS STRING),
    ': ', @@error.message
  );
END;
