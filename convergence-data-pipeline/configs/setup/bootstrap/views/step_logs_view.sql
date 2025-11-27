-- Organization-specific Step Logs Materialized View
-- Created during org onboarding in the org's dataset
-- Pre-aggregates central org_meta_step_logs table for this org's data only
--
-- Benefits:
--   - Faster queries (pre-computed, cached results)
--   - Automatic refresh when base table changes
--   - Clustering for efficient filtering by pipeline_logging_id and status
--
-- Placeholders:
--   {project_id} - GCP project ID
--   {dataset_id} - Organization dataset (e.g., acmecorp_prod)
--   {org_slug}   - Organization slug for filtering

CREATE MATERIALIZED VIEW IF NOT EXISTS `{project_id}.{dataset_id}.step_logs`
CLUSTER BY pipeline_logging_id, status
OPTIONS (
  enable_refresh = true,
  refresh_interval_minutes = 30,
  max_staleness = INTERVAL "4" HOUR
)
AS
SELECT
  step_logging_id,
  org_slug,
  pipeline_logging_id,
  step_name,
  step_type,
  step_index,
  status,
  start_time,
  end_time,
  duration_ms,
  rows_processed,
  error_message,
  user_id,
  metadata
FROM `{project_id}.organizations.org_meta_step_logs`
WHERE org_slug = '{org_slug}';
