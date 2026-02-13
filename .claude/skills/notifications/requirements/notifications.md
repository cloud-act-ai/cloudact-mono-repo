# Notifications & Alerts - Requirements

## Overview

Full notification lifecycle: channels (email/Slack/webhook), alert rules (cost/pipeline/system), scheduled summaries (daily/weekly/monthly), delivery tracking, and daily automated alert processing. 46 API endpoints, 6 BigQuery tables, chat integration.

## Source Specifications

- `02-api-service/src/app/routers/notifications.py` - Main notification router
- `02-api-service/src/app/routers/cost_alerts.py` - Cost alert router
- `05-scheduler-jobs/jobs/daily/alerts_daily.py` - Daily alert processor
- `07-org-chat-backend/src/core/tools/alerts.py` - Chat alert tools

## Architecture

```
Scheduler (08:00 UTC)                API Service (8000)                    BigQuery
─────────────────────               ─────────────────                    ────────
alerts_daily.py                     /notifications/{org}/                 6 tables:
POST /admin/alerts/process-all      ├─ channels    (CRUD + test)          ├─ org_notification_channels
        │                           ├─ rules       (CRUD + pause/resume)  ├─ org_notification_rules
        ▼                           ├─ summaries   (CRUD + preview/send)  ├─ org_notification_summaries
For each org:                       ├─ history     (list + acknowledge)   ├─ org_notification_history
├─ Fetch active rules               ├─ org-alerts  (CRUD + enable/disable)├─ org_scheduled_alerts
├─ Evaluate conditions              └─ stats                              └─ org_alert_history
├─ Check cooldown + quiet hours
├─ Send notifications               /cost-alerts/{org}/
└─ Record history                   ├─ CRUD (5)
                                    ├─ Enable/Disable (2)
Frontend                            ├─ Bulk ops (2)
/{orgSlug}/notifications             └─ Presets (2)
├─ Channel management
├─ Rule builder                     Chat Backend (8002)
├─ Summary config                   ├─ list_alerts
├─ History viewer                   ├─ create_alert
└─ Stats dashboard                  ├─ alert_history
                                    └─ acknowledge_alert
```

## Functional Requirements

### FR-NF-001: Notification Channels

| ID | Requirement |
|----|-------------|
| FR-NF-001.1 | CRUD for notification channels (email, slack, webhook) |
| FR-NF-001.2 | Email channels: recipients[], cc_recipients[] |
| FR-NF-001.3 | Slack channels: webhook_url (encrypted), channel, mention_users[] |
| FR-NF-001.4 | Webhook channels: url (encrypted), headers (encrypted) |
| FR-NF-001.5 | Test channel endpoint sends test notification |
| FR-NF-001.6 | Default channel per org (is_default flag) |
| FR-NF-001.7 | Active/inactive toggle (is_active flag) |

### FR-NF-002: Alert Rules

| ID | Requirement |
|----|-------------|
| FR-NF-002.1 | CRUD for alert rules with 5 categories (cost, pipeline, integration, subscription, system) |
| FR-NF-002.2 | Rule types: budget_percent, absolute_threshold, anomaly, pipeline_failure, credential_expiry |
| FR-NF-002.3 | Priority levels: critical, high, medium, low, info |
| FR-NF-002.4 | Conditions as JSON (flexible per rule_type) |
| FR-NF-002.5 | Provider/service filters to scope alerts |
| FR-NF-002.6 | Hierarchy entity/path filters for cost allocation scoping |
| FR-NF-002.7 | Cooldown (minutes) to prevent alert storms |
| FR-NF-002.8 | Quiet hours (start/end/timezone) for off-hours suppression |
| FR-NF-002.9 | Escalation: escalate_to_channel_ids after escalate_after_mins |
| FR-NF-002.10 | Batch window for grouping multiple triggers |
| FR-NF-002.11 | Pause/Resume endpoints (vs delete) |
| FR-NF-002.12 | Test rule endpoint evaluates conditions without sending |

### FR-NF-003: Scheduled Summaries

| ID | Requirement |
|----|-------------|
| FR-NF-003.1 | Summary types: daily, weekly, monthly |
| FR-NF-003.2 | Configurable sections: total_cost, top_providers, budget_status, forecast, anomalies |
| FR-NF-003.3 | Schedule via cron expression with timezone |
| FR-NF-003.4 | Preview endpoint shows summary content without sending |
| FR-NF-003.5 | Send-now endpoint for immediate delivery |
| FR-NF-003.6 | Configurable top_n_items and currency_display |

### FR-NF-004: Cost Alerts (Simplified API)

| ID | Requirement |
|----|-------------|
| FR-NF-004.1 | CRUD for cost alerts (simplified subset of full rules) |
| FR-NF-004.2 | Scopes: all, cloud, genai, openai, anthropic, subscription |
| FR-NF-004.3 | Enable/Disable individual and bulk operations |
| FR-NF-004.4 | 5 built-in presets (cloud_1000, cloud_5000_critical, genai_500, openai_200, total_2500) |
| FR-NF-004.5 | Create-from-preset endpoint for quick setup |

### FR-NF-005: Notification History

| ID | Requirement |
|----|-------------|
| FR-NF-005.1 | Track delivery status: queued → sent → delivered / failed |
| FR-NF-005.2 | Record error_message on failure |
| FR-NF-005.3 | Retry count tracking |
| FR-NF-005.4 | Acknowledge endpoint with acknowledged_at/acknowledged_by |
| FR-NF-005.5 | Escalation tracking (escalated flag + timestamp) |

### FR-NF-006: Alert Processing (Daily Job)

| ID | Requirement |
|----|-------------|
| FR-NF-006.1 | Run daily at 08:00 UTC via Cloud Scheduler |
| FR-NF-006.2 | Process all active orgs with active rules |
| FR-NF-006.3 | Evaluate cost conditions against BigQuery data |
| FR-NF-006.4 | Respect cooldown_minutes between triggers |
| FR-NF-006.5 | Respect quiet_hours_start/end/timezone |
| FR-NF-006.6 | Record results in org_alert_history (SENT/FAILED/COOLDOWN/NO_MATCH) |

### FR-NF-007: Chat Integration

| ID | Requirement |
|----|-------------|
| FR-NF-007.1 | `list_alerts` tool: query org_notification_rules by status |
| FR-NF-007.2 | `create_alert` tool: create cost threshold rule with name, threshold, provider, priority |
| FR-NF-007.3 | `alert_history` tool: query org_alert_history with date range and limit |
| FR-NF-007.4 | `acknowledge_alert` tool: mark alert as acknowledged |

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-NF-001 | Slack webhook URLs encrypted via GCP KMS |
| NFR-NF-002 | Webhook URLs and headers encrypted via GCP KMS |
| NFR-NF-003 | Alert processing completes within 5 minutes for all orgs |
| NFR-NF-004 | Idempotent: re-running alert processing respects cooldown |
| NFR-NF-005 | History retention: 90 days (aligned with quota cleanup) |
| NFR-NF-006 | Multi-tenant isolation: all queries scoped by org_slug |

## SDLC

### Development Workflow

1. Modify notification router in `02-api-service/src/app/routers/notifications.py`
2. Test endpoints via curl or Swagger UI at `/docs`
3. Verify BigQuery table writes
4. Test daily alert job on stage: `./run-job.sh stage alerts`

### Testing Approach

- **Unit:** API endpoint validation (request/response schemas)
- **Integration:** Channel CRUD → Rule CRUD → trigger → history verification
- **E2E:** Create channel + rule → run alert job → verify notification delivered + history recorded

### Deployment

- Notification endpoints: auto-deployed with API service
- Alert processing: Cloud Run Job `cloudact-daily-alerts` (08:00 UTC)
- Chat tools: auto-deployed with chat backend service

## Key Files

| File | Purpose |
|------|---------|
| `02-api-service/src/app/routers/notifications.py` | 34 notification endpoints |
| `02-api-service/src/app/routers/cost_alerts.py` | 12 cost alert endpoints |
| `02-api-service/configs/setup/bootstrap/schemas/org_notification_channels.json` | Channel schema |
| `02-api-service/configs/setup/bootstrap/schemas/org_notification_rules.json` | Rule schema |
| `02-api-service/configs/setup/bootstrap/schemas/org_notification_summaries.json` | Summary schema |
| `02-api-service/configs/setup/bootstrap/schemas/org_notification_history.json` | History schema |
| `02-api-service/configs/setup/bootstrap/schemas/org_scheduled_alerts.json` | Scheduled alert schema |
| `02-api-service/configs/setup/bootstrap/schemas/org_alert_history.json` | Alert history schema |
| `01-fronted-system/app/[orgSlug]/notifications/page.tsx` | Frontend notifications page |
| `01-fronted-system/actions/notifications.ts` | Server actions |
| `05-scheduler-jobs/jobs/daily/alerts_daily.py` | Daily alert processor |
| `07-org-chat-backend/src/core/tools/alerts.py` | 4 chat alert tools |

## Related Skills

`/scheduler-jobs` `/chat` `/cost-analysis` `/quota-mgmt` `/integration-setup` `/security-audit`
