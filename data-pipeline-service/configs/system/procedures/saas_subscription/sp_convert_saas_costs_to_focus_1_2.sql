-- ================================================================================
-- PROCEDURE: sp_convert_saas_costs_to_focus_1_2
-- LOCATION: {project_id}.organizations (central dataset - created once)
-- OPERATES ON: {project_id}.{p_dataset_id} (per-customer dataset)
--
-- PURPOSE: Maps daily SaaS subscription costs to FinOps FOCUS 1.2 standard schema.
--
-- INPUTS:
--   p_project_id: GCP Project ID (dynamic)
--   p_dataset_id: Customer dataset ID (e.g., 'acme_corp_prod')
--   p_start_date: Start of target window (inclusive)
--   p_end_date:   End of target window (inclusive)
--
-- TABLES (in customer dataset):
--   READ:  saas_subscription_plan_costs_daily (fact table)
--   WRITE: cost_data_standard_1_2 (FOCUS 1.2 standard table)
--
-- LIMITS: Max 366 days per run.
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
  DECLARE v_sql STRING;

  -- 1. Parameter Validation
  ASSERT p_project_id IS NOT NULL AS "p_project_id cannot be NULL";
  ASSERT p_dataset_id IS NOT NULL AS "p_dataset_id cannot be NULL";
  ASSERT p_start_date IS NOT NULL AS "p_start_date cannot be NULL";
  ASSERT p_end_date IS NOT NULL AS "p_end_date cannot be NULL";
  ASSERT p_end_date >= p_start_date AS "p_end_date must be >= p_start_date";
  ASSERT DATE_DIFF(p_end_date, p_start_date, DAY) <= 366 AS "Date range cannot exceed 366 days";

  -- 2. Begin Transaction
  BEGIN TRANSACTION;

    -- 3. Delete existing SaaS data for date range (idempotent)
    -- Only delete records from this source system to allow other cost sources
    EXECUTE IMMEDIATE FORMAT("""
      DELETE FROM `%s.%s.cost_data_standard_1_2`
      WHERE ChargePeriodStart BETWEEN @p_start AND @p_end
        AND SourceSystem = 'saas_subscription_costs_daily'
    """, p_project_id, p_dataset_id)
    USING p_start_date AS p_start, p_end_date AS p_end;

    -- 4. Insert mapped data
    SET v_sql = FORMAT("""
      INSERT INTO `%s.%s.cost_data_standard_1_2` (
        BillingAccountId, BillingAccountName, BillingAccountType,
        SubAccountId, SubAccountName, SubAccountType,
        BilledCost, BillingCurrency,
        EffectiveCost, ListCost, PricingCurrency, PricingQuantity, PricingUnit, UnitPrice,
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
        NULL, NULL, NULL,
        spc.org_slug, 'Organization', 'Organization',
        spc.daily_cost, spc.currency,
        spc.daily_cost, spc.cycle_cost, spc.currency, spc.quantity, spc.unit,
        -- UnitPrice: For PER_SEAT, calculate per-seat price; for FLAT_FEE, use cycle_cost
        CASE
          WHEN spc.pricing_model = 'PER_SEAT' AND spc.seats > 0 THEN spc.cycle_cost / spc.seats
          ELSE spc.cycle_cost
        END,
        spc.quantity, spc.unit,
        'Subscription', 'Recurring',
        CONCAT('Subscription: ', spc.display_name, ' (', spc.plan_name, ')'),
        CASE WHEN spc.billing_cycle IN ('annual','yearly','year') THEN 'Annual' ELSE 'Monthly' END,
        'Calculated',
        spc.invoice_id_last, spc.provider, spc.provider, NULL,
        NULL, 'Global', 'Global',
        'SaaS', spc.display_name, spc.plan_name,
        'SaaS', 'Amortized',
        -- UsageType: Based on pricing_model, not billing_cycle
        CASE WHEN spc.pricing_model = 'FLAT_FEE' THEN 'Flat-fee Subscription' ELSE 'Seat-based Subscription' END,
        spc.plan_name, NULL, NULL, NULL,
        DATE_TRUNC(spc.cost_date, MONTH),
        DATE_SUB(DATE_ADD(DATE_TRUNC(spc.cost_date, MONTH), INTERVAL 1 MONTH), INTERVAL 1 DAY),
        spc.cost_date, spc.cost_date,
        'saas_subscription_costs_daily', spc.subscription_id, CURRENT_TIMESTAMP()
      FROM `%s.%s.saas_subscription_plan_costs_daily` spc
      WHERE spc.cost_date BETWEEN @p_start AND @p_end
    """, p_project_id, p_dataset_id, p_project_id, p_dataset_id);
    EXECUTE IMMEDIATE v_sql USING p_start_date AS p_start, p_end_date AS p_end;

  COMMIT TRANSACTION;

  -- 5. Output row count
  EXECUTE IMMEDIATE FORMAT("""
    SELECT COUNT(*) FROM `%s.%s.cost_data_standard_1_2`
    WHERE ChargePeriodStart BETWEEN @p_start AND @p_end
      AND SourceSystem = 'saas_subscription_costs_daily'
  """, p_project_id, p_dataset_id)
  INTO v_rows_inserted USING p_start_date AS p_start, p_end_date AS p_end;

  SELECT 'Stage 2 Complete (FOCUS 1.2)' AS status, v_rows_inserted AS rows_inserted, p_dataset_id AS dataset;

EXCEPTION WHEN ERROR THEN
  ROLLBACK TRANSACTION;
  RAISE USING MESSAGE = CONCAT('sp_convert_saas_costs_to_focus_1_2 Failed: ', @@error.message);
END;
