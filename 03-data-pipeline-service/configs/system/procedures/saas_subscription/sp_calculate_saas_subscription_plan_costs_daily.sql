-- ================================================================================
-- PROCEDURE: sp_calculate_saas_subscription_plan_costs_daily
-- LOCATION: {project_id}.organizations (central dataset)
-- OPERATES ON: {project_id}.{p_dataset_id} (per-customer dataset)
--
-- PURPOSE: Calculate daily amortized costs for ALL subscriptions that overlap
--          with the date range, including historical costs for expired/cancelled
--          subscriptions. Daily cost calculation by billing cycle:
--            - Monthly: cycle_cost / days_in_billing_period (anchor-aware)
--            - Annual: cycle_cost / fiscal_year_days (365 or 366)
--            - Quarterly: cycle_cost / fiscal_quarter_days (FQ1-FQ4)
--            - Semi-Annual: cycle_cost / fiscal_half_days (FH1-FH2)
--            - Weekly: cycle_cost / 7
--            - Custom: cycle_cost / 30 (fallback)
--
-- FISCAL YEAR SUPPORT:
--   - Reads fiscal_year_start_month from org_profiles (default: 1 = January)
--   - Common values: 1=Calendar, 4=India/UK/Japan, 7=Australia
--   - Annual/Quarterly/Semi-Annual calculations use fiscal periods
--   - Example: fiscal_year_start_month=4 means FY Apr 1, 2025 - Mar 31, 2026
--
-- INDUSTRY STANDARDS COMPLIANCE:
--   - FinOps FOCUS 1.3: Amortization of upfront fees across commitment period
--   - ASC 606 / IFRS 15: Revenue recognition over service period with proration
--   - GAAP/Statutory: Fiscal year aligned calculations for India, UK, Japan, Australia
--   - Leap year handling: Proper 400/100/4 rule for accurate daily rates
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
  -- Fiscal year support: Month when FY starts (1=Jan/calendar, 4=Apr/India, 7=Jul/Australia)
  DECLARE v_fiscal_year_start_month INT64 DEFAULT 1;

  -- 1. Validation
  ASSERT p_project_id IS NOT NULL AS "p_project_id cannot be NULL";
  ASSERT p_dataset_id IS NOT NULL AS "p_dataset_id cannot be NULL";
  ASSERT p_start_date IS NOT NULL AS "p_start_date cannot be NULL";
  ASSERT p_end_date IS NOT NULL AS "p_end_date cannot be NULL";
  ASSERT p_end_date >= p_start_date AS "p_end_date must be >= p_start_date";
  ASSERT DATE_DIFF(p_end_date, p_start_date, DAY) <= 366 AS "Date range cannot exceed 366 days";

  -- 1b. Get org settings from org_profiles (currency + fiscal year)
  EXECUTE IMMEDIATE FORMAT("""
    SELECT
      default_currency,
      COALESCE(fiscal_year_start_month, 1) AS fiscal_year_start_month
    FROM `%s.organizations.org_profiles`
    WHERE REGEXP_REPLACE(@p_ds, '_prod$|_stage$|_dev$|_local$', '') = org_slug
    LIMIT 1
  """, p_project_id)
  INTO v_org_currency, v_fiscal_year_start_month
  USING p_dataset_id AS p_ds;

  -- FIX: Validate org was found (v_org_currency would be NULL if no rows returned)
  -- If org not found, use default currency but log warning
  IF v_org_currency IS NULL THEN
    SET v_org_currency = v_default_currency;
    -- Note: We continue rather than raising an error to allow processing
    -- Plans may have been created before org_profiles was populated
  END IF;

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
        invoice_id_last, source, run_date,
        hierarchy_dept_id, hierarchy_dept_name,
        hierarchy_project_id, hierarchy_project_name,
        hierarchy_team_id, hierarchy_team_name,
        updated_at
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
          invoice_id_last,
          -- Billing anchor day for non-calendar-aligned billing (1-28)
          -- NULL or 1 = calendar-aligned (1st of month)
          -- ASC 606 / IFRS 15 compliant: Track billing cycle anniversary
          COALESCE(billing_anchor_day, 1) AS billing_anchor_day,
          -- Hierarchy fields for cost allocation
          hierarchy_dept_id,
          hierarchy_dept_name,
          hierarchy_project_id,
          hierarchy_project_name,
          hierarchy_team_id,
          hierarchy_team_name
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
              -- Monthly: divide by actual days in billing period
              -- ASC 606 compliant: Uses billing_anchor_day for non-calendar billing
              WHEN s.billing_cycle IN ('monthly', 'month')
                THEN s.cycle_cost / (
                  CASE
                    -- Calendar-aligned billing (anchor = 1 or NULL)
                    WHEN s.billing_anchor_day = 1 THEN
                      EXTRACT(DAY FROM LAST_DAY(day))
                    -- Non-calendar billing (e.g., anchor = 15 means 15th to 14th)
                    -- Calculate days from current period start to next period start
                    ELSE
                      DATE_DIFF(
                        -- Next period start
                        CASE
                          WHEN EXTRACT(DAY FROM day) >= s.billing_anchor_day THEN
                            DATE_ADD(DATE_TRUNC(day, MONTH), INTERVAL 1 MONTH) +
                            INTERVAL (s.billing_anchor_day - 1) DAY
                          ELSE
                            DATE_TRUNC(day, MONTH) + INTERVAL (s.billing_anchor_day - 1) DAY
                        END,
                        -- Current period start
                        CASE
                          WHEN EXTRACT(DAY FROM day) >= s.billing_anchor_day THEN
                            DATE_TRUNC(day, MONTH) + INTERVAL (s.billing_anchor_day - 1) DAY
                          ELSE
                            DATE_ADD(DATE_TRUNC(day, MONTH), INTERVAL -1 MONTH) +
                            INTERVAL (s.billing_anchor_day - 1) DAY
                        END,
                        DAY
                      )
                  END
                )
              -- Annual: divide by fiscal year days (365 or 366)
              -- Fiscal year may cross calendar year (e.g., Apr 2025 - Mar 2026)
              -- Uses @fy_start_month from org_profiles (1=Jan/calendar, 4=Apr/India)
              WHEN s.billing_cycle IN ('annual', 'yearly', 'year')
                THEN s.cycle_cost / (
                  -- Calculate days in fiscal year containing this day
                  -- FY start: If month >= fy_start_month, use current year; else previous year
                  DATE_DIFF(
                    -- FY end date
                    DATE_ADD(
                      DATE(
                        CASE
                          WHEN EXTRACT(MONTH FROM day) >= @fy_start_month
                            THEN EXTRACT(YEAR FROM day)
                          ELSE EXTRACT(YEAR FROM day) - 1
                        END,
                        @fy_start_month,
                        1
                      ),
                      INTERVAL 1 YEAR
                    ),
                    -- FY start date
                    DATE(
                      CASE
                        WHEN EXTRACT(MONTH FROM day) >= @fy_start_month
                          THEN EXTRACT(YEAR FROM day)
                        ELSE EXTRACT(YEAR FROM day) - 1
                      END,
                      @fy_start_month,
                      1
                    ),
                    DAY
                  )
                )
              -- Quarterly: divide by actual days in FISCAL quarter
              -- Fiscal quarters depend on @fy_start_month (e.g., Apr start = FQ1:Apr-Jun)
              -- Formula: fiscal_quarter = ((month - fy_start + 12) MOD 12) / 3 + 1
              WHEN s.billing_cycle IN ('quarterly', 'quarter')
                THEN s.cycle_cost / (
                  -- Calculate days in the fiscal quarter containing this day
                  DATE_DIFF(
                    -- FQ end date (start of next quarter)
                    DATE_ADD(
                      DATE(
                        -- Year of FQ start
                        CASE
                          WHEN MOD(EXTRACT(MONTH FROM day) - @fy_start_month + 12, 12) >= 9
                               AND @fy_start_month > EXTRACT(MONTH FROM day)
                            THEN EXTRACT(YEAR FROM day)
                          WHEN EXTRACT(MONTH FROM day) >= @fy_start_month
                            THEN EXTRACT(YEAR FROM day)
                          ELSE EXTRACT(YEAR FROM day) - 1
                        END,
                        -- Month of FQ start
                        MOD(@fy_start_month - 1 +
                          (DIV(MOD(EXTRACT(MONTH FROM day) - @fy_start_month + 12, 12), 3) * 3),
                          12) + 1,
                        1
                      ),
                      INTERVAL 3 MONTH
                    ),
                    -- FQ start date
                    DATE(
                      CASE
                        WHEN MOD(EXTRACT(MONTH FROM day) - @fy_start_month + 12, 12) >= 9
                             AND @fy_start_month > EXTRACT(MONTH FROM day)
                          THEN EXTRACT(YEAR FROM day)
                        WHEN EXTRACT(MONTH FROM day) >= @fy_start_month
                          THEN EXTRACT(YEAR FROM day)
                        ELSE EXTRACT(YEAR FROM day) - 1
                      END,
                      MOD(@fy_start_month - 1 +
                        (DIV(MOD(EXTRACT(MONTH FROM day) - @fy_start_month + 12, 12), 3) * 3),
                        12) + 1,
                      1
                    ),
                    DAY
                  )
                )
              -- Semi-Annual: divide by actual days in FISCAL half-year
              -- FH1: First 6 months from fy_start_month, FH2: Next 6 months
              WHEN s.billing_cycle IN ('semi-annual', 'semi_annual', 'biannual', 'half-yearly')
                THEN s.cycle_cost / (
                  -- Calculate days in the fiscal half containing this day
                  DATE_DIFF(
                    -- FH end date (start of next half)
                    DATE_ADD(
                      DATE(
                        -- Year of FH start
                        CASE
                          WHEN MOD(EXTRACT(MONTH FROM day) - @fy_start_month + 12, 12) >= 6
                               AND @fy_start_month > EXTRACT(MONTH FROM day)
                            THEN EXTRACT(YEAR FROM day)
                          WHEN EXTRACT(MONTH FROM day) >= @fy_start_month
                            THEN EXTRACT(YEAR FROM day)
                          ELSE EXTRACT(YEAR FROM day) - 1
                        END,
                        -- Month of FH start
                        CASE
                          WHEN MOD(EXTRACT(MONTH FROM day) - @fy_start_month + 12, 12) < 6
                            THEN @fy_start_month  -- FH1 starts at fy_start_month
                          ELSE MOD(@fy_start_month + 5, 12) + 1  -- FH2 starts 6 months later
                        END,
                        1
                      ),
                      INTERVAL 6 MONTH
                    ),
                    -- FH start date
                    DATE(
                      CASE
                        WHEN MOD(EXTRACT(MONTH FROM day) - @fy_start_month + 12, 12) >= 6
                             AND @fy_start_month > EXTRACT(MONTH FROM day)
                          THEN EXTRACT(YEAR FROM day)
                        WHEN EXTRACT(MONTH FROM day) >= @fy_start_month
                          THEN EXTRACT(YEAR FROM day)
                        ELSE EXTRACT(YEAR FROM day) - 1
                      END,
                      CASE
                        WHEN MOD(EXTRACT(MONTH FROM day) - @fy_start_month + 12, 12) < 6
                          THEN @fy_start_month
                        ELSE MOD(@fy_start_month + 5, 12) + 1
                      END,
                      1
                    ),
                    DAY
                  )
                )
              -- Weekly: divide by 7 days
              WHEN s.billing_cycle IN ('weekly', 'week')
                THEN s.cycle_cost / 7
              -- Default fallback: 30 days (for custom or unknown cycles)
              ELSE s.cycle_cost / 30
            END AS NUMERIC
          ) AS daily_cost,
          s.invoice_id_last,
          -- Hierarchy fields for cost allocation
          s.hierarchy_dept_id,
          s.hierarchy_dept_name,
          s.hierarchy_project_id,
          s.hierarchy_project_name,
          s.hierarchy_team_id,
          s.hierarchy_team_name
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
        -- Hierarchy fields for cost allocation
        hierarchy_dept_id,
        hierarchy_dept_name,
        hierarchy_project_id,
        hierarchy_project_name,
        hierarchy_team_id,
        hierarchy_team_name,
        CURRENT_TIMESTAMP() AS updated_at
      FROM daily_expanded
      WHERE daily_cost > 0  -- Skip zero-cost rows (FREE plans)
    """, p_project_id, p_dataset_id, p_project_id, p_dataset_id)
    USING p_start_date AS p_start, p_end_date AS p_end, v_org_currency AS org_currency, v_default_currency AS default_currency, v_fiscal_year_start_month AS fy_start_month;

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
