# Test API Keys Infrastructure for QA Testing

## Overview

This document describes the test API keys infrastructure for QA testing without requiring production BigQuery credentials.

## Components

### 1. Test API Keys File (`test_api_keys.json`)

Contains 3 test API keys with different subscription levels:

| API Key | Customer ID | Plan | Daily Limit | Monthly Limit | Concurrent |
|---------|-------------|------|-------------|---------------|------------|
| `test_key_acme_inc` | acmeinc_23xv2 | ENTERPRISE | 999,999 | 999,999 | 100 |
| `test_key_startup_co` | startup_99zt8 | STARTER | 100 | 3,000 | 5 |
| `test_key_enterprise_xyz` | enterprise_xyz_77kp5 | ENTERPRISE_PLUS | 999,999 | 999,999 | 500 |

### 2. Authentication Updates

**File:** `src/app/dependencies/auth.py`

Added test API key support in `get_current_customer()` function:
- Checks `ENABLE_DEV_MODE` environment variable
- Falls back to test keys if enabled
- Returns full customer profile with subscription details
- No BigQuery queries needed for test keys

### 3. Environment Configuration

**New environment variable:** `ENABLE_DEV_MODE`

Add to `.env`:
```bash
ENABLE_DEV_MODE=true
```

This enables test API keys from `test_api_keys.json`.

## Usage

### Setup

1. **Enable dev mode** in `.env`:
   ```bash
   ENABLE_DEV_MODE=true
   ```

2. **Start the server**:
   ```bash
   uvicorn src.app.main:app --reload --port 8080
   ```

### Using Test API Keys

#### Example 1: Basic Health Check
```bash
curl -H "X-API-Key: test_key_acme_inc" \
     http://localhost:8080/health
```

#### Example 2: Pipeline Status
```bash
curl -H "X-API-Key: test_key_acme_inc" \
     http://localhost:8080/api/v1/pipelines/status
```

#### Example 3: Customer Profile
```bash
curl -H "X-API-Key: test_key_startup_co" \
     http://localhost:8080/api/v1/customers/profile
```

#### Example 4: Admin Operations (requires admin scopes)
```bash
curl -H "X-API-Key: test_key_enterprise_xyz" \
     http://localhost:8080/api/v1/admin/tenants
```

### Request Size Limit Testing

Run the automated test script:

```bash
python test_request_size_limits.py
```

This script tests:
1. API key authentication works
2. Requests under 10MB are accepted (1MB test)
3. Requests just under limit are accepted (9MB test)
4. Requests over 10MB are rejected with HTTP 413 (11MB test)
5. Large requests are rejected (50MB test)

**Expected output:**
```
Test: API Key Authentication
✓ PASS: Authentication successful

Test: 1MB payload -> Expected HTTP 200
✓ PASS: Got expected HTTP 200

Test: 9MB payload -> Expected HTTP 200
✓ PASS: Got expected HTTP 200

Test: 11MB payload -> Expected HTTP 413
✓ PASS: Got expected HTTP 413

Test: 50MB payload -> Expected HTTP 413
✓ PASS: Got expected HTTP 413

Total: 5 passed, 0 failed
```

## Request Size Limit Implementation

### Middleware Details

**File:** `src/app/middleware/validation.py`

**Configuration:**
- `MAX_REQUEST_SIZE_BYTES = 10 * 1024 * 1024` (10 MB)
- `MAX_HEADER_SIZE_BYTES = 8 * 1024` (8 KB)

**How it works:**
1. Middleware reads `Content-Length` header
2. Rejects requests > 10MB with HTTP 413 before parsing body
3. Returns structured error response with size details

**Response format for oversized requests:**
```json
{
  "error": "PAYLOAD_TOO_LARGE",
  "message": "Request payload too large",
  "details": {
    "size": 11534336,
    "max_size": 10485760,
    "size_mb": 11.0,
    "max_size_mb": 10.0
  },
  "category": "VALIDATION",
  "http_status": 413
}
```

### Why Shell Errors Occur

**Problem:** Test 8 in the original QA suite failed with "argument list too long"

**Reason:** This is a shell limitation, NOT a middleware issue:
- Bash limits command line arguments to ~2MB
- Trying to pass 10MB+ JSON via `curl -d '...'` exceeds this limit
- The error happens BEFORE the HTTP request is even sent

**Solution:** Use file-based payloads:
```bash
# DON'T DO THIS (will fail at shell level):
curl -d '{"huge": "data here..."}' http://...

# DO THIS (will reach middleware for proper rejection):
curl -d @large_payload.json http://...
```

## Security Considerations

### Production Safety

Test API keys are **ONLY** active when:
1. `ENABLE_DEV_MODE=true` in environment, OR
2. `ENVIRONMENT=development` in settings

In production (`ENVIRONMENT=production`):
- Test keys are ignored
- Only real BigQuery-backed API keys work
- All authentication goes through customers dataset

### Test Key Limitations

Test keys bypass:
- BigQuery credential validation
- Quota tracking in `customer_usage_quotas` table
- Last used timestamp updates
- Subscription expiration checks

**DO NOT use test keys in production!**

## Troubleshooting

### Test keys not working

**Check:**
1. `ENABLE_DEV_MODE=true` in `.env`
2. Server restarted after changing `.env`
3. Using exact API key string from `test_api_keys.json`
4. Header format: `X-API-Key: test_key_acme_inc` (no extra spaces)

**Logs to check:**
```
[DEV MODE] Using test API key for customer: acmeinc_23xv2
```

If you see this log, test keys are working.

### Request size limits not enforcing

**Check:**
1. Sending payload via file (`-d @file.json`), not command line
2. Content-Length header is set correctly
3. Middleware is registered in `src/app/main.py` (line 198-201)
4. Not hitting excluded paths (`/health`, `/docs`, etc.)

**Verify middleware is active:**
```bash
# Should be rejected with HTTP 413:
dd if=/dev/zero bs=1M count=11 | curl -X POST \
  -H "X-API-Key: test_key_acme_inc" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @- \
  http://localhost:8080/api/v1/test
```

## Integration with Existing QA Suite

Update your QA test scripts to:

1. **Use test API keys:**
   ```bash
   API_KEY="test_key_acme_inc"
   ```

2. **Use file-based payloads for large requests:**
   ```bash
   # Create payload file
   echo '{"large": "data"}' > /tmp/payload.json

   # Send from file
   curl -H "X-API-Key: $API_KEY" -d @/tmp/payload.json http://...
   ```

3. **Enable dev mode before running tests:**
   ```bash
   export ENABLE_DEV_MODE=true
   python -m pytest tests/
   ```

## Files Modified

1. **Created:**
   - `test_api_keys.json` - Test API key definitions
   - `test_request_size_limits.py` - Automated test script
   - `TEST_API_KEYS_README.md` - This documentation

2. **Updated:**
   - `src/app/dependencies/auth.py` - Added test key support
   - `.env` - Added `ENABLE_DEV_MODE=true`
   - `.env.example` - Documented new env var

3. **Verified (no changes needed):**
   - `src/app/middleware/validation.py` - Request size limit middleware working
   - `src/app/main.py` - Middleware properly registered

## Next Steps

1. Run `test_request_size_limits.py` to verify everything works
2. Update your QA test suite to use test API keys
3. Convert shell-based large payload tests to file-based tests
4. Document test API keys in your QA procedures
5. Set `ENABLE_DEV_MODE=false` in production environments
