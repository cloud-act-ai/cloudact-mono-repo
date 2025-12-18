-- ================================================================================
-- PROCEDURE: sp_calculate_saas_subscription_plan_costs_daily
-- LOCATION: {project_id}.organizations (central dataset)
-- OPERATES ON: {project_id}.{p_dataset_id} (per-customer dataset)
--
-- PURPOSE: Calculate daily amortized costs for ALL subscriptions that overlap
--          with the date range, including historical costs for expired/cancelled
--          subscriptions. Daily cost calculation by billing cycle:
--            - Monthly: cycle_cost / days_in_month (actual: 28-31)
--            - Annual: cycle_cost / 365 (or 366 for leap years)
--            - Quarterly: cycle_cost / 91.25 (average quarter)
--            - Weekly: cycle_cost / 7
--            - Custom: cycle_cost / 30 (fallback)
--
-- INPUTS:
--   p_project_id: GCP Project ID
--   p_dataset_id: Customer dataset (e.g., 'acme_corp_prod')
--   p_start_date: Start date (inclusive)
--   p_end_date:   End date (inclusive)
--
-- CALCULATION:
--   1. Select subscriptions with status IN ('active', 'expired', 'cancelled')
--   2. For each day, determine which plan version was valid:
--      - start_date <= day AND (end_date IS NULL OR end_date >= day)
--   3. unit_price = price per billing cycle (monthly price for monthly, annual price for annual, etc.)
--   4. cycle_cost = unit_price × seats (PER_SEAT) or unit_price (FLAT_FEE)
--   5. Apply discount if any
--   6. daily_cost = cycle_cost / days_in_period
--   7. monthly_run_rate = daily_cost × days_in_month
--   8. annual_run_rate = daily_cost × days_in_year
--
-- IMPORTANT: unit_price represents the price for ONE billing cycle:
--   - Monthly plan: unit_price = monthly price (e.g., $20/month)
--   - Annual plan: unit_price = annual price (e.g., $200/year)
--   - Quarterly plan: unit_price = quarterly price (e.g., $50/quarter)
--   The currency field stores the actual currency (USD, EUR, INR, etc.)
--
-- ================================================================================

CREATE OR REPLACE PROCEDURE `{project_id}.organizations`.sp_calculate_saas_subscription_plan_costs_daily(
  p_project_id STRING,
  p_dataset_id STRING,
  p_start_date DATE,
  p_end_date DATE
)
OPTIONS(strict_mode=TRUE)
BEGIN
  DECLARE v_rows_inserted INT64 DEFAULT 0;
  DECLARE v_org_currency STRING DEFAULT NULL;
  DECLARE v_zero_seat_count INT64 DEFAULT 0;
  DECLARE v_default_currency STRING DEFAULT 'USD';

  -- 1. Validation
  ASSERT p_project_id IS NOT NULL AS "p_project_id cannot be NULL";
  ASSERT p_dataset_id IS NOT NULL AS "p_dataset_id cannot be NULL";
  ASSERT p_start_date IS NOT NULL AS "p_start_date cannot be NULL";
  ASSERT p_end_date IS NOT NULL AS "p_end_date cannot be NULL";
  ASSERT p_end_date >= p_start_date AS "p_end_date must be >= p_start_date";
  ASSERT DATE_DIFF(p_end_date, p_start_date, DAY) <= 366 AS "Date range cannot exceed 366 days";

  -- 1b. Get org's default currency from org_profiles (resolves TODO from line 86-87)
  EXECUTE IMMEDIATE FORMAT("""
    SELECT default_currency
    FROM `%s.organizations.org_profiles`
    WHERE REGEXP_REPLACE(@p_ds, '_prod$|_stage$|_dev$|_local$', '') = org_slug
    LIMIT 1
  """, p_project_id)
  INTO v_org_currency
  USING p_dataset_id AS p_ds;

  BEGIN TRANSACTION;

    -- 2. Delete existing data for date range (idempotent)
    EXECUTE IMMEDIATE FORMAT("""
      DELETE FROM `%s.%s.saas_subscription_plan_costs_daily`
      WHERE cost_date BETWEEN @p_start AND @p_end
    """, p_project_id, p_dataset_id)
    USING p_start_date AS p_start, p_end_date AS p_end;

    -- 3. Insert daily costs (skip zero-cost rows like FREE plans)
    EXECUTE IMMEDIATE FORMAT("""
      INSERT INTO `%s.%s.saas_subscription_plan_costs_daily` (
        org_slug, provider, subscription_id, plan_name, display_name,
        cost_date, billing_cycle, currency, seats, pricing_model,
        cycle_cost, daily_cost, monthly_run_rate, annual_run_rate,
        invoice_id_last, source, run_date, updated_at
      )
      WITH subscriptions AS (
        -- Read all subscriptions that overlap with date range
        -- Include active, expired, and cancelled to calculate historical costs
        SELECT
          org_slug,
          provider,
          subscription_id,
          plan_name,
          display_name,
          LOWER(COALESCE(billing_cycle, 'monthly')) AS billing_cycle,
          -- Use org's default_currency from org_profiles (@org_currency), then @default_currency, then USD
          COALESCE(currency, @org_currency, @default_currency, 'USD') AS currency,
          -- NOTE: NULL seats treated as 1 for backward compatibility, but logged as DQ issue
          CASE
            WHEN seats IS NULL OR seats <= 0 THEN 1
            ELSE seats
          END AS seats,
          -- Track original seats for DQ monitoring
          CASE WHEN seats IS NULL OR seats <= 0 THEN TRUE ELSE FALSE END AS _seats_defaulted,
          COALESCE(pricing_model, 'PER_SEAT') AS pricing_model,
          -- Get base price: unit_price is the price per billing cycle
          -- yearly_price is an optional override for annual plans (backwards compatibility)
          -- For all billing cycles, unit_price represents the CYCLE price:
          --   - Monthly: unit_price = monthly price
          --   - Annual: unit_price = annual price (NOT monthly × 12)
          --   - Quarterly: unit_price = quarterly price
          --   - Weekly: unit_price = weekly price
          -- NOTE: NULLIF(yearly_price, 0) handles cases where yearly_price is 0 (not just NULL)
          CASE
            WHEN LOWER(COALESCE(billing_cycle, 'monthly')) IN ('annual', 'yearly', 'year')
              THEN COALESCE(NULLIF(yearly_price, 0), unit_price)  -- Use yearly override if > 0, else use unit_price
            ELSE unit_price  -- For monthly, quarterly, weekly - use unit_price directly
          END AS base_price,
          discount_type,
          discount_value,
          start_date,
          end_date,
          invoice_id_last
        FROM `%s.%s.saas_subscription_plans`
        WHERE status IN ('active', 'expired', 'cancelled')
          AND (start_date <= @p_end OR start_date IS NULL)
          AND (end_date >= @p_start OR end_date IS NULL)
      ),
      with_cycle_cost AS (
        -- Calculate cycle cost (price × seats for PER_SEAT, just price for FLAT_FEE)
        -- Then apply discount. GREATEST(0, ...) ensures cycle_cost never goes negative.
        SELECT
          * EXCEPT(_seats_defaulted),  -- Exclude tracking field from output
          GREATEST(0, CAST(
            CASE
              WHEN base_price IS NULL THEN 0
              -- Calculate base: price × seats for PER_SEAT
              ELSE
                CASE
                  WHEN pricing_model = 'FLAT_FEE' THEN base_price
                  ELSE base_price * seats
                END
                -- Apply discount (cap percent at 100 to prevent negative)
                * CASE
                    WHEN LOWER(COALESCE(discount_type, '')) = 'percent' AND discount_value IS NOT NULL
                      THEN GREATEST(0, 1 - LEAST(discount_value, 100) / 100)
                    ELSE 1
                  END
                - CASE
                    WHEN LOWER(COALESCE(discount_type, '')) = 'fixed' AND discount_value IS NOT NULL
                      THEN GREATEST(0, discount_value)  -- Negative fixed discount not allowed
                    ELSE 0
                  END
            END AS NUMERIC
          )) AS cycle_cost
        FROM subscriptions
      ),
      daily_expanded AS (
        -- Generate one row per day per subscription
        SELECT
          s.org_slug,
          s.provider,
          s.subscription_id,
          s.plan_name,
          s.display_name,
          day AS cost_date,
          s.billing_cycle,
          s.currency,
          s.seats,
          s.pricing_model,
          s.cycle_cost,
          -- Calculate daily cost
          CAST(
            CASE
              WHEN s.cycle_cost IS NULL OR s.cycle_cost = 0 THEN 0
              -- Monthly: divide by actual days in that specific month (28-31)
              WHEN s.billing_cycle IN ('monthly', 'month')
                THEN s.cycle_cost / EXTRACT(DAY FROM LAST_DAY(day))
              -- Annual: divide by 365 (or 366 for leap years)
              -- Proper leap year: divisible by 4, but not by 100 unless also by 400
              WHEN s.billing_cycle IN ('annual', 'yearly', 'year')
                THEN s.cycle_cost / (
                  CASE
                    WHEN MOD(EXTRACT(YEAR FROM day), 400) = 0 THEN 366  -- Century leap year (2000, 2400)
                    WHEN MOD(EXTRACT(YEAR FROM day), 100) = 0 THEN 365  -- Century non-leap (1900, 2100)
                    WHEN MOD(EXTRACT(YEAR FROM day), 4) = 0 THEN 366    -- Regular leap year
                    ELSE 365
                  END
                )
              -- Quarterly: divide by 91.25 (average quarter = 365.25/4)
              WHEN s.billing_cycle IN ('quarterly', 'quarter')
                THEN s.cycle_cost / 91.25
              -- Weekly: divide by 7 days
              WHEN s.billing_cycle IN ('weekly', 'week')
                THEN s.cycle_cost / 7
              -- Default fallback: 30 days (for custom or unknown cycles)
              ELSE s.cycle_cost / 30
            END AS NUMERIC
          ) AS daily_cost,
          s.invoice_id_last
        FROM with_cycle_cost s
        CROSS JOIN UNNEST(
          GENERATE_DATE_ARRAY(
            GREATEST(COALESCE(s.start_date, @p_start), @p_start),
            LEAST(COALESCE(s.end_date, @p_end), @p_end)
          )
        ) AS day
      )
      SELECT
        org_slug,
        provider,
        subscription_id,
        plan_name,
        display_name,
        cost_date,
        billing_cycle,
        currency,
        seats,
        pricing_model,
        cycle_cost,
        daily_cost,
        -- Monthly run rate: daily × days in month
        CAST(daily_cost * EXTRACT(DAY FROM LAST_DAY(cost_date)) AS NUMERIC) AS monthly_run_rate,
        -- Annual run rate: daily × days in year (proper leap year handling)
        CAST(daily_cost * (
          CASE
            WHEN MOD(EXTRACT(YEAR FROM cost_date), 400) = 0 THEN 366  -- Century leap year
            WHEN MOD(EXTRACT(YEAR FROM cost_date), 100) = 0 THEN 365  -- Century non-leap
            WHEN MOD(EXTRACT(YEAR FROM cost_date), 4) = 0 THEN 366    -- Regular leap year
            ELSE 365
          END
        ) AS NUMERIC) AS annual_run_rate,
        invoice_id_last,
        'subscription_amortization' AS source,
        CURRENT_DATE() AS run_date,
        CURRENT_TIMESTAMP() AS updated_at
      FROM daily_expanded
      WHERE daily_cost > 0  -- Skip zero-cost rows (FREE plans)
    """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
    USING p_start_date AS p_start, p_end_date AS p_end, v_org_currency AS org_currency, v_default_currency AS default_currency;

  COMMIT TRANSACTION;

  -- 4. Get row count
  EXECUTE IMMEDIATE FORMAT("""
    SELECT COUNT(*) FROM `%s.%s.saas_subscription_plan_costs_daily`
    WHERE cost_date BETWEEN @p_start AND @p_end
  """, p_project_id, p_dataset_id)
  INTO v_rows_inserted USING p_start_date AS p_start, p_end_date AS p_end;

  SELECT 'Daily Costs Calculated' AS status,
         v_rows_inserted AS rows_inserted,
         p_dataset_id AS dataset,
         p_start_date AS start_date,
         p_end_date AS end_date;

EXCEPTION WHEN ERROR THEN
  ROLLBACK TRANSACTION;
  RAISE USING MESSAGE = CONCAT('sp_calculate_saas_subscription_plan_costs_daily Failed: ', @@error.message);
END;
