-- Advanced Cost Analysis: Daily Cost Derivation
-- Normalizes costs across billing periods (Yearly, Monthly, Weekly, Daily)
-- Applies discounts and quantity multipliers
-- Calculates Daily Run Rate and Projected Costs

WITH base_calculations AS (
  SELECT
    subscription_id,
    plan_name,
    provider,
    quantity,
    unit_price_usd,
    billing_period,
    effective_date,
    end_date,
    -- Normalize Price to Daily Rate
    CASE
      WHEN billing_period = 'year' THEN COALESCE(yearly_price_usd, unit_price_usd * 12) / 365.0
      WHEN billing_period = 'month' THEN unit_price_usd / 30.4375
      WHEN billing_period = 'week' THEN unit_price_usd / 7.0
      WHEN billing_period = 'day' THEN unit_price_usd
      ELSE 0
    END AS base_daily_price,
    
    -- Discount Multiplier
    (1 - COALESCE(discount_percentage, 0) / 100.0) AS discount_multiplier
  FROM `{{ project }}.{{ dataset }}.saas_subscriptions`
)

SELECT
  subscription_id,
  plan_name,
  provider,
  quantity,
  ROUND(base_daily_price, 4) as base_daily_price,
  discount_multiplier,
  
  -- Final Daily Cost Calculation (Run Rate)
  ROUND(base_daily_price * discount_multiplier * quantity, 4) AS final_daily_cost_usd,
  
  -- Projected Costs
  ROUND((base_daily_price * discount_multiplier * quantity) * 7, 2) AS projected_weekly_cost_usd,
  ROUND((base_daily_price * discount_multiplier * quantity) * 30.4375, 2) AS projected_monthly_cost_usd,
  ROUND((base_daily_price * discount_multiplier * quantity) * 365.0, 2) AS projected_yearly_cost_usd,
  
  CURRENT_TIMESTAMP() as calculation_timestamp

FROM base_calculations
WHERE 
  quantity > 0 
  OR unit_price_usd > 0
ORDER BY final_daily_cost_usd DESC
