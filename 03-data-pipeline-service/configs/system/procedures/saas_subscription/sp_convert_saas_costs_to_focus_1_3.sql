-- ================================================================================
-- PROCEDURE: sp_convert_saas_costs_to_focus_1_3
-- LOCATION: {project_id}.organizations (central dataset)
-- OPERATES ON: {project_id}.{p_dataset_id} (per-customer dataset)
--
-- PURPOSE: Maps daily SaaS subscription costs to FinOps FOCUS 1.3 standard.
--          JOINs with saas_subscription_plans to include all provider/plan metadata.
--          ALL FIELDS populated with sensible defaults - no NULL values for important fields.
--
-- FOCUS 1.3 KEY CHANGES FROM 1.2:
--   - ProviderName/PublisherName → Deprecated, use ServiceProviderName/HostProviderName
--   - InvoiceIssuer → InvoiceIssuerName
--   - Added: HostProviderName, ServiceProviderName, InvoiceIssuerName
--   - SourceSystem/SourceRecordId/UpdatedAt → x_SourceSystem/x_SourceRecordId/x_UpdatedAt
--   - Tags stored as JSON instead of REPEATED RECORD
--   - ContractApplied field for linking to contract_commitment_1_3
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
  DECLARE v_org_slug STRING;

  -- Extract org_slug from dataset_id (remove _prod/_stage/_dev/_local suffix)
  SET v_org_slug = REGEXP_REPLACE(p_dataset_id, '_prod$|_stage$|_dev$|_local$', '');

  -- 1. Validation
  ASSERT p_project_id IS NOT NULL AS "p_project_id cannot be NULL";
  ASSERT p_dataset_id IS NOT NULL AS "p_dataset_id cannot be NULL";
  ASSERT p_start_date IS NOT NULL AS "p_start_date cannot be NULL";
  ASSERT p_end_date IS NOT NULL AS "p_end_date cannot be NULL";
  ASSERT p_end_date >= p_start_date AS "p_end_date must be >= p_start_date";

  BEGIN TRANSACTION;

    -- 2. Delete existing SaaS data for date range (only this source)
    -- Note: ChargePeriodStart is TIMESTAMP, so cast DATE params to TIMESTAMP
    EXECUTE IMMEDIATE FORMAT("""
      DELETE FROM `%s.%s.cost_data_standard_1_3`
      WHERE DATE(ChargePeriodStart) BETWEEN @p_start AND @p_end
        AND x_SourceSystem = 'saas_subscription_costs_daily'
    """, p_project_id, p_dataset_id)
    USING p_start_date AS p_start, p_end_date AS p_end;

    -- 3. Insert mapped data with ALL fields populated (FOCUS 1.3 compliant)
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
        x_PipelineId, x_PipelineRunId, x_DataQualityScore, x_CreatedAt,
        -- Required pipeline lineage fields (FOCUS extension)
        x_CredentialId, x_PipelineRunDate, x_IngestedAt,
        -- Hierarchy extension fields for cost allocation
        x_HierarchyDeptId, x_HierarchyDeptName,
        x_HierarchyProjectId, x_HierarchyProjectName,
        x_HierarchyTeamId, x_HierarchyTeamName
      )
      SELECT
        -- Billing Account (REQUIRED - use subscription_id as fallback)
        COALESCE(sp.contract_id, spc.subscription_id) AS BillingAccountId,
        CONCAT(INITCAP(REPLACE(spc.provider, '_', ' ')), ' - ', UPPER(spc.plan_name)) AS BillingAccountName,
        CASE WHEN sp.contract_id IS NOT NULL THEN 'Contract' ELSE 'Subscription' END AS BillingAccountType,

        -- Sub Account (Org) - ALWAYS populated from spc
        spc.org_slug AS SubAccountId,
        COALESCE(op.company_name, spc.org_slug) AS SubAccountName,
        'Organization' AS SubAccountType,

        -- Cost Allocation (Direct costs - no allocation needed)
        'DIRECT' AS AllocatedMethodId,
        JSON_OBJECT('method', 'direct', 'allocation_type', 'subscription') AS AllocatedMethodDetails,
        spc.subscription_id AS AllocatedResourceId,
        COALESCE(spc.display_name, CONCAT(spc.provider, ' ', spc.plan_name)) AS AllocatedResourceName,
        JSON_OBJECT('cost_center', COALESCE(sp.department, 'IT'), 'owner', COALESCE(sp.owner_email, 'unassigned')) AS AllocatedTags,

        -- Costs (REQUIRED - NUMERIC type, with fallbacks)
        COALESCE(spc.daily_cost, 0) AS BilledCost,
        COALESCE(spc.currency, 'USD') AS BillingCurrency,
        COALESCE(spc.monthly_run_rate, spc.daily_cost * 30) AS ContractedCost,
        COALESCE(spc.daily_cost, 0) AS EffectiveCost,
        COALESCE(spc.cycle_cost, spc.daily_cost * 30) AS ListCost,

        -- Unit Prices (with fallbacks)
        CAST(COALESCE(sp.unit_price, 0) AS NUMERIC) AS ContractedUnitPrice,
        CAST(COALESCE(sp.unit_price, 0) AS NUMERIC) AS ListUnitPrice,

        -- Pricing (multi-currency support with fallbacks)
        COALESCE(spc.currency, 'USD') AS PricingCurrency,
        CAST(COALESCE(sp.unit_price, 0) AS NUMERIC) AS PricingCurrencyContractedUnitPrice,
        COALESCE(spc.daily_cost, 0) AS PricingCurrencyEffectiveCost,
        CAST(COALESCE(sp.unit_price, 0) AS NUMERIC) AS PricingCurrencyListUnitPrice,
        CASE WHEN spc.pricing_model = 'PER_SEAT' THEN CAST(COALESCE(spc.seats, 1) AS NUMERIC) ELSE CAST(1 AS NUMERIC) END AS PricingQuantity,
        CASE WHEN spc.pricing_model = 'PER_SEAT' THEN 'seat' ELSE 'subscription' END AS PricingUnit,
        COALESCE(spc.pricing_model, 'FLAT_FEE') AS PricingCategory,

        -- Consumed (with fallbacks)
        CASE WHEN spc.pricing_model = 'PER_SEAT' THEN CAST(COALESCE(spc.seats, 1) AS NUMERIC) ELSE CAST(1 AS NUMERIC) END AS ConsumedQuantity,
        CASE WHEN spc.pricing_model = 'PER_SEAT' THEN 'seat' ELSE 'subscription' END AS ConsumedUnit,

        -- Charge metadata (REQUIRED: ChargeCategory - always populated)
        'Subscription' AS ChargeCategory,
        CASE
          WHEN sp.auto_renew = TRUE THEN 'Regular'
          ELSE 'Regular'
        END AS ChargeClass,
        CONCAT(
          INITCAP(REPLACE(spc.provider, '_', ' ')), ' ',
          UPPER(spc.plan_name), ' - ',
          CASE WHEN spc.pricing_model = 'PER_SEAT' THEN CONCAT(CAST(spc.seats AS STRING), ' seats') ELSE 'Flat fee' END,
          ' (', spc.billing_cycle, ')'
        ) AS ChargeDescription,
        'Recurring' AS ChargeFrequency,

        -- Billing Periods (TIMESTAMP in FOCUS 1.3) - Daily grain
        TIMESTAMP(DATE_TRUNC(spc.cost_date, MONTH)) AS BillingPeriodStart,
        TIMESTAMP(LAST_DAY(spc.cost_date, MONTH)) AS BillingPeriodEnd,
        TIMESTAMP(spc.cost_date) AS ChargePeriodStart,
        TIMESTAMP(DATE_ADD(spc.cost_date, INTERVAL 1 DAY)) AS ChargePeriodEnd,

        -- Capacity Reservation (N/A for SaaS - provide defaults)
        'N/A' AS CapacityReservationId,
        'Not Applicable' AS CapacityReservationStatus,

        -- Commitment/Discount fields (with sensible defaults)
        COALESCE(sp.discount_type, 'None') AS CommitmentDiscountCategory,
        COALESCE(
          CASE WHEN sp.discount_value IS NOT NULL AND sp.discount_value > 0 THEN CONCAT(spc.subscription_id, '_discount') END,
          'no_discount'
        ) AS CommitmentDiscountId,
        CASE
          WHEN sp.discount_type = 'percent' AND sp.discount_value > 0 THEN CONCAT(CAST(sp.discount_value AS STRING), ' percent discount')
          WHEN sp.discount_type = 'fixed' AND sp.discount_value > 0 THEN CONCAT(spc.currency, ' ', CAST(sp.discount_value AS STRING), ' off')
          ELSE 'No discount applied'
        END AS CommitmentDiscountName,
        CAST(COALESCE(sp.discount_value, 0) AS NUMERIC) AS CommitmentDiscountQuantity,
        CASE WHEN sp.discount_value IS NOT NULL AND sp.discount_value > 0 THEN 'Used' ELSE 'Not Applicable' END AS CommitmentDiscountStatus,
        COALESCE(sp.discount_type, 'none') AS CommitmentDiscountType,
        CASE
          WHEN sp.discount_type = 'percent' THEN 'percent'
          WHEN sp.discount_type = 'fixed' THEN spc.currency
          ELSE 'N/A'
        END AS CommitmentDiscountUnit,

        -- Contract Applied (JSON linking to contract_commitment_1_3)
        JSON_OBJECT(
          'ContractId', COALESCE(sp.contract_id, 'none'),
          'SubscriptionId', spc.subscription_id,
          'StartDate', CAST(COALESCE(sp.start_date, spc.cost_date) AS STRING),
          'EndDate', CAST(sp.end_date AS STRING),
          'AutoRenew', CAST(COALESCE(sp.auto_renew, FALSE) AS STRING)
        ) AS ContractApplied,

        -- Provider fields (FOCUS 1.3 - REQUIRED, all populated)
        'Self-Hosted' AS HostProviderName,
        INITCAP(REPLACE(spc.provider, '_', ' ')) AS InvoiceIssuerName,
        INITCAP(REPLACE(spc.provider, '_', ' ')) AS ServiceProviderName,

        -- Deprecated fields (kept for backward compatibility)
        spc.provider AS ProviderName,
        INITCAP(REPLACE(spc.provider, '_', ' ')) AS PublisherName,

        -- Invoice (with fallback - using EXTRACT to avoid FORMAT conflicts)
        COALESCE(spc.invoice_id_last, CONCAT('INV-', spc.org_slug, '-',
          CAST(EXTRACT(YEAR FROM spc.cost_date) AS STRING),
          LPAD(CAST(EXTRACT(MONTH FROM spc.cost_date) AS STRING), 2, '0')
        )) AS InvoiceId,

        -- Region (Global for SaaS)
        'global' AS RegionId,
        'Global' AS RegionName,

        -- Resource identification (all populated)
        spc.subscription_id AS ResourceId,
        CONCAT(INITCAP(REPLACE(spc.provider, '_', ' ')), ' - ', UPPER(spc.plan_name)) AS ResourceName,
        'SaaS Subscription' AS ResourceType,

        -- Service (REQUIRED fields - all populated)
        COALESCE(sp.category, 'SaaS') AS ServiceCategory,
        CONCAT(INITCAP(REPLACE(spc.provider, '_', ' ')), ' ', UPPER(spc.plan_name)) AS ServiceName,
        COALESCE(sp.category, spc.plan_name) AS ServiceSubcategory,

        -- SKU (all populated)
        CONCAT(spc.provider, '/', spc.plan_name, '/', spc.billing_cycle) AS SkuId,
        CONCAT(spc.billing_cycle, '-', spc.pricing_model) AS SkuMeter,
        JSON_OBJECT(
          'provider', spc.provider,
          'plan_name', spc.plan_name,
          'pricing_model', spc.pricing_model,
          'seats', CAST(COALESCE(spc.seats, 1) AS STRING),
          'billing_cycle', spc.billing_cycle,
          'unit_price', CAST(COALESCE(sp.unit_price, 0) AS STRING)
        ) AS SkuPriceDetails,
        spc.subscription_id AS SkuPriceId,

        -- Tags (JSON in FOCUS 1.3 - comprehensive)
        JSON_OBJECT(
          'provider', spc.provider,
          'plan_name', spc.plan_name,
          'billing_cycle', spc.billing_cycle,
          'pricing_model', spc.pricing_model,
          'category', COALESCE(sp.category, 'SaaS'),
          'department', COALESCE(sp.department, 'IT'),
          'owner_email', COALESCE(sp.owner_email, 'unassigned'),
          'auto_renew', CAST(COALESCE(sp.auto_renew, FALSE) AS STRING),
          'cost_date', CAST(spc.cost_date AS STRING)
        ) AS Tags,

        -- Extension fields (x_ prefix per FOCUS convention - all populated)
        'saas_subscription_costs_daily' AS x_SourceSystem,
        spc.subscription_id AS x_SourceRecordId,
        'Amortized' AS x_AmortizationClass,
        'SaaS' AS x_ServiceModel,
        COALESCE(sp.department, 'default') AS x_CostAllocationKey,
        COALESCE(sp.exchange_rate_used, 1.0) AS x_ExchangeRateUsed,
        COALESCE(sp.source_currency, spc.currency) AS x_OriginalCurrency,
        CAST(COALESCE(sp.source_price, sp.unit_price) AS NUMERIC) AS x_OriginalCost,
        CURRENT_TIMESTAMP() AS x_UpdatedAt,

        -- Org-specific extension fields (with fallbacks from spc when org_profiles is NULL)
        spc.org_slug AS x_OrgSlug,
        COALESCE(op.company_name, spc.org_slug) AS x_OrgName,
        COALESCE(op.admin_email, CONCAT('admin@', spc.org_slug, '.com')) AS x_OrgOwnerEmail,
        COALESCE(op.default_currency, spc.currency, 'USD') AS x_OrgDefaultCurrency,
        COALESCE(op.default_timezone, 'UTC') AS x_OrgDefaultTimezone,
        COALESCE(op.default_country, 'US') AS x_OrgDefaultCountry,
        COALESCE(os.plan_name, 'FREE') AS x_OrgSubscriptionPlan,
        COALESCE(os.status, 'ACTIVE') AS x_OrgSubscriptionStatus,
        'saas_subscription_costs_pipeline' AS x_PipelineId,
        GENERATE_UUID() AS x_PipelineRunId,
        1.0 AS x_DataQualityScore,
        CURRENT_TIMESTAMP() AS x_CreatedAt,

        -- Required pipeline lineage fields
        'internal' AS x_CredentialId,
        spc.cost_date AS x_PipelineRunDate,
        CURRENT_TIMESTAMP() AS x_IngestedAt,

        -- Hierarchy extension fields for cost allocation (from subscription plans)
        spc.hierarchy_dept_id AS x_HierarchyDeptId,
        spc.hierarchy_dept_name AS x_HierarchyDeptName,
        spc.hierarchy_project_id AS x_HierarchyProjectId,
        spc.hierarchy_project_name AS x_HierarchyProjectName,
        spc.hierarchy_team_id AS x_HierarchyTeamId,
        spc.hierarchy_team_name AS x_HierarchyTeamName

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
    """, p_project_id, p_dataset_id, p_project_id, p_dataset_id, p_project_id, p_dataset_id, p_project_id, p_project_id)
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
         p_dataset_id AS dataset,
         v_org_slug AS org_slug;

EXCEPTION WHEN ERROR THEN
  ROLLBACK TRANSACTION;
  RAISE USING MESSAGE = CONCAT('sp_convert_saas_costs_to_focus_1_3 Failed: ', @@error.message);
END;
