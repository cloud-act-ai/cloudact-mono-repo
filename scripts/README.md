# Admin Scripts

Collection of administrative scripts for platform management.

## Admin API Key Management

### Generate Admin API Key

Generate a secure admin API key for platform-level operations:

```bash
python3 scripts/generate_admin_key.py
```

This will:
- Generate a cryptographically secure admin API key (256 bits of entropy)
- Display setup instructions
- Optionally save to `.env.admin` file

**Usage:**

```bash
# Generate admin key
python3 scripts/generate_admin_key.py

# Set environment variable
export ADMIN_API_KEY='admin_...'

# Or load from file
source .env.admin
```

### Using Admin API Key

The admin API key is required for all `/admin/*` endpoints:

```bash
# Bootstrap system
curl -X POST http://localhost:8000/api/v1/admin/bootstrap \
     -H 'X-Admin-Key: YOUR_ADMIN_KEY' \
     -H 'Content-Type: application/json' \
     -d '{"force_recreate_dataset": false}'

# Create tenant
curl -X POST http://localhost:8000/api/v1/admin/tenants \
     -H 'X-Admin-Key: YOUR_ADMIN_KEY' \
     -H 'Content-Type: application/json' \
     -d '{"tenant_id": "acmecorp", "description": "Acme Corporation"}'

# Generate tenant API key
curl -X POST http://localhost:8000/api/v1/admin/api-keys \
     -H 'X-Admin-Key: YOUR_ADMIN_KEY' \
     -H 'Content-Type: application/json' \
     -d '{"tenant_id": "acmecorp", "description": "Production API key"}'

# Revoke API key
curl -X DELETE http://localhost:8000/api/v1/admin/api-keys/{hash} \
     -H 'X-Admin-Key: YOUR_ADMIN_KEY'
```

## Security Best Practices

1. **Never commit admin keys to version control**
2. **Store in secret management** (GCP Secret Manager, HashiCorp Vault, etc.)
3. **Rotate regularly** (every 90 days recommended)
4. **Use different keys** for staging and production
5. **Audit all usage** of admin API keys
6. **Revoke immediately** if compromised

## Production Setup

For production, store the admin API key in GCP Secret Manager:

```bash
# Create secret
gcloud secrets create admin-api-key \
    --data-file=<(echo -n 'YOUR_ADMIN_KEY')

# Grant access to service account
gcloud secrets add-iam-policy-binding admin-api-key \
    --member="serviceAccount:convergence-api@PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

# Use in Cloud Run deployment
gcloud run services update convergence-api \
    --update-secrets=ADMIN_API_KEY=admin-api-key:latest
```
