# Full-Stack Notification & Alert Architecture

**Version:** 3.0 (Production-Ready) | **Updated:** 2026-01-18

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              CLOUDACT NOTIFICATION SYSTEM                                │
│                     Frontend (3000) → API Service (8000) → Pipeline Service (8001)      │
└─────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                    FRONTEND (3000)                                        │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                        /[orgSlug]/notifications                                     │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │  │
│  │  │  Channels   │  │   Rules     │  │  Summaries  │  │   History   │  │  Stats   │ │  │
│  │  │   (CRUD)    │  │   (CRUD)    │  │   (CRUD)    │  │   (View)    │  │  (View)  │ │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  └──────────┘ │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
│                                         │                                                 │
│                                         ▼                                                 │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                      actions/notifications.ts (Server Actions)                      │  │
│  │  • listNotificationChannels()     • createNotificationRule()                       │  │
│  │  • testNotificationChannel()      • pauseNotificationRule()                        │  │
│  │  • listScheduledAlerts()          • testScheduledAlert()                           │  │
│  │  • getAlertHistory()              • acknowledgeNotification()                      │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          │ HTTP (fetch)
                                          ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                  API SERVICE (8000)                                       │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                      /api/v1/notifications/{org_slug}/*                             │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐│  │
│  │  │ /channels   │  │  /rules     │  │ /summaries  │  │  /scheduled-alerts          ││  │
│  │  │  GET/POST   │  │  GET/POST   │  │  GET/POST   │  │  GET/POST (org-alerts)      ││  │
│  │  │  PUT/DELETE │  │  PUT/DELETE │  │  PUT/DELETE │  │  PUT/DELETE/enable/disable  ││  │
│  │  │  /test      │  │  /pause     │  │  /send-now  │  │  /test, /history            ││  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────────────┘│  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
│                                         │                                                 │
│                                         ▼                                                 │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                   NotificationCrudService (service.py - 1523 lines)                 │  │
│  │  • KMS encryption for credentials    • Cron scheduling with timezone               │  │
│  │  • Channel validation & testing      • Rule lifecycle management                   │  │
│  │  • Cooldown enforcement              • Alert history recording                     │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
│                                         │                                                 │
│                                         ▼                                                 │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                              BigQuery (organizations)                               │  │
│  │  • org_notification_channels    • org_notification_rules                           │  │
│  │  • org_notification_summaries   • org_notification_history                         │  │
│  │  • org_scheduled_alerts         • org_alert_history                                │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          │ Cloud Scheduler / Manual Trigger
                                          ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                               PIPELINE SERVICE (8001)                                     │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                           /api/v1/alerts/*                                          │  │
│  │  POST /scheduler/evaluate      ← Cloud Scheduler (8 AM UTC daily)                  │  │
│  │  POST /configs/{id}/test       ← Manual test from API/Frontend                     │  │
│  │  POST /orgs/{org}/evaluate     ← Org-specific evaluation                           │  │
│  │  GET  /orgs/{org}/history      ← Alert history for org                             │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
│                                         │                                                 │
│                                         ▼                                                 │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                          Alert Framework (src/core/alerts/)                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │  │
│  │  │ Config      │  │ Query       │  │ Condition   │  │ Recipient   │               │  │
│  │  │ Loader      │  │ Executor    │  │ Evaluator   │  │ Resolver    │               │  │
│  │  │ (YAML)      │  │ (BigQuery)  │  │ (gt,lt,eq)  │  │ (Supabase)  │               │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘               │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
│                                         │                                                 │
│                                         ▼                                                 │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                 Unified Provider Registry (src/core/notifications/)                 │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐   │  │
│  │  │                    NotificationProviderRegistry (Singleton)                  │   │  │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │   │  │
│  │  │  │   Email     │  │   Slack     │  │  Webhook    │  │  +Future    │        │   │  │
│  │  │  │  Adapter    │  │  Adapter    │  │  Adapter    │  │ Teams/Jira  │        │   │  │
│  │  │  │  (SMTP)     │  │  (HTTP)     │  │  (HTTP)     │  │  SMS/PD     │        │   │  │
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │   │  │
│  │  └─────────────────────────────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
                              ┌──────────────────────┐
                              │   Email (SMTP)       │
                              │   Slack (Webhook)    │
                              │   Custom Webhooks    │
                              └──────────────────────┘
```

---

## File System Structure

### Frontend (01-fronted-system)

```
01-fronted-system/
├── app/
│   └── [orgSlug]/
│       └── notifications/
│           └── page.tsx                    # Main notifications settings UI (2051 lines)
│                                           # Tabs: Channels, Rules, Summaries, History, Stats
│
├── actions/
│   └── notifications.ts                    # Server actions for API calls (1211 lines)
│                                           # 13+ endpoints: channels, rules, summaries, history
│
├── components/
│   ├── ui/
│   │   ├── alert.tsx                       # Alert component (variants: default, destructive, success)
│   │   └── alert-dialog.tsx                # Confirmation dialogs (Radix UI based)
│   │
│   └── quota-warning-banner.tsx            # Real-time quota warnings (80%/90%/100% levels)
│
└── content/
    └── docs/
        └── notifications/
            └── index.mdx                   # User documentation for notification setup
```

### API Service (02-api-service)

```
02-api-service/
├── src/
│   ├── app/
│   │   └── routers/
│   │       └── notifications.py            # REST endpoints (1538 lines)
│   │                                       # Channels, Rules, Summaries, History, Scheduled Alerts
│   │
│   └── core/
│       └── services/
│           ├── notification_crud/
│           │   ├── models.py               # Pydantic models & enums (700 lines)
│           │   │                           # ChannelType, RuleCategory, AlertType, etc.
│           │   └── service.py              # Business logic (1523 lines)
│           │                               # KMS encryption, validation, CRUD ops
│           │
│           └── notification_read/
│               └── models.py               # Read-only models for queries (158 lines)
│
└── configs/
    └── setup/
        └── bootstrap/
            └── schemas/
                ├── org_notification_channels.json    # Channel configurations
                ├── org_notification_rules.json       # Alert rule definitions
                ├── org_notification_summaries.json   # Scheduled summaries
                ├── org_notification_history.json     # Delivery tracking
                ├── org_scheduled_alerts.json         # Scheduled alert configs (27 cols)
                └── org_alert_history.json            # Alert execution history
```

### Pipeline Service (03-data-pipeline-service)

```
03-data-pipeline-service/
├── src/
│   ├── app/
│   │   └── routers/
│   │       └── alerts.py                   # Alert scheduler endpoints (404 lines)
│   │                                       # /scheduler/evaluate, /configs/{id}/test
│   │
│   └── core/
│       ├── alerts/                         # Alert Framework
│       │   ├── __init__.py                 # Public exports
│       │   ├── engine.py                   # AlertEngine orchestrator (883 lines)
│       │   ├── models.py                   # Alert config models (179 lines)
│       │   ├── config_loader.py            # YAML parser
│       │   ├── query_executor.py           # BigQuery query templates
│       │   ├── condition_evaluator.py      # Threshold operators (gt, lt, eq, etc.)
│       │   └── recipient_resolver.py       # Supabase/BigQuery recipient lookup
│       │
│       ├── notifications/                  # Unified Provider System
│       │   ├── __init__.py                 # Public API (159 lines)
│       │   ├── registry.py                 # NotificationProviderRegistry singleton
│       │   │                               # ProviderType enum, config dataclasses
│       │   ├── adapters.py                 # Email/Slack/Webhook adapters
│       │   │                               # SMTP, HTTP, validation, XSS protection
│       │   ├── alert_sender.py             # AlertNotificationSender helper
│       │   │                               # send_cost_alert, send_quota_alert
│       │   ├── service.py                  # NotificationService wrapper
│       │   ├── base.py                     # Exception classes
│       │   ├── provider_template.py        # Template for adding new providers
│       │   └── providers/
│       │       └── __init__.py             # Re-exports adapters
│       │
│       └── processors/
│           └── notify_systems/
│               └── email_notification.py   # Pipeline notification processor
│
├── configs/
│   └── alerts/
│       └── subscription_alerts.yml         # Alert configurations (156 lines)
│                                           # $3 test, $20, $50, $100 thresholds
│
└── docs/
    ├── NOTIFICATION_ARCHITECTURE.md        # 3-page system architecture
    └── FULL_STACK_NOTIFICATION_ARCHITECTURE.md  # This document
```

---

## Data Flow

### 1. Alert Configuration (Frontend → API → BigQuery)

```
User creates alert rule in Frontend
        │
        ▼
actions/notifications.ts::createNotificationRule()
        │
        ▼
API: POST /api/v1/notifications/{org}/rules
        │
        ▼
NotificationCrudService.create_rule()
  ├── Validate rule configuration
  ├── KMS encrypt sensitive fields
  └── Insert to BigQuery org_notification_rules
```

### 2. Alert Evaluation (Cloud Scheduler → Pipeline → Email)

```
Cloud Scheduler (8 AM UTC)
        │
        ▼
Pipeline: POST /api/v1/alerts/scheduler/evaluate
        │
        ▼
AlertEngine.evaluate_all_alerts()
  ├── ConfigLoader.load_all_alerts() → configs/alerts/*.yml
  ├── QueryExecutor.execute() → BigQuery subscription costs
  ├── ConditionEvaluator.evaluate() → $10.32 > $3 = TRIGGERED
  ├── RecipientResolver.resolve() → surasani.rama@gmail.com
  └── AlertNotificationSender.send()
        │
        ▼
NotificationProviderRegistry.send_to_channels(["email"])
        │
        ▼
EmailNotificationAdapter.send()
  ├── Build MIME message
  ├── SMTP starttls + login
  └── send_message()
        │
        ▼
Email delivered to surasani.rama@gmail.com ✅
```

### 3. Test Alert (Frontend → API → Pipeline)

```
Frontend: Click "Test Alert" button
        │
        ▼
actions/notifications.ts::testScheduledAlert(alertId)
        │
        ▼
API: POST /api/v1/notifications/{org}/org-alerts/{id}/test
        │ (API proxies to Pipeline Service)
        ▼
Pipeline: POST /api/v1/alerts/configs/{id}/test?dry_run=false
        │
        ▼
AlertEngine.evaluate_all_alerts([alertId], force_check=True)
        │
        ▼
(Same flow as #2 above)
```

---

## Provider Configuration

### Environment Variables

```bash
# Pipeline Service (.env.local)

# Email (SMTP) - supports both prefixes
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=support@cloudact.ai
SMTP_PASSWORD=your-app-password
FROM_EMAIL=support@cloudact.ai
FROM_NAME=CloudAct.ai Support

# Alternative prefix (also supported)
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_FROM_ADDRESS=alerts@cloudact.ai

# Slack (Global fallback)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
SLACK_DEFAULT_CHANNEL=#cost-alerts

# Future Providers
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/...
PAGERDUTY_INTEGRATION_KEY=xxx
```

---

## Alert Types Supported

| Alert Type | Location | Trigger | Recipients |
|------------|----------|---------|------------|
| **Cost Threshold** | Pipeline configs/alerts/*.yml | BigQuery cost > threshold | org_owners, custom |
| **Budget Percent** | API org_notification_rules | Cost > X% of budget | rule-defined |
| **Anomaly Detection** | API org_notification_rules | Std deviation > threshold | rule-defined |
| **Pipeline Failure** | Pipeline notify_systems | Pipeline status = FAILED | pipeline config |
| **Quota Warning** | Frontend quota-warning-banner | Usage > 80%/90%/100% | In-app display |
| **Integration Health** | API org_notification_rules | Credential expiry/failure | rule-defined |
| **Subscription Renewal** | API org_notification_rules | Days until renewal | rule-defined |

---

## Security Features

| Feature | Implementation | Location |
|---------|----------------|----------|
| **KMS Encryption** | Webhook URLs, Slack tokens encrypted at rest | API NotificationCrudService |
| **XSS Protection** | `html_escape()` on all user content in HTML | Pipeline alert_sender.py |
| **URL Sanitization** | Strip query params from logs | Pipeline adapters.py |
| **Email Validation** | RFC 5322 regex validation | Pipeline adapters.py |
| **Org Isolation** | Composite cache keys `org_slug:provider_type` | Pipeline registry.py |
| **Input Validation** | Org slug regex, email format, URL format | All layers |

---

## Adding New Features

### Add New Provider (e.g., PagerDuty)

1. **Pipeline Service:**
   ```python
   # registry.py
   class ProviderType(str, Enum):
       PAGERDUTY = "pagerduty"

   @dataclass
   class PagerDutyProviderConfig(BaseProviderConfig):
       integration_key: str = ""

   # adapters.py
   class PagerDutyNotificationAdapter(NotificationProviderInterface):
       async def send(self, payload) -> bool:
           # POST to PagerDuty Events API v2
   ```

2. **API Service:**
   ```python
   # models.py
   class ChannelType(str, Enum):
       PAGERDUTY = "pagerduty"

   # Add to channel creation validation
   ```

3. **Frontend:**
   ```typescript
   // notifications.ts
   type ChannelType = "email" | "slack" | "webhook" | "pagerduty";

   // notifications/page.tsx
   // Add PagerDuty config form in channel dialog
   ```

### Add New Alert Type

1. Create YAML in `configs/alerts/`:
   ```yaml
   alerts:
     - id: my_new_alert
       name: "My Alert"
       source: { query_template: my_query }
       conditions: [{ field: value, operator: gt, value: 100 }]
       recipients: { type: org_owners }
       notification: { channels: [email] }
   ```

2. Add query template in `query_executor.py` if needed

3. No code changes required for basic alerts!

---

## Production Features (v3.0)

### Retry Logic with Exponential Backoff

All notification adapters (Email, Slack, Webhook) include automatic retry:

```python
# adapters.py
async def retry_with_backoff(
    coro_func,
    max_attempts=3,           # NOTIFICATION_RETRY_MAX_ATTEMPTS
    base_delay=1.0,           # NOTIFICATION_RETRY_DELAY_SECONDS
    retryable_exceptions=(SMTPException, ClientError, ConnectionError)
)
```

**Behavior:**
- Retries server errors (5xx), connection errors, SMTP errors
- Does NOT retry client errors (4xx) - config issues
- Exponential backoff: 1s → 2s → 4s (with ±25% jitter)

### Parallel Channel Sending

When sending to multiple channels (e.g., email + slack):

```python
# registry.py
async def send_to_channels(payload, channels, parallel=True):
    if parallel and len(channels) > 1:
        tasks = [_send_to_channel(ch) for ch in channels]
        await asyncio.gather(*tasks)
```

**Configuration:** `ALERT_PARALLEL_CHANNELS=true` (default)

### Configurable Timeouts

| Setting | Env Variable | Default |
|---------|--------------|---------|
| Alert query timeout | `ALERT_QUERY_TIMEOUT_SECONDS` | 60s |
| Notification timeout | `NOTIFICATION_TIMEOUT_SECONDS` | 30s |
| Retry attempts | `NOTIFICATION_RETRY_MAX_ATTEMPTS` | 3 |
| Retry base delay | `NOTIFICATION_RETRY_DELAY_SECONDS` | 1.0s |
| Parallel channels | `ALERT_PARALLEL_CHANNELS` | true |

### Graceful Shutdown

```python
# main.py lifespan shutdown
registry = get_notification_registry()
await registry.close_all_sessions()  # Closes Slack/Webhook aiohttp sessions
```

### Fixed Issues in v3.0

| Issue | Fix |
|-------|-----|
| Decimal JSON serialization error | Added `decimal_serializer()` in engine.py |
| Race condition in session locks | Thread-safe double-checked locking |
| Deprecated `datetime.utcnow()` | Changed to `datetime.now(timezone.utc)` |
| Thread-unsafe singletons | Added locks to `get_alert_sender()` |
| `percentage_of` operator wrong return type | Renamed to `percentage_of_exceeds`, returns bool |

### Condition Operators

| Operator | Description |
|----------|-------------|
| `gt`, `lt`, `eq`, `gte`, `lte`, `ne` | Standard comparisons |
| `between`, `not_between` | Range checks |
| `contains`, `not_contains` | String matching |
| `in`, `not_in` | List membership |
| `is_null`, `is_not_null` | Null checks |
| `percentage_of_exceeds` | `(value/limit)*100 >= threshold` |

---

## Summary

The CloudAct notification system is **production-ready** with:

- ✅ **Full-stack integration** - Frontend → API → Pipeline
- ✅ **Multi-tenant isolation** - Org-scoped configs and cache
- ✅ **Config-driven alerts** - YAML-based, no code changes
- ✅ **Retry with backoff** - Automatic retry for transient failures
- ✅ **Parallel sending** - Concurrent multi-channel delivery
- ✅ **Configurable timeouts** - All via environment variables
- ✅ **Graceful shutdown** - Clean session cleanup
- ✅ **Extensible** - Easy to add Teams, Jira, PagerDuty, SMS
