# Demo Account Bug Hunt - Final Report
**Date:** 2026-01-08
**Status:** ✅ ANALYSIS COMPLETE - 🔴 CRITICAL BUGS FOUND
**Scope:** Hierarchy consistency, GenAI pricing, demo data quality

---

## Executive Summary

Comprehensive bug hunt revealed **3 CRITICAL ISSUES**:

1. ❌ **GenAI Pricing Missing org_slug** (BUG #1) - FIXED ✅
2. ❌ **GenAI Hierarchy Assignment Missing** (BUG #2) - NOT IMPLEMENTED 🔴
3. ❌ **Cloud Hierarchy from Tags Undocumented** (BUG #3) - MISSING PROCESS 🟡

---

## Bug #1: GenAI Pricing CSV Missing org_slug ✅ FIXED

**Severity:** 🔴 CRITICAL (blocks GenAI cost calculations)

**Issue:** `genai_payg_pricing.csv` missing required `org_slug` field

**Fix Applied:**
- Created `fix_genai_pricing_for_org.sh` script
- Updated `load-demo-data-direct.ts` to use script automatically
- **Status:** ✅ PERMANENTLY FIXED

**Files Changed:**
- `04-inra-cicd-automation/load-demo-data/scripts/fix_genai_pricing_for_org.sh` ✨ NEW
- `01-fronted-system/tests/demo-setup/load-demo-data-direct.ts` (Lines 204-213)

---

## Bug #2: GenAI Hierarchy Assignment Missing 🔴 NOT IMPLEMENTED

**Severity:** 🔴 CRITICAL (no hierarchy in production)

**Issue:** No production mechanism to assign hierarchy to GenAI usage

### Current State

**Demo Data (Cheating):**
```json
{
  "model": "gpt-4o",
  "hierarchy_level_1_id": "DEPT-CIO",  // PRE-FILLED (not from API!)
  ...
}
```

**Production Reality:**
- OpenAI/Anthropic/Gemini APIs return: model, tokens, timestamp
- **APIs DO NOT return hierarchy** - it must be assigned by CloudAct
- **Currently: NO CODE to assign hierarchy**

### Impact

**Without Fix:**
- All GenAI costs have NULL hierarchy in production
- Cost allocation dashboards show "Unallocated" for GenAI
- Users cannot drill down by Department/Project/Team

### Required Fix

**Option 1: Credential-Level Hierarchy (RECOMMENDED)**

1. Extend `org_integration_credentials` schema:
```json
{
  "name": "default_hierarchy_level_1_id",
  "type": "STRING",
  "mode": "NULLABLE",
  "description": "Default hierarchy for all usage from this integration"
},
...  // Add level_2_id through level_10_id
```

2. Update Integration Setup UI:
```tsx
<CascadingHierarchySelector
  orgSlug={orgSlug}
  value={hierarchyValue}
  onChange={setHierarchyValue}
/>
```

3. Modify GenAI Processors:
```python
# In OpenAI/Anthropic/Gemini processors
credential = get_credential(credential_id)

for usage_record in api_response:
    usage_record['hierarchy_level_1_id'] = credential.get('default_hierarchy_level_1_id')
    usage_record['hierarchy_level_1_name'] = hierarchy_lookup(credential.get('default_hierarchy_level_1_id'))
    ...
```

**Option 2: Post-Ingestion Tagging UI**
- Dashboard to view unallocated GenAI usage
- Bulk hierarchy assignment tool
- More manual but faster to implement

### Estimated Effort

- Schema changes: 1 day
- UI updates: 2 days
- Processor changes: 2 days
- Testing: 1 day
- **Total: 1 week**

---

## Bug #3: Cloud Hierarchy from Tags Undocumented 🟡 MISSING PROCESS

**Severity:** 🟡 MEDIUM (works if users tag resources, but no guidance)

**Issue:** Stored procedure expects GCP labels, but no documentation on how to tag resources

### Current Architecture

**Stored Procedure Logic:**
```sql
LEFT JOIN hierarchy_lookup h ON h.entity_id = COALESCE(
  JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.cost_center'),
  JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.team'),
  JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.department'),
  JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.entity_id')
)
```

**Reality:**
- Procedure is CORRECT - it CAN extract hierarchy from GCP labels
- But there's NO documentation telling users HOW to tag resources
- Demo data bypasses this by pre-filling hierarchy

### Impact

**Without Documentation:**
- Cloud costs have NULL hierarchy unless users manually tag GCP resources
- Most users won't know they need to add labels
- Inconsistent cost allocation

### Required Fix

**Create Admin Guide:**

```markdown
# GCP Resource Labeling for Hierarchy

To enable cost allocation by hierarchy, tag your GCP resources with one of:
- `entity_id`: Full hierarchy entity ID (e.g., TEAM-INFRA)
- `cost_center`: Department code (e.g., DEPT-CIO)
- `team`: Team code (e.g., TEAM-DATA)
- `department`: Department name

## Compute Engine
gcloud compute instances add-labels my-instance \
  --labels=entity_id=TEAM-INFRA

## Cloud Storage
gsutil label ch -l entity_id:TEAM-DATA gs://my-bucket

## BigQuery
bq update --set_label entity_id:TEAM-DATA project:dataset.table
```

### Estimated Effort

- Documentation: 1 day
- Validation script: 1 day
- Default fallback logic: 1 day
- **Total: 3 days**

---

## Subscription Plans UI: ✅ VERIFIED CORRECT

**Status:** ✅ All 10 levels supported

**Component:** `CascadingHierarchySelector`

**Verification:**
```tsx
{levels.map((level, index) => {  // Dynamically renders ALL levels
  return <Select ... />
})}
```

**Finding:** UI dynamically renders dropdowns for all hierarchy levels returned by backend. Supports 3, 10, or any number of levels.

---

## Complete Hierarchy Flow Analysis

### 1. Subscription Costs ✅ WORKING

```
UI Form (CascadingHierarchySelector)
   ↓ User selects hierarchy (up to 10 levels)
subscription_plans.csv / API
   ↓ hierarchy_level_1_id...hierarchy_level_10_id
subscription_plan_costs_daily
   ↓ sp_subscription_3_convert_to_focus
cost_data_standard_1_3 (x_hierarchy_level_*)
```

**Status:** ✅ COMPLETE - No changes needed

---

### 2. Cloud Costs 🟡 WORKS BUT UNDOCUMENTED

```
GCP Resources (labeled by user)
   ↓ labels: entity_id=TEAM-INFRA
GCP Billing Export
   ↓ labels_json field
cloud_gcp_billing_raw_daily
   ↓ Procedure extracts entity_id from JSON
   ↓ LEFT JOIN org_hierarchy
cost_data_standard_1_3 (x_hierarchy_level_*)
```

**Status:** 🟡 CODE WORKS - Need documentation + validation

**Action Required:**
1. Create GCP labeling guide
2. Add validation for invalid entity_ids
3. Implement default hierarchy for untagged resources

---

### 3. GenAI Costs 🔴 NOT IMPLEMENTED

```
OpenAI/Anthropic/Gemini API
   ↓ Returns: model, tokens, timestamp (NO HIERARCHY!)
GenAI Processor
   ↓ ❌ MISSING: Code to assign hierarchy
genai_payg_usage_raw
   ↓ hierarchy_level_* fields = NULL
   ↓ Flows to daily costs and FOCUS with NULL hierarchy
cost_data_standard_1_3 (x_hierarchy_level_* = NULL)
```

**Status:** 🔴 NOT IMPLEMENTED - Demo data pre-fills hierarchy

**Action Required:**
1. Extend org_integration_credentials with hierarchy fields
2. Update integration setup UI to capture hierarchy
3. Modify processors to populate hierarchy from credential

---

## Demo vs Production Reality

| Domain | Demo Data | Production Reality | Status |
|--------|-----------|-------------------|--------|
| **Subscription** | ✅ Hierarchy in CSV | ✅ Hierarchy from UI form | ✅ WORKING |
| **Cloud** | ❌ Hierarchy pre-filled | 🟡 From GCP labels (undocumented) | 🟡 NEEDS DOCS |
| **GenAI** | ❌ Hierarchy pre-filled | 🔴 NO MECHANISM | 🔴 NOT IMPLEMENTED |

---

## Priority Recommendations

### CRITICAL (Week 1)

1. **Implement GenAI Hierarchy Assignment** 🔴 HIGH
   - Extend `org_integration_credentials` schema
   - Update integration setup UI
   - Modify GenAI processors
   - **Impact:** Enables production GenAI cost allocation

2. **Document Cloud Resource Tagging** 🟡 MEDIUM
   - Create admin guide for GCP labeling
   - Add validation for entity_ids
   - Implement default fallback hierarchy
   - **Impact:** Ensures cloud costs have hierarchy

### ENHANCEMENTS (Week 2-3)

3. **Post-Ingestion Hierarchy Tagging UI**
   - Dashboard for unallocated costs
   - Bulk hierarchy assignment tool
   - **Impact:** Allows retroactive hierarchy assignment

4. **Hierarchy Validation & Alerts**
   - Alert when >20% costs unallocated
   - Validate entity_ids exist in org_hierarchy
   - **Impact:** Proactive cost allocation monitoring

---

## Files Created During Bug Hunt

1. `00-requirements-specs/DEMO_ACCOUNT_BUG_FIXES_2026-01-08.md` - GenAI pricing fix
2. `00-requirements-specs/HIERARCHY_ASSIGNMENT_ARCHITECTURE_2026-01-08.md` - Complete analysis
3. `00-requirements-specs/BUG_HUNT_FINAL_REPORT_2026-01-08.md` - This summary
4. `04-inra-cicd-automation/load-demo-data/scripts/fix_genai_pricing_for_org.sh` - Pricing fix script

---

## Next Steps

### Immediate (Today)
- [x] Complete bug hunt analysis
- [ ] Review findings with team
- [ ] Prioritize bug fixes

### This Week
- [ ] Implement GenAI hierarchy assignment (Option 1 recommended)
- [ ] Create GCP resource labeling documentation
- [ ] Add default hierarchy fallback for untagged resources

### Next Week
- [ ] Build post-ingestion tagging UI
- [ ] Add hierarchy validation alerts
- [ ] Update demo data to match production logic

---

## Conclusion

**Key Findings:**
1. ✅ Subscription hierarchy: WORKING
2. 🟡 Cloud hierarchy: CODE WORKS, need docs
3. 🔴 GenAI hierarchy: NOT IMPLEMENTED, critical gap

**Recommended Action:**
**Implement GenAI hierarchy assignment BEFORE production deployment.** Without this, all GenAI costs will show as "Unallocated" in dashboards.

**Estimated Total Effort:**
- GenAI fixes: 1 week
- Cloud documentation: 3 days
- **Total: ~2 weeks for production-ready hierarchy**

---

**Prepared by:** Claude AI
**Date:** 2026-01-08
**Status:** ⏳ Awaiting Team Review & Prioritization
