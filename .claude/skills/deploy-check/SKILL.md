---
name: deploy-check
description: |
  Deployment automation and checks for CloudAct. Pre-deployment validation, health checks, rollback.
  Use when: preparing for deployment, running pre-deployment checks, verifying deployments,
  debugging deployment issues, or managing Cloud Run deployments.
---

# Deployment Checks

## Overview
CloudAct deploys to Google Cloud Run with staging and production environments.

## Key Locations
- **Deploy Workflow:** `.github/workflows/deploy.yml`
- **Test Workflow:** `.github/workflows/test.yml`
- **Dockerfiles:** `{service}/Dockerfile`
- **Docker Compose:** `docker-compose.yml`

## Environments
| Environment | Project ID | URL Pattern |
|-------------|------------|-------------|
| Staging | 526075321773 | `*-stage-526075321773.us-central1.run.app` |
| Production | 820784027009 | `*-prod-820784027009.us-central1.run.app` |

## Service URLs
```
# Staging
API: https://convergence-api-stage-526075321773.us-central1.run.app
Pipeline: https://convergence-pipeline-stage-526075321773.us-central1.run.app

# Production
API: https://convergence-api-prod-820784027009.us-central1.run.app
Pipeline: https://convergence-pipeline-prod-820784027009.us-central1.run.app
```

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

### 3. Deploy to Staging
```bash
# Via GitHub Actions (recommended)
git push origin main  # Triggers deploy.yml

# Manual (if needed)
gcloud run deploy api-service \
  --image gcr.io/{project}/api-service:latest \
  --region us-central1 \
  --platform managed \
  --memory 2Gi \
  --timeout 300
```

### 4. Verify Staging Deployment
```bash
# Health checks
curl -s https://convergence-api-stage-526075321773.us-central1.run.app/health
curl -s https://convergence-pipeline-stage-526075321773.us-central1.run.app/health

# API functionality
curl -s https://convergence-api-stage-526075321773.us-central1.run.app/api/v1/health
```

### 5. Promote to Production
```bash
# After staging verification
# Trigger production deploy via GitHub Actions
# or manual promotion

gcloud run services update-traffic api-service \
  --to-latest \
  --region us-central1 \
  --project {prod-project}
```

### 6. Post-Deployment Verification
```bash
# Production health checks
curl -s https://convergence-api-prod-820784027009.us-central1.run.app/health
curl -s https://convergence-pipeline-prod-820784027009.us-central1.run.app/health

# Check logs
gcloud logging read "resource.type=cloud_run_revision" \
  --project {project} \
  --limit 100
```

### 7. Rollback if Needed
```bash
# List revisions
gcloud run revisions list --service api-service --region us-central1

# Rollback to previous
gcloud run services update-traffic api-service \
  --to-revisions {previous-revision}=100 \
  --region us-central1
```

## CI/CD Workflow
```yaml
# .github/workflows/deploy.yml flow
1. Run tests (test.yml)
2. Authenticate to GCP
3. Build Docker images
4. Push to GCR
5. Deploy to Cloud Run
6. Health check
7. Summary report
```

## Environment Variables
```bash
# Required for deployment
GOOGLE_CLOUD_PROJECT=your-project
CA_ROOT_API_KEY=your-secure-key
ENVIRONMENT=production|staging
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
