-- View: tenant_comprehensive_view
-- Purpose: Comprehensive tenant-specific view with ALL pipeline details (excluding sensitive data)
-- Security: Created in each tenant's dataset, automatically filters by tenant_id
-- Usage: SELECT * FROM {tenant_id}.tenant_comprehensive_view
-- Location: Created in EACH tenant's dataset during onboarding

CREATE OR REPLACE VIEW `{project_id}.{tenant_id}.tenant_comprehensive_view` AS
WITH pipeline_aggregates AS (
  SELECT
    tenant_id,
    pipeline_id,
    DATE(start_time) AS run_date,
    COUNT(*) AS total_runs,
    COUNTIF(status = 'COMPLETED') AS successful_runs,
    COUNTIF(status = 'FAILED') AS failed_runs,
    COUNTIF(status = 'RUNNING') AS running_runs,
    COUNTIF(status = 'PENDING') AS pending_runs,
    AVG(duration_ms) AS avg_duration_ms,
    MAX(duration_ms) AS max_duration_ms,
    MIN(duration_ms) AS min_duration_ms,
    MAX(start_time) AS last_run_time
  FROM `{project_id}.tenants.tenant_pipeline_runs`
  GROUP BY tenant_id, pipeline_id, DATE(start_time)
),
step_aggregates AS (
  SELECT
    s.tenant_id,
    s.pipeline_logging_id,
    COUNT(*) AS total_steps,
    COUNTIF(s.status = 'COMPLETED') AS steps_completed,
    COUNTIF(s.status = 'FAILED') AS steps_failed,
    COUNTIF(s.status = 'RUNNING') AS steps_running,
    SUM(s.rows_processed) AS total_rows_processed,
    ARRAY_AGG(
      IF(s.status = 'FAILED',
        STRUCT(
          s.step_name AS step_name,
          s.error_message AS error_message,
          s.start_time AS failed_at
        ),
        NULL
      ) IGNORE NULLS
    ) AS failed_steps_details
  FROM `{project_id}.tenants.tenant_step_logs` s
  GROUP BY s.tenant_id, s.pipeline_logging_id
),
dq_aggregates AS (
  SELECT
    tenant_id,
    pipeline_logging_id,
    COUNT(*) AS total_dq_checks,
    COUNTIF(overall_status = 'PASSED') AS dq_checks_passed,
    COUNTIF(overall_status = 'FAILED') AS dq_checks_failed,
    SUM(expectations_passed) AS total_expectations_passed,
    SUM(expectations_failed) AS total_expectations_failed,
    ARRAY_AGG(
      IF(overall_status = 'FAILED',
        STRUCT(
          target_table AS table_name,
          failed_expectations AS failures,
          executed_at AS checked_at
        ),
        NULL
      ) IGNORE NULLS
    ) AS failed_dq_details
  FROM `{project_id}.tenants.tenant_dq_results`
  GROUP BY tenant_id, pipeline_logging_id
)
SELECT
  -- Tenant Information (NO sensitive data)
  tp.tenant_id,
  tp.company_name,
  tp.admin_email,
  tp.status AS tenant_status,
  tp.created_at AS tenant_onboarding_date,

  -- Subscription Information
  ts.plan_name,
  ts.status AS subscription_status,
  ts.daily_limit AS subscription_daily_limit,
  ts.monthly_limit AS subscription_monthly_limit,
  ts.concurrent_limit AS subscription_concurrent_limit,
  ts.trial_end_date,
  ts.subscription_end_date,

  -- Usage Quotas
  tuq.usage_date,
  tuq.pipelines_run_today,
  tuq.pipelines_succeeded_today,
  tuq.pipelines_failed_today,
  tuq.pipelines_run_month,
  tuq.concurrent_pipelines_running,
  tuq.daily_limit,
  tuq.monthly_limit,
  tuq.concurrent_limit,
  tuq.last_updated AS last_quota_update,

  -- Current Usage Status
  CASE
    WHEN tuq.pipelines_run_today >= tuq.daily_limit THEN 'DAILY_LIMIT_REACHED'
    WHEN tuq.pipelines_run_month >= tuq.monthly_limit THEN 'MONTHLY_LIMIT_REACHED'
    WHEN tuq.concurrent_pipelines_running >= tuq.concurrent_limit THEN 'CONCURRENT_LIMIT_REACHED'
    ELSE 'AVAILABLE'
  END AS quota_status,
  SAFE_DIVIDE(tuq.pipelines_run_today, tuq.daily_limit) * 100 AS daily_usage_percent,
  SAFE_DIVIDE(tuq.pipelines_run_month, tuq.monthly_limit) * 100 AS monthly_usage_percent,

  -- Pipeline Execution Details
  pr.pipeline_logging_id,
  pr.pipeline_id,
  pr.status AS pipeline_status,
  pr.trigger_type,
  pr.trigger_by,
  pr.user_id,
  pr.start_time AS pipeline_start_time,
  pr.end_time AS pipeline_end_time,
  pr.duration_ms AS pipeline_duration_ms,
  pr.run_date AS pipeline_run_date,
  pr.parameters AS pipeline_parameters,
  pr.error_message AS pipeline_error_message,

  -- Step Aggregates
  sa.total_steps,
  sa.steps_completed,
  sa.steps_failed,
  sa.steps_running,
  sa.total_rows_processed,
  sa.failed_steps_details,

  -- DQ Aggregates
  dqa.total_dq_checks,
  dqa.dq_checks_passed,
  dqa.dq_checks_failed,
  dqa.total_expectations_passed,
  dqa.total_expectations_failed,
  dqa.failed_dq_details,

  -- Pipeline Aggregates (daily summary)
  pa.total_runs AS daily_total_runs,
  pa.successful_runs AS daily_successful_runs,
  pa.failed_runs AS daily_failed_runs,
  pa.running_runs AS daily_running_runs,
  pa.pending_runs AS daily_pending_runs,
  pa.avg_duration_ms AS daily_avg_duration_ms,
  pa.max_duration_ms AS daily_max_duration_ms,
  pa.min_duration_ms AS daily_min_duration_ms,
  pa.last_run_time AS daily_last_run_time,

  -- Error Indicators
  CASE
    WHEN pr.status = 'FAILED' THEN TRUE
    WHEN sa.steps_failed > 0 THEN TRUE
    WHEN dqa.dq_checks_failed > 0 THEN TRUE
    ELSE FALSE
  END AS has_errors,

  -- Success Rate
  SAFE_DIVIDE(pa.successful_runs, pa.total_runs) * 100 AS daily_success_rate,

  -- Performance Indicators
  CASE
    WHEN pr.duration_ms > pa.avg_duration_ms * 2 THEN 'SLOW'
    WHEN pr.duration_ms < pa.avg_duration_ms * 0.5 THEN 'FAST'
    ELSE 'NORMAL'
  END AS performance_status

FROM `{project_id}.tenants.tenant_profiles` tp

-- Join Subscription (current active subscription)
LEFT JOIN `{project_id}.tenants.tenant_subscriptions` ts
  ON tp.tenant_id = ts.tenant_id
  AND ts.status IN ('ACTIVE', 'TRIAL')

-- Join Usage Quotas (today's quota)
LEFT JOIN `{project_id}.tenants.tenant_usage_quotas` tuq
  ON tp.tenant_id = tuq.tenant_id
  AND tuq.usage_date = CURRENT_DATE()

-- Join Pipeline Runs (all runs for this tenant)
LEFT JOIN `{project_id}.tenants.tenant_pipeline_runs` pr
  ON tp.tenant_id = pr.tenant_id

-- Join Step Aggregates
LEFT JOIN step_aggregates sa
  ON pr.tenant_id = sa.tenant_id
  AND pr.pipeline_logging_id = sa.pipeline_logging_id

-- Join DQ Aggregates
LEFT JOIN dq_aggregates dqa
  ON pr.tenant_id = dqa.tenant_id
  AND pr.pipeline_logging_id = dqa.pipeline_logging_id

-- Join Pipeline Aggregates (daily summary)
LEFT JOIN pipeline_aggregates pa
  ON pr.tenant_id = pa.tenant_id
  AND pr.pipeline_id = pa.pipeline_id
  AND DATE(pr.start_time) = pa.run_date

-- Filter to ONLY this tenant's data
WHERE tp.tenant_id = '{tenant_id}'

ORDER BY pr.start_time DESC;

-- Usage Examples (from tenant's perspective):
--
-- 1. Get all pipeline runs with details:
--    SELECT * FROM {tenant_id}.tenant_comprehensive_view
--    ORDER BY pipeline_start_time DESC
--    LIMIT 100;
--
-- 2. Get only failed pipelines with full error details:
--    SELECT
--      pipeline_id, pipeline_start_time,
--      pipeline_error_message, failed_steps_details, failed_dq_details
--    FROM {tenant_id}.tenant_comprehensive_view
--    WHERE has_errors = TRUE;
--
-- 3. Get quota usage summary:
--    SELECT DISTINCT
--      company_name, plan_name,
--      pipelines_run_today, daily_limit, daily_usage_percent,
--      pipelines_run_month, monthly_limit, monthly_usage_percent,
--      quota_status
--    FROM {tenant_id}.tenant_comprehensive_view;
--
-- 4. Get daily pipeline performance summary:
--    SELECT DISTINCT
--      pipeline_id, pipeline_run_date,
--      daily_total_runs, daily_successful_runs, daily_failed_runs,
--      daily_success_rate, daily_avg_duration_ms
--    FROM {tenant_id}.tenant_comprehensive_view
--    ORDER BY pipeline_run_date DESC;
