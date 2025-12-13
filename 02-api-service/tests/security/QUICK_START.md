# Security Tests - Quick Start Guide

## 🚀 Run All Security Tests (30 seconds)

```bash
cd /Users/gurukallam/prod-ready-apps/cloudact-mono-repo/02-api-service
pytest -m "security and not integration" tests/security/test_auth_security.py -v
```

**Expected:** ✅ 15/15 passed in ~16 seconds

## 🔐 What Gets Tested?

- ✅ Missing/invalid API keys (X-CA-Root-Key, X-API-Key)
- ✅ SQL injection prevention
- ✅ Path traversal prevention  
- ✅ Header injection prevention
- ✅ XSS prevention
- ✅ NULL byte injection prevention
- ✅ Rate limiting
- ✅ Production security config
- ✅ SHA-256 key hashing

## 🧪 Run Integration Tests (Requires BigQuery)

```bash
# Setup
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
export GCP_PROJECT_ID=your-project
export CA_ROOT_API_KEY=your-root-key
export KMS_KEY_NAME=projects/.../cryptoKeys/...

# Run
pytest -m "security and integration" --run-integration tests/security/test_auth_security.py -v
```

**Tests:**
- ✅ Expired/inactive API keys rejected
- ✅ **Org isolation (CRITICAL)** - Org A cannot access Org B
- ✅ **KMS encryption (CRITICAL)** - Credentials encrypted
- ✅ **Timing attacks (CRITICAL)** - Constant-time comparison
- ✅ Audit logging

## ⚠️ Critical Tests Only (Fast)

```bash
pytest -m security tests/security/test_auth_security.py -k "CRITICAL and not slow" -v
```

## 📊 Test Results Summary

| Category | Tests | Status |
|----------|-------|--------|
| Unit Tests | 15 | ✅ PASS |
| Integration Tests | 9 | 🔧 Requires GCP |
| **Total** | **24** | **21 Critical** |

## 🐛 Troubleshooting

### Tests Skip with "Bootstrap not run"
```bash
curl -X POST "http://localhost:8000/api/v1/admin/bootstrap" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -d '{}'
```

### "CA_ROOT_API_KEY not set"
```bash
export CA_ROOT_API_KEY=your-secure-key-min-32-chars
```

### "GCP credentials not available"
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
export GCP_PROJECT_ID=your-project-id
```

## 📖 Full Documentation

- **README:** `tests/security/README.md`
- **Summary:** `tests/security/SECURITY_TEST_SUMMARY.md`
- **Test File:** `tests/security/test_auth_security.py`

## 🎯 Quick Commands

```bash
# Unit tests only (fast)
pytest -m "security and not integration" tests/security/ -v

# All tests (with integration)
pytest -m "security and integration" --run-integration tests/security/ -v

# Critical tests only
pytest -m security tests/security/ -k CRITICAL -v

# Timing tests (slow)
pytest -m "security and slow" --run-integration tests/security/ -k timing -v

# Single test
pytest tests/security/test_auth_security.py::test_missing_root_key_header -v

# Show test names only
pytest tests/security/ --collect-only -q
```

## ✅ Production Checklist

Before deploying to production, ensure:

- [ ] All 24 security tests pass
- [ ] `DISABLE_AUTH=false` in production
- [ ] `CA_ROOT_API_KEY` is 32+ characters
- [ ] `RATE_LIMIT_ENABLED=true`
- [ ] `KMS_KEY_NAME` is configured
- [ ] Integration tests pass with production-like data
- [ ] Timing tests show <10ms variation

## 🚨 Security Contact

If you discover a security vulnerability:
- **DO NOT** open a public GitHub issue
- Email: security@yourcompany.com
- Include test output and reproduction steps

---

**Last Updated:** 2025-12-13
