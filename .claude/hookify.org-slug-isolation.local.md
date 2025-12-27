---
name: org-slug-isolation
enabled: true
event: all
pattern: (org_slug|org\.slug|orgSlug|organization.*slug|multi.?tenant)
action: warn
---

**Org Slug - Multi-Tenant Isolation**

All data operations MUST include `org_slug` for tenant isolation.

**Validation:** `^[a-zA-Z0-9_]{3,50}$` (alphanumeric + underscore, 3-50 chars)

**BigQuery Pattern:**
```sql
WHERE org_slug = @org_slug  -- ALWAYS filter by org
```

**API Authentication:**
- `X-API-Key` header → validates org ownership
- Query org_api_keys table to verify key belongs to org_slug

**Key Tables with org_slug:**
- `org_integration_credentials` - Provider credentials
- `org_api_keys` - API keys
- `org_subscriptions` - Plans/limits
- `{org_slug}_prod.*` - All org-specific data
