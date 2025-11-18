# QA Testing Guide - Request Size Limits & Test API Keys

## Quick Start

### 1. Enable Test Mode

Add to `.env`:
```bash
ENABLE_DEV_MODE=true
```

### 2. Start Server

```bash
uvicorn src.app.main:app --reload --port 8080
```

### 3. Run Automated Tests

```bash
python test_request_size_limits.py
```

Expected: All 5 tests pass (API auth + 4 size limit tests)

## Test API Keys

Use these keys in your `X-API-Key` header:

| Key | Customer | Plan | Use Case |
|-----|----------|------|----------|
| `test_key_acme_inc` | acmeinc_23xv2 | ENTERPRISE | General testing, high limits |
| `test_key_startup_co` | startup_99zt8 | STARTER | Testing quota limits |
| `test_key_enterprise_xyz` | enterprise_xyz_77kp5 | ENTERPRISE_PLUS | Admin operations |

## Request Size Limit Specs

**Limit:** 10 MB (10,485,760 bytes)

**Behavior:**
- Requests ≤ 10MB: Accepted (HTTP 200)
- Requests > 10MB: Rejected (HTTP 413)
- Rejection happens BEFORE body parsing (fast)

**Error Response:**
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

## Common Issues & Solutions

### Issue: "argument list too long" error

**Cause:** Shell limitation when passing large data via command line

**Wrong:**
```bash
curl -d '{"huge": "data..."}' http://localhost:8080/api/...
```

**Correct:**
```bash
echo '{"huge": "data..."}' > payload.json
curl -d @payload.json http://localhost:8080/api/...
```

### Issue: Test keys not working (HTTP 401)

**Checklist:**
1. ✓ `ENABLE_DEV_MODE=true` in `.env`?
2. ✓ Server restarted after changing `.env`?
3. ✓ Using exact key: `test_key_acme_inc` (no typos)?
4. ✓ Header format: `X-API-Key: test_key_acme_inc`?

**Verify in logs:**
```
[DEV MODE] Using test API key for customer: acmeinc_23xv2
```

### Issue: Large requests not rejected

**Checklist:**
1. ✓ Using file-based payload (`-d @file.json`)?
2. ✓ `Content-Length` header set correctly?
3. ✓ Not hitting excluded paths (`/health`, `/docs`)?

**Test middleware:**
```bash
# Should get HTTP 413:
dd if=/dev/zero bs=1M count=11 | \
  curl -X POST \
  -H "X-API-Key: test_key_acme_inc" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @- \
  http://localhost:8080/api/v1/test
```

## Test Cases

### Test 1: Valid Authentication
```bash
curl -H "X-API-Key: test_key_acme_inc" \
     http://localhost:8080/health
```
**Expected:** HTTP 200

### Test 2: Invalid API Key
```bash
curl -H "X-API-Key: invalid_key" \
     http://localhost:8080/health
```
**Expected:** HTTP 401

### Test 3: Small Request (1MB)
```bash
# Create 1MB file
dd if=/dev/zero of=/tmp/1mb.bin bs=1M count=1

# Send request
curl -X POST \
  -H "X-API-Key: test_key_acme_inc" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @/tmp/1mb.bin \
  http://localhost:8080/api/v1/test
```
**Expected:** Request accepted (HTTP 200 or valid endpoint response)

### Test 4: Large Request (11MB - Over Limit)
```bash
# Create 11MB file
dd if=/dev/zero of=/tmp/11mb.bin bs=1M count=11

# Send request
curl -X POST \
  -H "X-API-Key: test_key_acme_inc" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @/tmp/11mb.bin \
  http://localhost:8080/api/v1/test
```
**Expected:** HTTP 413 with PAYLOAD_TOO_LARGE error

### Test 5: Just Under Limit (9MB)
```bash
# Create 9MB file
dd if=/dev/zero of=/tmp/9mb.bin bs=1M count=9

# Send request
curl -X POST \
  -H "X-API-Key: test_key_acme_inc" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @/tmp/9mb.bin \
  http://localhost:8080/api/v1/test
```
**Expected:** Request accepted

### Test 6: Huge Request (50MB)
```bash
# Create 50MB file
dd if=/dev/zero of=/tmp/50mb.bin bs=1M count=50

# Send request
curl -X POST \
  -H "X-API-Key: test_key_acme_inc" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @/tmp/50mb.bin \
  http://localhost:8080/api/v1/test
```
**Expected:** HTTP 413 with PAYLOAD_TOO_LARGE error

## Automated Test Script

The `test_request_size_limits.py` script runs all these tests automatically:

```bash
python test_request_size_limits.py
```

**Output example:**
```
====================================================================
Test: API Key Authentication
====================================================================
Testing authentication with API key: test_key_acme_inc...
Response: HTTP 200
✓ PASS: Authentication successful

====================================================================
Test: 1MB payload -> Expected HTTP 200
====================================================================
Created test payload: /tmp/tmp_xyz.json (1.02 MB)
Sending 1.0MB request to http://localhost:8080/health...
Response: HTTP 200
✓ PASS: Got expected HTTP 200

...

====================================================================
TEST SUMMARY
====================================================================
✓ API Key Auth: PASS
✓ 1MB payload (OK): PASS
✓ 9MB payload (OK): PASS
✓ 11MB payload (REJECT): PASS
✓ 50MB payload (REJECT): PASS

Total: 5 passed, 0 failed
```

## Files Reference

- `test_api_keys.json` - Test API key definitions
- `test_request_size_limits.py` - Automated test script
- `TEST_API_KEYS_README.md` - Detailed documentation
- `QA_TEST_GUIDE.md` - This quick reference guide

## Security Notes

**⚠️ Test keys are ONLY active when:**
- `ENABLE_DEV_MODE=true` OR
- `ENVIRONMENT=development`

**In production:**
- Test keys are ignored
- Only real BigQuery-backed API keys work
- All auth goes through customers dataset

**DO NOT set `ENABLE_DEV_MODE=true` in production!**
