-- ============================================================================
-- TENANTS DATASET - Centralized Tenant Management Schema
-- ============================================================================
-- Project: gac-prod-471220
-- Dataset: tenants
-- Purpose: Multi-tenant management with Row-Level Security (RLS)
-- Version: 2.0.0
-- Created: 2025-11-17
-- Updated: 2025-11-17 - Renamed from customers to tenants
--
-- Security: Row-Level Security (RLS) enforced at query time
-- Encryption: KMS-encrypted sensitive fields (API keys, credentials)
-- ============================================================================

-- ============================================================================
-- CREATE DATASET
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS `gac-prod-471220.tenants`
OPTIONS(
  location="US",
  description="Centralized tenant management with Row-Level Security (RLS) for multi-tenant SaaS"
);

-- ============================================================================
-- TABLE 1: tenant_profiles
-- ============================================================================
-- Purpose: Main customer registry with tenant metadata
-- RLS: Filter by tenant_id from JWT token
-- ============================================================================
CREATE TABLE IF NOT EXISTS `gac-prod-471220.tenants.tenant_profiles` (
  -- Primary Identifiers
  tenant_id STRING NOT NULL,                      -- Unique customer identifier (UUID)
  company_name STRING NOT NULL,                     -- Company/organization name
  admin_email STRING NOT NULL,                      -- Primary admin contact email

  -- Tenant Configuration
  tenant_dataset_id STRING NOT NULL,                -- BigQuery dataset ID for tenant isolation
  status STRING NOT NULL,                           -- ACTIVE, SUSPENDED, TRIAL, CANCELLED

  -- Subscription Information
  subscription_plan STRING NOT NULL,                -- STARTER, PROFESSIONAL, SCALE
  stripe_tenant_id STRING,                        -- Stripe customer reference

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  trial_start_date DATE,                            -- Trial period tracking
  trial_end_date DATE,

  -- Contact & Support
  support_tier STRING DEFAULT 'STANDARD',           -- STANDARD, PRIORITY, ENTERPRISE
  billing_email STRING,                             -- Separate billing contact
  phone_number STRING,

  -- Compliance & Security
  data_residency STRING DEFAULT 'US',               -- US, EU, APAC
  requires_hipaa BOOL DEFAULT FALSE,
  requires_soc2 BOOL DEFAULT FALSE,

  -- Notes
  notes STRING                                      -- Internal notes/flags
)
PARTITION BY DATE(created_at)
CLUSTER BY tenant_id, status
OPTIONS(
  description="Main customer registry with tenant metadata and subscription details",
  labels=[("category", "customer_management"), ("tier", "core")]
);

-- ============================================================================
-- TABLE 2: tenant_api_keys
-- ============================================================================
-- Purpose: Centralized API key storage with KMS encryption
-- RLS: Filter by tenant_id
-- Security: SHA256 hash for lookup, KMS encryption for storage
-- ============================================================================
CREATE TABLE IF NOT EXISTS `gac-prod-471220.tenants.tenant_api_keys` (
  -- Primary Identifiers
  api_key_id STRING NOT NULL,                       -- Unique API key ID (UUID)
  tenant_id STRING NOT NULL,                      -- Foreign key to tenant_profiles

  -- API Key Data
  api_key_hash STRING NOT NULL,                     -- SHA256 hash for fast lookup
  encrypted_api_key BYTES NOT NULL,                 -- KMS encrypted full API key
  key_name STRING NOT NULL,                         -- Human-readable key name

  -- Permissions & Scopes
  scopes ARRAY<STRING> NOT NULL,                    -- e.g., ['pipelines:read', 'pipelines:write']

  -- Lifecycle Management
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  expires_at TIMESTAMP,                             -- NULL = never expires
  last_used_at TIMESTAMP,                           -- Updated on each use
  is_active BOOL NOT NULL DEFAULT TRUE,

  -- Audit Trail
  created_by STRING NOT NULL,                       -- Email of creator
  deactivated_by STRING,                            -- Email of deactivator
  deactivated_at TIMESTAMP,
  deactivation_reason STRING,

  -- Rate Limiting Metadata
  rate_limit_tier STRING DEFAULT 'STANDARD'         -- STANDARD, ELEVATED, UNLIMITED
)
PARTITION BY DATE(created_at)
CLUSTER BY tenant_id, api_key_hash
OPTIONS(
  description="Centralized API key storage with KMS encryption and SHA256 hashing",
  labels=[("category", "security"), ("encryption", "kms"), ("tier", "critical")]
);

-- ============================================================================
-- TABLE 3: tenant_cloud_credentials
-- ============================================================================
-- Purpose: Multi-cloud provider credentials (GCP, AWS, Azure, OpenAI, Claude)
-- RLS: Filter by tenant_id
-- Security: KMS encrypted JSON credentials
-- ============================================================================
CREATE TABLE IF NOT EXISTS `gac-prod-471220.tenants.tenant_cloud_credentials` (
  -- Primary Identifiers
  credential_id STRING NOT NULL,                    -- Unique credential ID (UUID)
  tenant_id STRING NOT NULL,                      -- Foreign key to tenant_profiles

  -- Provider Configuration
  provider STRING NOT NULL,                         -- GCP, AWS, AZURE, OPENAI, CLAUDE, ANTHROPIC
  credential_type STRING NOT NULL,                  -- SERVICE_ACCOUNT, IAM_ROLE, API_KEY, OAUTH
  credential_name STRING NOT NULL,                  -- Human-readable name

  -- Encrypted Credentials
  encrypted_credentials BYTES NOT NULL,             -- KMS encrypted JSON credential data

  -- Provider-Specific Metadata
  project_id STRING,                                -- GCP project ID
  account_id STRING,                                -- AWS account ID / Azure subscription ID
  region STRING,                                    -- Default region
  scopes ARRAY<STRING>,                             -- OAuth scopes or IAM permissions

  -- Validation & Health
  last_validated_at TIMESTAMP,                      -- Last successful validation
  validation_status STRING,                         -- VALID, EXPIRED, INVALID, PENDING
  validation_error STRING,                          -- Error message if validation failed

  -- Lifecycle Management
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  is_active BOOL NOT NULL DEFAULT TRUE,

  -- Audit Trail
  created_by STRING NOT NULL,                       -- Email of creator
  updated_by STRING,                                -- Email of last updater

  -- Usage Tracking
  last_used_at TIMESTAMP,                           -- Last time credential was used
  usage_count INT64 DEFAULT 0                       -- Total usage count
)
PARTITION BY DATE(created_at)
CLUSTER BY tenant_id, provider
OPTIONS(
  description="Multi-cloud provider credentials with KMS encryption",
  labels=[("category", "credentials"), ("encryption", "kms"), ("tier", "critical")]
);

-- ============================================================================
-- TABLE 4: tenant_subscriptions
-- ============================================================================
-- Purpose: Stripe subscription plans with usage limits
-- RLS: Filter by tenant_id
-- Plans: STARTER (2 members, 3 providers, 6 daily),
--        PROFESSIONAL (6 members, 6 providers, 25 daily),
--        SCALE (11 members, 10 providers, 100 daily)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `gac-prod-471220.tenants.tenant_subscriptions` (
  -- Primary Identifiers
  subscription_id STRING NOT NULL,                  -- Unique subscription ID (UUID)
  tenant_id STRING NOT NULL,                      -- Foreign key to tenant_profiles

  -- Plan Configuration
  plan_name STRING NOT NULL,                        -- STARTER, PROFESSIONAL, SCALE
  status STRING NOT NULL,                           -- ACTIVE, TRIAL, EXPIRED, CANCELLED, PAST_DUE

  -- Plan Limits (Based on Stripe Plans)
  max_team_members INT64 NOT NULL,                  -- STARTER: 2, PROFESSIONAL: 6, SCALE: 11
  max_providers INT64 NOT NULL,                     -- STARTER: 3, PROFESSIONAL: 6, SCALE: 10
  max_pipelines_per_day INT64 NOT NULL,             -- STARTER: 6, PROFESSIONAL: 25, SCALE: 100
  max_concurrent_pipelines INT64 DEFAULT 3,         -- Concurrent pipeline execution limit

  -- Additional Limits
  max_storage_gb INT64,                             -- Storage quota in GB (NULL = unlimited)
  max_api_calls_per_day INT64,                      -- Daily API call limit

  -- Trial Management
  trial_start_date DATE,                            -- Trial start date
  trial_end_date DATE,                              -- Trial end date (14 days from start)
  is_trial BOOL DEFAULT FALSE,

  -- Subscription Dates
  subscription_start_date DATE NOT NULL,            -- Paid subscription start
  subscription_end_date DATE,                       -- NULL = active subscription
  billing_cycle STRING DEFAULT 'MONTHLY',           -- MONTHLY, ANNUAL

  -- Stripe Integration
  stripe_subscription_id STRING,                    -- Stripe subscription reference
  stripe_plan_id STRING,                            -- Stripe plan/price ID
  stripe_status STRING,                             -- Stripe subscription status

  -- Pricing
  monthly_price_usd NUMERIC(10, 2),                 -- Monthly price in USD
  annual_price_usd NUMERIC(10, 2),                  -- Annual price in USD (if applicable)
  currency STRING DEFAULT 'USD',

  -- Lifecycle Management
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  cancelled_at TIMESTAMP,
  cancellation_reason STRING,

  -- Auto-renewal
  auto_renew BOOL DEFAULT TRUE,
  next_billing_date DATE
)
PARTITION BY subscription_start_date
CLUSTER BY tenant_id, status
OPTIONS(
  description="Stripe subscription plans with usage limits and trial management",
  labels=[("category", "billing"), ("tier", "core")]
);

-- ============================================================================
-- TABLE 5: tenant_usage_quotas
-- ============================================================================
-- Purpose: Daily/monthly usage tracking with quota enforcement
-- RLS: Filter by tenant_id
-- Updated: Real-time on pipeline start/completion
-- ============================================================================
CREATE TABLE IF NOT EXISTS `gac-prod-471220.tenants.tenant_usage_quotas` (
  -- Primary Identifiers
  usage_id STRING NOT NULL,                         -- Unique usage record ID (UUID)
  tenant_id STRING NOT NULL,                      -- Foreign key to tenant_profiles
  usage_date DATE NOT NULL,                         -- Date for daily tracking

  -- Daily Pipeline Metrics
  pipelines_run_today INT64 DEFAULT 0,              -- Total pipelines started today
  pipelines_failed_today INT64 DEFAULT 0,           -- Failed pipelines today
  pipelines_succeeded_today INT64 DEFAULT 0,        -- Successful pipelines today
  pipelines_cancelled_today INT64 DEFAULT 0,        -- Cancelled pipelines today

  -- Monthly Aggregates
  pipelines_run_month INT64 DEFAULT 0,              -- Total pipelines this month

  -- Concurrent Execution
  concurrent_pipelines_running INT64 DEFAULT 0,     -- Current concurrent count
  max_concurrent_reached INT64 DEFAULT 0,           -- Peak concurrent pipelines today

  -- Cached Limits (from tenant_subscriptions)
  daily_limit INT64 NOT NULL,                       -- Daily pipeline limit
  monthly_limit INT64,                              -- Monthly limit (NULL = unlimited)
  concurrent_limit INT64 DEFAULT 3,                 -- Concurrent execution limit

  -- Quota Status
  quota_exceeded BOOL DEFAULT FALSE,                -- TRUE if daily limit reached
  quota_warning_sent BOOL DEFAULT FALSE,            -- TRUE if 80% warning sent
  quota_exceeded_at TIMESTAMP,                      -- When quota was first exceeded

  -- Additional Usage Metrics
  total_api_calls_today INT64 DEFAULT 0,            -- API calls today
  total_storage_used_gb NUMERIC(10, 2) DEFAULT 0,   -- Current storage usage

  -- Metadata
  last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  last_pipeline_started_at TIMESTAMP,               -- Timestamp of last pipeline start
  last_pipeline_completed_at TIMESTAMP              -- Timestamp of last pipeline completion
)
PARTITION BY usage_date
CLUSTER BY tenant_id, usage_date
OPTIONS(
  description="Daily/monthly usage tracking with quota enforcement for pipelines",
  labels=[("category", "usage_tracking"), ("tier", "core")]
);

-- ============================================================================
-- TABLE 6: users (REMOVED - Managed by Supabase Frontend)
-- ============================================================================
-- Users are now managed by the Supabase frontend.
-- The data pipeline only receives user_id via X-User-ID header for logging.
-- See x_meta_pipeline_runs.user_id, x_meta_step_logs.user_id, etc.
-- ============================================================================

-- ============================================================================
-- TABLE 7: tenant_provider_configs
-- ============================================================================
-- Purpose: Provider-specific pipeline configurations and templates
-- RLS: Filter by tenant_id
-- Providers: GCP Cost, AWS Cost, Azure Cost, Security, Compliance
-- ============================================================================
CREATE TABLE IF NOT EXISTS `gac-prod-471220.tenants.tenant_provider_configs` (
  -- Primary Identifiers
  config_id STRING NOT NULL,                        -- Unique config ID (UUID)
  tenant_id STRING NOT NULL,                      -- Foreign key to tenant_profiles

  -- Provider Configuration
  provider STRING NOT NULL,                         -- GCP, AWS, AZURE, MULTI_CLOUD
  domain STRING NOT NULL,                           -- COST, SECURITY, COMPLIANCE, CUSTOM
  config_name STRING NOT NULL,                      -- Human-readable config name

  -- Source Configuration
  source_project_id STRING,                         -- GCP project ID (for cost data)
  source_dataset STRING,                            -- BigQuery dataset name
  source_table STRING,                              -- BigQuery table name (optional)

  -- Notification Settings
  notification_emails ARRAY<STRING>,                -- Email addresses for notifications
  slack_webhook_url STRING,                         -- Slack webhook for alerts
  notification_enabled BOOL DEFAULT TRUE,

  -- Pipeline Parameters
  default_parameters JSON,                          -- Default pipeline parameters (JSON)
  pipeline_template_overrides JSON,                 -- Custom template overrides (JSON)

  -- Scheduling
  schedule_enabled BOOL DEFAULT FALSE,              -- Enable scheduled execution
  schedule_cron STRING,                             -- Cron expression for scheduling
  schedule_timezone STRING DEFAULT 'UTC',

  -- Data Retention
  retention_days INT64 DEFAULT 90,                  -- Data retention period

  -- Status & Health
  is_active BOOL DEFAULT TRUE,
  last_run_at TIMESTAMP,                            -- Last pipeline execution
  last_success_at TIMESTAMP,                        -- Last successful execution
  last_failure_at TIMESTAMP,                        -- Last failed execution
  consecutive_failures INT64 DEFAULT 0,             -- Consecutive failure count

  -- Lifecycle Management
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  created_by STRING NOT NULL,                       -- Email of creator
  updated_by STRING,                                -- Email of last updater

  -- Tags & Metadata
  tags ARRAY<STRING>,                               -- Custom tags for filtering
  description STRING                                -- Configuration description
)
PARTITION BY DATE(created_at)
CLUSTER BY tenant_id, provider, domain
OPTIONS(
  description="Provider-specific pipeline configurations and template overrides",
  labels=[("category", "pipeline_config"), ("tier", "core")]
);

-- ============================================================================
-- INDEXES & CONSTRAINTS (Simulated via Clustering)
-- ============================================================================
-- BigQuery doesn't support traditional indexes, but clustering provides
-- similar query optimization benefits:
--
-- 1. tenant_profiles: Clustered by (tenant_id, status)
--    - Fast lookup by tenant_id
--    - Efficient filtering by status
--
-- 2. tenant_api_keys: Clustered by (tenant_id, api_key_hash)
--    - Fast API key validation (hash lookup)
--    - Efficient customer-scoped queries
--
-- 3. tenant_cloud_credentials: Clustered by (tenant_id, provider)
--    - Fast credential lookup by customer and provider
--
-- 4. tenant_subscriptions: Clustered by (tenant_id, status)
--    - Fast active subscription lookup
--    - Efficient billing queries
--
-- 5. tenant_usage_quotas: Clustered by (tenant_id, usage_date)
--    - Real-time quota checks
--    - Efficient daily usage queries
--
-- 6. users: REMOVED (managed by Supabase frontend)
--
-- 7. tenant_provider_configs: Clustered by (tenant_id, provider, domain)
--    - Fast config lookup by provider and domain
--
-- 8. tenant_pipeline_configs: Clustered by (tenant_id, next_run_time, is_active)
--    - Fast "yet to run" queries via next_run_time
--    - Efficient filtering of active pipelines
--    - Optimized for scheduler lookups
--
-- 9. scheduled_pipeline_runs: Clustered by (tenant_id, state, scheduled_time)
--    - Fast lookup of running pipelines by state
--    - Efficient historical queries by scheduled_time
--    - Optimized for retry attempt tracking
--
-- 10. pipeline_execution_queue: Clustered by (state, priority DESC, scheduled_time)
--     - Optimized for worker pickup (state='QUEUED')
--     - Priority-based sorting for queue management
--     - Efficient time-based ordering for FIFO processing
-- ============================================================================

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS) IMPLEMENTATION NOTES
-- ============================================================================
-- BigQuery RLS is enforced via authorized views and policy tags:
--
-- 1. CREATE POLICY TAG TAXONOMY:
--    - customer_data: Restricted to tenant_id scope
--    - sensitive_data: KMS encrypted fields
--
-- 2. APPLY POLICY TAGS:
--    ALTER TABLE tenant_profiles
--    ALTER COLUMN tenant_id
--    SET OPTIONS (policy_tags=["projects/gac-prod-471220/locations/us/taxonomies/customer_data"]);
--
-- 3. CREATE AUTHORIZED VIEWS:
--    - One view per customer with WHERE tenant_id = SESSION_USER().tenant_id
--
-- 4. GRANT ACCESS:
--    - Grant BigQuery User role to service accounts
--    - Use JWT tokens with tenant_id claim
-- ============================================================================

-- ============================================================================
-- TABLE 8: tenant_pipeline_configs
-- ============================================================================
-- Purpose: Customer-specific pipeline scheduling configurations
-- RLS: Filter by tenant_id
-- Supports: Cron-based scheduling, retry logic, and notifications
-- ============================================================================
CREATE TABLE IF NOT EXISTS `gac-prod-471220.tenants.tenant_pipeline_configs` (
  -- Primary Identifiers
  config_id STRING NOT NULL,                        -- Unique config ID (UUID)
  tenant_id STRING NOT NULL,                      -- Foreign key to tenant_profiles

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
  timezone STRING NOT NULL DEFAULT 'UTC',           -- Timezone for schedule (e.g., "America/New_York")

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
CLUSTER BY tenant_id, next_run_time, is_active
OPTIONS(
  description="Customer-specific pipeline scheduling configurations with cron support",
  labels=[("category", "pipeline_scheduling"), ("tier", "core")]
);

-- ============================================================================
-- TABLE 9: scheduled_pipeline_runs
-- ============================================================================
-- Purpose: Track scheduled pipeline execution history and state
-- RLS: Filter by tenant_id
-- Links: References tenant_pipeline_configs and tenant pipeline_runs
-- ============================================================================
CREATE TABLE IF NOT EXISTS `gac-prod-471220.tenants.scheduled_pipeline_runs` (
  -- Primary Identifiers
  run_id STRING NOT NULL,                           -- Unique run ID (UUID)
  config_id STRING NOT NULL,                        -- Foreign key to tenant_pipeline_configs
  tenant_id STRING NOT NULL,                      -- Foreign key to tenant_profiles

  -- Pipeline Information
  pipeline_template STRING NOT NULL,                -- Template used for execution

  -- Timing
  scheduled_time TIMESTAMP NOT NULL,                -- When it was scheduled to run
  actual_start_time TIMESTAMP,                      -- When it actually started
  actual_end_time TIMESTAMP,                        -- When it completed

  -- Execution State
  state STRING NOT NULL,                            -- SCHEDULED, PENDING, RUNNING, COMPLETED, FAILED, SKIPPED

  -- Pipeline Execution Reference
  pipeline_logging_id STRING,                       -- References {tenant_id}.x_meta_pipeline_runs

  -- Performance Metrics
  execution_duration_seconds INT64,                 -- Duration in seconds

  -- Error Handling
  error_message STRING,                             -- Error details if failed
  retry_attempt INT64 NOT NULL DEFAULT 0,           -- 0 for first attempt, 1+ for retries

  -- Trigger Information
  triggered_by STRING NOT NULL,                     -- "cloud_scheduler", "manual", "retry", "api"

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(scheduled_time)
CLUSTER BY tenant_id, state, scheduled_time
OPTIONS(
  description="Scheduled pipeline execution history and state tracking",
  labels=[("category", "pipeline_execution"), ("tier", "core")]
);

-- ============================================================================
-- TABLE 10: pipeline_execution_queue
-- ============================================================================
-- Purpose: Priority-based pipeline execution queue for worker management
-- RLS: Filter by tenant_id
-- Workers: Pick tasks from QUEUED state ordered by priority and scheduled_time
-- ============================================================================
CREATE TABLE IF NOT EXISTS `gac-prod-471220.tenants.pipeline_execution_queue` (
  -- Primary Identifiers
  queue_id STRING NOT NULL,                         -- Unique queue entry ID (UUID)
  tenant_id STRING NOT NULL,                      -- Foreign key to tenant_profiles

  -- Pipeline Information
  pipeline_template STRING NOT NULL,                -- Template to execute

  -- Queue Management
  priority INT64 NOT NULL DEFAULT 5,                -- Priority 1-10 (higher = more important)
  state STRING NOT NULL,                            -- QUEUED, PROCESSING, COMPLETED, FAILED

  -- Timing
  scheduled_time TIMESTAMP NOT NULL,                -- When this should be processed
  picked_up_at TIMESTAMP,                           -- When worker picked it up
  completed_at TIMESTAMP,                           -- When processing completed

  -- Worker Assignment
  worker_id STRING,                                 -- Which worker is processing this

  -- Execution Reference
  run_id STRING,                                    -- References scheduled_pipeline_runs

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(created_at)
CLUSTER BY state, priority DESC, scheduled_time
OPTIONS(
  description="Priority-based pipeline execution queue for worker management",
  labels=[("category", "pipeline_queue"), ("tier", "core")]
);

-- ============================================================================
-- VIEWS FOR PIPELINE SCHEDULING
-- ============================================================================

-- View 1: Pipelines due to run now
-- Purpose: Get all active pipelines that should be executed now
CREATE OR REPLACE VIEW `gac-prod-471220.tenants.pipelines_due_now` AS
SELECT
  c.config_id,
  c.tenant_id,
  c.provider,
  c.domain,
  c.pipeline_template,
  c.pipeline_name,
  c.schedule_cron,
  c.timezone,
  c.next_run_time,
  c.last_run_time,
  c.last_run_status,
  c.parameters,
  c.retry_config,
  c.notification_emails,
  p.company_name,
  p.subscription_plan,
  p.status AS customer_status
FROM `gac-prod-471220.tenants.tenant_pipeline_configs` c
INNER JOIN `gac-prod-471220.tenants.tenant_profiles` p
  ON c.tenant_id = p.tenant_id
WHERE c.is_active = TRUE
  AND p.status = 'ACTIVE'
  AND c.next_run_time <= CURRENT_TIMESTAMP()
ORDER BY c.next_run_time ASC;

-- View 2: Currently running pipelines
-- Purpose: Monitor active pipeline executions in real-time
CREATE OR REPLACE VIEW `gac-prod-471220.tenants.currently_running_pipelines` AS
SELECT
  r.run_id,
  r.config_id,
  r.tenant_id,
  r.pipeline_template,
  r.scheduled_time,
  r.actual_start_time,
  r.state,
  r.pipeline_logging_id,
  r.retry_attempt,
  r.triggered_by,
  c.pipeline_name,
  c.provider,
  c.domain,
  p.company_name,
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), r.actual_start_time, SECOND) AS running_duration_seconds
FROM `gac-prod-471220.tenants.scheduled_pipeline_runs` r
INNER JOIN `gac-prod-471220.tenants.tenant_pipeline_configs` c
  ON r.config_id = c.config_id
INNER JOIN `gac-prod-471220.tenants.tenant_profiles` p
  ON r.tenant_id = p.tenant_id
WHERE r.state = 'RUNNING'
ORDER BY r.actual_start_time DESC;

-- View 3: Pipeline execution statistics (last 7 days)
-- Purpose: Monitor pipeline success rates and performance
CREATE OR REPLACE VIEW `gac-prod-471220.tenants.pipeline_execution_stats_7d` AS
SELECT
  tenant_id,
  pipeline_template,
  COUNT(*) AS total_runs,
  COUNTIF(state = 'COMPLETED') AS successful_runs,
  COUNTIF(state = 'FAILED') AS failed_runs,
  COUNTIF(state = 'SKIPPED') AS skipped_runs,
  ROUND(AVG(execution_duration_seconds), 2) AS avg_duration_seconds,
  MAX(execution_duration_seconds) AS max_duration_seconds,
  MIN(execution_duration_seconds) AS min_duration_seconds,
  ROUND(SAFE_DIVIDE(COUNTIF(state = 'COMPLETED'), COUNT(*)) * 100, 2) AS success_rate_percent
FROM `gac-prod-471220.tenants.scheduled_pipeline_runs`
WHERE scheduled_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY tenant_id, pipeline_template
ORDER BY total_runs DESC;

-- View 4: Pending queue items (ready for workers)
-- Purpose: Get next batch of pipeline executions for worker pickup
CREATE OR REPLACE VIEW `gac-prod-471220.tenants.pending_queue_items` AS
SELECT
  q.queue_id,
  q.tenant_id,
  q.pipeline_template,
  q.priority,
  q.scheduled_time,
  q.run_id,
  q.created_at,
  p.company_name,
  p.subscription_plan,
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), q.scheduled_time, SECOND) AS delay_seconds
FROM `gac-prod-471220.tenants.pipeline_execution_queue` q
INNER JOIN `gac-prod-471220.tenants.tenant_profiles` p
  ON q.tenant_id = p.tenant_id
WHERE q.state = 'QUEUED'
  AND q.scheduled_time <= CURRENT_TIMESTAMP()
  AND p.status = 'ACTIVE'
ORDER BY q.priority DESC, q.scheduled_time ASC;

-- ============================================================================
-- SAMPLE QUERIES
-- ============================================================================

-- Query 1: Get active customers with trial status
-- SELECT tenant_id, company_name, status, subscription_plan
-- FROM `gac-prod-471220.tenants.tenant_profiles`
-- WHERE status IN ('ACTIVE', 'TRIAL')
-- ORDER BY created_at DESC;

-- Query 2: Check daily quota for customer
-- SELECT tenant_id, usage_date, pipelines_run_today, daily_limit, quota_exceeded
-- FROM `gac-prod-471220.tenants.tenant_usage_quotas`
-- WHERE tenant_id = 'customer-uuid' AND usage_date = CURRENT_DATE();

-- Query 3: List team members - REMOVED (managed by Supabase frontend)

-- Query 4: Get active API keys for customer
-- SELECT api_key_id, key_name, scopes, last_used_at
-- FROM `gac-prod-471220.tenants.tenant_api_keys`
-- WHERE tenant_id = 'customer-uuid' AND is_active = TRUE
-- ORDER BY created_at DESC;

-- Query 5: Get pipelines due to run now
-- SELECT * FROM `gac-prod-471220.tenants.pipelines_due_now`
-- LIMIT 10;

-- Query 6: Monitor currently running pipelines
-- SELECT * FROM `gac-prod-471220.tenants.currently_running_pipelines`;

-- Query 7: Check pipeline success rates (last 7 days)
-- SELECT * FROM `gac-prod-471220.tenants.pipeline_execution_stats_7d`
-- WHERE tenant_id = 'customer-uuid';

-- Query 8: Get next queue items for worker
-- SELECT * FROM `gac-prod-471220.tenants.pending_queue_items`
-- LIMIT 100;

-- ============================================================================
-- MAINTENANCE & MONITORING
-- ============================================================================
-- 1. Daily: Monitor quota usage and send warnings
-- 2. Weekly: Validate cloud credentials
-- 3. Monthly: Archive expired API keys
-- 4. Quarterly: Review and optimize partition pruning
-- ============================================================================

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
