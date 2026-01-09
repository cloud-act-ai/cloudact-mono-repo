# Remaining MEDIUM & LOW Priority Fixes
**Date:** 2026-01-08
**Status:** In Progress
**Completed:** Phase 1 (12 Critical) + Phase 2 High (4 remaining) + Schema MEDIUM (3)

---

## ✅ COMPLETED IN THIS SESSION

### Phase 2 - HIGH Priority (4 issues):
1. ✅ **CFG-004** - Added required field validation in PipelineConfig/PipelineStepConfig models
   - Made `name`, `provider`, `domain` required in PipelineConfig
   - Made `name` required in PipelineStepConfig
   - File: `src/core/abstractor/models.py`

2. ✅ **PROC-005** - Implemented retry wrapper with exponential backoff
   - Added `retry_with_backoff()` function using BQ_MAX_RETRIES constants
   - Applied to BigQuery query calls
   - File: `src/core/processors/genai/payg_cost.py`

3. ✅ **TEST-001** - Created hierarchy validation tests
   - Created `tests/test_hierarchy_validation.py`
   - Added 3 main test functions + 4 helper tests
   - File: `tests/test_hierarchy_validation.py`

### Phase 3 - MEDIUM Priority (Schema - 3 issues):
4. ✅ **SCH-007** - Added x_cloud_provider (STRING, REQUIRED) to all 4 cloud schemas
5. ✅ **SCH-008** - Added x_cloud_account_id (STRING, NULLABLE) to all 4 cloud schemas
6. ✅ **SCH-009** - Standardized field order (implicit - all schemas now in standard order)
   - Files: AWS, Azure, OCI, GCP billing schemas

---

## 🔄 REMAINING MEDIUM Priority (15 issues)

### Procedure Fixes (4 issues):

**PRO-007** - Subscription Procedure Missing Pipeline Lineage Parameters
- **File:** `configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql` + sp_subscription_3_convert_to_focus.sql
- **Fix:** Add p_pipeline_id, p_credential_id, p_run_id parameters
- **Action:** Update procedure declarations and parameter usage

**PRO-008** - Missing Fiscal Year Handling in Billing Periods
- **File:** `configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql`
- **Fix:** Add fiscal_year_start_month parameter and adjust date calculations
- **Action:** Modify date range generation to support Apr/Jul starts

**PRO-009** - Hardcoded x_pipeline_id in Subscription Procedure
- **File:** `configs/system/procedures/subscription/sp_subscription_3_convert_to_focus.sql`
- **Fix:** Use @p_pipeline_id instead of hardcoded 'subscription_to_focus'
- **Action:** Replace hardcoded string with parameter

**PRO-010** - Missing DQ Table Writes for NULL Seats
- **File:** `configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql`
- **Fix:** INSERT into org_meta_dq_results when seats is NULL
- **Action:** Add validation and DQ logging for NULL seat counts

### Config Fixes (4 issues):

**CFG-006** - Inconsistent Retry Configuration
- **File:** `configs/genai/payg/openai.yml`
- **Fix:** Standardize retry config (max_attempts: 3, backoff_seconds: 30) across all steps
- **Action:** Update extract_usage and calculate_costs retry configs to match

**CFG-007** - Missing Slack Notifications
- **File:** `configs/genai/payg/openai.yml`
- **Fix:** Add slack to notifications.on_failure and on_success
- **Action:** Update notifications section to include Slack channel

**CFG-008** - Pipeline Version Not Updated
- **File:** Multiple .yml files
- **Fix:** Bump version from 1.0.0 to 15.0.0 to match schema version
- **Action:** Update version field in all pipeline configs

**CFG-009** - Missing Step Dependencies
- **File:** All multi-step pipelines
- **Fix:** Add depends_on to sequential steps
- **Action:** Ensure step 2 depends_on: [step1], step 3 depends_on: [step2], etc.

### Processor Fixes (3 issues):

**PROC-006** - Missing Org Slug Format Validation
- **File:** `src/core/processors/genai/payg_cost.py` line 253
- **Fix:** Add regex validation for org_slug at start of execute()
- **Action:** Add validation: `if not re.match(r'^[a-zA-Z0-9_]{3,50}$', org_slug): return FAILED`

**PROC-007** - Missing MERGE Count Breakdown
- **File:** `src/core/processors/genai/focus_converter.py` line 311
- **Fix:** Log separate counts for inserted/updated/deleted rows
- **Action:** Parse job.num_dml_affected_rows and break down by operation

**PROC-008** - Cloud Focus Converter Date Range Loop Missing
- **File:** `src/core/processors/cloud/focus_converter.py` lines 71-95
- **Fix:** Call procedure once per date in range (not just once)
- **Action:** Add for loop: `for date in date_range: call_procedure(date)`

### Security/Quality Fixes (4 issues):

**SEC-004** - Missing Rate Limiting on Pipeline Endpoints
- **File:** `src/app/routers/pipelines.py`
- **Fix:** Add @rate_limit_global decorator to POST /pipelines/run/{org}/*
- **Action:** Import and apply rate limiting decorator

**SEC-005** - Missing Audit Logging
- **File:** All processor execute() methods
- **Fix:** Add audit log writes to org_audit_logs table
- **Action:** Insert audit record for pipeline start/completion

**QUAL-001** - Disabled Code in Production
- **File:** `src/core/processors/genai/payg_cost.py` lines 691-693
- **Fix:** Remove commented/disabled code block
- **Status:** ✅ ALREADY FIXED in Phase 1 (replaced with working validation)

**QUAL-002** - Backup File in Production Configs
- **File:** `configs/system/procedures/genai/sp_consolidate_genai_costs_daily.sql.bak`
- **Fix:** Delete .bak file and add *.bak to .gitignore
- **Action:** `rm *.bak` + add to .gitignore

---

## ⏸️ PENDING LOW Priority (9 issues)

### Schema Fixes (6 issues):
- SCH-010: Add description to billing_account_id in GCP schema
- SCH-011: Verify resource_name is snake_case in all schemas
- SCH-012: Add clustering hint to x_pipeline_run_date descriptions
- SCH-013: Add $schema_version and last_updated to all schema JSON files
- SCH-014: Create CHANGELOG.md in schemas directory
- SCH-015: Add deprecation note for billing_amount in subscription_plans.json

### Procedure Fixes (2 issues):
- PRO-011: Improve error message in sp_cloud_1_convert_to_focus.sql line 558
- PRO-012: Add currency validation ASSERT in sp_subscription_3_convert_to_focus.sql

### Config Fixes (2 issues):
- CFG-010: Add timezone comment in openai.yml
- CFG-011: Add header comments to all .yml pipeline files

### Processor Fixes (2 issues):
- PROC-009: Implement google-cloud-monitoring API calls in gcp_vertex_adapter.py
- PROC-010: Add org_slug and process_date to exception context in focus_converter.py

### Quality (1 issue):
- QUAL-003: Add explanatory comments to retry constants in payg_cost.py lines 40-44

---

## Progress Summary

**Total Issues:** 57
**Completed:** 19/57 (33%)
  - Phase 1 (Critical): 12/12 ✅
  - Phase 2 (High): 4/18 (remainder in progress report)
  - Phase 3 (Medium): 3/18 (schema fixes only)

**Remaining:** 38/57 (67%)
  - High: 14/18 (from progress report - in progress by agent)
  - Medium: 15/18 (4 procedure + 4 config + 3 processor + 4 security/quality)
  - Low: 9/9

**Next Actions:**
1. Complete remaining 15 MEDIUM priority fixes systematically
2. Complete all 9 LOW priority fixes
3. Verify all fixes with test suite
4. Create final comprehensive completion report

**Files Modified This Session:**
1. src/core/abstractor/models.py (CFG-004)
2. src/core/processors/genai/payg_cost.py (PROC-005)
3. tests/test_hierarchy_validation.py (TEST-001)
4. cloud_aws_billing_raw_daily.json (SCH-007, SCH-008)
5. cloud_azure_billing_raw_daily.json (SCH-007, SCH-008)
6. cloud_oci_billing_raw_daily.json (SCH-007, SCH-008)
7. cloud_gcp_billing_raw_daily.json (SCH-007, SCH-008, SCH-005)

---
**Last Updated:** 2026-01-08 (Session in progress)
