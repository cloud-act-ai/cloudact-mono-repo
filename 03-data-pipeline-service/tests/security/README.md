# Security Module Tests

Comprehensive test suite for pipeline-service security functionality including KMS encryption, authentication, authorization, and quota management.

## Test Files

### test_kms_encryption.py
Tests for KMS encryption and org-scoped envelope encryption.

**Coverage: 97%**

#### Test Classes:

1. **TestBasicKMSEncryption** (11 tests)
   - Basic encryption/decryption with GCP KMS
   - Base64 encoding for storage
   - Key name resolution (full path vs components)
   - Error handling (empty values, timeouts)

2. **TestOrgKMSEncryption** (13 tests)
   - Envelope encryption pattern
   - DEK generation, wrapping, unwrapping
   - Per-organization encryption isolation
   - Fernet cache management with TTL
   - DEK rotation
   - Multi-org isolation verification

3. **TestGlobalHelpers** (3 tests)
   - Convenience functions
   - Singleton pattern verification

4. **TestSecurityEdgeCases** (5 tests)
   - Unicode character handling
   - Large payload encryption
   - Corrupted data handling
   - Network error resilience
   - Base64 edge cases

**Total: 32 tests**

### test_auth.py
Tests for authentication, authorization, and quota management.

**Coverage: 97%**

#### Test Classes:

1. **TestAPIKeyHashing** (4 tests)
   - SHA256 hash consistency
   - Hash uniqueness
   - Format validation

2. **TestConstantTimeComparison** (4 tests)
   - Constant-time string comparison
   - Timing attack prevention
   - Edge cases (different lengths)

3. **TestGetCurrentOrg** (6 tests)
   - API key authentication
   - Invalid/expired key handling
   - Auth bypass in dev mode
   - Trial subscription support

4. **TestValidateSubscription** (4 tests)
   - Active subscription validation
   - Trial expiration checking
   - Inactive subscription rejection

5. **TestValidateQuota** (5 tests)
   - Daily/monthly/concurrent limits
   - Quota exceeded scenarios
   - Auto-creation of usage records

6. **TestIncrementPipelineUsage** (3 tests)
   - Usage counter updates
   - Success/failed tracking
   - Concurrent pipeline tracking

7. **TestGetOrgCredentials** (3 tests)
   - Credential retrieval and decryption
   - Missing credentials handling
   - Decryption error handling

8. **TestVerifyAdminKey** (4 tests)
   - Root API key verification
   - Constant-time comparison
   - Missing/invalid key handling

9. **TestGetOrgOrAdminAuth** (3 tests)
   - Dual authentication (org or admin)
   - Flexible auth patterns

10. **TestAuthMetricsAggregator** (5 tests)
    - Singleton pattern
    - Batched metrics updates
    - UUID validation
    - Retry on failure

**Total: 41 tests**

## Test Coverage Summary

```
Name                                      Stmts   Miss  Cover
---------------------------------------------------------------
src/core/security/__init__.py                 2      0   100%
src/core/security/kms_encryption.py          34      1    97%
src/core/security/org_kms_encryption.py      79      3    96%
---------------------------------------------------------------
TOTAL                                       115      4    97%
```

## Running Tests

### Run all security tests
```bash
cd 03-data-pipeline-service
python -m pytest tests/security/ -v
```

### Run specific test file
```bash
python -m pytest tests/security/test_kms_encryption.py -v
python -m pytest tests/security/test_auth.py -v
```

### Run with coverage report
```bash
python -m pytest tests/security/ --cov=src/core/security --cov=src/app/dependencies/auth --cov-report=term-missing
```

### Run specific test class
```bash
python -m pytest tests/security/test_kms_encryption.py::TestBasicKMSEncryption -v
python -m pytest tests/security/test_auth.py::TestValidateQuota -v
```

### Run specific test
```bash
python -m pytest tests/security/test_kms_encryption.py::TestBasicKMSEncryption::test_encrypt_value_success -v
```

## Test Features

### Mocking Strategy
- **KMS Client**: Mocked to avoid real GCP API calls
- **BigQuery Client**: Mocked for database operations
- **Settings**: Mocked for configuration flexibility
- **Async Support**: Full async/await test support

### Security Focus Areas

1. **Encryption**
   - Basic KMS encryption/decryption
   - Envelope encryption pattern
   - Key rotation
   - Multi-tenant isolation

2. **Authentication**
   - API key hashing (SHA256)
   - Constant-time comparison (timing attack prevention)
   - Org API key validation
   - Root admin key verification
   - Dual auth patterns

3. **Authorization**
   - Subscription validation
   - Quota enforcement (daily/monthly/concurrent)
   - Scope checking

4. **Audit & Metrics**
   - Batched metrics updates
   - UUID validation for SQL injection prevention
   - Retry logic

### Edge Cases Tested

- Empty/null values
- Unicode characters
- Large payloads
- Corrupted data
- Network errors
- Timeouts
- Cache expiration
- Expired keys/subscriptions
- Quota limits
- SQL injection attempts (via UUID validation)

## Security Test Principles

1. **Defense in Depth**: Test multiple layers of security
2. **Fail Secure**: Verify failures reject access (not grant)
3. **Timing Attacks**: Constant-time comparison tests
4. **Injection Prevention**: UUID validation, parameterized queries
5. **Data Isolation**: Multi-tenant separation verification
6. **Key Rotation**: Verify encryption key updates
7. **Error Handling**: Graceful degradation without leaking data

## Future Enhancements

- [ ] Rate limiting integration tests
- [ ] Audit logging verification tests
- [ ] Scope enforcement detailed tests
- [ ] Real KMS integration tests (with test keys)
- [ ] Performance benchmarks for encryption operations
- [ ] Concurrent access stress tests
- [ ] Session management tests

## Related Documentation

- `/03-data-pipeline-service/SECURITY.md` - Security architecture
- `/03-data-pipeline-service/CLAUDE.md` - Service overview
- `/00-requirements-docs/00-ARCHITECTURE.md` - Platform architecture
