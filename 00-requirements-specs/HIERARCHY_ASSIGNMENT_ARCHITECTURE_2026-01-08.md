# Hierarchy Assignment Architecture - Complete Analysis
**Date:** 2026-01-08
**Status:** 🔴 CRITICAL GAPS FOUND
**Scope:** How hierarchy flows from source systems to FOCUS 1.3

---

## Executive Summary

**CRITICAL FINDING:** Demo data has hierarchy pre-populated ("cheating"), but production hierarchy assignment logic is **INCOMPLETE** for GenAI and Cloud costs.

### Key Issues Found:
1. ✅ **Subscription Plans**: Hierarchy properly assigned via UI form
2. 🔴 **Cloud Costs**: Stored procedure expects GCP labels, but no process to add labels to resources
3. 🔴 **GenAI Costs**: NO production mechanism to assign hierarchy (demo data pre-fills it)

---

## Complete Hierarchy Flow by Domain

### 1. Subscription Costs ✅ WORKING

```
UI Form (subscription plan creation)
   ↓ User selects hierarchy entity
subscription_plans table (hierarchy_level_1_id...hierarchy_level_10_id)
   ↓ sp_subscription_2_calculate_daily_costs
subscription_plan_costs_daily (hierarchy copied)
   ↓ sp_subscription_3_convert_to_focus
cost_data_standard_1_3 (x_hierarchy_level_1_id...x_hierarchy_level_10_id)
```

**Status:** ✅ Complete - UI captures all 10 levels, flows correctly

**Demo Data Example:**
```csv
ChatGPT Team,DEPT-CIO,Group CIO,PROJ-CTO,Engineering,TEAM-DATA,Data
```

---

### 2. Cloud Costs 🔴 INCOMPLETE

#### Current Architecture (Theoretical)

```
GCP Resource Labels (labels_json)
   ↓ User tags resources with: cost_center, team, department, or entity_id
cloud_gcp_billing_raw_daily (labels_json field)
   ↓ sp_cloud_1_convert_to_focus
   ↓ LEFT JOIN hierarchy_lookup ON JSON_EXTRACT(labels_json, '$.entity_id')
cost_data_standard_1_3 (x_hierarchy_level_*... from org_hierarchy)
```

#### Production Gap 🔴

**Problem:** The stored procedure expects hierarchy from GCP resource labels:

```sql
-- From sp_cloud_1_convert_to_focus.sql
LEFT JOIN hierarchy_lookup h ON h.entity_id = COALESCE(
  JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.cost_center'),
  JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.team'),
  JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.department'),
  JSON_EXTRACT_SCALAR(SAFE.PARSE_JSON(b.labels_json), '$.entity_id')  -- Hierarchy entity ID
)
```

**But there's NO process to:**
1. Tag GCP resources with hierarchy entity IDs
2. Ensure tags are in correct format
3. Handle untagged resources
4. Validate entity IDs exist in org_hierarchy

#### Demo Data Workaround (Cheating)

Demo data bypasses the problem by pre-populating hierarchy:

```json
{
  "labels_json": "{\"env\": \"prod\", \"team\": \"genai\"}",  // Generic tags only!
  "hierarchy_level_1_id": "DEPT-CIO",  // PRE-FILLED (not from labels!)
  "hierarchy_level_1_name": "Group CIO",
  "hierarchy_level_2_id": "PROJ-CTO",
  ...
}
```

**Reality:** Production GCP billing exports don't have hierarchy fields - only labels_json.

---

### 3. GenAI Costs 🔴 COMPLETELY MISSING

#### Current Architecture (Non-existent)

```
OpenAI/Anthropic/Gemini API Usage
   ↓ API returns: model, tokens, date
   ↓ NO HIERARCHY METADATA FROM API
genai_payg_usage_raw (how does hierarchy get here?)
   ↓ sp_calculate_genai_payg_costs_daily
genai_costs_daily_unified (hierarchy_level_*)
   ↓ sp_genai_3_convert_to_focus
cost_data_standard_1_3 (x_hierarchy_level_*)
```

#### Production Gap 🔴

**Critical Question:** Where does hierarchy come from for GenAI usage?

**API Response Analysis:**
- OpenAI API: Returns model, tokens, timestamp - **NO hierarchy metadata**
- Anthropic API: Same - **NO hierarchy metadata**
- Gemini API: Same - **NO hierarchy metadata**

**Possible Solutions (NOT IMPLEMENTED):**
1. **API Key → Credential → Hierarchy Mapping**
   - Map each OpenAI API key to a hierarchy entity
   - Store in `org_integration_credentials` table
   - Processor looks up hierarchy when ingesting

2. **Usage Tagging UI**
   - After ingestion, let users tag usage by model/date
   - Bulk assign hierarchy to usage records

3. **Default Hierarchy per Integration**
   - Each GenAI integration has a default hierarchy
   - All usage from that integration gets the same hierarchy

**Current Status:** ❌ NONE OF THESE IMPLEMENTED

#### Demo Data Workaround (Cheating)

```json
{
  "model": "gpt-4o",
  "input_tokens": 195622306,
  "hierarchy_level_1_id": "DEPT-CIO",  // WHERE DID THIS COME FROM?!
  "hierarchy_level_1_name": "Group CIO",
  ...
}
```

The demo JSON has hierarchy pre-filled, but there's NO production code to populate it!

---

## Schema Analysis

### Cloud Billing Raw Schema

```json
{
  "name": "labels_json",      // GCP resource labels (user-applied tags)
  "type": "STRING",
  "mode": "NULLABLE"
},
{
  "name": "system_labels_json",  // GCP system labels
  "type": "STRING",
  "mode": "NULLABLE"
}
// NO hierarchy_level_* fields in schema!
```

**Production Reality:** Raw billing export has ONLY labels_json, not hierarchy fields.

### GenAI Usage Raw Schema

```json
{
  "name": "hierarchy_level_1_id",  // These exist in schema
  "type": "STRING",
  "mode": "NULLABLE"
},
...
// But HOW do they get populated?!
```

**Production Gap:** Schema has fields, but NO processor logic to populate them!

---

## Missing Components

### 1. Cloud Cost Hierarchy Assignment

**Required:**
- [ ] Documentation on how to tag GCP resources (KB article or admin guide)
- [ ] GCP resource labeling standards (label key names)
- [ ] Validation that labels match org_hierarchy entity_ids
- [ ] Default hierarchy for untagged resources
- [ ] Bulk tagging tool for existing resources

**Example Tagging Guide:**
```bash
# Tag GCP Compute Engine instance
gcloud compute instances add-labels my-instance \
  --labels=entity_id=TEAM-INFRA,cost_center=DEPT-CIO

# Tag GCP Cloud Storage bucket
gsutil label ch -l entity_id:TEAM-DATA gs://my-bucket
```

### 2. GenAI Cost Hierarchy Assignment

**Required:**
- [ ] Extend `org_integration_credentials` with hierarchy fields
- [ ] UI to assign hierarchy when setting up GenAI integration
- [ ] Processor logic to read hierarchy from credential and populate usage records
- [ ] Alternative: Post-ingestion hierarchy tagging UI

**Proposed Schema Extension (org_integration_credentials):**
```json
[
  {
    "name": "default_hierarchy_level_1_id",
    "type": "STRING",
    "mode": "NULLABLE",
    "description": "Default hierarchy entity for all usage from this integration"
  },
  ...
]
```

**Processor Logic (Pseudocode):**
```python
# In OpenAI processor
credential = get_credential(credential_id)
hierarchy = get_hierarchy_from_credential(credential)

for usage_record in api_response:
    usage_record['hierarchy_level_1_id'] = hierarchy.get('level_1_id')
    usage_record['hierarchy_level_1_name'] = hierarchy.get('level_1_name')
    ...
```

### 3. Subscription Plan UI Form

**Need to Verify:** Does UI form have dropdowns for all 10 hierarchy levels?

**Expected:**
```tsx
<HierarchySelector
  orgSlug={orgSlug}
  maxLevels={10}
  onChange={handleHierarchyChange}
/>
```

---

## Recommended Fix Priority

### Phase 1: Critical Fixes (Week 1)

1. **GenAI Hierarchy Assignment** 🔴 HIGH PRIORITY
   - Extend `org_integration_credentials` schema with hierarchy fields
   - Update integration setup UI to capture hierarchy
   - Modify GenAI processors to populate hierarchy from credential
   - **Impact:** Without this, GenAI costs have NO hierarchy in production

2. **Cloud Tagging Documentation** 🟡 MEDIUM PRIORITY
   - Create admin guide for GCP resource labeling
   - Define standard label keys (`entity_id`, `cost_center`)
   - **Impact:** Cloud costs will have no hierarchy unless users tag resources

### Phase 2: Enhancements (Week 2-3)

3. **Default Hierarchy Fallback**
   - Add org-level default hierarchy for untagged resources
   - UI setting: "Default cost allocation entity"

4. **Post-Ingestion Tagging UI**
   - Dashboard to view unallocated costs
   - Bulk hierarchy assignment tool

5. **Validation & Alerts**
   - Alert when >20% of costs have no hierarchy
   - Validation that entity_ids in labels exist in org_hierarchy

---

## Demo vs Production Reality

| Aspect | Demo Data | Production Reality |
|--------|-----------|-------------------|
| **Subscription** | ✅ Hierarchy in CSV | ✅ Hierarchy from UI form |
| **Cloud** | ❌ Hierarchy pre-filled in JSON | 🔴 MISSING: Labels must be manually added to GCP resources |
| **GenAI** | ❌ Hierarchy pre-filled in JSON | 🔴 MISSING: No mechanism to assign hierarchy |

---

## Proposed Architecture (Production-Ready)

### GenAI Flow (NEW)

```
Integration Setup UI
   ↓ User selects default hierarchy entity
org_integration_credentials (hierarchy_level_1_id...10_id added)
   ↓ Pipeline processor reads credential
GenAI Usage Processor (populates hierarchy from credential)
   ↓ Writes to raw usage table
genai_payg_usage_raw (hierarchy_level_* populated)
   ↓ Flows to daily costs and FOCUS
```

### Cloud Flow (DOCUMENTED)

```
GCP Admin Tags Resources
   ↓ Add label: entity_id=TEAM-INFRA
GCP Billing Export
   ↓ labels_json contains tags
cloud_gcp_billing_raw_daily
   ↓ Stored procedure extracts from labels_json
   ↓ LEFT JOIN org_hierarchy
cost_data_standard_1_3 (x_hierarchy_* from JOIN)
```

---

## Testing Checklist

### Subscription Costs
- [x] UI form captures all 10 levels
- [x] Data flows to subscription_plan_costs_daily
- [x] FOCUS procedure maps correctly

### Cloud Costs
- [ ] Document GCP labeling process
- [ ] Test label extraction from labels_json
- [ ] Test LEFT JOIN with org_hierarchy
- [ ] Handle NULL hierarchy (untagged resources)

### GenAI Costs
- [ ] Extend org_integration_credentials schema
- [ ] Update integration setup UI
- [ ] Modify processors to populate hierarchy
- [ ] Test end-to-end flow

---

## Conclusion

**Current State:** Demo data works because it "cheats" by pre-filling hierarchy. Production will FAIL because:
1. Cloud costs: No process to tag resources with entity IDs
2. GenAI costs: No mechanism to assign hierarchy at all

**Required Action:** Implement GenAI hierarchy assignment (Phase 1.1) and document cloud tagging (Phase 1.2) before production deployment.

**Estimated Effort:**
- GenAI fixes: 3-4 days (schema + UI + processor)
- Cloud documentation: 1 day (admin guide + validation)
- Testing: 2 days

**Total:** ~1 week for production-ready hierarchy assignment

---

**Next Steps:**
1. Review this analysis with team
2. Prioritize GenAI hierarchy fixes
3. Create detailed implementation tickets
4. Update demo data loading to match production logic

---

**Reviewed by:** Claude AI
**Status:** ⏳ Awaiting Approval for Implementation
