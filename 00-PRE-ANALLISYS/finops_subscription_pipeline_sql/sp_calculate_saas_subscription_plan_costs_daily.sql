-- ================================================================================
-- PROCEDURE: sp_calculate_saas_subscription_plan_costs_daily
-- LOCATION: {project_id}.organizations (central dataset - created once)
-- OPERATES ON: {project_id}.{p_dataset_id} (per-customer dataset)
--
-- PURPOSE: Expands active subscription plans into daily amortized cost rows.
--
-- INPUTS:
--   p_project_id: GCP Project ID (dynamic)
--   p_dataset_id: Customer dataset ID (e.g., 'acme_corp_prod')
--   p_start_date: Start of processing window (inclusive)
--   p_end_date:   End of processing window (inclusive)
--
-- TABLES (in customer dataset):
--   READ:  saas_subscription_plans (dimension table)
--   WRITE: saas_subscription_plan_costs_daily (fact table)
--
-- LIMITS: Max 366 days per run to prevent memory issues.
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

    -- 3. Delete existing data for date range (idempotent)
    EXECUTE IMMEDIATE FORMAT("""
      DELETE FROM `%s.%s.saas_subscription_plan_costs_daily`
      WHERE cost_date BETWEEN @p_start AND @p_end
    """, p_project_id, p_dataset_id)
    USING p_start_date AS p_start, p_end_date AS p_end;

    -- 4. Insert daily costs
    SET v_sql = FORMAT("""
      INSERT INTO `%s.%s.saas_subscription_plan_costs_daily` (
        org_slug, provider, subscription_id, plan_name, display_name,
        cost_date, billing_cycle, currency,
        seats, quantity, unit,
        cycle_cost, daily_cost, monthly_run_rate, annual_run_rate,
        invoice_id_last, source, updated_at
      )
      WITH base AS (
        SELECT
          sp.org_slug, sp.provider, sp.subscription_id, sp.plan_name, sp.display_name,
          LOWER(COALESCE(sp.billing_cycle, 'monthly')) AS billing_cycle,
          COALESCE(sp.currency, 'USD') AS currency,
          CAST(IFNULL(sp.seats, 1) AS INT64) AS seats,
          COALESCE(sp.pricing_model, 'PER_SEAT') AS pricing_model,
          CASE
            WHEN LOWER(COALESCE(sp.billing_cycle, 'monthly')) IN ('monthly','month') THEN sp.unit_price_usd
            WHEN LOWER(COALESCE(sp.billing_cycle, 'monthly')) IN ('annual','yearly','year') THEN sp.yearly_price_usd
          END AS base_price,
          sp.discount_type, sp.discount_value, sp.start_date, sp.end_date, sp.invoice_id_last
        FROM `%s.%s.saas_subscription_plans` sp
        WHERE sp.status = 'active'
          AND (sp.start_date <= @p_end OR sp.start_date IS NULL)
          AND (sp.end_date >= @p_start OR sp.end_date IS NULL)
      ),
      priced AS (
        SELECT *,
          CAST(
            CASE
              WHEN base_price IS NULL THEN NULL
              WHEN LOWER(discount_type) = 'percent' AND discount_value IS NOT NULL THEN
                CASE WHEN pricing_model = 'FLAT_FEE' THEN base_price ELSE base_price * seats END * (1 - discount_value / 100)
              WHEN LOWER(discount_type) = 'fixed' AND discount_value IS NOT NULL THEN
                CASE WHEN pricing_model = 'FLAT_FEE' THEN base_price ELSE base_price * seats END - discount_value
              ELSE
                CASE WHEN pricing_model = 'FLAT_FEE' THEN base_price ELSE base_price * seats END
            END AS NUMERIC
          ) AS cycle_cost
        FROM base
      ),
      expanded AS (
        SELECT
          p.org_slug, p.provider, p.subscription_id, p.plan_name, p.display_name,
          day AS cost_date, p.billing_cycle, p.currency, p.seats,
          CAST(p.seats AS NUMERIC) AS quantity, 'seat' AS unit, p.cycle_cost,
          CAST(
            CASE
              WHEN p.cycle_cost IS NULL THEN NULL
              WHEN p.billing_cycle IN ('monthly','month') THEN p.cycle_cost / EXTRACT(DAY FROM LAST_DAY(day))
              WHEN p.billing_cycle IN ('annual','yearly','year') THEN p.cycle_cost / DATE_DIFF(DATE_ADD(DATE(EXTRACT(YEAR FROM day), 1, 1), INTERVAL 1 YEAR), DATE(EXTRACT(YEAR FROM day), 1, 1), DAY)
            END AS NUMERIC
          ) AS daily_cost,
          p.invoice_id_last
        FROM priced p,
        UNNEST(GENERATE_DATE_ARRAY(GREATEST(p.start_date, @p_start), LEAST(COALESCE(p.end_date, DATE('2099-12-31')), @p_end))) AS day
      )
      SELECT org_slug, provider, subscription_id, plan_name, display_name,
        cost_date, billing_cycle, currency, seats, quantity, unit, cycle_cost, daily_cost,
        CASE WHEN daily_cost IS NULL THEN NULL ELSE daily_cost * EXTRACT(DAY FROM LAST_DAY(cost_date)) END,
        CASE WHEN daily_cost IS NULL THEN NULL ELSE daily_cost * DATE_DIFF(DATE_ADD(DATE(EXTRACT(YEAR FROM cost_date), 1, 1), INTERVAL 1 YEAR), DATE(EXTRACT(YEAR FROM cost_date), 1, 1), DAY) END,
        invoice_id_last, 'subscription_proration', CURRENT_TIMESTAMP()
      FROM expanded
    """, p_project_id, p_dataset_id, p_project_id, p_dataset_id);
    EXECUTE IMMEDIATE v_sql USING p_start_date AS p_start, p_end_date AS p_end;

  COMMIT TRANSACTION;

  -- 5. Output row count
  EXECUTE IMMEDIATE FORMAT("""
    SELECT COUNT(*) FROM `%s.%s.saas_subscription_plan_costs_daily`
    WHERE cost_date BETWEEN @p_start AND @p_end
  """, p_project_id, p_dataset_id)
  INTO v_rows_inserted USING p_start_date AS p_start, p_end_date AS p_end;

  SELECT 'Stage 1 Complete' AS status, v_rows_inserted AS rows_inserted, p_dataset_id AS dataset;

EXCEPTION WHEN ERROR THEN
  ROLLBACK TRANSACTION;
  RAISE USING MESSAGE = CONCAT('sp_calculate_saas_subscription_plan_costs_daily Failed: ', @@error.message);
END;
