# Security Documentation

**Last Updated: 2025-11-30**

This document describes the security measures in the Data Pipeline Service (port 8001).

**Note:** Bootstrap and onboarding are handled by `api-service` (port 8000).

---

## Production Security Checklist

### Required Environment Variables

```bash
ENVIRONMENT="production"
GCP_PROJECT_ID="your-project-id"
CA_ROOT_API_KEY="your-secure-admin-key"  # Min 32 chars
```

### Security Settings

```bash
DISABLE_AUTH="false"       # CANNOT be true in production
RATE_LIMIT_ENABLED="true"  # MUST be true in production
```

### KMS Configuration

```bash
KMS_KEY_NAME="projects/{project}/locations/{loc}/keyRings/{ring}/cryptoKeys/{key}"
```

---

## Authentication

### Key Types

| Key | Header | Used For |
|-----|--------|----------|
| Org API Key | `X-API-Key` | Pipeline execution |
| Admin Key | `X-CA-Root-Key` | Scheduler operations |

### Pipeline Execution Flow

```
Request with X-API-Key header
        │
        ▼
Hash key with SHA256
        │
        ▼
Query BigQuery for matching key_hash
        │
        ▼
Verify subscription is ACTIVE/TRIAL
        │
        ▼
Check provider credentials exist
        │
        ▼
Check quota limits (daily, monthly, concurrent)
        │
        ▼
Execute pipeline
```

### Scheduler Operations (Admin Only)

```
Request with X-CA-Root-Key header
        │
        ▼
Hash and compare using constant-time comparison
        │
        ▼
Grant/Deny access
```

---

## Timing Attack Prevention

CA Root API key uses constant-time comparison:

```python
def _constant_time_compare(val1: str, val2: str) -> bool:
    import hmac
    return hmac.compare_digest(val1.encode(), val2.encode())
```

---

## Input Validation

### Request Model Validation

Pipeline requests reject unknown fields:

```python
class TriggerPipelineRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
```

### Middleware Validation

- Header size limits (8KB max)
- Request body size (10MB max)
- Organization slug format
- Path traversal prevention
- NULL byte injection prevention

---

## Credential Management

### Encryption

All provider credentials are encrypted using GCP KMS (AES-256-GCM).

### Decryption Flow

```
Read encrypted credential from BigQuery
        │
        ▼
KMS Decrypt
        │
        ▼
Use for API call
        │
        ▼
Clear from memory
```

---

## Rate Limiting

| Limit | Default |
|-------|---------|
| Per-org per minute | 100 |
| Pipeline runs per minute | 50 |

---

## Security Contact

For security vulnerabilities, contact the security team immediately.

Do NOT create public issues for security vulnerabilities.
