# Hierarchy Fields Bug Report

**Date:** 2026-01-08
**Component:** Subscription Plans - Mandatory Hierarchy Implementation
**Severity:** 🔴 CRITICAL - Blocking Production Deployment

---

## Executive Summary

The implementation of mandatory N-level hierarchy fields for subscription plans has **3 critical bugs** that will cause runtime failures:

1. **BigQuery Schema Mismatch** (CRITICAL) - Schema missing required columns
2. **Validation Function Not Enforcing Requirements** (HIGH) - Allows NULL values
3. **Existing Data Incompatibility** (HIGH) - No migration strategy for existing plans

---

## Bug #1: BigQuery Schema Missing N-Level Hierarchy Columns (CRITICAL)

### Problem
The Pydantic model requires 5 new hierarchy fields, but the BigQuery schema doesn't have these columns:

**Required by Pydantic Model:**
```python
# subscription_plans.py:532-536
hierarchy_entity_id: str = Field(..., max_length=50)
hierarchy_entity_name: str = Field(..., max_length=200)
hierarchy_level_code: str = Field(..., max_length=50)
hierarchy_path: str = Field(..., max_length=500)
hierarchy_path_names: str = Field(..., max_length=1000)
```

**Current BigQuery Schema:**
```json
// subscription_plans.json - HAS OLD DENORMALIZED FIELDS:
"hierarchy_level_1_id", "hierarchy_level_1_name"  // NULLABLE
"hierarchy_level_2_id", "hierarchy_level_2_name"  // NULLABLE
...
"hierarchy_level_10_id", "hierarchy_level_10_name"  // NULLABLE

// MISSING NEW N-LEVEL FIELDS:
hierarchy_entity_id        // ❌ NOT FOUND
hierarchy_entity_name      // ❌ NOT FOUND
hierarchy_level_code       // ❌ NOT FOUND
hierarchy_path             // ❌ NOT FOUND
hierarchy_path_names       // ❌ NOT FOUND
```

### Impact
**ALL subscription plan operations will fail:**
```sql
-- INSERT fails - columns don't exist
INSERT INTO subscription_plans (
    hierarchy_entity_id,     -- ❌ Column not found
    hierarchy_entity_name,   -- ❌ Column not found
    ...
)

-- SELECT fails - columns don't exist
SELECT
    hierarchy_entity_id,     -- ❌ Column not found
    hierarchy_entity_name,   -- ❌ Column not found
    ...
FROM subscription_plans

-- UPDATE fails - columns don't exist
UPDATE subscription_plans
SET hierarchy_entity_id = ...  -- ❌ Column not found
```

### Files Affected
- `02-api-service/configs/setup/organizations/onboarding/schemas/subscription_plans.json`
- `02-api-service/configs/subscription/seed/schemas/subscription_plans.json`
- `04-inra-cicd-automation/load-demo-data/schemas/subscription_plans.json`

### Queries That Will Fail
- `subscription_plans.py:1224-1233` - LIST plans
- `subscription_plans.py:1663-1664` - INSERT new plan
- `subscription_plans.py:1769-1770` - VERIFY inserted plan
- `subscription_plans.py:2060-2061` - SELECT after UPDATE
- `subscription_plans.py:2232-2233` - SELECT for version edit
- `subscription_plans.py:2374-2375` - INSERT new version
- `subscription_plans.py:2896-2897` - PAGINATED list

**Error Expected:**
```
google.api_core.exceptions.BadRequest: 400 Column hierarchy_entity_id not found in table subscription_plans
```

---

## Bug #2: Validation Function Doesn't Enforce Required Fields (HIGH)

### Problem
The `validate_hierarchy_ids()` function treats hierarchy fields as optional:

```python
# subscription_plans.py:739
async def validate_hierarchy_ids(
    bq_client: BigQueryClient,
    org_slug: str,
    hierarchy_entity_id: Optional[str] = None  # ❌ Should be required
) -> None:
    ...
    if not hierarchy_entity_id:
        return  # ❌ Exits early for None/empty - NO VALIDATION!
```

**And the call site:**
```python
# subscription_plans.py:1639-1644
if plan.hierarchy_entity_id:  # ❌ Conditional - allows None
    await validate_hierarchy_ids(
        bq_client=bq_client,
        org_slug=org_slug,
        hierarchy_entity_id=plan.hierarchy_entity_id
    )
```

### Impact
- Pydantic validation will catch missing fields at API boundary
- But if Pydantic is bypassed (internal calls, testing, migration scripts), validation is skipped
- Inconsistent enforcement layer

### Fix Required
```python
# Should be:
async def validate_hierarchy_ids(
    bq_client: BigQueryClient,
    org_slug: str,
    hierarchy_entity_id: str  # REQUIRED - no Optional, no default
) -> None:
    if not hierarchy_entity_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="hierarchy_entity_id is required"
        )
    # ... rest of validation
```

---

## Bug #3: Existing Data Incompatibility (HIGH)

### Problem
Changing hierarchy fields from optional to required breaks existing subscription plans:

**Existing Data:**
```sql
-- Existing plans may have NULL hierarchy fields
SELECT subscription_id, hierarchy_entity_id
FROM subscription_plans
WHERE hierarchy_entity_id IS NULL  -- ❌ Now invalid
```

**New Requirements:**
- All fields must be non-NULL
- Frontend enforces selection
- Backend Pydantic model requires them

### Impact
- **GET /subscriptions/{org}/providers/{provider}/plans** - Will fail to deserialize existing plans with NULL hierarchy
- **Edit existing plans** - Must provide hierarchy where it didn't exist before
- **Historical cost reports** - Missing hierarchy attribution for old data

### Migration Strategy Required
1. **Option A: Backfill with Default Hierarchy**
   ```sql
   UPDATE subscription_plans
   SET
       hierarchy_entity_id = 'UNASSIGNED',
       hierarchy_entity_name = 'Unassigned',
       hierarchy_level_code = 'department',
       hierarchy_path = '/UNASSIGNED',
       hierarchy_path_names = 'Unassigned'
   WHERE hierarchy_entity_id IS NULL
   ```

2. **Option B: Make Fields Optional at Read Time**
   - Keep Pydantic model fields optional for reading
   - Only enforce required for creation/updates
   - Requires separate `PlanRead` and `PlanCreate` models

3. **Option C: Deprecation Period**
   - Deploy with fields optional
   - UI enforces selection for new plans
   - After 30 days, backfill remaining NULL values
   - Then enforce required

---

## Recommended Fix Order

### 1. Fix BigQuery Schema (CRITICAL - Do First)
```bash
# Add new hierarchy fields to schema JSON
cd 02-api-service/configs/setup/organizations/onboarding/schemas
# Edit subscription_plans.json - add 5 new fields

# Sync schema to BigQuery
curl -X POST "http://localhost:8000/api/v1/organizations/{org}/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -d '{"sync_missing_columns": true}'
```

### 2. Handle Existing Data
```python
# Create migration script: 02-api-service/migrations/001_add_hierarchy_fields.py
# Backfill existing NULL values with "UNASSIGNED" default
```

### 3. Update Validation Function
```python
# Make validation enforce required fields
# Remove Optional typing
# Add explicit NULL check with error
```

### 4. Test End-to-End
```bash
# 1. Create new subscription (with hierarchy) ✅
# 2. Edit existing subscription (with hierarchy) ✅
# 3. List subscriptions (mixed old/new) ✅
# 4. Cost reports (hierarchy attribution) ✅
```

---

## Files Requiring Changes

### Schema Files (Priority 1)
- [ ] `02-api-service/configs/setup/organizations/onboarding/schemas/subscription_plans.json`
- [ ] `02-api-service/configs/subscription/seed/schemas/subscription_plans.json`
- [ ] `04-inra-cicd-automation/load-demo-data/schemas/subscription_plans.json`

### Validation Logic (Priority 2)
- [ ] `02-api-service/src/app/routers/subscription_plans.py:736-758` - Update `validate_hierarchy_ids()`
- [ ] `02-api-service/src/app/routers/subscription_plans.py:1639-1644` - Remove conditional validation

### Migration Script (Priority 3)
- [ ] Create `02-api-service/migrations/001_add_hierarchy_fields.py`
- [ ] Create backfill SQL for existing data

---

## Testing Checklist

### Pre-Deployment Tests
- [ ] Fresh org onboarding creates schema with new fields
- [ ] Create subscription with hierarchy succeeds
- [ ] Edit subscription with hierarchy succeeds
- [ ] List subscriptions deserializes correctly
- [ ] Cost pipeline reads hierarchy fields
- [ ] FOCUS 1.3 export includes `x_hierarchy_*` fields

### Existing Data Tests
- [ ] Existing orgs can sync schema (adds columns)
- [ ] Existing plans with NULL hierarchy can be read
- [ ] Existing plans can be edited (must add hierarchy)
- [ ] Migration script backfills NULL values
- [ ] After migration, all validation passes

---

## Risk Assessment

| Bug | Severity | Impact | Workaround |
|-----|----------|--------|------------|
| #1 Schema Mismatch | 🔴 CRITICAL | All operations fail | Fix schema first |
| #2 Optional Validation | 🟠 HIGH | Inconsistent enforcement | Pydantic catches at API boundary |
| #3 Existing Data | 🟠 HIGH | Cannot read old plans | Use PlanRead with optional fields |

**Recommendation:** **DO NOT DEPLOY** until Bug #1 is fixed. Bugs #2 and #3 can be addressed post-schema fix.

---

## Related Documentation
- CloudAct CLAUDE.md: Organizational Hierarchy section
- `00-requirements-specs/00_ARCHITECTURE.md`: N-Level Hierarchy
- `02-api-service/CLAUDE.md`: Incremental Schema Evolution

**Report Generated:** 2026-01-08
**Reporter:** Claude Sonnet 4.5
**Status:** 🔴 OPEN - Blocking Production
