# Notifications & Alerts System Requirements

**Version:** 3.0 | **Updated:** 2026-01-18 | **Status:** Production-Ready

---

## Overview

CloudAct provides a multi-tenant, config-driven notification and alert system that monitors cost data and sends notifications through multiple channels.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NOTIFICATION FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Frontend   │───▶│ API Service  │───▶│   Pipeline   │───▶│  Channels    │
│    (3000)    │    │    (8000)    │    │    (8001)    │    │              │
│              │    │              │    │              │    │  - Email     │
│ Settings UI  │    │ Channel CRUD │    │ Alert Engine │    │  - Slack     │
│ Alert Rules  │    │ Rule Config  │    │ Send Notif   │    │  - Webhook   │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

---

## Functional Requirements

### FR-001: Alert Configuration

| Requirement | Description | Status |
|-------------|-------------|--------|
| FR-001.1 | YAML-based alert configuration (no code changes needed) | ✅ Done |
| FR-001.2 | Support multiple thresholds per alert type | ✅ Done |
| FR-001.3 | Configurable cooldown periods | ✅ Done |
| FR-001.4 | Cron-based scheduling with timezone support | ✅ Done |

### FR-002: Notification Channels

| Requirement | Description | Status |
|-------------|-------------|--------|
| FR-002.1 | Email notifications via SMTP | ✅ Done |
| FR-002.2 | Slack notifications via webhooks | ✅ Done |
| FR-002.3 | Generic webhook notifications | ✅ Done |
| FR-002.4 | Microsoft Teams support | 🔲 Planned |
| FR-002.5 | PagerDuty integration | 🔲 Planned |
| FR-002.6 | SMS notifications | 🔲 Planned |

### FR-003: Alert Types

| Alert Type | Query Source | Trigger Condition | Status |
|------------|--------------|-------------------|--------|
| Subscription Cost | BigQuery cost_data_standard_1_3 | Cost > threshold | ✅ Done |
| Cloud Cost | BigQuery cost_data_standard_1_3 | Cost > threshold | ✅ Done |
| GenAI Cost | BigQuery cost_data_standard_1_3 | Cost > threshold | ✅ Done |
| Budget Percentage | BigQuery + org_budgets | Usage > X% | 🔲 Planned |
| Anomaly Detection | BigQuery time series | Deviation > threshold | 🔲 Planned |
| Quota Warning | Usage quotas | Usage > 80/90/100% | ✅ Done |

### FR-004: Recipient Resolution

| Resolver | Description | Status |
|----------|-------------|--------|
| org_owners | Query Supabase for organization owners | ✅ Done |
| all_members | All active organization members | ✅ Done |
| hierarchy_node | BigQuery org_hierarchy owners | ✅ Done |
| custom | Static email list in config | ✅ Done |

---

## Non-Functional Requirements

### NFR-001: Reliability

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Retry with exponential backoff | 3 attempts, 1s base delay, 30s max | ✅ Done |
| Retryable errors | Server 5xx, ConnectionError, SMTPException | ✅ Done |
| Non-retryable errors | Client 4xx (configuration issues) | ✅ Done |
| Jitter on retries | ±25% to prevent thundering herd | ✅ Done |

### NFR-002: Performance

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Parallel channel sending | asyncio.gather() for concurrent delivery | ✅ Done |
| Connection pooling | Shared aiohttp sessions per adapter | ✅ Done |
| Configurable query timeout | ALERT_QUERY_TIMEOUT_SECONDS (default: 60s) | ✅ Done |
| Configurable send timeout | NOTIFICATION_TIMEOUT_SECONDS (default: 30s) | ✅ Done |

### NFR-003: Multi-Tenancy

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Org isolation | Composite cache keys: `org_slug:provider_type` | ✅ Done |
| Org-specific configs | Per-org provider configurations | ✅ Done |
| Cross-org prevention | Validate org_slug in all queries | ✅ Done |

### NFR-004: Thread Safety

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Singleton pattern | Double-checked locking with threading.Lock | ✅ Done |
| Cache operations | threading.RLock for thread-safe access | ✅ Done |
| Session locks | Thread-safe asyncio.Lock initialization | ✅ Done |

### NFR-005: Security

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| XSS protection | html_escape() on user content in HTML | ✅ Done |
| Credential protection | URL sanitization in logs | ✅ Done |
| Input validation | Regex for org_slug, email, URLs | ✅ Done |
| KMS encryption | API Service encrypts channel credentials | ✅ Done |

### NFR-006: Graceful Shutdown

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Session cleanup | close_all_sessions() on app shutdown | ✅ Done |
| Connection release | aiohttp sessions properly closed | ✅ Done |

---

## Configuration

### Environment Variables

```bash
# Alert Configuration
ALERT_QUERY_TIMEOUT_SECONDS=60       # BigQuery query timeout
ALERT_PARALLEL_CHANNELS=true         # Send to channels concurrently

# Notification Configuration
NOTIFICATION_RETRY_MAX_ATTEMPTS=3    # Max retry attempts
NOTIFICATION_RETRY_DELAY_SECONDS=1.0 # Initial backoff delay
NOTIFICATION_TIMEOUT_SECONDS=30      # Per-notification timeout

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=support@cloudact.ai
SMTP_PASSWORD=<app-password>
FROM_EMAIL=support@cloudact.ai
FROM_NAME=CloudAct.ai Support

# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
```

### Alert YAML Format

```yaml
alerts:
  - id: subscription_cost_threshold
    name: "Subscription Cost Threshold"
    enabled: true

    schedule:
      cron: "0 8 * * *"
      timezone: "UTC"

    source:
      type: bigquery
      query_template: subscription_costs
      params:
        period: current_month

    conditions:
      - field: total_cost
        operator: gt
        value: 20
        unit: USD

    recipients:
      type: org_owners

    notification:
      template: subscription_cost_alert
      severity: warning
      channels:
        - email
        - slack

    cooldown:
      enabled: true
      hours: 24
```

---

## Condition Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `gt` | Greater than | `value: 100` |
| `lt` | Less than | `value: 50` |
| `eq` | Equals | `value: "active"` |
| `gte` | Greater or equal | `value: 10` |
| `lte` | Less or equal | `value: 80` |
| `ne` | Not equals | `value: "inactive"` |
| `between` | Range inclusive | `value: [10, 100]` |
| `not_between` | Outside range | `value: [10, 100]` |
| `contains` | String contains | `value: "test"` |
| `not_contains` | String excludes | `value: "test"` |
| `in` | List membership | `value: ["us", "eu"]` |
| `not_in` | Not in list | `value: ["test", "dev"]` |
| `is_null` | Value is null | (no value needed) |
| `is_not_null` | Value not null | (no value needed) |
| `percentage_of_exceeds` | Percentage check | `value: [limit, 90]` |

---

## File Structure

```
03-data-pipeline-service/
├── src/
│   ├── app/
│   │   └── routers/
│   │       └── alerts.py              # Alert API endpoints
│   └── core/
│       ├── alerts/
│       │   ├── engine.py              # AlertEngine orchestrator
│       │   ├── models.py              # Pydantic models
│       │   ├── config_loader.py       # YAML parser
│       │   ├── query_executor.py      # BigQuery queries
│       │   ├── condition_evaluator.py # Operators
│       │   └── recipient_resolver.py  # Supabase/BQ lookups
│       └── notifications/
│           ├── registry.py            # Provider registry
│           ├── adapters.py            # Email/Slack/Webhook
│           ├── alert_sender.py        # Alert sender helper
│           └── base.py                # Exceptions
├── configs/
│   └── alerts/
│       └── subscription_alerts.yml    # Alert definitions
└── docs/
    ├── NOTIFICATION_ARCHITECTURE.md
    └── FULL_STACK_NOTIFICATION_ARCHITECTURE.md
```

---

## API Endpoints

### Pipeline Service (8001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/alerts/scheduler/evaluate` | Cloud Scheduler trigger |
| GET | `/api/v1/alerts/configs` | List all alert configs |
| GET | `/api/v1/alerts/configs/{id}` | Get specific config |
| POST | `/api/v1/alerts/configs/{id}/test` | Test alert manually |
| POST | `/api/v1/alerts/orgs/{org}/evaluate` | Evaluate for org |
| GET | `/api/v1/alerts/orgs/{org}/history` | Get alert history |

### API Service (8000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/v1/notifications/{org}/channels` | Channel CRUD |
| PUT/DELETE | `/api/v1/notifications/{org}/channels/{id}` | Channel update/delete |
| POST | `/api/v1/notifications/{org}/channels/{id}/test` | Test channel |
| GET/POST | `/api/v1/notifications/{org}/rules` | Rule CRUD |
| GET/POST | `/api/v1/notifications/{org}/org-alerts` | Org alerts CRUD |

---

## Testing

```bash
# Test $3 subscription cost alert
curl -X POST "http://localhost:8001/api/v1/alerts/configs/subscription_cost_test_3/test?dry_run=false" \
  -H "X-CA-Root-Key: ${CA_ROOT_API_KEY}"

# Evaluate all alerts
curl -X POST "http://localhost:8001/api/v1/alerts/scheduler/evaluate" \
  -H "X-CA-Root-Key: ${CA_ROOT_API_KEY}"

# List alert configs
curl "http://localhost:8001/api/v1/alerts/configs" \
  -H "X-CA-Root-Key: ${CA_ROOT_API_KEY}"
```

---

## Future Enhancements

- [ ] Microsoft Teams integration
- [ ] PagerDuty integration
- [ ] SMS notifications via Twilio
- [ ] Jira ticket creation
- [ ] Budget-based alerts
- [ ] Anomaly detection
- [ ] Alert aggregation (digest mode)
- [ ] Alert acknowledgment workflow
