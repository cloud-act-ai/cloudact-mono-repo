# Tenant Secrets Management

## Overview
Tenant-specific secrets (API keys, credentials, etc.) should **NEVER** be committed to version control. This document explains how to securely store and manage tenant secrets.

## Recommended Approach: Use Environment Variables + BigQuery

### 1. Store API Keys in BigQuery
API keys are already stored securely in BigQuery's `metadata.api_keys` table:
- Hashed using SHA256
- Tenant-specific
- Managed via the Admin API

### 2. Store Service Account Keys Externally
Service account keys and other credentials should be stored outside the repository:

```bash
# Create a secrets directory (ignored by git)
mkdir -p ~/.cloudact-secrets/

# Store tenant-specific secrets
~/.cloudact-secrets/
├── acme1281/
│   ├── service-account-key.json
│   └── api-credentials.json
├── tenant2/
│   └── service-account-key.json
```

### 3. Reference Secrets via Environment Variables

**Option A: Environment Variables in .env**
```bash
# .env (gitignored)
ACME1281_GCP_SERVICE_ACCOUNT_PATH=~/.cloudact-secrets/acme1281/service-account-key.json
ACME1281_API_KEY=sk_acme1281_...
```

**Option B: Config File with External References**
```yaml
# configs/acme1281/tenant_config.yml
tenant_id: acme1281
gcp:
  service_account_path: ${ACME1281_GCP_SERVICE_ACCOUNT_PATH}
  project_id: ${ACME1281_GCP_PROJECT_ID}
```

## Files Protected by .gitignore

The following patterns are automatically ignored:
- `**/*secret*.json`
- `**/*key*.json`
- `**/*credential*.json`
- `**/service-account*.json`
- `.env` and `.env.*`
- `configs/**/secrets/`
- `configs/**/*secret*.json`

## Creating API Keys for Tenants

Use the Admin API to create tenant API keys:

```bash
curl -X POST "http://localhost:8080/api/v1/admin/api-keys" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acme1281",
    "description": "Production API key",
    "permissions": ["pipelines:run", "pipelines:read"]
  }'
```

This returns:
```json
{
  "api_key": "sk_acme1281_...",
  "tenant_id": "acme1281",
  "created_at": "2025-11-15T06:58:45.024967"
}
```

**IMPORTANT**: Save the `api_key` value immediately - it won't be shown again!

## Best Practices

### ✅ DO:
- Store secrets in BigQuery (API keys)
- Use environment variables for service accounts
- Keep service account files in `~/.cloudact-secrets/`
- Use `.env` files for local development (gitignored)
- Rotate API keys regularly
- Use least-privilege permissions

### ❌ DON'T:
- Commit secrets to git
- Store plaintext passwords in config files
- Share API keys via Slack/email
- Use the same API key across environments
- Store secrets in application code

## Production Deployment

For production, use:
- **Google Secret Manager**: Store service account keys and other secrets
- **Environment Variables**: Inject secrets at runtime via Cloud Run, Kubernetes, etc.
- **Workload Identity**: Eliminate service account keys entirely (recommended)

Example with Google Secret Manager:
```python
from google.cloud import secretmanager

def get_tenant_secret(tenant_id: str, secret_name: str) -> str:
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{PROJECT_ID}/secrets/{tenant_id}_{secret_name}/versions/latest"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode('UTF-8')
```

## Troubleshooting

### Secret file not found
```bash
# Check if the file exists
ls -la ~/.cloudact-secrets/acme1281/

# Verify environment variable
echo $ACME1281_GCP_SERVICE_ACCOUNT_PATH
```

### API key invalid
```bash
# Create a new API key
curl -X POST "http://localhost:8080/api/v1/admin/api-keys" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "acme1281", "description": "New key"}'
```

## Example Tenant Configuration

```yaml
# configs/acme1281/tenant_config.yml
tenant_id: acme1281

# Reference secrets via environment variables
gcp:
  project_id: ${ACME1281_GCP_PROJECT_ID}
  # Service account managed via Workload Identity or Secret Manager

# API key stored in BigQuery metadata.api_keys table
# Retrieved via X-API-Key header in API requests
```
