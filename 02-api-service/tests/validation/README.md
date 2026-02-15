# Input Validation Tests

Comprehensive validation and security tests for the API service. These tests ensure that malformed, malicious, or invalid inputs are properly rejected before reaching business logic.

## Test Coverage

### 1. org_slug Validation (^[a-z0-9_]{3,50}$)

**Invalid Cases (16 test scenarios):**
- Length: too short (< 3), too long (> 50)
- Special characters: hyphen, space, slash, backslash, dot, @, #, $, %, &, *, +, =, !, ?, [], {}, <>, |, ;, :, ', ", comma
- Path traversal: `../../../etc/passwd`, `..\\..\\..\\windows\\system32`, `%2e%2e%2f`
- Empty/whitespace: `""`, `" "`
- Case variations with invalid chars: `ORG-SLUG`, `Org_Slug`

**Valid Cases (8 test scenarios):**
- Minimum length: `abc`
- Maximum length: 50 characters
- Alphanumeric: `org123`
- With underscore: `org_123`
- Uppercase: `ORG_123`
- Mixed case: `Org_123`
- Common format: `test_org`
- Complex: `my_company_name_2025`

**Tests:**
- `test_invalid_org_slug_in_path` - Path parameter validation
- `test_valid_org_slug_in_path` - Accepts valid formats
- `test_invalid_org_slug_in_request_body` - Request body validation
- `test_valid_org_slug_in_request_body` (via dryrun tests)

### 2. Email Validation

**Invalid Cases (18 test scenarios):**
- Missing parts: no @, no local, no domain
- Spacing issues: space before/after @, in domain
- Dot issues: consecutive dots, leading/trailing dots, dot after @
- XSS attempts: `<script>` in local/domain
- SQL injection: `'; DROP TABLE users; --@example.com`
- Empty/whitespace

**Valid Cases (6 test scenarios):**
- Standard: `admin@example.com`
- With plus: `user+tag@example.com`
- With dot: `first.last@example.com`
- With underscore: `user_name@example.co.uk`
- Numeric: `123@example.com`
- Subdomain: `test@subdomain.example.com`

**Tests:**
- `test_invalid_email_in_onboarding` - Rejects invalid emails
- `test_valid_email_format_accepted` - Accepts valid emails

### 3. JSON Parsing

**Invalid Cases:**
- Malformed JSON: missing closing brace
- Invalid syntax: undefined, NaN, unquoted keys, single quotes, trailing commas
- Non-JSON content: plain text

**Tests:**
- `test_invalid_json_syntax` - Rejects malformed JSON
- `test_various_invalid_json_formats` - Multiple invalid formats

### 4. Required Fields

**Tests:**
- `test_missing_required_field_in_onboarding` - Tests each required field (org_slug, company_name, admin_email)
- `test_empty_request_body` - Rejects completely empty payload

### 5. Extra Fields Validation (Pydantic extra='forbid')

**Tests:**
- `test_extra_fields_rejected_in_onboarding` - Rejects unknown fields

### 6. Field Length Validation

**Tests:**
- `test_company_name_too_short` - min_length=2
- `test_company_name_too_long` - max_length=200

### 7. Subscription Plan Validation

**Invalid Cases (8 scenarios):**
- Unknown values, wrong case, SQL injection attempts

**Valid Cases:**
- STARTER, PROFESSIONAL, SCALE

**Tests:**
- `test_invalid_subscription_plan` - Rejects invalid plans
- `test_valid_subscription_plan` - Accepts valid plans

### 8. XSS Prevention

**Attack Vectors Tested:**
- `<script>alert('XSS')</script>`
- `<img src=x onerror=alert('XSS')>`
- `javascript:alert('XSS')`
- `<iframe src='javascript:alert(1)'></iframe>`
- `onload=alert('XSS')`

**Tests:**
- `test_xss_prevention_in_text_fields` - Verifies XSS payloads are rejected or sanitized

### 9. SQL Injection Prevention

**Attack Vectors Tested:**
- `'; DROP TABLE org_profiles; --`
- `' OR '1'='1`
- `1' UNION SELECT * FROM org_api_keys--`
- `'; DELETE FROM org_api_keys WHERE '1'='1`
- `admin' --`
- `admin'/*`
- `' OR 1=1--`
- `1; DROP DATABASE gac_prod_471220; --`

**Tests:**
- `test_sql_injection_prevention_in_org_slug` - Validates parameterized queries protect against injection

### 10. Integration Setup Validation

**Tests:**
- `test_integration_setup_missing_credential` - Requires credential field
- `test_integration_setup_credential_too_short` - min_length=10
- `test_integration_setup_credential_too_long` - max_length=100000

### 11. Authentication Headers

**Tests:**
- `test_missing_auth_header` - Requires X-CA-Root-Key or X-API-Key
- `test_invalid_auth_header_format` - Rejects empty/malformed headers

### 12. Content-Type Validation

**Tests:**
- `test_missing_content_type_header` - Handles missing Content-Type
- `test_wrong_content_type` - Rejects non-JSON content types

### 13. Type Validation

**Tests:**
- `test_wrong_type_for_boolean_field` - Rejects string for boolean
- `test_numeric_string_for_string_field` - Accepts numeric strings

### 14. Unicode and Special Characters

**Tests:**
- `test_unicode_in_company_name` - Handles Chinese/Japanese characters
- `test_emoji_in_company_name` - Handles emoji (🚀 💻)

### 15. Null and None Handling

**Tests:**
- `test_null_in_required_field` - Rejects null in required fields
- `test_null_in_optional_field` - Accepts null in optional fields

## Test Statistics

- **Total Tests:** 29 test functions
- **Parameterized Scenarios:** 60+ individual test cases
- **Coverage Areas:** 15 validation categories
- **Security Focus:** XSS, SQL injection, path traversal, malicious payloads

## Running the Tests

```bash
# All validation tests
cd /Users/gurukallam/prod-ready-apps/cloudact-mono-repo/02-api-service
python -m pytest tests/validation/ -v

# Specific test file
python -m pytest tests/validation/test_input_validation.py -v

# Run with coverage
python -m pytest tests/validation/ --cov=src.app.routers --cov-report=html

# Pattern matching
python -m pytest tests/validation/ -k "email" -v
python -m pytest tests/validation/ -k "sql_injection" -v
python -m pytest tests/validation/ -k "xss" -v
```

## Test Patterns

### Async Test Pattern
```python
@pytest.mark.asyncio
async def test_example():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/endpoint", json={...})
        assert response.status_code == 422
```

### Parameterized Tests
```python
@pytest.mark.parametrize("invalid_value,reason", [
    ("value1", "reason1"),
    ("value2", "reason2"),
])
async def test_validation(invalid_value, reason):
    # Test logic
```

## Expected Responses

| Validation Issue | Expected Status Code |
|------------------|---------------------|
| Invalid format (Pydantic validation) | 422 Unprocessable Entity |
| Missing auth header | 401 Unauthorized or 403 Forbidden |
| Missing required field | 422 Unprocessable Entity |
| Extra fields (strict mode) | 422 Unprocessable Entity |
| Malformed JSON | 422 Unprocessable Entity |
| Wrong Content-Type | 400 Bad Request or 422 |

## Security Validation Philosophy

These tests follow defense-in-depth principles:

1. **Input Validation** - Reject invalid formats at the API boundary
2. **Parameterized Queries** - SQL injection protection via BigQuery parameterized queries
3. **XSS Prevention** - Sanitize or reject HTML/script content
4. **Path Traversal** - Validate slugs to prevent directory traversal
5. **Type Safety** - Pydantic models enforce type constraints
6. **Length Limits** - Prevent buffer overflow and DoS attacks

## Integration with Existing Tests

These validation tests complement:
- `test_00_health.py` - Basic connectivity
- `test_01_bootstrap.py` - System initialization
- `test_02_organizations.py` - Business logic for orgs
- `test_03_integrations.py` - Integration workflows
- `tests/integration/test_auth_real.py` - Authentication edge cases

## Known Limitations

1. Some tests verify rejection OR safe handling (e.g., Unicode) - exact behavior may vary
2. Authentication-protected endpoints return 401/403 for invalid credentials, which masks some validation errors in unauthenticated tests
3. Tests focus on API-level validation; database-level constraints are tested separately

## Continuous Improvement

To add new validation tests:
1. Identify the validation rule (Pydantic model, manual validation)
2. Create parameterized test with valid and invalid cases
3. Document expected behavior and error messages
4. Add to this README with category and test count

---

**Last Updated:** 2025-12-12
**Total Test Count:** 29 tests, 60+ scenarios
**Maintainer:** See git blame for recent contributors
