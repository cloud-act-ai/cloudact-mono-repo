-- Procedure: sp_convert_subscription_costs_daily_to_standard_1_2
-- Stage 2: Map subscription daily costs into the standardized cost table (complete FOCUS v1.2 column set).
CREATE OR REPLACE PROCEDURE `gac-prod-471220.procedure_testsing`.sp_convert_subscription_costs_daily_to_standard_1_2(
  p_start_date DATE,
  p_end_date DATE,
  p_org_slug STRING
)
BEGIN
  --------------------------------------------------------------------------------
  -- PROCEDURE: sp_convert_subscription_costs_daily_to_standard_1_2
  -- PURPOSE: Maps daily subscription cost data to the FOCUS 1.2 Standard schema.
  --          DYNAMIC VERSION.
  -- 
  -- INPUTS:
  --   p_start_date: Start of target window (inclusive)
  --   p_end_date:   End of target window (inclusive)
  --   p_org_slug:   (Optional) Run for specific org only. If NULL, runs for all.
  --------------------------------------------------------------------------------

  -- === DYNAMIC CONFIGURATION ===
  DECLARE v_project_id STRING DEFAULT 'gac-prod-471220';
  DECLARE v_dataset_id STRING DEFAULT 'procedure_testsing';
  
  -- Internal Variables
  DECLARE v_last_source_update TIMESTAMP;
  DECLARE v_last_dest_update TIMESTAMP;
  DECLARE v_sql STRING;

  -- 1. Parameter Validation
  ASSERT p_start_date IS NOT NULL AS "p_start_date cannot be NULL";
  ASSERT p_end_date IS NOT NULL AS "p_end_date cannot be NULL";
  ASSERT p_end_date >= p_start_date AS "p_end_date must be >= p_start_date";

  -- 2. Smart Skip / Caching Logic (Dynamic)
  
  -- Check Source
  SET v_sql = FORMAT("""
    SELECT MAX(updated_at) 
    FROM `%s.%s.subscription_plan_costs_daily`
    WHERE cost_date BETWEEN @p_start AND @p_end
      AND (@p_org_slug IS NULL OR org_slug = @p_org_slug)
  """, v_project_id, v_dataset_id);
  EXECUTE IMMEDIATE v_sql INTO v_last_source_update USING p_start_date AS p_start, p_end_date AS p_end, p_org_slug AS p_org_slug;

  -- Check Destination
  SET v_sql = FORMAT("""
    SELECT MIN(UpdatedAt)
    FROM `%s.%s.cost_data_standard_1_2`
    WHERE ChargePeriodStart BETWEEN @p_start AND @p_end
      AND (@p_org_slug IS NULL OR SubAccountId = @p_org_slug)
  """, v_project_id, v_dataset_id);
  EXECUTE IMMEDIATE v_sql INTO v_last_dest_update USING p_start_date AS p_start, p_end_date AS p_end, p_org_slug AS p_org_slug;

  -- Skip Logic
  IF v_last_dest_update IS NOT NULL 
     AND v_last_source_update IS NOT NULL 
     AND v_last_dest_update >= v_last_source_update THEN
    SELECT 'Skipping Stage 2: Data is already up to date.' AS status, 
           v_last_source_update AS source_ts, 
           v_last_dest_update AS dest_ts;
    RETURN;
  END IF;

  -- 3. Begin Atomic Transaction
  BEGIN TRANSACTION;

    -- 4. Clear Existing Data (Dynamic)
    SET v_sql = FORMAT("""
      DELETE FROM `%s.%s.cost_data_standard_1_2`
      WHERE ChargePeriodStart BETWEEN @p_start AND @p_end
        AND (@p_org_slug IS NULL OR SubAccountId = @p_org_slug)
    """, v_project_id, v_dataset_id);
    EXECUTE IMMEDIATE v_sql USING p_start_date AS p_start, p_end_date AS p_end, p_org_slug AS p_org_slug;

    -- 5. Data Mapping & Insertion (Dynamic)
    SET v_sql = FORMAT("""
      INSERT INTO `%s.%s.cost_data_standard_1_2` (
        BillingAccountId, BillingAccountName, BillingAccountType,
        SubAccountId, SubAccountName, SubAccountType,
        BilledCost, BillingCurrency,
        EffectiveCost, ListCost, PricingCurrency,
        PricingQuantity, PricingUnit, UnitPrice,
        ConsumedQuantity, ConsumedUnit,
        ChargeCategory, ChargeClass, ChargeDescription, ChargeFrequency,
        ChargeOrigination,
        InvoiceId, InvoiceIssuer,
        Provider, Publisher,
        AvailabilityZone, RegionId, RegionName,
        ServiceName, ServiceSubcategory,
        x_ServiceModel, x_AmortizationClass, UsageType,
        SkuId, SkuMeter, SkuPriceDetails, SkuPriceId,
        BillingPeriodStart, BillingPeriodEnd,
        ChargePeriodStart, ChargePeriodEnd,
        SourceSystem, SourceRecordId, UpdatedAt
      )
      SELECT
        NULL AS BillingAccountId, 
        NULL AS BillingAccountName, 
        NULL AS BillingAccountType,
        
        spc.org_slug AS SubAccountId,
        'Organization' AS SubAccountName,
        'Organization' AS SubAccountType,

        spc.daily_cost AS BilledCost,
        spc.currency AS BillingCurrency,

        NULL AS EffectiveCost, 
        NULL AS ListCost, 
        NULL AS PricingCurrency,
        NULL AS PricingQuantity, 
        NULL AS PricingUnit, 
        NULL AS UnitPrice,

        spc.quantity AS ConsumedQuantity,
        spc.unit AS ConsumedUnit,

        'Subscription' AS ChargeCategory,
        'Recurring' AS ChargeClass,
        CONCAT('Subscription: ', spc.display_name, ' (', spc.plan_name, ')') AS ChargeDescription,
        
        CASE
          WHEN spc.billing_cycle IN ('annual','yearly','year') THEN 'Annual'
          WHEN spc.billing_cycle IN ('monthly','month') THEN 'Monthly'
          ELSE NULL
        END AS ChargeFrequency,
        'Calculated' AS ChargeOrigination,

        spc.invoice_id_last AS InvoiceId,
        spc.provider AS InvoiceIssuer, 

        spc.provider AS Provider,
        NULL AS Publisher,

        NULL AS AvailabilityZone,
        'Global' AS RegionId, 
        'Global' AS RegionName,
        
        spc.display_name AS ServiceName,
        spc.plan_name AS ServiceSubcategory,
        
        'SaaS' AS x_ServiceModel,
        'Amortized' AS x_AmortizationClass,
        CASE 
          WHEN spc.billing_cycle IN ('annual','yearly','year') THEN 'Flat-fee Subscription'
          ELSE 'Seat-based Subscription' 
        END AS UsageType,

        spc.plan_name AS SkuId,
        NULL AS SkuMeter, 
        NULL AS SkuPriceDetails, 
        NULL AS SkuPriceId,

        DATE_TRUNC(spc.cost_date, MONTH) AS BillingPeriodStart,
        DATE_SUB(DATE_ADD(DATE_TRUNC(spc.cost_date, MONTH), INTERVAL 1 MONTH), INTERVAL 1 DAY) AS BillingPeriodEnd,
        
        spc.cost_date AS ChargePeriodStart,
        spc.cost_date AS ChargePeriodEnd,

        'subscription_costs_daily' AS SourceSystem,
        spc.subscription_id AS SourceRecordId,
        CURRENT_TIMESTAMP() AS UpdatedAt
      FROM `%s.%s.subscription_plan_costs_daily` spc
      WHERE spc.cost_date BETWEEN @p_start AND @p_end
        AND (@p_org_slug IS NULL OR spc.org_slug = @p_org_slug)
    """, v_project_id, v_dataset_id, v_project_id, v_dataset_id);
    
    EXECUTE IMMEDIATE v_sql USING p_start_date AS p_start, p_end_date AS p_end, p_org_slug AS p_org_slug;

  -- 6. Commit Transaction
  COMMIT TRANSACTION;
  
  -- 7. Verification Output
  SELECT 'Stage 2 Completed Successfully (Dynamic)' AS status;

EXCEPTION WHEN ERROR THEN
  SELECT @@error.message;
  RAISE USING MESSAGE = @@error.message;
END;
