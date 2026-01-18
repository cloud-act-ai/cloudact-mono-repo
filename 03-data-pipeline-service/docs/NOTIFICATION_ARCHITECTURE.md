# Notification System Architecture

**Version:** 3.0 (Production-Ready with Retry & Parallel Sending)
**Updated:** 2026-01-18

---

## Page 1: System Overview

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        NOTIFICATION SYSTEM ARCHITECTURE                       │
└──────────────────────────────────────────────────────────────────────────────┘

                                Cloud Scheduler
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Pipeline Service (8001)                               │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      /api/v1/alerts/*                                 │  │
│  │   POST /scheduler/evaluate    ← Cloud Scheduler trigger              │  │
│  │   POST /configs/{id}/test     ← Manual test trigger                  │  │
│  │   GET  /configs               ← List alert configurations            │  │
│  │   POST /orgs/{org}/evaluate   ← Org-specific evaluation              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         Alert Framework                               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │  │
│  │  │ Config      │  │ Query       │  │ Condition   │  │ Recipient  │  │  │
│  │  │ Loader      │  │ Executor    │  │ Evaluator   │  │ Resolver   │  │  │
│  │  │ (YAML)      │  │ (BigQuery)  │  │ (Operators) │  │ (Supabase) │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │               Unified Provider Registry (Singleton)                   │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │  │
│  │  │                   NotificationProviderRegistry                   │ │  │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │ │  │
│  │  │  │   Email     │  │   Slack     │  │  Webhook    │             │ │  │
│  │  │  │  Adapter    │  │  Adapter    │  │  Adapter    │             │ │  │
│  │  │  │  (SMTP)     │  │  (HTTP)     │  │  (HTTP)     │             │ │  │
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘             │ │  │
│  │  │                                                                  │ │  │
│  │  │  Cache: { org_slug:provider_type → config }                     │ │  │
│  │  └─────────────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    Alert History (BigQuery)                           │  │
│  │                 organizations.org_alert_history                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                        ┌──────────────────────┐
                        │   Email Recipients   │
                        │   Slack Channels     │
                        │   Custom Webhooks    │
                        └──────────────────────┘
```

### Core Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Multi-Tenant Isolation** | Composite cache keys (`org_slug:provider_type`), org-scoped configs |
| **Thread Safety** | RLock for cache operations, double-checked locking singleton |
| **Zero Legacy Debt** | Single unified registry, no backwards compatibility code |
| **Config-Driven Alerts** | YAML-based alert definitions, no code changes needed |
| **Extensible Providers** | Interface-based adapters, easy to add Teams/Jira/SMS |
| **Retry with Backoff** | Exponential backoff with jitter for transient failures |
| **Parallel Channel Sending** | Concurrent notification delivery via `asyncio.gather()` |
| **Configurable Timeouts** | All timeouts configurable via environment variables |
| **Graceful Shutdown** | Session cleanup on application shutdown |

### Alert Evaluation Flow

```
1. Cloud Scheduler → POST /scheduler/evaluate (8 AM UTC daily)
2. Load configs/*.yml → List of AlertConfig
3. For each enabled alert:
   a. Execute BigQuery query template → List[{org_slug, total_cost, ...}]
   b. For each org's data:
      - Check cooldown (BigQuery org_alert_history)
      - Evaluate conditions (gt, lt, eq, gte, lte, between)
      - Resolve recipients (Supabase org_owners / custom emails)
      - Send notifications via unified registry
      - Record history in BigQuery
```

---

## Page 2: File System & Components

### Directory Structure

```
03-data-pipeline-service/
├── configs/
│   └── alerts/                              # Alert YAML configurations
│       └── subscription_alerts.yml          # Subscription cost alerts
│
├── src/
│   ├── app/
│   │   └── routers/
│   │       └── alerts.py                    # Alert scheduler endpoints
│   │
│   └── core/
│       ├── alerts/                          # Alert Framework
│       │   ├── __init__.py                  # Public exports
│       │   ├── engine.py                    # AlertEngine orchestrator
│       │   ├── models.py                    # Pydantic models
│       │   ├── config_loader.py             # YAML parser
│       │   ├── query_executor.py            # BigQuery templates
│       │   ├── condition_evaluator.py       # Threshold evaluation
│       │   └── recipient_resolver.py        # Supabase/BigQuery lookups
│       │
│       └── notifications/                   # Unified Notification System
│           ├── __init__.py                  # Public API
│           ├── registry.py                  # NotificationProviderRegistry
│           ├── adapters.py                  # Email/Slack/Webhook adapters
│           ├── alert_sender.py              # AlertNotificationSender helper
│           ├── service.py                   # NotificationService wrapper
│           ├── base.py                      # Exception classes
│           ├── provider_template.py         # How to add new providers
│           └── providers/
│               └── __init__.py              # Re-exports adapters
│
└── docs/
    └── NOTIFICATION_ARCHITECTURE.md         # This document
```

### Key Components

#### 1. NotificationProviderRegistry (`registry.py`)

```python
# Singleton with thread-safe initialization
class NotificationProviderRegistry:
    _instance = None
    _singleton_lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._singleton_lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    # Multi-tenant config cache
    _configs: Dict[str, BaseProviderConfig]  # Key: org_slug:provider_type
    _config_lock: threading.RLock()

    # Core methods
    def get_provider(provider_type, org_slug) -> NotificationProviderInterface
    def set_config(provider_type, config, org_slug=None) -> None
    async def send_to_channels(payload, channels, org_slug) -> Dict[str, bool]
```

#### 2. AlertEngine (`engine.py`)

```python
class AlertEngine:
    def __init__(self):
        self.config_loader = AlertConfigLoader()
        self.query_executor = AlertQueryExecutor()
        self.condition_evaluator = ConditionEvaluator()
        self.recipient_resolver = RecipientResolver()

    async def evaluate_all_alerts(alert_ids, force_check) -> EvaluationSummary
    async def evaluate_alerts_for_org(org_slug, alert_ids, force_check) -> EvaluationSummary
```

#### 3. Alert Configuration (`subscription_alerts.yml`)

```yaml
alerts:
  - id: subscription_cost_test_3
    name: "Subscription Cost Test Alert ($3)"
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
        value: 3
        unit: USD

    recipients:
      type: custom
      emails:
        - surasani.rama@gmail.com

    notification:
      template: subscription_cost_alert
      severity: warning
      channels:
        - email

    cooldown:
      enabled: false
```

### Provider Adapters

| Adapter | Protocol | Configuration |
|---------|----------|---------------|
| `EmailNotificationAdapter` | SMTP/TLS | EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_USERNAME, EMAIL_SMTP_PASSWORD |
| `SlackNotificationAdapter` | HTTP/JSON | SLACK_WEBHOOK_URL (per org or global) |
| `WebhookNotificationAdapter` | HTTP/JSON | Per-alert webhook_url in config |

---

## Page 3: API Endpoints & Adding New Providers

### Alert API Endpoints

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| `POST` | `/api/v1/alerts/scheduler/evaluate` | Cloud Scheduler trigger | X-CA-Root-Key |
| `GET` | `/api/v1/alerts/configs` | List all alert configs | X-CA-Root-Key |
| `GET` | `/api/v1/alerts/configs/{id}` | Get specific alert config | X-CA-Root-Key |
| `POST` | `/api/v1/alerts/configs/{id}/test` | Test specific alert | X-CA-Root-Key |
| `POST` | `/api/v1/alerts/orgs/{org}/evaluate` | Evaluate for specific org | X-CA-Root-Key |
| `GET` | `/api/v1/alerts/orgs/{org}/history` | Get org alert history | X-CA-Root-Key |

### Test Commands

```bash
# Test the $3 alert (will send email if SMTP is configured)
curl -X POST "http://localhost:8001/api/v1/alerts/configs/subscription_cost_test_3/test?dry_run=false" \
  -H "X-CA-Root-Key: ${CA_ROOT_API_KEY}"

# Evaluate all alerts
curl -X POST "http://localhost:8001/api/v1/alerts/scheduler/evaluate" \
  -H "X-CA-Root-Key: ${CA_ROOT_API_KEY}"

# Get alert configs
curl "http://localhost:8001/api/v1/alerts/configs" \
  -H "X-CA-Root-Key: ${CA_ROOT_API_KEY}"
```

### Adding New Notification Providers

To add a new provider (e.g., Microsoft Teams):

#### Step 1: Add ProviderType in `registry.py`

```python
class ProviderType(str, Enum):
    EMAIL = "email"
    SLACK = "slack"
    WEBHOOK = "webhook"
    TEAMS = "teams"      # NEW
```

#### Step 2: Create Config Dataclass

```python
@dataclass
class TeamsProviderConfig(BaseProviderConfig):
    webhook_url: Optional[str] = None
    title_prefix: str = "[CloudAct.AI]"

    @classmethod
    def from_env(cls) -> "TeamsProviderConfig":
        return cls(
            enabled=os.environ.get("TEAMS_ENABLED", "true").lower() == "true",
            webhook_url=os.environ.get("TEAMS_WEBHOOK_URL"),
        )
```

#### Step 3: Implement Adapter

```python
class TeamsNotificationAdapter(NotificationProviderInterface):
    def __init__(self, config: TeamsProviderConfig):
        self._config = config

    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.TEAMS

    @property
    def is_configured(self) -> bool:
        return bool(self._config.enabled and self._config.webhook_url)

    async def send(self, payload: NotificationPayload) -> bool:
        # Send to Teams webhook
        pass
```

#### Step 4: Register in `_register_builtin_providers()`

```python
self.register(ProviderType.TEAMS, TeamsNotificationAdapter)
self.set_global_config(ProviderType.TEAMS, TeamsProviderConfig.from_env())
```

### Environment Variables

```bash
# Email (SMTP)
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USERNAME=your-email@example.com
EMAIL_SMTP_PASSWORD=your-app-password
EMAIL_FROM_ADDRESS=alerts@cloudact.ai
EMAIL_FROM_NAME=CloudAct Alerts

# Slack (Global fallback)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz

# Future: Teams
TEAMS_ENABLED=true
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/...
```

### Security Features

| Feature | Implementation |
|---------|----------------|
| **XSS Protection** | `html_escape()` on all user content in HTML templates |
| **Credential Protection** | URL sanitization in logs (remove query params) |
| **Input Validation** | Regex validation for org_slug, email addresses |
| **Multi-Tenant Isolation** | Composite cache keys, org-scoped configs |
| **Thread Safety** | RLock for cache, Lock for singleton |

---

## Page 4: Production Features (v3.0)

### Retry Logic with Exponential Backoff

All notification adapters include automatic retry with exponential backoff:

```python
async def retry_with_backoff(
    coro_func,
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    retryable_exceptions: tuple = (Exception,),
)
```

**Retry Behavior:**
- Retries on: Server errors (5xx), `ConnectionError`, `OSError`, `SMTPException`
- Does NOT retry: Client errors (4xx) - these indicate configuration issues
- Backoff formula: `delay = base_delay * 2^(attempt-1) * jitter(0.75-1.25)`

**Example:** With default settings (3 attempts, 1s base delay):
```
Attempt 1: immediate
Attempt 2: ~1.0s delay (0.75-1.25s with jitter)
Attempt 3: ~2.0s delay (1.5-2.5s with jitter)
```

### Parallel Channel Sending

When sending to multiple channels, notifications are sent concurrently:

```python
# registry.py
async def send_to_channels(payload, channels, org_slug, parallel=True):
    if parallel and len(channels) > 1:
        tasks = [_send_to_channel(ch) for ch in channels]
        results = await asyncio.gather(*tasks, return_exceptions=True)
```

**Benefits:**
- Email + Slack + Webhook sent simultaneously
- Total time = max(channel_times) instead of sum(channel_times)
- Configurable via `ALERT_PARALLEL_CHANNELS` env var

### Configurable Timeouts

All timeouts are now configurable via environment variables:

| Setting | Env Var | Default | Description |
|---------|---------|---------|-------------|
| Query Timeout | `ALERT_QUERY_TIMEOUT_SECONDS` | 60 | BigQuery alert query timeout |
| Notification Timeout | `NOTIFICATION_TIMEOUT_SECONDS` | 30 | Per-notification send timeout |
| Retry Attempts | `NOTIFICATION_RETRY_MAX_ATTEMPTS` | 3 | Max retry attempts |
| Retry Delay | `NOTIFICATION_RETRY_DELAY_SECONDS` | 1.0 | Initial backoff delay |
| Parallel Channels | `ALERT_PARALLEL_CHANNELS` | true | Send to channels concurrently |

### Graceful Shutdown

On application shutdown, all HTTP sessions are closed cleanly:

```python
# main.py lifespan
async with lifespan(app):
    yield
    # Shutdown
    registry = get_notification_registry()
    await registry.close_all_sessions()
```

**Cleaned up resources:**
- Slack adapter aiohttp session
- Webhook adapter aiohttp session
- Connection pools returned to OS

### Condition Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `gt` | Greater than | `{"field": "cost", "operator": "gt", "value": 100}` |
| `lt` | Less than | `{"field": "cost", "operator": "lt", "value": 50}` |
| `eq` | Equals | `{"field": "status", "operator": "eq", "value": "active"}` |
| `gte` | Greater or equal | `{"field": "count", "operator": "gte", "value": 10}` |
| `lte` | Less or equal | `{"field": "usage", "operator": "lte", "value": 80}` |
| `between` | Range check | `{"field": "cost", "operator": "between", "value": [10, 100]}` |
| `contains` | String contains | `{"field": "name", "operator": "contains", "value": "test"}` |
| `in` | List membership | `{"field": "region", "operator": "in", "value": ["us", "eu"]}` |
| `percentage_of_exceeds` | Percentage threshold | `{"field": "usage", "operator": "percentage_of_exceeds", "value": [limit, 90]}` |

### Decimal Serialization Fix

BigQuery returns `Decimal` types which are now automatically converted for JSON:

```python
def decimal_serializer(obj):
    from decimal import Decimal
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(...)

json.dumps(data, default=decimal_serializer)
```

---

## Summary

The notification system is now a **production-ready, enterprise-grade architecture**:

- **No backwards compatibility code** - Legacy providers removed
- **Single registry pattern** - All providers use `NotificationProviderRegistry`
- **Config-driven alerts** - Add alerts via YAML, no code changes
- **Multi-tenant secure** - Org isolation at cache, config, and query levels
- **Extensible** - Template provided for adding Teams, Jira, PagerDuty, SMS
- **Retry with backoff** - Automatic retry for transient failures
- **Parallel sending** - Concurrent multi-channel delivery
- **Configurable** - All timeouts and behaviors via env vars
- **Graceful shutdown** - Clean session cleanup on exit

**Test Results (2026-01-18):**
- Alert `subscription_cost_test_3` triggered for org `cloudact_inc_01142026`
- Total cost: **$10.32** > $3 threshold
- Recipient resolved: `surasani.rama@gmail.com`
- Email sent successfully via SMTP
