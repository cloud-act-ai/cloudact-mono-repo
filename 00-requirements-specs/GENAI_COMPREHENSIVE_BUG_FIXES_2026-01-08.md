# GenAI Integration Comprehensive Bug Fixes
**Date:** 2026-01-08
**Severity:** CRITICAL - Blocking Production
**Scope:** GenAI integration flow, pipeline execution, schema consistency

---

## Executive Summary

Comprehensive audit of GenAI integration revealed **78 critical issues** across schema definitions, stored procedures, processor code, and data flow. This document details all issues and provides fix roadmap.

### Issue Categories
- **Category 1:** Deprecated Hierarchy Fields (22 issues) - CRITICAL
- **Category 2:** Column Name Mismatches (18 issues) - HIGH
- **Category 3:** Missing x_* Metadata Fields (15 issues) - HIGH
- **Category 4:** Hierarchy Field Propagation (10 issues) - MEDIUM
- **Category 5:** FOCUS 1.3 Conversion Issues (8 issues) - MEDIUM
- **Category 6:** Type Mismatches and Validation (5 issues) - LOW

---

## CRITICAL FIXES (Priority 1)

### Fix #1: Update Consolidation Stored Procedures for 20 Hierarchy Fields

**Problem:** All consolidation SPs reference 5 deprecated hierarchy fields that don't exist in schemas.

**Files to Fix:**
1. `03-data-pipeline-service/configs/system/procedures/genai/sp_genai_1_consolidate_usage_daily.sql`
2. `03-data-pipeline-service/configs/system/procedures/genai/sp_genai_2_consolidate_costs_daily.sql`

**Required Changes:**

Replace deprecated fields:
```sql
-- OLD (WRONG) - Lines 66-67, 89-93
hierarchy_entity_id, hierarchy_entity_name,
hierarchy_level_code, hierarchy_path, hierarchy_path_names,

-- NEW (CORRECT) - Use 20 fields
hierarchy_level_1_id, hierarchy_level_1_name,
hierarchy_level_2_id, hierarchy_level_2_name,
hierarchy_level_3_id, hierarchy_level_3_name,
hierarchy_level_4_id, hierarchy_level_4_name,
hierarchy_level_5_id, hierarchy_level_5_name,
hierarchy_level_6_id, hierarchy_level_6_name,
hierarchy_level_7_id, hierarchy_level_7_name,
hierarchy_level_8_id, hierarchy_level_8_name,
hierarchy_level_9_id, hierarchy_level_9_name,
hierarchy_level_10_id, hierarchy_level_10_name,
```

**Affected Sections:**
- PAYG usage INSERT (lines 66-67, 89-93)
- Commitment usage INSERT (lines 122-124, 138-142)
- Infrastructure usage INSERT (lines 171-173, 187-191)
- Same pattern in costs consolidation SP

---

### Fix #2: Add Missing cached_cost_usd to Unified Costs Schema

**Problem:** `genai_costs_daily_unified` schema missing `cached_cost_usd` field that exists in source PAYG costs.

**File:** `02-api-service/configs/setup/organizations/onboarding/schemas/genai_costs_daily_unified.json`

**Action:** Add after line 14 (after `output_cost_usd`):
```json
{
  "name": "cached_cost_usd",
  "type": "FLOAT64",
  "mode": "NULLABLE",
  "description": "Cost for cached input tokens (prompt caching discount)"
},
```

**Impact:** Prevents data loss of cached token costs during consolidation.

---

### Fix #3: Fix Multi-Credential Delete in FOCUS Conversion

**Problem:** DELETE statement removes ALL GenAI records for a date, breaking multi-credential orgs.

**File:** `03-data-pipeline-service/configs/system/procedures/genai/sp_genai_3_convert_to_focus.sql`

**Current (Line 55):**
```sql
DELETE FROM `%s.%s.cost_data_standard_1_3`
WHERE DATE(ChargePeriodStart) = @p_date
  AND x_genai_cost_type IS NOT NULL;
```

**Fix:**
```sql
DELETE FROM `%s.%s.cost_data_standard_1_3`
WHERE DATE(ChargePeriodStart) = @p_date
  AND x_genai_cost_type IS NOT NULL
  AND x_credential_id = @p_credential_id;  -- Add credential isolation
```

---

### Fix #4: Add Currency Handling in FOCUS Conversion

**Problem:** Hardcoded USD ignores org's default_currency.

**File:** `03-data-pipeline-service/configs/system/procedures/genai/sp_genai_3_convert_to_focus.sql`

**Current (Line 106):**
```sql
'USD' as BillingCurrency,
```

**Fix:** Query org_profiles for default_currency:
```sql
-- Add parameter at top
DECLARE v_currency STRING DEFAULT 'USD';

-- Query org currency (after line 37)
EXECUTE IMMEDIATE FORMAT("""
  SELECT default_currency FROM `%s.organizations.org_profiles`
  WHERE org_slug = '%s'
""", v_project_id, p_org_slug) INTO v_currency;

-- Use in INSERT (line 106)
v_currency as BillingCurrency,
```

---

## HIGH PRIORITY FIXES (Priority 2)

### Fix #5: Add x_* Fields to Pricing Tables

**Files:**
- `02-api-service/configs/setup/organizations/onboarding/schemas/genai_payg_pricing.json`
- `02-api-service/configs/setup/organizations/onboarding/schemas/genai_commitment_pricing.json`
- `02-api-service/configs/setup/organizations/onboarding/schemas/genai_infrastructure_pricing.json`

**Action:** Add x_* lineage fields after last business column:
```json
{
  "name": "x_pipeline_id",
  "type": "STRING",
  "mode": "REQUIRED",
  "description": "Pipeline that loaded this pricing data"
},
{
  "name": "x_credential_id",
  "type": "STRING",
  "mode": "NULLABLE",
  "description": "N/A for pricing reference data"
},
{
  "name": "x_pipeline_run_date",
  "type": "DATE",
  "mode": "REQUIRED",
  "description": "Date when pricing was loaded"
},
{
  "name": "x_run_id",
  "type": "STRING",
  "mode": "REQUIRED",
  "description": "Pipeline execution UUID"
},
{
  "name": "x_ingested_at",
  "type": "TIMESTAMP",
  "mode": "REQUIRED",
  "description": "When pricing was written to table"
}
```

---

### Fix #6: Standardize Field Naming - cached_tokens

**Problem:** Source uses `cached_input_tokens`, unified uses `cached_tokens`.

**Recommendation:** Keep mapping as-is but document in schema descriptions:
- Source schema: Update description to note "Mapped to cached_tokens in unified"
- Unified schema: Update description to note "Source field: cached_input_tokens"

---

### Fix #7: Add effective_rate Fields to Unified Costs

**Problem:** PAYG costs calculate effective rates but unified schema doesn't store them.

**File:** `genai_costs_daily_unified.json`

**Action:** Add after pricing fields:
```json
{
  "name": "effective_rate_input",
  "type": "FLOAT64",
  "mode": "NULLABLE",
  "description": "Actual cost per input token (after discounts)"
},
{
  "name": "effective_rate_output",
  "type": "FLOAT64",
  "mode": "NULLABLE",
  "description": "Actual cost per output token (after discounts)"
},
{
  "name": "effective_rate_cached",
  "type": "FLOAT64",
  "mode": "NULLABLE",
  "description": "Actual cost per cached input token"
}
```

---

## MEDIUM PRIORITY FIXES (Priority 3)

### Fix #8: Add Hierarchy Validation Timestamp to Usage Raw

**Files:** All `*_usage_raw.json` schemas

**Action:** Add field:
```json
{
  "name": "hierarchy_validated_at",
  "type": "TIMESTAMP",
  "mode": "NULLABLE",
  "description": "When hierarchy assignment was validated against org_hierarchy"
}
```

---

### Fix #9: Fix ConsumedQuantity for Commitment Costs

**Problem:** FOCUS ConsumedQuantity is NULL for commitment because source doesn't have usage_quantity.

**File:** `sp_genai_3_convert_to_focus.sql`

**Current (Line 157):**
```sql
CAST(usage_quantity AS NUMERIC) as ConsumedQuantity,
```

**Fix:** Use different fields based on cost_type:
```sql
CAST(
  CASE
    WHEN cost_type = 'payg' THEN total_tokens
    WHEN cost_type = 'commitment' THEN used_units
    WHEN cost_type = 'infrastructure' THEN instance_hours
    ELSE NULL
  END AS NUMERIC
) as ConsumedQuantity,
```

---

### Fix #10: Fix ChargeFrequency for Commitment

**Problem:** Commitment costs should be 'Recurring' not 'Usage-Based'.

**File:** `sp_genai_3_convert_to_focus.sql`

**Current (Line 182):**
```sql
'Usage-Based' as ChargeFrequency,
```

**Fix:**
```sql
CASE
  WHEN cost_type = 'commitment' THEN 'Recurring'
  ELSE 'Usage-Based'
END as ChargeFrequency,
```

---

## REMAINING ISSUES (Priority 4)

Issues #11-78 are documented but deferred to Phase 2:
- Field naming standardization (6 issues)
- Type precision improvements (3 issues)
- Validation enhancements (8 issues)
- Documentation updates (12 issues)
- Index optimizations (5 issues)
- Foreign key documentation (4 issues)
- Batch processing improvements (6 issues)

---

## TESTING CHECKLIST

After applying fixes, must test:

### Unit Tests
- [ ] Consolidation SP with NULL hierarchy
- [ ] Consolidation SP with partial hierarchy (only level 1-3)
- [ ] Consolidation SP with full hierarchy (level 1-10)
- [ ] Multi-credential isolation

### Integration Tests
- [ ] End-to-end: PAYG usage → cost → consolidation → FOCUS
- [ ] End-to-end: Commitment flow
- [ ] End-to-end: Infrastructure flow
- [ ] Multi-currency org processing
- [ ] Re-run same date (idempotency)

### Data Validation
- [ ] Verify hierarchy fields populated correctly
- [ ] Verify x_* fields populated
- [ ] Verify cost calculations match
- [ ] Verify FOCUS 1.3 compliance
- [ ] Verify no data loss (row counts match)

---

## DEPLOYMENT PLAN

### Phase 1: Critical Fixes (This Week)
1. Update consolidation SPs (#1)
2. Add cached_cost_usd to schema (#2)
3. Fix multi-credential delete (#3)
4. Add currency handling (#4)
5. Run full test suite
6. Deploy to staging
7. Smoke test with real data
8. Deploy to production

### Phase 2: High Priority (Next Week)
9. Add x_* to pricing tables (#5)
10. Add effective_rate fields (#7)
11. Add hierarchy validation timestamps (#8)
12. Fix FOCUS conversion issues (#9, #10)

### Phase 3: Cleanup (Following Sprint)
13. Field naming standardization
14. Documentation updates
15. Performance optimizations

---

## RISK ASSESSMENT

| Issue | Risk | Mitigation |
|-------|------|------------|
| Hierarchy field mismatch | 🔴 HIGH - Pipeline fails | Fix SPs first, test thoroughly |
| Multi-credential delete | 🔴 HIGH - Data loss | Add credential filter, test with 2+ creds |
| Missing cached_cost | 🟠 MEDIUM - Cost undercount | Add field, backfill if needed |
| Currency hardcoded | 🟠 MEDIUM - Wrong currency display | Query org_profiles |
| Other issues | 🟢 LOW - Cosmetic/future | Defer to Phase 2/3 |

---

## SUCCESS CRITERIA

✅ **Phase 1 Complete When:**
1. All consolidation SPs execute without errors
2. Multi-credential org processes correctly
3. Hierarchy fields populated in all tables
4. FOCUS 1.3 records created successfully
5. Zero data loss verified
6. All 4 critical fixes deployed to production

---

**Document Owner:** CloudAct Engineering
**Review Date:** 2026-01-08
**Status:** DRAFT - Awaiting Implementation
