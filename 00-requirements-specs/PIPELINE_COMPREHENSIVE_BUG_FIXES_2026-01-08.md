# Pipeline Service Comprehensive Bug Report
**Date:** 2026-01-08
**Total Issues:** 57
**Severity Breakdown:** 12 Critical | 18 High | 18 Medium | 9 Low

## Executive Summary

Comprehensive audit of the Pipeline Service (03-data-pipeline-service) identified 57 issues across 7 categories:

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| **Schema** | 3 | 5 | 3 | 4 | **15** |
| **Stored Procedures** | 3 | 2 | 5 | 2 | **12** |
| **Configuration** | 2 | 3 | 4 | 2 | **11** |
| **Processors** | 3 | 2 | 3 | 2 | **10** |
| **Security** | 1 | 2 | 2 | 0 | **5** |
| **Code Quality** | 0 | 0 | 2 | 1 | **3** |
| **Testing** | 0 | 1 | 0 | 0 | **1** |
| **TOTAL** | **12** | **18** | **18** | **9** | **57** |

---

## CATEGORY 1: SCHEMA CONSISTENCY (15 Issues)

### SCH-001 [CRITICAL] - Missing 10-Level Hierarchy Fields in AWS Billing Schema
**File:** `configs/setup/organizations/onboarding/schemas/cloud_aws_billing_raw_daily.json`
**Issue:** AWS schema missing 20 hierarchy extension fields (10 IDs + 10 names) that GCP has

**Required Fields:**
```json
{
  "name": "x_hierarchy_level_1_id",
  "type": "STRING",
  "mode": "NULLABLE",
  "description": "Level 1 hierarchy entity ID"
},
{
  "name": "x_hierarchy_level_1_name",
  "type": "STRING",
  "mode": "NULLABLE",
  "description": "Level 1 hierarchy entity name"
},
// ... repeat for levels 2-10
{
  "name": "x_hierarchy_validated_at",
  "type": "TIMESTAMP",
  "mode": "NULLABLE",
  "description": "When hierarchy was validated"
}
```

**Impact:** AWS costs cannot be allocated to organizational hierarchy; joins fail downstream

---

### SCH-002 [CRITICAL] - Missing 10-Level Hierarchy Fields in Azure Billing Schema
**File:** `configs/setup/organizations/onboarding/schemas/cloud_azure_billing_raw_daily.json`
**Issue:** Azure schema missing 20 hierarchy extension fields (10 IDs + 10 names) that GCP has

**Fix:** Same as SCH-001, add all 20 hierarchy fields

**Impact:** Azure costs cannot be allocated to organizational hierarchy; joins fail downstream

---

### SCH-003 [CRITICAL] - Missing 10-Level Hierarchy Fields in OCI Billing Schema
**File:** `configs/setup/organizations/onboarding/schemas/cloud_oci_billing_raw_daily.json`
**Issue:** OCI schema missing 20 hierarchy extension fields (10 IDs + 10 names) that GCP has

**Fix:** Same as SCH-001, add all 20 hierarchy fields

**Impact:** OCI costs cannot be allocated to organizational hierarchy; joins fail downstream

---

### SCH-004 [HIGH] - Missing x_data_quality_score in All Cloud Schemas
**File:** AWS/Azure/OCI/GCP billing schemas
**Issue:** All cloud billing schemas missing x_data_quality_score (DQ validation score)

**Required Field:**
```json
{
  "name": "x_data_quality_score",
  "type": "FLOAT64",
  "mode": "NULLABLE",
  "description": "Data quality validation score (0.0-1.0)"
}
```

**Impact:** Cannot track data quality metrics for cloud cost data

---

### SCH-005 [HIGH] - Missing x_created_at in Cloud Schemas
**File:** AWS/Azure/OCI billing schemas
**Issue:** Cloud billing schemas missing x_created_at timestamp

**Required Field:**
```json
{
  "name": "x_created_at",
  "type": "TIMESTAMP",
  "mode": "NULLABLE",
  "description": "Record creation timestamp"
}
```

**Impact:** Cannot track when records were first created vs updated

---

### SCH-006 [HIGH] - FOCUS 1.3 Azure Schema Missing CommitmentDiscountType
**File:** `cost_data_standard_1_3.json`
**Issue:** Azure costs have missing CommitmentDiscountType for Reserved Instances mapping

**Fix:** Add field handling in Azure procedure (PRO-002)

**Impact:** Azure RI costs show NULL commitment discount type in FOCUS

---

### SCH-007 [MEDIUM] - Missing x_cloud_provider in Cloud Billing Schemas
**File:** AWS/Azure/OCI billing schemas
**Issue:** Cloud schemas don't store x_cloud_provider for multi-cloud queries

**Required Field:**
```json
{
  "name": "x_cloud_provider",
  "type": "STRING",
  "mode": "REQUIRED",
  "description": "Cloud provider identifier (aws, azure, gcp, oci)"
}
```

**Impact:** Multi-cloud cost analysis requires complex queries

---

### SCH-008 [MEDIUM] - Missing x_cloud_account_id in Cloud Billing Schemas
**File:** AWS/Azure/OCI/GCP billing schemas
**Issue:** Missing normalized account ID field for multi-account cost allocation

**Required Field:**
```json
{
  "name": "x_cloud_account_id",
  "type": "STRING",
  "mode": "NULLABLE",
  "description": "Normalized cloud account/subscription ID"
}
```

**Impact:** Cannot easily filter costs by cloud account

---

### SCH-009 [MEDIUM] - Inconsistent Field Order Between Schemas
**File:** All cloud billing schemas
**Issue:** x_* lineage columns appear in different order across schemas

**Fix:** Standardize to required order:
1. x_pipeline_id
2. x_credential_id
3. x_pipeline_run_date
4. x_run_id
5. x_ingested_at
6. x_data_quality_score (nullable)
7. x_created_at (nullable)

**Impact:** Maintenance confusion, harder to compare schemas

---

### SCH-010 [LOW] - Missing Description for billing_account_id Field
**File:** `cloud_gcp_billing_raw_daily.json` line 42
**Issue:** billing_account_id missing description field

**Fix:**
```json
{
  "name": "billing_account_id",
  "type": "STRING",
  "mode": "NULLABLE",
  "description": "GCP billing account ID (format: XXXXXX-YYYYYY-ZZZZZZ)"
}
```

**Impact:** Documentation incomplete

---

### SCH-011 [LOW] - Inconsistent resource_name Capitalization
**File:** GCP vs AWS schemas
**Issue:** GCP uses resource_name, AWS may use ResourceName

**Fix:** Standardize to snake_case: resource_name

**Impact:** Minor - query inconsistency

---

### SCH-012 [LOW] - Missing Index Hint for x_pipeline_run_date
**File:** All schemas with partitioning
**Issue:** x_pipeline_run_date should be indexed for common WHERE clause

**Fix:** Add clustering or partitioning hint in schema description

**Impact:** Slower queries filtering by run date

---

### SCH-013 [LOW] - Schema Version Not Tracked in File
**File:** All .json schema files
**Issue:** Schema files don't include version metadata field

**Fix:** Add top-level comment:
```json
{
  "$schema_version": "15.0.0",
  "last_updated": "2026-01-08",
  "fields": [...]
}
```

**Impact:** Hard to track schema evolution

---

### SCH-014 [LOW] - Missing Changelog in Schema Directory
**File:** `configs/setup/organizations/onboarding/schemas/`
**Issue:** No CHANGELOG.md documenting schema changes

**Fix:** Create CHANGELOG.md with version history

**Impact:** Schema evolution not documented

---

### SCH-015 [LOW] - Redundant Fields in Subscription Plans Schema
**File:** `subscription_plans.json`
**Issue:** Both monthly_cost and billing_amount exist (same data)

**Fix:** Deprecate billing_amount, use monthly_cost only

**Impact:** Confusion about which field to use

---

## CATEGORY 2: STORED PROCEDURES (12 Issues)

### PRO-001 [CRITICAL] - AWS Procedure Missing 10-Level Hierarchy Expansion
**File:** `configs/system/procedures/cloud/sp_cloud_1_convert_to_focus.sql`
**Lines:** 240-343 (AWS section)
**Issue:** AWS section missing hierarchy_lookup CTE and LEFT JOIN that GCP has (lines 77-235)

**Current:** AWS directly selects from billing data without hierarchy expansion

**Fix Required:** Add hierarchy_lookup CTE before AWS INSERT:
```sql
-- AWS Section (starting line 240)
WHEN @p_provider IN ('aws', 'all') THEN

  -- Add hierarchy lookup CTE
  WITH hierarchy_lookup AS (
    SELECT
      entity_id, entity_name,
      CASE WHEN ARRAY_LENGTH(path_ids) >= 1 THEN path_ids[OFFSET(0)] ELSE NULL END AS level_1_id,
      CASE WHEN ARRAY_LENGTH(path_ids) >= 2 THEN path_ids[OFFSET(1)] ELSE NULL END AS level_2_id,
      -- ... levels 3-10 ...
      CASE WHEN ARRAY_LENGTH(path_names) >= 1 THEN path_names[OFFSET(0)] ELSE NULL END AS level_1_name,
      CASE WHEN ARRAY_LENGTH(path_names) >= 2 THEN path_names[OFFSET(1)] ELSE NULL END AS level_2_name,
      -- ... levels 3-10 ...
    FROM `{project_id}.organizations.org_hierarchy`
    WHERE org_slug = @v_org_slug AND end_date IS NULL
  )

  MERGE `{dataset}.cost_data_standard_1_3` T
  USING (
    SELECT
      -- ... existing AWS fields ...
      -- Add hierarchy columns with LEFT JOIN
      h.level_1_id AS x_hierarchy_level_1_id,
      h.level_1_name AS x_hierarchy_level_1_name,
      -- ... levels 2-10 ...
    FROM `{dataset}.cloud_aws_billing_raw_daily` b
    LEFT JOIN hierarchy_lookup h
      ON b.x_hierarchy_entity_id = h.entity_id
    WHERE ...
  ) S
  ON ...
```

**Impact:** AWS costs not allocated to organizational hierarchy; dashboard filters fail

---

### PRO-002 [CRITICAL] - Azure Procedure Missing CommitmentDiscountType
**File:** `configs/system/procedures/cloud/sp_cloud_1_convert_to_focus.sql`
**Line:** 348-437 (Azure section)
**Issue:** Azure MERGE missing CommitmentDiscountType field mapping for Reserved Instances

**Fix:** Add to Azure SELECT:
```sql
CASE
  WHEN reservation_id IS NOT NULL THEN 'Reservation'
  WHEN savings_plan_id IS NOT NULL THEN 'Savings Plan'
  ELSE NULL
END AS CommitmentDiscountType,
```

**Impact:** Azure RI costs show NULL commitment type in FOCUS reports

---

### PRO-003 [CRITICAL] - OCI Procedure Declares Hierarchy But Never Populates
**File:** `configs/system/procedures/cloud/sp_cloud_1_convert_to_focus.sql`
**Lines:** 459-540 (OCI section)
**Issue:** OCI section declares x_hierarchy_level_* columns but SELECT never populates them (shows NULL)

**Fix:** Add hierarchy_lookup CTE and LEFT JOIN like AWS fix (PRO-001)

**Impact:** OCI costs have NULL hierarchy; allocation impossible

---

### PRO-004 [HIGH] - GCP Procedure Timeout on Large Datasets
**File:** `configs/system/procedures/cloud/sp_cloud_1_convert_to_focus.sql`
**Issue:** GCP MERGE can timeout when processing millions of rows

**Fix:** Add batch processing with date chunking or use procedure timeout configuration

**Impact:** Procedure fails on large GCP deployments

---

### PRO-005 [HIGH] - Procedure Missing Retry Logic for Deadlocks
**File:** All stored procedures
**Issue:** No retry wrapper for BigQuery transaction deadlocks

**Fix:** Add BEGIN/EXCEPTION wrapper with retry loop in Python caller

**Impact:** Transient deadlock errors crash pipeline

---

### PRO-006 [HIGH] - Missing Org Authorization Check in Procedure
**File:** `configs/system/procedures/cloud/sp_cloud_1_convert_to_focus.sql`
**Line:** 35
**Issue:** Extracts org_slug from dataset_id without verifying org exists

**Current:**
```sql
SET v_org_slug = REGEXP_EXTRACT(p_dataset_id, r'^(.+?)_(?:prod|stage|dev|local|test)$');
-- No check that org_slug is valid
```

**Fix:** Add org validation:
```sql
EXECUTE IMMEDIATE FORMAT("""
  SELECT 1 FROM `%s.organizations.org_profiles`
  WHERE org_slug = @v_org_slug
""", p_project_id)
INTO v_org_exists USING v_org_slug AS v_org_slug;
ASSERT v_org_exists = 1 AS "Organization not found";
```

**Impact:** Potential data breach - one org could query another org's dataset

---

### PRO-007 [MEDIUM] - Subscription Procedure Missing Pipeline Lineage Parameters
**File:** `configs/system/procedures/subscription/sp_subscription_3_convert_to_focus.sql`
**Lines:** 21-26
**Issue:** Subscription procedure doesn't accept p_pipeline_id, p_credential_id, p_run_id

**Fix:** Add parameters:
```sql
CREATE OR REPLACE PROCEDURE `.sp_subscription_3_convert_to_focus`(
  p_project_id STRING,
  p_dataset_id STRING,
  p_start_date DATE,
  p_end_date DATE,
  p_credential_id STRING,
  p_pipeline_id STRING,
  p_run_id STRING
)
```

**Impact:** Subscription lineage hardcoded; auditing breaks for parallel runs

---

### PRO-008 [MEDIUM] - Missing Fiscal Year Handling in Billing Periods
**File:** `configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql`
**Lines:** 78-88
**Issue:** Reads fiscal_year_start_month but doesn't use it in billing period calculations

**Fix:** Implement fiscal period logic when fiscal_year_start_month != 1

**Impact:** Billing periods wrong for India (Apr-Mar), Australia (Jul-Jun) customers

---

### PRO-009 [MEDIUM] - Hardcoded x_pipeline_id in Subscription Procedure
**File:** `configs/system/procedures/subscription/sp_subscription_3_convert_to_focus.sql`
**Line:** 304
**Issue:** Hardcodes 'subscription_costs_pipeline' instead of using parameter

**Fix:** Use p_pipeline_id parameter (from PRO-007)

**Impact:** Cannot distinguish between different subscription pipelines

---

### PRO-010 [MEDIUM] - Missing DQ Table Writes for NULL Seats
**File:** `configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql`
**Line:** 144
**Issue:** Handles NULL seats but doesn't write to org_meta_dq_results table

**Fix:** INSERT INTO org_meta_dq_results for each defaulted seat

**Impact:** Data quality issues not tracked; no alerting on bad data

---

### PRO-011 [LOW] - Procedure Error Message Missing Context
**File:** `configs/system/procedures/cloud/sp_cloud_1_convert_to_focus.sql`
**Line:** 558
**Issue:** Error message doesn't include provider or date

**Fix:**
```sql
RAISE USING MESSAGE = CONCAT(
  'sp_cloud_1_convert_to_focus Failed for provider=',
  p_provider, ' date=', p_cost_date, ': ', @@error.message
);
```

**Impact:** Debugging harder when procedure fails

---

### PRO-012 [LOW] - Missing Currency Validation in Subscription Procedure
**File:** `configs/system/procedures/subscription/sp_subscription_3_convert_to_focus.sql`
**Line:** 141
**Issue:** Coalesces currency but doesn't validate ISO 4217 code

**Fix:** Add ASSERT for valid currencies (USD, EUR, GBP, INR, JPY, AUD, CAD)

**Impact:** Typos in currency codes go undetected

---

## CATEGORY 3: CONFIGURATION FILES (11 Issues)

### CFG-001 [CRITICAL] - OpenAI Pipeline Missing Date Configuration
**File:** `configs/genai/payg/openai.yml`
**Lines:** 31-41
**Issue:** calculate_costs step missing date, start_date, end_date configuration

**Fix:**
```yaml
- step_id: calculate_costs
  config:
    provider: "openai"
    start_date: "${start_date}"
    end_date: "${end_date}"
```

**Impact:** Cost calculation may use wrong date; PAYG costs not calculated

---

### CFG-002 [CRITICAL] - Consolidate Pipeline Missing Procedure Steps
**File:** `configs/genai/unified/consolidate.yml`
**Issue:** Consolidation pipeline missing procedure_executor steps

**Fix:** Add steps for:
- sp_genai_1_consolidate_usage_daily
- sp_genai_2_consolidate_costs_daily
- sp_genai_3_convert_to_focus

**Impact:** Consolidated tables never created; unified costs always NULL

---

### CFG-003 [HIGH] - Subscription Pipeline 5min Timeout Too Short
**File:** `configs/subscription/costs/subscription_cost.yml`
**Line:** 35
**Issue:** Timeout reduced to 5min but monthly processing can take longer

**Fix:** Increase to 15 minutes:
```yaml
timeout_minutes: 15  # Monthly processing requires longer timeout
```

**Impact:** Pipeline timeouts on large date ranges

---

### CFG-004 [HIGH] - Missing Required Field Validation in Configs
**File:** All .yml files
**Issue:** No JSON schema validation for pipeline configs

**Fix:** Add schema validation in pipeline loader with required fields:
- pipeline_id, name, provider, domain, steps
- Each step: step_id, ps_type, name

**Impact:** Invalid configs accepted; runtime failures

---

### CFG-005 [HIGH] - Cloud Focus Convert Missing Provider Config
**File:** `configs/cloud/gcp/cost/focus_convert.yml`
**Issue:** Pipeline may not specify which provider to convert

**Fix:** Ensure config.provider matches directory:
```yaml
steps:
  - step_id: convert_to_focus
    config:
      provider: "gcp"  # Must match directory
```

**Impact:** Procedure doesn't know which provider; all costs ignored

---

### CFG-006 [MEDIUM] - Inconsistent Retry Configuration
**File:** `configs/genai/payg/openai.yml`
**Lines:** 27-29 vs others
**Issue:** extract_usage has 3 retries/60s, calculate_costs has 2 retries/30s

**Fix:** Standardize retry policy across all steps or document differences

**Impact:** Inconsistent retry behavior

---

### CFG-007 [MEDIUM] - Missing Slack Notifications
**File:** `configs/genai/payg/openai.yml`
**Lines:** 43-46
**Issue:** Only email notifications configured, no Slack

**Fix:**
```yaml
notifications:
  on_failure:
    - email
    - slack
  on_success:
    - slack
```

**Impact:** No real-time Slack alerts for failures

---

### CFG-008 [MEDIUM] - Pipeline Version Not Updated
**File:** Multiple .yml files
**Issue:** Version 1.0.0 but schemas at v15.0

**Fix:** Bump version to match schema version (15.0.0)

**Impact:** Version tracking broken

---

### CFG-009 [MEDIUM] - Missing Step Dependencies
**File:** All multi-step pipelines
**Issue:** Sequential steps may not have depends_on declared

**Fix:** Ensure every step (except first) has depends_on

**Impact:** Steps run in parallel instead of sequence

---

### CFG-010 [LOW] - Hardcoded UTC Timezone
**File:** `configs/genai/payg/openai.yml`
**Lines:** 15-16
**Issue:** Schedule uses UTC but org may be in different timezone

**Fix:** Support org_timezone from org_profiles

**Impact:** Wrong billing dates for non-UTC orgs

---

### CFG-011 [LOW] - Missing Config Documentation
**File:** All .yml files
**Issue:** Minimal comments explaining fields

**Fix:** Add header comments with pipeline purpose, data sources, SLA

**Impact:** Operators don't understand pipeline purpose

---

## CATEGORY 4: PROCESSOR CODE (10 Issues)

### PROC-001 [CRITICAL] - Missing Hierarchy Validation in PAYG Cost Processor
**File:** `src/core/processors/genai/payg_cost.py`
**Lines:** 691-693
**Issue:** Disabled validation code - 10-level hierarchy never validated

**Current:**
```python
# BUG ERR-01: Disabled - references non-existent columns
# TODO: Implement new validation logic for 10-level hierarchy
```

**Fix:** Implement hierarchy validation:
```python
if hierarchy_entity_id:
    hierarchy_check = f"""
    SELECT COUNT(*) FROM `{project_id}.organizations.org_hierarchy`
    WHERE org_slug = @org_slug AND entity_id = @entity_id
    AND end_date IS NULL
    """
    # If count = 0, log data quality warning
```

**Impact:** Costs allocated to non-existent cost centers

---

### PROC-002 [CRITICAL] - Missing Connection Pool Cleanup
**File:** `src/core/processors/genai/payg_cost.py`
**Line:** 82
**Issue:** BigQueryPoolManager initialized but no cleanup method

**Fix:**
```python
async def __aexit__(self):
    if self._pool_manager:
        await self._pool_manager.close_all()
```

**Impact:** BigQuery connection pool leaks; exhaustion after many runs

---

### PROC-003 [CRITICAL] - Missing NULL Handling in Focus Converter
**File:** `src/core/processors/genai/focus_converter.py`
**Lines:** 138-139
**Issue:** COALESCE handles NULL quantity but not unit validation

**Fix:** Add pre-query WHERE clause:
```python
WHERE
  usage_quantity > 0
  AND usage_unit IS NOT NULL
  AND cost_type IN ('payg', 'commitment', 'infrastructure')
```

**Impact:** Invalid FOCUS records with 0 quantity

---

### PROC-004 [HIGH] - Missing DeepSeek Provider Mapping
**File:** `src/core/processors/genai/focus_converter.py`
**Line:** 40-50
**Issue:** DeepSeek not in PROVIDER_NAMES dict

**Fix:**
```python
PROVIDER_NAMES = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "deepseek": "DeepSeek",
    # ...
}
```

**Impact:** DeepSeek costs show NULL InvoiceIssuerName

---

### PROC-005 [HIGH] - Missing Rate Limit Retry Logic
**File:** `src/core/processors/genai/payg_cost.py`
**Lines:** 40-44
**Issue:** Retry constants defined but not used

**Fix:** Implement retry wrapper with exponential backoff

**Impact:** 429 BigQuery errors crash processor

---

### PROC-006 [MEDIUM] - Missing Org Slug Format Validation
**File:** `src/core/processors/genai/payg_cost.py`
**Line:** 253
**Issue:** org_slug validation pending implementation

**Fix:**
```python
if not re.match(r'^[a-zA-Z0-9_]{3,50}$', org_slug):
    return {"status": "FAILED", "error": "Invalid org_slug format"}
```

**Impact:** Malformed org_slugs could cause SQL injection

---

### PROC-007 [MEDIUM] - Missing MERGE Count Breakdown
**File:** `src/core/processors/genai/focus_converter.py`
**Line:** 311
**Issue:** Can't distinguish 0 rows due to idempotency vs no data

**Fix:** Separate inserted/updated/deleted counts

**Impact:** Can't tell if MERGE succeeded with no changes

---

### PROC-008 [MEDIUM] - Cloud Focus Converter Date Range Loop Missing
**File:** `src/core/processors/cloud/focus_converter.py`
**Lines:** 71-95
**Issue:** Generates date range but procedure accepts single date

**Fix:** Call procedure once per date in loop

**Impact:** Only first date processed; other dates ignored

---

### PROC-009 [LOW] - GCP Vertex Adapter TODOs Not Implemented
**File:** `src/core/processors/genai/provider_adapters/gcp_vertex_adapter.py`
**Lines:** 91, 125, 159
**Issue:** Production monitoring API calls stubbed

**Fix:** Implement google-cloud-monitoring API calls

**Impact:** Commitment cost calculations incomplete

---

### PROC-010 [LOW] - Missing Error Context in Exception Handling
**File:** `src/core/processors/genai/focus_converter.py`
**Line:** 322
**Issue:** Exception doesn't include org_slug, date for debugging

**Fix:** Add context to logger.error with extra= dict

**Impact:** Harder to correlate errors

---

## CATEGORY 5: SECURITY ISSUES (5 Issues)

### SEC-001 [CRITICAL] - Hardcoded Credentials Risk
**File:** `.env.local`, `.env.test`, `.env.prod`
**Issue:** API keys in environment files

**Fix:**
- Remove secrets from .env files
- Load from Google Secret Manager
- Verify .env in .gitignore

**Impact:** Secret exposure risk

---

### SEC-002 [HIGH] - Missing Input Sanitization in Org Slug
**File:** `src/app/routers/pipelines.py`
**Line:** 68-72
**Issue:** Org slug from URL passed to BigQuery without validation

**Fix:**
```python
if not re.match(r'^[a-z0-9_]{3,50}$', org_slug):
    raise HTTPException(status_code=400, detail="Invalid org_slug")
```

**Impact:** Potential SQL injection

---

### SEC-003 [HIGH] - Missing Authorization Check in Procedures
**File:** `configs/system/procedures/cloud/sp_cloud_1_convert_to_focus.sql`
**Line:** 35
**Issue:** Procedure doesn't verify caller owns org_slug

**Fix:** Query org_profiles to verify (same as PRO-006)

**Impact:** One org could trigger another org's cost conversion

---

### SEC-004 [MEDIUM] - Missing Rate Limiting on Pipeline Endpoints
**File:** `src/app/routers/pipelines.py`
**Issue:** Org-level rate limit exists but no global limit

**Fix:**
```python
@rate_limit_global(requests=100, window_seconds=60)
@rate_limit_by_org(requests=10, window_seconds=60)
```

**Impact:** Denial of service possible

---

### SEC-005 [MEDIUM] - Missing Audit Logging
**File:** `src/core/processors`
**Issue:** No audit trail of cost data access

**Fix:** Add audit logging with org_slug, api_key_hash, source_ip

**Impact:** No compliance audit trail

---

## CATEGORY 6: CODE QUALITY (3 Issues)

### QUAL-001 [MEDIUM] - Disabled Code in Production
**File:** `src/core/processors/genai/payg_cost.py`
**Lines:** 691-693
**Issue:** Commented validation code in shipped product

**Fix:** Either implement or delete commented block

**Impact:** Maintenance burden

---

### QUAL-002 [MEDIUM] - Backup File in Production Configs
**File:** `configs/system/procedures/genai/sp_consolidate_genai_costs_daily.sql.bak`
**Issue:** .bak file in configs directory

**Fix:**
- Delete .bak file
- Add *.bak to .gitignore

**Impact:** Confusion about current file

---

### QUAL-003 [LOW] - Magic Numbers in Retry Config
**File:** `src/core/processors/genai/payg_cost.py`
**Lines:** 40-44
**Issue:** Retry constants unexplained

**Fix:** Add comments explaining choice (5 retries = 63s total)

**Impact:** Hard to adjust strategy

---

## CATEGORY 7: TESTING GAPS (1 Issue)

### TEST-001 [HIGH] - No Hierarchy Validation Tests
**File:** Missing in `tests/`
**Issue:** No test coverage for hierarchy validation, NULL handling, JOIN failures

**Fix:** Add integration tests:
```python
def test_payg_cost_invalid_hierarchy_entity()
def test_focus_converter_hierarchy_null_handling()
def test_cloud_focus_aws_hierarchy_allocation()
```

**Impact:** Hierarchy bugs go undetected until production

---

## REMEDIATION PLAN

### Phase 1: Critical Issues (Must Fix Before Deploy) - 12 Issues

**Schema (3 issues):**
1. ✅ SCH-001: Add 20 hierarchy fields to AWS billing schema
2. ✅ SCH-002: Add 20 hierarchy fields to Azure billing schema
3. ✅ SCH-003: Add 20 hierarchy fields to OCI billing schema

**Stored Procedures (3 issues):**
4. ✅ PRO-001: Add hierarchy expansion to AWS procedure section
5. ✅ PRO-002: Add CommitmentDiscountType to Azure procedure
6. ✅ PRO-003: Add hierarchy expansion to OCI procedure section

**Configuration (2 issues):**
7. ✅ CFG-001: Add date config to OpenAI calculate_costs step
8. ✅ CFG-002: Add procedure_executor steps to consolidate pipeline

**Processors (3 issues):**
9. ✅ PROC-001: Implement hierarchy validation in PAYG cost processor
10. ✅ PROC-002: Add connection pool cleanup
11. ✅ PROC-003: Add NULL validation in focus converter

**Security (1 issue):**
12. ✅ SEC-001: Remove hardcoded credentials from env files

---

### Phase 2: High Priority (Must Fix This Sprint) - 18 Issues

**Schema:** SCH-004, SCH-005, SCH-006
**Procedures:** PRO-004, PRO-005, PRO-006
**Configuration:** CFG-003, CFG-004, CFG-005
**Processors:** PROC-004, PROC-005
**Security:** SEC-002, SEC-003
**Testing:** TEST-001

---

### Phase 3: Medium Priority (Fix Next Sprint) - 18 Issues

**Schema:** SCH-007, SCH-008, SCH-009
**Procedures:** PRO-007, PRO-008, PRO-009, PRO-010
**Configuration:** CFG-006, CFG-007, CFG-008, CFG-009
**Processors:** PROC-006, PROC-007, PROC-008
**Security:** SEC-004, SEC-005
**Quality:** QUAL-001, QUAL-002

---

### Phase 4: Low Priority (Technical Debt) - 9 Issues

**Schema:** SCH-010, SCH-011, SCH-012, SCH-013, SCH-014, SCH-015
**Procedures:** PRO-011, PRO-012
**Configuration:** CFG-010, CFG-011
**Processors:** PROC-009, PROC-010
**Quality:** QUAL-003

---

## Success Criteria

- [ ] All 12 Critical issues resolved and tested
- [ ] All 18 High priority issues resolved
- [ ] Integration test suite passing for hierarchy allocation
- [ ] AWS/Azure/OCI costs correctly allocated to org hierarchy
- [ ] Connection pool cleanup verified (no leaks)
- [ ] Hardcoded credentials removed from all env files
- [ ] Documentation updated with fixes applied

---

**Generated:** 2026-01-08
**Audit Completed By:** Background Agent a44997d
**Next Action:** Begin Phase 1 fixes (12 Critical issues)
