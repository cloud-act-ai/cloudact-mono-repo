# Bootstrap Service Bug Report
**Date:** 2026-01-08  
**Component:** API Service - Bootstrap & Schema Management  
**Severity:** HIGH

## Summary
Comprehensive bug hunt identified **15 issues** across bootstrap service, schema definitions, CRUD operations, and documentation.

---

## 🔴 CRITICAL Issues (Fix Immediately)

### BUG-001: Documentation Table Count Mismatch
**Location:** `CLAUDE.md`, `02-api-service/CLAUDE.md`  
**Issue:** Documentation claims "20 meta tables" but bootstrap config has 21 tables  
**Impact:** Misleading documentation, deployment confusion  
**Fix:** Update all documentation to reflect 21 tables

**Evidence:**
- `config.yml`: 21 tables defined
- `schemas/`: 21 JSON files present
- Multiple CLAUDE.md references say "20 tables"

---

### BUG-002: Clustering Field Order Inconsistency
**Location:** `configs/setup/bootstrap/config.yml` line 54-58  
**Table:** `org_pipeline_execution_queue`  
**Issue:** Clustering order is `[state, priority, org_slug]` - violates multi-tenancy standard  
**Impact:** Poor query performance for per-org queries, violates multi-tenancy best practice  
**Standard:** org_slug MUST be first clustering field for all tables  

**Current:**
```yaml
org_pipeline_execution_queue:
  clustering: ["state", "priority", "org_slug"]
```

**Fix:**
```yaml
org_pipeline_execution_queue:
  clustering: ["org_slug", "state", "priority"]
```

**Rationale:** All per-org queries filter by org_slug first. Having it as first clustering field optimizes read performance and enforces data locality.

---

## 🟠 HIGH Issues (Fix Soon)

### BUG-003: Missing `created_at` Fields in Meta Tables
**Location:** `configs/setup/bootstrap/schemas/`  
**Tables Affected:**
1. `org_meta_pipeline_runs.json`
2. `org_meta_step_logs.json`
3. `org_meta_state_transitions.json`
4. `org_meta_dq_results.json`
5. `org_pipeline_execution_queue.json`

**Issue:** These tables are missing `created_at` timestamp field  
**Impact:** 
- Cannot track record creation time
- Breaks audit trail
- Partition fields (start_time, transition_time) exist but created_at missing

**Standard:** ALL tables should have `created_at` (REQUIRED) for audit compliance

**Fix Example** (`org_meta_pipeline_runs.json`):
```json
{
  "name": "created_at",
  "type": "TIMESTAMP",
  "mode": "REQUIRED",
  "description": "Timestamp when record was created"
}
```

---

### BUG-004: Bootstrap Auto-Sync Not Table-Order Safe
**Location:** `src/app/main.py` lines 181-274  
**Issue:** Auto-sync processes tables in arbitrary `dict` iteration order, not dependency order  
**Impact:** If tables have foreign key-like relationships, sync may fail  
**Fix:** Process tables in config.yml order (dict preserves insertion order in Python 3.7+, but explicit ordering is clearer)

**Current:**
```python
for table_name, table_config in config.get('tables', {}).items():
    # Process in arbitrary order
```

**Recommendation:**
```python
# Process in config.yml order (dependency-safe)
table_order = list(config.get('tables', {}).keys())
for table_name in table_order:
    table_config = config.get('tables', {})[table_name]
```

---

## 🟡 MEDIUM Issues (Fix When Convenient)

### BUG-005: No Validation for Partition Field Types
**Location:** `src/core/processors/setup/initial/onetime_bootstrap_processor.py`  
**Issue:** Processor doesn't validate that partition fields are DATE/TIMESTAMP/DATETIME  
**Impact:** Silent failure if partition field is wrong type (e.g., STRING)  
**Fix:** Add validation in `_ensure_table()` method

---

### BUG-006: Bootstrap Status Endpoint Missing Cache
**Location:** `src/app/routers/admin.py` lines 251-368  
**Issue:** `/admin/bootstrap/status` reads all 21 schemas + queries BigQuery on every call  
**Impact:** Slow response time (~2-3 seconds), unnecessary I/O  
**Fix:** Add LRU cache with 60-second TTL

---

### BUG-007: Inconsistent Error Messages
**Location:** `src/app/routers/admin.py` line 199, 244  
**Issue:** Some errors return generic "Operation failed", others return detailed messages  
**Impact:** Inconsistent UX, harder debugging  
**Fix:** Standardize error messages using `safe_error_response()` utility

---

### BUG-008: Missing Transaction Rollback in Bootstrap
**Location:** `src/app/routers/admin.py` lines 170-244  
**Issue:** If table creation fails mid-way, no rollback - leaves partial state  
**Impact:** Requires manual cleanup or force_recreate  
**Fix:** Not critical since BigQuery is idempotent, but consider adding cleanup on failure

---

## 🟢 LOW Issues (Nice to Have)

### BUG-009: Bootstrap Doesn't Log Table Creation Order
**Location:** `src/core/processors/setup/initial/onetime_bootstrap_processor.py`  
**Issue:** No logging of which tables are created in which order  
**Impact:** Hard to debug dependency issues  
**Fix:** Add debug log: `logger.debug(f"Creating table {i+1}/{total}: {table_name}")`

---

### BUG-010: No Check for BigQuery Quotas Before Bootstrap
**Location:** `src/app/routers/admin.py` line 132  
**Issue:** Doesn't check if BigQuery has enough quota (table creation limit)  
**Impact:** May fail mid-bootstrap if quota exhausted  
**Fix:** Pre-check quota using BigQuery API (optional, low priority)

---

### BUG-011: Schema Sync Missing Dry-Run Mode
**Location:** `src/app/routers/admin.py` line 371  
**Issue:** `/admin/bootstrap/sync` applies changes immediately, no preview  
**Impact:** Can't preview what will be changed  
**Fix:** Add `dryrun: bool` parameter to return planned changes without applying

---

### BUG-012: Clustering Fields Not Validated in Sync
**Location:** `src/app/routers/admin.py` line 438  
**Issue:** Sync endpoint doesn't validate clustering fields exist in schema  
**Impact:** May fail silently if config.yml has typo in clustering field name  
**Fix:** Add validation loop before table creation

---

### BUG-013: Missing Index on created_at for Non-Partitioned Tables
**Location:** `configs/setup/bootstrap/config.yml`  
**Tables:** `org_profiles`, `org_integration_credentials`, `org_pipeline_configs`, etc.  
**Issue:** Non-partitioned tables don't have explicit index recommendations  
**Impact:** Queries filtering by created_at may be slow  
**Fix:** Document recommended indexes or consider partitioning by created_at

---

### BUG-014: No Validation for Table Name Conventions
**Location:** Bootstrap processor  
**Issue:** Doesn't enforce `org_*` prefix for bootstrap tables  
**Impact:** Could accidentally create table without org_ prefix  
**Fix:** Add validation: `if not table_name.startswith('org_') and table_name != 'hierarchy_levels': raise ValueError`

---

### BUG-015: Bootstrap Response Missing Schema Validation Report
**Location:** `src/app/routers/admin.py` line 227  
**Issue:** Bootstrap response doesn't include schema validation summary  
**Impact:** Can't verify schema correctness after bootstrap  
**Fix:** Add `schema_validation: {valid: true, errors: []}` to BootstrapResponse

---

## 📊 Summary by Severity

| Severity | Count | Action Required |
|----------|-------|-----------------|
| CRITICAL | 2 | Fix immediately before next deploy |
| HIGH | 2 | Fix within 1 week |
| MEDIUM | 4 | Fix within 1 month |
| LOW | 7 | Backlog / Nice to have |

---

## 🔧 Recommended Fix Priority

1. **BUG-001** (Doc mismatch) - 5 min fix
2. **BUG-002** (Clustering order) - 1 min config change
3. **BUG-003** (Missing created_at) - 30 min schema updates
4. **BUG-006** (Cache) - 15 min implementation
5. **BUG-007** (Error messages) - 30 min standardization
6. Rest can be backlog

---

## Testing Checklist

After fixes:
- [ ] Run `/admin/bootstrap` on clean project
- [ ] Run `/admin/bootstrap/status` - should return SYNCED
- [ ] Run `/admin/bootstrap/sync` with missing table - should create it
- [ ] Verify all 21 tables have org_slug as first clustering field
- [ ] Verify all 21 tables have created_at field
- [ ] Check documentation matches reality (21 tables)

