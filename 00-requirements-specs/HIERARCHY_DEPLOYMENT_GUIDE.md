# Mandatory Hierarchy Fields - Deployment Guide

**Date:** 2026-01-08
**Status:** ✅ BUGS FIXED - Ready for Testing & Deployment

---

## Overview

This guide covers the deployment of mandatory N-level hierarchy fields for subscription plans. All critical bugs have been fixed, but careful deployment is required to handle existing data.

## What Was Changed

### 1. Backend Model (`02-api-service/src/app/routers/subscription_plans.py`)
- Made 5 hierarchy fields **REQUIRED** in `PlanCreate` model:
  - `hierarchy_entity_id` (string, max 50 chars)
  - `hierarchy_entity_name` (string, max 200 chars)
  - `hierarchy_level_code` (string, max 50 chars)
  - `hierarchy_path` (string, max 500 chars)
  - `hierarchy_path_names` (string, max 1000 chars)

### 2. Frontend Interface (`01-fronted-system/actions/subscription-providers.ts`)
- Updated `PlanCreate` interface to match backend requirements
- All hierarchy fields are non-optional

### 3. Frontend Component (`01-fronted-system/components/hierarchy/cascading-hierarchy-selector.tsx`)
- New cascading dropdown component
- Enforces top-to-bottom selection (Department → Project → Team)
- All levels required before form submission

### 4. BigQuery Schema (FIXED)
- Added 5 new **REQUIRED** columns to `subscription_plans` table:
  ```json
  {
    "name": "hierarchy_entity_id",
    "type": "STRING",
    "mode": "REQUIRED"
  },
  {
    "name": "hierarchy_entity_name",
    "type": "STRING",
    "mode": "REQUIRED"
  },
  {
    "name": "hierarchy_level_code",
    "type": "STRING",
    "mode": "REQUIRED"
  },
  {
    "name": "hierarchy_path",
    "type": "STRING",
    "mode": "REQUIRED"
  },
  {
    "name": "hierarchy_path_names",
    "type": "STRING",
    "mode": "REQUIRED"
  }
  ```

---

## Deployment Strategy

### ⚠️ IMPORTANT: Backwards Compatibility Issue

**Problem:** Existing subscription plans don't have hierarchy fields populated. Making them REQUIRED will break existing data.

**Solution:** Deploy in 2 phases:

---

## Phase 1: Schema Migration (Non-Breaking)

**Goal:** Add columns to BigQuery but keep them NULLABLE temporarily.

### Step 1: Update Schema Files (LOCAL EDIT FIRST)

**Before deploying code**, manually edit the schema files to make fields NULLABLE:

```bash
# Edit these 3 files:
02-api-service/configs/setup/organizations/onboarding/schemas/subscription_plans.json
02-api-service/configs/subscription/seed/schemas/subscription_plans.json
04-inra-cicd-automation/load-demo-data/schemas/subscription_plans.json

# Change "mode": "REQUIRED" to "mode": "NULLABLE" for:
- hierarchy_entity_id
- hierarchy_entity_name
- hierarchy_level_code
- hierarchy_path
- hierarchy_path_names
```

**Why:** This allows existing plans to be read without errors while we backfill data.

### Step 2: Sync Schema to BigQuery

```bash
# For each existing organization:
curl -X POST "http://localhost:8000/api/v1/organizations/{org_slug}/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sync_missing_columns": true,
    "sync_missing_tables": false
  }'

# Verify columns were added:
bq show --schema --format=prettyjson \
  {project}:{org_slug}_prod.subscription_plans | \
  grep -A 3 "hierarchy_entity_id"
```

**Expected Output:**
```json
{
  "name": "hierarchy_entity_id",
  "type": "STRING",
  "mode": "NULLABLE"  ← Should be NULLABLE at this stage
}
```

### Step 3: Backfill Existing Data

**Option A: Assign to Default "Unassigned" Entity**

```sql
-- Create default hierarchy entity if it doesn't exist
INSERT INTO `{project}.organizations.org_hierarchy` (
  org_slug, entity_id, entity_name, level, level_code,
  parent_id, path, path_ids, path_names, depth,
  is_active, created_at, created_by, version, end_date
)
SELECT
  @org_slug,
  'UNASSIGNED',
  'Unassigned',
  1,
  'department',
  NULL,
  '/UNASSIGNED',
  ['UNASSIGNED'],
  ['Unassigned'],
  1,
  TRUE,
  CURRENT_TIMESTAMP(),
  'system',
  1,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `{project}.organizations.org_hierarchy`
  WHERE org_slug = @org_slug AND entity_id = 'UNASSIGNED'
);

-- Backfill subscription plans
UPDATE `{project}.{org_slug}_prod.subscription_plans`
SET
  hierarchy_entity_id = 'UNASSIGNED',
  hierarchy_entity_name = 'Unassigned',
  hierarchy_level_code = 'department',
  hierarchy_path = '/UNASSIGNED',
  hierarchy_path_names = 'Unassigned'
WHERE hierarchy_entity_id IS NULL;
```

**Option B: Prompt Users to Assign Hierarchy**

```bash
# Deploy frontend with hierarchy selector
# Existing plans show warning: "Hierarchy not assigned"
# Users must edit each plan to assign hierarchy
# After 30 days, run backfill for remaining NULL values
```

---

## Phase 2: Enforce Required Fields (After Backfill)

**Goal:** Make fields REQUIRED once all data is populated.

### Step 1: Verify All Data Has Hierarchy

```sql
-- Check for NULL values
SELECT COUNT(*) as plans_without_hierarchy
FROM `{project}.{org_slug}_prod.subscription_plans`
WHERE hierarchy_entity_id IS NULL
   OR hierarchy_entity_name IS NULL
   OR hierarchy_level_code IS NULL
   OR hierarchy_path IS NULL
   OR hierarchy_path_names IS NULL;
```

**Expected:** `0` (zero plans without hierarchy)

### Step 2: Update Schema to REQUIRED

```bash
# Revert schema files to REQUIRED mode:
git checkout HEAD -- 02-api-service/configs/setup/organizations/onboarding/schemas/subscription_plans.json
git checkout HEAD -- 02-api-service/configs/subscription/seed/schemas/subscription_plans.json
git checkout HEAD -- 04-inra-cicd-automation/load-demo-data/schemas/subscription_plans.json

# Sync schema (won't actually change mode in BQ - it's a limitation)
# But validates data consistency
curl -X POST "http://localhost:8000/api/v1/organizations/{org_slug}/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -d '{"sync_missing_columns": true}'
```

**Note:** BigQuery doesn't support changing column mode from NULLABLE to REQUIRED. The application will enforce it via Pydantic validation.

### Step 3: Deploy Backend/Frontend Code

```bash
# Deploy with hierarchy fields as REQUIRED
# Pydantic will enforce at API boundary
# All new plans must have hierarchy
```

---

## Testing Checklist

### Pre-Deployment Tests (Local)

```bash
# 1. Test schema sync
cd 02-api-service
python -m pytest tests/test_02_organizations.py::test_org_sync -v

# 2. Test subscription creation with hierarchy
cd 01-fronted-system
npm run test -- subscriptions/[provider]/add/custom

# 3. Test cascading hierarchy selector
npm run test -- components/hierarchy/cascading-hierarchy-selector.test.ts
```

### Post-Deployment Tests (Staging)

```bash
# 1. Create new subscription with hierarchy ✅
curl -X POST "https://api-stage.cloudact.ai/api/v1/subscriptions/{org}/providers/slack/plans" \
  -H "X-API-Key: $ORG_API_KEY" \
  -d '{
    "plan_name": "TEAM",
    "unit_price": 8.00,
    "currency": "USD",
    "seats": 10,
    "pricing_model": "PER_SEAT",
    "billing_cycle": "monthly",
    "hierarchy_entity_id": "TEAM-001",
    "hierarchy_entity_name": "Platform Team",
    "hierarchy_level_code": "team",
    "hierarchy_path": "/DEPT-001/PROJ-001/TEAM-001",
    "hierarchy_path_names": "Engineering > Platform > Platform Team"
  }'

# 2. List subscriptions (mixed old/new) ✅
curl -X GET "https://api-stage.cloudact.ai/api/v1/subscriptions/{org}/providers/slack/plans" \
  -H "X-API-Key: $ORG_API_KEY"

# 3. Edit existing subscription (add hierarchy) ✅
curl -X PUT "https://api-stage.cloudact.ai/api/v1/subscriptions/{org}/providers/slack/plans/{sub_id}" \
  -H "X-API-Key: $ORG_API_KEY" \
  -d '{
    "hierarchy_entity_id": "TEAM-002",
    "hierarchy_entity_name": "Backend Team",
    "hierarchy_level_code": "team",
    "hierarchy_path": "/DEPT-001/PROJ-001/TEAM-002",
    "hierarchy_path_names": "Engineering > Platform > Backend Team"
  }'

# 4. Verify cost pipeline picks up hierarchy ✅
curl -X POST "https://api-stage.cloudact.ai/api/v1/pipelines/trigger/{org}/subscription/costs/subscription_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -d '{"start_date": "2026-01-01", "end_date": "2026-01-08"}'

# Check FOCUS 1.3 export has x_hierarchy_* fields
curl -X GET "https://api-stage.cloudact.ai/api/v1/costs/{org}?format=focus" \
  -H "X-API-Key: $ORG_API_KEY" | jq '.data[0] | keys | map(select(startswith("x_hierarchy")))'
```

---

## Rollback Plan

### If Issues Arise After Deployment

```bash
# 1. Make Pydantic fields Optional (emergency patch)
# Edit: 02-api-service/src/app/routers/subscription_plans.py
#   hierarchy_entity_id: Optional[str] = Field(None, ...)

# 2. Redeploy without REQUIRED enforcement
# Frontend still collects hierarchy, but backend accepts NULL

# 3. Investigate issue in staging
# Fix bugs without affecting production

# 4. Re-deploy when fixed
```

---

## Production Deployment Timeline

### Recommended Schedule

**Week 1: Schema Migration**
- Day 1: Deploy schema changes (NULLABLE mode)
- Day 2-3: Run backfill scripts for existing orgs
- Day 4-5: Verify all data has hierarchy

**Week 2: Soft Enforcement**
- Day 1: Deploy frontend with hierarchy selector
- Day 2-7: Monitor new plan creation
- Allow users to edit old plans and assign hierarchy

**Week 3: Hard Enforcement**
- Day 1: Update Pydantic to REQUIRED
- Day 2-7: Monitor for errors
- No new plans can be created without hierarchy

---

## Success Metrics

### Key Performance Indicators

| Metric | Target | How to Check |
|--------|--------|--------------|
| Schema sync success rate | 100% | Check `/sync` API response |
| Plans with hierarchy | 100% | Run SQL count query |
| New plan creation success | >99% | Monitor error logs |
| Cost allocation accuracy | 100% | Verify hierarchy in FOCUS export |
| Frontend UX satisfaction | >90% | User feedback on hierarchy selector |

---

## Troubleshooting

### Common Issues

#### Issue 1: Column Already Exists Error
```
google.api_core.exceptions.BadRequest: Column hierarchy_entity_id already exists
```
**Solution:** Column was added manually. Skip sync, proceed with backfill.

#### Issue 2: NULL Constraint Violation
```
google.api_core.exceptions.BadRequest: Cannot set REQUIRED mode on column with NULL values
```
**Solution:** Run backfill script first, then change to REQUIRED.

#### Issue 3: Frontend Selector Not Loading
```
Error: Failed to load hierarchy tree
```
**Solution:** Check org has hierarchy configured. Run `/hierarchy/{org}/levels/seed` to create default levels.

#### Issue 4: Cost Pipeline Missing Hierarchy
```
WARNING: subscription_plan_costs_daily missing hierarchy fields
```
**Solution:** Re-run subscription cost pipeline with updated schema.

---

## Contacts

| Area | Contact | Notes |
|------|---------|-------|
| Backend API | API Team | Schema sync, validation logic |
| Frontend | Frontend Team | Hierarchy selector component |
| BigQuery | Data Team | Schema migration, backfill scripts |
| DevOps | Platform Team | Deployment automation |

---

## Related Documentation

- [Hierarchy Bug Report](./HIERARCHY_BUG_REPORT.md) - Detailed bug analysis
- [CloudAct CLAUDE.md](../CLAUDE.md) - Org hierarchy architecture
- [API Service CLAUDE.md](../02-api-service/CLAUDE.md) - Schema evolution process
- [Frontend CLAUDE.md](../01-fronted-system/CLAUDE.md) - Component usage guide

---

**Last Updated:** 2026-01-08
**Status:** ✅ Ready for Phase 1 Deployment (Schema Migration)
