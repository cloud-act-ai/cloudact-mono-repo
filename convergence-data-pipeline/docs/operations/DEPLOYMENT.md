# Convergence Data Pipeline - Deployment Guide

## Table of Contents
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Pre-Deployment Steps](#pre-deployment-steps)
- [Deployment Process](#deployment-process)
- [Post-Deployment Verification](#post-deployment-verification)
- [Rollback Procedure](#rollback-procedure)
- [Environment-Specific Instructions](#environment-specific-instructions)

## Overview

This guide provides step-by-step instructions for deploying the Convergence Data Pipeline to production and staging environments.

**Deployment Strategy:** Blue-Green deployment with zero-downtime rollout
**Target Platform:** Google Cloud Run / Kubernetes
**Average Deployment Time:** 15-20 minutes

## Prerequisites

### Required Access
- [ ] GCP Project Owner/Editor access
- [ ] GitHub repository access
- [ ] Docker Hub / Artifact Registry access
- [ ] PagerDuty admin access (for production)
- [ ] Slack workspace admin (for notifications)

### Required Tools
```bash
# Install required tools
gcloud components install kubectl
pip install -r requirements.txt

# Verify versions
gcloud --version  # >= 400.0.0
kubectl version   # >= 1.27
docker --version  # >= 24.0
python --version  # >= 3.11
```

### Environment Variables
```bash
# Copy and configure environment file
cp .env.example .env

# Required variables
export GCP_PROJECT_ID="your-project-id"
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
export ENVIRONMENT="production"
export APP_VERSION="1.0.0"

# Verify authentication
gcloud auth list
gcloud config set project $GCP_PROJECT_ID
```

## Pre-Deployment Steps

### 1. Code Quality Checks
```bash
# Run linting
ruff check src/
black --check src/

# Run type checking
mypy src/

# Run security scanning
bandit -r src/
safety check
```

### 2. Run Tests
```bash
# Unit tests
pytest tests/unit/ -v

# Integration tests
pytest tests/integration/ -v

# E2E tests (staging environment)
pytest tests/e2e/ -v --environment=staging

# Verify all tests pass (100% success rate required)
```

### 3. Build and Tag Docker Image
```bash
# Build production image
docker build -t convergence-data-pipeline:${APP_VERSION} .

# Tag for registry
docker tag convergence-data-pipeline:${APP_VERSION} \
  gcr.io/${GCP_PROJECT_ID}/convergence-data-pipeline:${APP_VERSION}

docker tag convergence-data-pipeline:${APP_VERSION} \
  gcr.io/${GCP_PROJECT_ID}/convergence-data-pipeline:latest

# Scan image for vulnerabilities
gcloud container images scan gcr.io/${GCP_PROJECT_ID}/convergence-data-pipeline:${APP_VERSION}
```

### 4. Push to Container Registry
```bash
# Authenticate Docker
gcloud auth configure-docker

# Push images
docker push gcr.io/${GCP_PROJECT_ID}/convergence-data-pipeline:${APP_VERSION}
docker push gcr.io/${GCP_PROJECT_ID}/convergence-data-pipeline:latest
```

### 5. Database Migration (if applicable)
```bash
# Review pending migrations
alembic history
alembic current

# Apply migrations to staging first
alembic upgrade head --sql > migration.sql
# Review SQL carefully

# Apply to staging
alembic upgrade head

# Verify staging works correctly
# Then apply to production
```

### 6. Configuration Updates
```bash
# Update production configs
cd config/production/

# Verify all configs are valid
yamllint config.yaml
yamllint logging.yaml
yamllint monitoring.yaml
yamllint security.yaml

# Apply configs to Secret Manager
gcloud secrets create convergence-config --data-file=config.yaml
gcloud secrets create convergence-logging --data-file=logging.yaml
```

## Deployment Process

### Option 1: Cloud Run Deployment

```bash
# Deploy to Cloud Run
gcloud run deploy convergence-data-pipeline \
  --image gcr.io/${GCP_PROJECT_ID}/convergence-data-pipeline:${APP_VERSION} \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 2 \
  --max-instances 10 \
  --cpu 2 \
  --memory 4Gi \
  --timeout 300 \
  --concurrency 100 \
  --set-env-vars "ENVIRONMENT=production,APP_VERSION=${APP_VERSION}" \
  --set-secrets "GCP_PROJECT_ID=convergence-gcp-project:latest" \
  --no-traffic  # Blue-Green: deploy without traffic first

# Verify new revision
gcloud run revisions list --service convergence-data-pipeline

# Gradually shift traffic to new revision
gcloud run services update-traffic convergence-data-pipeline \
  --to-revisions REVISION-001=10  # 10% canary

# Monitor metrics for 10 minutes
# If all looks good, shift 100%
gcloud run services update-traffic convergence-data-pipeline \
  --to-revisions REVISION-001=100
```

### Option 2: Kubernetes Deployment

```bash
# Update Kubernetes manifests
cd deployment/k8s/

# Apply ConfigMaps
kubectl apply -f configmap.yaml

# Apply Secrets
kubectl apply -f secrets.yaml

# Deploy new version (blue-green)
kubectl apply -f deployment-v${APP_VERSION}.yaml

# Wait for pods to be ready
kubectl rollout status deployment/convergence-data-pipeline

# Verify new pods are healthy
kubectl get pods -l app=convergence-data-pipeline

# Switch traffic to new version
kubectl patch service convergence-data-pipeline \
  -p '{"spec":{"selector":{"version":"'${APP_VERSION}'"}}}'

# Monitor for issues
kubectl logs -f deployment/convergence-data-pipeline
```

### Option 3: Manual VM Deployment

```bash
# SSH to production instance
gcloud compute ssh convergence-prod-1 --zone us-central1-a

# Pull latest code
cd /opt/convergence-data-pipeline
git fetch origin
git checkout v${APP_VERSION}

# Install dependencies
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Restart service with zero downtime
sudo systemctl reload convergence-api  # Graceful reload
# OR
sudo systemctl restart convergence-api  # Full restart

# Verify service is running
sudo systemctl status convergence-api
curl http://localhost:8080/health
```

## Post-Deployment Verification

### 1. Health Checks
```bash
# Liveness check
curl https://api.cloudact.io/health/live

# Readiness check
curl https://api.cloudact.io/health/ready

# Expected response:
# {
#   "status": "ready",
#   "service": "convergence-data-pipeline",
#   "version": "1.0.0",
#   "checks": {
#     "shutdown": true,
#     "bigquery": true
#   }
# }
```

### 2. Smoke Tests
```bash
# Test authentication
curl -H "x-api-key: test-key" https://api.cloudact.io/api/v1/pipelines

# Test pipeline execution
curl -X POST -H "x-api-key: test-key" \
  https://api.cloudact.io/api/v1/pipelines/run/test-pipeline

# Verify response times (should be < 500ms)
# Verify no errors in logs
```

### 3. Metrics Verification
```bash
# Check Prometheus metrics
curl https://api.cloudact.io/metrics

# Verify key metrics are being exported:
# - http_requests_total
# - http_request_duration_seconds
# - pipeline_executions_total
# - system_cpu_usage_percent
```

### 4. Log Verification
```bash
# Check application logs
gcloud logging read "resource.type=cloud_run_revision" --limit 50

# Verify structured JSON logging
# Verify no ERROR or CRITICAL logs
# Verify request/response logging is working
```

### 5. Alert Verification
```bash
# Verify AlertManager is receiving metrics
curl http://alertmanager:9093/api/v1/alerts

# Check that no critical alerts are firing
# Verify Slack/PagerDuty integrations are working
```

### 6. Database Verification
```bash
# Run smoke test queries
python scripts/verify_database.py

# Verify metadata tables exist
# Verify API keys are accessible
# Verify pipeline configurations are loaded
```

### 7. End-to-End Test
```bash
# Run full E2E test suite
pytest tests/e2e/test_production_smoke.py -v

# Expected: All tests pass
# Expected: No errors in logs
# Expected: Metrics show successful executions
```

## Rollback Procedure

### Immediate Rollback (Cloud Run)
```bash
# List revisions
gcloud run revisions list --service convergence-data-pipeline

# Rollback to previous revision
gcloud run services update-traffic convergence-data-pipeline \
  --to-revisions PREVIOUS-REVISION=100

# Verify rollback successful
curl https://api.cloudact.io/health
```

### Immediate Rollback (Kubernetes)
```bash
# Rollback deployment
kubectl rollout undo deployment/convergence-data-pipeline

# Verify rollback status
kubectl rollout status deployment/convergence-data-pipeline

# Check pods are healthy
kubectl get pods -l app=convergence-data-pipeline
```

### Database Rollback
```bash
# Rollback database migration (use with extreme caution!)
alembic downgrade -1

# Verify application still works
curl https://api.cloudact.io/health/ready
```

### Communication During Rollback
1. Post in #incidents Slack channel
2. Update status page
3. Notify on-call team via PagerDuty
4. Document rollback reason in incident report

## Environment-Specific Instructions

### Staging Environment
```bash
# Deploy to staging first
export ENVIRONMENT=staging
export GCP_PROJECT_ID=gac-staging-12345

# Follow same deployment process
# Run extended smoke tests
# Leave running for 24 hours before production deploy
```

### Production Environment
```bash
# Production deployment windows
# Preferred: Tuesday-Thursday, 10am-2pm PST
# Avoid: Fridays, weekends, holidays

# Enable maintenance mode (optional)
curl -X POST -H "x-admin-key: ${ADMIN_KEY}" \
  https://api.cloudact.io/admin/maintenance/enable

# Deploy following all steps above

# Disable maintenance mode
curl -X POST -H "x-admin-key: ${ADMIN_KEY}" \
  https://api.cloudact.io/admin/maintenance/disable
```

### Canary Deployment
```bash
# Deploy to 10% of traffic
gcloud run services update-traffic convergence-data-pipeline \
  --to-revisions NEW-REVISION=10,OLD-REVISION=90

# Monitor for 30 minutes
# Check error rates, latency, success rates

# If metrics look good, increase to 50%
gcloud run services update-traffic convergence-data-pipeline \
  --to-revisions NEW-REVISION=50,OLD-REVISION=50

# Monitor for 30 minutes

# If still good, go to 100%
gcloud run services update-traffic convergence-data-pipeline \
  --to-revisions NEW-REVISION=100
```

## Deployment Checklist

Use the [PRE_DEPLOYMENT_CHECKLIST.md](../checklists/PRE_DEPLOYMENT_CHECKLIST.md) and [POST_DEPLOYMENT_CHECKLIST.md](../checklists/POST_DEPLOYMENT_CHECKLIST.md) for comprehensive verification.

## Troubleshooting

### Issue: Deployment fails with "ImagePullBackOff"
**Solution:** Verify container registry permissions and image tag
```bash
gcloud artifacts repositories list
gcloud artifacts docker images list gcr.io/${GCP_PROJECT_ID}/convergence-data-pipeline
```

### Issue: Health checks failing
**Solution:** Check application logs for startup errors
```bash
kubectl logs -f deployment/convergence-data-pipeline
```

### Issue: High error rate after deployment
**Solution:** Immediately rollback and investigate
```bash
# Rollback
kubectl rollout undo deployment/convergence-data-pipeline

# Check logs
kubectl logs -f deployment/convergence-data-pipeline --previous
```

## Additional Resources

- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues and solutions
- [MONITORING.md](MONITORING.md) - Monitoring and observability
- [RUNBOOK.md](RUNBOOK.md) - Incident response procedures
- [Production Checklist](../checklists/PRE_DEPLOYMENT_CHECKLIST.md)

## Support

- Slack: #convergence-support
- PagerDuty: Convergence On-Call
- Email: ops-team@cloudact.io
