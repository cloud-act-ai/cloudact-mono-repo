# Schema Changelog

All notable changes to BigQuery table schemas for CloudAct.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [15.0.0] - 2026-01-08

### Added
- **Multi-Cloud Support:**
  - `x_cloud_provider` field (STRING, REQUIRED) to all cloud billing schemas (AWS, Azure, GCP, OCI)
  - `x_cloud_account_id` field (STRING, NULLABLE) to all cloud billing schemas
  - Enables unified multi-cloud cost analysis and filtering

- **Performance Hints:**
  - Added "CLUSTER KEY for partition pruning" hint to `x_pipeline_run_date` descriptions
  - Improves query performance guidance for developers

- **Schema Documentation:**
  - Created `schema_versions.json` for centralized version tracking
  - Created this CHANGELOG.md for schema evolution history

### Changed
- **Field Order Standardization:**
  - All schemas now follow standard x_* field order:
    1. x_pipeline_id (STRING, REQUIRED)
    2. x_credential_id (STRING, REQUIRED)
    3. x_pipeline_run_date (DATE, REQUIRED)
    4. x_run_id (STRING, REQUIRED)
    5. x_ingested_at (TIMESTAMP, REQUIRED)
    6. x_data_quality_score (FLOAT64, NULLABLE)
    7. x_created_at (TIMESTAMP, NULLABLE)

### Deprecated
- `billing_amount` in `subscription_plans.json` - Use `unit_price` instead
  - `unit_price` represents the price for ONE billing cycle (monthly/annual/quarterly)
  - `billing_amount` was ambiguous and not aligned with billing cycle

## [14.0.0] - 2026-01-06

### Added
- **10-Level Hierarchy Support:**
  - Added 20 hierarchy fields (10 IDs + 10 names) to all cost tables
  - Enables flexible Department → Project → Team → ... cost allocation
  - Replaces previous 3-level hierarchy limitation

- **N-Level Hierarchy Fields:**
  - `hierarchy_entity_id` - Leaf entity ID
  - `hierarchy_entity_name` - Leaf entity display name
  - `hierarchy_level_code` - Entity level code (e.g., 'team', 'project')
  - `hierarchy_path` - Materialized path (e.g., '/DEPT-001/PROJ-001/TEAM-001')
  - `hierarchy_path_names` - Human-readable path (e.g., 'Engineering > Platform > Backend Team')

### Changed
- **Hierarchy Architecture:**
  - Migrated from fixed 3-level (dept/project/team) to flexible N-level hierarchy
  - Added `org_hierarchy` table in organizations dataset (central source of truth)
  - Added `x_org_hierarchy` materialized view per org dataset (fast reads)
  - Auto-refresh every 15 minutes

## [13.0.0] - 2025-12-15

### Added
- **FOCUS 1.3 Compliance:**
  - Upgraded `cost_data_standard_1_3` to FinOps FOCUS 1.3 standard
  - Added `ServiceProviderName`, `HostProviderName`, `InvoiceIssuerName` fields
  - Deprecated `ProviderName`, `PublisherName` (kept for backward compatibility)
  - Added `ContractApplied` JSON field for contract linkage

- **Org-Specific Extensions:**
  - `x_org_slug` - Organization identifier
  - `x_org_name` - Organization display name
  - `x_org_owner_email` - Primary contact email
  - `x_org_default_currency` - Organization default currency (USD, EUR, INR, etc.)
  - `x_org_default_timezone` - Organization timezone (UTC, America/New_York, etc.)
  - `x_org_subscription_plan` - CloudAct subscription tier
  - `x_org_subscription_status` - Subscription status (ACTIVE, TRIAL, etc.)

### Changed
- **Tags Format:**
  - Changed from REPEATED RECORD to JSON STRING
  - Improves query flexibility and reduces table size
  - Example: `{"environment": "production", "team": "platform"}`

## [12.0.0] - 2025-11-20

### Added
- **Pipeline Lineage Tracking:**
  - `x_pipeline_id` - Pipeline template name
  - `x_credential_id` - Credential ID for multi-account isolation
  - `x_pipeline_run_date` - Data date being processed (for idempotency)
  - `x_run_id` - Unique pipeline execution UUID
  - `x_ingested_at` - Timestamp when data was written
  - `x_data_quality_score` - DQ validation score (0.0-1.0)
  - `x_created_at` - Record creation timestamp

- **Data Quality Support:**
  - Added `org_meta_dq_results` table for DQ issue tracking
  - Stores validation failures, NULL counts, anomalies

### Changed
- **Naming Convention:**
  - All extension fields use `x_` prefix (FOCUS convention)
  - Changed from camelCase to snake_case for consistency

## [11.0.0] - 2025-10-15

### Added
- **Subscription Management:**
  - `subscription_plans` table with version history
  - `subscription_plan_costs_daily` for daily amortization
  - Support for PER_SEAT and FLAT_FEE pricing models
  - Billing cycle support: monthly, annual, quarterly, semi-annual, weekly

- **Fiscal Year Support:**
  - `fiscal_year_start_month` in org_profiles
  - Supports calendar year (Jan), India/UK/Japan (Apr), Australia (Jul)
  - Proper fiscal quarter and half calculations

## [10.0.0] - 2025-09-10

### Added
- **GenAI Cost Tracking:**
  - `genai_payg_usage_raw` - Raw usage from provider APIs
  - `genai_costs_daily_unified` - Calculated daily costs
  - `genai_commitment_usage_raw` - Commitment-based usage (Bedrock, PTU, Vertex)
  - `genai_infrastructure_usage_raw` - GPU/compute costs

- **Multi-Provider Support:**
  - OpenAI, Anthropic, Google (Gemini/Vertex), Azure OpenAI
  - AWS Bedrock, DeepSeek
  - Model-level cost granularity

### Changed
- **Cost Calculation:**
  - Added support for commitment discounts
  - Infrastructure cost allocation
  - Multi-currency handling with exchange rates

## [9.0.0] - 2025-08-01

### Added
- **Multi-Cloud Billing:**
  - AWS, Azure, GCP, OCI billing raw data schemas
  - Cloud-specific fields preserved (e.g., AWS reservation ARN, Azure benefit ID)
  - Conversion to FOCUS 1.2 standard format

### Changed
- **Partitioning Strategy:**
  - All cost tables partitioned by date
  - Clustering on org_slug, provider, service for better query performance

## [8.0.0] - 2025-07-01

### Added
- **Bootstrap Schemas:**
  - 21 meta tables in organizations dataset
  - org_profiles, org_api_keys, org_subscriptions
  - org_meta_pipeline_runs, org_meta_step_logs
  - org_meta_state_transitions, org_meta_dq_results

- **Multi-Tenancy:**
  - Per-org datasets ({org_slug}_prod)
  - Materialized views for fast reads (x_* prefix)
  - Auto-refresh every 15 minutes

---

## Schema Migration Guidelines

### Adding New Fields (Safe)
1. Add field to schema JSON file
2. Run `/api/v1/admin/bootstrap/sync` or `/api/v1/organizations/{org}/sync`
3. Existing data preserved, new field NULL for old rows
4. Non-destructive operation

### Removing Fields (Caution)
1. Remove from schema JSON file
2. Field remains in BigQuery table as "extra column"
3. Will NOT be deleted (BigQuery limitation)
4. Update application code to stop using field

### Changing Field Types (Breaking)
1. **NOT SUPPORTED** - Cannot alter column types in BigQuery
2. Workaround: Create new field with new type, migrate data, deprecate old field
3. Or: Recreate table (data loss - use with caution)

### Field Naming Conventions
- **Business fields:** snake_case (e.g., `billing_account_id`, `daily_cost`)
- **Extension fields:** x_ prefix + snake_case (e.g., `x_pipeline_id`, `x_org_slug`)
- **FOCUS fields:** PascalCase per spec (e.g., `BilledCost`, `ServiceProviderName`)
- **Hierarchy fields:** hierarchy_ prefix + level (e.g., `hierarchy_level_1_id`)

### Version Numbering
- **Major version (X.0.0):** Breaking changes, schema recreations
- **Minor version (0.X.0):** New fields, new tables (backward compatible)
- **Patch version (0.0.X):** Documentation, descriptions (no structural changes)

---

**Maintained by:** CloudAct Engineering
**Last Updated:** 2026-01-08
**Schema Version:** 15.0.0
