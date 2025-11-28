-- Organization Consolidated Pipeline & Logs View
-- Created during org onboarding in the org's dataset
-- Joins pipeline runs with step logs for a complete execution picture
--
-- This view provides:
--   - Full pipeline execution history
--   - Step-level details joined with pipeline runs
--   - Aggregated metrics (total steps, success/failure counts)
--   - Error tracking across pipeline and steps
--
-- Placeholders:
--   {project_id} - GCP project ID
--   {dataset_id} - Organization dataset (e.g., acmecorp_prod)
--   {org_slug}   - Organization slug for filtering
--
-- Note: Using regular VIEW instead of MATERIALIZED VIEW because BigQuery
-- materialized views have restrictions on JSON columns in GROUP BY

CREATE OR REPLACE VIEW `{project_id}.{dataset_id}.org_consolidated` AS
SELECT
  -- Pipeline Run Info
  p.pipeline_logging_id,
  p.pipeline_id,
  p.status AS pipeline_status,
  p.trigger_type,
  p.trigger_by,
  p.user_id,
  p.org_api_key_id,
  p.start_time AS pipeline_start_time,
  p.end_time AS pipeline_end_time,
  p.duration_ms AS pipeline_duration_ms,
  p.run_date,
  TO_JSON_STRING(p.parameters) AS parameters,
  p.error_message AS pipeline_error,

  -- Step Aggregations
  COUNT(s.step_logging_id) AS total_steps,
  COUNTIF(s.status = 'COMPLETED') AS steps_completed,
  COUNTIF(s.status = 'FAILED') AS steps_failed,
  COUNTIF(s.status = 'RUNNING') AS steps_running,
  COUNTIF(s.status = 'PENDING') AS steps_pending,
  COUNTIF(s.status = 'SKIPPED') AS steps_skipped,

  -- Step Metrics
  SUM(s.duration_ms) AS total_step_duration_ms,
  SUM(s.rows_processed) AS total_rows_processed,
  MAX(s.end_time) AS last_step_end_time,

  -- First Error in Steps (if any)
  ARRAY_AGG(
    STRUCT(s.step_name, s.error_message)
    ORDER BY s.step_index
    LIMIT 1
  )[SAFE_OFFSET(0)] AS first_step_error

FROM `{project_id}.organizations.org_meta_pipeline_runs` p
LEFT JOIN `{project_id}.organizations.org_meta_step_logs` s
  ON p.pipeline_logging_id = s.pipeline_logging_id
  AND p.org_slug = s.org_slug
WHERE p.org_slug = '{org_slug}'
GROUP BY
  p.pipeline_logging_id,
  p.pipeline_id,
  p.status,
  p.trigger_type,
  p.trigger_by,
  p.user_id,
  p.org_api_key_id,
  p.start_time,
  p.end_time,
  p.duration_ms,
  p.run_date,
  p.parameters,
  p.error_message;
