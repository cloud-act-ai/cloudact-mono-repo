---
name: deploy-check
description: |
  Deployment automation and checks for CloudAct. Pre-deployment validation, health checks, rollback.
  Use when: preparing for deployment, running pre-deployment checks, verifying deployments,
  debugging deployment issues, or managing Cloud Run deployments.
---

# Deployment Checks

## Overview
CloudAct deploys to Google Cloud Run with test, staging and production environments.

## Key Locations
- **Deploy Script:** `04-inra-cicd-automation/CICD/deploy/deploy.sh`
- **Push Script:** `04-inra-cicd-automation/CICD/push/push.sh`
- **Environments Config:** `04-inra-cicd-automation/CICD/environments.conf`
- **Dockerfiles:** `{service}/Dockerfile`

## Environments

| Environment | GCP Project | Service Account | Auth Mode |
|-------------|-------------|-----------------|-----------|
| Test | `cloudact-testing-1` | `cloudact-sa-test@cloudact-testing-1.iam.gserviceaccount.com` | Public (app auth) |
| Stage | `cloudact-stage` | `cloudact-sa-stage@cloudact-stage.iam.gserviceaccount.com` | Public (app auth) |
| Prod | `cloudact-prod` | `cloudact-sa-prod@cloudact-prod.iam.gserviceaccount.com` | Public (app auth) |

> **Note:** All environments allow unauthenticated Cloud Run access. App handles auth via `X-CA-Root-Key` and `X-API-Key` headers.

### Credentials Location
```
~/.gcp/cloudact-testing-1-e44da390bf82.json  # Test
~/.gcp/cloudact-stage.json                    # Stage
~/.gcp/cloudact-prod.json                     # Prod
```

## Service URLs

**Cloud Run Naming:** `cloudact-{service}-{env}-{hash}.us-central1.run.app`

| Service | Test | Stage | Prod |
|---------|------|-------|------|
| API | `cloudact-api-service-test-{hash}` | `cloudact-api-service-stage-{hash}` | `cloudact-api-service-prod-{hash}` |
| Pipeline | `cloudact-pipeline-service-test-{hash}` | `cloudact-pipeline-service-stage-{hash}` | `cloudact-pipeline-service-prod-{hash}` |

**Custom Domains (Prod only):**
- `https://api.cloudact.ai` → cloudact-api-service-prod
- `https://pipeline.cloudact.ai` → cloudact-pipeline-service-prod

**Frontend:**
- Stage: `https://cloudact-stage.vercel.app`
- Prod: `https://cloudact.ai`

## Pre-Deployment Checklist

### 1. Code Quality
- [ ] All tests passing
- [ ] No lint errors (Ruff, ESLint)
- [ ] Type checks pass (mypy)
- [ ] Security tests pass
- [ ] No hardcoded secrets

### 2. Configuration
- [ ] Environment variables documented
- [ ] Secrets in Secret Manager
- [ ] Config files validated
- [ ] Provider registry complete

### 3. Database
- [ ] Schema changes tested
- [ ] Migrations compatible
- [ ] No breaking changes
- [ ] Rollback plan ready

### 4. API
- [ ] API versioning maintained
- [ ] Breaking changes documented
- [ ] Rate limits configured
- [ ] Auth properly configured

## Instructions

### 1. Run Pre-Deployment Tests
```bash
# Run all tests
python -m pytest 02-api-service/tests/ -v
python -m pytest 03-data-pipeline-service/tests/ -v
npm run test --prefix 01-fronted-system

# Run security tests
python -m pytest tests/test_security.py -v

# Run lint
cd 02-api-service && ruff check src/
cd 03-data-pipeline-service && ruff check src/
cd 01-fronted-system && npm run lint
```

### 2. Validate Docker Build
```bash
# Build images locally
docker build -t api-service:test 02-api-service/
docker build -t pipeline-service:test 03-data-pipeline-service/
docker build -t frontend:test 01-fronted-system/

# Test locally
docker-compose up -d
curl http://localhost:8000/health
curl http://localhost:8001/health
```

### 3. Deploy Using CICD Scripts
```bash
cd 04-inra-cicd-automation/CICD

# Push images
./push/push.sh api-service test cloudact-testing-1
./push/push.sh pipeline-service test cloudact-testing-1

# Deploy to Cloud Run
./deploy/deploy.sh api-service test cloudact-testing-1
./deploy/deploy.sh pipeline-service test cloudact-testing-1
```

### 4. Verify Deployment
```bash
# Get service URL
gcloud run services describe cloudact-api-service-test \
  --project=cloudact-testing-1 \
  --region=us-central1 \
  --format="value(status.url)"

# Health check
curl -s ${SERVICE_URL}/health
```

### 5. Deploy to Stage/Prod
```bash
# Stage
./deploy/deploy.sh api-service stage cloudact-stage
./deploy/deploy.sh pipeline-service stage cloudact-stage

# Prod
./deploy/deploy.sh api-service prod cloudact-prod
./deploy/deploy.sh pipeline-service prod cloudact-prod
```

### 6. Post-Deployment Verification
```bash
# Production health checks (via custom domain)
curl -s https://api.cloudact.ai/health
curl -s https://pipeline.cloudact.ai/health

# Check logs
gcloud logging read "resource.type=cloud_run_revision" \
  --project cloudact-prod \
  --limit 100
```

### 7. Rollback if Needed
```bash
# List revisions
gcloud run revisions list --service cloudact-api-service-prod --region us-central1

# Rollback to previous
gcloud run services update-traffic cloudact-api-service-prod \
  --to-revisions {previous-revision}=100 \
  --region us-central1
```

## Environment Variables
```bash
# Required for deployment
GCP_PROJECT_ID=cloudact-prod
CA_ROOT_API_KEY=your-secure-key
ENVIRONMENT=production
DISABLE_AUTH=false  # NEVER true in prod

# Optional
RATE_LIMIT_ENABLED=true
LOG_LEVEL=INFO
```

## Docker Configuration
```dockerfile
# Common patterns
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src/ src/
COPY configs/ configs/
CMD ["uvicorn", "src.app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

## Validation Checklist
- [ ] All tests pass
- [ ] Docker builds succeed
- [ ] Health checks return 200
- [ ] Logs show no errors
- [ ] API endpoints respond
- [ ] Pipeline runs complete

## Common Issues
| Issue | Solution |
|-------|----------|
| Build fails | Check Dockerfile and dependencies |
| Health check timeout | Increase startup time or fix init |
| Permission denied | Check service account IAM roles |
| Secret not found | Verify Secret Manager config |
| 403 Forbidden | Run `./quick/fix-auth.sh <env>` to enable public access |
| File not found for credentials | Add `.env.local` to `.dockerignore` |
| Connection refused localhost | Set `PIPELINE_SERVICE_URL` or `API_SERVICE_URL` env |

## CICD Scripts Reference
```
04-inra-cicd-automation/CICD/
├── release.sh              # Versioned release workflow
├── releases.sh             # List/manage releases
├── build/build.sh          # Docker build
├── push/push.sh            # Push to GCR
├── deploy/deploy.sh        # Deploy to Cloud Run
├── deploy-all.sh           # Deploy all services
├── cicd.sh                 # Full pipeline
├── quick/
│   ├── deploy-test.sh      # Quick test deploy
│   ├── deploy-stage.sh     # Quick stage deploy
│   ├── deploy-prod.sh      # Quick prod deploy
│   ├── status.sh           # Service status checker
│   └── fix-auth.sh         # Fix Cloud Run IAM (enable public access)
└── monitor/
    ├── watch-all.sh        # All service logs
    └── watch-api-logs.sh   # Single service logs
```

## Example Prompts

```
# Pre-Deployment
"What should I check before deploying?"
"Run pre-deployment validation"
"Is the code ready for production?"

# Deploying
"Deploy to staging environment"
"Promote staging to production"
"How do I deploy the pipeline service?"

# Verification
"Verify staging deployment is healthy"
"Check production health endpoints"
"Are all services responding?"

# Rollback
"Rollback to previous version"
"List available revisions"
"How do I revert a failed deployment?"

# Troubleshooting
"Deployment failed at build step"
"Health check timeout after deploy"
```

## Related Skills
- `test-orchestration` - Run tests before deploy
- `security-audit` - Security verification
- `config-validator` - Validate configs
