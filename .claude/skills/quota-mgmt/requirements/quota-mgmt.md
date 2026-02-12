# Quota Management - Requirements

## Overview

Multi-tenant, config-driven notification and alert system with scheduled digests, delivery history, cost-based triggers, and quota warning alerts. Covers notification channels, alert rules, cost alerts, summaries, and the scheduler-driven evaluation engine.

## Source Specification

- `00-requirements-specs/04_NOTIFICATIONS_ALERTS.md` (v4.0, 2026-02-08)

---

## Functional Requirements

### FR-QM-001: Alert Workflow

1. Admin configures channels: Email (SMTP), Slack (webhook), HTTP Webhook
2. Admin configures alert rules with conditions, pause/resume/test
3. Admin configures summaries: scheduled digests (daily/weekly/monthly)
4. Cloud Scheduler triggers `POST /alerts/scheduler/evaluate` at 08:00 UTC
5. Alert Engine evaluates BigQuery query per rule
6. Condition check with operator evaluation (gt, lt, between, etc.)
7. Recipient resolution: org_owners / all_members / hierarchy_node / custom
8. Parallel channel send: Email + Slack + Webhook (concurrent)
9. Cooldown applied to prevent duplicates within configured period
10. History logged with delivery status and acknowledgement tracking

### FR-QM-002: Alert Types

| Alert Type | Source | Trigger | Status |
|------------|--------|---------|--------|
| Subscription Cost | `cost_data_standard_1_3` | Cost > threshold | Done |
| Cloud Cost | `cost_data_standard_1_3` | Cost > threshold | Done |
| GenAI Cost | `cost_data_standard_1_3` | Cost > threshold | Done |
| Quota Warning | Usage quotas | Usage > 80/90/100% | Done |
| Cost Alert Presets | `cost_data_standard_1_3` | Preset-based triggers | Done |
| Scheduled Alerts | Cron-like | Cost-based triggers on schedule | Done |
| Budget Percentage | `org_budgets` | Usage > X% | Planned |
| Anomaly Detection | Time series | Deviation > threshold | Planned |

### FR-QM-003: Notification Channels

| Channel | Protocol | Status |
|---------|----------|--------|
| Email | SMTP (smtp.gmail.com:587) | Done |
| Slack | Incoming Webhooks | Done |
| Generic Webhook | HTTP POST (custom URL) | Done |
| Microsoft Teams | Webhook connector | Planned |
| PagerDuty | API | Planned |

Each channel supports a test endpoint: `POST /notifications/{org}/channels/{id}/test`

### FR-QM-004: Notification Features

| Feature | Description |
|---------|-------------|
| Rules | Alert conditions with pause, resume, and test capabilities |
| Summaries | Scheduled digests (daily/weekly/monthly) with preview and send-now |
| History | Delivery log with acknowledgement tracking |
| Scheduled Alerts | Cron-like scheduling with cost-based triggers |
| Org Alerts | Per-organization alert configuration with enable/disable |
| Cost Alerts | Presets, bulk enable/disable, create-from-preset |

### FR-QM-005: Condition Operators

| Operator | Description |
|----------|-------------|
| `gt`, `lt`, `eq`, `gte`, `lte`, `ne` | Standard comparisons |
| `between`, `not_between` | Range checks (inclusive) |
| `contains`, `not_contains` | String matching |
| `in`, `not_in` | List membership |
| `is_null`, `is_not_null` | Null checks |
| `percentage_of_exceeds` | Percentage threshold |

### FR-QM-006: Recipient Resolution

| Resolver | Description |
|----------|-------------|
| `org_owners` | Query Supabase for organization owners |
| `all_members` | All active organization members |
| `hierarchy_node` | BigQuery org_hierarchy owners |
| `custom` | Static email list in config |

### FR-QM-007: API Endpoints - Notifications (Port 8000)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/notifications/{org}/channels` | Channel CRUD |
| PUT/DELETE | `/notifications/{org}/channels/{id}` | Channel update/delete |
| POST | `/notifications/{org}/channels/{id}/test` | Test channel delivery |
| GET/POST | `/notifications/{org}/rules` | Rule CRUD |
| PUT | `/notifications/{org}/rules/{id}/pause` | Pause rule |
| PUT | `/notifications/{org}/rules/{id}/resume` | Resume rule |
| POST | `/notifications/{org}/rules/{id}/test` | Test rule |
| GET/POST | `/notifications/{org}/summaries` | Summary/digest CRUD |
| POST | `/notifications/{org}/summaries/{id}/preview` | Preview digest |
| POST | `/notifications/{org}/summaries/{id}/send-now` | Send digest immediately |
| GET | `/notifications/{org}/history` | Delivery history with acknowledgement |

### FR-QM-008: API Endpoints - Org Alerts (Port 8000)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/notifications/{org}/org-alerts` | Org alert CRUD |
| PUT | `/notifications/{org}/org-alerts/{id}/enable` | Enable org alert |
| PUT | `/notifications/{org}/org-alerts/{id}/disable` | Disable org alert |

### FR-QM-009: API Endpoints - Cost Alerts (Port 8000)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/cost-alerts/{org}` | Cost alert CRUD |
| GET | `/cost-alerts/{org}/presets` | List available presets |
| POST | `/cost-alerts/{org}/from-preset` | Create alert from preset |
| POST | `/cost-alerts/{org}/bulk-enable` | Bulk enable alerts |
| POST | `/cost-alerts/{org}/bulk-disable` | Bulk disable alerts |

### FR-QM-010: API Endpoints - Pipeline Service (Port 8001)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/alerts/scheduler/evaluate` | Cloud Scheduler trigger |
| GET | `/alerts/configs` | List alert configs |
| POST | `/alerts/configs/{id}/test` | Test alert manually |
| POST | `/alerts/orgs/{org}/evaluate` | Evaluate for specific org |
| GET | `/alerts/orgs/{org}/history` | Alert history |

### FR-QM-011: Scheduler Job

| Job | Schedule | Purpose |
|-----|----------|---------|
| `cloudact-daily-alerts` | 08:00 UTC | Evaluate all org alert rules and send notifications |

---

## Non-Functional Requirements

### NFR-QM-001: Reliability

| Standard | Implementation |
|----------|----------------|
| Retry | 3 attempts, exponential backoff (1s base, 30s max, +/-25% jitter) |
| Retryable errors | Server 5xx, ConnectionError, SMTPException |
| Non-retryable | Client 4xx (configuration issues) |
| Parallel send | `asyncio.gather()` for concurrent channel delivery |
| Timeouts | Query: 60s, Notification: 30s (configurable) |
| Thread safety | Double-checked locking, RLock for cache, asyncio.Lock for sessions |
| Multi-tenancy | Composite cache keys `org_slug:provider_type`, org_slug validated in all queries |
| Graceful shutdown | `close_all_sessions()` on app shutdown |

### NFR-QM-002: Security

| Standard | Implementation |
|----------|----------------|
| XSS protection | `html_escape()` on user content in HTML templates |
| Credential protection | URL sanitization in logs |
| Input validation | Regex for org_slug, email, URLs |
| KMS encryption | Channel credentials encrypted by API Service |

---

## Data Structures

### BigQuery Tables

| Table | Purpose |
|-------|---------|
| `org_notification_channels` | Channel configurations (email, slack, webhook) |
| `org_notification_rules` | Alert rule definitions with conditions |
| `org_notification_summaries` | Digest schedule configurations |
| `org_notification_history` | Delivery log with status + acknowledgement |
| `org_scheduled_alerts` | Cron-like scheduled alert definitions |
| `org_alert_history` | Alert evaluation results |

### Materialized Views

| View | Purpose |
|------|---------|
| `x_all_notifications` | Unified notification view across all types |
| `x_notification_stats` | Aggregated notification statistics |

---

## Architecture

```
Frontend (3000)     -> API Service (8000)    -> Pipeline Service (8001)  -> Channels
Settings UI           Channel CRUD            Alert Engine               Email (SMTP)
Alert Rules           Rule Config             Send Notifications         Slack (Webhook)
Summaries             Org Alerts              Evaluate Schedules         Generic Webhook
History               Cost Alerts
```

---

## Key Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/src/core/alerts/engine.py` | AlertEngine orchestrator |
| `03-data-pipeline-service/src/core/alerts/condition_evaluator.py` | Condition operators |
| `03-data-pipeline-service/src/core/alerts/recipient_resolver.py` | Recipient lookups |
| `03-data-pipeline-service/src/core/notifications/adapters.py` | Email/Slack/Webhook adapters |
| `03-data-pipeline-service/configs/alerts/` | Alert YAML definitions |
| `02-api-service/src/app/routers/notifications.py` | Channel/rule/summary endpoints |
| `02-api-service/src/app/routers/cost_alerts.py` | Cost alert endpoints |

---

## Future Enhancements

- Microsoft Teams + PagerDuty integrations
- SMS via Twilio
- Budget-based alerts + anomaly detection
- Alert aggregation (digest mode beyond summaries)
