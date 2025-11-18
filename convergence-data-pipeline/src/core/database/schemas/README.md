# Database Schema Documentation

This directory contains SQL schema definitions for the BigQuery datasets used in the Convergence Data Pipeline platform.

## Schema Files

### 1. customers_auth_dataset.sql
**Purpose**: Centralized customer authentication and management dataset
**Dataset Name**: `customers`
**Protection Level**: HIGHLY PROTECTED - NO GenAI access

**Tables**:
- `customer_profiles` - Customer registry and status
- `customer_api_keys` - KMS-encrypted API keys
- `customer_cloud_credentials` - KMS-encrypted cloud provider credentials
- `customer_subscriptions` - Subscription plans and quotas
- `customer_usage_quotas` - Real-time usage tracking

**Use Case**: Authentication, billing, credential management

---

### 2. tenant_dataset.sql
**Purpose**: Per-tenant operational data dataset
**Dataset Name**: `{tenant_id}` (one per customer)
**Protection Level**: SAFE for GenAI - NO credentials

**Tables**:
- `x_meta_pipeline_runs` - Pipeline execution logs
- `x_meta_step_logs` - Step-level execution details
- `x_meta_dq_results` - Data quality check results

**Use Case**: Operational logs, analytics, GenAI analysis

---

### 3. customers_dataset.sql
**Purpose**: Legacy/alternative customer dataset schema
**Status**: May be redundant - review before use

---

## Schema Deployment

These SQL files are **reference documentation only**. The actual schemas are:

1. **Deployed in BigQuery**:
   - Project: `gac-prod-471220`
   - Dataset: `customers`
   - Tenant Datasets: `{tenant_id}`

2. **Used by code via JSON schemas**:
   - Location: `templates/customer/onboarding/schemas/*.json`
   - Usage: The onboarding engine loads JSON schemas to create tables

## JSON Schema Files

The **active schema definitions** used by the code are in JSON format:

```
templates/customer/onboarding/schemas/
├── x_meta_api_keys.json           (NOT USED - credentials in customers dataset)
├── x_meta_cloud_credentials.json  (NOT USED - credentials in customers dataset)
├── x_meta_pipeline_runs.json      (ACTIVE - tenant operational data)
├── x_meta_step_logs.json          (ACTIVE - tenant operational data)
├── x_meta_dq_results.json         (ACTIVE - tenant operational data)
├── x_meta_pipeline_queue.json     (Scheduler queue)
└── x_meta_scheduled_runs.json     (Scheduler state tracking)
```

## Schema Updates

To update schemas:

1. **For tenant datasets**:
   - Update JSON schema in `templates/customer/onboarding/schemas/`
   - Update corresponding SQL file here (for documentation)
   - Migrate existing tenant datasets if needed

2. **For customers dataset**:
   - Update via BigQuery ALTER TABLE commands
   - Update SQL file here (for documentation)

## Two-Dataset Architecture

```
customers/                     ← Protected, IAM-restricted
├── customer_profiles
├── customer_api_keys          ← API keys HERE (encrypted)
├── customer_cloud_credentials ← Credentials HERE (encrypted)
├── customer_subscriptions
└── customer_usage_quotas

{tenant_id}/                   ← GenAI-safe, operational only
├── x_meta_pipeline_runs       ← NO credentials
├── x_meta_step_logs           ← NO credentials
└── x_meta_dq_results          ← NO credentials
```

**Security Guarantee**: Tenant datasets contain ZERO credentials, making them safe for GenAI exposure.

---

**Last Updated**: 2025-11-17
**Schema Version**: 2.0 (Two-dataset architecture)
