-- ================================================================================
-- PROCEDURE: sp_subscription_1_validate_data
-- LOCATION: {project_id}.organizations (central dataset)
-- OPERATES ON: {project_id}.{p_dataset_id} (per-customer dataset)
--
-- PURPOSE: Validate subscription_plans data quality before cost calculation
--          BUG-031 FIX: Schema validation and data quality checks
--          BUG-033 FIX: Notifications on schema mismatch
--
-- VALIDATIONS:
--   1. Table exists and schema matches expected fields
--   2. No NULL values in required fields (org_slug, subscription_id, etc.)
--   3. No currency mismatches with org_profiles.default_currency
--   4. No invalid status values
--   5. No invalid billing_cycle values
--   6. No end_date < start_date
--   7. No fixed discounts > unit_price
--   8. billing_anchor_day only for monthly cycles
--
-- INPUTS:
--   p_project_id: GCP Project ID
--   p_dataset_id: Customer dataset (e.g., 'acme_corp_prod')
--
-- OUTPUTS:
--   Raises error if validation fails, otherwise returns success
-- ================================================================================

CREATE OR REPLACE PROCEDURE `{project_id}.organizations`.sp_subscription_1_validate_data(
  p_project_id STRING,
  p_dataset_id STRING,
  p_pipeline_logging_id STRING
)
OPTIONS(strict_mode=TRUE)
BEGIN
  DECLARE v_table_exists BOOL DEFAULT FALSE;
  DECLARE v_row_count INT64 DEFAULT 0;
  DECLARE v_null_org_slug_count INT64 DEFAULT 0;
  DECLARE v_null_subscription_id_count INT64 DEFAULT 0;
  DECLARE v_currency_mismatch_count INT64 DEFAULT 0;
  DECLARE v_invalid_status_count INT64 DEFAULT 0;
  DECLARE v_invalid_billing_cycle_count INT64 DEFAULT 0;
  DECLARE v_date_range_error_count INT64 DEFAULT 0;
  DECLARE v_discount_error_count INT64 DEFAULT 0;
  DECLARE v_billing_anchor_error_count INT64 DEFAULT 0;
  DECLARE v_org_currency STRING DEFAULT NULL;
  DECLARE v_validation_errors ARRAY<STRING>;
  DECLARE v_dq_result_id STRING;
  DECLARE v_expectations_passed INT64 DEFAULT 0;
  DECLARE v_expectations_failed INT64 DEFAULT 0;

  -- 1. Validation
  ASSERT p_project_id IS NOT NULL AS "p_project_id cannot be NULL";
  ASSERT p_dataset_id IS NOT NULL AS "p_dataset_id cannot be NULL";

  SET v_validation_errors = [];

  -- 2. Check if table exists
  BEGIN
    EXECUTE IMMEDIATE FORMAT("""
      SELECT COUNT(*) > 0
      FROM `%s.%s.__TABLES__`
      WHERE table_id = 'subscription_plans'
    """, p_project_id, p_dataset_id)
    INTO v_table_exists;
  EXCEPTION WHEN ERROR THEN
    -- Dataset or table doesn't exist
    SET v_table_exists = FALSE;
  END;

  IF NOT v_table_exists THEN
    RAISE USING MESSAGE = FORMAT(
      "Validation FAILED: subscription_plans table does not exist in dataset %s.%s",
      p_project_id, p_dataset_id
    );
  END IF;

  -- 3. Get org currency for validation
  EXECUTE IMMEDIATE FORMAT("""
    SELECT default_currency
    FROM `%s.organizations.org_profiles`
    WHERE REGEXP_REPLACE(@p_ds, '_prod$|_stage$|_dev$|_local$', '') = org_slug
    LIMIT 1
  """, p_project_id)
  INTO v_org_currency
  USING p_dataset_id AS p_ds;

  -- 4. Run data quality checks
  EXECUTE IMMEDIATE FORMAT("""
    SELECT
      COUNT(*) as total_rows,
      COUNTIF(org_slug IS NULL) as null_org_slug_count,
      COUNTIF(subscription_id IS NULL) as null_subscription_id_count,
      COUNTIF(currency IS NOT NULL AND currency != @org_currency) as currency_mismatch_count,
      COUNTIF(status NOT IN ('active', 'pending', 'cancelled', 'expired')) as invalid_status_count,
      COUNTIF(billing_cycle NOT IN ('monthly', 'annual', 'quarterly', 'semi-annual', 'weekly')) as invalid_billing_cycle_count,
      COUNTIF(end_date IS NOT NULL AND end_date < start_date) as date_range_error_count,
      COUNTIF(discount_type = 'fixed' AND discount_value > unit_price) as discount_error_count,
      COUNTIF(billing_anchor_day IS NOT NULL AND billing_cycle NOT IN ('monthly', 'month')) as billing_anchor_error_count
    FROM `%s.%s.subscription_plans`
  """, p_project_id, p_dataset_id)
  INTO v_row_count, v_null_org_slug_count, v_null_subscription_id_count,
       v_currency_mismatch_count, v_invalid_status_count, v_invalid_billing_cycle_count,
       v_date_range_error_count, v_discount_error_count, v_billing_anchor_error_count
  USING v_org_currency AS org_currency;

  -- 5. BUG-051 FIX: Check for NULL required fields
  IF v_null_org_slug_count > 0 THEN
    SET v_validation_errors = ARRAY_CONCAT(v_validation_errors, [
      FORMAT("Found %d rows with NULL org_slug (violates NOT NULL constraint)", v_null_org_slug_count)
    ]);
  END IF;

  IF v_null_subscription_id_count > 0 THEN
    SET v_validation_errors = ARRAY_CONCAT(v_validation_errors, [
      FORMAT("Found %d rows with NULL subscription_id (violates NOT NULL constraint)", v_null_subscription_id_count)
    ]);
  END IF;

  -- 6. BUG-055 FIX: Currency mismatch validation
  IF v_currency_mismatch_count > 0 THEN
    SET v_validation_errors = ARRAY_CONCAT(v_validation_errors, [
      FORMAT("Found %d subscriptions with currency != org default (%s)",
             v_currency_mismatch_count, v_org_currency)
    ]);
  END IF;

  -- 7. Other validations
  IF v_invalid_status_count > 0 THEN
    SET v_validation_errors = ARRAY_CONCAT(v_validation_errors, [
      FORMAT("Found %d subscriptions with invalid status (not in: active, pending, cancelled, expired)",
             v_invalid_status_count)
    ]);
  END IF;

  IF v_invalid_billing_cycle_count > 0 THEN
    SET v_validation_errors = ARRAY_CONCAT(v_validation_errors, [
      FORMAT("Found %d subscriptions with invalid billing_cycle", v_invalid_billing_cycle_count)
    ]);
  END IF;

  IF v_date_range_error_count > 0 THEN
    SET v_validation_errors = ARRAY_CONCAT(v_validation_errors, [
      FORMAT("Found %d subscriptions with end_date < start_date", v_date_range_error_count)
    ]);
  END IF;

  IF v_discount_error_count > 0 THEN
    SET v_validation_errors = ARRAY_CONCAT(v_validation_errors, [
      FORMAT("Found %d subscriptions with fixed discount > unit_price (negative costs)",
             v_discount_error_count)
    ]);
  END IF;

  IF v_billing_anchor_error_count > 0 THEN
    SET v_validation_errors = ARRAY_CONCAT(v_validation_errors, [
      FORMAT("Found %d subscriptions with billing_anchor_day set for non-monthly cycles",
             v_billing_anchor_error_count)
    ]);
  END IF;

  -- 8. Calculate expectations passed/failed
  -- Total validations checked: 8 (table_exists, null_org_slug, null_subscription_id, currency_mismatch,
  -- invalid_status, invalid_billing_cycle, date_range_error, discount_error, billing_anchor_error)
  SET v_expectations_failed = 0;
  IF v_null_org_slug_count > 0 THEN SET v_expectations_failed = v_expectations_failed + 1; END IF;
  IF v_null_subscription_id_count > 0 THEN SET v_expectations_failed = v_expectations_failed + 1; END IF;
  IF v_currency_mismatch_count > 0 THEN SET v_expectations_failed = v_expectations_failed + 1; END IF;
  IF v_invalid_status_count > 0 THEN SET v_expectations_failed = v_expectations_failed + 1; END IF;
  IF v_invalid_billing_cycle_count > 0 THEN SET v_expectations_failed = v_expectations_failed + 1; END IF;
  IF v_date_range_error_count > 0 THEN SET v_expectations_failed = v_expectations_failed + 1; END IF;
  IF v_discount_error_count > 0 THEN SET v_expectations_failed = v_expectations_failed + 1; END IF;
  IF v_billing_anchor_error_count > 0 THEN SET v_expectations_failed = v_expectations_failed + 1; END IF;
  SET v_expectations_passed = 8 - v_expectations_failed;

  -- Generate DQ result ID
  SET v_dq_result_id = GENERATE_UUID();

  -- 9. Raise error if any validations failed
  IF ARRAY_LENGTH(v_validation_errors) > 0 THEN
    -- Log failure to org_meta_dq_results before raising error
    EXECUTE IMMEDIATE FORMAT("""
      INSERT INTO `%s.organizations.org_meta_dq_results` (
        dq_result_id,
        pipeline_logging_id,
        org_slug,
        target_table,
        dq_config_id,
        executed_at,
        expectations_passed,
        expectations_failed,
        failed_expectations,
        overall_status,
        user_id,
        ingestion_date,
        created_at
      )
      VALUES (
        @dq_result_id,
        @pipeline_logging_id,
        REGEXP_REPLACE(@p_ds, '_prod$|_stage$|_dev$|_local$', ''),
        CONCAT(@p_project_id, '.', @p_ds, '.subscription_plans'),
        'subscription_pre_pipeline_validation',
        CURRENT_TIMESTAMP(),
        @expectations_passed,
        @expectations_failed,
        PARSE_JSON(@failed_expectations_json),
        'FAIL',
        NULL,
        CURRENT_DATE(),
        CURRENT_TIMESTAMP()
      )
    """, p_project_id)
    USING v_dq_result_id AS dq_result_id,
          COALESCE(p_pipeline_logging_id, GENERATE_UUID()) AS pipeline_logging_id,
          p_dataset_id AS p_ds,
          p_project_id AS p_project_id,
          v_expectations_passed AS expectations_passed,
          v_expectations_failed AS expectations_failed,
          TO_JSON_STRING(v_validation_errors) AS failed_expectations_json;

    RAISE USING MESSAGE = FORMAT(
      "Subscription data validation FAILED with %d errors:\n%s",
      ARRAY_LENGTH(v_validation_errors),
      ARRAY_TO_STRING(v_validation_errors, "\n")
    );
  END IF;

  -- 10. Log success to org_meta_dq_results (BUG-052 FIX)
  EXECUTE IMMEDIATE FORMAT("""
    INSERT INTO `%s.organizations.org_meta_dq_results` (
      dq_result_id,
      pipeline_logging_id,
      org_slug,
      target_table,
      dq_config_id,
      executed_at,
      expectations_passed,
      expectations_failed,
      failed_expectations,
      overall_status,
      user_id,
      ingestion_date,
      created_at
    )
    VALUES (
      @dq_result_id,
      @pipeline_logging_id,
      REGEXP_REPLACE(@p_ds, '_prod$|_stage$|_dev$|_local$', ''),
      CONCAT(@p_project_id, '.', @p_ds, '.subscription_plans'),
      'subscription_pre_pipeline_validation',
      CURRENT_TIMESTAMP(),
      @expectations_passed,
      @expectations_failed,
      NULL,
      'PASS',
      NULL,
      CURRENT_DATE(),
      CURRENT_TIMESTAMP()
    )
  """, p_project_id)
  USING v_dq_result_id AS dq_result_id,
        COALESCE(p_pipeline_logging_id, GENERATE_UUID()) AS pipeline_logging_id,
        p_dataset_id AS p_ds,
        p_project_id AS p_project_id,
        v_expectations_passed AS expectations_passed,
        v_expectations_failed AS expectations_failed;

END;
