# Security Audit - Test Plan

## Security Tests

Defense-in-depth validation across all CloudAct services:
- **API Auth:** `02-api-service/src/app/dependencies/auth.py`
- **KMS Encryption:** `02-api-service/src/lib/encryption.py`
- **Run:** `cd 02-api-service && python -m pytest tests/test_security.py -v`

### Test Matrix (30 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Request without X-API-Key header | Auth | 401 Unauthorized |
| 2 | Request with invalid X-API-Key | Auth | 401 Invalid API key |
| 3 | Request without X-CA-Root-Key on admin endpoint | Auth | 401 Unauthorized |
| 4 | Request with wrong X-CA-Root-Key | Auth | 401 Invalid root key |
| 5 | CA_ROOT_API_KEY minimum 32 characters | Config | Startup fails if shorter |
| 6 | DISABLE_AUTH is false in production | Config | `DISABLE_AUTH=false` verified |
| 7 | API key format matches `{org_slug}_api_{random_16}` | Unit | Regex validation passes |
| 8 | API key stored as SHA256 hash in BigQuery | Unit | Only hash in org_api_keys table |
| 9 | API key comparison is constant-time | Unit | `hmac.compare_digest` used |
| 10 | Raw API key shown only once at creation | E2E | Key not retrievable after creation |
| 11 | KMS encryption of credentials at rest | Unit | `encrypted_value IS NOT NULL` for all rows |
| 12 | KMS decryption returns original value | Unit | Roundtrip encrypt-decrypt matches |
| 13 | Raw credentials never logged | Audit | No plaintext credentials in log output |
| 14 | Credential fingerprint uses SHA256 | Unit | Logs show SHA256 fingerprint only |
| 15 | Org slug validation: `^[a-z0-9_]{3,50}$` | Validation | Invalid slugs rejected (hyphens, spaces, special chars) |
| 16 | Email validation: RFC-compliant, max 254 chars | Validation | Invalid emails rejected |
| 17 | UUID validation: standard format | Validation | Malformed UUIDs rejected |
| 18 | Null byte detection in all inputs | Validation | Requests with `\0` rejected |
| 19 | Size limits enforced per field | Validation | Oversized inputs rejected |
| 20 | Org A cannot access org B dataset | Isolation | 401 or 403 on cross-org access |
| 21 | BigQuery dataset-level isolation per org | Isolation | Only `{org_slug}_prod` accessible |
| 22 | Parameterized queries used (no SQL injection) | Security | All queries use `@parameters` |
| 23 | Stripe webhook signature verified (`whsec_*`) | Webhook | Invalid signatures rejected |
| 24 | Open redirect prevention (no `//`, `\`, `@`) | Redirect | Malicious redirect URLs blocked |
| 25 | Rate limiting on login attempts | Rate Limit | Excessive logins throttled |
| 26 | Rate limiting: 100 req/min per org | Rate Limit | 429 after threshold |
| 27 | Rate limiting: checkout 1 per 30s | Rate Limit | Second checkout within 30s blocked |
| 28 | HTTPS/TLS enforced on all Cloud Run services | Transport | No plaintext HTTP allowed |
| 29 | Supabase Auth uses httpOnly JWT + secure cookies | Session | No client-accessible tokens |
| 30 | Audit log entry for all mutations | Audit | `org_audit_logs` rows for create/update/delete |

## Backend Tests

### Unit Tests (02-api-service)

```bash
cd 02-api-service
source venv/bin/activate
python -m pytest tests/test_security.py -v
```

| Domain | File | Tests |
|--------|------|-------|
| Auth | `tests/test_security.py` | Root key, org key, DISABLE_AUTH checks |
| Validation | `tests/test_validation.py` | Input sanitization, org slug, email, UUID |
| Encryption | `tests/test_security.py` | KMS encrypt/decrypt roundtrip |
| Rate Limiting | `tests/test_security.py` | Per-org and per-user rate limits |

### Unit Tests (03-data-pipeline-service)

```bash
cd 03-data-pipeline-service
source venv/bin/activate
python -m pytest tests/test_security.py -v
```

| Domain | File | Tests |
|--------|------|-------|
| Auth | `tests/test_security.py` | Pipeline service auth middleware |
| XSS | `tests/test_notifications.py` | `html_escape()` on notification content |
| Credential | `tests/test_security.py` | URL sanitization in logs |

### Frontend Validation Tests

```bash
cd 01-fronted-system
npm run test
```

| Domain | File | Tests |
|--------|------|-------|
| Input Validation | `lib/validators.ts` | `isValidOrgSlug`, `sanitizeOrgName`, `isValidEmail` |
| Auth Actions | `app/actions/auth-actions.ts` | `loginWithSecurity` server action |
| Redirect | `lib/validators.ts` | Open redirect prevention |

### Integration Tests

| Test | Command | Expected |
|------|---------|----------|
| Unauthenticated org access | `curl http://localhost:8000/api/v1/organizations/test/status` | 401 Unauthorized |
| Invalid root key | `curl -H "X-CA-Root-Key: wrong" http://localhost:8000/api/v1/admin/bootstrap/status` | 401 Invalid root key |
| Credential encryption check | Query `org_integration_credentials` for `encrypted_value IS NOT NULL` | All rows encrypted |
| No secrets in codebase | `grep -rn "sk-" --include="*.py" --include="*.ts" .` | No hardcoded secrets found |
| BigQuery IAM check | `bq show --format=prettyjson organizations \| jq '.access'` | Restricted access list |
| Cloud Run auth model | `gcloud run services describe <service> --format="value(spec.template.metadata.annotations)"` | `--allow-unauthenticated` with app-level auth |

## OWASP Top 10 Verification

| # | Risk | Test | Expected |
|---|------|------|----------|
| A01 | Broken Access Control | Cross-org API key test | 401 on cross-org access |
| A02 | Cryptographic Failures | KMS encryption audit | All credentials encrypted |
| A03 | Injection | SQL injection via org_slug | Parameterized queries block injection |
| A04 | Insecure Design | Auth middleware presence | All endpoints behind auth check |
| A05 | Security Misconfiguration | DISABLE_AUTH=false check | Not true in prod |
| A06 | Vulnerable Components | Dependency audit | No known CVEs in deps |
| A07 | Authentication Failures | Brute force login test | Rate limiting active |
| A08 | Software Integrity | CI/CD verification | Signed container images |
| A09 | Logging Failures | Audit log completeness | All mutations logged |
| A10 | SSRF | URL validation on webhooks | Only allowed URLs accepted |

## Manual Verification Checklist

| Check | How | Expected |
|-------|-----|----------|
| No DISABLE_AUTH=true in prod | `grep "DISABLE_AUTH" .env.prod` | Not found or false |
| CA_ROOT_API_KEY length | Check env var length | >= 32 characters |
| All credentials encrypted | Query org_integration_credentials | `encrypted_value IS NOT NULL` for all |
| No secrets in code | Run secret scanning grep patterns | 0 matches |
| BigQuery access restricted | Check dataset IAM bindings | No allUsers or allAuthenticatedUsers |
| HTTPS enforced | `curl -I http://api.cloudact.ai` | Redirect to HTTPS |
| Webhook signatures verified | Send unsigned Stripe event | Rejected with 400 |
| Audit logs populated | Query org_audit_logs for recent entries | Entries exist for mutations |
| Rate limits active | Send 101 requests in 1 minute | 429 on request 101 |
| Session cookies httpOnly | Inspect cookies in browser DevTools | httpOnly flag set |

## Pass Criteria

| Criteria | Target |
|----------|--------|
| Security unit tests | 100% passing |
| Auth enforcement | 0 unauthenticated access to protected endpoints |
| KMS encryption coverage | 100% of credentials encrypted |
| Cross-org data leakage | 0 |
| Hardcoded secrets in codebase | 0 |
| OWASP Top 10 compliance | All 10 mitigated |
| Rate limiting active | All configured limits enforced |
| Audit log coverage | 100% of mutations logged |

## Known Limitations

1. **Cloud Run --allow-unauthenticated**: All services use app-level auth instead of Cloud Run IAM; this is intentional to allow browser-to-API calls but may appear as a misconfiguration in automated scanners
2. **DISABLE_AUTH in tests**: `DISABLE_AUTH=true` is permitted in test/unit environments only; must never reach production
3. **KMS key rotation**: Key rotation is supported but not automatically tested; requires manual verification with GCP KMS console
4. **Rate limiting granularity**: Per-org rate limiting relies on API key extraction; unauthenticated requests share a global pool
5. **Audit log retention**: Audit logs are retained indefinitely in BigQuery; no automatic purge policy configured yet
6. **Frontend secret scanning**: Automated grep-based scanning may miss obfuscated or split-string secrets; manual review recommended for releases
