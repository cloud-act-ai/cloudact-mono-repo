-- Organization Pipeline Execution Logs Materialized View
-- Single consolidated view for all pipeline and step execution data
--
-- Architecture:
--   organizations.org_meta_pipeline_runs + organizations.org_meta_step_logs
--   -> {org_dataset}.x_pipeline_exec_logs (filtered by org_slug)
--
-- Data Flow:
--   1. Pipeline service writes logs to CENTRAL organizations dataset
--   2. This MV filters central data for THIS org only
--   3. Frontend queries this MV for fast, pre-filtered results
--
-- Benefits:
--   - Single materialized view per org (reduced from 3 views)
--   - Auto-refreshed every 15 minutes
--   - Clustered for fast dashboard queries
--   - Denormalized - one row per step with pipeline info
--
-- Placeholders:
--   {project_id} - GCP project ID
--   {dataset_id} - Organization dataset (e.g., acmecorp_prod)
--   {org_slug}   - Organization slug for filtering

CREATE MATERIALIZED VIEW IF NOT EXISTS `{project_id}.{dataset_id}.x_pipeline_exec_logs`
CLUSTER BY pipeline_status, pipeline_id, step_status
OPTIONS (
  enable_refresh = true,
  refresh_interval_minutes = 15,
  max_staleness = INTERVAL "4" HOUR
)
AS
SELECT
  -- Pipeline Info
  p.pipeline_logging_id,
  p.org_slug,
  p.pipeline_id,
  p.status AS pipeline_status,
  p.trigger_type,
  p.trigger_by,
  p.user_id AS pipeline_user_id,
  p.org_api_key_id,
  p.start_time AS pipeline_start_time,
  p.end_time AS pipeline_end_time,
  p.duration_ms AS pipeline_duration_ms,
  p.run_date,
  p.parameters AS pipeline_parameters,
  p.run_metadata,
  p.error_message AS pipeline_error,

  -- Step Info (NULL for pipelines without steps)
  s.step_logging_id,
  s.step_name,
  s.step_type,
  s.step_index,
  s.status AS step_status,
  s.start_time AS step_start_time,
  s.end_time AS step_end_time,
  s.duration_ms AS step_duration_ms,
  s.rows_processed,
  s.error_message AS step_error,
  s.user_id AS step_user_id,
  s.metadata AS step_metadata

FROM `{project_id}.organizations.org_meta_pipeline_runs` p
LEFT JOIN `{project_id}.organizations.org_meta_step_logs` s
  ON p.pipeline_logging_id = s.pipeline_logging_id
  AND p.org_slug = s.org_slug
WHERE p.org_slug = '{org_slug}';
