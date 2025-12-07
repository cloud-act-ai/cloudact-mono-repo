# Security Utilities Quick Reference

**For Developers**: How to use the new security utilities in your code.

---

## Error Handling

### Import
```python
from src.core.utils.error_handling import (
    safe_error_response,
    handle_not_found,
    handle_forbidden,
    handle_validation_error,
    handle_conflict
)
```

### Usage

#### Generic Error (catches everything)
```python
try:
    # Your code here
    result = perform_operation()
except HTTPException:
    raise  # Re-raise HTTP exceptions as-is
except Exception as e:
    raise safe_error_response(
        error=e,
        operation="retrieve user data",
        context={"user_id": user_id, "org_slug": org_slug}
    )
```

#### Not Found
```python
if not results:
    raise handle_not_found(
        resource_type="Organization",
        resource_id=org_slug,
        context={"reason": "no_subscription"}
    )
```

#### Forbidden (Authorization)
```python
if not auth.is_admin and auth.org_slug != org_slug:
    raise handle_forbidden(
        reason="Access denied",
        context={"org_slug": org_slug, "auth_org": auth.org_slug}
    )
```

#### Validation Error
```python
if not validate_format(value):
    raise handle_validation_error(
        field="api_key",
        message="API key must be at least 32 characters",
        context={"length": len(value)}
    )
```

#### Conflict (Duplicate)
```python
if resource_exists:
    raise handle_conflict(
        resource_type="API Key",
        message="Organization already has an active API key"
    )
```

---

## Audit Logging

### Import
```python
from src.core.utils.audit_logger import (
    log_create,
    log_update,
    log_delete,
    log_execute,
    log_audit,
    AuditLogger
)
```

### Usage

#### Create Operation
```python
await log_create(
    org_slug=org_slug,
    resource_type=AuditLogger.RESOURCE_ORG,
    resource_id=org_slug,
    details={
        "company_name": request.company_name,
        "subscription_plan": request.subscription_plan
    },
    status=AuditLogger.STATUS_SUCCESS
)
```

#### Update Operation
```python
await log_update(
    org_slug=org_slug,
    resource_type=AuditLogger.RESOURCE_SUBSCRIPTION,
    resource_id=subscription_id,
    details={
        "old_plan": "STARTER",
        "new_plan": "PROFESSIONAL"
    },
    status=AuditLogger.STATUS_SUCCESS
)
```

#### Delete Operation
```python
await log_delete(
    org_slug=org_slug,
    resource_type=AuditLogger.RESOURCE_API_KEY,
    resource_id=api_key_id,
    status=AuditLogger.STATUS_SUCCESS
)
```

#### Execute Operation (Pipelines)
```python
await log_execute(
    org_slug=org_slug,
    resource_type=AuditLogger.RESOURCE_PIPELINE,
    resource_id=pipeline_id,
    details={
        "provider": "openai",
        "duration_seconds": 12.5
    },
    status=AuditLogger.STATUS_SUCCESS
)
```

#### Failed Operation
```python
try:
    perform_operation()
    status = AuditLogger.STATUS_SUCCESS
except Exception as e:
    status = AuditLogger.STATUS_FAILURE
    error_message = str(e)
finally:
    await log_audit(
        org_slug=org_slug,
        action=AuditLogger.ACTION_CREATE,
        resource_type=AuditLogger.RESOURCE_INTEGRATION,
        status=status,
        error_message=error_message if status == AuditLogger.STATUS_FAILURE else None
    )
```

### Available Constants

#### Actions
```python
AuditLogger.ACTION_CREATE
AuditLogger.ACTION_READ
AuditLogger.ACTION_UPDATE
AuditLogger.ACTION_DELETE
AuditLogger.ACTION_EXECUTE
AuditLogger.ACTION_ROTATE
```

#### Resource Types
```python
AuditLogger.RESOURCE_ORG
AuditLogger.RESOURCE_API_KEY
AuditLogger.RESOURCE_USER
AuditLogger.RESOURCE_INTEGRATION
AuditLogger.RESOURCE_CREDENTIAL
AuditLogger.RESOURCE_PIPELINE
AuditLogger.RESOURCE_SUBSCRIPTION
AuditLogger.RESOURCE_QUOTA
```

#### Status
```python
AuditLogger.STATUS_SUCCESS
AuditLogger.STATUS_FAILURE
AuditLogger.STATUS_DENIED
```

---

## Input Validation

### Import
```python
from src.core.utils.validators import (
    validate_org_slug,
    validate_email,
    validate_date,
    validate_api_key_format,
    validate_provider_name,
    validate_string_length,
    validate_integer_range,
    validate_json_size,
    sanitize_sql_identifier
)
```

### Usage

#### Org Slug
```python
# Raises ValidationError if invalid
org_slug = validate_org_slug(org_slug)

# Pattern: ^[a-zA-Z0-9_]{3,50}$
```

#### Email
```python
# Returns normalized (lowercase) email
email = validate_email(email)

# Validates: format, length, domain
```

#### Date
```python
# Returns datetime.date object
parsed_date = validate_date(date_str)

# Format: YYYY-MM-DD
# Range: 1900 to (current_year + 100)
```

#### API Key
```python
# Validates length and format
api_key = validate_api_key_format(api_key)

# Min: 32 chars
# Max: 512 chars
# Pattern: ^[a-zA-Z0-9_-]{32,}$
```

#### Provider Name
```python
# Returns lowercase, validates against whitelist
provider = validate_provider_name(provider)

# Valid: openai, anthropic, gemini, gcp, aws, azure
```

#### String Length
```python
value = validate_string_length(
    value=value,
    min_length=3,
    max_length=100,
    field_name="company_name"
)
```

#### Integer Range
```python
value = validate_integer_range(
    value=value,
    min_value=1,
    max_value=1000,
    field_name="daily_limit"
)
```

#### JSON Size
```python
data = validate_json_size(
    json_data=request_body,
    max_size_kb=100,
    field_name="request"
)
```

#### SQL Identifier (prevent injection)
```python
table_name = sanitize_sql_identifier(
    identifier=user_input,
    field_name="table_name"
)

# Only allows: a-z, A-Z, 0-9, _
# Blocks SQL reserved words
```

---

## Rate Limiting

### Import
```python
from src.app.dependencies.rate_limit_decorator import (
    rate_limit_by_org,
    rate_limit_global
)
```

### Usage

#### Per-Organization Rate Limit
```python
from fastapi import Request

@router.get("/organizations/{org_slug}/data")
async def get_data(
    org_slug: str,
    request: Request,
    auth: AuthResult = Depends(get_org_or_admin_auth)
):
    # Apply rate limiting
    await rate_limit_by_org(
        request=request,
        org_slug=org_slug,
        limit_per_minute=100,  # 100 requests per minute
        endpoint_name="get_data"
    )

    # Your code here
    ...
```

#### Global Rate Limit (unauthenticated endpoints)
```python
from fastapi import Request

@router.post("/public/webhook")
async def webhook(
    request: Request
):
    # Apply global rate limiting
    await rate_limit_global(
        request=request,
        endpoint_name="webhook",
        limit_per_minute=10  # 10 requests per minute globally
    )

    # Your code here
    ...
```

### Response Headers
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1701901200
```

---

## Complete Example: Secure Endpoint

```python
from fastapi import APIRouter, Depends, Request
from src.app.dependencies.auth import get_org_or_admin_auth, AuthResult
from src.app.dependencies.rate_limit_decorator import rate_limit_by_org
from src.core.utils.error_handling import safe_error_response, handle_forbidden, handle_not_found
from src.core.utils.validators import validate_org_slug, validate_date
from src.core.utils.audit_logger import log_execute, AuditLogger

router = APIRouter()

@router.post("/organizations/{org_slug}/process-data")
async def process_data(
    org_slug: str,
    date: str,
    request: Request,
    auth: AuthResult = Depends(get_org_or_admin_auth)
):
    """
    Secure endpoint with:
    - Input validation
    - Rate limiting
    - Error handling
    - Audit logging
    """

    # 1. Input validation
    validate_org_slug(org_slug)
    parsed_date = validate_date(date)

    # 2. Rate limiting
    await rate_limit_by_org(
        request=request,
        org_slug=org_slug,
        limit_per_minute=50,
        endpoint_name="process_data"
    )

    # 3. Authorization check
    if not auth.is_admin and auth.org_slug != org_slug:
        raise handle_forbidden(
            reason="Access denied",
            context={"org_slug": org_slug, "auth_org": auth.org_slug}
        )

    try:
        # 4. Business logic
        result = perform_processing(org_slug, parsed_date)

        # 5. Audit logging (success)
        await log_execute(
            org_slug=org_slug,
            resource_type=AuditLogger.RESOURCE_PIPELINE,
            resource_id=f"process_{org_slug}_{date}",
            details={
                "date": str(parsed_date),
                "rows_processed": result.get("row_count")
            },
            status=AuditLogger.STATUS_SUCCESS
        )

        return result

    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except Exception as e:
        # 6. Audit logging (failure)
        await log_execute(
            org_slug=org_slug,
            resource_type=AuditLogger.RESOURCE_PIPELINE,
            status=AuditLogger.STATUS_FAILURE,
            error_message=str(e)
        )

        # 7. Generic error response
        raise safe_error_response(
            error=e,
            operation="process data",
            context={"org_slug": org_slug, "date": str(parsed_date)}
        )
```

---

## Error Response Formats

### Validation Error
```json
{
  "error": "validation_error",
  "field": "org_slug",
  "message": "Organization slug must be alphanumeric with underscores, 3-50 characters",
  "error_id": "ERR-A1B2C3D4E5F6"
}
```

### Not Found
```json
{
  "error": "not_found",
  "message": "Organization not found",
  "error_id": "ERR-B2C3D4E5F6A1"
}
```

### Forbidden
```json
{
  "error": "forbidden",
  "message": "Access denied",
  "error_id": "ERR-C3D4E5F6A1B2"
}
```

### Generic Error
```json
{
  "error": "internal_error",
  "message": "Failed to complete operation. Please try again or contact support.",
  "error_id": "ERR-D4E5F6A1B2C3",
  "support_message": "Please provide error ID ERR-D4E5F6A1B2C3 when contacting support."
}
```

### Rate Limit Exceeded
```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests for org acme",
  "retry_after": 1701901200
}
```

---

## Best Practices

### 1. Always Validate Input First
```python
# ✅ Good
validate_org_slug(org_slug)
validate_email(email)
# ... then proceed with business logic

# ❌ Bad
# Business logic without validation
```

### 2. Use try/except with safe_error_response
```python
# ✅ Good
try:
    result = operation()
except HTTPException:
    raise
except Exception as e:
    raise safe_error_response(error=e, operation="operation name")

# ❌ Bad
try:
    result = operation()
except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))  # Leaks details!
```

### 3. Audit All Mutations
```python
# ✅ Good
result = create_resource()
await log_create(org_slug=org_slug, resource_type=..., status=...)

# ❌ Bad
result = create_resource()
# No audit log
```

### 4. Rate Limit Expensive Operations
```python
# ✅ Good - Rate limit before expensive operation
await rate_limit_by_org(request, org_slug, limit_per_minute=10)
result = expensive_operation()

# ❌ Bad - No rate limiting
result = expensive_operation()
```

### 5. Use Specific Error Handlers
```python
# ✅ Good - Use specific handlers
if not found:
    raise handle_not_found(resource_type="User", resource_id=user_id)

# ❌ Bad - Generic HTTP exception
if not found:
    raise HTTPException(status_code=404, detail="User not found")
```

---

## Testing Your Code

### Test Error Handling
```python
def test_error_handling():
    response = client.get("/invalid-endpoint")
    assert response.status_code == 500
    assert "error_id" in response.json()
    assert "traceback" not in response.json()  # No stack trace!
```

### Test Rate Limiting
```python
def test_rate_limiting():
    for i in range(101):
        response = client.get("/endpoint")
    assert response.status_code == 429
```

### Test Validation
```python
def test_validation():
    response = client.post("/endpoint", json={"org_slug": "invalid!!!"})
    assert response.status_code == 400
    assert response.json()["error"] == "validation_error"
```

### Test Audit Logging
```python
def test_audit_logging():
    client.post("/create-resource")
    logs = query_audit_logs(org_slug="test")
    assert len(logs) == 1
    assert logs[0]["action"] == "CREATE"
```

---

## Quick Checklist for New Endpoints

When creating a new endpoint, ensure:

- [ ] Input validation for all parameters
- [ ] Rate limiting (if needed)
- [ ] Authorization check
- [ ] Error handling with safe_error_response
- [ ] Audit logging for mutations
- [ ] No sensitive data in error responses
- [ ] Integration tests

---

## Questions?

See full documentation:
- `SECURITY_HARDENING_PHASE6_SUMMARY.md` - Complete implementation details
- `api-service/src/core/utils/error_handling.py` - Error handling code
- `api-service/src/core/utils/audit_logger.py` - Audit logging code
- `api-service/src/core/utils/validators.py` - Validation code
