---
name: notifications
description: |
  Notification and cost alert management for CloudAct. Channels, rules, summaries, alert processing.
  Use when: creating notification channels (email/Slack/webhook), setting up cost alert rules,
  configuring scheduled summaries, debugging alert delivery, checking notification history,
  or managing the daily alerts scheduler job.
---

# /notifications - Notification & Alert Management

Manage notification channels, alert rules, scheduled summaries, cost alert presets, and alert processing.

## Trigger

```
/notifications                          # Overview of notification system
/notifications channels <org>           # List channels for org
/notifications rules <org>              # List alert rules for org
/notifications history <org>            # View notification history
/notifications debug <org>              # Debug delivery issues
```

## Architecture

```
Frontend (Notifications Page)          API Service (8000)              BigQuery
─────────────────────────             ─────────────────              ────────
/{orgSlug}/notifications               /notifications/{org}/          6 Tables:
├─ Channels (email/Slack/webhook)      ├─ channels (7 endpoints)      ├─ org_notification_channels
├─ Rules (cost/pipeline/system)        ├─ rules (8 endpoints)         ├─ org_notification_rules
├─ Summaries (daily/weekly/monthly)    ├─ summaries (7 endpoints)     ├─ org_notification_summaries
├─ History (delivery log)              ├─ history (3 endpoints)       ├─ org_notification_history
└─ Stats                               ├─ org-alerts (8 endpoints)    ├─ org_scheduled_alerts
                                       └─ stats (1 endpoint)          └─ org_alert_history
/cost-alerts/{org}/
├─ CRUD (5 endpoints)                  Chat Backend (8002)
├─ Enable/Disable (2)                  ├─ list_alerts tool
├─ Bulk ops (2)                        ├─ create_alert tool
└─ Presets (2)                         ├─ alert_history tool
                                       └─ acknowledge_alert tool
Scheduler Jobs (Cloud Run)
└─ alerts_daily.py (08:00 UTC)         API Total: 46 endpoints
   POST /admin/alerts/process-all
```

## Environments

| Environment | API URL | Supabase | BigQuery |
|-------------|---------|----------|----------|
| local | `http://localhost:8000` | kwroaccbrxppfiysqlzs | cloudact-testing-1 |
| stage | Cloud Run URL | kwroaccbrxppfiysqlzs | cloudact-testing-1 |
| prod | `https://api.cloudact.ai` | ovfxswhkkshouhsryzaf | cloudact-prod |

## Key Locations

| Type | Path |
|------|------|
| Notifications Router | `02-api-service/src/app/routers/notifications.py` |
| Cost Alerts Router | `02-api-service/src/app/routers/cost_alerts.py` |
| Notification Schemas | `02-api-service/configs/setup/bootstrap/schemas/org_notification_*.json` |
| Alert Schemas | `02-api-service/configs/setup/bootstrap/schemas/org_scheduled_alerts.json` |
| Alert History Schema | `02-api-service/configs/setup/bootstrap/schemas/org_alert_history.json` |
| Frontend Page | `01-fronted-system/app/[orgSlug]/notifications/page.tsx` |
| Server Actions | `01-fronted-system/actions/notifications.ts` |
| Chat Alert Tools | `07-org-chat-backend/src/core/tools/alerts.py` |
| Daily Alert Job | `05-scheduler-jobs/jobs/daily/alerts_daily.py` |

## BigQuery Tables (6)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `org_notification_channels` | Delivery channels | channel_id, channel_type (email/slack/webhook), recipients |
| `org_notification_rules` | Alert conditions | rule_id, rule_category, conditions, priority, cooldown |
| `org_notification_summaries` | Scheduled reports | summary_id, summary_type (daily/weekly/monthly), sections |
| `org_notification_history` | Delivery log | notification_id, status (queued/sent/delivered/failed), recipients |
| `org_scheduled_alerts` | Org-specific alerts | alert_id, alert_type, schedule_cron, conditions, severity |
| `org_alert_history` | Alert trigger log | alert_history_id, status (SENT/FAILED/COOLDOWN), trigger_data |

## Channel Types

| Type | Config Fields | Encryption |
|------|--------------|------------|
| **email** | email_recipients[], email_cc_recipients[] | None |
| **slack** | slack_webhook_url, slack_channel, slack_mention_users[] | webhook URL encrypted (KMS) |
| **webhook** | webhook_url, webhook_headers | URL + headers encrypted (KMS) |

## Alert Rule Categories

| Category | Types | Example |
|----------|-------|---------|
| **cost** | budget_percent, budget_forecast, absolute_threshold, anomaly_percent_change, anomaly_std_deviation, hierarchy_budget | "Alert when cloud costs > $5,000/day" |
| **pipeline** | pipeline_failure, data_freshness | "Alert when any pipeline fails" |
| **integration** | integration_health | "Alert 7 days before credential expiry" |
| **subscription** | subscription_renewal, license_utilization | "Alert at 80% quota usage" |
| **system** | maintenance, version_update | "Alert on system maintenance" |

**Full `rule_type` enum (11 values):** `budget_percent`, `budget_forecast`, `absolute_threshold`, `anomaly_percent_change`, `anomaly_std_deviation`, `hierarchy_budget`, `pipeline_failure`, `data_freshness`, `integration_health`, `subscription_renewal`, `license_utilization`

## Alert Priority Levels

| Priority | Use Case |
|----------|----------|
| critical | Immediate action required (budget exceeded, service down) |
| high | Urgent attention needed (approaching limits) |
| medium | Review when possible (anomaly detected) |
| low | Informational (weekly summary) |
| info | Background notification (pipeline completed) |

## Cost Alert Presets

| Preset ID | Name | Threshold | Scope |
|-----------|------|-----------|-------|
| `cloud_1000` | Cloud Cost Threshold | $1,000 | cloud |
| `cloud_5000_critical` | Critical Cloud Spend | $5,000 | cloud |
| `genai_500` | GenAI Cost Threshold | $500 | genai |
| `openai_200` | OpenAI Cost Threshold | $200 | openai |
| `total_2500` | Total Monthly Cost | $2,500 | all |

## Procedures

### Create Notification Channel

```bash
# Email channel
curl -X POST "http://localhost:8000/api/v1/notifications/{org}/channels" \
  -H "X-API-Key: {key}" -H "Content-Type: application/json" \
  -d '{
    "name": "Team Email",
    "channel_type": "email",
    "email_recipients": ["team@company.com"],
    "is_default": true
  }'

# Slack channel
curl -X POST "http://localhost:8000/api/v1/notifications/{org}/channels" \
  -H "X-API-Key: {key}" -H "Content-Type: application/json" \
  -d '{
    "name": "Cost Alerts Slack",
    "channel_type": "slack",
    "slack_webhook_url": "https://hooks.slack.com/services/...",
    "slack_channel": "#cost-alerts"
  }'

# Test channel
curl -X POST "http://localhost:8000/api/v1/notifications/{org}/channels/{channel_id}/test" \
  -H "X-API-Key: {key}"
```

### Create Alert Rule

```bash
# Cost threshold alert
curl -X POST "http://localhost:8000/api/v1/notifications/{org}/rules" \
  -H "X-API-Key: {key}" -H "Content-Type: application/json" \
  -d '{
    "name": "Daily Cloud Spend Alert",
    "rule_category": "cost",
    "rule_type": "absolute_threshold",
    "priority": "high",
    "conditions": {"threshold": 5000, "period": "daily"},
    "provider_filter": ["gcp", "aws"],
    "notify_channel_ids": ["{channel_id}"],
    "cooldown_minutes": 1440
  }'
```

### Create Cost Alert from Preset

```bash
# List presets
curl -s "http://localhost:8000/api/v1/cost-alerts/{org}/presets" \
  -H "X-API-Key: {key}" | python3 -m json.tool

# Create from preset
curl -X POST "http://localhost:8000/api/v1/cost-alerts/{org}/from-preset/cloud_5000_critical" \
  -H "X-API-Key: {key}"
```

### Configure Summary Schedule

```bash
curl -X POST "http://localhost:8000/api/v1/notifications/{org}/summaries" \
  -H "X-API-Key: {key}" -H "Content-Type: application/json" \
  -d '{
    "name": "Weekly Cost Summary",
    "summary_type": "weekly",
    "schedule_cron": "0 9 * * 1",
    "schedule_timezone": "America/New_York",
    "notify_channel_ids": ["{channel_id}"],
    "include_sections": ["total_cost", "top_providers", "budget_status", "anomalies"],
    "top_n_items": 5
  }'

# Preview before enabling
curl -X POST "http://localhost:8000/api/v1/notifications/{org}/summaries/{summary_id}/preview" \
  -H "X-API-Key: {key}"

# Send immediately
curl -X POST "http://localhost:8000/api/v1/notifications/{org}/summaries/{summary_id}/send-now" \
  -H "X-API-Key: {key}"
```

### View History & Stats

```bash
# Notification history
curl -s "http://localhost:8000/api/v1/notifications/{org}/history" \
  -H "X-API-Key: {key}" | python3 -m json.tool

# Alert history
curl -s "http://localhost:8000/api/v1/notifications/{org}/alert-history" \
  -H "X-API-Key: {key}" | python3 -m json.tool

# Stats
curl -s "http://localhost:8000/api/v1/notifications/{org}/stats" \
  -H "X-API-Key: {key}" | python3 -m json.tool
```

### Acknowledge Alert

```bash
curl -X POST "http://localhost:8000/api/v1/notifications/{org}/history/{notification_id}/acknowledge" \
  -H "X-API-Key: {key}"
```

### Daily Alert Processing (Scheduler Job)

```bash
cd 05-scheduler-jobs/scripts

# Stage
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json
./run-job.sh stage alerts

# Prod
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-prod.json
echo "yes" | ./run-job.sh prod alerts
```

## Alert Processing Flow

```
Scheduler (08:00 UTC daily)
        │
        ▼
POST /admin/alerts/process-all
        │
        ▼
For each active org:
├─ Fetch org_notification_rules (is_active=true)
├─ For each rule:
│   ├─ Evaluate conditions against current costs
│   ├─ Check cooldown (skip if within cooldown_minutes)
│   ├─ Check quiet hours (skip if in quiet_hours range)
│   └─ If triggered:
│       ├─ Send to notify_channel_ids (email/Slack/webhook)
│       ├─ Record in org_notification_history
│       ├─ Check escalation (escalate_after_mins)
│       └─ Update trigger_count_today
└─ Record org_alert_history
```

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Alert not triggering | Rule is_active=false | Enable rule via PUT or /resume |
| Alert triggers too often | Cooldown too short | Increase `cooldown_minutes` |
| Slack notification fails | Webhook URL invalid/expired | Re-create Slack webhook, update channel |
| Email not delivered | No email recipients configured | Add recipients to channel |
| "0 orgs processed" in alert job | No active alert rules | Create rules via /notifications API |
| Alert during quiet hours | quiet_hours blocking | Adjust quiet_hours_start/end or timezone |
| Duplicate notifications | Batch window too small | Increase `batch_window_minutes` |
| History shows "failed" | Channel delivery error | Check error_message in history, fix channel config |
| Cost alert preset missing | Org doesn't exist or no data | Verify org exists and has cost data |

## Bug Fixes & Verified Learnings (2026-02-14)

| Bug ID | Issue | Fix |
|--------|-------|-----|
| BUG-ADMIN-01 | Alert processing in `admin.py` used `BillingPeriodStart` instead of `ChargePeriodStart` | Changed both cost query (line 2062-2063) and budget JOIN (line 2100-2101) to `ChargePeriodStart` to match all other cost queries across the system |
| BUG-ALERTS-01 | `cost_alerts.py` missing `validate_org_slug()` on all 10 endpoints | Added `validate_org_slug(org_slug)` as first validation call in all endpoints |
| BUG-NOTIF-01 | `NotificationChannelUpdate` extended `BaseModel` bypassing all validators | Added email, Slack channel, and URL validators directly to the update model |

## Bug Fixes & Verified Learnings (2026-02-12)

| Bug ID | Issue | Fix |
|--------|-------|-----|
| BUG-22 | Obsolete `cloudact-stage` GCP project in scheduler jobs | Removed from all 5 scheduler job scripts |
| BUG-23 | `alerts_daily.py` treated 404 as success (silent failure) | Changed to `exit(1)` on 404 response |
| BUG-27 | SQL f-string LIMIT in chat `alerts.py` (injection risk) | Parameterized via query parameters |
| BUG-28 | `create_alert` chat tool missing hierarchy fields | Added `hierarchy_entity_id` and `hierarchy_path` to create_alert |
| BUG-03 | `delete_org_alert` returned 200 instead of 204 | Changed to 204 No Content |
| BUG-04/05/06 | Scheduled alert proxy endpoints missing `org_slug` filter | Added org_slug filtering to prevent cross-tenant data leaks |
| BUG-16/17 | Threshold/period falsy-value bug (`or` vs `is not None`) | Changed `value or default` to `value if value is not None else default` for threshold and period fields |

**Schema changes (2026-02-12):**
- `org_scheduled_alerts`: Added `hierarchy_entity_id` (STRING) and `hierarchy_path` (STRING) fields
- `org_notification_channels`: Added `updated_by` (STRING) field
- `org_notification_summaries`: Added `updated_by` (STRING) field
- AlertManager agent instruction updated with hierarchy documentation for `create_alert` tool

## Testing

### Channel CRUD

```bash
# Create email channel
curl -X POST "http://localhost:8000/api/v1/notifications/{org}/channels" \
  -H "X-API-Key: {key}" -H "Content-Type: application/json" \
  -d '{"name": "Test", "channel_type": "email", "email_recipients": ["test@test.com"]}'
# Expected: 201 Created with channel_id

# Test channel
curl -X POST "http://localhost:8000/api/v1/notifications/{org}/channels/{id}/test" \
  -H "X-API-Key: {key}"
# Expected: 200 OK

# Delete channel
curl -X DELETE "http://localhost:8000/api/v1/notifications/{org}/channels/{id}" \
  -H "X-API-Key: {key}"
# Expected: 200 OK
```

### Rule CRUD

```bash
# Create rule
curl -X POST "http://localhost:8000/api/v1/notifications/{org}/rules" \
  -H "X-API-Key: {key}" -H "Content-Type: application/json" \
  -d '{"name": "Test Rule", "rule_category": "cost", "rule_type": "absolute_threshold", "priority": "medium", "conditions": {"threshold": 100}}'
# Expected: 201 Created

# Pause/Resume
curl -X POST "http://localhost:8000/api/v1/notifications/{org}/rules/{id}/pause" -H "X-API-Key: {key}"
curl -X POST "http://localhost:8000/api/v1/notifications/{org}/rules/{id}/resume" -H "X-API-Key: {key}"
```

### Multi-Environment

```bash
# Stage
curl -s "https://cloudact-api-service-test-*.a.run.app/api/v1/notifications/{org}/channels" \
  -H "X-API-Key: {key}"

# Prod
curl -s "https://api.cloudact.ai/api/v1/notifications/{org}/channels" \
  -H "X-API-Key: {key}"
```

## Budget-Aware Alerts

Alert rules can trigger on budget thresholds using these rule types:

| Rule Type | Description | Conditions JSON |
|-----------|-------------|-----------------|
| `budget_percent` | Alert when spend reaches % of budget | `{"threshold_percent": 80, "category": "cloud"}` |
| `budget_forecast` | Alert when forecast exceeds budget | `{"forecast_days": 30, "confidence": 0.8}` |
| `hierarchy_budget` | Alert when hierarchy entity exceeds budget | `{"hierarchy_entity_id": "DEPT-ENG", "threshold_percent": 90}` |

**Budget tables referenced by alerts:**
- `org_budgets` (21 fields) — budget_amount, category, hierarchy_entity_id, period_start, period_end
- `org_budget_allocations` (8 fields) — parent-child budget relationships

**Shared filter system:** Both budget and alert pages use the same `useAdvancedFilters()` hook and `AdvancedFilterBar` component. See `/advanced-filters` skill.

## 5 Implementation Pillars

| Pillar | How Notifications Handles It |
|--------|-------------------------------|
| **i18n** | Alert amounts formatted with org's `default_currency` via `formatCost()`; alert timestamps respect org timezone; notification templates locale-aware |
| **Enterprise** | Multi-channel delivery (email, Slack, webhook); scheduled summaries; alert rule engine with threshold evaluation; audit trail for all notifications sent |
| **Cross-Service** | Alert rules stored in BigQuery; evaluated by scheduler job (8001); managed via API (8000); displayed in Frontend (3000); chat agent has 4 alert MCP tools |
| **Multi-Tenancy** | All alert rules, channels, and notifications scoped by `org_slug`; `validate_org_slug()` on all endpoints; no cross-org alert leakage |
| **Reusability** | Shared `AdvancedFilterBar` for alert pages; reusable alert channel CRUD; shared notification templates; `useAdvancedFilters()` hook for filter state |

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/scheduler-jobs` | `alerts_daily.py` processes alerts at 08:00 UTC |
| `/chat` | AlertManager agent uses 4 alert MCP tools |
| `/cost-analysis` | Cost data drives alert threshold evaluation |
| `/quota-mgmt` | Quota warnings can trigger notifications |
| `/integration-setup` | Credential expiry alerts |
| `/budget-planning` | Budget threshold alerts use org_budgets data. BudgetManager + AlertManager in chat. |
| `/advanced-filters` | Shared filter hook and component across budgets and alerts pages |
| `/demo-setup` | Demo data includes 2 alert rules + 1 email channel for testing |

## Source Specifications

Requirements consolidated from:
- `02-api-service/src/app/routers/notifications.py` - 34 endpoints
- `02-api-service/src/app/routers/cost_alerts.py` - 12 endpoints
- `02-api-service/configs/setup/bootstrap/schemas/org_notification_rules.json` - 29 fields
- `02-api-service/configs/setup/bootstrap/schemas/org_notification_channels.json` - 22 fields
- `02-api-service/configs/setup/bootstrap/schemas/org_notification_history.json` - 21 fields
- `02-api-service/configs/setup/bootstrap/schemas/org_notification_summaries.json`
- `02-api-service/configs/setup/bootstrap/schemas/org_scheduled_alerts.json`
- `02-api-service/configs/setup/bootstrap/schemas/org_alert_history.json`
- `05-scheduler-jobs/jobs/daily/alerts_daily.py` - Daily processor
- `07-org-chat-backend/src/core/tools/alerts.py` - Chat AlertManager tools (4)
- `07-org-chat-backend/src/core/tools/budgets.py` - Chat BudgetManager tools (4)
