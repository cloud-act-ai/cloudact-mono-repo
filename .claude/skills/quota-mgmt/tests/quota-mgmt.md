# Quota Management - Test Plan

## API Tests

Quota enforcement and usage tracking via API endpoints:
- **Quota Router:** `02-api-service/src/app/routers/quotas.py`
- **Run:** `cd 02-api-service && python -m pytest tests/test_quota.py -v`

### Test Matrix (25 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | GET quota status for valid org | API | 200 with quota array |
| 2 | GET quota status without API key | Auth | 401 Unauthorized |
| 3 | GET quota status with wrong org key | Auth | 401 Invalid API key |
| 4 | Starter plan daily limit = 6 | Unit | `limit_value: 6` for daily pipeline_runs |
| 5 | Professional plan daily limit = 25 | Unit | `limit_value: 25` for daily pipeline_runs |
| 6 | Scale plan daily limit = 100 | Unit | `limit_value: 100` for daily pipeline_runs |
| 7 | Starter plan monthly limit = 180 | Unit | `limit_value: 180` for monthly pipeline_runs |
| 8 | Pipeline run increments usage counter | Unit | `current_usage` increments by 1 |
| 9 | 429 when daily quota exceeded | Enforcement | HTTP 429 Too Many Requests |
| 10 | 429 when monthly quota exceeded | Enforcement | HTTP 429 Too Many Requests |
| 11 | Concurrent pipeline limit enforced | Enforcement | Reject when concurrent > plan max |
| 12 | Quota reset at midnight UTC (daily) | Scheduler | `current_usage` reset to 0 |
| 13 | Quota reset on 1st of month (monthly) | Scheduler | `current_usage` reset to 0 |
| 14 | Stale concurrent counters cleaned up | Scheduler | Stuck counters decremented |
| 15 | Quota records >90 days deleted | Scheduler | Old records purged |
| 16 | 50% usage triggers info log | Alert | Log entry at 50% threshold |
| 17 | 80% usage triggers warning notification | Alert | Warning notification sent |
| 18 | 90% usage triggers email alert | Alert | Email alert dispatched |
| 19 | 100% usage triggers block + critical alert | Alert | Request blocked + critical alert |
| 20 | Manual quota reset with root key | Admin | 200 with reset confirmation |
| 21 | Manual quota reset without root key | Auth | 401 Unauthorized |
| 22 | Org isolation - org A cannot see org B quota | Security | Only own org data returned |
| 23 | Supabase org_quotas table updated | Integration | `org_quotas` row matches BigQuery |
| 24 | Frontend quota page loads | E2E | `/settings/quota-usage` renders cards |
| 25 | Frontend shows correct remaining count | E2E | `remaining = limit - used` displayed |

## Backend Tests

### Unit Tests (02-api-service)

```bash
cd 02-api-service
source venv/bin/activate
python -m pytest tests/test_quota.py -v
```

| Domain | File | Tests |
|--------|------|-------|
| Enforcement | `tests/test_quota.py` | Quota check middleware, increment, block |
| Plans | `tests/test_subscriptions.py` | Plan limits (Starter/Professional/Scale) |
| Validation | `tests/test_validation.py` | Input validation on quota endpoints |
| Security | `tests/test_security.py` | Auth checks on quota endpoints |

### Scheduler Job Tests (05-scheduler-jobs)

```bash
cd 05-scheduler-jobs/scripts

# Daily reset (runs at 00:00 UTC)
./run-job.sh stage quota-reset-daily

# Monthly reset (runs at 00:05 UTC on 1st)
./run-job.sh stage quota-reset-monthly

# Stale cleanup (runs at 02:00 UTC)
./run-job.sh stage stale-cleanup

# Quota cleanup (runs at 01:00 UTC)
./run-job.sh stage quota-cleanup
```

| Job | Schedule | Verification |
|-----|----------|-------------|
| `quota-reset-daily` | 00:00 UTC | `current_usage = 0` for daily quotas |
| `quota-reset-monthly` | 00:05 UTC 1st | `current_usage = 0` for monthly quotas |
| `stale-cleanup` | 02:00 UTC | No concurrent counters older than threshold |
| `quota-cleanup` | 01:00 UTC | No quota records older than 90 days |

### Integration Tests

| Test | Command | Expected |
|------|---------|----------|
| Quota status GET | `curl http://localhost:8000/api/v1/quotas/{org} -H "X-API-Key: ..."` | JSON with quota array |
| Quota update PUT | `curl -X PUT http://localhost:8000/api/v1/quotas/{org} -H "X-CA-Root-Key: ..."` | 200 with updated limit |
| Quota reset POST | `curl -X POST http://localhost:8000/api/v1/quotas/{org}/reset -H "X-CA-Root-Key: ..."` | 200 with reset confirmation |
| Quota exceeded | Run pipelines until limit hit, then try one more | HTTP 429 response |
| Org quota read | `curl http://localhost:8000/api/v1/organizations/{org}/quota -H "X-API-Key: ..."` | Quota summary with plan info |

## Manual Verification Checklist

| Check | How | Expected |
|-------|-----|----------|
| Plan limits match spec | GET quota status, compare to plan table | Starter: 6/180, Pro: 25/750, Scale: 100/3000 |
| Daily reset works | Check usage after midnight UTC | Counters reset to 0 |
| Monthly reset works | Check usage after 1st of month | Counters reset to 0 |
| 429 blocks pipeline run | Exhaust daily quota, run one more pipeline | 429 with quota exceeded message |
| Concurrent limit enforced | Start N+1 simultaneous pipelines (N = plan max) | Last pipeline rejected |
| Alert at 80% threshold | Push usage to 80% of limit | Warning notification in delivery history |
| Quota cleanup runs | Check for records >90 days old | None found after cleanup job |
| Supabase sync | Compare Supabase org_quotas with BigQuery org_usage_quotas | Values match |
| Frontend quota page | Navigate to Settings -> Quota Usage | Progress bars with correct values |
| Cross-org isolation | Query quota with org B's key on org A's endpoint | 401 or empty result |

## Pass Criteria

| Criteria | Target |
|----------|--------|
| Unit tests passing | 100% |
| Quota enforcement (429 on exceed) | 100% correct |
| Daily/monthly reset | 0 stale counters after reset |
| Cross-org data leakage | 0 |
| Alert threshold accuracy | All 4 thresholds (50/80/90/100%) fire correctly |
| Supabase-BigQuery sync | Values match within 1 min |

## Known Limitations

1. **Concurrent counter race condition**: Under extreme load, concurrent counters may briefly exceed plan max before self-healing corrects them (safety net via stale-cleanup job)
2. **Hourly quotas**: API call hourly quotas documented in SKILL.md but actual enforcement uses daily/monthly cycles per plan table in CLAUDE.md
3. **Timezone edge cases**: Daily reset at 00:00 UTC may cause confusion for orgs in non-UTC timezones
4. **Stale cleanup timing**: Self-healing handles most stale counters at validation time; the 02:00 UTC job is a safety net only
5. **BigQuery eventual consistency**: Quota increment via BigQuery UPDATE may have slight delay compared to real-time counters
