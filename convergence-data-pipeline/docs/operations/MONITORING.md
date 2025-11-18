# Convergence Data Pipeline - Monitoring Guide

## Table of Contents
- [Overview](#overview)
- [Monitoring Stack](#monitoring-stack)
- [Key Metrics](#key-metrics)
- [Dashboards](#dashboards)
- [Alerts](#alerts)
- [Logs](#logs)
- [Traces](#traces)
- [SLIs and SLOs](#slis-and-slos)
- [On-Call Procedures](#on-call-procedures)

## Overview

The Convergence Data Pipeline uses a comprehensive observability stack to monitor system health, performance, and reliability.

**Monitoring Philosophy:**
- Proactive alerting before user impact
- Actionable metrics and alerts
- Clear correlation between symptoms and root causes
- Minimal alert fatigue through intelligent grouping

## Monitoring Stack

### Components

| Component | Purpose | Access |
|-----------|---------|--------|
| **Prometheus** | Metrics collection and storage | http://prometheus.cloudact.io |
| **Grafana** | Metrics visualization and dashboards | https://grafana.cloudact.io |
| **AlertManager** | Alert routing and deduplication | http://alertmanager:9093 |
| **Google Cloud Logging** | Centralized log aggregation | https://console.cloud.google.com/logs |
| **Google Cloud Trace** | Distributed tracing | https://console.cloud.google.com/traces |
| **PagerDuty** | Incident management and escalation | https://cloudact.pagerduty.com |
| **Slack** | Real-time notifications | #alerts-* channels |

### Architecture

```
┌─────────────┐
│ Application │
└──────┬──────┘
       │
       ├─────────┬──────────┬───────────┐
       │         │          │           │
       ▼         ▼          ▼           ▼
 ┌──────────┐ ┌──────┐ ┌──────┐  ┌────────┐
 │Prometheus│ │Logging│ │Trace │  │HealthCheck│
 └─────┬────┘ └───┬──┘ └───┬──┘  └────┬───┘
       │          │        │          │
       ▼          ▼        ▼          ▼
 ┌──────────┐ ┌──────────────────────────┐
 │ Grafana  │ │   Google Cloud Console   │
 └─────┬────┘ └──────────────────────────┘
       │
       ▼
 ┌──────────────┐
 │ AlertManager │
 └──────┬───────┘
        │
        ├─────────┬──────────┐
        ▼         ▼          ▼
   ┌─────────┐ ┌──────┐ ┌──────┐
   │PagerDuty│ │Slack │ │Email │
   └─────────┘ └──────┘ └──────┘
```

## Key Metrics

### Application Metrics

#### Request Metrics
```promql
# Total request rate
sum(rate(http_requests_total[5m]))

# Request rate by status code
sum(rate(http_requests_total[5m])) by (status_code)

# Error rate
sum(rate(http_requests_total{status_code=~"5.."}[5m])) /
sum(rate(http_requests_total[5m]))
```

#### Latency Metrics
```promql
# P50, P95, P99 latency
histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

### Pipeline Metrics

#### Execution Metrics
```promql
# Pipeline execution rate
sum(rate(pipeline_executions_total[5m]))

# Success rate
sum(rate(pipeline_executions_total{status="success"}[5m])) /
sum(rate(pipeline_executions_total[5m]))

# Failure rate by pipeline
sum(rate(pipeline_executions_total{status="failed"}[5m])) by (pipeline_id)
```

#### Performance Metrics
```promql
# Average pipeline duration
avg(pipeline_execution_duration_seconds)

# P95 pipeline duration
histogram_quantile(0.95, sum(rate(pipeline_execution_duration_seconds_bucket[5m])) by (le))

# Rows processed per second
sum(rate(pipeline_rows_processed_total[5m]))
```

### BigQuery Metrics

```promql
# Query rate
sum(rate(bigquery_queries_total[5m]))

# Query duration
histogram_quantile(0.95, sum(rate(bigquery_query_duration_seconds_bucket[5m])) by (le))

# Bytes processed per second
sum(rate(bigquery_bytes_processed_total[5m]))

# Error rate
sum(rate(bigquery_errors_total[5m])) /
sum(rate(bigquery_queries_total[5m]))
```

### System Metrics

```promql
# CPU usage
system_cpu_usage_percent

# Memory usage
(system_memory_usage_bytes / system_memory_total_bytes) * 100

# Active connections
active_connections

# Disk usage
(system_disk_usage_bytes / system_disk_total_bytes) * 100
```

### Security Metrics

```promql
# Authentication failures
sum(rate(auth_failures_total[5m]))

# Rate limit hits
sum(rate(rate_limit_hits_total[5m]))

# Failed auth by tenant
sum(rate(auth_failures_total[5m])) by (tenant_id)
```

## Dashboards

### 1. System Overview Dashboard

**URL:** https://grafana.cloudact.io/d/system-overview

**Purpose:** High-level view of system health

**Key Panels:**
- Request rate (req/s)
- Error rate (%)
- Latency (P50, P95, P99)
- Active connections
- CPU and memory usage

**Refresh Rate:** 30 seconds

**Access:** Public (read-only)

### 2. Pipeline Metrics Dashboard

**URL:** https://grafana.cloudact.io/d/pipeline-metrics

**Purpose:** Monitor pipeline execution and performance

**Key Panels:**
- Pipeline execution rate
- Success/failure rates
- Duration percentiles
- Rows processed
- Top failing pipelines

**Refresh Rate:** 1 minute

**Filters:**
- Tenant ID
- Pipeline ID
- Time range

### 3. BigQuery Performance Dashboard

**URL:** https://grafana.cloudact.io/d/bigquery-metrics

**Purpose:** Monitor BigQuery usage and performance

**Key Panels:**
- Query rate
- Query duration
- Bytes processed
- Slot utilization
- Cost estimation

**Refresh Rate:** 1 minute

### 4. Security Dashboard

**URL:** https://grafana.cloudact.io/d/security-metrics

**Purpose:** Monitor security events and authentication

**Key Panels:**
- Authentication failures
- Rate limit hits
- Suspicious activity
- API key usage
- Top rate-limited tenants

**Refresh Rate:** 30 seconds

### Custom Dashboard Creation

```json
// Import dashboard JSON
// Upload to Grafana
// Configure data source: Prometheus
// Set refresh interval
// Configure alerting (optional)
```

## Alerts

### Alert Severity Levels

| Severity | Response Time | Notification Channel | Escalation |
|----------|--------------|---------------------|------------|
| **Critical** | Immediate | PagerDuty + Slack + Email | Immediate |
| **High** | 15 minutes | Slack + Email | After 30 min |
| **Medium** | 1 hour | Slack | After 2 hours |
| **Warning** | Next business day | Slack | None |

### Critical Alerts

#### ServiceDown
```yaml
Alert: Service is down
Condition: up == 0 for 1 minute
Impact: Complete service outage
Action:
  1. Check service status
  2. Review recent deployments
  3. Check infrastructure (GCP, Cloud Run)
  4. Rollback if needed
Runbook: docs/operations/RUNBOOK.md#service-down
```

#### HighErrorRate
```yaml
Alert: Error rate above 5%
Condition: 5xx error rate > 5% for 5 minutes
Impact: Users experiencing errors
Action:
  1. Check error logs for patterns
  2. Identify failing component
  3. Consider rollback
  4. Fix and redeploy
Runbook: docs/operations/RUNBOOK.md#high-error-rate
```

#### PotentialBruteForce
```yaml
Alert: Potential brute force attack
Condition: Auth failures > 10/sec for 1 minute
Impact: Security incident
Action:
  1. Identify source IP
  2. Block malicious IPs
  3. Notify security team
  4. Review auth logs
Runbook: docs/operations/RUNBOOK.md#brute-force
```

### High Severity Alerts

#### PipelineFailureRate
```yaml
Alert: High pipeline failure rate
Condition: Failure rate > 10% for 5 minutes
Impact: Data processing degraded
Action:
  1. Check pipeline logs
  2. Identify failing pipelines
  3. Fix configuration or code
  4. Retry failed pipelines
Runbook: docs/operations/RUNBOOK.md#pipeline-failures
```

#### BigQueryErrorRate
```yaml
Alert: BigQuery error rate high
Condition: BQ error rate > 5% for 5 minutes
Impact: Data queries failing
Action:
  1. Check quota usage
  2. Review error messages
  3. Optimize queries if needed
  4. Request quota increase
Runbook: docs/operations/RUNBOOK.md#bigquery-errors
```

### Alert Configuration

**File:** `config/monitoring/alerts.yaml`

**Test Alerts:**
```bash
# Trigger test alert
curl -X POST http://alertmanager:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[{
    "labels": {"alertname": "TestAlert", "severity": "warning"},
    "annotations": {"summary": "This is a test"}
  }]'

# Verify Slack notification received
# Verify PagerDuty incident created (for critical)
```

**Silence Alerts:**
```bash
# Silence alert for maintenance window
curl -X POST http://alertmanager:9093/api/v1/silences \
  -H "Content-Type: application/json" \
  -d '{
    "matchers": [{"name": "alertname", "value": ".*", "isRegex": true}],
    "startsAt": "2024-01-01T10:00:00Z",
    "endsAt": "2024-01-01T12:00:00Z",
    "comment": "Scheduled maintenance",
    "createdBy": "ops-team"
  }'
```

## Logs

### Log Levels

| Level | Usage | Retention | Example |
|-------|-------|-----------|---------|
| DEBUG | Development only | 7 days | Variable values, detailed traces |
| INFO | Normal operations | 30 days | Request started, pipeline completed |
| WARNING | Potential issues | 60 days | Rate limit approaching, slow query |
| ERROR | Errors that should be investigated | 90 days | API call failed, query error |
| CRITICAL | Urgent issues requiring immediate action | 90 days | Service crash, data corruption |

### Structured Logging

All logs are in JSON format with standard fields:

```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "level": "INFO",
  "message": "Pipeline execution completed",
  "service": "convergence-data-pipeline",
  "version": "1.0.0",
  "environment": "production",
  "request_id": "req-123",
  "tenant_id": "acme1281",
  "pipeline_id": "openai-usage",
  "duration_ms": 1250,
  "status": "success"
}
```

### Log Queries

#### Recent Errors
```bash
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" \
  --limit 50 \
  --format json | jq -r '.[] | [.timestamp, .jsonPayload.message] | @tsv'
```

#### Pipeline Logs
```bash
gcloud logging read "resource.type=cloud_run_revision AND jsonPayload.pipeline_id='openai-usage'" \
  --limit 100 \
  --format json
```

#### Authentication Failures
```bash
gcloud logging read "resource.type=cloud_run_revision AND jsonPayload.message:'authentication failed'" \
  --limit 50 \
  --format json | jq -r '.[] | .jsonPayload.tenant_id' | sort | uniq -c
```

### Log-based Metrics

Create metrics from log patterns:

```yaml
# In config/production/monitoring.yaml
log_metrics:
  - name: pipeline_step_duration
    pattern: "Pipeline step .* completed in (\\d+)ms"
    metric_type: histogram
```

## Traces

### Distributed Tracing

**Tool:** Google Cloud Trace + OpenTelemetry

**Configuration:** `config/production/monitoring.yaml`

**Sample Rate:** 10% in production (100% in staging)

### View Traces

1. **Cloud Console:**
   - Navigate to: https://console.cloud.google.com/traces
   - Filter by trace ID, latency, or time range

2. **Find Slow Traces:**
```bash
# List traces with latency > 1 second
gcloud trace list \
  --filter="latency>1s" \
  --limit=10
```

3. **Analyze Trace:**
```bash
# Get trace details
gcloud trace describe <trace-id>
```

### Trace Instrumentation

Key spans to monitor:
- `http.request` - Full request lifecycle
- `pipeline.execute` - Pipeline execution
- `bigquery.query` - BigQuery operations
- `auth.validate` - Authentication

## SLIs and SLOs

### Service Level Indicators (SLIs)

| SLI | Measurement | Target |
|-----|-------------|--------|
| **Availability** | Successful requests / Total requests | > 99.9% |
| **Latency (P50)** | 50th percentile response time | < 100ms |
| **Latency (P95)** | 95th percentile response time | < 500ms |
| **Latency (P99)** | 99th percentile response time | < 1000ms |
| **Error Rate** | 5xx errors / Total requests | < 0.1% |

### Service Level Objectives (SLOs)

**30-day rolling window:**

```promql
# Availability SLO (99.9%)
(
  sum(rate(http_requests_total{status_code!~"5.."}[30d])) /
  sum(rate(http_requests_total[30d]))
) > 0.999

# Latency SLO (P95 < 500ms)
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[30d])) by (le)
) < 0.5

# Error Rate SLO (< 0.1%)
(
  sum(rate(http_requests_total{status_code=~"5.."}[30d])) /
  sum(rate(http_requests_total[30d]))
) < 0.001
```

### Error Budget

**Monthly Error Budget:** 0.1% = ~43 minutes of downtime

**Check Error Budget:**
```promql
# Calculate remaining error budget
(0.999 - availability_sli) * 43200  # seconds in 30 days
```

**Alert on Budget Burn:**
```yaml
Alert: ErrorBudgetBurnRateHigh
Condition: Error budget burning at > 10x normal rate
Action: Investigate and stop the bleeding
```

## On-Call Procedures

### On-Call Schedule

**Tool:** PagerDuty

**Rotation:** Weekly, Monday 9am PST

**Escalation:**
- Primary: Immediate
- Secondary: After 15 minutes
- Manager: After 30 minutes

### On-Call Responsibilities

1. **Respond to Pages:**
   - Acknowledge within 5 minutes
   - Triage and assess severity
   - Follow runbook procedures

2. **Monitor Dashboards:**
   - Check system overview every 4 hours
   - Review alert queue daily
   - Investigate anomalies

3. **Incident Communication:**
   - Update #incidents channel
   - Notify stakeholders for P1/P2
   - Document actions in incident log

4. **Handoff:**
   - Document ongoing issues
   - Brief next on-call engineer
   - Update runbook if needed

### On-Call Tools

```bash
# Quick health check
curl https://api.cloudact.io/health/ready

# Check active alerts
curl http://alertmanager:9093/api/v1/alerts | jq '.data[] | select(.status.state=="firing")'

# View recent errors
gcloud logging read "severity>=ERROR" --limit 20 --format json

# Check system metrics
curl https://api.cloudact.io/metrics | grep -E "cpu|memory|error"
```

## Additional Resources

- [RUNBOOK.md](RUNBOOK.md) - Incident response procedures
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Google Cloud Monitoring](https://cloud.google.com/monitoring/docs)
