-- ================================================================================
-- PROCEDURE: sp_calculate_saas_subscription_plan_costs_daily
-- LOCATION: {project_id}.organizations (central dataset)
-- OPERATES ON: {project_id}.{p_dataset_id} (per-customer dataset)
--
-- PURPOSE: Calculate daily amortized costs for active subscriptions.
--          Simple, straightforward calculation:
--          daily_cost = cycle_cost / days_in_billing_period
--
-- INPUTS:
--   p_project_id: GCP Project ID
--   p_dataset_id: Customer dataset (e.g., 'acme_corp_prod')
--   p_start_date: Start date (inclusive)
--   p_end_date:   End date (inclusive)
--
-- CALCULATION:
--   1. cycle_cost = unit_price × seats (PER_SEAT) or unit_price (FLAT_FEE)
--   2. Apply discount if any
--   3. daily_cost = cycle_cost / days_in_period
--   4. monthly_run_rate = daily_cost × days_in_month
--   5. annual_run_rate = daily_cost × days_in_year
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

  -- 1. Validation
  ASSERT p_project_id IS NOT NULL AS "p_project_id cannot be NULL";
  ASSERT p_dataset_id IS NOT NULL AS "p_dataset_id cannot be NULL";
  ASSERT p_start_date IS NOT NULL AS "p_start_date cannot be NULL";
  ASSERT p_end_date IS NOT NULL AS "p_end_date cannot be NULL";
  ASSERT p_end_date >= p_start_date AS "p_end_date must be >= p_start_date";
  ASSERT DATE_DIFF(p_end_date, p_start_date, DAY) <= 366 AS "Date range cannot exceed 366 days";

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
        -- Read active subscriptions within date range
        SELECT
          org_slug,
          provider,
          subscription_id,
          plan_name,
          display_name,
          LOWER(COALESCE(billing_cycle, 'monthly')) AS billing_cycle,
          COALESCE(currency, 'USD') AS currency,
          COALESCE(seats, 1) AS seats,
          COALESCE(pricing_model, 'PER_SEAT') AS pricing_model,
          -- Get base price based on billing cycle
          CASE
            WHEN LOWER(COALESCE(billing_cycle, 'monthly')) IN ('monthly', 'month') THEN unit_price_usd
            WHEN LOWER(COALESCE(billing_cycle, 'monthly')) IN ('annual', 'yearly', 'year') THEN yearly_price_usd
            ELSE unit_price_usd
          END AS base_price,
          discount_type,
          discount_value,
          start_date,
          end_date,
          invoice_id_last
        FROM `%s.%s.saas_subscription_plans`
        WHERE status = 'active'
          AND (start_date <= @p_end OR start_date IS NULL)
          AND (end_date >= @p_start OR end_date IS NULL)
      ),
      with_cycle_cost AS (
        -- Calculate cycle cost (price × seats for PER_SEAT, just price for FLAT_FEE)
        -- Then apply discount
        SELECT
          *,
          CAST(
            CASE
              WHEN base_price IS NULL THEN 0
              -- Calculate base: price × seats for PER_SEAT
              ELSE
                CASE
                  WHEN pricing_model = 'FLAT_FEE' THEN base_price
                  ELSE base_price * seats
                END
                -- Apply discount
                * CASE
                    WHEN LOWER(COALESCE(discount_type, '')) = 'percent' AND discount_value IS NOT NULL
                      THEN (1 - discount_value / 100)
                    ELSE 1
                  END
                - CASE
                    WHEN LOWER(COALESCE(discount_type, '')) = 'fixed' AND discount_value IS NOT NULL
                      THEN discount_value
                    ELSE 0
                  END
            END AS NUMERIC
          ) AS cycle_cost
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
              WHEN s.billing_cycle IN ('monthly', 'month')
                THEN s.cycle_cost / EXTRACT(DAY FROM LAST_DAY(day))
              WHEN s.billing_cycle IN ('annual', 'yearly', 'year')
                THEN s.cycle_cost / (CASE WHEN MOD(EXTRACT(YEAR FROM day), 4) = 0 THEN 366 ELSE 365 END)
              ELSE s.cycle_cost / 30  -- Default to 30 days
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
        -- Annual run rate: daily × days in year
        CAST(daily_cost * (CASE WHEN MOD(EXTRACT(YEAR FROM cost_date), 4) = 0 THEN 366 ELSE 365 END) AS NUMERIC) AS annual_run_rate,
        invoice_id_last,
        'subscription_amortization' AS source,
        CURRENT_DATE() AS run_date,
        CURRENT_TIMESTAMP() AS updated_at
      FROM daily_expanded
      WHERE daily_cost > 0  -- Skip zero-cost rows (FREE plans)
    """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
    USING p_start_date AS p_start, p_end_date AS p_end;

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
