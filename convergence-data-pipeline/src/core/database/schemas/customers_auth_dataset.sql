-- ============================================================================
-- CUSTOMERS DATASET - Centralized Authentication & Customer Management Schema
-- ============================================================================
-- Project: gac-prod-471220
-- Dataset: customers
-- Purpose: Multi-tenant customer authentication and authorization with Row-Level Security (RLS)
-- Version: 2.0.0
-- Created: 2025-11-17
--
-- Security: Row-Level Security (RLS) enforced at query time
-- Encryption: KMS-encrypted sensitive fields (API keys, credentials)
-- ============================================================================

-- ============================================================================
-- CREATE DATASET
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS `gac-prod-471220.customers`
OPTIONS(
  location="US",
  description="Centralized customer authentication and management with Row-Level Security (RLS) for multi-tenant SaaS"
);

-- ============================================================================
-- TABLE 1: customer_profiles
-- ============================================================================
-- Purpose: Main customer registry with tenant metadata
-- RLS: Filter by customer_id from JWT token
-- ============================================================================
CREATE TABLE IF NOT EXISTS `gac-prod-471220.customers.customer_profiles` (
  -- Primary Identifiers
  customer_id STRING NOT NULL,                      -- Unique customer identifier (UUID)
  company_name STRING NOT NULL,                     -- Company/organization name
  admin_email STRING NOT NULL,                      -- Primary admin contact email

  -- Tenant Configuration
  tenant_dataset_id STRING NOT NULL,                -- BigQuery dataset ID for tenant isolation
  status STRING NOT NULL,                           -- ACTIVE, SUSPENDED, TRIAL, CANCELLED

  -- Subscription Information
  subscription_plan STRING NOT NULL,                -- STARTER, PROFESSIONAL, SCALE
  stripe_customer_id STRING,                        -- Stripe customer reference

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
CLUSTER BY customer_id, status
OPTIONS(
  description="Main customer registry with tenant metadata and subscription details",
  labels=[("category", "customer_management"), ("tier", "core")]
);

-- ============================================================================
-- TABLE 2: customer_api_keys
-- ============================================================================
-- Purpose: Centralized API key storage with KMS encryption
-- RLS: Filter by customer_id
-- Security: SHA256 hash for lookup, KMS encryption for storage
-- ============================================================================
CREATE TABLE IF NOT EXISTS `gac-prod-471220.customers.customer_api_keys` (
  -- Primary Identifiers
  api_key_id STRING NOT NULL,                       -- Unique API key ID (UUID)
  customer_id STRING NOT NULL,                      -- Foreign key to customer_profiles

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
CLUSTER BY customer_id, api_key_hash
OPTIONS(
  description="Centralized API key storage with KMS encryption and SHA256 hashing",
  labels=[("category", "security"), ("encryption", "kms"), ("tier", "critical")]
);

-- ============================================================================
-- TABLE 3: customer_cloud_credentials
-- ============================================================================
-- Purpose: Multi-cloud provider credentials (GCP, AWS, Azure, OpenAI, Claude)
-- RLS: Filter by customer_id
-- Security: KMS encrypted JSON credentials
-- ============================================================================
CREATE TABLE IF NOT EXISTS `gac-prod-471220.customers.customer_cloud_credentials` (
  -- Primary Identifiers
  credential_id STRING NOT NULL,                    -- Unique credential ID (UUID)
  customer_id STRING NOT NULL,                      -- Foreign key to customer_profiles

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
CLUSTER BY customer_id, provider
OPTIONS(
  description="Multi-cloud provider credentials with KMS encryption",
  labels=[("category", "credentials"), ("encryption", "kms"), ("tier", "critical")]
);

-- ============================================================================
-- TABLE 4: customer_subscriptions
-- ============================================================================
-- Purpose: Stripe subscription plans with usage limits
-- RLS: Filter by customer_id
-- Plans: STARTER (2 members, 3 providers, 6 daily),
--        PROFESSIONAL (6 members, 6 providers, 25 daily),
--        SCALE (11 members, 10 providers, 100 daily)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `gac-prod-471220.customers.customer_subscriptions` (
  -- Primary Identifiers
  subscription_id STRING NOT NULL,                  -- Unique subscription ID (UUID)
  customer_id STRING NOT NULL,                      -- Foreign key to customer_profiles

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
CLUSTER BY customer_id, status
OPTIONS(
  description="Stripe subscription plans with usage limits and trial management",
  labels=[("category", "billing"), ("tier", "core")]
);

-- ============================================================================
-- TABLE 5: customer_usage_quotas
-- ============================================================================
-- Purpose: Daily/monthly usage tracking with quota enforcement
-- RLS: Filter by customer_id
-- Updated: Real-time on pipeline start/completion
-- ============================================================================
CREATE TABLE IF NOT EXISTS `gac-prod-471220.customers.customer_usage_quotas` (
  -- Primary Identifiers
  usage_id STRING NOT NULL,                         -- Unique usage record ID (UUID)
  customer_id STRING NOT NULL,                      -- Foreign key to customer_profiles
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

  -- Cached Limits (from customer_subscriptions)
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
CLUSTER BY customer_id, usage_date
OPTIONS(
  description="Daily/monthly usage tracking with quota enforcement for pipelines",
  labels=[("category", "usage_tracking"), ("tier", "core")]
);

-- ============================================================================
-- TABLE 6: customer_team_members
-- ============================================================================
-- Purpose: Team member management with role-based access control (RBAC)
-- RLS: Filter by customer_id
-- Roles: OWNER, ADMIN, COLLABORATOR, VIEWER
-- ============================================================================
CREATE TABLE IF NOT EXISTS `gac-prod-471220.customers.customer_team_members` (
  -- Primary Identifiers
  member_id STRING NOT NULL,                        -- Unique member ID (UUID)
  customer_id STRING NOT NULL,                      -- Foreign key to customer_profiles

  -- User Information
  email STRING NOT NULL,                            -- Team member email (unique per customer)
  full_name STRING,                                 -- Full name
  avatar_url STRING,                                -- Profile picture URL

  -- Role & Permissions
  role STRING NOT NULL,                             -- OWNER, ADMIN, COLLABORATOR, VIEWER
  permissions ARRAY<STRING>,                        -- Granular permissions array

  -- Status
  status STRING NOT NULL,                           -- ACTIVE, INVITED, SUSPENDED, REMOVED
  is_active BOOL DEFAULT TRUE,

  -- Invitation & Onboarding
  invited_by STRING,                                -- Email of inviter
  invited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  invitation_token STRING,                          -- One-time invitation token
  invitation_expires_at TIMESTAMP,                  -- Invitation expiry
  joined_at TIMESTAMP,                              -- When invitation was accepted

  -- Activity Tracking
  last_login_at TIMESTAMP,                          -- Last login timestamp
  last_activity_at TIMESTAMP,                       -- Last activity in platform
  login_count INT64 DEFAULT 0,                      -- Total login count

  -- Lifecycle Management
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  removed_at TIMESTAMP,
  removed_by STRING,                                -- Email of remover
  removal_reason STRING,

  -- Preferences
  email_notifications BOOL DEFAULT TRUE,
  slack_notifications BOOL DEFAULT FALSE,
  timezone STRING DEFAULT 'UTC'
)
PARTITION BY DATE(invited_at)
CLUSTER BY customer_id, email
OPTIONS(
  description="Team member management with RBAC and invitation tracking",
  labels=[("category", "team_management"), ("tier", "core")]
);

-- ============================================================================
-- INDEXES & CONSTRAINTS (Simulated via Clustering)
-- ============================================================================
-- BigQuery doesn't support traditional indexes, but clustering provides
-- similar query optimization benefits:
--
-- 1. customer_profiles: Clustered by (customer_id, status)
--    - Fast lookup by customer_id
--    - Efficient filtering by status
--
-- 2. customer_api_keys: Clustered by (customer_id, api_key_hash)
--    - Fast API key validation (hash lookup)
--    - Efficient customer-scoped queries
--
-- 3. customer_cloud_credentials: Clustered by (customer_id, provider)
--    - Fast credential lookup by customer and provider
--
-- 4. customer_subscriptions: Clustered by (customer_id, status)
--    - Fast active subscription lookup
--    - Efficient billing queries
--
-- 5. customer_usage_quotas: Clustered by (customer_id, usage_date)
--    - Real-time quota checks
--    - Efficient daily usage queries
--
-- 6. customer_team_members: Clustered by (customer_id, email)
--    - Fast member lookup
--    - Efficient team listing
-- ============================================================================

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS) IMPLEMENTATION NOTES
-- ============================================================================
-- BigQuery RLS is enforced via authorized views and policy tags:
--
-- 1. CREATE POLICY TAG TAXONOMY:
--    - customer_data: Restricted to customer_id scope
--    - sensitive_data: KMS encrypted fields
--
-- 2. APPLY POLICY TAGS:
--    ALTER TABLE customer_profiles
--    ALTER COLUMN customer_id
--    SET OPTIONS (policy_tags=["projects/gac-prod-471220/locations/us/taxonomies/customer_data"]);
--
-- 3. CREATE AUTHORIZED VIEWS:
--    - One view per customer with WHERE customer_id = SESSION_USER().customer_id
--
-- 4. GRANT ACCESS:
--    - Grant BigQuery User role to service accounts
--    - Use JWT tokens with customer_id claim
-- ============================================================================

-- ============================================================================
-- SAMPLE QUERIES
-- ============================================================================

-- Query 1: Get active customers with trial status
-- SELECT customer_id, company_name, status, subscription_plan
-- FROM `gac-prod-471220.customers.customer_profiles`
-- WHERE status IN ('ACTIVE', 'TRIAL')
-- ORDER BY created_at DESC;

-- Query 2: Check daily quota for customer
-- SELECT customer_id, usage_date, pipelines_run_today, daily_limit, quota_exceeded
-- FROM `gac-prod-471220.customers.customer_usage_quotas`
-- WHERE customer_id = 'customer-uuid' AND usage_date = CURRENT_DATE();

-- Query 3: List team members with roles
-- SELECT email, full_name, role, status, last_login_at
-- FROM `gac-prod-471220.customers.customer_team_members`
-- WHERE customer_id = 'customer-uuid' AND status = 'ACTIVE'
-- ORDER BY role, email;

-- Query 4: Get active API keys for customer
-- SELECT api_key_id, key_name, scopes, last_used_at
-- FROM `gac-prod-471220.customers.customer_api_keys`
-- WHERE customer_id = 'customer-uuid' AND is_active = TRUE
-- ORDER BY created_at DESC;

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
