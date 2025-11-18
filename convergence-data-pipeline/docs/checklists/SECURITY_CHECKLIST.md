# Security Checklist

**Version:** 1.0.0
**Last Updated:** 2024-01-17
**Owner:** Security Team

## Purpose
This checklist ensures all security controls are properly configured before production deployment. Based on OWASP Top 10, SOC 2, and security best practices.

---

## Authentication & Authorization

### API Authentication
- [ ] API key authentication enabled
- [ ] API keys stored securely (hashed in database)
- [ ] API keys never logged in plaintext
- [ ] API key rotation policy configured (< 90 days)
- [ ] Admin API key secured in Secret Manager
- [ ] No default/test API keys in production

### Authorization
- [ ] Role-based access control (RBAC) implemented
- [ ] Tenant isolation enforced
- [ ] Cross-tenant access blocked
- [ ] Least privilege principle applied
- [ ] Service accounts use minimal permissions
- [ ] Admin operations require admin key

**Test Commands:**
```bash
# Test unauthorized access (should return 401)
curl https://api.cloudact.io/api/v1/pipelines

# Test with valid key (should return 200)
curl -H "x-api-key: ${API_KEY}" https://api.cloudact.io/api/v1/pipelines

# Test cross-tenant access (should be blocked)
```

**Result:** [ ] PASS / [ ] FAIL

---

## Data Protection

### Encryption at Rest
- [ ] BigQuery encryption at rest enabled
- [ ] Secrets encrypted in Secret Manager
- [ ] KMS encryption configured
- [ ] Encryption keys rotated regularly (< 90 days)
- [ ] Field-level encryption for sensitive data

### Encryption in Transit
- [ ] HTTPS/TLS enabled (enforced)
- [ ] Minimum TLS version 1.2
- [ ] Strong cipher suites only
- [ ] Certificate valid and not expiring soon (> 30 days)
- [ ] Internal service-to-service encryption

**Certificate Check:**
```bash
openssl s_client -connect api.cloudact.io:443 -servername api.cloudact.io | openssl x509 -noout -dates
```

- [ ] Certificate valid
- [ ] Certificate not self-signed
- [ ] Certificate from trusted CA

**Result:** [ ] PASS / [ ] FAIL

---

## Input Validation

### Request Validation
- [ ] Maximum request size enforced (10 MB)
- [ ] Maximum header size enforced (8 KB)
- [ ] Content-type validation enabled
- [ ] Request timeout configured (300s)

### Parameter Validation
- [ ] Tenant ID validation (regex pattern)
- [ ] Pipeline ID validation (regex pattern)
- [ ] SQL injection protection enabled
- [ ] Path traversal protection enabled
- [ ] Command injection protection enabled
- [ ] XSS protection enabled

**Validation Patterns:**
```python
# Tenant ID: ^[a-zA-Z0-9_-]+$
# Pipeline ID: ^[a-zA-Z0-9_-]+$
# No: ../ or ..\\ or ; or | or && or ||
```

**Test SQL Injection:**
```bash
# Should be rejected
curl -H "x-api-key: ${API_KEY}" \
  "https://api.cloudact.io/api/v1/pipelines?tenant_id='; DROP TABLE users--"
```

**Result:** [ ] PASS / [ ] FAIL

---

## OWASP Top 10 Protection

### A01:2021 – Broken Access Control
- [ ] Tenant isolation implemented
- [ ] Authorization checks on all endpoints
- [ ] Direct object references protected
- [ ] Forced browsing prevented

### A02:2021 – Cryptographic Failures
- [ ] Sensitive data encrypted at rest
- [ ] Sensitive data encrypted in transit
- [ ] Strong encryption algorithms (AES-256)
- [ ] No hardcoded secrets in code

### A03:2021 – Injection
- [ ] SQL injection protection (parameterized queries)
- [ ] Command injection protection
- [ ] Input sanitization
- [ ] Output encoding

### A04:2021 – Insecure Design
- [ ] Threat modeling completed
- [ ] Security requirements defined
- [ ] Security controls documented
- [ ] Rate limiting implemented

### A05:2021 – Security Misconfiguration
- [ ] Default credentials changed
- [ ] Unnecessary features disabled
- [ ] Security headers configured
- [ ] Error messages don't leak sensitive info

### A06:2021 – Vulnerable Components
- [ ] Dependencies up to date
- [ ] Vulnerability scanning enabled
- [ ] No high/critical vulnerabilities
- [ ] Automated dependency updates

### A07:2021 – Authentication Failures
- [ ] Strong authentication implemented
- [ ] Session management secure
- [ ] Brute force protection enabled
- [ ] Account lockout policy configured

### A08:2021 – Software and Data Integrity Failures
- [ ] Code signing implemented
- [ ] Supply chain security verified
- [ ] Integrity checks for critical data
- [ ] Secure update mechanism

### A09:2021 – Logging and Monitoring Failures
- [ ] Security events logged
- [ ] Audit logging enabled
- [ ] Log tampering prevented
- [ ] Real-time alerting configured

### A10:2021 – Server-Side Request Forgery (SSRF)
- [ ] URL validation implemented
- [ ] Whitelist of allowed hosts
- [ ] Internal network access restricted
- [ ] DNS rebinding protection

**Result:** [ ] PASS / [ ] FAIL

---

## Security Headers

### HTTP Security Headers
```bash
curl -I https://api.cloudact.io/
```

Required Headers:
- [ ] Strict-Transport-Security: max-age=31536000; includeSubDomains
- [ ] X-Frame-Options: DENY
- [ ] X-Content-Type-Options: nosniff
- [ ] X-XSS-Protection: 1; mode=block
- [ ] Referrer-Policy: strict-origin-when-cross-origin
- [ ] Content-Security-Policy: (configured)
- [ ] Permissions-Policy: (configured)

**Result:** [ ] PASS / [ ] FAIL

---

## CORS Configuration

### CORS Settings
- [ ] Allowed origins whitelisted (no *)
- [ ] Credentials allowed only for trusted origins
- [ ] Allowed methods restricted
- [ ] Preflight requests handled correctly

**Configuration:**
```yaml
allowed_origins:
  - https://app.cloudact.io
  - https://console.cloudact.io
# NOT: *
```

**Test CORS:**
```bash
curl -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: POST" \
  -X OPTIONS https://api.cloudact.io/api/v1/pipelines
# Should reject
```

**Result:** [ ] PASS / [ ] FAIL

---

## Rate Limiting & DDoS Protection

### Rate Limiting
- [ ] Per-tenant rate limiting enabled
- [ ] Global rate limiting enabled
- [ ] Endpoint-specific limits configured
- [ ] Rate limit headers included in responses
- [ ] Burst protection enabled

**Limits:**
- Per-tenant: 100 req/min, 1000 req/hour
- Global: 10,000 req/min, 100,000 req/hour
- Admin endpoints: 10 req/min

**Test Rate Limiting:**
```bash
# Should return 429 after limit
for i in {1..150}; do
  curl -H "x-api-key: ${API_KEY}" https://api.cloudact.io/api/v1/pipelines
done
```

### DDoS Protection
- [ ] Connection limits configured
- [ ] Request pattern detection enabled
- [ ] Cloud Armor configured (GCP)
- [ ] IP blacklist/whitelist available

**Result:** [ ] PASS / [ ] FAIL

---

## Secrets Management

### Secret Storage
- [ ] Secrets stored in Secret Manager (not env vars)
- [ ] Secrets encrypted at rest
- [ ] Secret access logged
- [ ] Secret rotation policy (< 90 days)
- [ ] No secrets in code/version control
- [ ] No secrets in logs

**Verify No Secrets in Code:**
```bash
# Should return empty
git grep -i "password\|api_key\|secret\|token" -- "*.py" "*.yaml" | grep -v "x-api-key"
```

### Sensitive Data Handling
- [ ] PII identified and classified
- [ ] PII encrypted
- [ ] PII access logged
- [ ] PII retention policy configured

**Result:** [ ] PASS / [ ] FAIL

---

## Logging & Auditing

### Audit Logging
- [ ] Authentication events logged
- [ ] Authorization events logged
- [ ] Data access logged
- [ ] Administrative actions logged
- [ ] Failed operations logged

### Log Security
- [ ] Logs stored securely
- [ ] Log retention configured (90 days for audit)
- [ ] Log tampering prevented
- [ ] Sensitive data redacted in logs
- [ ] Logs forwarded to SIEM (if applicable)

**Redaction Patterns:**
```yaml
# Should be redacted in logs:
- password=***
- api_key=***
- token=***
- email addresses
- credit card numbers
```

**Test Log Redaction:**
```bash
# Search logs for sensitive patterns (should find none)
gcloud logging read "password OR api_key OR credit" --limit 100
```

**Result:** [ ] PASS / [ ] FAIL

---

## Vulnerability Management

### Dependency Scanning
```bash
# Check for vulnerabilities
safety check
pip-audit
```

- [ ] All dependencies scanned
- [ ] No critical vulnerabilities
- [ ] No high vulnerabilities (or accepted with justification)
- [ ] Automated scanning enabled

### Container Scanning
```bash
# Scan Docker image
gcloud container images scan gcr.io/${PROJECT}/convergence-data-pipeline:latest
```

- [ ] Container scanned for vulnerabilities
- [ ] No critical/high vulnerabilities
- [ ] Base image regularly updated

### Code Scanning
```bash
# Static analysis
bandit -r src/
semgrep --config auto src/
```

- [ ] SAST scanning enabled
- [ ] No critical findings
- [ ] No high findings (or accepted)

**Result:** [ ] PASS / [ ] FAIL

---

## Network Security

### Network Policies
- [ ] Service deployed in private network (if applicable)
- [ ] Firewall rules configured
- [ ] Only required ports exposed
- [ ] Internal services not publicly accessible

### Service-to-Service Communication
- [ ] Mutual TLS for service mesh (if applicable)
- [ ] Service accounts for authentication
- [ ] Network policies enforced

**Exposed Ports:**
- 8080 (HTTP/HTTPS) - Required
- 9090 (Metrics) - Internal only

**Result:** [ ] PASS / [ ] FAIL

---

## Compliance & Regulations

### GDPR Compliance (if applicable)
- [ ] Data retention policies configured
- [ ] Right to erasure implemented
- [ ] Data processing agreements in place
- [ ] Privacy policy updated

### SOC 2 Compliance
- [ ] Access controls documented
- [ ] Audit logging enabled
- [ ] Encryption at rest/in transit
- [ ] Change management process

### HIPAA Compliance (if applicable)
- [ ] BAA in place
- [ ] PHI encrypted
- [ ] Access logged
- [ ] Security risk assessment completed

**Result:** [ ] PASS / [ ] FAIL

---

## Incident Response

### Incident Response Plan
- [ ] Security incident response plan documented
- [ ] Incident response team identified
- [ ] Escalation procedures defined
- [ ] Communication templates prepared

### Security Monitoring
- [ ] Security alerts configured
- [ ] Intrusion detection enabled
- [ ] Anomaly detection configured
- [ ] Real-time alerting to security team

**Alerts Configured:**
- [ ] Brute force attempts
- [ ] Authentication failures
- [ ] Unusual data access patterns
- [ ] Configuration changes

**Result:** [ ] PASS / [ ] FAIL

---

## Penetration Testing

### Security Testing
- [ ] Penetration test completed (annually)
- [ ] Findings remediated
- [ ] Retest completed
- [ ] Next test scheduled

**Last Penetration Test:** \_\_\_\_\_\_\_\_\_\_\_\_

**Findings:** [ ] None [ ] Low [ ] Medium [ ] High [ ] Critical

**Remediation Status:** [ ] Complete [ ] In Progress

---

## Backup & Recovery

### Disaster Recovery
- [ ] Backup encryption enabled
- [ ] Backup retention policy (30 days)
- [ ] Backup restoration tested
- [ ] Recovery procedures documented

### Business Continuity
- [ ] RTO defined (< 1 hour)
- [ ] RPO defined (< 1 hour)
- [ ] Failover procedures documented
- [ ] DR testing completed

**Result:** [ ] PASS / [ ] FAIL

---

## Final Security Sign-Off

### Pre-Production Security Review

**Security Checklist Completion:** _____%

**Critical Issues:** [ ] None [ ] \_\_\_ (must be 0)

**High Issues:** [ ] None [ ] \_\_\_ (must be 0)

**Medium Issues:** [ ] \_\_\_ (document acceptance)

### Approvals Required

**Security Engineer:**
- Name: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
- Date: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
- Approved: [ ] YES / [ ] NO

**CISO/Security Lead:**
- Name: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
- Date: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
- Approved: [ ] YES / [ ] NO

### Exceptions/Waivers

List any security controls with approved exceptions:

1. \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
   - Reason: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
   - Mitigation: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
   - Expiry: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

**Security verification complete. Ready for production deployment.**

**Verified By:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**Date:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
