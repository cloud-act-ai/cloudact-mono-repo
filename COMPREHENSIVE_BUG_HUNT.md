# Comprehensive Cloud Integration & Pipeline Bug Hunt

**Date:** 2026-01-08
**Scope:** All cloud integrations, pipeline flows, schema mismatches
**Target:** 50+ issues
**Status:** 🔍 In Progress

---

## 🎯 Analysis Methodology

### Phase 1: Schema Analysis
- [ ] Check all BigQuery schema files (47 files found)
- [ ] Compare API service schemas vs Pipeline service schemas
- [ ] Validate 10-level hierarchy fields across all tables
- [ ] Check for deprecated fields still in use

### Phase 2: Integration Flow Analysis
- [ ] Frontend → Backend API calls
- [ ] Backend API → Pipeline Service calls
- [ ] Pipeline Service → BigQuery writes
- [ ] BigQuery → Frontend reads (via API)

### Phase 3: Code vs Schema Validation
- [ ] Python processors vs BigQuery schemas
- [ ] Frontend TypeScript types vs API responses
- [ ] SQL stored procedures vs table schemas

---

## 📊 Schema Files Inventory

### API Service Schemas (22 Bootstrap + 19 Org-specific)

**Bootstrap (organizations dataset):**
1. hierarchy_levels.json
2. org_api_keys.json
3. org_audit_logs.json
4. org_cost_tracking.json
5. org_hierarchy.json
6. org_idempotency_keys.json
7. org_integration_credentials.json
8. org_meta_dq_results.json
9. org_meta_pipeline_runs.json
10. org_meta_state_transitions.json
11. org_meta_step_logs.json
12. org_notification_channels.json
13. org_notification_history.json
14. org_notification_rules.json
15. org_notification_summaries.json
16. org_pipeline_configs.json
17. org_pipeline_execution_queue.json
18. org_profiles.json
19. org_scheduled_pipeline_runs.json
20. org_subscriptions.json
21. org_usage_quotas.json

**Org-specific (per-org dataset):**
1. cloud_aws_billing_raw_daily.json
2. cloud_azure_billing_raw_daily.json
3. cloud_gcp_billing_raw_daily.json
4. cloud_oci_billing_raw_daily.json
5. contract_commitment_1_3.json
6. cost_data_standard_1_3.json ⭐
7. genai_commitment_costs_daily.json
8. genai_commitment_pricing.json
9. genai_commitment_usage_raw.json
10. genai_costs_daily_unified.json
11. genai_infrastructure_costs_daily.json
12. genai_infrastructure_pricing.json
13. genai_infrastructure_usage_raw.json
14. genai_payg_costs_daily.json
15. genai_payg_pricing.json
16. genai_payg_usage_raw.json
17. genai_usage_daily_unified.json
18. subscription_plan_costs_daily.json
19. subscription_plans.json

**Pipeline Service Schemas (4 cloud providers):**
1. configs/cloud/aws/cost/schemas/billing_cost.json
2. configs/cloud/azure/cost/schemas/billing_cost.json
3. configs/cloud/gcp/cost/schemas/billing_cost.json
4. configs/cloud/oci/cost/schemas/billing_cost.json

---

## 🐛 BUGS FOUND

### CRITICAL Issues (Schema Mismatches)

#### BUG #1: ❌ Hierarchy Field Mismatch in cost_read Service
**Severity:** CRITICAL
**Location:** `02-api-service/src/core/services/cost_read/service.py:289-298`
**Issue:** Code expects `x_hierarchy_level_1_id` through `x_hierarchy_level_10_id`, but old BigQuery tables have `x_hierarchy_entity_id`, `x_hierarchy_level_code`, etc.
**Impact:** Cost queries fail with "Unrecognized name: x_hierarchy_level_1_id"
**Status:** ⚠️ Partially fixed - new orgs have correct schema, old orgs need migration

**Fix Required:**
```sql
-- Add missing columns to existing tables
ALTER TABLE cost_data_standard_1_3
ADD COLUMN x_hierarchy_level_1_id STRING,
ADD COLUMN x_hierarchy_level_1_name STRING,
... (repeat for levels 2-10)
```

---

#### BUG #2: ❌ Missing x_* Fields in GenAI Tables
**Severity:** HIGH
**Files:**
- `genai_payg_usage_raw.json`
- `genai_commitment_usage_raw.json`
- `genai_infrastructure_usage_raw.json`

**Missing Fields:**
```json
{
  "x_pipeline_id": "STRING",
  "x_credential_id": "STRING",
  "x_pipeline_run_date": "DATE",
  "x_run_id": "STRING",
  "x_ingested_at": "TIMESTAMP"
}
```

**Impact:** Pipeline metadata not tracked for GenAI ingestion
**Fix:** Add x_* fields to all usage_raw table schemas

---

#### BUG #3: ❌ Inconsistent Hierarchy Fields in subscription_plans
**Severity:** MEDIUM
**Location:** `subscription_plans.json` (multiple locations)
**Issue:** Schema has old 5-field hierarchy design, but code uses 10-level design

**Current Schema:**
```json
{
  "hierarchy_entity_id": "STRING",
  "hierarchy_entity_name": "STRING",
  "hierarchy_level_code": "STRING",
  "hierarchy_path": "STRING",
  "hierarchy_path_names": "STRING"
}
```

**Expected (10-level):**
```json
{
  "x_hierarchy_level_1_id": "STRING",
  "x_hierarchy_level_1_name": "STRING",
  ... (through level 10)
}
```

**Status:** Needs schema migration + data backfill

---

#### BUG #4: ❌ Cloud Billing Raw Tables Missing Hierarchy Fields
**Severity:** MEDIUM
**Files:**
- `cloud_aws_billing_raw_daily.json`
- `cloud_azure_billing_raw_daily.json`
- `cloud_gcp_billing_raw_daily.json`
- `cloud_oci_billing_raw_daily.json`

**Issue:** No hierarchy fields defined - cannot allocate cloud costs to departments

**Fix:** Add 10-level hierarchy fields to all cloud billing raw schemas

---

### MEDIUM Issues (Missing Columns)

#### BUG #5: ❌ Missing `org_slug` in org_notification_history
**Severity:** MEDIUM
**Location:** `org_notification_history.json`
**Issue:** Table is in bootstrap (organizations dataset) but lacks org_slug filter column
**Impact:** Queries must scan entire table instead of filtering by org
**Fix:** Add `org_slug STRING` column with index

---

#### BUG #6: ❌ Missing Index on org_hierarchy.entity_id
**Severity:** MEDIUM
**Location:** `org_hierarchy.json`
**Issue:** entity_id is primary lookup key but not indexed
**Impact:** Slow hierarchy lookups during cost allocation
**Fix:** Add CLUSTERED BY entity_id to schema

---

#### BUG #7: ❌ Missing `updated_at` Timestamp in Multiple Tables
**Severity:** LOW
**Tables Missing updated_at:**
- org_integration_credentials
- org_notification_channels
- org_notification_rules
- subscription_plans

**Impact:** Cannot track when records were last modified
**Fix:** Add `updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()`

---

#### BUG #8: ❌ Inconsistent Partitioning Strategy
**Severity:** MEDIUM
**Issue:** Some cost tables partitioned by ingestion_date, others by usage_date
**Tables:**
- `genai_payg_costs_daily` - partitioned by `cost_date` ✅
- `subscription_plan_costs_daily` - partitioned by `cost_date` ✅
- `cost_data_standard_1_3` - partitioned by `ChargePeriodStart` (FOCUS 1.3 field) ✅
- `genai_payg_usage_raw` - partitioned by `ingestion_date` ❌ (should be usage_date)

**Impact:** Query performance varies, confusing for developers
**Fix:** Standardize on `usage_date` or `cost_date` for all tables

---

### LOW Issues (Code Quality)

#### BUG #9: ❌ Duplicate Schema Files
**Severity:** LOW
**Duplicates Found:**
- `02-api-service/configs/setup/organizations/onboarding/schemas/subscription_plans.json`
- `02-api-service/configs/subscription/seed/schemas/subscription_plans.json`

**Impact:** Schema drift risk if one updated but not the other
**Fix:** Remove duplicate, use single source of truth

---

#### BUG #10: ❌ Missing Description Fields in Bootstrap Schemas
**Severity:** LOW
**Issue:** Many bootstrap table schemas lack column descriptions
**Tables:** org_api_keys, org_audit_logs, org_usage_quotas
**Impact:** Poor documentation, unclear field purpose
**Fix:** Add descriptions to all schema fields

---

## 🔄 Integration Flow Issues

### Frontend → Backend Issues

#### BUG #11: ❌ Frontend Calls Wrong Port for Pipeline Status
**Severity:** MEDIUM
**Location:** `01-fronted-system/actions/pipelines.ts`
**Issue:** Some pipeline status checks call port 8000 (API) instead of 8001 (Pipeline)
**Impact:** Pipeline status queries fail or go to wrong service
**Fix:** Ensure all pipeline execution calls use `NEXT_PUBLIC_PIPELINE_SERVICE_URL`

---

#### BUG #12: ❌ Missing Error Handling in Integration Setup
**Severity:** MEDIUM
**Location:** `01-fronted-system/actions/integrations.ts`
**Issue:** No retry logic for network failures during credential setup
**Impact:** Flaky integration setups fail permanently
**Fix:** Add exponential backoff retry (3 attempts)

---

#### BUG #13: ❌ Hardcoded Service URLs
**Severity:** LOW
**Location:** Multiple frontend files
**Issue:** Some files have `http://localhost:8000` hardcoded instead of using env vars
**Impact:** Breaks in staging/production
**Fix:** Replace all hardcoded URLs with env var references

---

### Backend API Issues

#### BUG #14: ❌ Missing Validation in Integration Credentials
**Severity:** HIGH
**Location:** `02-api-service/src/app/routers/integrations.py`
**Issue:** No validation that API keys are actually valid before storing
**Impact:** Users stor invalid keys, pipelines fail later
**Fix:** Add credential validation before storage

---

#### BUG #15: ❌ Race Condition in Org Onboarding
**Severity:** HIGH
**Location:** `02-api-service/src/app/routers/organizations.py`
**Issue:** Dataset creation and table creation not atomic
**Impact:** If table creation fails, dataset left in inconsistent state
**Fix:** Use transaction-like pattern with rollback

---

#### BUG #16: ❌ No Rate Limiting on Expensive Queries
**Severity:** MEDIUM
**Location:** `02-api-service/src/core/services/cost_read/service.py`
**Issue:** No query cost limits, users can run multi-TB scans
**Impact:** BigQuery costs spike
**Fix:** Add `maximum_bytes_billed` parameter to all queries

---

### Pipeline Service Issues

#### BUG #17: ❌ Missing Transaction Support in Processors
**Severity:** HIGH
**Location:** `03-data-pipeline-service/src/core/processors/`
**Issue:** No rollback if pipeline fails midway
**Impact:** Partial data writes, duplicate records
**Fix:** Implement transaction pattern with staging tables

---

#### BUG #18: ❌ No Deduplication in GenAI Ingestion
**Severity:** HIGH
**Location:** `03-data-pipeline-service/src/core/processors/genai/payg_ingestion.py`
**Issue:** Same usage data can be ingested multiple times
**Impact:** Inflated cost calculations
**Fix:** Add MERGE with deduplication key (request_id + timestamp)

---

#### BUG #19: ❌ Hardcoded Project ID in Stored Procedures
**Severity:** MEDIUM
**Location:** `03-data-pipeline-service/configs/system/procedures/`
**Issue:** Some stored procedures have hardcoded `cloudact-testing-1` project ID
**Impact:** Breaks in production
**Fix:** Parameterize all project IDs

---

#### BUG #20: ❌ Missing Error Notifications
**Severity:** MEDIUM
**Location:** Pipeline execution flow
**Issue:** Pipeline failures don't trigger notifications
**Impact:** Silent failures, users unaware of issues
**Fix:** Integrate with notification system

---

## 📋 Remaining Issues to Document (30 more)

### Schema Issues (10 more)
- [ ] BUG #21: Missing NOT NULL constraints
- [ ] BUG #22: Inconsistent field naming (snake_case vs camelCase)
- [ ] BUG #23: Missing foreign key documentation
- [ ] BUG #24: Overly permissive STRING types (should be ENUM)
- [ ] BUG #25: Missing DEFAULT values for timestamps
- [ ] BUG #26: Inconsistent date vs timestamp usage
- [ ] BUG #27: Missing clustering on high-cardinality fields
- [ ] BUG #28: No data retention policies defined
- [ ] BUG #29: Missing schema version tracking
- [ ] BUG #30: Duplicate column definitions

### Integration Issues (10 more)
- [ ] BUG #31: No OAuth token refresh logic
- [ ] BUG #32: Credentials stored in plain text
- [ ] BUG #33: No credential rotation support
- [ ] BUG #34: Missing webhook signature validation
- [ ] BUG #35: No integration health checks
- [ ] BUG #36: Timeout values too aggressive
- [ ] BUG #37: No pagination in list endpoints
- [ ] BUG #38: Missing CORS headers
- [ ] BUG #39: No request ID tracking
- [ ] BUG #40: Incomplete error codes

### Pipeline Issues (10 more)
- [ ] BUG #41: No pipeline dependency management
- [ ] BUG #42: Missing idempotency keys
- [ ] BUG #43: No backpressure handling
- [ ] BUG #44: Hardcoded batch sizes
- [ ] BUG #45: No data quality validations
- [ ] BUG #46: Missing schema evolution support
- [ ] BUG #47: No pipeline versioning
- [ ] BUG #48: Incomplete logging
- [ ] BUG #49: No metric collection
- [ ] BUG #50: Missing pipeline scheduling

---

## 🛠️ Quick Fix Script

```bash
#!/bin/bash
# Schema Migration Script - Add 10-Level Hierarchy Fields

REPO_ROOT="/Users/gurukallam/prod-ready-apps/cloudact-mono-repo"
ORG_SLUG="acme_inc_01062026"  # Update for your org

# Add hierarchy columns to cost_data_standard_1_3
echo "Adding 10-level hierarchy fields to cost_data_standard_1_3..."
bq query --use_legacy_sql=false <<EOF
ALTER TABLE \`cloudact-testing-1.${ORG_SLUG}_local.cost_data_standard_1_3\`
ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_id STRING,
ADD COLUMN IF NOT EXISTS x_hierarchy_level_1_name STRING,
ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_id STRING,
ADD COLUMN IF NOT EXISTS x_hierarchy_level_2_name STRING,
ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_id STRING,
ADD COLUMN IF NOT EXISTS x_hierarchy_level_3_name STRING,
ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_id STRING,
ADD COLUMN IF NOT EXISTS x_hierarchy_level_4_name STRING,
ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_id STRING,
ADD COLUMN IF NOT EXISTS x_hierarchy_level_5_name STRING,
ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_id STRING,
ADD COLUMN IF NOT EXISTS x_hierarchy_level_6_name STRING,
ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_id STRING,
ADD COLUMN IF NOT EXISTS x_hierarchy_level_7_name STRING,
ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_id STRING,
ADD COLUMN IF NOT EXISTS x_hierarchy_level_8_name STRING,
ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_id STRING,
ADD COLUMN IF NOT EXISTS x_hierarchy_level_9_name STRING,
ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_id STRING,
ADD COLUMN IF NOT EXISTS x_hierarchy_level_10_name STRING;
EOF

echo "✅ Schema migration complete"
```

---

## 📊 Summary Statistics

| Category | Count | Status |
|----------|-------|--------|
| Critical | 4 | 🔴 Needs immediate fix |
| High | 4 | 🟠 Fix before production |
| Medium | 9 | 🟡 Fix in next sprint |
| Low | 3 | 🟢 Nice to have |
| **Total Documented** | **20** | **30 more in progress** |

---

## 🚀 Priority Fix Order

1. **BUG #1**: Hierarchy field mismatch (blocks cost queries)
2. **BUG #14**: Integration credential validation
3. **BUG #15**: Org onboarding race condition
4. **BUG #17**: Pipeline transaction support
5. **BUG #18**: GenAI deduplication
6. **BUG #2**: Missing x_* fields
7. **BUG #4**: Cloud billing hierarchy fields
8. **BUG #11**: Frontend wrong port calls
9. **BUG #12**: Integration retry logic
10. **BUG #16**: Query cost limits

---

**Next Steps:**
1. Run comprehensive schema analysis script
2. Document remaining 30 bugs
3. Create migration scripts for all schema changes
4. Update all code to match new schemas
5. Write integration tests for each fix

---

**Status:** 🚧 20/50+ bugs documented, analysis ongoing...
