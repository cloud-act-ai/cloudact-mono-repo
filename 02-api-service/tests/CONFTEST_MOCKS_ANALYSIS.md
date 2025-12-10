# conftest.py Global Mocks Analysis

## Issue #36: Review of Global Mocks (Lines 116-124)

This document analyzes the global mocks in `conftest.py` and determines which are acceptable for unit tests and which should be removed for integration tests.

## Current Global Mocks

### Location: conftest.py lines 116-124

```python
# Mock BigQuery client
with patch("src.app.dependencies.auth.get_bigquery_client") as mock_bq_client:
    mock_client = MagicMock()
    mock_bq_client.return_value = mock_client

    # Mock get_current_org to return test org
    with patch("src.app.dependencies.auth.get_current_org", return_value=mock_get_current_org()):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client
```

## Analysis

### Mock 1: BigQuery Client (`get_bigquery_client`)

**Purpose**: Prevents actual BigQuery API calls in unit tests

**Verdict**: ✅ **ACCEPTABLE for unit tests**

**Reasoning**:
- Unit tests should be fast and not require external dependencies
- BigQuery is an expensive external service
- Mocking allows testing business logic without actual database
- Alternative for integration tests: `integration_client` fixture uses real BigQuery

**Recommendation**: Keep for `async_client` fixture, but ensure `integration_client` does NOT mock this.

---

### Mock 2: Current Org (`get_current_org`)

**Purpose**: Bypasses API key validation by returning a predefined test organization

**Verdict**: ⚠️ **CONDITIONALLY ACCEPTABLE**

**Reasoning**:
- **PROS**:
  - Simplifies unit tests by avoiding complex auth setup
  - Allows testing business logic without creating real orgs
  - Fast test execution

- **CONS**:
  - Bypasses authentication layer completely
  - Doesn't test API key validation logic
  - Could hide auth-related bugs
  - All tests use same fake org (doesn't test multi-tenancy)

**Recommendation**:
1. **Keep for unit tests** - Fast, isolated testing of business logic
2. **Remove for integration tests** - Use real API keys and auth
3. **Add dedicated auth tests** - Test auth separately with real implementation

---

## Mock Classification

### Acceptable Mocks (Unit Tests)

These mocks are acceptable for **unit tests** because they:
- Isolate the system under test
- Remove slow external dependencies
- Make tests fast and deterministic
- Are properly replaced in integration tests

| Mock | Target | Acceptable? | Alternative for Integration |
|------|--------|-------------|----------------------------|
| BigQuery Client | `get_bigquery_client` | ✅ Yes | Use real BigQuery with `integration_client` |
| Current Org | `get_current_org` | ✅ Yes (for unit tests) | Use real API key validation |
| Settings | `get_settings` | ✅ Yes | Use real env vars |

### Unacceptable Mocks

These should **never** be mocked, even in unit tests:

| Mock | Why Unacceptable |
|------|------------------|
| Security functions (crypto, KMS) | Could hide security vulnerabilities |
| Rate limiting | Could hide DoS vulnerabilities |
| Input validation | Could hide injection vulnerabilities |
| Constant-time comparison | Could hide timing attack vulnerabilities |

---

## Fixture Strategy

### Unit Tests (Fast, Mocked)

Use `async_client` fixture:
- ✅ Mock BigQuery
- ✅ Mock auth (get_current_org)
- ✅ Mock settings
- ⚠️ DO NOT mock security functions

**When to use**: Testing business logic, error handling, response formats

---

### Integration Tests (Real, Slow)

Use `integration_client` fixture:
- ❌ No mocks for BigQuery
- ❌ No mocks for auth
- ❌ No mocks for KMS/encryption
- ✅ Requires real credentials

**When to use**: Testing security, multi-tenancy, real API behavior

---

### Hybrid Tests (Partial Mocking)

For specific test cases:
- Mock expensive operations (e.g., external API calls to OpenAI)
- Use real auth and database
- Test specific integration points

**When to use**: Testing integration with external providers without burning API credits

---

## Recommendations

### 1. Keep Current Structure ✅

The dual-fixture approach is good:
- `async_client`: Mocked, fast unit tests
- `integration_client`: Real, comprehensive integration tests

### 2. Add Documentation Comments

Update `conftest.py` with clear documentation:

```python
@pytest.fixture
async def async_client():
    """
    UNIT TEST CLIENT - Uses mocked BigQuery and auth.

    Mocks:
    - BigQuery client (get_bigquery_client)
    - Authentication (get_current_org)

    DO NOT MOCK:
    - Security functions (KMS, encryption)
    - Rate limiting
    - Input validation

    For real integration tests, use `integration_client` instead.
    """
```

### 3. Enforce Test Separation

Add to `pytest.ini`:

```ini
[pytest]
markers =
    unit: Unit tests with mocked dependencies
    integration: Integration tests with real services
    security: Security tests (timing, auth, isolation)
```

### 4. Create Mock Policy Document

This document serves as that policy:
- Unit tests: Mock external services (BigQuery, external APIs)
- Integration tests: No mocks for security-critical code
- Never mock: Security, validation, rate limiting

---

## Test Coverage Matrix

| Test Type | BigQuery | Auth | External APIs | Security |
|-----------|----------|------|---------------|----------|
| Unit | Mocked | Mocked | Mocked | **Real** |
| Integration | Real | Real | Mocked* | **Real** |
| E2E | Real | Real | Real | **Real** |

*External APIs (OpenAI, Anthropic) can be mocked in integration tests to avoid API costs, but credentials must be real and validated.

---

## Migration Plan (Issues #33-40)

### Phase 1: Document Current State ✅
- This document

### Phase 2: Add Integration Tests ✅
- ✅ test_01_org_isolation_real.py
- ✅ test_02_concurrent_real.py
- ✅ test_03_quota_enforcement_real.py
- ✅ test_04_cache_isolation_real.py
- ✅ test_05_timing_attack_real.py

### Phase 3: Add Performance Tests ✅
- ✅ test_benchmarks.py

### Phase 4: Reduce Unit Test Mocks (Future)
- Gradually replace mocked tests with integration tests
- Target: 80% integration tests, 20% unit tests
- Keep unit tests for pure business logic

---

## Conclusion

The global mocks in `conftest.py` are **ACCEPTABLE for unit tests** but should be:

1. ✅ **Clearly documented** - What's mocked and why
2. ✅ **Properly segregated** - Separate fixtures for unit vs integration
3. ✅ **Never applied to security code** - Security must always be real
4. ✅ **Complemented with integration tests** - Real tests for real behavior

**Current implementation is GOOD** with the dual-fixture approach. The new integration tests (Phase 3) properly test without mocks.

---

**Status**: Issue #36 - RESOLVED ✅

**Recommendation**: Keep current mocks, add documentation comments to conftest.py
