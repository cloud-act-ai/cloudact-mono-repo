# Convergence Data Pipeline - Troubleshooting Guide

## Table of Contents
- [General Troubleshooting Approach](#general-troubleshooting-approach)
- [Common Issues](#common-issues)
- [Service Issues](#service-issues)
- [Pipeline Issues](#pipeline-issues)
- [BigQuery Issues](#bigquery-issues)
- [Authentication Issues](#authentication-issues)
- [Performance Issues](#performance-issues)
- [Network Issues](#network-issues)
- [Diagnostic Commands](#diagnostic-commands)

## General Troubleshooting Approach

### 1. Gather Information
```bash
# Check service status
curl https://api.cloudact.io/health/ready

# Check recent logs
gcloud logging read "resource.type=cloud_run_revision" \
  --limit 100 \
  --format json | jq -r '.[] | select(.severity=="ERROR")'

# Check metrics
curl https://api.cloudact.io/metrics | grep error

# Check active alerts
curl http://alertmanager:9093/api/v1/alerts
```

### 2. Isolate the Problem
- Is it affecting all tenants or just one?
- Is it affecting all pipelines or a specific one?
- When did it start? (correlate with deployments)
- Is it consistent or intermittent?

### 3. Check Recent Changes
```bash
# Recent deployments
gcloud run revisions list --service convergence-data-pipeline

# Recent config changes
gcloud secrets versions list convergence-config

# Recent code commits
git log --since="24 hours ago" --oneline
```

## Common Issues

### Issue: Service Not Responding (503 Service Unavailable)

**Symptoms:**
- Health checks failing
- 503 errors on all endpoints
- No response from service

**Diagnosis:**
```bash
# Check if service is running
gcloud run services describe convergence-data-pipeline

# Check pod status (Kubernetes)
kubectl get pods -l app=convergence-data-pipeline

# Check logs
kubectl logs -f deployment/convergence-data-pipeline --tail=100
```

**Solutions:**

1. **Service is down:**
```bash
# Restart service (Cloud Run)
gcloud run services update convergence-data-pipeline --region us-central1

# Restart deployment (Kubernetes)
kubectl rollout restart deployment/convergence-data-pipeline
```

2. **Out of memory:**
```bash
# Check memory usage
kubectl top pods -l app=convergence-data-pipeline

# Increase memory limit
kubectl set resources deployment convergence-data-pipeline \
  --limits=memory=8Gi
```

3. **CPU throttling:**
```bash
# Increase CPU allocation
gcloud run services update convergence-data-pipeline \
  --cpu=4 --memory=8Gi
```

### Issue: High Error Rate (5xx errors)

**Symptoms:**
- Error rate > 5%
- AlertManager firing HighErrorRate alert
- Users reporting errors

**Diagnosis:**
```bash
# Check error distribution
gcloud logging read "resource.type=cloud_run_revision AND severity=ERROR" \
  --limit 50 --format json | jq -r '.[].jsonPayload.message'

# Check specific error types
grep "ERROR" /var/log/convergence/error.log | cut -d' ' -f5 | sort | uniq -c
```

**Solutions:**

1. **Database connection errors:**
```bash
# Verify BigQuery connectivity
bq ls ${GCP_PROJECT_ID}:

# Check service account permissions
gcloud projects get-iam-policy ${GCP_PROJECT_ID} \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount"
```

2. **Rate limit errors:**
```bash
# Check rate limit metrics
curl https://api.cloudact.io/metrics | grep rate_limit

# Temporarily increase limits
# Edit config/production/config.yaml
# Redeploy service
```

3. **Application errors:**
```bash
# Check for unhandled exceptions
grep "Traceback" /var/log/convergence/error.log

# Review recent code changes
git diff HEAD~1 HEAD

# Consider rollback
gcloud run services update-traffic convergence-data-pipeline \
  --to-revisions PREVIOUS-REVISION=100
```

### Issue: Slow Response Times (High Latency)

**Symptoms:**
- P95 latency > 1 second
- Timeout errors
- Users reporting slow performance

**Diagnosis:**
```bash
# Check latency metrics
curl https://api.cloudact.io/metrics | grep http_request_duration_seconds

# Check slow queries
gcloud logging read "resource.type=cloud_run_revision" \
  --format json | jq -r '.[] | select(.jsonPayload.duration_ms > 1000)'

# Profile application
py-spy top --pid $(pgrep -f uvicorn)
```

**Solutions:**

1. **Database query optimization:**
```bash
# Enable query profiling
# Check BigQuery query plan
bq show -j <job_id>

# Add indexes if needed
# Optimize SQL queries
```

2. **Increase resources:**
```bash
# Scale up instances
gcloud run services update convergence-data-pipeline \
  --min-instances=5 --max-instances=20

# Increase CPU/memory
kubectl set resources deployment convergence-data-pipeline \
  --limits=cpu=4,memory=8Gi
```

3. **Enable caching:**
```bash
# Configure Redis cache (if available)
export REDIS_URL="redis://cache.cloudact.io:6379"

# Restart service
kubectl rollout restart deployment/convergence-data-pipeline
```

## Service Issues

### Issue: Service Won't Start

**Symptoms:**
- Pods in CrashLoopBackOff
- Container exits immediately
- Health checks never pass

**Diagnosis:**
```bash
# Check startup logs
kubectl logs <pod-name> --previous

# Check for missing environment variables
kubectl describe pod <pod-name>

# Check config issues
kubectl get configmap convergence-config -o yaml
```

**Solutions:**

1. **Missing environment variables:**
```bash
# Add missing env vars
kubectl set env deployment/convergence-data-pipeline \
  GCP_PROJECT_ID=${GCP_PROJECT_ID}
```

2. **Invalid configuration:**
```bash
# Validate config files
yamllint config/production/config.yaml

# Fix config and redeploy
kubectl apply -f configmap.yaml
kubectl rollout restart deployment/convergence-data-pipeline
```

3. **Port conflicts:**
```bash
# Check port bindings
netstat -tulpn | grep 8080

# Change port if needed
export API_PORT=8081
```

### Issue: Graceful Shutdown Not Working

**Symptoms:**
- Requests fail during deployment
- Pipeline executions interrupted
- Data loss during shutdown

**Diagnosis:**
```bash
# Check shutdown logs
kubectl logs <pod-name> | grep "shutdown"

# Check signal handling
ps aux | grep uvicorn
```

**Solutions:**

1. **Increase termination grace period:**
```bash
# Kubernetes
kubectl patch deployment convergence-data-pipeline \
  -p '{"spec":{"template":{"spec":{"terminationGracePeriodSeconds":60}}}}'
```

2. **Fix shutdown handler:**
```python
# Verify shutdown handler in src/app/main.py
# Ensure graceful_shutdown() completes all tasks
```

## Pipeline Issues

### Issue: Pipeline Execution Failures

**Symptoms:**
- Pipeline status = "failed"
- Error in pipeline logs
- Data not appearing in destination

**Diagnosis:**
```bash
# Get pipeline execution details
curl -H "x-api-key: ${API_KEY}" \
  https://api.cloudact.io/api/v1/pipelines/<pipeline_id>/executions

# Check pipeline logs
bq query --use_legacy_sql=false \
  "SELECT * FROM \`${TENANT_ID}.x_meta_pipeline_logs\`
   WHERE pipeline_run_id = '<run_id>'
   ORDER BY created_at DESC
   LIMIT 100"

# Check step-by-step execution
grep "pipeline_id=<id>" /var/log/convergence/app.log
```

**Solutions:**

1. **SQL syntax errors:**
```bash
# Validate SQL
bq query --dry_run --use_legacy_sql=false < query.sql

# Fix SQL in pipeline config
# Redeploy pipeline
```

2. **Permission errors:**
```bash
# Grant BigQuery permissions
gcloud projects add-iam-policy-binding ${GCP_PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/bigquery.dataEditor"
```

3. **Data quality failures:**
```bash
# Check DQ results
bq query --use_legacy_sql=false \
  "SELECT * FROM \`${TENANT_ID}.x_meta_data_quality_results\`
   WHERE pipeline_run_id = '<run_id>'"

# Adjust DQ thresholds or fix data
```

### Issue: Pipeline Stuck/Hanging

**Symptoms:**
- Pipeline status = "running" for hours
- No progress in logs
- Locks not released

**Diagnosis:**
```bash
# Check running pipelines
curl -H "x-api-key: ${API_KEY}" \
  https://api.cloudact.io/api/v1/pipelines/executions?status=running

# Check locks
gcloud firestore collections get pipeline_locks

# Check BigQuery job status
bq ls -j --max_results=10
```

**Solutions:**

1. **Kill stuck pipeline:**
```bash
# Cancel BigQuery job
bq cancel <job_id>

# Clear lock
python clear_stuck_pipeline.py --pipeline-id=<id> --run-id=<run-id>
```

2. **Increase timeout:**
```bash
# Edit pipeline config
# increase max_pipeline_duration_minutes
# Redeploy pipeline
```

## BigQuery Issues

### Issue: BigQuery Query Errors

**Symptoms:**
- "Quota exceeded" errors
- "Access denied" errors
- "Table not found" errors

**Diagnosis:**
```bash
# Check quota usage
bq query --use_legacy_sql=false \
  "SELECT * FROM \`region-us\`.INFORMATION_SCHEMA.JOBS
   WHERE creation_time > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
   ORDER BY creation_time DESC
   LIMIT 10"

# Check permissions
bq show ${DATASET_NAME}
```

**Solutions:**

1. **Quota exceeded:**
```bash
# Request quota increase
gcloud alpha billing quotas update \
  --service=bigquery.googleapis.com \
  --consumer=projects/${GCP_PROJECT_ID}

# Implement query optimization
# Add query result caching
```

2. **Permission denied:**
```bash
# Grant required permissions
bq update --project_id=${GCP_PROJECT_ID} \
  ${DATASET_NAME} \
  --grant_role=roles/bigquery.dataEditor \
  --member=serviceAccount:${SERVICE_ACCOUNT}
```

3. **Table not found:**
```bash
# Verify table exists
bq ls ${DATASET_NAME}

# Create missing table
bq mk --table ${DATASET_NAME}.${TABLE_NAME} schema.json
```

### Issue: Slow BigQuery Queries

**Symptoms:**
- Query duration > 30 seconds
- Timeout errors
- High slot usage

**Diagnosis:**
```bash
# Get query plan
bq show -j <job_id>

# Check slot utilization
bq query --use_legacy_sql=false \
  "SELECT * FROM \`region-us\`.INFORMATION_SCHEMA.JOBS
   WHERE job_id = '<job_id>'"
```

**Solutions:**

1. **Add partitioning:**
```sql
-- Partition by date
CREATE TABLE dataset.table_partitioned
PARTITION BY DATE(created_at)
AS SELECT * FROM dataset.table;
```

2. **Add clustering:**
```sql
-- Cluster by tenant_id
CREATE TABLE dataset.table_clustered
PARTITION BY DATE(created_at)
CLUSTER BY tenant_id
AS SELECT * FROM dataset.table;
```

3. **Optimize query:**
```sql
-- Use SELECT specific columns instead of SELECT *
-- Add WHERE clauses to filter early
-- Use approximate aggregation functions
```

## Authentication Issues

### Issue: API Key Authentication Failing

**Symptoms:**
- 401 Unauthorized errors
- "Invalid API key" messages
- Users can't authenticate

**Diagnosis:**
```bash
# Check API key in database
bq query --use_legacy_sql=false \
  "SELECT * FROM \`${TENANT_ID}.x_meta_api_keys\`
   WHERE tenant_id = '${TENANT_ID}'
   AND is_active = true"

# Check auth logs
grep "authentication failed" /var/log/convergence/audit.log
```

**Solutions:**

1. **API key not found:**
```bash
# Create new API key
curl -X POST -H "x-admin-key: ${ADMIN_KEY}" \
  https://api.cloudact.io/admin/tenants/${TENANT_ID}/api-keys

# Provide new key to user
```

2. **API key expired:**
```bash
# Extend expiration
bq query --use_legacy_sql=false \
  "UPDATE \`${TENANT_ID}.x_meta_api_keys\`
   SET expires_at = TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)
   WHERE key_id = '${KEY_ID}'"
```

3. **Tenant not found:**
```bash
# Verify tenant exists
curl -H "x-admin-key: ${ADMIN_KEY}" \
  https://api.cloudact.io/admin/tenants

# Onboard tenant if needed
python scripts/onboard_tenant.py --tenant-id=${TENANT_ID}
```

## Performance Issues

### Issue: High CPU Usage

**Symptoms:**
- CPU usage > 80%
- Service throttling
- Slow response times

**Diagnosis:**
```bash
# Check CPU metrics
kubectl top pods -l app=convergence-data-pipeline

# Profile CPU usage
py-spy record --pid $(pgrep -f uvicorn) --output profile.svg
```

**Solutions:**

1. **Scale horizontally:**
```bash
# Increase replicas
kubectl scale deployment convergence-data-pipeline --replicas=10
```

2. **Optimize code:**
```python
# Profile hot paths
# Optimize expensive operations
# Add caching where appropriate
```

### Issue: Memory Leak

**Symptoms:**
- Memory usage growing over time
- OOMKilled pods
- Service crashes after running for hours

**Diagnosis:**
```bash
# Monitor memory over time
watch kubectl top pods -l app=convergence-data-pipeline

# Check for memory leaks
py-spy heap --pid $(pgrep -f uvicorn)
```

**Solutions:**

1. **Identify leak source:**
```python
# Use memory_profiler
from memory_profiler import profile

@profile
def expensive_function():
    pass
```

2. **Restart periodically (temporary):**
```bash
# Add lifecycle rule to restart pods every 24h
kubectl patch deployment convergence-data-pipeline \
  -p '{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/restartedAt":"'$(date +%FT%T%z)'"}}}}}'
```

## Diagnostic Commands

### Check Service Health
```bash
# Cloud Run
gcloud run services describe convergence-data-pipeline \
  --region us-central1 \
  --format="value(status.conditions)"

# Kubernetes
kubectl get deployment convergence-data-pipeline -o wide
kubectl describe deployment convergence-data-pipeline
```

### Check Logs
```bash
# Application logs (last 100 lines)
gcloud logging read "resource.type=cloud_run_revision" --limit 100

# Error logs only
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit 50

# Specific time range
gcloud logging read "resource.type=cloud_run_revision" \
  --after="2024-01-01T00:00:00Z" \
  --before="2024-01-01T23:59:59Z"
```

### Check Metrics
```bash
# Prometheus metrics
curl https://api.cloudact.io/metrics

# Filter specific metric
curl https://api.cloudact.io/metrics | grep http_requests_total

# Check alerts
curl http://alertmanager:9093/api/v1/alerts | jq '.data[] | select(.status.state=="firing")'
```

### Check Database
```bash
# List datasets
bq ls --project_id=${GCP_PROJECT_ID}

# Query metadata
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) FROM \`${TENANT_ID}.x_meta_pipeline_runs\`
   WHERE created_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)"
```

## Escalation

If issue cannot be resolved:

1. **Document findings:** Collect all diagnostic output
2. **Notify team:** Post in #incidents Slack channel
3. **Page on-call:** Use PagerDuty for critical issues
4. **Create incident:** Open incident ticket with all details
5. **Consider rollback:** If impacting users, rollback to last known good version

## Additional Resources

- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment procedures
- [MONITORING.md](MONITORING.md) - Monitoring setup
- [RUNBOOK.md](RUNBOOK.md) - Incident response
- [GCP Documentation](https://cloud.google.com/docs)
