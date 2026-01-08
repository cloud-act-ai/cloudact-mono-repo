# Schema Consolidation Plan

**Purpose:** Fix BUG #30-#32 (LOW severity) - Eliminate duplicate schema files
**Issue:** Same table schemas exist in multiple locations, risking schema drift
**Priority:** LOW (no immediate production impact, but important for maintainability)

---

## Problem Overview

Three tables have duplicate schema files in multiple locations:

| Table | Duplicates | Locations |
|-------|------------|-----------|
| `genai_payg_usage_raw` | 2 | API service, Demo automation |
| `subscription_plans` | 3 | API service (2 locations), Demo automation |
| `billing_cost` | 4 | Pipeline service (AWS, Azure, GCP, OCI) |

**Risk:** If one schema is updated but not the others, schemas drift → pipeline failures

---

## Consolidation Strategy

### 1. genai_payg_usage_raw (2 duplicates)

**Current locations:**
```
02-api-service/configs/setup/organizations/onboarding/schemas/genai_payg_usage_raw.json
04-inra-cicd-automation/load-demo-data/schemas/genai_payg_usage_raw.json
```

**Decision:** Keep API service version as source of truth

**Actions:**
1. ✅ Verify API service schema has all 10-level hierarchy fields (after running fix_hierarchy_schemas.sql)
2. ❌ DELETE demo automation copy
3. ✅ Update demo data loader to reference API service schema

**Implementation:**
```bash
# Delete duplicate
rm 04-inra-cicd-automation/load-demo-data/schemas/genai_payg_usage_raw.json

# Update demo data loader
cd 04-inra-cicd-automation/load-demo-data
# Change schema path to: ../../02-api-service/configs/setup/organizations/onboarding/schemas/
```

---

### 2. subscription_plans (3 duplicates)

**Current locations:**
```
02-api-service/configs/setup/organizations/onboarding/schemas/subscription_plans.json  ← SOURCE OF TRUTH
02-api-service/configs/subscription/seed/schemas/subscription_plans.json               ← SEED DATA (different purpose)
04-inra-cicd-automation/load-demo-data/schemas/subscription_plans.json                 ← DUPLICATE
```

**Decision:** Keep 2 versions, delete 1

**Rationale:**
- **Onboarding schema** → Used when creating new org dataset (table DDL)
- **Seed schema** → Used for seeding reference data (pre-populated plans like Slack Pro, GitHub Teams, etc.)
- **Demo schema** → Unnecessary duplicate

**Actions:**
1. ✅ Keep: `02-api-service/configs/setup/organizations/onboarding/schemas/subscription_plans.json`
2. ✅ Keep: `02-api-service/configs/subscription/seed/schemas/subscription_plans.json` (seed data, not table DDL)
3. ❌ DELETE: `04-inra-cicd-automation/load-demo-data/schemas/subscription_plans.json`
4. ✅ Update demo loader to reference onboarding schema

**Implementation:**
```bash
# Delete duplicate
rm 04-inra-cicd-automation/load-demo-data/schemas/subscription_plans.json

# Update demo data loader references
cd 04-inra-cicd-automation/load-demo-data
# Change schema path to: ../../02-api-service/configs/setup/organizations/onboarding/schemas/
```

---

### 3. billing_cost (4 duplicates)

**Current locations:**
```
03-data-pipeline-service/configs/cloud/aws/cost/schemas/billing_cost.json
03-data-pipeline-service/configs/cloud/azure/cost/schemas/billing_cost.json
03-data-pipeline-service/configs/cloud/gcp/cost/schemas/billing_cost.json
03-data-pipeline-service/configs/cloud/oci/cost/schemas/billing_cost.json
```

**Decision:** Keep ALL 4 - These are NOT duplicates, they're provider-specific

**Rationale:**
- Each cloud provider has different billing formats
- AWS: Detailed Billing Report format
- Azure: Cost Management Export format
- GCP: BigQuery Billing Export format
- OCI: Cost and Usage Report format

**Different columns per provider:**
- AWS: `lineItem/UsageType`, `lineItem/ProductCode`, `bill/BillingEntity`
- Azure: `ServiceName`, `MeterCategory`, `ResourceGroup`
- GCP: `service.description`, `sku.description`, `project.id`
- OCI: `service/description`, `product/resource`, `tenant/id`

**Actions:**
- ✅ Keep all 4 schemas
- ✅ Add comments to each schema file explaining provider-specific differences
- ✅ Create shared base schema for common FOCUS 1.3 fields

**Implementation:**
```bash
# Add header comment to each schema
cat > 03-data-pipeline-service/configs/cloud/aws/cost/schemas/billing_cost.json <<EOF
{
  "_comment": "AWS-specific billing schema. Uses AWS Cost and Usage Report format.",
  "_shared_fields": "See configs/cloud/shared/focus_1_3_base.json",
  "fields": [...]
}
EOF

# Create shared base schema for reference
mkdir -p 03-data-pipeline-service/configs/cloud/shared
# Create focus_1_3_base.json with common FOCUS 1.3 fields
```

---

## Implementation Checklist

### Phase 1: Delete Unnecessary Duplicates
- [ ] Delete `04-inra-cicd-automation/load-demo-data/schemas/genai_payg_usage_raw.json`
- [ ] Delete `04-inra-cicd-automation/load-demo-data/schemas/subscription_plans.json`
- [ ] Update demo data loader to reference API service schemas

### Phase 2: Document Provider-Specific Schemas
- [ ] Add `_comment` field to each cloud provider billing_cost.json
- [ ] Create shared FOCUS 1.3 base schema for reference
- [ ] Update pipeline-service CLAUDE.md to explain why 4 schemas exist

### Phase 3: Validate
- [ ] Run demo data loader to ensure it works with new paths
- [ ] Test pipeline runs for all 4 cloud providers
- [ ] Verify no broken references

---

## Automated Cleanup Script

```bash
#!/bin/bash
# delete_duplicate_schemas.sh - Remove unnecessary duplicate schemas

REPO_ROOT="/Users/gurukallam/prod-ready-apps/cloudact-mono-repo"
cd "$REPO_ROOT"

echo "🔍 Deleting duplicate schema files..."

# Backup before deletion
echo "Creating backups..."
cp 04-inra-cicd-automation/load-demo-data/schemas/genai_payg_usage_raw.json \
   04-inra-cicd-automation/load-demo-data/schemas/genai_payg_usage_raw.json.backup

cp 04-inra-cicd-automation/load-demo-data/schemas/subscription_plans.json \
   04-inra-cicd-automation/load-demo-data/schemas/subscription_plans.json.backup

# Delete duplicates
rm 04-inra-cicd-automation/load-demo-data/schemas/genai_payg_usage_raw.json
rm 04-inra-cicd-automation/load-demo-data/schemas/subscription_plans.json

echo "✅ Deleted 2 duplicate schema files"
echo "Backups saved with .backup extension"

# Update demo loader paths (manual step)
echo ""
echo "⚠️  MANUAL STEP REQUIRED:"
echo "Update 04-inra-cicd-automation/load-demo-data/ scripts to reference:"
echo "  ../../02-api-service/configs/setup/organizations/onboarding/schemas/"
```

---

## Validation Tests

After consolidation, run these tests:

```bash
# Test 1: Demo data loader
cd 04-inra-cicd-automation/load-demo-data
python3 load_demo_data.py --org test_org_consolidation --validate-only

# Test 2: Cloud pipelines (all 4 providers)
cd 03-data-pipeline-service
python3 -m pytest tests/test_cloud_cost_pipelines.py -v

# Test 3: Schema validation
cd 02-api-service
python3 scripts/validate_schemas.py
```

---

## Expected Outcome

**Before:**
```
Total schema files: 47
Duplicate tables: 3
Wasted duplicates: 3
```

**After:**
```
Total schema files: 45  (deleted 2 duplicates)
Duplicate tables: 0
Provider-specific schemas: 4 (AWS, Azure, GCP, OCI - all necessary)
```

**Benefits:**
- ✅ Single source of truth for each table
- ✅ No risk of schema drift
- ✅ Easier schema updates (update once, not 3 times)
- ✅ Clear documentation of provider-specific differences

---

**Status:** Ready for implementation
**Estimated time:** 30 minutes
**Risk:** LOW (only deleting unused files)
