-- ================================================================================
-- PROCEDURE: sp_convert_saas_costs_to_focus_1_2
-- LOCATION: {project_id}.organizations (central dataset)
-- OPERATES ON: {project_id}.{p_dataset_id} (per-customer dataset)
--
-- PURPOSE: Maps daily SaaS subscription costs to FinOps FOCUS 1.2 standard.
--
-- FOCUS 1.2 MAPPING:
--   - PricingQuantity/ConsumedQuantity: seats for PER_SEAT, 1 for FLAT_FEE
--   - PricingUnit/ConsumedUnit: "seat" for PER_SEAT, "subscription" for FLAT_FEE
--   - BilledCost: daily_cost (amortized)
--   - EffectiveCost: daily_cost (same for subscriptions)
--   - ListCost: cycle_cost (full billing period cost)
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
  ASSERT DATE_DIFF(p_end_date, p_start_date, DAY) <= 366 AS "Date range cannot exceed 366 days";

  BEGIN TRANSACTION;

    -- 2. Delete existing SaaS data for date range (only this source)
    EXECUTE IMMEDIATE FORMAT("""
      DELETE FROM `%s.%s.cost_data_standard_1_2`
      WHERE ChargePeriodStart BETWEEN @p_start AND @p_end
        AND SourceSystem = 'saas_subscription_costs_daily'
    """, p_project_id, p_dataset_id)
    USING p_start_date AS p_start, p_end_date AS p_end;

    -- 3. Insert mapped data (derive quantity/unit from seats/pricing_model)
    EXECUTE IMMEDIATE FORMAT("""
      INSERT INTO `%s.%s.cost_data_standard_1_2` (
        BillingAccountId, BillingAccountName, BillingAccountType,
        SubAccountId, SubAccountName, SubAccountType,
        BilledCost, BillingCurrency,
        EffectiveCost, ListCost, PricingCurrency,
        PricingQuantity, PricingUnit, UnitPrice,
        ConsumedQuantity, ConsumedUnit,
        ChargeCategory, ChargeClass, ChargeDescription, ChargeFrequency, ChargeOrigination,
        InvoiceId, InvoiceIssuer, Provider, Publisher,
        AvailabilityZone, RegionId, RegionName,
        ServiceCategory, ServiceName, ServiceSubcategory,
        x_ServiceModel, x_AmortizationClass, UsageType,
        SkuId, SkuMeter, SkuPriceDetails, SkuPriceId,
        BillingPeriodStart, BillingPeriodEnd, ChargePeriodStart, ChargePeriodEnd,
        SourceSystem, SourceRecordId, UpdatedAt
      )
      SELECT
        -- Billing Account (NULL for SaaS)
        NULL, NULL, NULL,
        -- Sub Account (Org)
        spc.org_slug, 'Organization', 'Organization',
        -- Costs
        spc.daily_cost AS BilledCost,
        spc.currency AS BillingCurrency,
        spc.daily_cost AS EffectiveCost,
        spc.cycle_cost AS ListCost,
        spc.currency AS PricingCurrency,
        -- Quantity: seats for PER_SEAT, 1 for FLAT_FEE
        CASE WHEN spc.pricing_model = 'PER_SEAT' THEN CAST(spc.seats AS NUMERIC) ELSE 1 END AS PricingQuantity,
        -- Unit: "seat" for PER_SEAT, "subscription" for FLAT_FEE
        CASE WHEN spc.pricing_model = 'PER_SEAT' THEN 'seat' ELSE 'subscription' END AS PricingUnit,
        -- UnitPrice: cycle_cost / seats for PER_SEAT, cycle_cost for FLAT_FEE
        CASE
          WHEN spc.pricing_model = 'PER_SEAT' AND spc.seats > 0 THEN spc.cycle_cost / spc.seats
          ELSE spc.cycle_cost
        END AS UnitPrice,
        -- Consumed (same as Pricing for subscriptions)
        CASE WHEN spc.pricing_model = 'PER_SEAT' THEN CAST(spc.seats AS NUMERIC) ELSE 1 END AS ConsumedQuantity,
        CASE WHEN spc.pricing_model = 'PER_SEAT' THEN 'seat' ELSE 'subscription' END AS ConsumedUnit,
        -- Charge metadata
        'Subscription' AS ChargeCategory,
        'Recurring' AS ChargeClass,
        CONCAT(spc.display_name, ' (', spc.plan_name, ')') AS ChargeDescription,
        CASE WHEN spc.billing_cycle IN ('annual', 'yearly', 'year') THEN 'Annual' ELSE 'Monthly' END AS ChargeFrequency,
        'Calculated' AS ChargeOrigination,
        -- Invoice & Provider
        spc.invoice_id_last AS InvoiceId,
        spc.provider AS InvoiceIssuer,
        spc.provider AS Provider,
        NULL AS Publisher,
        -- Region (Global for SaaS)
        NULL AS AvailabilityZone,
        'Global' AS RegionId,
        'Global' AS RegionName,
        -- Service
        'SaaS' AS ServiceCategory,
        spc.display_name AS ServiceName,
        spc.plan_name AS ServiceSubcategory,
        'SaaS' AS x_ServiceModel,
        'Amortized' AS x_AmortizationClass,
        CASE WHEN spc.pricing_model = 'FLAT_FEE' THEN 'Flat-fee Subscription' ELSE 'Seat-based Subscription' END AS UsageType,
        -- SKU
        spc.plan_name AS SkuId,
        NULL AS SkuMeter,
        NULL AS SkuPriceDetails,
        NULL AS SkuPriceId,
        -- Periods
        DATE_TRUNC(spc.cost_date, MONTH) AS BillingPeriodStart,
        DATE_SUB(DATE_ADD(DATE_TRUNC(spc.cost_date, MONTH), INTERVAL 1 MONTH), INTERVAL 1 DAY) AS BillingPeriodEnd,
        spc.cost_date AS ChargePeriodStart,
        spc.cost_date AS ChargePeriodEnd,
        -- Source
        'saas_subscription_costs_daily' AS SourceSystem,
        spc.subscription_id AS SourceRecordId,
        CURRENT_TIMESTAMP() AS UpdatedAt
      FROM `%s.%s.saas_subscription_plan_costs_daily` spc
      WHERE spc.cost_date BETWEEN @p_start AND @p_end
    """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
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
