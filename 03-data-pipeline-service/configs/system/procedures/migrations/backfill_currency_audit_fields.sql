-- ================================================================================
-- MIGRATION: backfill_currency_audit_fields
-- LOCATION: {project_id}.organizations (central dataset - created once)
-- OPERATES ON: {project_id}.{p_dataset_id} (per-customer dataset)
--
-- PURPOSE: Backfill source_currency, source_price, and exchange_rate_used
--          for existing subscription plans that were created before these
--          audit fields were added.
--
-- LOGIC:
--   For existing plans without audit fields:
--   - source_currency = plan's current currency (assume it was the source)
--   - source_price = plan's current unit_price_usd
--   - exchange_rate_used = 1.0 (if currency is USD) or calculated from ratio
--
-- INPUTS:
--   p_project_id: GCP Project ID (dynamic)
--   p_dataset_id: Customer dataset ID (e.g., 'acme_corp_prod')
--   p_dry_run:    If TRUE, only show what would be updated (default: FALSE)
--
-- USAGE:
--   -- Dry run (preview changes)
--   CALL `gac-prod-471220.organizations`.sp_backfill_currency_audit_fields(
--     'gac-prod-471220',
--     'acme_corp_prod',
--     TRUE
--   );
--
--   -- Execute backfill
--   CALL `gac-prod-471220.organizations`.sp_backfill_currency_audit_fields(
--     'gac-prod-471220',
--     'acme_corp_prod',
--     FALSE
--   );
--
-- SAFETY:
--   - Uses WHERE clause to only update rows with NULL audit fields
--   - Preserves existing audit data if already populated
--   - Supports dry-run mode for preview
--   - Only updates plans where unit_price_usd > 0
--
-- NOTES:
--   - This is a one-time migration for existing data
--   - New plans should populate these fields at creation time
--   - For non-USD currencies without source data, exchange_rate is calculated
--     as source_price / unit_price_usd
-- ================================================================================

CREATE OR REPLACE PROCEDURE `{project_id}.organizations`.sp_backfill_currency_audit_fields(
  p_project_id STRING,
  p_dataset_id STRING,
  p_dry_run BOOL
)
BEGIN
  DECLARE v_rows_to_update INT64;
  DECLARE v_rows_updated INT64 DEFAULT 0;

  -- 1. Parameter Validation
  ASSERT p_project_id IS NOT NULL AS "p_project_id cannot be NULL";
  ASSERT p_dataset_id IS NOT NULL AS "p_dataset_id cannot be NULL";

  -- Default dry_run to FALSE if not provided
  SET p_dry_run = COALESCE(p_dry_run, FALSE);

  -- 2. Count rows that need updating
  EXECUTE IMMEDIATE FORMAT("""
    SELECT COUNT(*)
    FROM `%s.%s.saas_subscription_plans`
    WHERE (source_currency IS NULL
           OR source_price IS NULL
           OR exchange_rate_used IS NULL)
      AND unit_price_usd IS NOT NULL
      AND unit_price_usd > 0
  """, p_project_id, p_dataset_id)
  INTO v_rows_to_update;

  -- 3. Show preview of what will be updated (dry run)
  IF p_dry_run THEN
    EXECUTE IMMEDIATE FORMAT("""
      SELECT
        id,
        subscription_id,
        plan_name,
        provider,
        currency AS current_currency,
        unit_price_usd AS current_unit_price_usd,
        source_currency AS current_source_currency,
        source_price AS current_source_price,
        exchange_rate_used AS current_exchange_rate_used,
        -- Preview new values
        COALESCE(source_currency, currency, 'USD') AS new_source_currency,
        COALESCE(source_price, unit_price_usd) AS new_source_price,
        CASE
          WHEN source_currency IS NOT NULL AND exchange_rate_used IS NOT NULL
            THEN exchange_rate_used
          WHEN COALESCE(source_currency, currency, 'USD') = 'USD'
            THEN 1.0
          WHEN unit_price_usd > 0
            THEN COALESCE(source_price, unit_price_usd) / unit_price_usd
          ELSE NULL
        END AS new_exchange_rate_used,
        effective_date,
        status
      FROM `%s.%s.saas_subscription_plans`
      WHERE (source_currency IS NULL
             OR source_price IS NULL
             OR exchange_rate_used IS NULL)
        AND unit_price_usd IS NOT NULL
        AND unit_price_usd > 0
      ORDER BY provider, subscription_id, effective_date DESC
    """, p_project_id, p_dataset_id);

    SELECT
      'DRY RUN PREVIEW' AS mode,
      v_rows_to_update AS rows_to_update,
      'Set p_dry_run = FALSE to execute migration' AS next_step;

  ELSE
    -- 4. Execute backfill update
    EXECUTE IMMEDIATE FORMAT("""
      UPDATE `%s.%s.saas_subscription_plans`
      SET
        source_currency = COALESCE(source_currency, currency, 'USD'),
        source_price = COALESCE(source_price, unit_price_usd),
        exchange_rate_used = CASE
          -- Preserve existing exchange rate if already set
          WHEN exchange_rate_used IS NOT NULL THEN exchange_rate_used
          -- If source currency is USD (or assumed USD), rate is 1.0
          WHEN COALESCE(source_currency, currency, 'USD') = 'USD' THEN 1.0
          -- Calculate rate from price ratio if both prices exist
          WHEN unit_price_usd > 0 AND source_price IS NOT NULL
            THEN source_price / unit_price_usd
          WHEN unit_price_usd > 0
            THEN unit_price_usd / unit_price_usd  -- This equals 1.0
          ELSE NULL
        END,
        updated_at = CURRENT_TIMESTAMP()
      WHERE (source_currency IS NULL
             OR source_price IS NULL
             OR exchange_rate_used IS NULL)
        AND unit_price_usd IS NOT NULL
        AND unit_price_usd > 0
    """, p_project_id, p_dataset_id);

    -- Get actual rows updated
    SET v_rows_updated = @@row_count;

    -- 5. Verify update results
    SELECT
      'MIGRATION COMPLETED' AS status,
      p_project_id AS project_id,
      p_dataset_id AS dataset_id,
      v_rows_to_update AS rows_identified,
      v_rows_updated AS rows_updated,
      CURRENT_TIMESTAMP() AS completed_at;

    -- 6. Show sample of updated rows
    EXECUTE IMMEDIATE FORMAT("""
      SELECT
        id,
        subscription_id,
        plan_name,
        provider,
        currency,
        unit_price_usd,
        source_currency,
        source_price,
        exchange_rate_used,
        effective_date,
        status,
        updated_at
      FROM `%s.%s.saas_subscription_plans`
      WHERE updated_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 5 MINUTE)
      ORDER BY provider, subscription_id, effective_date DESC
      LIMIT 20
    """, p_project_id, p_dataset_id);
  END IF;

EXCEPTION WHEN ERROR THEN
  SELECT
    'MIGRATION FAILED' AS status,
    @@error.message AS error_message,
    p_project_id AS project_id,
    p_dataset_id AS dataset_id;
  RAISE USING MESSAGE = CONCAT('Migration Failed: ', @@error.message);
END;
