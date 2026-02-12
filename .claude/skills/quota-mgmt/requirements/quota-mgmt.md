# Quota Management - Requirements

## Overview

Multi-tenant quota management and notification system. Covers plan-based quotas (daily/monthly/concurrent limits, atomic enforcement, self-healing), notification channels (Email, Slack, Webhook), alert rules, cost alerts, scheduled digests, and the scheduler-driven evaluation engine.

## Source Specifications

- `04_NOTIFICATIONS_ALERTS.md` (v4.0, 2026-02-08)
- `06_QUOTAS.md` (v2.0, 2026-02-08)

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

## SDLC

### Development Workflow

#### Quota Changes
1. **Modify plan limits** — Edit `SUBSCRIPTION_LIMITS` in `02-api-service/src/app/models/org_models.py`
2. **Update Supabase** — If limits change, update `organizations` table defaults via migration (`01-fronted-system/scripts/supabase_db/migrate.sh`)
3. **Test enforcement locally** — Start API service, run pipeline requests, verify 429 responses at limit
4. **PR** — Open pull request with quota changes
5. **Deploy** — Merge to main (stage) or tag for prod

#### Alert Changes
1. **Modify YAML configs** — Edit alert definitions in `03-data-pipeline-service/configs/alerts/`
2. **Test manually** — `curl -X POST http://localhost:8001/api/v1/alerts/configs/{id}/test -H "X-API-Key: $ORG_API_KEY"` to trigger a test evaluation
3. **Verify delivery** — Check Email/Slack/Webhook received test notification
4. **PR** — Open pull request with alert config changes
5. **Deploy Pipeline Service** — Merge to main (stage) or tag for prod
6. **Verify Cloud Scheduler** — Confirm `cloudact-daily-alerts` job runs at 08:00 UTC

### Testing Approach

| Test Type | Tool | Command |
|-----------|------|---------|
| Quota enforcement | pytest | `cd 02-api-service && pytest tests/ -k "quota"` — verify 429 responses |
| Concurrent limits | pytest | `cd 02-api-service && pytest tests/ -k "concurrent"` — atomic reservation |
| Self-healing | pytest | `cd 02-api-service && pytest tests/ -k "stale"` — stale counter cleanup |
| Alert engine | pytest | `cd 03-data-pipeline-service && pytest tests/ -k "alert"` — condition evaluation |
| Notification delivery | pytest | `cd 03-data-pipeline-service && pytest tests/ -k "notification"` — channel adapters |
| Warning banners | Vitest | `cd 01-fronted-system && npx vitest run --grep "quota"` — frontend warning UI |
| Quota usage page | Playwright | `cd 01-fronted-system && npx playwright test tests/e2e/settings.spec.ts` — settings E2E |
| Alert test endpoint | curl | `POST /alerts/configs/{id}/test` — manual alert evaluation |

### Deployment / CI/CD Integration

- **API Service** — Quota enforcement logic (plan limits, 429 responses, atomic reservation)
- **Pipeline Service** — Alert engine (condition evaluation, notification delivery, scheduler trigger)
- **Frontend** — Warning banners, quota usage page, alert settings UI
- **Cloud Scheduler** — `cloudact-daily-alerts` job triggers `POST /alerts/scheduler/evaluate` at 08:00 UTC
- **Cloud Run Jobs** — `quota-reset-daily` (00:00 UTC), `quota-reset-monthly` (1st of month), `stale-cleanup` (02:00 UTC), `quota-cleanup` (01:00 UTC)
- **Stage auto-deploy:** Push to `main` triggers `cloudbuild-stage.yaml` for all three services
- **Prod deploy:** Tag `v*` triggers `cloudbuild-prod.yaml`

### Release Cycle

Quota and alert changes span multiple services. **Plan limit changes** (API) can be deployed independently. **Alert engine changes** (Pipeline) require coordinated deploy if alert YAML schema changes. **Frontend warning thresholds** (80%/90%/100%) can be deployed independently. Cloud Scheduler jobs are managed via `05-scheduler-jobs/scripts/` and only need updating if schedule or job logic changes.

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

---

# Quotas & Rate Limiting

## Quota Enforcement Workflow

```
1. Pipeline request → API Service (8000)
2. Read subscription limits from Supabase (source of truth for plans)
3. Self-healing: cleanup_stale_concurrent_for_org(org_slug) (~50ms, zero if no stale)
4. Atomic quota check-and-reserve → Single SQL UPDATE with WHERE clauses
5. Return success OR 429 error with specific reason code
6. Pipeline executes → Pipeline Service (8001)
7. On complete → Decrement concurrent count, increment success/fail
8. Daily reset → 00:00 UTC (Cloud Run Job, API-first)
9. Monthly reset → 00:05 UTC 1st of month (Cloud Run Job)
10. Stale cleanup → 02:00 UTC daily (safety net, most handled by self-healing)
```

**Self-healing:** Before every quota reservation, stale concurrent counters are cleaned for the requesting org. Adds ~50ms overhead only when stale counters exist, zero overhead otherwise.

**Atomic reservation:** A single SQL UPDATE with WHERE clauses prevents race conditions. No separate read-then-write.

### FR-QM-020: Plan Limits

| Plan | Daily | Monthly | Concurrent | Seats | Providers | Price |
|------|-------|---------|------------|-------|-----------|-------|
| **Starter** | 6 | 180 | 20 | 2 | 3 | $19 |
| **Professional** | 25 | 750 | 20 | 6 | 6 | $69 |
| **Scale** | 100 | 3000 | 20 | 11 | 10 | $199 |
| **Enterprise** | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | Custom |

### FR-QM-021: Quota Types

| Quota | Description | Reset |
|-------|-------------|-------|
| `pipelines_run_today` | Daily pipeline executions | 00:00 UTC |
| `pipelines_run_month` | Monthly pipeline executions | 1st of month |
| `concurrent_pipelines_running` | Simultaneous executions | On completion |
| `seat_limit` | Team members per org | N/A (static) |
| `providers_limit` | Integrations per org | N/A (static) |

### FR-QM-022: Data Storage

| Table | Location | Purpose |
|-------|----------|---------|
| `organizations` | Supabase | Plan limits, billing status (source of truth) |
| `org_quotas` | Supabase | Current usage tracking (daily/monthly/concurrent) |
| `org_subscriptions` | BigQuery | Plan metadata (synced from Supabase at onboarding) |
| `org_usage_quotas` | BigQuery | Historical usage tracking |

### FR-QM-023: Quota Reset Schedule (Cloud Run Jobs)

| Job | Schedule | Action |
|-----|----------|--------|
| `quota-reset-daily` | 00:00 UTC | Reset `pipelines_run_today` + concurrent |
| `quota-reset-monthly` | 00:05 UTC 1st | Reset `pipelines_run_month` |
| `stale-cleanup` | 02:00 UTC daily | Fix stuck concurrent counts (safety net) |
| `quota-cleanup` | 01:00 UTC daily | Delete quota records >90 days |

### FR-QM-024: API Endpoints - Quotas (Port 8000)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/organizations/{org}/quota` | Get current quota status |
| POST | `/validator/validate/{org}` | Validate before pipeline run |

### FR-QM-025: Rate Limiting

| Scope | Limit |
|-------|-------|
| Per-org | 100 req/min, 1000 req/hour |
| Global | 10,000 req/min |

### FR-QM-026: Frontend Warning Thresholds

| Usage | Level | Color |
|-------|-------|-------|
| 80% | Warning | Yellow |
| 90% | Critical | Orange |
| 100% | Exceeded | Red (blocked) |

### FR-QM-027: Error Responses

| Code | Reason |
|------|--------|
| 429 | `DAILY_QUOTA_EXCEEDED` |
| 429 | `MONTHLY_QUOTA_EXCEEDED` |
| 429 | `CONCURRENT_LIMIT_EXCEEDED` |
| 429 | `PROVIDER_LIMIT_EXCEEDED` |
| 429 | `SEAT_LIMIT_EXCEEDED` |

### Quota Key Files

| File | Purpose |
|------|---------|
| `02-api-service/src/app/routers/quota.py` | Quota endpoint |
| `02-api-service/src/app/dependencies/auth.py` | Atomic reservation |
| `02-api-service/src/app/models/org_models.py` | `SUBSCRIPTION_LIMITS` |
| `03-data-pipeline-service/src/core/utils/quota_reset.py` | Reset functions |
| `01-fronted-system/components/quota-warning-banner.tsx` | Warning UI |
| `01-fronted-system/app/[orgSlug]/settings/quota-usage/page.tsx` | Quota usage page |
