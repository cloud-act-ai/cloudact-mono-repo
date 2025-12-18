-- ================================================================================
-- PROCEDURE: sp_convert_saas_costs_to_focus_1_3
-- LOCATION: {project_id}.organizations (central dataset)
-- OPERATES ON: {project_id}.{p_dataset_id} (per-customer dataset)
--
-- PURPOSE: Maps daily SaaS subscription costs to FinOps FOCUS 1.3 standard.
--          JOINs with saas_subscription_plans to include all provider/plan metadata.
--
-- FOCUS 1.3 KEY CHANGES FROM 1.2:
--   - ProviderName/PublisherName → Deprecated, use ServiceProviderName/HostProviderName
--   - InvoiceIssuer → InvoiceIssuerName
--   - Added: HostProviderName, ServiceProviderName, InvoiceIssuerName
--   - SourceSystem/SourceRecordId/UpdatedAt → x_SourceSystem/x_SourceRecordId/x_UpdatedAt
--   - Tags stored as JSON instead of REPEATED RECORD
--   - ContractApplied field for linking to contract_commitment_1_3
--
-- FOCUS 1.3 MAPPING:
--   - PricingQuantity/ConsumedQuantity: seats for PER_SEAT, 1 for FLAT_FEE
--   - PricingUnit/ConsumedUnit: "seat" for PER_SEAT, "subscription" for FLAT_FEE
--   - BilledCost: daily_cost (amortized)
--   - EffectiveCost: daily_cost (same for subscriptions)
--   - ListCost: cycle_cost (full billing period cost)
--   - ContractedCost: monthly_run_rate (projected monthly cost)
--   - ServiceProviderName: SaaS provider name (OpenAI, Slack, Canva, etc.)
--   - HostProviderName: Self-Hosted (SaaS runs on provider infra)
--   - InvoiceIssuerName: Provider who issues invoice
--
-- ================================================================================

CREATE OR REPLACE PROCEDURE `{project_id}.organizations`.sp_convert_saas_costs_to_focus_1_3(
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
      DELETE FROM `%s.%s.cost_data_standard_1_3`
      WHERE ChargePeriodStart BETWEEN @p_start AND @p_end
        AND x_SourceSystem = 'saas_subscription_costs_daily'
    """, p_project_id, p_dataset_id)
    USING p_start_date AS p_start, p_end_date AS p_end;

    -- 3. Insert mapped data with metadata from subscription plans (FOCUS 1.3 compliant)
    EXECUTE IMMEDIATE FORMAT("""
      INSERT INTO `%s.%s.cost_data_standard_1_3` (
        -- Billing Account
        BillingAccountId, BillingAccountName, BillingAccountType,
        -- Sub Account
        SubAccountId, SubAccountName, SubAccountType,
        -- Cost Allocation (new in FOCUS 1.3)
        AllocatedMethodId, AllocatedMethodDetails, AllocatedResourceId, AllocatedResourceName, AllocatedTags,
        -- Costs (REQUIRED fields)
        BilledCost, BillingCurrency, ContractedCost, EffectiveCost, ListCost,
        -- Unit Prices
        ContractedUnitPrice, ListUnitPrice,
        -- Pricing
        PricingCurrency, PricingCurrencyContractedUnitPrice, PricingCurrencyEffectiveCost, PricingCurrencyListUnitPrice,
        PricingQuantity, PricingUnit, PricingCategory,
        -- Consumed
        ConsumedQuantity, ConsumedUnit,
        -- Charge metadata
        ChargeCategory, ChargeClass, ChargeDescription, ChargeFrequency,
        -- Billing Periods (TIMESTAMP in FOCUS 1.3)
        BillingPeriodStart, BillingPeriodEnd, ChargePeriodStart, ChargePeriodEnd,
        -- Capacity Reservation
        CapacityReservationId, CapacityReservationStatus,
        -- Commitment Discount
        CommitmentDiscountCategory, CommitmentDiscountId, CommitmentDiscountName,
        CommitmentDiscountQuantity, CommitmentDiscountStatus, CommitmentDiscountType, CommitmentDiscountUnit,
        -- Contract (new in FOCUS 1.3)
        ContractApplied,
        -- Provider fields (FOCUS 1.3 changes)
        HostProviderName, InvoiceIssuerName, ServiceProviderName,
        -- Deprecated fields (kept for backward compatibility)
        ProviderName, PublisherName,
        -- Invoice
        InvoiceId,
        -- Region
        RegionId, RegionName,
        -- Resource
        ResourceId, ResourceName, ResourceType,
        -- Service (REQUIRED fields)
        ServiceCategory, ServiceName, ServiceSubcategory,
        -- SKU
        SkuId, SkuMeter, SkuPriceDetails, SkuPriceId,
        -- Tags (JSON in FOCUS 1.3)
        Tags,
        -- Extension fields (x_ prefix per FOCUS convention)
        x_SourceSystem, x_SourceRecordId, x_AmortizationClass, x_ServiceModel,
        x_CostAllocationKey, x_ExchangeRateUsed, x_OriginalCurrency, x_OriginalCost, x_UpdatedAt,
        -- Org-specific extension fields (from org_profiles)
        x_OrgSlug, x_OrgName, x_OrgOwnerEmail, x_OrgDefaultCurrency, x_OrgDefaultTimezone,
        x_OrgDefaultCountry, x_OrgSubscriptionPlan, x_OrgSubscriptionStatus,
        x_PipelineId, x_PipelineRunId, x_DataQualityScore, x_CreatedAt
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

        -- Cost Allocation (NULL for direct SaaS costs - no allocation)
        NULL AS AllocatedMethodId,
        NULL AS AllocatedMethodDetails,
        NULL AS AllocatedResourceId,
        NULL AS AllocatedResourceName,
        NULL AS AllocatedTags,

        -- Costs (REQUIRED - NUMERIC type)
        spc.daily_cost AS BilledCost,
        spc.currency AS BillingCurrency,
        spc.monthly_run_rate AS ContractedCost,
        spc.daily_cost AS EffectiveCost,
        spc.cycle_cost AS ListCost,

        -- Unit Prices
        CAST(sp.unit_price AS NUMERIC) AS ContractedUnitPrice,
        CAST(sp.unit_price AS NUMERIC) AS ListUnitPrice,

        -- Pricing (multi-currency support)
        spc.currency AS PricingCurrency,
        CAST(sp.unit_price AS NUMERIC) AS PricingCurrencyContractedUnitPrice,
        spc.daily_cost AS PricingCurrencyEffectiveCost,
        CAST(sp.unit_price AS NUMERIC) AS PricingCurrencyListUnitPrice,
        CASE WHEN spc.pricing_model = 'PER_SEAT' THEN CAST(spc.seats AS NUMERIC) ELSE 1 END AS PricingQuantity,
        CASE WHEN spc.pricing_model = 'PER_SEAT' THEN 'seat' ELSE 'subscription' END AS PricingUnit,
        spc.pricing_model AS PricingCategory,

        -- Consumed
        CASE WHEN spc.pricing_model = 'PER_SEAT' THEN CAST(spc.seats AS NUMERIC) ELSE 1 END AS ConsumedQuantity,
        CASE WHEN spc.pricing_model = 'PER_SEAT' THEN 'seat' ELSE 'subscription' END AS ConsumedUnit,

        -- Charge metadata (REQUIRED: ChargeCategory)
        'Subscription' AS ChargeCategory,
        CASE WHEN sp.auto_renew = TRUE THEN 'Correction' ELSE NULL END AS ChargeClass,
        COALESCE(sp.notes, CONCAT(spc.display_name, ' (', spc.plan_name, ')')) AS ChargeDescription,
        CASE
          WHEN spc.billing_cycle IN ('annual', 'yearly', 'year') THEN 'Recurring'
          WHEN spc.billing_cycle IN ('quarterly', 'quarter') THEN 'Recurring'
          WHEN spc.billing_cycle IN ('weekly', 'week') THEN 'Recurring'
          ELSE 'Recurring'
        END AS ChargeFrequency,

        -- Billing Periods (TIMESTAMP in FOCUS 1.3)
        TIMESTAMP(DATE_TRUNC(spc.cost_date, MONTH)) AS BillingPeriodStart,
        TIMESTAMP(LAST_DAY(spc.cost_date)) AS BillingPeriodEnd,
        TIMESTAMP(spc.cost_date) AS ChargePeriodStart,
        TIMESTAMP(spc.cost_date) AS ChargePeriodEnd,

        -- Capacity Reservation (NULL for SaaS)
        NULL AS CapacityReservationId,
        NULL AS CapacityReservationStatus,

        -- Commitment/Discount fields
        sp.discount_type AS CommitmentDiscountCategory,
        CASE WHEN sp.discount_value IS NOT NULL THEN CONCAT(spc.subscription_id, '_discount') ELSE NULL END AS CommitmentDiscountId,
        CASE
          WHEN sp.discount_type = 'percent' THEN CONCAT(CAST(sp.discount_value AS STRING), ' percent discount')
          WHEN sp.discount_type = 'fixed' THEN CONCAT(CAST(sp.discount_value AS STRING), ' off')
          ELSE NULL
        END AS CommitmentDiscountName,
        CAST(sp.discount_value AS NUMERIC) AS CommitmentDiscountQuantity,
        CASE WHEN sp.discount_value IS NOT NULL THEN 'Used' ELSE NULL END AS CommitmentDiscountStatus,
        sp.discount_type AS CommitmentDiscountType,
        CASE WHEN sp.discount_type = 'percent' THEN 'percent' WHEN sp.discount_type = 'fixed' THEN spc.currency ELSE NULL END AS CommitmentDiscountUnit,

        -- Contract Applied (JSON linking to contract_commitment_1_3)
        CASE
          WHEN sp.contract_id IS NOT NULL THEN
            JSON_OBJECT('ContractId', sp.contract_id, 'SubscriptionId', spc.subscription_id)
          ELSE NULL
        END AS ContractApplied,

        -- Provider fields (FOCUS 1.3 - REQUIRED)
        'Self-Hosted' AS HostProviderName,  -- SaaS runs on provider's own infrastructure
        spc.provider AS InvoiceIssuerName,  -- Provider issues the invoice
        spc.provider AS ServiceProviderName, -- Provider delivers the service

        -- Deprecated fields (kept for backward compatibility)
        spc.provider AS ProviderName,
        INITCAP(REPLACE(spc.provider, '_', ' ')) AS PublisherName,

        -- Invoice
        spc.invoice_id_last AS InvoiceId,

        -- Region (Global for SaaS)
        'global' AS RegionId,
        'Global' AS RegionName,

        -- Resource identification
        spc.subscription_id AS ResourceId,
        COALESCE(spc.display_name, spc.plan_name) AS ResourceName,
        'SaaS Subscription' AS ResourceType,

        -- Service (REQUIRED fields)
        'SaaS' AS ServiceCategory,
        COALESCE(spc.display_name, spc.provider) AS ServiceName,
        COALESCE(sp.category, spc.plan_name) AS ServiceSubcategory,

        -- SKU
        CONCAT(spc.provider, '/', spc.plan_name) AS SkuId,
        spc.billing_cycle AS SkuMeter,
        JSON_OBJECT(
          'pricing_model', spc.pricing_model,
          'seats', CAST(spc.seats AS STRING),
          'billing_cycle', spc.billing_cycle
        ) AS SkuPriceDetails,
        spc.subscription_id AS SkuPriceId,

        -- Tags (JSON in FOCUS 1.3)
        JSON_OBJECT(
          'provider', spc.provider,
          'plan_name', spc.plan_name,
          'billing_cycle', spc.billing_cycle,
          'pricing_model', spc.pricing_model
        ) AS Tags,

        -- Extension fields (x_ prefix per FOCUS convention)
        'saas_subscription_costs_daily' AS x_SourceSystem,
        spc.subscription_id AS x_SourceRecordId,
        'Amortized' AS x_AmortizationClass,
        'SaaS' AS x_ServiceModel,
        NULL AS x_CostAllocationKey,
        COALESCE(spc.exchange_rate_used, 1.0) AS x_ExchangeRateUsed,
        spc.source_currency AS x_OriginalCurrency,
        spc.source_price AS x_OriginalCost,
        CURRENT_TIMESTAMP() AS x_UpdatedAt,

        -- Org-specific extension fields (from org_profiles and org_subscriptions)
        spc.org_slug AS x_OrgSlug,
        op.company_name AS x_OrgName,
        op.admin_email AS x_OrgOwnerEmail,
        op.default_currency AS x_OrgDefaultCurrency,
        op.default_timezone AS x_OrgDefaultTimezone,
        op.default_country AS x_OrgDefaultCountry,
        os.plan_name AS x_OrgSubscriptionPlan,
        os.status AS x_OrgSubscriptionStatus,
        'saas_subscription_costs_pipeline' AS x_PipelineId,
        GENERATE_UUID() AS x_PipelineRunId,
        1.0 AS x_DataQualityScore,  -- Default to 1.0, can be updated by DQ checks
        CURRENT_TIMESTAMP() AS x_CreatedAt

      FROM `%s.%s.saas_subscription_plan_costs_daily` spc
      LEFT JOIN `%s.%s.saas_subscription_plans` sp
        ON spc.subscription_id = sp.subscription_id
        AND spc.org_slug = sp.org_slug
      LEFT JOIN `%s.organizations.org_profiles` op
        ON spc.org_slug = op.org_slug
      LEFT JOIN `%s.organizations.org_subscriptions` os
        ON spc.org_slug = os.org_slug
        AND os.status = 'ACTIVE'
      WHERE spc.cost_date BETWEEN @p_start AND @p_end
    """, p_project_id, p_dataset_id, p_project_id, p_dataset_id, p_project_id, p_project_id)
    USING p_start_date AS p_start, p_end_date AS p_end;

  COMMIT TRANSACTION;

  -- 4. Get row count
  EXECUTE IMMEDIATE FORMAT("""
    SELECT COUNT(*) FROM `%s.%s.cost_data_standard_1_3`
    WHERE ChargePeriodStart BETWEEN @p_start AND @p_end
      AND x_SourceSystem = 'saas_subscription_costs_daily'
  """, p_project_id, p_dataset_id)
  INTO v_rows_inserted USING TIMESTAMP(p_start_date) AS p_start, TIMESTAMP(p_end_date) AS p_end;

  SELECT 'FOCUS 1.3 Conversion Complete' AS status,
         v_rows_inserted AS rows_inserted,
         p_dataset_id AS dataset;

EXCEPTION WHEN ERROR THEN
  ROLLBACK TRANSACTION;
  RAISE USING MESSAGE = CONCAT('sp_convert_saas_costs_to_focus_1_3 Failed: ', @@error.message);
END;
