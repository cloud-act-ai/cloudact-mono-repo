# Notifications & Alerts - Test Plan

## Test Matrix

| Test ID | Category | Test | Expected | Environment |
|---------|----------|------|----------|-------------|
| NF-T001 | Channel | Create email channel | 201 with channel_id | local/stage |
| NF-T002 | Channel | Create Slack channel | 201 with channel_id | local/stage |
| NF-T003 | Channel | Create webhook channel | 201 with channel_id | local/stage |
| NF-T004 | Channel | Test email channel | 200, test notification sent | local/stage |
| NF-T005 | Channel | Delete channel | 200, channel removed | local/stage |
| NF-T006 | Channel | List channels | Array of channels with types | local/stage |
| NF-T007 | Rule | Create cost threshold rule | 201 with rule_id | local/stage |
| NF-T008 | Rule | Create pipeline failure rule | 201 with rule_id | local/stage |
| NF-T009 | Rule | Pause rule | 200, is_active=false | local/stage |
| NF-T010 | Rule | Resume rule | 200, is_active=true | local/stage |
| NF-T011 | Rule | Test rule (evaluate conditions) | 200, evaluation result | local/stage |
| NF-T012 | Rule | Delete rule | 200, rule removed | local/stage |
| NF-T013 | Summary | Create weekly summary | 201 with summary_id | local/stage |
| NF-T014 | Summary | Preview summary | 200, rendered content | local/stage |
| NF-T015 | Summary | Send summary now | 200, delivery initiated | local/stage |
| NF-T016 | History | List notification history | Array of delivery records | local/stage |
| NF-T017 | History | Acknowledge notification | 200, acknowledged_at set | local/stage |
| NF-T018 | Stats | Get notification stats | 200, count by type/status | local/stage |
| NF-T019 | Cost Alert | Create from preset (cloud_5000_critical) | 201 with alert | local/stage |
| NF-T020 | Cost Alert | Enable/Disable alert | 200, is_enabled toggled | local/stage |
| NF-T021 | Cost Alert | Bulk enable | 200, multiple alerts enabled | local/stage |
| NF-T022 | Cost Alert | List presets | Array of 5 presets | local/stage |
| NF-T023 | Daily Job | Run alerts on stage | Job completes, history recorded | stage |
| NF-T024 | Daily Job | Run alerts with no rules | "0 orgs processed" | stage |
| NF-T025 | Cooldown | Trigger same rule twice within cooldown | Second trigger skipped (COOLDOWN) | local/stage |
| NF-T026 | Quiet Hours | Trigger during quiet hours | Alert skipped | local/stage |
| NF-T027 | Chat | list_alerts via chat | Returns active rules | local |
| NF-T028 | Chat | create_alert via chat | Rule created in BQ | local |
| NF-T029 | E2E | Channel → Rule → Job → History | Full flow completes | stage |
| NF-T030 | Multi-Env | Same endpoints work on prod | 200 responses | prod |

## Test Procedures

### NF-T001: Create Email Channel

```bash
curl -X POST "http://localhost:8000/api/v1/notifications/{org}/channels" \
  -H "X-API-Key: {key}" -H "Content-Type: application/json" \
  -d '{
    "name": "Test Email",
    "channel_type": "email",
    "email_recipients": ["test@example.com"],
    "is_default": true
  }'
# Expected: 201 Created
# Response: { "channel_id": "uuid", "name": "Test Email", "channel_type": "email", ... }
```

### NF-T007: Create Cost Threshold Rule

```bash
curl -X POST "http://localhost:8000/api/v1/notifications/{org}/rules" \
  -H "X-API-Key: {key}" -H "Content-Type: application/json" \
  -d '{
    "name": "Cloud Spend > $5K",
    "rule_category": "cost",
    "rule_type": "absolute_threshold",
    "priority": "high",
    "conditions": {"threshold": 5000, "period": "daily"},
    "provider_filter": ["gcp", "aws"],
    "notify_channel_ids": ["{channel_id}"],
    "cooldown_minutes": 1440
  }'
# Expected: 201 Created
```

### NF-T019: Create From Preset

```bash
# List presets
curl -s "http://localhost:8000/api/v1/cost-alerts/{org}/presets" \
  -H "X-API-Key: {key}" | python3 -m json.tool
# Expected: 5 presets

# Create from preset
curl -X POST "http://localhost:8000/api/v1/cost-alerts/{org}/from-preset/cloud_5000_critical" \
  -H "X-API-Key: {key}"
# Expected: 201 Created with alert details
```

### NF-T023: Daily Alert Job (Stage)

```bash
cd 05-scheduler-jobs/scripts
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json
./run-job.sh stage alerts
# Expected: Job starts, completes within 60s

# Verify execution
gcloud run jobs executions list --job=cloudact-daily-alerts \
  --region=us-central1 --project=cloudact-testing-1 --limit=1
# Expected: Status = Succeeded
```

### NF-T029: E2E Full Flow

```bash
ORG="{org_slug}"
KEY="{api_key}"
BASE="http://localhost:8000/api/v1"

# 1. Create channel
CHANNEL_ID=$(curl -s -X POST "$BASE/notifications/$ORG/channels" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"name":"E2E Test","channel_type":"email","email_recipients":["test@test.com"]}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['channel_id'])")

# 2. Create rule
RULE_ID=$(curl -s -X POST "$BASE/notifications/$ORG/rules" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d "{\"name\":\"E2E Rule\",\"rule_category\":\"cost\",\"rule_type\":\"absolute_threshold\",\"priority\":\"medium\",\"conditions\":{\"threshold\":1},\"notify_channel_ids\":[\"$CHANNEL_ID\"]}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['rule_id'])")

# 3. Verify rule exists
curl -s "$BASE/notifications/$ORG/rules/$RULE_ID" -H "X-API-Key: $KEY" | python3 -m json.tool

# 4. Check history
curl -s "$BASE/notifications/$ORG/history" -H "X-API-Key: $KEY" | python3 -m json.tool

# 5. Cleanup
curl -X DELETE "$BASE/notifications/$ORG/rules/$RULE_ID" -H "X-API-Key: $KEY"
curl -X DELETE "$BASE/notifications/$ORG/channels/$CHANNEL_ID" -H "X-API-Key: $KEY"
```

### Multi-Environment Testing

```bash
# Stage
curl -s "https://cloudact-api-service-test-*.a.run.app/api/v1/notifications/{org}/channels" \
  -H "X-API-Key: {key}"

# Prod
curl -s "https://api.cloudact.ai/api/v1/notifications/{org}/channels" \
  -H "X-API-Key: {key}"
```

## Coverage by Requirement

| Requirement | Test IDs |
|-------------|----------|
| FR-NF-001 (Channels) | NF-T001, NF-T002, NF-T003, NF-T004, NF-T005, NF-T006 |
| FR-NF-002 (Rules) | NF-T007, NF-T008, NF-T009, NF-T010, NF-T011, NF-T012 |
| FR-NF-003 (Summaries) | NF-T013, NF-T014, NF-T015 |
| FR-NF-004 (Cost Alerts) | NF-T019, NF-T020, NF-T021, NF-T022 |
| FR-NF-005 (History) | NF-T016, NF-T017, NF-T018 |
| FR-NF-006 (Daily Job) | NF-T023, NF-T024 |
| FR-NF-007 (Chat) | NF-T027, NF-T028 |
| NFR (Cooldown/Quiet) | NF-T025, NF-T026 |
| E2E | NF-T029, NF-T030 |
