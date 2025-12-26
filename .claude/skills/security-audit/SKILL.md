---
name: security-audit
description: |
  Security audit and validation for CloudAct. API key security, KMS encryption, auth checks, OWASP compliance.
  Use when: auditing security, checking API key usage, verifying encryption, reviewing auth configuration,
  or ensuring OWASP compliance.
---

# Security Audit

## Overview
CloudAct implements defense-in-depth security with KMS encryption, API key hierarchy, and rate limiting.

## Key Locations
- **Security Docs:** `03-data-pipeline-service/SECURITY.md`
- **KMS Encryption:** `02-api-service/src/core/security/kms_encryption.py`
- **Auth Middleware:** `02-api-service/src/app/middleware/auth.py`
- **Security Tests:** `{service}/tests/test_security.py`

## Security Architecture
```
┌─────────────────────────────────────────────────────────┐
│                      API Gateway                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ Rate Limit  │  │    Auth     │  │  Input Valid    │  │
│  │  Middleware │  │  Middleware │  │   (Pydantic)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│                    Service Layer                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │              KMS Encryption                         ││
│  │  - Credentials encrypted at rest                    ││
│  │  - Key rotation supported                           ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│                      BigQuery                            │
│  - IAM-based access control                              │
│  - Dataset-level isolation per org                       │
│  - Audit logging enabled                                 │
└─────────────────────────────────────────────────────────┘
```

## API Key Hierarchy
| Key Type | Header | Scope | Storage |
|----------|--------|-------|---------|
| CA_ROOT_API_KEY | X-CA-Root-Key | System admin | Environment var |
| Org API Key | X-API-Key | Organization | BigQuery (hashed) |

## Security Controls

### 1. Authentication
```python
# Root key check
async def verify_root_key(request: Request):
    key = request.headers.get("X-CA-Root-Key")
    if not key or key != settings.CA_ROOT_API_KEY:
        raise HTTPException(401, "Invalid root key")

# Org key check
async def verify_org_key(request: Request, org_slug: str):
    key = request.headers.get("X-API-Key")
    if not await validate_org_key(key, org_slug):
        raise HTTPException(401, "Invalid API key")
```

### 2. Encryption (KMS)
```python
from google.cloud import kms

class KMSEncryption:
    def encrypt(self, plaintext: str, key_name: str) -> bytes:
        response = self.client.encrypt(
            request={"name": key_name, "plaintext": plaintext.encode()}
        )
        return response.ciphertext

    def decrypt(self, ciphertext: bytes, key_name: str) -> str:
        response = self.client.decrypt(
            request={"name": key_name, "ciphertext": ciphertext}
        )
        return response.plaintext.decode()
```

### 3. Rate Limiting
```python
# Per-org rate limits
RATE_LIMITS = {
    "api_calls": 1000,      # per hour
    "pipeline_runs": 100,   # per hour
    "data_export": 10,      # per hour
}
```

## Instructions

### 1. Audit API Key Usage
```sql
-- Check API key access patterns
SELECT
    org_id,
    endpoint,
    COUNT(*) as calls,
    MAX(timestamp) as last_access
FROM `organizations.audit_logs`
WHERE action = 'api_call'
GROUP BY org_id, endpoint
ORDER BY calls DESC;
```

### 2. Check Credential Encryption
```bash
# Verify all credentials are encrypted
python -c "
from google.cloud import bigquery

client = bigquery.Client()
query = '''
SELECT org_id, provider,
       CASE WHEN encrypted_value IS NOT NULL THEN 'encrypted'
            ELSE 'PLAIN TEXT - CRITICAL' END as status
FROM organizations.integration_credentials
'''
for row in client.query(query):
    print(f'{row.org_id}/{row.provider}: {row.status}')
"
```

### 3. Verify Auth Configuration
```bash
# Check auth is enabled
curl -s http://localhost:8000/api/v1/organizations/test/status

# Should return 401 without key
# If returns 200, auth is disabled - CRITICAL

# Check DISABLE_AUTH is false
grep -r "DISABLE_AUTH" .env* || echo "Not in env files"
```

### 4. Run Security Tests
```bash
# API security tests
cd 02-api-service
python -m pytest tests/test_security.py -v

# Pipeline security tests
cd 03-data-pipeline-service
python -m pytest tests/test_security.py -v
```

### 5. Check for Secrets in Code
```bash
# Search for potential secrets
grep -rn "sk-" --include="*.py" --include="*.ts" .
grep -rn "api_key" --include="*.py" --include="*.ts" .
grep -rn "password" --include="*.py" --include="*.ts" .

# Check for hardcoded keys
grep -rn "AIza" .  # Google API key pattern
grep -rn "sk-ant-" .  # Anthropic key pattern
grep -rn "sk-proj-" .  # OpenAI key pattern
```

### 6. Audit BigQuery Access
```bash
# Check dataset permissions
bq show --format=prettyjson organizations | jq '.access'

# Check for public access
bq show --format=prettyjson {org_slug}_prod | jq '.access'
```

## OWASP Top 10 Compliance
| # | Risk | CloudAct Mitigation |
|---|------|---------------------|
| A01 | Broken Access Control | API key hierarchy, org isolation |
| A02 | Cryptographic Failures | KMS encryption, HTTPS only |
| A03 | Injection | Pydantic validation, parameterized queries |
| A04 | Insecure Design | Defense-in-depth architecture |
| A05 | Security Misconfiguration | Config validation, no defaults |
| A06 | Vulnerable Components | Dependency scanning, updates |
| A07 | Authentication Failures | Strong key requirements, rate limiting |
| A08 | Software Integrity | CI/CD verification, signed images |
| A09 | Logging Failures | Comprehensive audit logs |
| A10 | SSRF | URL validation, allowlists |

## Security Checklist
- [ ] DISABLE_AUTH=false in all environments
- [ ] CA_ROOT_API_KEY is min 32 characters
- [ ] All credentials encrypted with KMS
- [ ] Rate limiting enabled
- [ ] Audit logging active
- [ ] No secrets in code
- [ ] BigQuery access restricted
- [ ] HTTPS enforced

## Common Issues
| Issue | Severity | Solution |
|-------|----------|----------|
| DISABLE_AUTH=true | CRITICAL | Never use in production |
| Plain text credentials | CRITICAL | Encrypt with KMS |
| Weak API key | HIGH | Use min 32 chars |
| Missing rate limits | MEDIUM | Enable rate limiting |
| Incomplete audit logs | MEDIUM | Enable all audit events |

## Example Prompts

```
# Credential Security
"Are all credentials encrypted with KMS?"
"Check for plain text secrets in code"
"Audit API key usage patterns"

# Authentication
"Is authentication properly configured?"
"Check for DISABLE_AUTH in production"
"Verify root key is secure"

# Security Testing
"Run security tests"
"Check for OWASP vulnerabilities"
"Audit BigQuery access permissions"

# Compliance
"Is our setup OWASP compliant?"
"Review security configuration"
"Generate security audit report"

# Troubleshooting
"Auth failing in production"
"KMS decryption error"
```

## Related Skills
- `bootstrap-onboard` - Secure setup
- `integration-setup` - Credential management
- `deploy-check` - Security verification
