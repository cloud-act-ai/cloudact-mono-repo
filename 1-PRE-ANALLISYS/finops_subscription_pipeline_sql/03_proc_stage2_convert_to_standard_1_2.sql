CREATE OR REPLACE PROCEDURE `gac-prod-471220.procedure_testsing`.sp_convert_saas_subscription_costs_daily_to_standard_1_2(
  p_start_date DATE,
  p_end_date DATE,
  p_org_slug STRING
)
OPTIONS(strict_mode=TRUE)
BEGIN
  --------------------------------------------------------------------------------
  -- PROCEDURE: sp_convert_saas_subscription_costs_daily_to_standard_1_2
  -- PURPOSE: Maps daily subscription cost data to FOCUS 1.2 Standard schema.
  -- INPUTS:
  --   p_start_date: Start of target window (inclusive)
  --   p_end_date:   End of target window (inclusive)
  --   p_org_slug:   (Optional) Run for specific org only. NULL = all orgs.
  -- LIMITS: Max 366 days per run.
  --------------------------------------------------------------------------------

  DECLARE v_project_id STRING DEFAULT 'gac-prod-471220';
  DECLARE v_dataset_id STRING DEFAULT 'procedure_testsing';
  DECLARE v_rows_inserted INT64 DEFAULT 0;
  DECLARE v_sql STRING;

  -- 1. Parameter Validation
  ASSERT p_start_date IS NOT NULL AS "p_start_date cannot be NULL";
  ASSERT p_end_date IS NOT NULL AS "p_end_date cannot be NULL";
  ASSERT p_end_date >= p_start_date AS "p_end_date must be >= p_start_date";
  ASSERT DATE_DIFF(p_end_date, p_start_date, DAY) <= 366 AS "Date range cannot exceed 366 days";

  -- 2. Begin Transaction
  BEGIN TRANSACTION;

    -- 3. Delete existing data for date range
    IF p_org_slug IS NOT NULL THEN
      EXECUTE IMMEDIATE FORMAT("""
        DELETE FROM `%s.%s.cost_data_standard_1_2`
        WHERE ChargePeriodStart BETWEEN @p_start AND @p_end
          AND SubAccountId = @p_org
      """, v_project_id, v_dataset_id)
      USING p_start_date AS p_start, p_end_date AS p_end, p_org_slug AS p_org;
    ELSE
      EXECUTE IMMEDIATE FORMAT("""
        DELETE FROM `%s.%s.cost_data_standard_1_2`
        WHERE ChargePeriodStart BETWEEN @p_start AND @p_end
      """, v_project_id, v_dataset_id)
      USING p_start_date AS p_start, p_end_date AS p_end;
    END IF;

    -- 4. Insert mapped data
    IF p_org_slug IS NOT NULL THEN
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
          ServiceName, ServiceSubcategory,
          x_ServiceModel, x_AmortizationClass, UsageType,
          SkuId, SkuMeter, SkuPriceDetails, SkuPriceId,
          BillingPeriodStart, BillingPeriodEnd, ChargePeriodStart, ChargePeriodEnd,
          SourceSystem, SourceRecordId, UpdatedAt
        )
        SELECT
          NULL, NULL, NULL,
          spc.org_slug, 'Organization', 'Organization',
          spc.daily_cost, spc.currency,
          NULL, NULL, NULL, NULL, NULL, NULL,
          spc.quantity, spc.unit,
          'Subscription', 'Recurring',
          CONCAT('Subscription: ', spc.display_name, ' (', spc.plan_name, ')'),
          CASE WHEN spc.billing_cycle IN ('annual','yearly','year') THEN 'Annual' ELSE 'Monthly' END,
          'Calculated',
          spc.invoice_id_last, spc.provider, spc.provider, NULL,
          NULL, 'Global', 'Global',
          spc.display_name, spc.plan_name,
          'SaaS', 'Amortized',
          CASE WHEN spc.billing_cycle IN ('annual','yearly','year') THEN 'Flat-fee Subscription' ELSE 'Seat-based Subscription' END,
          spc.plan_name, NULL, NULL, NULL,
          DATE_TRUNC(spc.cost_date, MONTH),
          DATE_SUB(DATE_ADD(DATE_TRUNC(spc.cost_date, MONTH), INTERVAL 1 MONTH), INTERVAL 1 DAY),
          spc.cost_date, spc.cost_date,
          'subscription_costs_daily', spc.subscription_id, CURRENT_TIMESTAMP()
        FROM `%s.%s.saas_subscription_plan_costs_daily` spc
        WHERE spc.cost_date BETWEEN @p_start AND @p_end
          AND spc.org_slug = @p_org
      """, v_project_id, v_dataset_id, v_project_id, v_dataset_id);
      EXECUTE IMMEDIATE v_sql USING p_start_date AS p_start, p_end_date AS p_end, p_org_slug AS p_org;
    ELSE
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
          ServiceName, ServiceSubcategory,
          x_ServiceModel, x_AmortizationClass, UsageType,
          SkuId, SkuMeter, SkuPriceDetails, SkuPriceId,
          BillingPeriodStart, BillingPeriodEnd, ChargePeriodStart, ChargePeriodEnd,
          SourceSystem, SourceRecordId, UpdatedAt
        )
        SELECT
          NULL, NULL, NULL,
          spc.org_slug, 'Organization', 'Organization',
          spc.daily_cost, spc.currency,
          NULL, NULL, NULL, NULL, NULL, NULL,
          spc.quantity, spc.unit,
          'Subscription', 'Recurring',
          CONCAT('Subscription: ', spc.display_name, ' (', spc.plan_name, ')'),
          CASE WHEN spc.billing_cycle IN ('annual','yearly','year') THEN 'Annual' ELSE 'Monthly' END,
          'Calculated',
          spc.invoice_id_last, spc.provider, spc.provider, NULL,
          NULL, 'Global', 'Global',
          spc.display_name, spc.plan_name,
          'SaaS', 'Amortized',
          CASE WHEN spc.billing_cycle IN ('annual','yearly','year') THEN 'Flat-fee Subscription' ELSE 'Seat-based Subscription' END,
          spc.plan_name, NULL, NULL, NULL,
          DATE_TRUNC(spc.cost_date, MONTH),
          DATE_SUB(DATE_ADD(DATE_TRUNC(spc.cost_date, MONTH), INTERVAL 1 MONTH), INTERVAL 1 DAY),
          spc.cost_date, spc.cost_date,
          'subscription_costs_daily', spc.subscription_id, CURRENT_TIMESTAMP()
        FROM `%s.%s.saas_subscription_plan_costs_daily` spc
        WHERE spc.cost_date BETWEEN @p_start AND @p_end
      """, v_project_id, v_dataset_id, v_project_id, v_dataset_id);
      EXECUTE IMMEDIATE v_sql USING p_start_date AS p_start, p_end_date AS p_end;
    END IF;

  COMMIT TRANSACTION;

  -- 5. Output row count
  EXECUTE IMMEDIATE FORMAT("""
    SELECT COUNT(*) FROM `%s.%s.cost_data_standard_1_2`
    WHERE ChargePeriodStart BETWEEN @p_start AND @p_end
  """, v_project_id, v_dataset_id)
  INTO v_rows_inserted USING p_start_date AS p_start, p_end_date AS p_end;

  SELECT 'Stage 2 Complete' AS status, v_rows_inserted AS rows_inserted;

EXCEPTION WHEN ERROR THEN
  ROLLBACK TRANSACTION;
  RAISE USING MESSAGE = CONCAT('Stage 2 Failed: ', @@error.message);
END;
