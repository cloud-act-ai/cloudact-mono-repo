# Post-Deployment Checklist

**Version:** 1.0.0
**Last Updated:** 2024-01-17
**Owner:** DevOps Team

## Purpose
This checklist ensures deployment was successful and the system is healthy. Complete within 1 hour of deployment.

**Deployment Info:**
- Version Deployed: \_\_\_\_\_\_\_\_\_\_\_\_
- Deployment Date/Time: \_\_\_\_\_\_\_\_\_\_\_\_
- Deployed By: \_\_\_\_\_\_\_\_\_\_\_\_
- Environment: [ ] Staging [ ] Production

---

## Immediate Verification (< 5 minutes)

### Service Health
- [ ] Service deployed successfully (no errors in deployment logs)
- [ ] All replicas/instances running
- [ ] No pods in CrashLoopBackOff (Kubernetes)
- [ ] No failed revision (Cloud Run)

### Health Checks
```bash
# Expected: 200 OK with status "healthy"
curl https://api.cloudact.io/health
```
- [ ] Basic health check passing (/health)
- [ ] Liveness probe passing (/health/live)
- [ ] Readiness probe passing (/health/ready)
- [ ] All dependency checks passing (BigQuery, Firestore)

**Result:** [ ] PASS / [ ] FAIL

**If FAIL, consider immediate rollback**

---

## Smoke Tests (< 10 minutes)

### API Endpoints
```bash
# Test with valid API key
curl -H "x-api-key: ${API_KEY}" https://api.cloudact.io/api/v1/pipelines
```

- [ ] Root endpoint accessible (/)
- [ ] Metrics endpoint accessible (/metrics)
- [ ] API authentication working (401 without key, 200 with key)
- [ ] Pipeline listing endpoint working
- [ ] Admin endpoints working (if admin key configured)

### Core Functionality
```bash
# Test pipeline execution
curl -X POST -H "x-api-key: ${API_KEY}" \
  https://api.cloudact.io/api/v1/pipelines/run/test-pipeline
```

- [ ] Pipeline execution starts successfully
- [ ] Pipeline completes successfully
- [ ] Results written to BigQuery
- [ ] Metadata logged correctly
- [ ] Notifications sent (if configured)

**Result:** [ ] PASS / [ ] FAIL

---

## Metrics Verification (< 15 minutes)

### Prometheus Metrics
```bash
curl https://api.cloudact.io/metrics | grep -E "http_requests|pipeline_executions"
```

- [ ] Metrics endpoint responding
- [ ] HTTP request metrics being exported
- [ ] Pipeline execution metrics being exported
- [ ] BigQuery metrics being exported
- [ ] System metrics (CPU, memory) being exported
- [ ] Custom application metrics working

### Grafana Dashboards
- [ ] System Overview dashboard loading
- [ ] Data populating in panels
- [ ] No missing metrics warnings
- [ ] Refresh rate set correctly (30s)

**Metrics Sample:**
```
http_requests_total: _____
pipeline_executions_total: _____
system_cpu_usage_percent: _____%
```

**Result:** [ ] PASS / [ ] FAIL

---

## Logging Verification (< 15 minutes)

### Application Logs
```bash
# Check recent logs
gcloud logging read "resource.type=cloud_run_revision" --limit 50
```

- [ ] Logs flowing to centralized logging
- [ ] Structured JSON logging working
- [ ] Log level correct (INFO in production)
- [ ] Request/response logging working
- [ ] No ERROR logs from startup
- [ ] No CRITICAL logs

### Log Quality
- [ ] Logs include request_id
- [ ] Logs include tenant_id
- [ ] Logs include trace_id (if tracing enabled)
- [ ] Timestamps in correct format
- [ ] Log retention configured (30 days)

### Error Logs
- [ ] Error.log file exists
- [ ] Audit.log file exists (if audit logging enabled)
- [ ] No unexpected errors in error.log

**Error Count in Last Hour:** _____

**Result:** [ ] PASS / [ ] FAIL

---

## Alerting Verification (< 10 minutes)

### AlertManager
```bash
curl http://alertmanager:9093/api/v1/alerts
```

- [ ] AlertManager receiving metrics
- [ ] Alert rules loaded successfully
- [ ] No critical alerts firing
- [ ] No high severity alerts firing

### Notification Channels
- [ ] PagerDuty integration tested (send test alert)
- [ ] Slack integration tested (alerts channel receiving)
- [ ] Email notifications tested

**Test Alert Command:**
```bash
curl -X POST http://alertmanager:9093/api/v1/alerts \
  -d '[{"labels":{"alertname":"TestAlert","severity":"warning"}}]'
```

- [ ] Test alert received in Slack
- [ ] Test alert received via email
- [ ] Test alert appears in PagerDuty (critical only)

**Result:** [ ] PASS / [ ] FAIL

---

## Performance Verification (< 15 minutes)

### Response Times
```bash
# Check P95 latency
curl https://api.cloudact.io/metrics | grep http_request_duration_seconds
```

- [ ] P50 latency < 100ms
- [ ] P95 latency < 500ms
- [ ] P99 latency < 1000ms
- [ ] No timeout errors

**Measured Latency:**
- P50: _____ ms
- P95: _____ ms
- P99: _____ ms

### Throughput
- [ ] Request rate within expected range
- [ ] No request queueing
- [ ] Concurrent request handling working
- [ ] Auto-scaling working (if enabled)

**Current Request Rate:** _____ req/s

### Resource Usage
```bash
kubectl top pods -l app=convergence-data-pipeline
```

- [ ] CPU usage < 50% (headroom for spikes)
- [ ] Memory usage < 60%
- [ ] No memory leaks detected
- [ ] Disk usage < 80%

**Current Resource Usage:**
- CPU: _____%
- Memory: _____%
- Disk: _____%

**Result:** [ ] PASS / [ ] FAIL

---

## Database Verification (< 10 minutes)

### BigQuery Connectivity
```bash
bq ls ${GCP_PROJECT_ID}:
```

- [ ] BigQuery accessible from application
- [ ] Service account permissions working
- [ ] Queries executing successfully
- [ ] Results returning correctly

### Data Integrity
```bash
# Check recent pipeline executions
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) FROM \`${TENANT_ID}.x_meta_pipeline_runs\`
   WHERE created_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)"
```

- [ ] Metadata tables accessible
- [ ] Pipeline execution logs writing
- [ ] API key lookups working
- [ ] No data corruption detected

### Metadata Tables
- [ ] x_meta_pipeline_runs table accessible
- [ ] x_meta_pipeline_logs table accessible
- [ ] x_meta_api_keys table accessible
- [ ] x_meta_data_quality_results table accessible

**Recent Pipeline Runs Count:** _____

**Result:** [ ] PASS / [ ] FAIL

---

## Security Verification (< 15 minutes)

### Authentication
- [ ] API key authentication working
- [ ] Invalid API keys rejected (401)
- [ ] Expired API keys rejected
- [ ] Admin API key secured (not in logs/env)

### Authorization
- [ ] Tenant isolation working
- [ ] Cross-tenant access blocked
- [ ] RBAC policies enforced

### Encryption
- [ ] HTTPS/TLS enabled
- [ ] Certificate valid
- [ ] KMS encryption working for secrets
- [ ] Sensitive data encrypted in logs

### Rate Limiting
```bash
# Test rate limiting
for i in {1..150}; do curl -H "x-api-key: ${API_KEY}" https://api.cloudact.io/api/v1/pipelines; done
```

- [ ] Rate limiting enabled
- [ ] Per-tenant limits enforced
- [ ] Global limits enforced
- [ ] 429 responses for limit exceeded
- [ ] Rate limit headers present

### Security Headers
```bash
curl -I https://api.cloudact.io/
```

- [ ] HSTS header present
- [ ] X-Frame-Options: DENY
- [ ] X-Content-Type-Options: nosniff
- [ ] CSP header configured
- [ ] CORS configured correctly

**Result:** [ ] PASS / [ ] FAIL

---

## Integration Verification (< 15 minutes)

### External Dependencies
- [ ] Google Cloud Secret Manager accessible
- [ ] Google Cloud KMS accessible
- [ ] Firestore accessible (for distributed locks)
- [ ] Pub/Sub accessible (if used)

### Notifications (if enabled)
- [ ] Email notifications working
- [ ] Slack notifications working
- [ ] Notification templates rendering correctly

### Scheduled Pipelines (if enabled)
- [ ] Scheduler running
- [ ] Scheduled pipelines executing
- [ ] No missed executions

**Result:** [ ] PASS / [ ] FAIL

---

## Traffic Validation (Production Only)

### Gradual Rollout
If using canary/blue-green deployment:

- [ ] 10% traffic routed to new version
- [ ] Error rate < 0.1% for 10 minutes
- [ ] Latency within SLO
- [ ] No critical alerts

- [ ] 50% traffic routed to new version
- [ ] Error rate < 0.1% for 10 minutes
- [ ] Latency within SLO
- [ ] No critical alerts

- [ ] 100% traffic routed to new version
- [ ] Error rate < 0.1% for 30 minutes
- [ ] Latency within SLO
- [ ] No critical alerts

### User Impact
- [ ] No user-reported issues
- [ ] No increase in support tickets
- [ ] No complaints in Slack channels

**Result:** [ ] PASS / [ ] FAIL

---

## Rollback Verification

### Rollback Plan Ready
- [ ] Previous version identified
- [ ] Rollback command tested (in notes)
- [ ] Rollback time estimate: _____ minutes
- [ ] Rollback procedure documented

**Rollback Command:**
```bash
gcloud run services update-traffic convergence-data-pipeline \
  --to-revisions PREVIOUS-REVISION=100
```

---

## End-to-End Test (< 30 minutes)

### Full E2E Test Suite
```bash
pytest tests/e2e/test_production_smoke.py -v
```

- [ ] E2E tests passed
- [ ] All critical user flows working
- [ ] No regressions detected

**Test Results:**
- Total Tests: _____
- Passed: _____
- Failed: _____
- Skipped: _____

**Result:** [ ] PASS / [ ] FAIL

---

## Monitoring Period

### Initial Monitoring (1 hour)
- [ ] 15-minute check: All metrics healthy
- [ ] 30-minute check: All metrics healthy
- [ ] 45-minute check: All metrics healthy
- [ ] 60-minute check: All metrics healthy

### Extended Monitoring (24 hours)
- [ ] 4-hour check completed
- [ ] 8-hour check completed
- [ ] 24-hour check completed

**Notes from monitoring:**

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

## Documentation Updates

- [ ] Deployment documented in changelog
- [ ] Release notes published
- [ ] Wiki/internal docs updated
- [ ] Status page updated (if applicable)

---

## Final Sign-Off

### Deployment Status

**Overall Result:** [ ] SUCCESS / [ ] PARTIAL / [ ] FAILED

**Issues Encountered:**
1. \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
2. \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
3. \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**Rollback Required:** [ ] YES / [ ] NO

**If YES, reason:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

### Sign-Off

**DevOps Engineer:**
- Name: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
- Date: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
- Deployment Verified: [ ] YES / [ ] NO

**Tech Lead:**
- Name: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
- Date: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
- Deployment Approved: [ ] YES / [ ] NO

---

## Next Steps

### If Deployment Successful:
- [ ] Close deployment ticket
- [ ] Notify team in #deployments channel
- [ ] Schedule postmortem (if issues occurred)
- [ ] Update success metrics

### If Deployment Failed:
- [ ] Execute rollback procedure
- [ ] Document failure reason
- [ ] Create incident ticket
- [ ] Schedule incident review
- [ ] Notify stakeholders

---

**Deployment verification complete at:** \_\_\_\_\_\_\_\_\_\_\_\_ (timestamp)
