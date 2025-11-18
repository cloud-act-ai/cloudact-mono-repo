# Database Schema Documentation

This directory contains SQL schema definitions as reference documentation for the BigQuery datasets used in the Convergence Data Pipeline platform.

## Important Note

All database schemas are created **programmatically via the API**, not manually. The SQL files in this directory are **reference documentation only**. See `/deployment/setup_bigquery_datasets.py` for the actual bootstrap implementation.

## Schema Files

### 1. tenants_dataset.sql
**Purpose**: Complete reference documentation for the central tenant management dataset
**Dataset Name**: `tenants` (central, shared across all tenants)
**Protection Level**: HIGHLY PROTECTED - NO GenAI access

**Tables**:
- `tenant_profiles` - Tenant registry with organization metadata
- `tenant_api_keys` - KMS-encrypted API keys
- `tenant_cloud_credentials` - KMS-encrypted cloud provider credentials
- `tenant_subscriptions` - Subscription plans and usage limits
- `tenant_usage_quotas` - Real-time usage tracking with quota enforcement
- `tenant_pipeline_configs` - Per-tenant pipeline scheduling configurations
- `tenant_scheduled_pipeline_runs` - Scheduled pipeline execution history
- `tenant_pipeline_execution_queue` - Priority-based pipeline execution queue

**Use Case**: Authentication, billing, credential management, subscription tracking

---

### 2. tenant_dataset.sql
**Purpose**: Reference documentation for per-tenant operational data datasets
**Dataset Name**: `{tenant_id}` (one per tenant)
**Protection Level**: SAFE for GenAI - NO credentials

**Tables**:
- `tenant_pipeline_runs` - Pipeline execution metadata and logging
- `tenant_step_logs` - Detailed step-by-step execution logs
- `tenant_dq_results` - Data quality validation results
- `tenant_pipeline_configs` - Per-tenant pipeline scheduling configurations
- `tenant_scheduled_pipeline_runs` - Scheduled pipeline execution history

**Use Case**: Operational logs, analytics, GenAI analysis

---

## Bootstrap & Deployment

### One-Time Setup
The system is initialized via the Python bootstrap script:
```bash
python deployment/setup_bigquery_datasets.py
```

This script creates:
1. The central `tenants` dataset with 8 management tables
2. All table schemas with proper partitioning and clustering

### Per-Tenant Onboarding
When a new tenant is onboarded via the API:
```bash
curl -X POST http://localhost:8080/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "...", "company_name": "...", ...}'
```

The system creates:
1. Tenant profile in the central `tenants` dataset
2. API key and subscription records
3. Per-tenant dataset (`{tenant_id}`) with operational tables
4. IAM access controls

## Two-Dataset Architecture

```
tenants/                        ← Protected, IAM-restricted (central)
├── tenant_profiles             ← Tenant registry
├── tenant_api_keys             ← KMS-encrypted
├── tenant_cloud_credentials    ← KMS-encrypted
├── tenant_subscriptions        ← Plan limits & usage
├── tenant_usage_quotas         ← Real-time quota tracking
├── tenant_pipeline_configs     ← Scheduler configuration
├── tenant_scheduled_pipeline_runs ← Execution history
└── tenant_pipeline_execution_queue ← Task queue

{tenant_id}/                    ← GenAI-safe, operational only
├── tenant_pipeline_runs        ← NO credentials
├── tenant_step_logs            ← NO credentials
├── tenant_dq_results           ← NO credentials
└── data tables (cost, compliance, etc.)
```

**Security Guarantee**: Tenant datasets contain ZERO credentials, making them safe for GenAI exposure.

---

**Last Updated**: 2025-11-18
**Schema Version**: 3.0 (Fully API-based bootstrap)
