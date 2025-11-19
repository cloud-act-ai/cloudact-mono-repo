# Deployment Guide - Convergence Data Pipeline

Complete deployment guide for local, staging, and production environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development](#local-development)
3. [Staging Deployment](#staging-deployment)
4. [Production Deployment](#production-deployment)
5. [Testing](#testing)
6. [Monitoring](#monitoring)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Services

- **Google Cloud Platform Project**
  - BigQuery API enabled
  - Cloud KMS API enabled
  - Service account with appropriate permissions

- **Service Account Permissions**:
  ```
  roles/bigquery.admin
  roles/cloudkms.cryptoKeyEncrypterDecrypter
  roles/secretmanager.secretAccessor (optional)
  ```

### Required Tools

- Python 3.11+
- Docker (optional, for containerized deployment)
- `gcloud` CLI
- `git`

---

## Local Development

### 1. Clone Repository

```bash
git clone https://github.com/your-org/cloudact-backend-systems.git
cd cloudact-backend-systems/convergence-data-pipeline
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment

Create `.env` file:

```bash
# GCP Configuration
GCP_PROJECT_ID=your-project-id
BIGQUERY_LOCATION=US
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# KMS Configuration
KMS_PROJECT_ID=your-project-id
KMS_LOCATION=us-central1
KMS_KEYRING=convergence-keyring-dev
KMS_KEY=api-key-encryption

# Application
ENVIRONMENT=development
LOG_LEVEL=DEBUG
API_HOST=0.0.0.0
API_PORT=8000

# Security
ADMIN_API_KEY=<generate-with-script>
DISABLE_AUTH=false  # Set to true only for local testing
```

### 4. Generate Admin API Key

```bash
python3 scripts/generate_admin_key.py
export ADMIN_API_KEY='<generated-key>'
```

### 5. Bootstrap System

```bash
# Start the application
python3 -m uvicorn src.app.main:app --reload --port 8000

# In another terminal, bootstrap
curl -X POST http://localhost:8000/api/v1/admin/bootstrap \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"force_recreate_dataset": false, "force_recreate_tables": false}'
```

### 6. Run Tests

```bash
export ADMIN_API_KEY='your-admin-key'
export API_URL='http://localhost:8000'
./tests/local_test_suite.sh
```

---

## Staging Deployment

### 1. Prepare GCP Environment

```bash
# Set project
gcloud config set project your-staging-project

# Create KMS keyring and key
gcloud kms keyrings create convergence-keyring-staging \
    --location=us-central1

gcloud kms keys create api-key-encryption \
    --location=us-central1 \
    --keyring=convergence-keyring-staging \
    --purpose=encryption

# Grant service account permissions
SERVICE_ACCOUNT="convergence-api-staging@your-project.iam.gserviceaccount.com"

gcloud kms keys add-iam-policy-binding api-key-encryption \
    --location=us-central1 \
    --keyring=convergence-keyring-staging \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/cloudkms.cryptoKeyEncrypterDecrypter"
```

### 2. Store Secrets

```bash
# Generate admin API key for staging
STAGING_ADMIN_KEY=$(python3 scripts/generate_admin_key.py --no-prompt)

# Store in Secret Manager
echo -n "$STAGING_ADMIN_KEY" | gcloud secrets create admin-api-key-staging \
    --data-file=- \
    --replication-policy=automatic

# Grant access to service account
gcloud secrets add-iam-policy-binding admin-api-key-staging \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor"
```

### 3. Deploy to Cloud Run

```bash
# Build container
gcloud builds submit --tag gcr.io/your-project/convergence-api:staging

# Deploy
gcloud run deploy convergence-api-staging \
    --image gcr.io/your-project/convergence-api:staging \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated \
    --set-env-vars="ENVIRONMENT=staging" \
    --set-env-vars="GCP_PROJECT_ID=your-staging-project" \
    --set-env-vars="KMS_LOCATION=us-central1" \
    --set-env-vars="KMS_KEYRING=convergence-keyring-staging" \
    --set-env-vars="KMS_KEY=api-key-encryption" \
    --update-secrets=ADMIN_API_KEY=admin-api-key-staging:latest \
    --service-account=$SERVICE_ACCOUNT \
    --memory=2Gi \
    --cpu=2 \
    --timeout=300 \
    --concurrency=100 \
    --min-instances=1 \
    --max-instances=10
```

### 4. Bootstrap Staging

```bash
STAGING_URL=$(gcloud run services describe convergence-api-staging \
    --region=us-central1 \
    --format='value(status.url)')

curl -X POST "$STAGING_URL/api/v1/admin/bootstrap" \
  -H "X-Admin-Key: $STAGING_ADMIN_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"force_recreate_dataset": false, "force_recreate_tables": false}'
```

### 5. Run Staging Tests

```bash
export STAGING_URL="$STAGING_URL"
export ADMIN_API_KEY="$STAGING_ADMIN_KEY"
./tests/staging_test_suite.sh
```

---

## Production Deployment

### 1. Pre-Deployment Checklist

- [ ] All staging tests passing
- [ ] Load testing completed
- [ ] Security review completed
- [ ] Backup plan in place
- [ ] Rollback plan documented
- [ ] On-call engineer notified

### 2. Prepare Production Environment

```bash
# Set production project
gcloud config set project your-production-project

# Create KMS infrastructure (same as staging, but use -prod suffix)
gcloud kms keyrings create convergence-keyring-prod \
    --location=us-central1

gcloud kms keys create api-key-encryption \
    --location=us-central1 \
    --keyring=convergence-keyring-prod \
    --purpose=encryption

# Grant permissions
SERVICE_ACCOUNT="convergence-api-prod@your-project.iam.gserviceaccount.com"

gcloud kms keys add-iam-policy-binding api-key-encryption \
    --location=us-central1 \
    --keyring=convergence-keyring-prod \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/cloudkms.cryptoKeyEncrypterDecrypter"
```

### 3. Deploy Production

```bash
# Build production image
gcloud builds submit --tag gcr.io/your-project/convergence-api:v1.0.0

# Deploy with blue-green strategy
gcloud run deploy convergence-api-prod \
    --image gcr.io/your-project/convergence-api:v1.0.0 \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated \
    --set-env-vars="ENVIRONMENT=production" \
    --set-env-vars="GCP_PROJECT_ID=your-production-project" \
    --set-env-vars="KMS_LOCATION=us-central1" \
    --set-env-vars="KMS_KEYRING=convergence-keyring-prod" \
    --set-env-vars="KMS_KEY=api-key-encryption" \
    --set-env-vars="LOG_LEVEL=INFO" \
    --update-secrets=ADMIN_API_KEY=admin-api-key-prod:latest \
    --service-account=$SERVICE_ACCOUNT \
    --memory=4Gi \
    --cpu=4 \
    --timeout=300 \
    --concurrency=200 \
    --min-instances=2 \
    --max-instances=50 \
    --tag=blue
```

### 4. Verify Production

```bash
PROD_URL=$(gcloud run services describe convergence-api-prod \
    --region=us-central1 \
    --format='value(status.url)')

# Run health checks
export PROD_URL="$PROD_URL"
./tests/production_test_suite.sh
```

### 5. Traffic Migration

```bash
# Gradually shift traffic to new version
gcloud run services update-traffic convergence-api-prod \
    --to-revisions=LATEST=10

# Monitor for 10 minutes, then increase
gcloud run services update-traffic convergence-api-prod \
    --to-revisions=LATEST=50

# Monitor for 10 minutes, then complete
gcloud run services update-traffic convergence-api-prod \
    --to-revisions=LATEST=100
```

---

## Testing

### Local Tests

```bash
./tests/local_test_suite.sh
```

**Tests included:**
1. Health check
2. Bootstrap system
3. Create tenant
4. Get tenant info
5. Generate tenant API key
6. Invalid admin key rejected
7. Missing admin key rejected
8. API versioning
9. Rate limiting
10. Schema consistency

### Staging Tests

```bash
export STAGING_URL="https://your-staging-url.com"
export ADMIN_API_KEY="your-staging-admin-key"
./tests/staging_test_suite.sh
```

**Tests included:**
1. HTTPS/TLS certificate validation
2. Service health & environment
3. KMS integration
4. Multi-tenant isolation
5. Rate limiting
6. BigQuery dataset access
7. Logging & monitoring
8. Performance (response time)
9. Error handling
10. End-to-end workflow

### Production Tests (Non-Destructive)

```bash
export PROD_URL="https://your-production-url.com"
export ADMIN_API_KEY="your-production-admin-key"
./tests/production_test_suite.sh
```

**Tests included:**
1. Service availability (99.9% uptime)
2. HTTPS/TLS security
3. Response time SLA (< 500ms)
4. Admin endpoints protected
5. Invalid admin keys rejected
6. API versioning
7. Error handling (404s)
8. CORS configuration
9. Rate limiting active
10. Environment configuration

---

## Monitoring

### Key Metrics

- **Availability**: Target 99.9%
- **Response Time**: P95 < 200ms, P99 < 500ms
- **Error Rate**: < 0.1%
- **Request Rate**: Monitor for anomalies

### Logging

All logs are structured JSON format:

```json
{
  "timestamp": "2025-11-19T02:00:00Z",
  "severity": "INFO",
  "name": "src.app.main",
  "msg": "Request completed",
  "method": "POST",
  "path": "/api/v1/admin/tenants",
  "status_code": 200,
  "duration_ms": 123.45,
  "tenant_id": "acmecorp"
}
```

### Alerts

Set up alerts for:
- Health check failures (> 2 consecutive)
- Response time degradation (P95 > 500ms)
- Error rate spike (> 1% in 5 minutes)
- KMS failures
- BigQuery quota limits

---

## Troubleshooting

### Common Issues

#### 1. KMS Encryption Timeout

**Symptom**: Tenant API key generation times out

**Solution**:
```bash
# Check KMS permissions
gcloud kms keys get-iam-policy api-key-encryption \
    --location=us-central1 \
    --keyring=convergence-keyring-prod

# Verify service account has access
# Check network connectivity from Cloud Run to KMS
```

#### 2. BigQuery Permission Denied

**Symptom**: Unable to create datasets/tables

**Solution**:
```bash
# Grant BigQuery Admin role
gcloud projects add-iam-policy-binding your-project \
    --member="serviceAccount:your-sa@your-project.iam.gserviceaccount.com" \
    --role="roles/bigquery.admin"
```

#### 3. Bootstrap Logging Error

**Symptom**: `Attempt to overwrite 'created' in LogRecord`

**Solution**: This is fixed in commit `9d12ce8`. Ensure you're running latest version.

### Log Analysis

```bash
# View Cloud Run logs
gcloud run services logs read convergence-api-prod \
    --region=us-central1 \
    --limit=100

# Filter for errors
gcloud run services logs read convergence-api-prod \
    --region=us-central1 \
    --filter='severity>=ERROR'

# Follow logs in real-time
gcloud run services logs tail convergence-api-prod \
    --region=us-central1
```

---

## Rollback Procedures

### Cloud Run Rollback

```bash
# List revisions
gcloud run revisions list --service=convergence-api-prod --region=us-central1

# Rollback to previous revision
gcloud run services update-traffic convergence-api-prod \
    --to-revisions=convergence-api-prod-00001-abc=100 \
    --region=us-central1
```

### Database Rollback

If schema changes were made:

1. Backup current data
2. Run bootstrap with force_recreate_tables=true
3. Restore data from backup

---

## Security Best Practices

1. **Never commit secrets** - Use Secret Manager
2. **Rotate admin keys** every 90 days
3. **Use different keys** for each environment
4. **Enable audit logging** for all admin operations
5. **Review IAM permissions** quarterly
6. **Enable VPC Service Controls** in production
7. **Use Cloud Armor** for DDoS protection

---

## Support

- **Documentation**: `/docs`
- **Issues**: GitHub Issues
- **Emergency**: On-call rotation

---

**Last Updated**: 2025-11-19
**Version**: 1.0.0
