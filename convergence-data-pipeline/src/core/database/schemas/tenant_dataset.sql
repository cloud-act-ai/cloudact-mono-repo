-- ============================================================================
-- TENANT DATASET - Per-Customer Operational Data Schema
-- ============================================================================
-- Project: gac-prod-471220
-- Dataset: {tenant_id} (dynamic per tenant, e.g., customer_abc123)
-- Purpose: Tenant-isolated operational data for pipeline execution, logs, and data quality
-- Version: 2.0.0
-- Created: 2025-11-17
--
-- Isolation: One dataset per customer for complete data isolation
-- Security: IAM-based access control per tenant dataset
-- ============================================================================

-- ============================================================================
-- CREATE DATASET (Dynamic per customer)
-- ============================================================================
-- Example: CREATE SCHEMA IF NOT EXISTS `gac-prod-471220.customer_abc123`
-- This is created programmatically during customer onboarding
-- ============================================================================

-- ============================================================================
-- TABLE 1: x_meta_pipeline_runs (DEPRECATED - MOVED TO CENTRAL TENANTS DATASET)
-- ============================================================================
-- Purpose: Pipeline execution metadata and logging
-- Scope: NOW CENTRALIZED in tenants.x_meta_pipeline_runs for all tenants
-- NOTE: This table definition is kept for reference only. In production,
--       x_meta_pipeline_runs is created in the central 'tenants' dataset,
--       not in per-tenant datasets. All pipeline runs across all tenants
--       are logged to tenants.x_meta_pipeline_runs with tenant_id column.
-- ============================================================================
CREATE TABLE IF NOT EXISTS `{project_id}.{tenant_id}.x_meta_pipeline_runs` (
  -- Primary Identifiers
  pipeline_logging_id STRING NOT NULL,              -- Unique pipeline run ID (UUID)

  -- Pipeline Metadata
  pipeline_name STRING NOT NULL,                    -- Name of the pipeline
  pipeline_template STRING NOT NULL,                -- Template used (cost_billing, security_audit, etc.)
  provider STRING NOT NULL,                         -- GCP, AWS, AZURE, etc.
  domain STRING NOT NULL,                           -- COST, SECURITY, COMPLIANCE, OBSERVABILITY

  -- Execution Timing
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  completed_at TIMESTAMP,
  execution_duration_seconds INT64,                 -- Duration in seconds

  -- Execution State
  status STRING NOT NULL,                           -- PENDING, RUNNING, COMPLETED, FAILED, CANCELLED

  -- Source Configuration
  source_project_id STRING,                         -- GCP project for source data
  source_dataset STRING,                            -- BigQuery dataset for source
  source_table STRING,                              -- BigQuery table for source (optional)

  -- Output Configuration
  output_dataset STRING NOT NULL,                   -- Output BigQuery dataset
  output_table STRING,                              -- Output BigQuery table

  -- Performance Metrics
  total_rows_processed INT64 DEFAULT 0,             -- Total rows processed
  total_bytes_processed INT64 DEFAULT 0,            -- Total bytes processed
  total_bytes_billed INT64 DEFAULT 0,               -- BigQuery bytes billed

  -- Error Handling
  error_message STRING,                             -- Error details if failed
  error_step STRING,                                -- Which step failed
  retry_attempt INT64 DEFAULT 0,                    -- Retry attempt number

  -- Trigger Information
  triggered_by STRING NOT NULL,                     -- "scheduled", "manual", "api", "retry"
  triggered_by_user STRING,                         -- User email if manual trigger (DEPRECATED - use user_id)
  user_id STRING,                                   -- User UUID from frontend (X-User-ID header)

  -- Parameters
  pipeline_parameters JSON,                         -- Runtime parameters (JSON)

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(started_at)
CLUSTER BY status, pipeline_template, started_at
OPTIONS(
  description="Pipeline execution metadata and logging for tenant operations",
  labels=[("category", "pipeline_execution"), ("tier", "operational")]
);

-- ============================================================================
-- TABLE 2: x_meta_step_logs
-- ============================================================================
-- Purpose: Detailed step-by-step execution logs for pipeline debugging
-- Scope: Per-tenant operational logs
-- ============================================================================
CREATE TABLE IF NOT EXISTS `{project_id}.{tenant_id}.x_meta_step_logs` (
  -- Primary Identifiers
  log_id STRING NOT NULL,                           -- Unique log entry ID (UUID)
  pipeline_logging_id STRING NOT NULL,              -- Foreign key to x_meta_pipeline_runs

  -- Step Information
  step_number INT64 NOT NULL,                       -- Execution order (1, 2, 3...)
  step_name STRING NOT NULL,                        -- Name of the step
  step_type STRING NOT NULL,                        -- EXTRACT, TRANSFORM, LOAD, VALIDATE, etc.

  -- Timing
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  completed_at TIMESTAMP,
  duration_seconds INT64,                           -- Duration in seconds

  -- Status
  status STRING NOT NULL,                           -- PENDING, RUNNING, COMPLETED, FAILED, SKIPPED

  -- Step Details
  input_source STRING,                              -- Input data source
  output_destination STRING,                        -- Output data destination
  rows_processed INT64 DEFAULT 0,                   -- Rows processed in this step
  bytes_processed INT64 DEFAULT 0,                  -- Bytes processed in this step

  -- Logging
  log_level STRING DEFAULT 'INFO',                  -- DEBUG, INFO, WARNING, ERROR, CRITICAL
  log_message STRING,                               -- Detailed log message

  -- Error Handling
  error_message STRING,                             -- Error details if failed
  stack_trace STRING,                               -- Full stack trace for debugging

  -- User Tracking
  user_id STRING,                                   -- User UUID from frontend (X-User-ID header)

  -- Metadata
  metadata JSON,                                    -- Additional step metadata (JSON)
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(started_at)
CLUSTER BY pipeline_logging_id, step_number, status
OPTIONS(
  description="Detailed step-by-step execution logs for pipeline debugging",
  labels=[("category", "pipeline_logs"), ("tier", "operational")]
);

-- ============================================================================
-- TABLE 3: x_meta_dq_results
-- ============================================================================
-- Purpose: Data quality validation results
-- Scope: Per-tenant data quality metrics
-- ============================================================================
CREATE TABLE IF NOT EXISTS `{project_id}.{tenant_id}.x_meta_dq_results` (
  -- Primary Identifiers
  dq_result_id STRING NOT NULL,                     -- Unique DQ result ID (UUID)
  pipeline_logging_id STRING NOT NULL,              -- Foreign key to x_meta_pipeline_runs

  -- Data Quality Check Information
  check_name STRING NOT NULL,                       -- Name of the DQ check
  check_type STRING NOT NULL,                       -- COMPLETENESS, ACCURACY, CONSISTENCY, TIMELINESS, etc.
  check_severity STRING NOT NULL,                   -- INFO, WARNING, ERROR, CRITICAL

  -- Check Target
  target_dataset STRING NOT NULL,                   -- Dataset being validated
  target_table STRING NOT NULL,                     -- Table being validated
  target_column STRING,                             -- Column being validated (optional)

  -- Check Results
  check_passed BOOL NOT NULL,                       -- TRUE if check passed
  rows_checked INT64 DEFAULT 0,                     -- Total rows checked
  rows_failed INT64 DEFAULT 0,                      -- Rows that failed validation
  failure_rate NUMERIC(5, 2),                       -- Failure percentage (0-100)

  -- Thresholds
  threshold_value NUMERIC,                          -- Expected threshold value
  actual_value NUMERIC,                             -- Actual measured value

  -- Details
  validation_query STRING,                          -- SQL query used for validation
  failure_details JSON,                             -- Detailed failure information (JSON)

  -- Timing
  executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),

  -- User Tracking
  user_id STRING,                                   -- User UUID from frontend (X-User-ID header)

  -- Metadata
  metadata JSON,                                    -- Additional DQ metadata (JSON)
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(executed_at)
CLUSTER BY pipeline_logging_id, check_type, check_passed
OPTIONS(
  description="Data quality validation results for pipeline execution",
  labels=[("category", "data_quality"), ("tier", "operational")]
);

-- ============================================================================
-- TABLE 4: tenant_pipeline_configs
-- ============================================================================
-- Purpose: Per-tenant pipeline scheduling configurations
-- Scope: Tenant-specific pipeline settings (copied from centralized config)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `{project_id}.{tenant_id}.tenant_pipeline_configs` (
  -- Primary Identifiers
  config_id STRING NOT NULL,                        -- Unique config ID (UUID)

  -- Provider & Domain
  provider STRING NOT NULL,                         -- GCP, AWS, AZURE, OPENAI, CLAUDE
  domain STRING NOT NULL,                           -- COST, SECURITY, COMPLIANCE, OBSERVABILITY

  -- Pipeline Template Configuration
  pipeline_template STRING NOT NULL,                -- cost_billing, security_audit, compliance_check, etc.
  pipeline_name STRING NOT NULL,                    -- Human-readable pipeline name

  -- Activation Status
  is_active BOOL NOT NULL DEFAULT TRUE,             -- Enable/disable pipeline execution

  -- Schedule Configuration
  schedule_type STRING NOT NULL,                    -- HOURLY, DAILY, WEEKLY, MONTHLY, CUSTOM
  schedule_cron STRING NOT NULL,                    -- Cron expression (e.g., "0 2 * * *")
  timezone STRING NOT NULL DEFAULT 'UTC',           -- Timezone for schedule

  -- Execution Tracking
  next_run_time TIMESTAMP,                          -- When this pipeline should run next
  last_run_time TIMESTAMP,                          -- When it last ran
  last_run_status STRING,                           -- SUCCESS, FAILED, SKIPPED

  -- Pipeline Parameters
  parameters JSON,                                  -- Pipeline-specific parameters (JSON)

  -- Retry Configuration
  retry_config JSON,                                -- {"max_retries": 3, "backoff_multiplier": 2, "max_backoff_seconds": 3600}

  -- Notifications
  notification_emails ARRAY<STRING>,                -- Email addresses for pipeline notifications

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  created_by STRING NOT NULL,                       -- Email of creator

  -- Notes
  description STRING                                -- Pipeline description/notes
)
PARTITION BY DATE(created_at)
CLUSTER BY next_run_time, is_active
OPTIONS(
  description="Per-tenant pipeline scheduling configurations",
  labels=[("category", "pipeline_config"), ("tier", "operational")]
);

-- ============================================================================
-- TABLE 5: tenant_scheduled_pipeline_runs
-- ============================================================================
-- Purpose: Track scheduled pipeline execution history
-- Scope: Tenant-specific execution history
-- ============================================================================
CREATE TABLE IF NOT EXISTS `{project_id}.{tenant_id}.tenant_scheduled_pipeline_runs` (
  -- Primary Identifiers
  run_id STRING NOT NULL,                           -- Unique run ID (UUID)
  config_id STRING NOT NULL,                        -- Foreign key to tenant_pipeline_configs

  -- Pipeline Information
  pipeline_template STRING NOT NULL,                -- Template used for execution

  -- Timing
  scheduled_time TIMESTAMP NOT NULL,                -- When it was scheduled to run
  actual_start_time TIMESTAMP,                      -- When it actually started
  actual_end_time TIMESTAMP,                        -- When it completed

  -- Execution State
  state STRING NOT NULL,                            -- SCHEDULED, PENDING, RUNNING, COMPLETED, FAILED, SKIPPED

  -- Pipeline Execution Reference
  pipeline_logging_id STRING,                       -- References x_meta_pipeline_runs

  -- Performance Metrics
  execution_duration_seconds INT64,                 -- Duration in seconds

  -- Error Handling
  error_message STRING,                             -- Error details if failed
  retry_attempt INT64 NOT NULL DEFAULT 0,           -- 0 for first attempt, 1+ for retries

  -- Trigger Information
  triggered_by STRING NOT NULL,                     -- "cloud_scheduler", "manual", "retry", "api"
  user_id STRING,                                   -- User UUID from frontend (X-User-ID header)

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(scheduled_time)
CLUSTER BY state, scheduled_time
OPTIONS(
  description="Scheduled pipeline execution history per tenant",
  labels=[("category", "pipeline_execution"), ("tier", "operational")]
);

-- ============================================================================
-- INDEXES & CONSTRAINTS (Simulated via Clustering)
-- ============================================================================
-- BigQuery doesn't support traditional indexes, but clustering provides
-- similar query optimization benefits:
--
-- 1. x_meta_pipeline_runs: Clustered by (status, pipeline_template, started_at)
--    - Fast lookup by status and template
--    - Efficient time-range queries
--
-- 2. x_meta_step_logs: Clustered by (pipeline_logging_id, step_number, status)
--    - Fast step lookup for specific pipeline runs
--    - Efficient debugging queries
--
-- 3. x_meta_dq_results: Clustered by (pipeline_logging_id, check_type, check_passed)
--    - Fast DQ result lookup
--    - Efficient failure queries
--
-- 4. tenant_pipeline_configs: Clustered by (next_run_time, is_active)
--    - Fast "due to run" queries
--    - Efficient scheduler lookups
--
-- 5. tenant_scheduled_pipeline_runs: Clustered by (state, scheduled_time)
--    - Fast state-based queries
--    - Efficient historical lookups
-- ============================================================================

-- ============================================================================
-- VIEWS FOR OPERATIONAL MONITORING
-- ============================================================================

-- View 1: Recent pipeline runs (last 7 days)
-- NOTE: x_meta_pipeline_runs is now centralized in tenants dataset
CREATE OR REPLACE VIEW `{project_id}.{tenant_id}.recent_pipeline_runs` AS
SELECT
  pipeline_logging_id,
  pipeline_name,
  pipeline_template,
  provider,
  domain,
  status,
  started_at,
  completed_at,
  execution_duration_seconds,
  total_rows_processed,
  total_bytes_billed,
  error_message
FROM `{project_id}.tenants.x_meta_pipeline_runs`
WHERE tenant_id = '{tenant_id}'
  AND started_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
ORDER BY started_at DESC;

-- View 2: Failed pipelines requiring attention
-- NOTE: x_meta_pipeline_runs is now centralized in tenants dataset
CREATE OR REPLACE VIEW `{project_id}.{tenant_id}.failed_pipelines` AS
SELECT
  pipeline_logging_id,
  pipeline_name,
  pipeline_template,
  status,
  started_at,
  error_message,
  error_step,
  retry_attempt
FROM `{project_id}.tenants.x_meta_pipeline_runs`
WHERE tenant_id = '{tenant_id}'
  AND status = 'FAILED'
  AND started_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
ORDER BY started_at DESC;

-- View 3: Data quality failures (last 30 days)
CREATE OR REPLACE VIEW `{project_id}.{tenant_id}.dq_failures` AS
SELECT
  dq_result_id,
  pipeline_logging_id,
  check_name,
  check_type,
  check_severity,
  target_table,
  target_column,
  rows_checked,
  rows_failed,
  failure_rate,
  executed_at
FROM `{project_id}.{tenant_id}.x_meta_dq_results`
WHERE check_passed = FALSE
  AND executed_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
ORDER BY check_severity DESC, executed_at DESC;

-- ============================================================================
-- SAMPLE QUERIES
-- ============================================================================

-- Query 1: Get pipeline execution summary for today
-- NOTE: x_meta_pipeline_runs is now centralized in tenants dataset
-- SELECT
--   status,
--   COUNT(*) AS count,
--   AVG(execution_duration_seconds) AS avg_duration_seconds,
--   SUM(total_rows_processed) AS total_rows,
--   SUM(total_bytes_billed) AS total_bytes_billed
-- FROM `{project_id}.tenants.x_meta_pipeline_runs`
-- WHERE tenant_id = '{tenant_id}'
--   AND DATE(started_at) = CURRENT_DATE()
-- GROUP BY status;

-- Query 2: Get detailed logs for a specific pipeline run
-- SELECT
--   step_number,
--   step_name,
--   status,
--   duration_seconds,
--   rows_processed,
--   log_message
-- FROM `{project_id}.{tenant_id}.x_meta_step_logs`
-- WHERE pipeline_logging_id = 'your-pipeline-id'
-- ORDER BY step_number;

-- Query 3: Check data quality status for recent runs
-- SELECT
--   check_type,
--   COUNT(*) AS total_checks,
--   COUNTIF(check_passed) AS passed_checks,
--   COUNTIF(NOT check_passed) AS failed_checks,
--   ROUND(AVG(failure_rate), 2) AS avg_failure_rate
-- FROM `{project_id}.{tenant_id}.x_meta_dq_results`
-- WHERE executed_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
-- GROUP BY check_type;

-- ============================================================================
-- MAINTENANCE & MONITORING
-- ============================================================================
-- 1. Daily: Monitor pipeline execution success rates
-- 2. Weekly: Review data quality failures
-- 3. Monthly: Archive old logs (>90 days)
-- 4. Quarterly: Review and optimize table partitioning
-- ============================================================================

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
