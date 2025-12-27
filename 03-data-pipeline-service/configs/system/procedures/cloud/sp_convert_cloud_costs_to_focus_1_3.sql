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

  -- Extract org_slug from dataset_id
  SET v_org_slug = REGEXP_REPLACE(p_dataset_id, '_prod$|_stage$|_dev$|_local$', '');

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
          AND x_SourceSystem IN ('gcp_billing_cost_daily', 'aws_billing_cost_daily',
                                  'azure_billing_cost_daily', 'oci_billing_cost_daily')
      """, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date;
    ELSE
      EXECUTE IMMEDIATE FORMAT("""
        DELETE FROM `%s.%s.cost_data_standard_1_3`
        WHERE DATE(ChargePeriodStart) = @p_date
          AND x_SourceSystem = CONCAT(@p_provider, '_billing_cost_daily')
      """, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date, p_provider AS p_provider;
    END IF;

    -- ============================================================================
    -- GCP Billing to FOCUS 1.3
    -- ============================================================================
    IF p_provider IN ('gcp', 'all') THEN
      EXECUTE IMMEDIATE FORMAT("""
        INSERT INTO `%s.%s.cost_data_standard_1_3`
        (ChargePeriodStart, ChargePeriodEnd, BillingPeriodStart, BillingPeriodEnd,
         InvoiceIssuerName, ServiceProviderName, HostProviderName,
         ServiceCategory, ServiceName, ServiceSubcategory,
         ResourceId, ResourceName, ResourceType, RegionId, RegionName,
         UsageAmount, UsageUnit, PricingCategory, PricingUnit,
         EffectiveCost, BilledCost, ListCost, BillingCurrency,
         ChargeCategory, ChargeType, ChargeFrequency,
         SubAccountId, SubAccountName,
         SkuId, SkuPriceDetails,
         Tags,
         x_SourceSystem, x_SourceRecordId, x_UpdatedAt,
         x_CloudProvider, x_CloudAccountId,
         x_PipelineId, x_CredentialId, x_PipelineRunDate, x_PipelineRunId, x_IngestedAt)
        SELECT
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

          CAST(usage_amount AS NUMERIC) as UsageAmount,
          usage_unit as UsageUnit,
          CASE cost_type
            WHEN 'regular' THEN 'On-Demand'
            WHEN 'tax' THEN 'Tax'
            ELSE 'On-Demand'
          END as PricingCategory,
          usage_pricing_unit as PricingUnit,

          CAST(cost AS NUMERIC) as EffectiveCost,
          CAST(cost AS NUMERIC) as BilledCost,
          CAST(COALESCE(cost_at_list, cost) AS NUMERIC) as ListCost,
          COALESCE(currency, 'USD') as BillingCurrency,

          'Usage' as ChargeCategory,
          COALESCE(cost_type, 'Usage') as ChargeType,
          'Usage-Based' as ChargeFrequency,

          project_id as SubAccountId,
          COALESCE(project_name, project_id) as SubAccountName,

          sku_id as SkuId,
          JSON_OBJECT('sku_description', sku_description, 'service_id', service_id) as SkuPriceDetails,

          COALESCE(SAFE.PARSE_JSON(labels_json), JSON_OBJECT()) as Tags,

          'gcp_billing_cost_daily' as x_SourceSystem,
          GENERATE_UUID() as x_SourceRecordId,
          CURRENT_TIMESTAMP() as x_UpdatedAt,
          'gcp' as x_CloudProvider,
          billing_account_id as x_CloudAccountId,
          -- Lineage columns (REQUIRED)
          @p_pipeline_id as x_PipelineId,
          @p_credential_id as x_CredentialId,
          @p_date as x_PipelineRunDate,
          @p_run_id as x_PipelineRunId,
          CURRENT_TIMESTAMP() as x_IngestedAt

        FROM `%s.%s.gcp_billing_cost_daily`
        WHERE DATE(usage_start_time) = @p_date
          AND cost > 0
      """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date, p_pipeline_id AS p_pipeline_id, p_credential_id AS p_credential_id, p_run_id AS p_run_id;

      SET v_rows_inserted = v_rows_inserted + @@row_count;
    END IF;

    -- ============================================================================
    -- AWS Billing to FOCUS 1.3
    -- ============================================================================
    IF p_provider IN ('aws', 'all') THEN
      EXECUTE IMMEDIATE FORMAT("""
        INSERT INTO `%s.%s.cost_data_standard_1_3`
        (ChargePeriodStart, ChargePeriodEnd, BillingPeriodStart, BillingPeriodEnd,
         InvoiceIssuerName, ServiceProviderName, HostProviderName,
         ServiceCategory, ServiceName, ServiceSubcategory,
         ResourceId, ResourceName, ResourceType, RegionId, RegionName,
         UsageAmount, UsageUnit, PricingCategory, PricingUnit,
         EffectiveCost, BilledCost, ListCost, BillingCurrency,
         ChargeCategory, ChargeType, ChargeFrequency,
         SubAccountId, SubAccountName,
         SkuId, SkuPriceDetails,
         Tags,
         x_SourceSystem, x_SourceRecordId, x_UpdatedAt,
         x_CloudProvider, x_CloudAccountId,
         CommitmentDiscountId, CommitmentDiscountType,
         x_PipelineId, x_CredentialId, x_PipelineRunDate, x_PipelineRunId, x_IngestedAt)
        SELECT
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

          CAST(usage_amount AS NUMERIC) as UsageAmount,
          usage_unit as UsageUnit,
          CASE
            WHEN reservation_arn IS NOT NULL THEN 'Committed'
            WHEN savings_plan_arn IS NOT NULL THEN 'Committed'
            ELSE 'On-Demand'
          END as PricingCategory,
          pricing_unit as PricingUnit,

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

          linked_account_id as SubAccountId,
          COALESCE(linked_account_name, linked_account_id) as SubAccountName,

          CONCAT(product_code, '/', usage_type) as SkuId,
          JSON_OBJECT('service_code', service_code, 'product_code', product_code, 'usage_type', usage_type) as SkuPriceDetails,

          COALESCE(SAFE.PARSE_JSON(resource_tags_json), JSON_OBJECT()) as Tags,

          'aws_billing_cost_daily' as x_SourceSystem,
          GENERATE_UUID() as x_SourceRecordId,
          CURRENT_TIMESTAMP() as x_UpdatedAt,
          'aws' as x_CloudProvider,
          payer_account_id as x_CloudAccountId,

          COALESCE(reservation_arn, savings_plan_arn) as CommitmentDiscountId,
          CASE
            WHEN reservation_arn IS NOT NULL THEN 'Reserved Instance'
            WHEN savings_plan_arn IS NOT NULL THEN 'Savings Plan'
            ELSE NULL
          END as CommitmentDiscountType,
          -- Lineage columns (REQUIRED)
          @p_pipeline_id as x_PipelineId,
          @p_credential_id as x_CredentialId,
          @p_date as x_PipelineRunDate,
          @p_run_id as x_PipelineRunId,
          CURRENT_TIMESTAMP() as x_IngestedAt

        FROM `%s.%s.aws_billing_cost_daily`
        WHERE usage_date = @p_date
          AND unblended_cost > 0
      """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date, p_pipeline_id AS p_pipeline_id, p_credential_id AS p_credential_id, p_run_id AS p_run_id;

      SET v_rows_inserted = v_rows_inserted + @@row_count;
    END IF;

    -- ============================================================================
    -- Azure Billing to FOCUS 1.3
    -- ============================================================================
    IF p_provider IN ('azure', 'all') THEN
      EXECUTE IMMEDIATE FORMAT("""
        INSERT INTO `%s.%s.cost_data_standard_1_3`
        (ChargePeriodStart, ChargePeriodEnd, BillingPeriodStart, BillingPeriodEnd,
         InvoiceIssuerName, ServiceProviderName, HostProviderName,
         ServiceCategory, ServiceName, ServiceSubcategory,
         ResourceId, ResourceName, ResourceType, RegionId, RegionName,
         UsageAmount, UsageUnit, PricingCategory, PricingUnit,
         EffectiveCost, BilledCost, ListCost, BillingCurrency,
         ChargeCategory, ChargeType, ChargeFrequency,
         SubAccountId, SubAccountName,
         SkuId, SkuPriceDetails,
         Tags,
         x_SourceSystem, x_SourceRecordId, x_UpdatedAt,
         x_CloudProvider, x_CloudAccountId,
         CommitmentDiscountId, CommitmentDiscountName,
         x_PipelineId, x_CredentialId, x_PipelineRunDate, x_PipelineRunId, x_IngestedAt)
        SELECT
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

          CAST(usage_quantity AS NUMERIC) as UsageAmount,
          usage_unit as UsageUnit,
          COALESCE(pricing_model, 'On-Demand') as PricingCategory,
          usage_unit as PricingUnit,

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

          subscription_id as SubAccountId,
          COALESCE(subscription_name, subscription_id) as SubAccountName,

          meter_id as SkuId,
          JSON_OBJECT('meter_name', meter_name, 'meter_category', meter_category, 'service_tier', service_tier) as SkuPriceDetails,

          COALESCE(SAFE.PARSE_JSON(tags_json), JSON_OBJECT()) as Tags,

          'azure_billing_cost_daily' as x_SourceSystem,
          GENERATE_UUID() as x_SourceRecordId,
          CURRENT_TIMESTAMP() as x_UpdatedAt,
          'azure' as x_CloudProvider,
          subscription_id as x_CloudAccountId,

          reservation_id as CommitmentDiscountId,
          reservation_name as CommitmentDiscountName,
          -- Lineage columns (REQUIRED)
          @p_pipeline_id as x_PipelineId,
          @p_credential_id as x_CredentialId,
          @p_date as x_PipelineRunDate,
          @p_run_id as x_PipelineRunId,
          CURRENT_TIMESTAMP() as x_IngestedAt

        FROM `%s.%s.azure_billing_cost_daily`
        WHERE usage_date = @p_date
          AND cost_in_billing_currency > 0
      """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date, p_pipeline_id AS p_pipeline_id, p_credential_id AS p_credential_id, p_run_id AS p_run_id;

      SET v_rows_inserted = v_rows_inserted + @@row_count;
    END IF;

    -- ============================================================================
    -- OCI Billing to FOCUS 1.3
    -- ============================================================================
    IF p_provider IN ('oci', 'all') THEN
      EXECUTE IMMEDIATE FORMAT("""
        INSERT INTO `%s.%s.cost_data_standard_1_3`
        (ChargePeriodStart, ChargePeriodEnd, BillingPeriodStart, BillingPeriodEnd,
         InvoiceIssuerName, ServiceProviderName, HostProviderName,
         ServiceCategory, ServiceName, ServiceSubcategory,
         ResourceId, ResourceName, ResourceType, RegionId, RegionName,
         UsageAmount, UsageUnit, PricingCategory, PricingUnit,
         EffectiveCost, BilledCost, ListCost, BillingCurrency,
         ChargeCategory, ChargeType, ChargeFrequency,
         SubAccountId, SubAccountName,
         SkuId, SkuPriceDetails,
         Tags,
         x_SourceSystem, x_SourceRecordId, x_UpdatedAt,
         x_CloudProvider, x_CloudAccountId,
         x_PipelineId, x_CredentialId, x_PipelineRunDate, x_PipelineRunId, x_IngestedAt)
        SELECT
          TIMESTAMP(usage_date) as ChargePeriodStart,
          TIMESTAMP(DATE_ADD(usage_date, INTERVAL 1 DAY)) as ChargePeriodEnd,
          TIMESTAMP(DATE_TRUNC(usage_date, MONTH)) as BillingPeriodStart,
          TIMESTAMP(LAST_DAY(usage_date, MONTH)) as BillingPeriodEnd,

          'Oracle Cloud Infrastructure' as InvoiceIssuerName,
          'OCI' as ServiceProviderName,
          'Oracle' as HostProviderName,

          CASE
            WHEN service LIKE '%%COMPUTE%%' THEN 'Compute'
            WHEN service LIKE '%%STORAGE%%' THEN 'Storage'
            WHEN service LIKE '%%DATABASE%%' THEN 'Database'
            WHEN service LIKE '%%NETWORK%%' THEN 'Networking'
            ELSE 'Other'
          END as ServiceCategory,
          service as ServiceName,
          COALESCE(sku_name, 'Default') as ServiceSubcategory,

          resource_id as ResourceId,
          resource_name as ResourceName,
          'OCI Resource' as ResourceType,
          COALESCE(region, 'global') as RegionId,
          COALESCE(region, 'Global') as RegionName,

          CAST(usage_amount AS NUMERIC) as UsageAmount,
          usage_unit as UsageUnit,
          CASE
            WHEN overages_flag = TRUE THEN 'Overage'
            ELSE 'On-Demand'
          END as PricingCategory,
          usage_unit as PricingUnit,

          CAST(computed_amount AS NUMERIC) as EffectiveCost,
          CAST(computed_amount AS NUMERIC) as BilledCost,
          CAST(COALESCE(usage_amount * unit_price, computed_amount) AS NUMERIC) as ListCost,
          COALESCE(currency, 'USD') as BillingCurrency,

          'Usage' as ChargeCategory,
          'Usage' as ChargeType,
          'Usage-Based' as ChargeFrequency,

          compartment_id as SubAccountId,
          COALESCE(compartment_name, compartment_id) as SubAccountName,

          sku_part_number as SkuId,
          JSON_OBJECT('sku_name', sku_name, 'service', service, 'compartment_path', compartment_path) as SkuPriceDetails,

          COALESCE(SAFE.PARSE_JSON(tags_json), JSON_OBJECT()) as Tags,

          'oci_billing_cost_daily' as x_SourceSystem,
          GENERATE_UUID() as x_SourceRecordId,
          CURRENT_TIMESTAMP() as x_UpdatedAt,
          'oci' as x_CloudProvider,
          tenancy_ocid as x_CloudAccountId,
          -- Lineage columns (REQUIRED)
          @p_pipeline_id as x_PipelineId,
          @p_credential_id as x_CredentialId,
          @p_date as x_PipelineRunDate,
          @p_run_id as x_PipelineRunId,
          CURRENT_TIMESTAMP() as x_IngestedAt

        FROM `%s.%s.oci_billing_cost_daily`
        WHERE usage_date = @p_date
          AND computed_amount > 0
      """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
      USING p_cost_date AS p_date, p_pipeline_id AS p_pipeline_id, p_credential_id AS p_credential_id, p_run_id AS p_run_id;

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
  ROLLBACK TRANSACTION;
  RAISE USING MESSAGE = CONCAT('sp_convert_cloud_costs_to_focus_1_3 Failed: ', @@error.message);
END;
