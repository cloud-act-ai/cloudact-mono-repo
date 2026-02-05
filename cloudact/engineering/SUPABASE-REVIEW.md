# Supabase Database Review

**Review Date:** 2026-02-04  
**Reviewer:** E11 Subagent  
**Scope:** `/01-fronted-system/scripts/supabase_db/` and `/01-fronted-system/supabase/`

---

## Executive Summary

The CloudAct Supabase implementation is **generally well-designed** with comprehensive RLS policies, proper SECURITY DEFINER usage, and good multi-tenant isolation. However, there are several optimization opportunities and minor issues to address.

**Risk Level:** LOW to MEDIUM  
**Action Required:** Recommended cleanup and index additions

---

## 1. Migration File Optimization Opportunities

### 1.1 Duplicate Migration Prefixes ⚠️

Two migrations share the `02_` prefix:
- `02_stripe_first_migration.sql`
- `02_fix_rls_functions.sql`

**Recommendation:** Rename to ensure unique ordering. Suggested:
- `02a_stripe_first_migration.sql`
- `02b_fix_rls_functions.sql`

### 1.2 Role System Inconsistency 🔴

The schema defines three roles: `owner`, `collaborator`, `read_only`

However, some policies reference `admin` role which doesn't exist:
```sql
-- Migration 13, 17, etc.
AND role IN ('owner', 'admin')  -- 'admin' doesn't exist in schema!
```

**Impact:** These policies silently fail to match any `admin` users because none exist.

**Location:** 
- `13_rls_policies.sql`
- `17_rls_policy_fixes.sql`
- `32_rls_security_fixes.sql` (fix applied but uses 'admin')

**Recommendation:** Audit all policies and standardize on:
- `owner` = full admin privileges
- `collaborator` = edit access
- `read_only` = view only

### 1.3 Redundant Policy Definitions

Multiple migrations drop and recreate the same policies. This creates migration ordering dependencies:

| Policy | Defined In |
|--------|------------|
| `Admins can update members` | 13, 17, 35 |
| `organizations_select_member` | 01, 17 |
| `profiles_select_same_org` | 39 (overwrites 13) |

**Recommendation:** Create a "golden" migration that consolidates all final policies, then deprecate earlier versions.

### 1.4 Function Duplication

`user_is_org_admin()` and `user_is_org_owner()` are functionally identical in `01_production_setup.sql`:

```sql
-- Both check: role = 'owner'
-- user_is_org_admin was originally meant to include 'admin' role
```

**Recommendation:** Keep only `user_is_org_owner()` and deprecate `user_is_org_admin()`, or document the intended difference.

---

## 2. Missing Indexes

### 2.1 High Priority (Performance Impact)

| Table | Suggested Index | Reason |
|-------|----------------|--------|
| `profiles` | `idx_profiles_lower_email` ON `lower(email)` | Case-insensitive email lookups |
| `security_events` | `idx_security_events_composite` ON `(event_type, severity, created_at DESC)` | Combined filter queries |
| `org_quotas` | `idx_org_quotas_concurrent` ON `(org_id) WHERE concurrent_running > 0` | Active pipeline monitoring |

### 2.2 Medium Priority (Query Optimization)

| Table | Suggested Index | Reason |
|-------|----------------|--------|
| `organization_members` | `idx_org_members_role_status` ON `(org_id, role) WHERE status = 'active'` | Admin lookups |
| `invites` | `idx_invites_pending_email` ON `(email, status) WHERE status = 'pending'` | Invite acceptance flow |
| `cloud_provider_integrations` | `idx_cloud_integrations_validation` ON `(status, last_validated_at)` | Stale credential detection |

### 2.3 Index Migration Script

```sql
-- 43_index_optimizations.sql
-- Add missing indexes for performance

-- High Priority
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_lower_email 
  ON profiles(lower(email));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_security_events_composite 
  ON security_events(event_type, severity, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_quotas_concurrent 
  ON org_quotas(org_id) WHERE concurrent_running > 0;

-- Medium Priority
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_members_role_status 
  ON organization_members(org_id, role) WHERE status = 'active';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invites_pending_email 
  ON invites(email, status) WHERE status = 'pending';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cloud_integrations_validation 
  ON cloud_provider_integrations(status, last_validated_at);
```

---

## 3. RLS Policy Review

### 3.1 Security Issues (Fixed)

| Issue | Status | Migration |
|-------|--------|-----------|
| UPDATE without WITH CHECK | ✅ Fixed | 17, 32 |
| Role escalation vulnerability | ✅ Fixed | 35 |
| Cross-org profile visibility | ✅ Fixed | 39 |
| Owner protection bypass | ✅ Fixed | 01 (trigger) |

### 3.2 Outstanding Concerns

#### 3.2.1 `subscriptions` Table Policy Mismatch

Migration 13 creates policies for `subscriptions` table but migration 15 drops the table:
```sql
-- 15_drop_saas_subscriptions_table.sql
DROP TABLE IF EXISTS saas_subscriptions;  -- Note: different table name!
```

**Status:** Unclear if `subscriptions` table exists. Policies may be orphaned.

**Recommendation:** Verify table existence and clean up orphaned policies.

#### 3.2.2 Profile Email Visibility

The current policy in `39_security_hardening.sql` allows seeing profiles of **all** members in **all** your organizations:

```sql
-- This JOIN can be expensive with many orgs/members
SELECT om2.user_id
FROM organization_members om1
INNER JOIN organization_members om2 ON om1.org_id = om2.org_id
WHERE om1.user_id = auth.uid()
```

**Performance:** O(n×m) where n=your orgs, m=members per org

**Recommendation:** Consider caching or materializing this in app layer for large organizations.

#### 3.2.3 Service Role Policies

Service role has full access to critical tables:
- `organizations` (UPDATE)
- `profiles` (UPDATE)
- `org_quotas` (ALL)

**Status:** Intentional for webhooks/background jobs but increases attack surface if service role key is compromised.

**Recommendation:** Document service role key rotation procedures.

---

## 4. Schema Design Observations

### 4.1 Strengths ✅

1. **Atomic quota operations** - `increment_pipeline_count()` and `decrement_concurrent()` properly handle race conditions
2. **Audit trail** - `activity_logs` and `security_events` provide compliance coverage
3. **Soft delete patterns** - Uses `status` columns instead of hard deletes
4. **Trial management** - `trial_ends_at`, `subscription_started_at` properly track billing state
5. **Multi-credential support** - `cloud_provider_integrations` allows multiple credentials per provider

### 4.2 Potential Improvements

#### 4.2.1 Missing Foreign Key on `activity_logs.user_id`

```sql
-- Current: user_id UUID (no FK constraint visible)
-- Recommended: Add FK with ON DELETE SET NULL for audit preservation
```

#### 4.2.2 Consider Partitioning for `activity_logs`

For organizations with high activity:
```sql
-- Partition by created_at month
CREATE TABLE activity_logs_partitioned (
  LIKE activity_logs INCLUDING ALL
) PARTITION BY RANGE (created_at);
```

#### 4.2.3 Add `deleted_at` for Soft Delete

Current tables use `status` but a timestamp is more informative:
```sql
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
```

---

## 5. Configuration Review (`config.toml`)

### 5.1 Security Settings ✅

- ✅ Password minimum length: 8 (good)
- ✅ Refresh token rotation enabled
- ✅ Double confirm for email changes
- ✅ Password change notifications enabled

### 5.2 Recommendations

```toml
# Consider adding:
[auth.email]
minimum_password_length = 12  # Increase from 8

[auth]
jwt_expiry = 1800  # Reduce from 3600 to 30 min for sensitive data
```

---

## 6. Action Items

### Immediate (This Sprint)

1. [ ] Verify `subscriptions` table exists or remove orphaned policies
2. [ ] Create migration `43_index_optimizations.sql` with suggested indexes
3. [ ] Document service role key rotation procedure

### Short-Term (Next 2 Sprints)

4. [ ] Audit all policies for `admin` role references - replace with `owner`
5. [ ] Consolidate redundant policies into single authoritative migration
6. [ ] Add `deleted_at` columns for better audit trails

### Long-Term (Backlog)

7. [ ] Consider partitioning `activity_logs` and `security_events`
8. [ ] Evaluate materialized view for profile visibility performance
9. [ ] Add database-level encryption for sensitive columns

---

## 7. Test Queries

### Verify RLS Policies Work

```sql
-- Run as authenticated user
SET request.jwt.claim.sub = 'user-uuid-here';

-- Should return only user's orgs
SELECT * FROM organizations;

-- Should fail: cross-org profile access
SELECT * FROM profiles WHERE id != auth.uid();
```

### Check Index Usage

```sql
-- Show unused indexes
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY schemaname, tablename;
```

### Verify No Orphaned Policies

```sql
-- Find policies on non-existent tables
SELECT policyname, tablename 
FROM pg_policies 
WHERE tablename NOT IN (
  SELECT table_name FROM information_schema.tables 
  WHERE table_schema = 'public'
);
```

---

## Appendix: Migration Inventory

| # | File | Purpose | Status |
|---|------|---------|--------|
| 00 | migration_tracking.sql | Track applied migrations | ✅ |
| 01 | production_setup.sql | Base schema | ✅ |
| 02 | stripe_first_migration.sql | Billing schema | ✅ |
| 02 | fix_rls_functions.sql | RLS fixes | ⚠️ Duplicate prefix |
| 03 | webhook_idempotency.sql | Deduplication | ✅ |
| ... | ... | ... | ... |
| 39 | security_hardening.sql | Auth rate limiting, account lockout | ✅ |
| 42 | consolidate_quotas.sql | Unified quota system | ✅ |

**Total Migrations:** 42+  
**Tables Created:** ~15  
**RLS Policies:** ~40+  
**Helper Functions:** ~20+

---

*End of Review*
