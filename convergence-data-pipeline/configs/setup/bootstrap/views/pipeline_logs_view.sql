-- Organization-specific Pipeline Logs Materialized View
-- Created during org onboarding in the org's dataset
-- Pre-aggregates central org_meta_pipeline_runs table for this org's data only
--
-- Benefits:
--   - Faster queries (pre-computed, cached results)
--   - Automatic refresh when base table changes
--   - Clustering for efficient filtering by status and pipeline_id
--
-- Placeholders:
--   {project_id} - GCP project ID
--   {dataset_id} - Organization dataset (e.g., acmecorp_prod)
--   {org_slug}   - Organization slug for filtering

CREATE MATERIALIZED VIEW IF NOT EXISTS `{project_id}.{dataset_id}.pipeline_logs`
CLUSTER BY status, pipeline_id
OPTIONS (
  enable_refresh = true,
  refresh_interval_minutes = 30,
  max_staleness = INTERVAL "4" HOUR
)
AS
SELECT
  pipeline_logging_id,
  org_slug,
  pipeline_id,
  status,
  trigger_type,
  trigger_by,
  user_id,
  org_api_key_id,
  start_time,
  end_time,
  duration_ms,
  run_date,
  parameters,
  run_metadata,
  error_message
FROM `{project_id}.organizations.org_meta_pipeline_runs`
WHERE org_slug = '{org_slug}';
