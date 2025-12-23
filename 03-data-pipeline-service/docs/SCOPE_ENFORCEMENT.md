# Scope Enforcement Guide

This document explains the scope-based access control system in the Pipeline Service.

## Overview

The scope enforcement system provides fine-grained authorization control based on scopes assigned to API keys. It operates at two levels:

1. **Decorator-based**: Use `@require_scopes()` on specific endpoints
2. **Middleware-based**: Global route pattern matching via `ScopeEnforcementMiddleware`

## Scope Format

Scopes follow the format: `resource:action`

### Defined Scopes

```python
# Organization management
org:read         # View organization details
org:update       # Update organization settings
org:delete       # Delete organization

# Pipeline operations
pipelines:read     # View pipeline status and logs
pipelines:execute  # Run pipelines
pipelines:cancel   # Cancel running pipelines
pipelines:*        # All pipeline operations

# Integration management
integrations:read     # View integrations
integrations:create   # Create new integrations
integrations:update   # Update integrations
integrations:validate # Validate credentials
integrations:delete   # Delete integrations
integrations:*        # All integration operations

# User management
users:read    # View users
users:invite  # Invite new users
users:update  # Update user roles
users:remove  # Remove users
users:*       # All user operations

# API key management
api_keys:create  # Create API keys
api_keys:read    # View API keys
api_keys:revoke  # Revoke API keys
api_keys:*       # All API key operations

# Billing
billing:read   # View billing info
billing:update # Update billing
billing:*      # All billing operations

# Audit logs
audit:read  # View audit logs

# Admin wildcard
admin:*  # Full administrative access to all resources
*        # Complete access (root only)
```

## Role-Based Scopes

Pre-defined roles map to scope sets:

```python
ROLE_SCOPES = {
    "OWNER": [
        "org:*",
        "pipelines:*",
        "integrations:*",
        "users:*",
        "api_keys:*",
        "billing:*",
        "audit:read",
    ],
    "ADMIN": [
        "org:read",
        "org:update",
        "pipelines:*",
        "integrations:*",
        "users:read",
        "users:invite",
        "users:remove",
        "api_keys:create",
        "api_keys:read",
        "api_keys:revoke",
        "audit:read",
    ],
    "EDITOR": [
        "org:read",
        "pipelines:read",
        "pipelines:execute",
        "integrations:read",
        "integrations:create",
        "integrations:validate",
        "users:read",
    ],
    "VIEWER": [
        "org:read",
        "pipelines:read",
        "integrations:read",
        "users:read",
    ],
}
```

## Usage Patterns

### 1. Decorator-Based Enforcement (Recommended for Specific Endpoints)

Use the `@require_scopes()` decorator on endpoints for granular control:

```python
from fastapi import APIRouter, Depends
from src.app.middleware import require_scopes
from src.app.dependencies.auth import get_current_org

router = APIRouter()

@router.post("/pipelines/run/{org_slug}/{provider}/{domain}/{pipeline}")
@require_scopes("pipelines:execute")
async def trigger_pipeline(
    org: Dict = Depends(get_current_org),
    ...
):
    """Run pipeline - requires pipelines:execute scope."""
    pass

@router.delete("/pipelines/cancel/{run_id}")
@require_scopes("pipelines:cancel", "pipelines:execute", require_all=False)
async def cancel_pipeline(
    org: Dict = Depends(get_current_org),
    ...
):
    """Cancel pipeline - requires EITHER pipelines:cancel OR pipelines:execute."""
    pass

@router.post("/admin/users/invite")
@require_scopes("users:invite", "admin:*", require_all=False)
async def invite_user(
    org: Dict = Depends(get_current_org),
    ...
):
    """Invite user - requires users:invite OR admin:* scope."""
    pass
```

### 2. Middleware-Based Enforcement (Global Protection)

Enable middleware in `main.py` for defense-in-depth:

```python
from src.app.middleware import ScopeEnforcementMiddleware

# Add to main.py after CORSMiddleware
app.add_middleware(
    ScopeEnforcementMiddleware,
    route_scopes={
        # Custom route mappings (overrides defaults)
        "POST:/api/v1/pipelines/run/*": ["pipelines:execute"],
        "GET:/api/v1/pipelines/status/*": ["pipelines:read"],
        "DELETE:/api/v1/pipelines/cancel/*": ["pipelines:cancel"],
        "POST:/api/v1/admin/*": ["admin:*"],
    },
    # Paths exempt from scope checking
    exempt_paths=[
        "/health",
        "/health/live",
        "/health/ready",
        "/metrics",
        "/docs",
    ]
)
```

**Default Route Scopes** (if `route_scopes` not provided):

```python
{
    # Pipeline execution
    "POST:/api/v1/pipelines/run/*": ["pipelines:execute"],
    "GET:/api/v1/pipelines/runs/*": ["pipelines:read"],
    "GET:/api/v1/pipelines/status/*": ["pipelines:read"],
    "DELETE:/api/v1/pipelines/cancel/*": ["pipelines:cancel"],

    # Scheduler
    "POST:/api/v1/scheduler/trigger": ["pipelines:execute"],
    "GET:/api/v1/scheduler/queue": ["pipelines:read"],
    "POST:/api/v1/scheduler/queue/process": ["pipelines:execute"],

    # Procedures (admin only)
    "GET:/api/v1/procedures": ["admin:*"],
    "GET:/api/v1/procedures/*": ["admin:*"],
    "POST:/api/v1/procedures/*": ["admin:*"],
    "DELETE:/api/v1/procedures/*": ["admin:*"],

    # Migrations (admin only)
    "POST:/api/v1/migrations/*": ["admin:*"],

    # Integration management
    "GET:/api/v1/integrations/*": ["integrations:read"],
    "POST:/api/v1/integrations/*/setup": ["integrations:create"],
    "POST:/api/v1/integrations/*/validate": ["integrations:validate"],
    "DELETE:/api/v1/integrations/*": ["integrations:delete"],
}
```

### 3. Manual Validation in Code

Use helper functions for custom logic:

```python
from src.app.middleware import validate_scopes, has_scope, has_any_scope

async def custom_endpoint(org: Dict = Depends(get_current_org)):
    # Check if org has specific scope
    if has_scope(org["scopes"], "pipelines:execute"):
        # Execute pipeline
        pass

    # Check if org has ANY of multiple scopes
    if has_any_scope(org["scopes"], ["pipelines:execute", "admin:*"]):
        # Proceed
        pass

    # Validate scopes (raises HTTPException if missing)
    validate_scopes(org, ["pipelines:execute"], require_all=True)
```

## Wildcard Matching

Scopes support wildcard matching:

```python
# User has "pipelines:*"
has_scope(["pipelines:*"], "pipelines:execute")  # True
has_scope(["pipelines:*"], "pipelines:read")     # True
has_scope(["pipelines:*"], "pipelines:cancel")   # True

# User has "admin:*"
has_scope(["admin:*"], "pipelines:execute")   # False (admin:* only matches admin:*)
has_scope(["admin:*"], "org:delete")          # False

# User has "*" (root)
has_scope(["*"], "pipelines:execute")  # True
has_scope(["*"], "org:delete")         # True
has_scope(["*"], "anything:anything")  # True
```

## Scope Storage in BigQuery

Scopes are stored in the `organizations.org_api_keys` table:

```sql
CREATE TABLE organizations.org_api_keys (
    org_api_key_id STRING NOT NULL,
    org_slug STRING NOT NULL,
    org_api_key_hash STRING NOT NULL,
    scopes ARRAY<STRING>,  -- ["pipelines:execute", "integrations:read"]
    is_active BOOL,
    created_at TIMESTAMP,
    expires_at TIMESTAMP
);
```

### Adding Scopes to API Keys

```sql
-- Update existing API key with scopes
UPDATE `organizations.org_api_keys`
SET scopes = ["pipelines:execute", "pipelines:read", "integrations:read"]
WHERE org_api_key_id = 'key-uuid-here';

-- Create API key with scopes (during onboarding)
INSERT INTO `organizations.org_api_keys`
(org_api_key_id, org_slug, org_api_key_hash, scopes, is_active, created_at)
VALUES (
    GENERATE_UUID(),
    'acme_corp',
    'sha256_hash_here',
    ['pipelines:*', 'integrations:*', 'org:read'],  -- ADMIN-level scopes
    TRUE,
    CURRENT_TIMESTAMP()
);
```

## Authentication Flow

```
1. Request arrives with X-API-Key header
   │
   ├─ GET /api/v1/pipelines/run/acme/gcp/cost/billing
   │  Headers: X-API-Key: acme_api_abc123
   │
2. Auth middleware (get_current_org)
   │
   ├─ Hash API key: SHA256(acme_api_abc123)
   ├─ Query BigQuery:
   │    SELECT scopes FROM org_api_keys
   │    WHERE org_api_key_hash = 'hash...'
   │    AND is_active = TRUE
   │
   ├─ Returns org dict:
   │    {
   │      "org_slug": "acme_corp",
   │      "scopes": ["pipelines:execute", "pipelines:read"],
   │      "subscription": {...}
   │    }
   │
3. Scope enforcement middleware (if enabled)
   │
   ├─ Match route: POST /api/v1/pipelines/run/*
   ├─ Required scopes: ["pipelines:execute"]
   ├─ User scopes: ["pipelines:execute", "pipelines:read"]
   ├─ Check: has_any_scope(user_scopes, required_scopes)
   │
   ├─ ✓ PASS → Continue to endpoint
   │
4. Endpoint handler (optional decorator check)
   │
   ├─ @require_scopes("pipelines:execute")
   ├─ Validates org["scopes"] again
   │
   └─ Execute pipeline logic
```

## Error Responses

### 401 Unauthorized (Invalid API Key)

```json
{
  "detail": "Invalid or inactive API key"
}
```

### 403 Forbidden (Missing Scopes)

```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions. Required scopes: pipelines:execute",
  "required_scopes": ["pipelines:execute"]
}
```

**From decorator:**

```json
{
  "detail": "Missing required scopes: pipelines:execute"
}
```

## Testing

### Unit Tests

```python
from src.app.middleware import has_scope, has_any_scope, validate_scopes

def test_wildcard_matching():
    # Test wildcard scope matching
    assert has_scope(["pipelines:*"], "pipelines:execute") == True
    assert has_scope(["pipelines:read"], "pipelines:execute") == False
    assert has_scope(["*"], "anything:anything") == True

def test_any_scope():
    user_scopes = ["pipelines:read", "integrations:read"]
    assert has_any_scope(user_scopes, ["pipelines:execute", "pipelines:read"]) == True
    assert has_any_scope(user_scopes, ["pipelines:execute", "admin:*"]) == False
```

### Integration Tests

```bash
# Create test API key with limited scopes
curl -X POST "http://localhost:8000/api/v1/admin/test-api-key" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "org_slug": "test_org",
    "scopes": ["pipelines:read"]
  }'

# Try to execute pipeline (should fail - only has read scope)
curl -X POST "http://localhost:8001/api/v1/pipelines/run/test_org/gcp/cost/billing" \
  -H "X-API-Key: $TEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-12-01"}'

# Expected: 403 Forbidden
# {
#   "error": "Forbidden",
#   "message": "Insufficient permissions. Required scopes: pipelines:execute",
#   "required_scopes": ["pipelines:execute"]
# }
```

## Best Practices

1. **Defense in Depth**: Use both middleware and decorator for critical endpoints
2. **Least Privilege**: Grant minimum scopes needed for the use case
3. **Wildcard Sparingly**: Only use `*` wildcards for root/admin keys
4. **Audit Logging**: Log scope denials for security monitoring
5. **Scope Expiry**: Rotate API keys periodically, especially admin keys
6. **Documentation**: Document required scopes in endpoint docstrings

## Migration Guide

### Existing Endpoints

To add scope enforcement to existing endpoints:

**Before:**
```python
@router.post("/pipelines/run/{org_slug}/{provider}/{domain}/{pipeline}")
async def trigger_pipeline(
    org: Dict = Depends(get_current_org),
    ...
):
    pass
```

**After:**
```python
@router.post("/pipelines/run/{org_slug}/{provider}/{domain}/{pipeline}")
@require_scopes("pipelines:execute")
async def trigger_pipeline(
    org: Dict = Depends(get_current_org),
    ...
):
    """Run pipeline - requires pipelines:execute scope."""
    pass
```

### Existing API Keys

Add scopes to existing API keys:

```sql
-- Default scopes for ADMIN role
UPDATE `organizations.org_api_keys`
SET scopes = [
    'org:read',
    'org:update',
    'pipelines:*',
    'integrations:*',
    'users:read',
    'users:invite',
    'users:remove',
    'api_keys:create',
    'api_keys:read',
    'api_keys:revoke',
    'audit:read'
]
WHERE scopes IS NULL OR ARRAY_LENGTH(scopes) = 0;
```

## Security Considerations

1. **No Scopes = Deny**: API keys without scopes are denied by default
2. **Timing Attacks**: Scope checks use constant-time comparison for wildcards
3. **Logging**: Failed scope checks are logged with org_slug and required scopes
4. **Rate Limiting**: Scope failures don't bypass rate limiting
5. **Audit Trail**: All scope checks logged to `org_audit_logs` table

## Troubleshooting

### "No scopes defined for org" error

**Cause**: API key has empty or null `scopes` array

**Solution**:
```sql
UPDATE `organizations.org_api_keys`
SET scopes = ['pipelines:*', 'integrations:*', 'org:read']
WHERE org_api_key_id = 'your-key-id';
```

### Middleware not enforcing scopes

**Cause**: Middleware runs before auth dependency, so it can't access scopes

**Solution**: Use decorator-based enforcement, or ensure middleware order is correct

### Wildcard not matching

**Cause**: Wildcards only match within same prefix

```python
# This does NOT work:
has_scope(["pipelines:*"], "integrations:read")  # False

# This works:
has_scope(["pipelines:*"], "pipelines:execute")  # True
```

---

**Last Updated:** 2025-12-21
**Version:** 1.0
