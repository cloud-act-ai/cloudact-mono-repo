-- ================================================================================
-- PROCEDURE: sp_convert_saas_costs_to_focus_1_2
-- LOCATION: {project_id}.organizations (central dataset)
-- OPERATES ON: {project_id}.{p_dataset_id} (per-customer dataset)
--
-- PURPOSE: Maps daily SaaS subscription costs to FinOps FOCUS 1.2 standard.
--          JOINs with saas_subscription_plans to include all provider/plan metadata.
--
-- FOCUS 1.2 MAPPING:
--   - PricingQuantity/ConsumedQuantity: seats for PER_SEAT, 1 for FLAT_FEE
--   - PricingUnit/ConsumedUnit: "seat" for PER_SEAT, "subscription" for FLAT_FEE
--   - BilledCost: daily_cost (amortized)
--   - EffectiveCost: daily_cost (same for subscriptions)
--   - ListCost: cycle_cost (full billing period cost)
--   - ContractedCost: monthly_run_rate (projected monthly cost)
--   - ResourceId/ResourceName/ResourceType: subscription metadata
--
-- ================================================================================

CREATE OR REPLACE PROCEDURE `{project_id}.organizations`.sp_convert_saas_costs_to_focus_1_2(
  p_project_id STRING,
  p_dataset_id STRING,
  p_start_date DATE,
  p_end_date DATE
)
OPTIONS(strict_mode=TRUE)
BEGIN
  DECLARE v_rows_inserted INT64 DEFAULT 0;

  -- 1. Validation
  ASSERT p_project_id IS NOT NULL AS "p_project_id cannot be NULL";
  ASSERT p_dataset_id IS NOT NULL AS "p_dataset_id cannot be NULL";
  ASSERT p_start_date IS NOT NULL AS "p_start_date cannot be NULL";
  ASSERT p_end_date IS NOT NULL AS "p_end_date cannot be NULL";
  ASSERT p_end_date >= p_start_date AS "p_end_date must be >= p_start_date";

  BEGIN TRANSACTION;

    -- 2. Delete existing SaaS data for date range (only this source)
    EXECUTE IMMEDIATE FORMAT("""
      DELETE FROM `%s.%s.cost_data_standard_1_2`
      WHERE ChargePeriodStart BETWEEN @p_start AND @p_end
        AND SourceSystem = 'saas_subscription_costs_daily'
    """, p_project_id, p_dataset_id)
    USING p_start_date AS p_start, p_end_date AS p_end;

    -- 3. Insert mapped data with metadata from subscription plans
    EXECUTE IMMEDIATE FORMAT("""
      INSERT INTO `%s.%s.cost_data_standard_1_2` (
        BillingAccountId, BillingAccountName, BillingAccountType,
        SubAccountId, SubAccountName, SubAccountType,
        BilledCost, BillingCurrency, ContractedCost, EffectiveCost, ListCost,
        ContractedUnitPrice, EffectiveUnitPrice, ListUnitPrice, UnitPrice,
        PricingCurrency, PricingQuantity, PricingUnit,
        ConsumedQuantity, ConsumedUnit,
        ChargeCategory, ChargeClass, ChargeDescription, ChargeFrequency, ChargeOrigination,
        InvoiceId, InvoiceIssuer, Provider, Publisher,
        CommitmentDiscountCategory, CommitmentDiscountId, CommitmentDiscountName,
        CommitmentDiscountQuantity, CommitmentDiscountStatus, CommitmentDiscountType, CommitmentDiscountUnit,
        AvailabilityZone, RegionId, RegionName,
        PricingCategory, ResourceId, ResourceName, ResourceType,
        ServiceCategory, ServiceName, ServiceSubcategory,
        x_ServiceModel, x_AmortizationClass, UsageType,
        SkuId, SkuMeter, SkuPriceDetails, SkuPriceId,
        BillingPeriodStart, BillingPeriodEnd, ChargePeriodStart, ChargePeriodEnd,
        SourceSystem, SourceRecordId, UpdatedAt
      )
      SELECT
        -- Billing Account (Contract-based for SaaS with contract_id)
        sp.contract_id AS BillingAccountId,
        CASE WHEN sp.contract_id IS NOT NULL THEN CONCAT(sp.provider, ' Contract') ELSE NULL END AS BillingAccountName,
        CASE WHEN sp.contract_id IS NOT NULL THEN 'Contract' ELSE NULL END AS BillingAccountType,
        -- Sub Account (Org)
        spc.org_slug AS SubAccountId,
        spc.org_slug AS SubAccountName,
        'Organization' AS SubAccountType,
        -- Costs
        spc.daily_cost AS BilledCost,
        spc.currency AS BillingCurrency,
        spc.monthly_run_rate AS ContractedCost,
        spc.daily_cost AS EffectiveCost,
        spc.cycle_cost AS ListCost,
        -- Unit Prices (cast to NUMERIC for FOCUS schema)
        -- Handle NULL and negative seats safely for division
        CAST(sp.unit_price AS NUMERIC) AS ContractedUnitPrice,
        CASE
          WHEN spc.pricing_model = 'PER_SEAT' AND COALESCE(spc.seats, 0) > 0 THEN spc.cycle_cost / spc.seats
          WHEN spc.pricing_model = 'FLAT_FEE' THEN spc.cycle_cost
          ELSE 0  -- Fallback for invalid data (seats <= 0 with PER_SEAT)
        END AS EffectiveUnitPrice,
        CAST(sp.unit_price AS NUMERIC) AS ListUnitPrice,
        CASE
          WHEN spc.pricing_model = 'PER_SEAT' AND COALESCE(spc.seats, 0) > 0 THEN spc.cycle_cost / spc.seats
          WHEN spc.pricing_model = 'FLAT_FEE' THEN spc.cycle_cost
          ELSE 0  -- Fallback for invalid data
        END AS UnitPrice,
        -- Pricing
        spc.currency AS PricingCurrency,
        CASE WHEN spc.pricing_model = 'PER_SEAT' THEN CAST(spc.seats AS NUMERIC) ELSE 1 END AS PricingQuantity,
        CASE WHEN spc.pricing_model = 'PER_SEAT' THEN 'seat' ELSE 'subscription' END AS PricingUnit,
        -- Consumed
        CASE WHEN spc.pricing_model = 'PER_SEAT' THEN CAST(spc.seats AS NUMERIC) ELSE 1 END AS ConsumedQuantity,
        CASE WHEN spc.pricing_model = 'PER_SEAT' THEN 'seat' ELSE 'subscription' END AS ConsumedUnit,
        -- Charge metadata
        'Subscription' AS ChargeCategory,
        CASE WHEN sp.auto_renew = TRUE THEN 'Recurring (Auto-Renew)' ELSE 'Recurring' END AS ChargeClass,
        COALESCE(sp.notes, CONCAT(spc.display_name, ' (', spc.plan_name, ')')) AS ChargeDescription,
        CASE
          WHEN spc.billing_cycle IN ('annual', 'yearly', 'year') THEN 'Annual'
          WHEN spc.billing_cycle IN ('quarterly', 'quarter') THEN 'Quarterly'
          WHEN spc.billing_cycle IN ('weekly', 'week') THEN 'Weekly'
          ELSE 'Monthly'
        END AS ChargeFrequency,
        'Calculated' AS ChargeOrigination,
        -- Invoice & Provider
        spc.invoice_id_last AS InvoiceId,
        spc.provider AS InvoiceIssuer,
        spc.provider AS Provider,
        INITCAP(REPLACE(spc.provider, '_', ' ')) AS Publisher,
        -- Commitment/Discount fields
        sp.discount_type AS CommitmentDiscountCategory,
        CASE WHEN sp.discount_value IS NOT NULL THEN CONCAT(spc.subscription_id, '_discount') ELSE NULL END AS CommitmentDiscountId,
        CASE
          WHEN sp.discount_type = 'percent' THEN CONCAT(CAST(sp.discount_value AS STRING), ' percent discount')
          WHEN sp.discount_type = 'fixed' THEN CONCAT(CAST(sp.discount_value AS STRING), ' off')
          ELSE NULL
        END AS CommitmentDiscountName,
        CAST(sp.discount_value AS NUMERIC) AS CommitmentDiscountQuantity,
        CASE WHEN sp.discount_value IS NOT NULL THEN 'Applied' ELSE NULL END AS CommitmentDiscountStatus,
        sp.discount_type AS CommitmentDiscountType,
        CASE WHEN sp.discount_type = 'percent' THEN 'percent' WHEN sp.discount_type = 'fixed' THEN spc.currency ELSE NULL END AS CommitmentDiscountUnit,
        -- Region (Global for SaaS)
        NULL AS AvailabilityZone,
        'Global' AS RegionId,
        'Global' AS RegionName,
        -- Pricing details
        spc.pricing_model AS PricingCategory,
        -- Resource identification
        spc.subscription_id AS ResourceId,
        COALESCE(spc.display_name, spc.plan_name) AS ResourceName,
        'SaaS Subscription' AS ResourceType,
        -- Service
        'SaaS' AS ServiceCategory,
        COALESCE(spc.display_name, spc.provider) AS ServiceName,
        COALESCE(sp.category, spc.plan_name) AS ServiceSubcategory,
        'SaaS' AS x_ServiceModel,
        'Amortized' AS x_AmortizationClass,
        CASE WHEN spc.pricing_model = 'FLAT_FEE' THEN 'Flat-fee Subscription' ELSE 'Seat-based Subscription' END AS UsageType,
        -- SKU
        CONCAT(spc.provider, '/', spc.plan_name) AS SkuId,
        spc.billing_cycle AS SkuMeter,
        CONCAT(spc.pricing_model, ' - ', CAST(spc.seats AS STRING), ' seats') AS SkuPriceDetails,
        spc.subscription_id AS SkuPriceId,
        -- Periods
        DATE_TRUNC(spc.cost_date, MONTH) AS BillingPeriodStart,
        LAST_DAY(spc.cost_date) AS BillingPeriodEnd,
        spc.cost_date AS ChargePeriodStart,
        spc.cost_date AS ChargePeriodEnd,
        -- Source
        'saas_subscription_costs_daily' AS SourceSystem,
        spc.subscription_id AS SourceRecordId,
        CURRENT_TIMESTAMP() AS UpdatedAt
      FROM `%s.%s.saas_subscription_plan_costs_daily` spc
      LEFT JOIN `%s.%s.saas_subscription_plans` sp
        ON spc.subscription_id = sp.subscription_id
        AND spc.org_slug = sp.org_slug
      WHERE spc.cost_date BETWEEN @p_start AND @p_end
    """, p_project_id, p_dataset_id, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
    USING p_start_date AS p_start, p_end_date AS p_end;

  COMMIT TRANSACTION;

  -- 4. Get row count
  EXECUTE IMMEDIATE FORMAT("""
    SELECT COUNT(*) FROM `%s.%s.cost_data_standard_1_2`
    WHERE ChargePeriodStart BETWEEN @p_start AND @p_end
      AND SourceSystem = 'saas_subscription_costs_daily'
  """, p_project_id, p_dataset_id)
  INTO v_rows_inserted USING p_start_date AS p_start, p_end_date AS p_end;

  SELECT 'FOCUS 1.2 Conversion Complete' AS status,
         v_rows_inserted AS rows_inserted,
         p_dataset_id AS dataset;

EXCEPTION WHEN ERROR THEN
  ROLLBACK TRANSACTION;
  RAISE USING MESSAGE = CONCAT('sp_convert_saas_costs_to_focus_1_2 Failed: ', @@error.message);
END;
