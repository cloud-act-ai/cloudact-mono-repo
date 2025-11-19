# Convergence Data Pipeline - Complete Guide

**Production-ready multi-tenant data pipeline for cloud cost and compliance analytics**

## 🚀 Quick Start (5 Minutes)

### Step 1: Generate Admin Key
```bash
cd /path/to/cloudact-backend-systems
python3 scripts/generate_admin_key.py
export ADMIN_API_KEY='admin_<your-generated-key>'
```

### Step 2: Configure Environment
```bash
export GCP_PROJECT_ID='gac-prod-471220'
export GOOGLE_APPLICATION_CREDENTIALS='/path/to/service-account.json'
export ENVIRONMENT='development'
```

### Step 3: Start Server
```bash
cd convergence-data-pipeline
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Step 4: Bootstrap System (One-Time)
```bash
curl -X POST http://localhost:8000/api/v1/admin/bootstrap \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"force_recreate_dataset": false, "force_recreate_tables": false}'
```

### Step 5: Create Tenant & API Key
```bash
# Create tenant
curl -X POST http://localhost:8000/api/v1/admin/tenants \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"tenant_id": "sri_482433", "description": "Sri Corp"}'

# Generate tenant API key
curl -X POST http://localhost:8000/api/v1/admin/api-keys \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"tenant_id": "sri_482433", "description": "Production key"}'
```

### Step 6: Test
```bash
export API_URL='http://localhost:8000'
./tests/local_test_suite.sh
```

---

## 📋 Complete Infrastructure & Deployment Guide

### 🛠️ Infrastructure Setup (One-Time)

#### Prerequisites
- GCP Project: `gac-prod-471220`
- APIs enabled: BigQuery, Cloud KMS, Secret Manager
- Service Account: `convergence-api@gac-prod-471220.iam.gserviceaccount.com`

#### Setup KMS
```bash
cd cloudact-infrastructure-scripts
./02-setup-kms.sh

# Creates:
# - Keyring: convergence-keyring-prod (us-central1)
# - Key: api-key-encryption
# - Grants permissions to service account
```

### 💻 Local Development

```bash
# Install dependencies
cd convergence-data-pipeline
pip install -r requirements.txt

# Configure .env
cat > .env <<EOF
GCP_PROJECT_ID=gac-prod-471220
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
KMS_PROJECT_ID=gac-prod-471220
KMS_LOCATION=us-central1
KMS_KEYRING=convergence-keyring-prod
KMS_KEY=api-key-encryption
ENVIRONMENT=development
LOG_LEVEL=DEBUG
ADMIN_API_KEY=$(python3 ../scripts/generate_admin_key.py --no-prompt)
EOF

# Start server
python3 -m uvicorn src.app.main:app --reload --port 8000
```

### 🚢 Deployment

#### Staging Deployment
```bash
# Build and deploy
gcloud builds submit --tag gcr.io/gac-prod-471220/convergence-api:staging
gcloud run deploy convergence-api-staging \
    --image gcr.io/gac-prod-471220/convergence-api:staging \
    --region us-central1 \
    --set-env-vars="ENVIRONMENT=staging,GCP_PROJECT_ID=gac-prod-471220" \
    --update-secrets=ADMIN_API_KEY=admin-api-key-staging:latest \
    --service-account=convergence-api@gac-prod-471220.iam.gserviceaccount.com \
    --memory=2Gi --min-instances=1 --max-instances=10

# Bootstrap
STAGING_URL=$(gcloud run services describe convergence-api-staging --region=us-central1 --format='value(status.url)')
curl -X POST "$STAGING_URL/api/v1/admin/bootstrap" \
  -H "X-Admin-Key: $(gcloud secrets versions access latest --secret=admin-api-key-staging)" \
  -H 'Content-Type: application/json' \
  -d '{"force_recreate_dataset": false, "force_recreate_tables": false}'

# Test
export STAGING_URL="$STAGING_URL"
export ADMIN_API_KEY=$(gcloud secrets versions access latest --secret=admin-api-key-staging)
./tests/staging_test_suite.sh
```

#### Production Deployment
```bash
# Build and deploy
gcloud builds submit --tag gcr.io/gac-prod-471220/convergence-api:v1.0.0
gcloud run deploy convergence-api-prod \
    --image gcr.io/gac-prod-471220/convergence-api:v1.0.0 \
    --region us-central1 \
    --set-env-vars="ENVIRONMENT=production,GCP_PROJECT_ID=gac-prod-471220,LOG_LEVEL=INFO" \
    --update-secrets=ADMIN_API_KEY=admin-api-key-prod:latest \
    --service-account=convergence-api@gac-prod-471220.iam.gserviceaccount.com \
    --memory=4Gi --min-instances=2 --max-instances=50

# Test
PROD_URL=$(gcloud run services describe convergence-api-prod --region=us-central1 --format='value(status.url)')
export PROD_URL="$PROD_URL"
./tests/production_test_suite.sh
```

### 🧪 Testing (30 Tests)

```bash
# Local (10 tests)
export ADMIN_API_KEY='your-key'
export API_URL='http://localhost:8000'
./tests/local_test_suite.sh

# Staging (10 tests)
export STAGING_URL='https://your-staging-url'
./tests/staging_test_suite.sh

# Production (10 tests - non-destructive)
export PROD_URL='https://your-production-url'
./tests/production_test_suite.sh
```

---

## 📡 API Reference

### Admin Endpoints (Require `X-Admin-Key`)

```bash
# Bootstrap
POST /api/v1/admin/bootstrap
X-Admin-Key: admin_...
Body: {"force_recreate_dataset": false, "force_recreate_tables": false}

# Create Tenant
POST /api/v1/admin/tenants
X-Admin-Key: admin_...
Body: {"tenant_id": "sri_482433", "description": "Sri Corp"}

# Generate API Key
POST /api/v1/admin/api-keys
X-Admin-Key: admin_...
Body: {"tenant_id": "sri_482433", "description": "Production key"}
Response: {"api_key": "sk_sri_482433_...", "tenant_api_key_hash": "..."}

# Get Tenant
GET /api/v1/admin/tenants/{tenant_id}
X-Admin-Key: admin_...

# Revoke API Key
DELETE /api/v1/admin/api-keys/{hash}
X-Admin-Key: admin_...
```

### Tenant Endpoints (Require `X-API-Key`)

```bash
# Execute Pipeline
POST /api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{pipeline_id}
X-API-Key: sk_tenant_...
Body: {"date": "2025-11-19", "parameters": {}}

# Onboard (Self-Service)
POST /api/v1/tenants/onboard
Body: {"tenant_id": "sri_482433", "company_name": "Sri Corp", "admin_email": "admin@sri.com"}
```

---

## 🔧 Troubleshooting

### KMS Timeout
```bash
# Check permissions
gcloud kms keys get-iam-policy api-key-encryption \
    --location=us-central1 --keyring=convergence-keyring-prod
```

### Bootstrap Error
```bash
# Force recreate if needed
curl -X POST http://localhost:8000/api/v1/admin/bootstrap \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"force_recreate_dataset": false, "force_recreate_tables": true}'
```

### View Logs
```bash
# Cloud Run logs
gcloud run services logs read convergence-api-prod \
    --region=us-central1 --limit=100 --filter='severity>=ERROR'
```

---

## 📝 Recent Changes (v1.0.0)

- ✅ Fixed critical security (admin endpoints)
- ✅ Consistent field naming (`tenant_api_key_*`)
- ✅ Fixed bootstrap logging error
- ✅ Added 30 test cases
- ✅ Production ready

---

**Version**: 1.0.0 | **Project**: gac-prod-471220 | **Status**: Production Ready ✅
