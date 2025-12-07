-- 1. Configuration Check
-- Set your Project and Dataset here once.
DECLARE v_project_id STRING DEFAULT 'gac-prod-471220';
DECLARE v_dataset_id STRING DEFAULT 'procedure_testsing';

-- 2. DDL Execution
BEGIN
  -- 1. SaaS Subscription Plans (Dimension Table)
  EXECUTE IMMEDIATE FORMAT("""
    CREATE TABLE IF NOT EXISTS `%s.%s.subscription_plans` (
      org_slug STRING NOT NULL OPTIONS(description="Unique organization identifier (Multi-tenancy ID). Example: 'guru_inc_123'."),
      subscription_id STRING NOT NULL OPTIONS(description="Unique primary key for the subscription. Often a hash or provider ID. Example: 'sub_openai_01'."),
      provider STRING OPTIONS(description="Name of the SaaS vendor or provider. Normalized to lowercase. Example: 'openai', 'slack'."),
      plan_name STRING OPTIONS(description="Specific plan tier name. Example: 'team', 'enterprise', 'pro'."),
      display_name STRING OPTIONS(description="Human-readable display title for UI/Reports. Example: 'ChatGPT Team'."),
      category STRING OPTIONS(description="Functional category for the tool. Example: 'AI', 'DevOps', 'Design'."),
      
      status STRING OPTIONS(description="Current contract status. Values: 'active' (billing), 'cancelled', 'expired'."),
      start_date DATE OPTIONS(description="Date when the subscription term begins. Costs accrue from this date."),
      end_date DATE OPTIONS(description="Date when the subscription ends or cancels. Costs stop strictly *after* this date."),
      billing_cycle STRING OPTIONS(description="Billing frequency. Values: 'monthly', 'annual'. Determines cost amortization logic."),
      currency STRING DEFAULT 'USD' OPTIONS(description="Billing currency code. ISO 4217. Default: 'USD'."),
      
      seats INT64 OPTIONS(description="Number of licensed seats/users purchased. Used for PER_SEAT pricing calculations."),
      pricing_model STRING OPTIONS(description="Cost calculation logic. 'PER_SEAT' implies (Unit Price * Seats). 'FLAT_FEE' implies (Unit Price only)."),
      unit_price_usd NUMERIC OPTIONS(description="Price per unit. If PER_SEAT, this is price per user. If FLAT_FEE, this is total platform price."),
      yearly_price_usd NUMERIC OPTIONS(description="Annual equivalent price if billed yearly using flat fee logic."),
      
      discount_type STRING OPTIONS(description="Type of discount applied. Values: 'percent', 'fixed'."),
      discount_value NUMERIC OPTIONS(description="Value of the discount. E.g., 20 for 20%% or 20$ off."),
      
      auto_renew BOOLEAN OPTIONS(description="Flag indicating if the subscription auto-renews at end_date."),
      payment_method STRING OPTIONS(description="Payment instrument used. Example: 'credit_card', 'invoice'."),
      invoice_id_last STRING OPTIONS(description="Reference to the most recent invoice ID for audit."),
      
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP() OPTIONS(description="Timestamp of the last row update.")
    )
    PARTITION BY start_date
    CLUSTER BY org_slug, provider
    OPTIONS(
      description="Master dimension table for SaaS subscriptions. Contains terms, pricing, and active windows for all customers."
    );
  """, v_project_id, v_dataset_id);

  -- 2. Daily Amortized Costs (Fact Table)
  EXECUTE IMMEDIATE FORMAT("""
    CREATE TABLE IF NOT EXISTS `%s.%s.subscription_plan_costs_daily` (
      org_slug STRING NOT NULL OPTIONS(description="Unique organization identifier."),
      provider STRING OPTIONS(description="SaaS provider name."),
      subscription_id STRING OPTIONS(description="Foreign key to subscription_plans."),
      plan_name STRING OPTIONS(description="Plan tier name."),
      display_name STRING OPTIONS(description="Human-readable service name."),
      
      cost_date DATE OPTIONS(description="The specific day for which this cost applies."),
      billing_cycle STRING OPTIONS(description="Billing frequency (monthly/annual) used for this day's calculation."),
      currency STRING OPTIONS(description="Currency of the calculated cost."),
      
      seats INT64 OPTIONS(description="Active seat count on this specific day."),
      quantity NUMERIC OPTIONS(description="Billable quantity (same as seats for PER_SEAT, 1 for FLAT_FEE)."),
      unit STRING OPTIONS(description="Unit of measure. Example: 'seat', 'license'."),
      
      cycle_cost NUMERIC OPTIONS(description="The full cycle cost (Monthly/Annual) before amortization."),
      daily_cost NUMERIC OPTIONS(description="The derived cost for this single day. (Cycle Cost / Days in Cycle)."),
      monthly_run_rate NUMERIC OPTIONS(description="Extrapolated monthly cost based on this day's rate."),
      annual_run_rate NUMERIC OPTIONS(description="Extrapolated annual cost based on this day's rate."),
      
      invoice_id_last STRING OPTIONS(description="Linked invoice ID."),
      source STRING OPTIONS(description="Source system identifier (e.g., 'subscription_proration')."),
      updated_at TIMESTAMP OPTIONS(description="Timestamp of calculation.")
    )
    PARTITION BY cost_date
    CLUSTER BY org_slug, subscription_id
    OPTIONS(
      description="Daily fact table. Granular daily cost breakdown for every active subscription, accounting for exact days in month/year."
    );
  """, v_project_id, v_dataset_id);

  -- 3. Standardized Cost Data (FOCUS 1.2 Schema subset)
  EXECUTE IMMEDIATE FORMAT("""
    CREATE TABLE IF NOT EXISTS `%s.%s.cost_data_standard_1_2` (
      BillingAccountId STRING OPTIONS(description="ID of the billing account (FOCUS). NULL for pure SaaS."),
      BillingAccountName STRING OPTIONS(description="Name of the billing account (FOCUS)."),
      BillingAccountType STRING OPTIONS(description="Type of billing account (FOCUS)."),
      
      SubAccountId STRING OPTIONS(description="Mapped to org_slug. Uniquely identifies the tenant/customer."),
      SubAccountName STRING OPTIONS(description="Display name of the sub-account/tenant."),
      SubAccountType STRING OPTIONS(description="Type of sub-account. Example: 'Organization'."),

      BilledCost NUMERIC OPTIONS(description="The actual cost billed for this period (Daily Amortized)."),
      BillingCurrency STRING OPTIONS(description="Currency of the BilledCost."),
      
      ContractedCost NUMERIC OPTIONS(description="Negotiated cost before usage (if applicable)."),
      EffectiveCost NUMERIC OPTIONS(description="Effective cost after all discounts/savings plans."),
      ListCost NUMERIC OPTIONS(description="List price before any discounts."),
      
      ContractedUnitPrice NUMERIC OPTIONS(description="Agreed unit price per contract."),
      EffectiveUnitPrice NUMERIC OPTIONS(description="Effective unit price after discounts."),
      ListUnitPrice NUMERIC OPTIONS(description="Standard list unit price."),
      UnitPrice NUMERIC OPTIONS(description="Base unit price applied."),

      ConsumedQuantity NUMERIC OPTIONS(description="Amount of the resource consumed (e.g., 10 seats)."),
      ConsumedUnit STRING OPTIONS(description="Unit of consumption (e.g., 'Seats')."),

      CapacityReservationId STRING OPTIONS(description="ID of capacity reservation if applicable."),
      CapacityReservationStatus STRING OPTIONS(description="Status of capacity reservation."),
      CapacityReservation STRING OPTIONS(description="Capacity reservation details."),

      ChargeCategory STRING OPTIONS(description="High-level charge grouping. Example: 'Subscription'."),
      ChargeClass STRING OPTIONS(description="Nature of the charge. Example: 'Recurring'."),
      ChargeDescription STRING OPTIONS(description="Detailed description of coverage. E.g. 'Subscription: ChatGPT Team (team)'."),
      ChargeFrequency STRING OPTIONS(description="Frequency of the charge. 'Monthly' or 'Annual'."),
      ChargeOrigination STRING OPTIONS(description="Origin of the charge. 'Calculated'."),

      InvoiceId STRING OPTIONS(description="Invoice number associated with this charge."),
      InvoiceIssuer STRING OPTIONS(description="Entity issuing the invoice (Provider)."),

      Provider STRING OPTIONS(description="Services Provider. Example: 'openai'."),
      Publisher STRING OPTIONS(description="Publisher of the service (often same as Provider for SaaS)."),

      CommitmentDiscountCategory STRING OPTIONS(description="Category of commitment discount (CUD/RI)."),
      CommitmentDiscountId STRING OPTIONS(description="ID of the commitment discount."),
      CommitmentDiscountName STRING OPTIONS(description="Name of the commitment discount."),
      CommitmentDiscountQuantity NUMERIC OPTIONS(description="Quantity of commitment used."),
      CommitmentDiscountStatus STRING OPTIONS(description="Status of the commitment."),
      CommitmentDiscountType STRING OPTIONS(description="Type of commitment."),
      CommitmentDiscountUnit STRING OPTIONS(description="Unit for commitment."),

      AvailabilityZone STRING OPTIONS(description="Data center zone. NULL for global SaaS."),
      RegionId STRING OPTIONS(description="Region identifier. Defaults to 'Global' for SaaS."),
      RegionName STRING OPTIONS(description="Full name of the region."),

      PricingCategory STRING OPTIONS(description="Category of pricing logic."),
      PricingCurrency STRING OPTIONS(description="Currency used for pricing lookup."),
      PricingCurrencyContractedUnitPrice NUMERIC OPTIONS(description="Contracted unit price in pricing currency."),
      PricingCurrencyEffectiveCost NUMERIC OPTIONS(description="Effective cost in pricing currency."),
      PricingCurrencyListUnitPrice NUMERIC OPTIONS(description="List unit price in pricing currency."),
      PricingQuantity NUMERIC OPTIONS(description="Quantity priced."),
      PricingUnit STRING OPTIONS(description="Unit used for pricing."),

      ResourceId STRING OPTIONS(description="Unique identifier for the resource (Subscription ID)."),
      ResourceName STRING OPTIONS(description="Display name of the resource (Plan Name)."),
      ResourceType STRING OPTIONS(description="Type of resource. Example: 'SaaS Subscription'."),

      Tags ARRAY<STRUCT<Key STRING, Value STRING>> OPTIONS(description="Key-value pairs for resource tagging."),

      ServiceCategory STRING OPTIONS(description="Broad category of service. Example: 'SaaS'."),
      ServiceName STRING OPTIONS(description="Name of the service/product. Example: 'ChatGPT Team'."),
      ServiceSubcategory STRING OPTIONS(description="Sub-grouping. Example: 'team'."),

      x_ServiceModel STRING OPTIONS(description="[Extension] Service delivery model. Example: 'SaaS', 'PaaS'."),
      x_AmortizationClass STRING OPTIONS(description="[Extension] Amortization status. Example: 'Amortized'."),
      UsageType STRING OPTIONS(description="[Extension] FOCUS 1.2 usage type. 'Seat-based Subscription' or 'Flat-fee Subscription'."),

      SkuId STRING OPTIONS(description="Stock Keeping Unit ID (Plan Name)."),
      SkuMeter STRING OPTIONS(description="Meter associated with SKU."),
      SkuPriceDetails STRING OPTIONS(description="Details on SKU pricing."),
      SkuPriceId STRING OPTIONS(description="ID of the SKU price."),

      BillingPeriodStart DATE OPTIONS(description="Start date of the billing cycle (Month start)."),
      BillingPeriodEnd DATE OPTIONS(description="End date of the billing cycle (Month end)."),
      ChargePeriodStart DATE OPTIONS(description="Start date of the charge (Specific Day)."),
      ChargePeriodEnd DATE OPTIONS(description="End date of the charge (Specific Day)."),

      SourceSystem STRING OPTIONS(description="System that generated the record."),
      SourceRecordId STRING OPTIONS(description="ID in the source system."),
      UpdatedAt TIMESTAMP OPTIONS(description="Time of record creation/update.")
    )
    PARTITION BY ChargePeriodStart
    CLUSTER BY SubAccountId, Provider
    OPTIONS(
      description="Standardized billing data adhering to FinOps FOCUS 1.2. Optimized for cross-cloud cost reporting and analysis."
    );
  """, v_project_id, v_dataset_id);
END;
