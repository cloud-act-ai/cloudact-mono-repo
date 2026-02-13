---
name: monitoring
description: |
  Monitoring, observability, and logging for CloudAct. Cloud Run logs, Cloud Build monitoring, health checks, error tracking.
  Use when: viewing logs, monitoring deployments, checking service health, tailing live logs,
  debugging Cloud Build failures, or tracking service errors across environments.
---

# Monitoring & Observability

## Overview

CloudAct runs 4 Cloud Run services + Cloud Run Jobs. All monitoring is via GCP Cloud Logging and Cloud Build.

## Key Locations

| Resource | Location |
|----------|----------|
| Health endpoints | `GET /health` on each service |
| Status script | `04-inra-cicd-automation/CICD/quick/status.sh` |
| Log watcher | `04-inra-cicd-automation/CICD/monitor/watch-all.sh` |
| Single service logs | `04-inra-cicd-automation/CICD/monitor/watch-api-logs.sh` |
| Cloud Build configs | `cloudbuild-stage.yaml`, `cloudbuild-prod.yaml` |

## Health Checks

### Quick Status (All Services)
```bash
cd 04-inra-cicd-automation/CICD
./quick/status.sh              # All environments
./quick/status.sh prod         # Specific environment
./quick/status.sh stage        # Stage only
```

### Manual Health Check
```bash
# Production (custom domains)
curl -s https://api.cloudact.ai/health | python3 -m json.tool
curl -s https://pipeline.cloudact.ai/health | python3 -m json.tool
curl -s https://chat.cloudact.ai/health | python3 -m json.tool

# Any environment (Cloud Run URL)
API_URL=$(gcloud run services describe cloudact-api-service-${ENV} \
  --region=us-central1 --format="value(status.url)" --project=${PROJECT})
curl -s ${API_URL}/health
```

### Health Response Format
```json
{
  "status": "healthy",
  "service": "api-service",
  "version": "v4.4.0",
  "timestamp": "2026-02-12T10:00:00Z",
  "environment": "production"
}
```

## Cloud Run Logs

### Watch All Services
```bash
cd 04-inra-cicd-automation/CICD/monitor

# All services, last N logs
./watch-all.sh test 50
./watch-all.sh stage 100
./watch-all.sh prod 50

# Single service
./watch-api-logs.sh test api        # api-service logs
./watch-api-logs.sh stage pipeline  # pipeline-service logs
./watch-api-logs.sh prod frontend   # frontend logs
./watch-api-logs.sh prod chat       # chat-backend logs
```

### Live Streaming (Real-Time)
```bash
# Stream API service logs (stage)
gcloud alpha logging tail \
  "resource.type=cloud_run_revision AND resource.labels.service_name=cloudact-api-service-stage" \
  --project=cloudact-testing-1

# Stream pipeline service logs (prod)
gcloud alpha logging tail \
  "resource.type=cloud_run_revision AND resource.labels.service_name=cloudact-pipeline-service-prod" \
  --project=cloudact-prod

# Stream with severity filter (errors only)
gcloud alpha logging tail \
  "resource.type=cloud_run_revision AND severity>=ERROR" \
  --project=cloudact-prod
```

### Query Historical Logs
```bash
# Last hour of errors
gcloud logging read \
  "resource.type=cloud_run_revision AND severity>=ERROR \
  AND timestamp>=\"$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)\"" \
  --project=cloudact-prod --limit=50 \
  --format="table(timestamp,resource.labels.service_name,textPayload)"

# Specific service, last 24 hours
gcloud logging read \
  "resource.type=cloud_run_revision \
  AND resource.labels.service_name=cloudact-api-service-prod \
  AND timestamp>=\"$(date -u -v-1d +%Y-%m-%dT%H:%M:%SZ)\"" \
  --project=cloudact-prod --limit=100 \
  --format="table(timestamp,severity,textPayload)" --order=asc
```

## Cloud Run Job Logs

```bash
# Bootstrap job logs
gcloud logging read \
  "resource.type=cloud_run_job AND resource.labels.job_name=cloudact-manual-bootstrap \
  AND timestamp>=\"$(date -u +%Y-%m-%dT00:00:00Z)\"" \
  --project=cloudact-prod --limit=30 \
  --format="table(timestamp,textPayload)" --order=asc

# Org sync logs
gcloud logging read \
  "resource.type=cloud_run_job AND resource.labels.job_name=cloudact-manual-org-sync-all \
  AND timestamp>=\"$(date -u +%Y-%m-%dT00:00:00Z)\"" \
  --project=cloudact-prod --limit=30 \
  --format="table(timestamp,textPayload)" --order=asc

# List recent job executions
gcloud run jobs executions list --region=us-central1 --project=cloudact-prod --limit=10
```

## Cloud Build Monitoring

### Watch Build Progress
```bash
# List recent builds
gcloud builds list --project=cloudact-prod --region=global --limit=5

# Stream build logs (get build ID from list)
gcloud builds log <BUILD_ID> --project=cloudact-prod --stream

# Filter by trigger
gcloud builds list --project=cloudact-prod --region=global \
  --filter="substitutions.TRIGGER_NAME=version-tag" --limit=5
```

### Build Failure Investigation
```bash
# Get failed build details
gcloud builds describe <BUILD_ID> --project=cloudact-prod --region=global

# View build logs
gcloud builds log <BUILD_ID> --project=cloudact-prod
```

## Environment Configuration

| Environment | GCP Project | Credentials |
|------------|-------------|-------------|
| test/stage | `cloudact-testing-1` | `~/.gcp/cloudact-testing-1-e44da390bf82.json` |
| prod | `cloudact-prod` | `~/.gcp/cloudact-prod.json` |

**Switch credentials before monitoring:**
```bash
# Stage
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json

# Prod
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-prod.json
```

## Key Metrics to Watch

| Metric | Warning Threshold | Critical Threshold |
|--------|-------------------|-------------------|
| Error rate | > 1% | > 5% |
| Response time (p95) | > 2s | > 5s |
| Health check failures | 1 consecutive | 3 consecutive |
| Cloud Run instance count | > 80% max | At max |
| Job execution time | > 2x normal | > 5x normal |

## Troubleshooting Quick Reference

| Symptom | Check | Fix |
|---------|-------|-----|
| Health returns unhealthy | Logs for errors | Fix code, redeploy |
| 503 Service Unavailable | Instance count, cold start | Increase min instances |
| Slow responses | Request logs, CPU usage | Scale up CPU/memory |
| Build failed | Build logs | Fix code/Dockerfile |
| Job stuck PENDING | Quotas, IAM | Check Cloud Run limits |
| No logs appearing | Logging API enabled | Enable Cloud Logging API |

## Related Skills
- `/infra-cicd` - Deployment and infrastructure
- `/deploy-check` - Pre/post deployment validation
- `/scheduler-jobs` - Cloud Run Jobs management
- `/troubleshooting` - Cross-service debugging

---
**Last Updated:** 2026-02-12
