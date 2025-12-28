---
name: org-slug-isolation
enabled: true
event: all
pattern: (org_slug|org\.slug|orgSlug|organization.*slug|multi.?tenant|org_id)
action: warn
---

**Org Slug - Multi-Tenant Isolation**

**CRITICAL:** CloudAct uses `org_slug` (NOT `org_id`) for tenant isolation.

All data operations MUST include `org_slug` for tenant isolation.

**Validation:** `^[a-zA-Z0-9_]{3,50}$` (alphanumeric + underscore, 3-50 chars)

**BigQuery Patterns (ALWAYS parameterized):**
```sql
-- Standard filter
WHERE org_slug = @org_slug

-- Cost tables use SubAccountId
WHERE SubAccountId = @org_slug
```

**Multi-Layer Defense:**
1. **Dataset isolation:** `{org_slug}_prod`, `{org_slug}_stage`
2. **Query filter:** `WHERE org_slug = @org_slug` in all queries
3. **Auth validation:** API key lookup extracts `org_slug` from `OrgContext`
4. **Route check:** URL org_slug validated against auth context

**API Authentication:**
- `X-API-Key` header → validates org ownership via `org_api_keys` table
- Cross-tenant check: URL org_slug MUST match authenticated org_slug

**Key Tables with org_slug (organizations dataset):**
- `org_profiles` - Organization profiles
- `org_api_keys` - API keys (hashed)
- `org_integration_credentials` - Provider credentials (KMS encrypted)
- `org_subscriptions` - Plans/limits
- `org_usage_quotas` - Quota limits
- `org_audit_logs` - Audit trail
- `org_pipeline_configs` - Pipeline configurations
- `{org_slug}_prod.*` - All org-specific data tables
