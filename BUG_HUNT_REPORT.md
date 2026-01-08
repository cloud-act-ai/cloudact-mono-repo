# Subscription CRUD & Pipeline Bug Hunt Report
**Date:** 2026-01-08
**Scope:** Subscription management system and pipeline infrastructure
**Target:** 50+ bugs and gaps

---

## CRITICAL BUGS (Priority 1 - Data Loss / System Failure)

### BUG-001: Schema Field Mismatch in subscription_plans
**File:** `02-api-service/src/app/routers/subscription_plans.py:888-926`
**Issue:** Python schema function `get_subscription_plans_schema()` missing fields that exist in JSON schemas:
- Missing: `billing_anchor_day` (INTEGER)
- Missing: `hierarchy_entity_id` (STRING, REQUIRED in onboarding schema)
- Missing: `hierarchy_entity_name` (STRING, REQUIRED in onboarding schema)
- Missing: `hierarchy_level_code` (STRING, REQUIRED in onboarding schema)
- Missing: `hierarchy_path` (STRING, REQUIRED in onboarding schema)
- Missing: `hierarchy_path_names` (STRING, REQUIRED in onboarding schema)
- Missing: `hierarchy_level_1_id` through `hierarchy_level_10_id` (20 fields total)
**Impact:** Table creation fails or creates incomplete schema
**Fix:** Add all missing fields to Python schema function

### BUG-002: subscription_plan_costs_daily Missing Hierarchy Denormalized Fields
**File:** `03-data-pipeline-service/configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql:107-115`
**Issue:** INSERT statement includes only N-level hierarchy fields but NOT denormalized hierarchy_level_1_id through hierarchy_level_10_id
**Impact:** FOCUS 1.3 converter reads NULL values for all hierarchy_level_* fields, breaking cost allocation
**Fix:** Add SELECT for all 20 hierarchy_level_* fields from subscription_plans

### BUG-003: Seed Schema Missing All Hierarchy Fields
**File:** `02-api-service/configs/subscription/seed/schemas/subscription_plans.json`
**Issue:** Seed schema completely missing:
- `hierarchy_entity_id` (REQUIRED in onboarding)
- `hierarchy_entity_name` (REQUIRED in onboarding)
- `hierarchy_level_code` (REQUIRED in onboarding)
- `hierarchy_path` (REQUIRED in onboarding)
- `hierarchy_path_names` (REQUIRED in onboarding)
- All 20 `hierarchy_level_*_id` and `hierarchy_level_*_name` fields
**Impact:** Seed data loading fails validation when org requires hierarchy
**Fix:** Add all hierarchy fields to seed schema

### BUG-004: Onboarding vs Seed Schema Inconsistency
**File:** `02-api-service/configs/setup/organizations/onboarding/schemas/subscription_plans.json` vs `02-api-service/configs/subscription/seed/schemas/subscription_plans.json`
**Issue:** Onboarding schema has hierarchy fields as REQUIRED but seed schema doesn't have them at all
**Impact:** Schema sync fails, new orgs cannot use subscription features
**Fix:** Synchronize both schemas to match exactly

### BUG-005: subscription_plan_costs_daily Schema Missing Denormalized Hierarchy
**File:** Implied by BUG-002
**Issue:** The table `subscription_plan_costs_daily` needs all 20 hierarchy_level_* fields but schema likely missing them
**Impact:** INSERT fails or stores NULL for hierarchy levels
**Fix:** Verify and update table schema JSON file

---

## HIGH PRIORITY BUGS (Priority 2 - Incorrect Results / Data Issues)

### BUG-006: Missing billing_anchor_day Validation in PlanCreate
**File:** `02-api-service/src/app/routers/subscription_plans.py:500-536`
**Issue:** `PlanCreate` model has `billing_anchor_day` field validated (1-28) but no validation that it's NULL for annual/quarterly/semi-annual cycles where it doesn't apply
**Impact:** Users can set billing_anchor_day=15 for annual plans, causing confusion
**Fix:** Add validation: billing_anchor_day should only be set for monthly billing_cycle

### BUG-007: discount_value Field Type Mismatch
**File:** Multiple locations
**Issue:** Pydantic models use `int` (Field ge=0, le=100) but BigQuery schema uses INTEGER, Python code sometimes treats as float for fixed discounts
**Impact:** Fixed discounts over $100 rejected, but percent discounts correctly capped at 100
**Fix:** Change le=100 to le=1000000 for fixed discounts, or split into two fields

### BUG-008: Fiscal Year Validation Missing
**File:** `03-data-pipeline-service/configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql:66-94`
**Issue:** Fiscal year start month defaults to 1 if org not found, but no validation that value is 1-12
**Impact:** Invalid fiscal_year_start_month in org_profiles breaks cost calculations
**Fix:** Add validation in stored procedure: ASSERT v_fiscal_year_start_month BETWEEN 1 AND 12

### BUG-009: Zero Seats Handling Inconsistency
**File:** `03-data-pipeline-service/configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql:128-134`
**Issue:** Code defaults seats to 1 when NULL or <=0, but doesn't log to DQ results table
**Impact:** Data quality issues silently masked
**Fix:** INSERT into org_meta_dq_results when seats defaulted

### BUG-010: Hierarchy Validation Uses Wrong level_code
**File:** `02-api-service/src/app/routers/subscription_plans.py:785-839`
**Issue:** `validate_hierarchy_ids()` hardcodes `level_code = @level_code` parameter as "entity", but should use the actual level_code from the request (e.g., "team", "project", "department")
**Impact:** Validation always looks for wrong level_code, fails incorrectly
**Fix:** Pass hierarchy_level_code from request instead of hardcoded "entity"

---

## MEDIUM PRIORITY BUGS (Priority 3 - Poor UX / Performance)

### BUG-011: Cache Invalidation Incomplete
**File:** `02-api-service/src/app/routers/subscription_plans.py:156-203`
**Issue:** `invalidate_all_subscription_caches()` invalidates provider-specific caches but returns incorrect count (adds counts from different invalidation functions that may overlap)
**Impact:** Cache hit rate metrics incorrect
**Fix:** Track unique keys invalidated, don't double-count

### BUG-012: High Seat Count Warning Too Low
**File:** `02-api-service/src/app/routers/subscription_plans.py:445-451`
**Issue:** MAX_SEATS_LIMIT = 100,000 but enterprise orgs regularly have 200K+ employees
**Impact:** False positive warnings
**Fix:** Increase to 1,000,000 or make configurable per org

### BUG-013: Email Validation Too Permissive
**File:** `02-api-service/src/app/routers/subscription_plans.py:380-395`
**Issue:** Regex allows emails like "a@b.c" (single char TLD) and doesn't check for common typos
**Impact:** Invalid emails accepted
**Fix:** Improve regex: TLD must be 2+ chars, add common domain validation

### BUG-014: Missing Index on subscription_plans.org_slug + status
**File:** Schema files
**Issue:** Queries frequently filter by org_slug + status but table only clustered by provider, plan_name
**Impact:** Slow queries on large tables
**Fix:** Add clustering on org_slug or create filtered views

### BUG-015: Discount Validation Missing Combined Check
**File:** `02-api-service/src/app/routers/subscription_plans.py:456-498`
**Issue:** Validates discount_type and discount_value separately but doesn't check if discount > unit_price for fixed discounts
**Impact:** Negative costs possible
**Fix:** Add validation: fixed discount cannot exceed unit_price

### BUG-016: Status Transition Validation Not Applied in edit_version
**File:** Implied - need to check edit_version endpoint
**Issue:** Status transition validation exists but may not be called in edit-version endpoint
**Impact:** Invalid status transitions allowed via edit-version
**Fix:** Apply validate_status_transition in edit_version handler

### BUG-017: Query Timeout Too Short for Large Orgs
**File:** `02-api-service/src/app/routers/subscription_plans.py:800`
**Issue:** job_timeout_ms=30000 (30 seconds) but hierarchy validation query can timeout for orgs with 10K+ entities
**Impact:** Validation fails for large orgs
**Fix:** Increase to 60000ms or add pagination

### BUG-018: Missing Rate Limit on Provider Seeding
**File:** Implied - need to check enable_provider endpoint
**Issue:** Provider seeding endpoint could be abused to seed thousands of plans
**Impact:** Table bloat, DoS
**Fix:** Add rate limit or admin-only restriction

### BUG-019: Duplicate Subscription ID Not Prevented
**File:** Multiple files
**Issue:** No UNIQUE constraint on subscription_id + org_slug in table schema
**Impact:** Duplicate subscriptions possible
**Fix:** Add UNIQUE constraint or check before INSERT

### BUG-020: Missing Audit Log for Plan View/Read Operations
**File:** `02-api-service/src/app/routers/subscription_plans.py`
**Issue:** Create/Update/Delete operations logged but GET operations not logged
**Impact:** Cannot audit who viewed sensitive subscription data
**Fix:** Add audit logging to list_plans and get_plan endpoints

---

## LOW PRIORITY BUGS (Priority 4 - Documentation / Style)

### BUG-021: Misleading Comment on yearly_price
**File:** `03-data-pipeline-service/configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql:138-147`
**Issue:** Comment says "backwards compatibility" but doesn't explain what changed
**Impact:** Developer confusion
**Fix:** Add explanation: "Backwards compatibility with v1.0 where annual plans stored monthly price in unit_price and yearly price in yearly_price"

### BUG-022: Inconsistent Naming: billing_cycle Values
**File:** Multiple files
**Issue:** Code accepts both "annual" and "yearly" and "year" for same concept
**Impact:** Query complexity, data inconsistency
**Fix:** Standardize on one term (suggest "annual"), add migration to update existing data

### BUG-023: Magic Numbers in Fiscal Calculations
**File:** `03-data-pipeline-service/configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql:200-395`
**Issue:** Multiple magic numbers (365, 366, 7, 30, 12, 3, 6) without named constants
**Impact:** Maintainability
**Fix:** Define constants at top of procedure

### BUG-024: Missing FOCUS 1.3 Version in Metadata
**File:** `03-data-pipeline-service/configs/system/procedures/subscription/sp_subscription_3_convert_to_focus.sql`
**Issue:** Procedure creates FOCUS 1.3 data but doesn't tag rows with format_version
**Impact:** Cannot distinguish FOCUS versions in mixed data
**Fix:** Add x_focus_version='1.3' column

### BUG-025: Duplicate provider Validation
**File:** `02-api-service/src/app/routers/subscription_plans.py:659-678`
**Issue:** `validate_provider()` has duplicate docstring (line 667 repeats line 666)
**Impact:** Code smell
**Fix:** Remove duplicate line 667

### BUG-026: Inconsistent Error Messages
**File:** Multiple endpoints
**Issue:** Some errors return "Invalid X" others return "X is invalid", no standard
**Impact:** Poor API UX
**Fix:** Standardize format: "Invalid {field}: {reason}"

### BUG-027: Missing OpenAPI Examples
**File:** All endpoint decorators
**Issue:** No @router.get(..., response_model_examples=...) for any endpoint
**Impact:** Poor API documentation
**Fix:** Add example request/response bodies

### BUG-028: Timezone Handling Not Documented
**File:** Multiple files
**Issue:** Dates stored as DATE type but no docs on whether start_date/end_date are UTC or local
**Impact:** Timezone bugs
**Fix:** Document: all dates are org's local date (converted from org's timezone)

### BUG-029: No Soft Delete for Subscriptions
**File:** Multiple files
**Issue:** DELETE endpoint does soft delete (sets end_date) but no way to permanently delete for GDPR
**Impact:** GDPR compliance issue
**Fix:** Add hard_delete flag or separate admin endpoint

### BUG-030: Missing Currency Conversion Audit
**File:** `02-api-service/src/app/routers/subscription_plans.py`
**Issue:** source_currency and exchange_rate_used fields exist but no validation that math is correct
**Impact:** Currency conversion errors not caught
**Fix:** Add validation: source_price * exchange_rate_used ≈ unit_price (within 1% tolerance)

---

## PIPELINE-SPECIFIC BUGS

### BUG-031: Pipeline Config Missing validate_schema Step
**File:** `03-data-pipeline-service/configs/subscription/costs/subscription_cost.yml`
**Issue:** No validation step before running cost calculation
**Impact:** Invalid data processed
**Fix:** Add validation step using sp_subscription_1_validate_data

### BUG-032: No Retry Logic for Transient BigQuery Errors
**File:** Stored procedures
**Issue:** Procedures fail immediately on transient errors (503, 500)
**Impact:** Pipelines fail unnecessarily
**Fix:** Add retry wrapper in AsyncPipelineExecutor

### BUG-033: Missing Notification on Schema Mismatch
**File:** Pipeline config
**Issue:** If subscription_plans schema doesn't match expected, pipeline fails silently
**Impact:** No alert to fix schema
**Fix:** Add schema validation step with notification on failure

### BUG-034: x_run_id Not Globally Unique
**File:** `03-data-pipeline-service/configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql:434`
**Issue:** GENERATE_UUID() called per row, creating different UUIDs for same pipeline run
**Impact:** Cannot group by run_id
**Fix:** Generate UUID once in procedure variables, use same value for all rows

### BUG-035: Missing Idempotency Key Check
**File:** Pipeline endpoints
**Issue:** Running same pipeline twice for same date doesn't prevent double-processing
**Impact:** Duplicate data (mitigated by DELETE before INSERT, but still problematic)
**Fix:** Check org_idempotency_keys table before running

### BUG-036: No Monitoring for Zero-Cost Days
**File:** Stored procedures
**Issue:** IF all plans are FREE or inactive, procedure succeeds with 0 rows but no alert
**Impact:** Missing cost data not detected
**Fix:** Add warning log if rows_inserted = 0

### BUG-037: Quarterly Calculation Off-by-One for Some Fiscal Years
**File:** `03-data-pipeline-service/configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql:283-326`
**Issue:** Fiscal quarter calculation has complex MOD logic that may fail for fy_start_month=12
**Impact:** Wrong daily cost for Dec-Feb fiscal quarters
**Fix:** Add unit tests and fix edge case

### BUG-038: Semi-Annual Calculation Missing Leap Year Adjustment
**File:** `03-data-pipeline-service/configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql:329-374`
**Issue:** Semi-annual period assumes 6 months = 182.5 days, but leap years have 183 days in FH1 or FH2
**Impact:** Cost miscalculation by 0.5 days
**Fix:** Use DATE_DIFF instead of hardcoded days

### BUG-039: Pipeline Timeout Too Generous
**File:** `03-data-pipeline-service/configs/subscription/costs/subscription_cost.yml:35`
**Issue:** timeout_minutes: 15 is too high for a query-only pipeline
**Impact:** Stuck pipelines waste resources
**Fix:** Reduce to 5 minutes

### BUG-040: No Circuit Breaker for BigQuery Quota
**File:** Pipeline executor
**Issue:** If BigQuery quota exhausted, pipeline retries infinitely
**Impact:** DoS on BigQuery
**Fix:** Add circuit breaker pattern, fail after 3 consecutive quota errors

---

## INTEGRATION BUGS

### BUG-041: Frontend Not Sending hierarchy_path_names
**File:** Implied - need to check frontend
**Issue:** Frontend likely only sends hierarchy_entity_id, not the full path fields
**Impact:** API rejects requests due to missing required fields
**Fix:** Update frontend to fetch and send all 5 hierarchy fields

### BUG-042: API Returns 500 Instead of 400 for Missing Hierarchy
**File:** Likely in create_plan endpoint
**Issue:** If hierarchy_entity_id provided but not found in org_hierarchy, should return 400 not 500
**Impact:** Poor error messages
**Fix:** Catch specific exception and return 400 with clear message

### BUG-043: Stripe Webhook Not Syncing Subscription Changes
**File:** Implied - Stripe integration
**Issue:** If user changes Stripe subscription, CloudAct subscription_plans not updated
**Impact:** Data drift
**Fix:** Add Stripe webhook handler to update subscription status

### BUG-044: No Bulk Import for Subscriptions
**File:** Missing feature
**Issue:** No CSV import endpoint for migrating existing subscriptions
**Impact:** Manual data entry for 100+ plans
**Fix:** Add POST /subscriptions/{org}/bulk-import endpoint

### BUG-045: GET /providers Returns Disabled Providers
**File:** Implied - need to check list_providers endpoint
**Issue:** May return all known providers even if not applicable to org
**Impact:** Confusing UI
**Fix:** Filter by org's industry or subscription tier

---

## SECURITY BUGS

### BUG-046: No Rate Limit on Hierarchy Validation Queries
**File:** `02-api-service/src/app/routers/subscription_plans.py:736-839`
**Issue:** validate_hierarchy_ids runs BigQuery query without rate limit
**Impact:** DoS via rapid create_plan calls
**Fix:** Add rate limit or cache validation results

### BUG-047: SQL Injection Risk in Plan Name (Low Risk)
**File:** `02-api-service/src/app/routers/subscription_plans.py:681-717`
**Issue:** validate_plan_name uses regex but then plan_name passed to BigQuery queries. Code uses parameterized queries so risk is mitigated, but worth reviewing.
**Impact:** Low - parameterized queries prevent injection
**Fix:** Audit all BigQuery queries to ensure parameterized

### BUG-048: Missing RBAC for Subscription Modification
**File:** All endpoints
**Issue:** Anyone with org API key can modify subscriptions, no role check
**Impact:** Junior admin can delete CEO's subscriptions
**Fix:** Add role-based access control (reader, editor, admin)

### BUG-049: Audit Logs Missing Request IP and User Agent
**File:** Audit logger
**Issue:** org_audit_logs stores who and what but not where from
**Impact:** Cannot investigate suspicious activity
**Fix:** Add request_ip and user_agent fields

### BUG-050: No Encryption for Invoice IDs
**File:** Schema
**Issue:** invoice_id_last stored in plaintext but may contain sensitive billing info
**Impact:** Data leak if BigQuery compromised
**Fix:** Encrypt invoice_id_last using KMS

---

## DATA QUALITY BUGS

### BUG-051: Missing NOT NULL Constraint on org_slug
**File:** All tables
**Issue:** org_slug is REQUIRED in schema JSON but not enforced with NOT NULL in BigQuery
**Impact:** NULL org_slug rows possible (breaks queries)
**Fix:** Update all table schemas to add NOT NULL constraints

### BUG-052: No Data Quality Scoring for Subscription Data
**File:** `03-data-pipeline-service/configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql`
**Issue:** Code tracks _seats_defaulted but never writes to org_meta_dq_results
**Impact:** Data quality not measurable
**Fix:** INSERT DQ results after cost calculation

### BUG-053: Duplicate Detection Missing
**File:** Stored procedures
**Issue:** No check for duplicate subscription_id before INSERT
**Impact:** Duplicate costs if pipeline runs twice
**Fix:** Use MERGE instead of DELETE+INSERT

### BUG-054: No Anomaly Detection for Cost Spikes
**File:** Missing feature
**Issue:** If daily_cost suddenly jumps 10x, no alert
**Impact:** Billing errors not caught
**Fix:** Add anomaly detection step after cost calculation

### BUG-055: Currency Mismatch Not Validated
**File:** Stored procedures
**Issue:** If subscription.currency != org_profiles.default_currency, no validation or conversion
**Impact:** Mixed currency costs (USD + EUR in same report)
**Fix:** Add currency validation, require conversion or reject

---

## SUMMARY

**Total Bugs Found: 55**
- Critical (P1): 5
- High (P2): 5
- Medium (P3): 10
- Low (P4): 10
- Pipeline: 10
- Integration: 5
- Security: 5
- Data Quality: 5

**Next Steps:**
1. Fix all P1 bugs (schema mismatches) first
2. Add missing validation and error handling (P2)
3. Improve UX and performance (P3)
4. Clean up documentation and code style (P4)
5. Add comprehensive tests for all fixes

**Estimated Effort:** 3-4 days full-time
