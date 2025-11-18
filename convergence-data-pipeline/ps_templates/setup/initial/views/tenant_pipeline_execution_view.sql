-- View: tenant_pipeline_execution_view
-- Purpose: Customer-facing view for pipeline execution logs with step details
-- Security: Filters by tenant_id to ensure data isolation
-- Usage: SELECT * FROM tenants.tenant_pipeline_execution_view WHERE tenant_id = 'my_tenant'

CREATE OR REPLACE VIEW `{project_id}.tenants.tenant_pipeline_execution_view` AS
SELECT
  -- Pipeline info
  p.pipeline_logging_id,
  p.pipeline_id,
  p.tenant_id,
  p.status AS pipeline_status,
  p.trigger_type,
  p.trigger_by,
  p.user_id,
  p.start_time AS pipeline_start_time,
  p.end_time AS pipeline_end_time,
  p.duration_ms AS pipeline_duration_ms,
  p.run_date,
  p.error_message AS pipeline_error_message,
  p.parameters AS pipeline_parameters,

  -- Step info (nullable for pipelines without step logs yet)
  s.step_logging_id,
  s.step_name,
  s.step_type,
  s.step_index,
  s.status AS step_status,
  s.start_time AS step_start_time,
  s.end_time AS step_end_time,
  s.duration_ms AS step_duration_ms,
  s.rows_processed AS step_rows_processed,
  s.error_message AS step_error_message,
  s.metadata AS step_metadata,

  -- Aggregated metrics
  COUNTIF(s.status = 'COMPLETED') OVER (PARTITION BY p.pipeline_logging_id) AS steps_completed,
  COUNTIF(s.status = 'FAILED') OVER (PARTITION BY p.pipeline_logging_id) AS steps_failed,
  COUNT(s.step_logging_id) OVER (PARTITION BY p.pipeline_logging_id) AS total_steps

FROM `{project_id}.tenants.tenant_pipeline_runs` p
LEFT JOIN `{project_id}.tenants.tenant_step_logs` s
  ON p.pipeline_logging_id = s.pipeline_logging_id
  AND p.tenant_id = s.tenant_id

ORDER BY p.start_time DESC, s.step_index ASC;

-- Usage examples:
--
-- 1. Get all pipeline runs for a tenant:
--    SELECT * FROM tenants.tenant_pipeline_execution_view
--    WHERE tenant_id = 'my_tenant'
--    ORDER BY pipeline_start_time DESC
--    LIMIT 100;
--
-- 2. Get failed pipelines with error details:
--    SELECT pipeline_id, pipeline_start_time, step_name, step_error_message
--    FROM tenants.tenant_pipeline_execution_view
--    WHERE tenant_id = 'my_tenant' AND pipeline_status = 'FAILED';
--
-- 3. Get pipeline summary (one row per pipeline):
--    SELECT DISTINCT
--      pipeline_logging_id,
--      pipeline_id,
--      pipeline_status,
--      pipeline_duration_ms,
--      steps_completed,
--      steps_failed,
--      total_steps
--    FROM tenants.tenant_pipeline_execution_view
--    WHERE tenant_id = 'my_tenant';
