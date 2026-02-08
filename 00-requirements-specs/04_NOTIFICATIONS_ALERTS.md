# Notifications & Alerts

**v3.1** | 2026-02-05 | **Status:** Production-Ready

> Multi-tenant, config-driven notification and alert system

---

## Alert Workflow

```
1. Admin configures alert rules → Frontend Settings UI
2. API stores channel + rule config → API Service (8000)
3. Cloud Scheduler triggers → POST /alerts/scheduler/evaluate
4. Alert Engine evaluates → BigQuery query per rule
5. Condition check → Operator evaluation (gt, lt, between, etc.)
6. Recipient resolution → org_owners / all_members / hierarchy_node / custom
7. Parallel channel send → Email + Slack + Webhook (concurrent)
8. Cooldown applied → Prevent duplicate alerts within configured period
9. History logged → Alert results stored for audit
```

---

## Architecture

```
Frontend (3000)     → API Service (8000)    → Pipeline Service (8001)  → Channels
Settings UI           Channel CRUD            Alert Engine               Email (SMTP)
Alert Rules           Rule Config             Send Notifications         Slack (Webhook)
                                                                         Generic Webhook
```

---

## Alert Types

| Alert Type | Source | Trigger | Status |
|------------|--------|---------|--------|
| Subscription Cost | `cost_data_standard_1_3` | Cost > threshold | Done |
| Cloud Cost | `cost_data_standard_1_3` | Cost > threshold | Done |
| GenAI Cost | `cost_data_standard_1_3` | Cost > threshold | Done |
| Quota Warning | Usage quotas | Usage > 80/90/100% | Done |
| Budget Percentage | `org_budgets` | Usage > X% | Planned |
| Anomaly Detection | Time series | Deviation > threshold | Planned |

---

## Notification Channels

| Channel | Protocol | Status |
|---------|----------|--------|
| Email | SMTP (smtp.gmail.com:587) | Done |
| Slack | Incoming Webhooks | Done |
| Generic Webhook | HTTP POST | Done |
| Microsoft Teams | Webhook connector | Planned |
| PagerDuty | API | Planned |

---

## Condition Operators

| Operator | Description |
|----------|-------------|
| `gt`, `lt`, `eq`, `gte`, `lte`, `ne` | Standard comparisons |
| `between`, `not_between` | Range checks (inclusive) |
| `contains`, `not_contains` | String matching |
| `in`, `not_in` | List membership |
| `is_null`, `is_not_null` | Null checks |
| `percentage_of_exceeds` | Percentage threshold |

---

## Recipient Resolution

| Resolver | Description |
|----------|-------------|
| `org_owners` | Query Supabase for organization owners |
| `all_members` | All active organization members |
| `hierarchy_node` | BigQuery org_hierarchy owners |
| `custom` | Static email list in config |

---

## Reliability Standards

| Standard | Implementation |
|----------|----------------|
| Retry | 3 attempts, exponential backoff (1s base, 30s max, ±25% jitter) |
| Retryable errors | Server 5xx, ConnectionError, SMTPException |
| Non-retryable | Client 4xx (configuration issues) |
| Parallel send | `asyncio.gather()` for concurrent channel delivery |
| Timeouts | Query: 60s, Notification: 30s (configurable) |
| Thread safety | Double-checked locking, RLock for cache, asyncio.Lock for sessions |
| Multi-tenancy | Composite cache keys `org_slug:provider_type`, org_slug validated in all queries |
| Graceful shutdown | `close_all_sessions()` on app shutdown |

---

## Security Standards

| Standard | Implementation |
|----------|----------------|
| XSS protection | `html_escape()` on user content in HTML templates |
| Credential protection | URL sanitization in logs |
| Input validation | Regex for org_slug, email, URLs |
| KMS encryption | Channel credentials encrypted by API Service |

---

## API Endpoints

### Pipeline Service (8001)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/alerts/scheduler/evaluate` | Cloud Scheduler trigger |
| GET | `/alerts/configs` | List alert configs |
| POST | `/alerts/configs/{id}/test` | Test alert manually |
| POST | `/alerts/orgs/{org}/evaluate` | Evaluate for specific org |
| GET | `/alerts/orgs/{org}/history` | Alert history |

### API Service (8000)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/notifications/{org}/channels` | Channel CRUD |
| PUT/DELETE | `/notifications/{org}/channels/{id}` | Channel update/delete |
| POST | `/notifications/{org}/channels/{id}/test` | Test channel |
| GET/POST | `/notifications/{org}/rules` | Rule CRUD |
| GET/POST | `/notifications/{org}/org-alerts` | Org alerts CRUD |

---

## Key Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/src/core/alerts/engine.py` | AlertEngine orchestrator |
| `03-data-pipeline-service/src/core/alerts/condition_evaluator.py` | Condition operators |
| `03-data-pipeline-service/src/core/alerts/recipient_resolver.py` | Recipient lookups |
| `03-data-pipeline-service/src/core/notifications/adapters.py` | Email/Slack/Webhook |
| `03-data-pipeline-service/configs/alerts/` | Alert YAML definitions |

---

## Future Enhancements

- Microsoft Teams + PagerDuty integrations
- SMS via Twilio
- Budget-based alerts + anomaly detection
- Alert aggregation (digest mode)
- Acknowledgment workflow
