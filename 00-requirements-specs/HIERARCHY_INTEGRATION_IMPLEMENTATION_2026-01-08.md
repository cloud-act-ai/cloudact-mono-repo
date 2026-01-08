# GenAI Hierarchy Assignment Implementation
**Date:** 2026-01-08
**Status:** 🟢 Phase 1 COMPLETE - Ready for Testing
**Implementation:** Credential-Level Default Hierarchy

---

## Executive Summary

**Problem:** GenAI usage records had NO mechanism to assign hierarchy in production, causing all GenAI costs to appear as "Unallocated" in dashboards.

**Solution:** Extended `org_integration_credentials` table with 10-level hierarchy fields. When users set up GenAI integrations (OpenAI, Anthropic, Gemini), they can now assign a default hierarchy that will be applied to ALL usage from that integration.

**Status:**
- ✅ Database schema extended (20 new fields)
- ✅ Backend processor updated to store hierarchy
- ✅ Frontend API client updated to pass hierarchy
- ✅ Frontend actions updated to accept hierarchy
- ✅ GenAI processors update (COMPLETE - 2026-01-08)
- ⏳ UI integration forms update (NEXT STEP)

---

## Architecture Overview

### Data Flow

```
Integration Setup UI
   ↓ User selects hierarchy entity (CascadingHierarchySelector)
Frontend Actions (setupIntegration)
   ↓ Passes hierarchy in SetupIntegrationInput
Backend API Client
   ↓ SetupIntegrationRequest with hierarchy fields
KMS Store Processor
   ↓ Stores in org_integration_credentials
   ↓ (hierarchy_level_1_id...hierarchy_level_10_id)
GenAI Processors (OpenAI/Anthropic/Gemini)
   ↓ Read credential + hierarchy
   ↓ Populate hierarchy in usage records
genai_*_usage_raw tables
   ↓ hierarchy_level_1_id...hierarchy_level_10_id
Daily Cost Processors
   ↓ Hierarchy flows through
genai_costs_daily_unified
   ↓ hierarchy_level_1_id...hierarchy_level_10_id
FOCUS Conversion Processor
   ↓ Maps to x_hierarchy_level_*
cost_data_standard_1_3 (FOCUS 1.3)
   ↓ x_hierarchy_level_1_id...x_hierarchy_level_10_id
```

---

## Implementation Details

### 1. Schema Extension ✅ COMPLETED

**File:** `02-api-service/configs/setup/bootstrap/schemas/org_integration_credentials.json`

**Changes:** Added 20 new fields (10 levels × 2 fields each):

```json
{
  "name": "default_hierarchy_level_1_id",
  "type": "STRING",
  "mode": "NULLABLE",
  "description": "Default hierarchy level 1 (root) entity ID for all usage from this integration"
},
{
  "name": "default_hierarchy_level_1_name",
  "type": "STRING",
  "mode": "NULLABLE",
  "description": "Default hierarchy level 1 (root) entity name"
},
// ... repeated for levels 2-10
```

**Purpose:** Store default hierarchy assignment for each integration credential.

**Deployment:** Run `/api/v1/admin/bootstrap/sync` to apply schema changes (non-destructive).

---

### 2. Backend Processor Update ✅ COMPLETED

**File:** `02-api-service/src/core/processors/integrations/kms_store.py`

**Changes:**

1. **Extract hierarchy from context** (Line 287-294):
```python
# Extract hierarchy fields (10 levels, each with ID and name)
hierarchy = {}
for level in range(1, 11):
    level_id = context.get(f"default_hierarchy_level_{level}_id")
    level_name = context.get(f"default_hierarchy_level_{level}_name")
    if level_id:  # Only include if ID provided
        hierarchy[f"level_{level}_id"] = level_id
        hierarchy[f"level_{level}_name"] = level_name or ""
```

2. **Updated INSERT query** (Line 437-468):
```sql
INSERT INTO org_integration_credentials
(credential_id, org_slug, provider, ...,
 default_hierarchy_level_1_id, default_hierarchy_level_1_name,
 ...,
 default_hierarchy_level_10_id, default_hierarchy_level_10_name,
 is_active, created_at, ...)
VALUES
(@credential_id, @org_slug, @provider, ...,
 @level_1_id, @level_1_name,
 ...,
 @level_10_id, @level_10_name,
 TRUE, CURRENT_TIMESTAMP(), ...)
```

3. **Added query parameters** (Line 470-507):
```python
job_config = bigquery.QueryJobConfig(
    query_parameters=[
        # ... existing parameters ...
        # Hierarchy level parameters (10 levels, each with ID and name)
        bigquery.ScalarQueryParameter("level_1_id", "STRING", hierarchy.get("level_1_id")),
        bigquery.ScalarQueryParameter("level_1_name", "STRING", hierarchy.get("level_1_name")),
        # ... repeated for levels 2-10 ...
    ]
)
```

**Purpose:** Accept hierarchy fields from API requests and store them securely in BigQuery.

---

### 3. Frontend API Client Update ✅ COMPLETED

**File:** `01-fronted-system/lib/api/backend.ts`

**Changes:** Extended `SetupIntegrationRequest` interface (Line 118-144):

```typescript
export interface SetupIntegrationRequest {
  credential: string
  credential_name?: string
  metadata?: Record<string, unknown>
  skip_validation?: boolean
  // Default hierarchy for all usage from this integration (GenAI providers)
  default_hierarchy_level_1_id?: string
  default_hierarchy_level_1_name?: string
  default_hierarchy_level_2_id?: string
  default_hierarchy_level_2_name?: string
  // ... repeated for levels 3-10 ...
}
```

**Purpose:** Type-safe interface for passing hierarchy data to backend API.

**Note:** No code changes needed in `setupIntegration()` method - it already serializes the entire request object as JSON.

---

### 4. Frontend Actions Update ✅ COMPLETED

**File:** `01-fronted-system/actions/integrations.ts`

**Changes:**

1. **Extended input interface** (Line 52-79):
```typescript
export interface SetupIntegrationInput {
  orgSlug: string
  provider: IntegrationProvider
  credential: string
  credentialName?: string
  metadata?: Record<string, unknown>
  // Default hierarchy for GenAI integrations
  defaultHierarchyLevel1Id?: string
  defaultHierarchyLevel1Name?: string
  // ... repeated for levels 2-10 ...
}
```

2. **Map camelCase to snake_case** (Line 298-324):
```typescript
const request: SetupIntegrationRequest = {
  credential: input.credential,
  credential_name: input.credentialName,
  metadata: input.metadata,
  skip_validation: false,
  // Map hierarchy fields from camelCase to snake_case
  default_hierarchy_level_1_id: input.defaultHierarchyLevel1Id,
  default_hierarchy_level_1_name: input.defaultHierarchyLevel1Name,
  // ... repeated for levels 2-10 ...
}
```

**Purpose:** Accept hierarchy from UI components and transform to backend API format.

---

## Next Steps (Remaining Work)

### Phase 2: GenAI Processor Updates ✅ COMPLETE (2026-01-08)

**Files Modified:**
- ✅ `03-data-pipeline-service/src/core/processors/genai/payg_usage.py`
- ✅ `03-data-pipeline-service/src/core/processors/genai/commitment_usage.py`
- ✅ `03-data-pipeline-service/src/core/processors/genai/infrastructure_usage.py`
- ✅ `03-data-pipeline-service/src/core/processors/genai/payg_cost.py` (already had 10 levels)
- ✅ `03-data-pipeline-service/src/core/processors/genai/commitment_cost.py`
- ✅ `03-data-pipeline-service/src/core/processors/genai/infrastructure_cost.py`
- ✅ `03-data-pipeline-service/src/core/processors/genai/unified_consolidator.py` (fixed bug)
- ✅ `03-data-pipeline-service/src/core/processors/genai/focus_converter.py` (already complete)

**Changes Completed:**

1. **Query credentials with hierarchy:**
```python
# Read credential with hierarchy fields
credential_query = f"""
SELECT
    encrypted_credential,
    default_hierarchy_level_1_id,
    default_hierarchy_level_1_name,
    -- ... levels 2-10 ...
FROM `{project}.organizations.org_integration_credentials`
WHERE org_slug = @org_slug
  AND provider = @provider
  AND is_active = TRUE
LIMIT 1
"""

credential_row = bq_client.query(credential_query, params).result().to_dataframe()
```

2. **Populate hierarchy in usage records:**
```python
# Add hierarchy to each usage record before writing
for record in usage_records:
    if not record.get('hierarchy_level_1_id'):  # Only if not already set
        for level in range(1, 11):
            id_key = f'hierarchy_level_{level}_id'
            name_key = f'hierarchy_level_{level}_name'
            record[id_key] = credential_row[f'default_{id_key}'].iloc[0]
            record[name_key] = credential_row[f'default_{name_key}'].iloc[0]
```

**Impact:** GenAI usage records will have hierarchy populated at ingestion time.

---

### Phase 3: UI Integration Forms ⏳ PENDING

**Files to Create/Modify:**
- `01-fronted-system/app/[orgSlug]/integrations/genai/[provider]/page.tsx` (new)
- Or extend existing integration setup pages

**Required Changes:**

1. **Add CascadingHierarchySelector component:**
```tsx
import { CascadingHierarchySelector } from "@/components/hierarchy/cascading-hierarchy-selector"

export default function SetupGenAIPage({ params }: { params: { orgSlug: string, provider: string } }) {
  const [hierarchyValue, setHierarchyValue] = useState<HierarchySelection>({})

  return (
    <form onSubmit={handleSubmit}>
      {/* API Key input */}
      <input type="password" name="apiKey" ... />

      {/* Hierarchy selector */}
      <CascadingHierarchySelector
        orgSlug={params.orgSlug}
        value={hierarchyValue}
        onChange={setHierarchyValue}
      />

      <button type="submit">Connect</button>
    </form>
  )
}
```

2. **Extract hierarchy in submit handler:**
```typescript
const handleSubmit = async (e: FormEvent) => {
  e.preventDefault()

  // Extract hierarchy from cascading selector
  const hierarchyLevels = extractHierarchyLevels(hierarchyValue)

  await setupIntegration({
    orgSlug,
    provider,
    credential: apiKey,
    credentialName: `${provider} Integration`,
    ...hierarchyLevels  // Spreads defaultHierarchyLevel1Id, etc.
  })
}
```

**Impact:** Users can assign hierarchy when setting up GenAI integrations.

---

### Phase 4: Validation & Testing ⏳ PENDING

**Create Validation Script:**

**File:** `04-inra-cicd-automation/scripts/validate_hierarchy_assignment.sh`

```bash
#!/bin/bash
# Validate hierarchy assignment for GenAI usage

ORG_SLUG=$1
GCP_PROJECT=$2

echo "Validating hierarchy assignment for $ORG_SLUG..."

# Check credentials have hierarchy
bq query --use_legacy_sql=false --format=json "
SELECT
  provider,
  default_hierarchy_level_1_id,
  default_hierarchy_level_2_id,
  default_hierarchy_level_3_id
FROM \`$GCP_PROJECT.organizations.org_integration_credentials\`
WHERE org_slug = '$ORG_SLUG'
  AND is_active = TRUE
"

# Check usage records have hierarchy
bq query --use_legacy_sql=false --format=json "
SELECT
  COUNT(*) as total_records,
  COUNTIF(hierarchy_level_1_id IS NOT NULL) as with_hierarchy,
  ROUND(100 * COUNTIF(hierarchy_level_1_id IS NOT NULL) / COUNT(*), 2) as hierarchy_pct
FROM \`$GCP_PROJECT.${ORG_SLUG}_prod.genai_payg_usage_raw\`
WHERE usage_date >= CURRENT_DATE() - 7
"

echo "✓ Validation complete"
```

**Test Cases:**

1. **Setup Integration with Hierarchy:**
   - Create OpenAI integration with Department → Project → Team hierarchy
   - Verify credentials table has all 3 levels stored
   - Run OpenAI usage processor
   - Verify usage records have hierarchy populated

2. **Setup Integration without Hierarchy:**
   - Create Anthropic integration with NO hierarchy
   - Verify credentials table has NULL hierarchy fields
   - Run Anthropic processor
   - Verify usage records have NULL hierarchy (expected)

3. **Multiple Integrations:**
   - Create multiple OpenAI integrations with different hierarchies
   - Verify each credential has correct hierarchy
   - Run usage processors
   - Verify usage attributed to correct hierarchy

**Validation Queries:**

```sql
-- Check unallocated GenAI costs
SELECT
  SUM(billed_cost) as total_unallocated_cost,
  ROUND(100 * SUM(billed_cost) / (SELECT SUM(billed_cost) FROM cost_data_standard_1_3), 2) as pct
FROM `{org_slug}_prod.cost_data_standard_1_3`
WHERE x_hierarchy_level_1_id IS NULL
  AND charge_category = 'GenAI'
  AND charge_period_start >= CURRENT_DATE() - 30;

-- Alert if > 5% unallocated
```

---

## Cloud Resource Tagging Documentation ✅ COMPLETED

**File:** `00-requirements-specs/CLOUD_RESOURCE_TAGGING_GUIDE.md`

**Contents:**
- GCP resource labeling examples (Compute, Storage, BigQuery, GKE, Cloud SQL, Functions, Cloud Run)
- AWS resource tagging examples (EC2, S3, RDS, Lambda, EKS)
- Azure resource tagging examples (VMs, Storage, SQL, AKS)
- OCI resource tagging examples
- Terraform integration examples for all clouds
- Bulk tagging scripts (bash) for each provider
- Best practices and troubleshooting

**Supported Label Keys (Priority Order):**
1. `entity_id` - Full hierarchy entity ID (RECOMMENDED)
2. `cost_center` - Department/cost center code
3. `team` - Team identifier
4. `department` - Department name

**Impact:** Enables cloud hierarchy assignment through resource labels.

---

## Deployment Checklist

### Pre-Deployment

- [ ] Review schema changes in `org_integration_credentials.json`
- [ ] Backup existing credentials table (if applicable)
- [ ] Test hierarchy extraction logic in kms_store.py
- [ ] Verify frontend types compile without errors

### Deployment Steps

1. **Apply Schema Changes:**
```bash
curl -X POST "https://api.cloudact.ai/api/v1/admin/bootstrap/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -d '{"sync_missing_columns": true}'
```

2. **Verify Schema:**
```bash
bq show --schema --format=prettyjson \
  cloudact-prod:organizations.org_integration_credentials \
  | grep -A1 "default_hierarchy"
```

3. **Deploy Backend (API Service 8000):**
```bash
cd 04-inra-cicd-automation/CICD
./release.sh v1.1.0 --deploy --env prod --service api-service
```

4. **Deploy Frontend:**
```bash
# Rebuild with updated types
cd 01-fronted-system
npm run build
vercel --prod
```

5. **Monitor:**
```bash
# Check for errors in integration setup
curl -s "https://api.cloudact.ai/health" | jq
```

### Post-Deployment Validation

- [ ] Create test GenAI integration with hierarchy
- [ ] Verify credentials table has hierarchy fields populated
- [ ] Check frontend integration form accepts hierarchy (once UI updated)
- [ ] Run validation script on test org
- [ ] Monitor for NULL hierarchy rates

---

## Rollback Plan

**If Issues Occur:**

1. **Schema is backward compatible** - existing integrations will have NULL hierarchy (safe)
2. **Frontend changes are additive** - old integrations without hierarchy still work
3. **Processor changes are defensive** - handle NULL hierarchy gracefully

**Rollback Steps:**

```bash
# 1. Revert backend deployment
./release.sh v1.0.0 --deploy --env prod --service api-service

# 2. Revert frontend deployment
vercel rollback

# 3. Schema remains (safe) - old code ignores new fields
```

---

## Success Metrics

### Phase 1 ✅ COMPLETE
- ✅ Schema extended with 20 hierarchy fields
- ✅ Backend processor accepts hierarchy
- ✅ Frontend actions pass hierarchy
- ✅ Cloud tagging documentation created

### Phase 2 ✅ COMPLETE (2026-01-08)
- ✅ All 8 GenAI processors updated to support 10-level hierarchy
- ✅ Usage processors (payg, commitment, infrastructure) query and populate hierarchy
- ✅ Cost processors (payg, commitment, infrastructure) preserve hierarchy
- ✅ Unified consolidator preserves hierarchy across all flows
- ✅ FOCUS converter maps hierarchy to extension fields
- ✅ All processors compile without errors
- ⏳ 100% of new GenAI usage has hierarchy (test after bootstrap)
- ⏳ < 5% unallocated GenAI costs (verify after production use)

### Phase 3 (UI Integration)
- [ ] Users can assign hierarchy during GenAI setup
- [ ] CascadingHierarchySelector works for all hierarchy depths
- [ ] Integration forms validate hierarchy entity IDs exist

### Phase 4 (Production)
- [ ] Monitor unallocated costs weekly
- [ ] Alert if unallocated > 10% (gradual improvement target)
- [ ] Dashboard shows GenAI costs by Department/Project/Team

---

## Files Modified Summary

### Backend (02-api-service)
1. `configs/setup/bootstrap/schemas/org_integration_credentials.json` - Schema extension
2. `src/core/processors/integrations/kms_store.py` - Store hierarchy

### Frontend (01-fronted-system)
3. `lib/api/backend.ts` - API client types
4. `actions/integrations.ts` - Actions layer

### Documentation (00-requirements-specs)
5. `CLOUD_RESOURCE_TAGGING_GUIDE.md` - Cloud tagging guide (NEW)
6. `HIERARCHY_INTEGRATION_IMPLEMENTATION_2026-01-08.md` - This document (NEW)

### Pending (Next Phase)
7. GenAI processors (3 files)
8. Integration UI forms (new pages)
9. Validation scripts

---

## Related Documentation

- **Phase 2 Completion Summary:** `00-requirements-specs/HIERARCHY_PROCESSORS_UPDATE_COMPLETE.md` (NEW - 2026-01-08)
- **Bug Hunt Report:** `00-requirements-specs/BUG_HUNT_FINAL_REPORT_2026-01-08.md`
- **Architecture Analysis:** `00-requirements-specs/HIERARCHY_ASSIGNMENT_ARCHITECTURE_2026-01-08.md`
- **Cloud Tagging Guide:** `00-requirements-specs/CLOUD_RESOURCE_TAGGING_GUIDE.md`
- **GenAI Pricing Fix:** `00-requirements-specs/DEMO_ACCOUNT_BUG_FIXES_2026-01-08.md`

---

**Implementation by:** Claude AI
**Date:** 2026-01-08
**Status:** Phase 1 & 2 Complete - Ready for Bootstrap & Testing
**Next Phase:** Phase 3 (UI Integration Forms) - User to decide when to proceed
