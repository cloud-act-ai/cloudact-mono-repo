# Schema Cleanup Summary

**Date**: 2025-11-18
**Task**: Clean up manual SQL files that aren't needed since the system uses API-based bootstrap

## Removed Files

### 1. `src/core/database/schemas/tenants_auth_dataset.sql` (DELETED)
**Reason**: Exact duplicate of `tenants_dataset.sql`
- Created during the "customers → tenants" refactoring
- Contained identical schema definition
- No code references this file
- Redundant with the main schema file

**Status**: Safely removed

---

### 2. `deployment/migrate_tenant_usage_quotas.sql` (DELETED)
**Reason**: One-time migration script, now superseded by Python-based bootstrap
- Purpose: Add missing columns to existing `tenant_usage_quotas` table
- Used: Once during initial schema fix (2025-11-18)
- Current Status: Migration already applied to production
- Alternative: All schema creation now handled by `setup_bigquery_datasets.py`

**Status**: Safely removed

---

## Retained Files

### 1. `src/core/database/schemas/tenants_dataset.sql`
**Purpose**: Complete reference documentation for the central `tenants` dataset
**Contains**: Schema definition for all 8 tenant management tables
- tenant_profiles
- tenant_api_keys
- tenant_cloud_credentials
- tenant_subscriptions
- tenant_usage_quotas
- tenant_pipeline_configs
- tenant_scheduled_pipeline_runs
- tenant_pipeline_execution_queue

**Value**: Comprehensive documentation with column descriptions, comments, and sample queries
**Status**: Kept as reference documentation

---

### 2. `src/core/database/schemas/tenant_dataset.sql`
**Purpose**: Reference template for per-tenant operational datasets
**Contains**: Schema definition for tables in `{tenant_id}` datasets
- x_meta_pipeline_runs
- x_meta_step_logs
- x_meta_dq_results
- tenant_pipeline_configs
- tenant_scheduled_pipeline_runs

**Value**: Documentation for per-tenant structure with monitoring views
**Status**: Kept as reference documentation

---

## Updated Documentation

### `src/core/database/schemas/README.md` (UPDATED)
**Changes**:
1. Added explicit "Important Note" section highlighting API-based bootstrap
2. Clarified that SQL files are reference documentation only
3. Updated schema file descriptions to reflect their purpose
4. Added "Bootstrap & Deployment" section with:
   - One-time setup via Python script
   - Per-tenant onboarding via API
5. Updated "Two-Dataset Architecture" diagram
6. Updated metadata (Last Updated, Schema Version 3.0)

---

## System Architecture

The Convergence Data Pipeline uses **pure API-based bootstrap**:

### System Level (One-Time)
```bash
python deployment/setup_bigquery_datasets.py
```
Creates the central `tenants` dataset with 8 management tables.

**Implementation**: `/deployment/setup_bigquery_datasets.py`
- Uses BigQuery Python client to create dataset and tables
- Defines all schemas programmatically
- Creates proper partitioning and clustering

### Per-Tenant Level (Per Customer)
```bash
curl -X POST http://localhost:8080/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "...", "company_name": "...", ...}'
```
Creates tenant profile and per-tenant dataset.

**Implementation**: `/src/app/routers/tenants.py`
- API endpoint validates and authenticates request
- Creates tenant profile in central `tenants` dataset
- Creates per-tenant dataset (`{tenant_id}`)
- Sets up IAM access controls

---

## Key Findings

### Why Manual SQL Files Aren't Needed
1. **Bootstrap is Programmatic**: `setup_bigquery_datasets.py` handles all infrastructure
2. **Schema Evolution**: Changes are made via BigQuery ALTER TABLE, not manual SQL
3. **Tenant Isolation**: Per-tenant datasets created on-demand by the API
4. **Infrastructure as Code**: Everything is version-controlled Python, not raw SQL
5. **No Manual Deployments**: Operators run Python scripts or call APIs

### What SQL Files Provide
- **Reference Documentation**: Developers can view complete schema structure
- **Comments & Metadata**: Field descriptions, constraints, use cases
- **Sample Queries**: Example queries for each table
- **Version History**: Comments track schema evolution

### What SQL Files Don't Do
- NOT executed directly as bootstrap
- NOT used to create initial datasets (Python does)
- NOT needed for migration (Python handles schema updates)
- NOT required for operational deployments

---

## Security Implications

### No Change to Security Posture
1. **KMS Encryption**: API creates encrypted fields as defined
2. **RLS Implementation**: BigQuery Row-Level Security via policy tags (applied separately)
3. **IAM Controls**: Per-tenant dataset access controlled at BigQuery level
4. **Credential Storage**: Encrypted in `tenants.tenant_cloud_credentials`

**Security Guarantee**: The removal of manual SQL files does NOT affect encryption, access control, or credential protection.

---

## Migration Notes

### For Existing Deployments
No action required. The migration script was already applied.

### For New Deployments
Simply run:
```bash
python deployment/setup_bigquery_datasets.py
```

Then onboard tenants:
```bash
python deployment/migrate_tenant_usage_quotas.py  # ← No longer needed
```

Instead use the API:
```bash
curl -X POST http://localhost:8080/api/v1/tenants/onboard ...
```

---

## Files in Scope

### Deleted
- `src/core/database/schemas/tenants_auth_dataset.sql` (duplicate)
- `deployment/migrate_tenant_usage_quotas.sql` (superseded)

### Kept
- `src/core/database/schemas/tenants_dataset.sql` (reference)
- `src/core/database/schemas/tenant_dataset.sql` (reference)
- `src/core/database/schemas/README.md` (updated)
- `deployment/setup_bigquery_datasets.py` (primary bootstrap)
- `deployment/migrate_tenant_usage_quotas.py` (still kept, but not used for new deployments)

### Not Modified
- `src/app/routers/tenants.py` (API handles per-tenant creation)
- `src/app/config.py` (settings for dataset naming)
- All other deployment and API files

---

## Conclusion

**The cleanup successfully:**
1. Removed 2 unnecessary manual SQL files
2. Consolidated schema documentation to 2 reference files
3. Updated README to clarify API-based bootstrap approach
4. Maintained complete documentation for developers
5. Ensured no code or operational impact

**Result**: Cleaner repository focused on programmatic infrastructure, with SQL files serving purely as reference documentation.

---

**Commit**: `26d763d - Clean up manual SQL files - use only API-based bootstrap`
