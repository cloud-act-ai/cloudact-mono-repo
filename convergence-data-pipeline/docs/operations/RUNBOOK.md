# Convergence Data Pipeline - Incident Response Runbook

## Table of Contents
- [General Response Procedures](#general-response-procedures)
- [Service Down](#service-down)
- [High Error Rate](#high-error-rate)
- [High Latency](#high-latency)
- [Pipeline Failures](#pipeline-failures)
- [BigQuery Errors](#bigquery-errors)
- [Authentication Failures](#auth-failures)
- [Brute Force Attack](#brute-force)
- [High CPU/Memory Usage](#high-cpu-usage)
- [Metadata Queue Full](#metadata-queue-full)
- [Rate Limit Exceeded](#rate-limit-exceeded)
- [Communication Templates](#communication-templates)

## General Response Procedures

### Incident Response Workflow

```
1. ACKNOWLEDGE → 2. ASSESS → 3. MITIGATE → 4. RESOLVE → 5. DOCUMENT
```

### Step 1: Acknowledge (< 5 minutes)
- Acknowledge PagerDuty alert
- Post in #incidents Slack channel
- Assign incident commander (if P1/P2)

### Step 2: Assess (< 10 minutes)
- Determine severity (P1-P4)
- Check dashboards and metrics
- Review recent changes/deployments
- Identify blast radius (all tenants vs one tenant)

### Step 3: Mitigate (< 30 minutes)
- Stop the bleeding (rollback, scale up, etc.)
- Implement temporary workaround
- Update stakeholders every 15 minutes

### Step 4: Resolve
- Implement permanent fix
- Verify resolution
- Monitor for regression

### Step 5: Document
- Write postmortem (P1/P2 required)
- Update runbook with learnings
- Schedule follow-up items

### Severity Levels

| Level | Response Time | Impact | Example |
|-------|--------------|--------|---------|
| **P1** | Immediate | Service down, data loss | All users unable to access service |
| **P2** | 15 minutes | Significant degradation | 50% error rate, major feature broken |
| **P3** | 1 hour | Minor degradation | Slow performance, single tenant affected |
| **P4** | Next business day | No user impact | Warning alerts, potential future issues |

---

## Service Down

### Alert: ServiceDown

**Symptoms:**
- Service completely unavailable
- Health checks failing
- 503 errors on all endpoints

**Impact:** P1 - Complete service outage

### Immediate Actions (< 5 minutes)

```bash
# 1. Check service status
gcloud run services describe convergence-data-pipeline --region us-central1

# 2. Check recent deployments
gcloud run revisions list --service convergence-data-pipeline --limit 5

# 3. Check logs for crashes
gcloud logging read "resource.type=cloud_run_revision AND severity=ERROR" --limit 20
```

### Mitigation (< 15 minutes)

**Option A: Rollback to previous version**
```bash
# Get previous revision
PREVIOUS_REVISION=$(gcloud run revisions list --service convergence-data-pipeline --format="value(name)" --limit 2 | tail -1)

# Rollback
gcloud run services update-traffic convergence-data-pipeline \
  --to-revisions ${PREVIOUS_REVISION}=100

# Verify
curl https://api.cloudact.io/health/ready
```

**Option B: Restart service**
```bash
# Cloud Run
gcloud run services update convergence-data-pipeline --region us-central1

# Kubernetes
kubectl rollout restart deployment/convergence-data-pipeline
kubectl rollout status deployment/convergence-data-pipeline
```

### Resolution

1. Identify root cause from logs
2. Fix underlying issue
3. Deploy fix to staging, verify
4. Deploy to production
5. Monitor for 1 hour

### Communication

```
[INCIDENT] Service Down - P1
Status: INVESTIGATING
Impact: All users unable to access API
ETA: Rollback in progress, service should be restored in 5 minutes
Next Update: 10 minutes
```

---

## High Error Rate

### Alert: HighErrorRate

**Symptoms:**
- 5xx error rate > 5%
- Some requests succeeding, some failing
- Specific endpoints or tenants affected

**Impact:** P2 - Users experiencing intermittent errors

### Immediate Actions

```bash
# 1. Check error distribution
gcloud logging read "severity=ERROR" --limit 50 --format json | \
  jq -r '.[].jsonPayload.message' | sort | uniq -c | sort -rn

# 2. Check which endpoints are failing
curl https://api.cloudact.io/metrics | grep 'http_requests_total{.*status_code="5'

# 3. Identify pattern (tenant, endpoint, time)
```

### Mitigation

**If database-related:**
```bash
# Check BigQuery connectivity
bq ls ${GCP_PROJECT_ID}:

# Verify service account permissions
gcloud projects get-iam-policy ${GCP_PROJECT_ID} \
  --flatten="bindings[].members" \
  --filter="bindings.role:bigquery"
```

**If deployment-related:**
```bash
# Rollback to previous version
gcloud run services update-traffic convergence-data-pipeline \
  --to-revisions PREVIOUS-REVISION=100
```

**If resource-related:**
```bash
# Scale up temporarily
gcloud run services update convergence-data-pipeline \
  --min-instances=10 --max-instances=20
```

### Resolution

1. Fix root cause
2. Deploy fix
3. Verify error rate < 0.1%
4. Monitor for 30 minutes

---

## High Latency

### Alert: HighLatencyP95

**Symptoms:**
- P95 latency > 1 second
- Users reporting slow performance
- Timeouts occurring

**Impact:** P3 - Degraded user experience

### Immediate Actions

```bash
# 1. Check latency metrics
curl https://api.cloudact.io/metrics | grep http_request_duration_seconds

# 2. Identify slow endpoints
gcloud logging read "jsonPayload.duration_ms>1000" --limit 50

# 3. Check for slow BigQuery queries
bq ls -j --max_results=10
```

### Mitigation

**Quick fixes:**
```bash
# 1. Scale up to handle load
gcloud run services update convergence-data-pipeline \
  --min-instances=5 --cpu=4 --memory=8Gi

# 2. Increase timeout (if needed)
gcloud run services update convergence-data-pipeline --timeout=300

# 3. Enable caching (if applicable)
```

### Resolution

1. Optimize slow queries
2. Add database indexes
3. Implement caching layer
4. Profile and optimize code

---

## Pipeline Failures

### Alert: PipelineFailureRate

**Symptoms:**
- Pipeline failure rate > 10%
- Specific pipelines failing repeatedly
- Data not appearing in destination tables

**Impact:** P2-P3 (depends on affected pipelines)

### Immediate Actions

```bash
# 1. Identify failing pipelines
curl -H "x-api-key: ${API_KEY}" \
  https://api.cloudact.io/api/v1/pipelines/executions?status=failed

# 2. Check pipeline logs
bq query --use_legacy_sql=false \
  "SELECT * FROM \`${TENANT_ID}.x_meta_pipeline_logs\`
   WHERE status = 'failed'
   ORDER BY created_at DESC
   LIMIT 50"

# 3. Check for common error patterns
grep "pipeline.*failed" /var/log/convergence/app.log | cut -d' ' -f8- | sort | uniq -c
```

### Mitigation

**For SQL errors:**
```bash
# Validate SQL syntax
bq query --dry_run --use_legacy_sql=false < pipeline.sql

# Fix and redeploy
```

**For permission errors:**
```bash
# Grant required permissions
gcloud projects add-iam-policy-binding ${GCP_PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/bigquery.dataEditor"
```

**For stuck pipelines:**
```bash
# Clear locks
python clear_stuck_pipeline.py --pipeline-id=<id>

# Retry failed executions
curl -X POST -H "x-api-key: ${API_KEY}" \
  https://api.cloudact.io/api/v1/pipelines/<pipeline_id>/retry
```

### Resolution

1. Fix pipeline configuration
2. Retry failed executions
3. Verify success rate > 95%
4. Monitor for 1 hour

---

## BigQuery Errors

### Alert: BigQueryErrors

**Symptoms:**
- BigQuery queries failing
- "Quota exceeded" errors
- "Access denied" errors

**Impact:** P2 - Data processing blocked

### Immediate Actions

```bash
# 1. Check error types
gcloud logging read "bigquery AND severity=ERROR" --limit 20

# 2. Check quota usage
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as query_count,
          SUM(total_bytes_processed) / POW(10, 9) as gb_processed
   FROM \`region-us\`.INFORMATION_SCHEMA.JOBS_BY_PROJECT
   WHERE creation_time > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)"

# 3. Check permissions
bq show ${DATASET_NAME}
```

### Mitigation

**Quota exceeded:**
```bash
# Request emergency quota increase
gcloud alpha billing quotas update \
  --service=bigquery.googleapis.com \
  --consumer=projects/${GCP_PROJECT_ID}

# Throttle queries temporarily
# Reduce PIPELINE_MAX_PARALLEL_STEPS in config
```

**Permission denied:**
```bash
# Grant immediate access
bq update --project_id=${GCP_PROJECT_ID} ${DATASET_NAME} \
  --add_access_role=roles/bigquery.dataEditor \
  --add_access_member=serviceAccount:${SERVICE_ACCOUNT}
```

### Resolution

1. Optimize queries to reduce quota usage
2. Implement query result caching
3. Add partitioning/clustering
4. Request permanent quota increase

---

## Authentication Failures

### Alert: HighAuthFailureRate / PotentialBruteForce

**Symptoms:**
- High rate of authentication failures
- Possible brute force attack
- Users unable to authenticate

**Impact:** P2 - Security incident / service degradation

### Immediate Actions

```bash
# 1. Identify source of failures
gcloud logging read "authentication failed" --limit 50 --format json | \
  jq -r '.[].jsonPayload.source_ip' | sort | uniq -c | sort -rn

# 2. Check for patterns
gcloud logging read "authentication failed" --limit 50 --format json | \
  jq -r '.[].jsonPayload | [.tenant_id, .source_ip] | @tsv' | \
  sort | uniq -c | sort -rn

# 3. Verify API keys are valid
bq query --use_legacy_sql=false \
  "SELECT tenant_id, COUNT(*) as key_count
   FROM \`metadata.x_meta_api_keys\`
   WHERE is_active = true
   GROUP BY tenant_id"
```

### Mitigation

**If brute force attack:**
```bash
# Block malicious IPs (Cloud Armor)
gcloud compute security-policies rules create 1000 \
  --security-policy=convergence-security-policy \
  --src-ip-ranges="<MALICIOUS_IP>" \
  --action=deny-403

# Temporarily increase rate limits for auth endpoint
# Update config/production/security.yaml
```

**If API keys invalid:**
```bash
# Generate new API key for affected tenant
curl -X POST -H "x-admin-key: ${ADMIN_KEY}" \
  https://api.cloudact.io/admin/tenants/${TENANT_ID}/api-keys

# Notify tenant of new key
```

### Resolution

1. Identify and block malicious actors
2. Review and strengthen auth mechanisms
3. Notify security team
4. Document incident for review

---

## High CPU Usage

### Alert: HighCPUUsage / CriticalCPUUsage

**Symptoms:**
- CPU usage > 80% sustained
- Service throttling
- Slow response times

**Impact:** P3 - Performance degradation

### Immediate Actions

```bash
# 1. Check CPU metrics
kubectl top pods -l app=convergence-data-pipeline

# 2. Profile CPU usage
py-spy top --pid $(pgrep -f uvicorn)

# 3. Check for runaway processes
ps aux --sort=-%cpu | head -10
```

### Mitigation

**Scale horizontally:**
```bash
# Increase replicas
kubectl scale deployment convergence-data-pipeline --replicas=10

# Or for Cloud Run
gcloud run services update convergence-data-pipeline \
  --min-instances=10 --max-instances=20
```

**Scale vertically:**
```bash
# Increase CPU allocation
gcloud run services update convergence-data-pipeline \
  --cpu=4 --memory=8Gi
```

### Resolution

1. Profile application to find hot spots
2. Optimize expensive code paths
3. Implement caching for expensive operations
4. Consider async processing for heavy workloads

---

## Metadata Queue Full

### Alert: MetadataLogQueueFull

**Symptoms:**
- Metadata log queue > 90% capacity
- Logs being dropped
- Backpressure on pipeline executions

**Impact:** P2 - Data loss risk

### Immediate Actions

```bash
# 1. Check queue size
curl https://api.cloudact.io/metrics | grep metadata_log_queue_size

# 2. Check flush rate
curl https://api.cloudact.io/metrics | grep metadata_log_flush

# 3. Check for BigQuery write errors
gcloud logging read "metadata AND bigquery AND ERROR" --limit 20
```

### Mitigation

```bash
# 1. Increase flush workers
# Edit config/production/config.yaml
# metadata_log_workers: 10  # increase from 5

# 2. Increase queue size temporarily
# metadata_log_queue_size: 2000  # increase from 1000

# 3. Redeploy service
gcloud run services update convergence-data-pipeline
```

### Resolution

1. Optimize BigQuery writes (batching)
2. Monitor queue size trending
3. Add alerting for queue > 80%

---

## Rate Limit Exceeded

### Alert: RateLimitExceeded

**Symptoms:**
- 429 Too Many Requests errors
- Users being rate-limited
- High rate limit hit rate

**Impact:** P3 - Users experiencing throttling

### Immediate Actions

```bash
# 1. Check which tenants are hitting limits
curl https://api.cloudact.io/metrics | grep rate_limit_hits_total

# 2. Check rate limit configuration
cat config/production/config.yaml | grep -A 10 rate_limiting

# 3. Identify if legitimate traffic or abuse
gcloud logging read "rate limit" --limit 50 --format json | \
  jq -r '.[].jsonPayload | [.tenant_id, .path] | @tsv' | \
  sort | uniq -c | sort -rn
```

### Mitigation

**If legitimate traffic spike:**
```bash
# Temporarily increase limits
# Edit config/production/config.yaml
# rate_limiting.tenant.requests_per_minute: 200

# Redeploy
gcloud run services update convergence-data-pipeline
```

**If abuse:**
```bash
# Identify and block abusive tenant
# Document in audit log
# Notify tenant of policy violation
```

### Resolution

1. Right-size rate limits based on usage patterns
2. Implement per-tenant custom limits
3. Add monitoring for sustained high usage

---

## Communication Templates

### P1 Incident - Initial
```
[INCIDENT] <Title> - P1
Status: INVESTIGATING
Impact: <Description of user impact>
Started: <Timestamp>
Current Actions: <What we're doing>
ETA: <Expected resolution time>
Next Update: <When we'll update again>
```

### P1 Incident - Update
```
[UPDATE] <Title> - P1
Status: MITIGATING
Impact: <Current impact>
Progress: <What we've done>
Next Steps: <What's next>
ETA: <Updated ETA>
Next Update: <When we'll update again>
```

### P1 Incident - Resolved
```
[RESOLVED] <Title> - P1
Status: RESOLVED
Impact: Service fully restored
Resolution: <What fixed it>
Duration: <Total incident time>
Root Cause: <Brief explanation>
Follow-up: Postmortem scheduled for <date>
```

### Escalation Request
```
Requesting escalation for <Incident ID>
Severity: <P1/P2>
Current Status: <What's happening>
Actions Taken: <What we've tried>
Need Help With: <Specific ask>
@oncall-manager
```

## Additional Resources

- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment procedures
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Detailed troubleshooting
- [MONITORING.md](MONITORING.md) - Monitoring setup and metrics
- [PagerDuty Runbook](https://cloudact.pagerduty.com/runbooks)
