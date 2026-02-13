# Bootstrap & Onboarding - Test Plan

## API Tests

Bootstrap and organization onboarding validation via API endpoints:
- **Bootstrap Router:** `02-api-service/src/app/routers/admin.py`
- **Org Router:** `02-api-service/src/app/routers/organizations.py`
- **Run:** `cd 02-api-service && python -m pytest tests/test_bootstrap.py tests/test_organizations.py -v`

### Test Matrix (30 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | POST /admin/bootstrap creates organizations dataset | API | 200 with dataset created |
| 2 | POST /admin/bootstrap creates all 27 meta tables | API | 27 tables created in organizations dataset |
| 3 | Bootstrap without X-CA-Root-Key | Auth | 401 Unauthorized |
| 4 | Bootstrap with invalid root key | Auth | 401 Invalid root key |
| 5 | Bootstrap idempotent (re-run safe) | API | 200 with "already exists" for each table |
| 6 | GET /admin/bootstrap/status returns SYNCED | API | `status: SYNCED` when all tables match config |
| 7 | GET /admin/bootstrap/status returns OUT_OF_SYNC | API | `missing_columns` listed when schema changed |
| 8 | POST /admin/bootstrap/sync adds missing tables | API | New tables created, existing untouched |
| 9 | POST /admin/bootstrap/sync adds missing columns | API | New columns added, no data loss |
| 10 | Sync never deletes existing columns | Safety | Extra columns remain (harmless) |
| 11 | POST /organizations/dryrun validates inputs | API | Validation errors returned without creating org |
| 12 | POST /organizations/onboard creates org dataset | API | `{org_slug}_prod` dataset created |
| 13 | POST /organizations/onboard creates 20+ org tables | API | All org-specific tables created |
| 14 | POST /organizations/onboard creates 4 materialized views | API | x_pipeline_exec_logs, x_all_notifications, x_notification_stats, x_org_hierarchy |
| 15 | Onboard creates org_profiles entry | API | Row in organizations.org_profiles |
| 16 | Onboard generates API key | API | API key returned (format: `{org_slug}_api_{random_16}`) |
| 17 | API key stored as SHA256 hash | Security | Only hash in org_api_keys, not plaintext |
| 18 | API key KMS-encrypted for admin recovery | Security | `encrypted_value` populated in org_api_keys |
| 19 | Onboard creates subscription record | API | Row in org_subscriptions with plan info |
| 20 | Org slug validation: `^[a-z0-9_]{3,50}$` | Validation | Invalid slugs rejected (hyphens, spaces, <3 chars) |
| 21 | Duplicate org slug rejected | API | 409 Conflict on duplicate onboard |
| 22 | GET /organizations/{org}/status returns SYNCED | API | All tables/views present |
| 23 | GET /organizations/{org}/status returns PROFILE_ONLY | API | Dataset deleted but profile exists |
| 24 | GET /organizations/{org}/status returns NOT_FOUND | API | Org never onboarded |
| 25 | POST /organizations/{org}/sync recreates deleted dataset | API | Dataset + tables + views restored |
| 26 | POST /organizations/{org}/sync with recreate_views | API | Materialized views refreshed |
| 27 | Multi-currency onboard (USD, EUR, INR) | API | `default_currency` stored correctly |
| 28 | Subscription plan limits match spec | API | Starter: 2 seats/3 providers, Pro: 6/6, Scale: 11/10 |
| 29 | Org-sync-all job syncs all active orgs | Scheduler | All orgs show SYNCED after run |
| 30 | x_org_hierarchy view auto-refreshes | View | Pre-filtered hierarchy per org, 15-min refresh |

## Backend Tests

### Unit Tests (02-api-service)

```bash
cd 02-api-service
source venv/bin/activate

# Bootstrap tests
python -m pytest tests/test_bootstrap.py -v

# Organization tests
python -m pytest tests/test_organizations.py -v

# All together
python -m pytest tests/test_bootstrap.py tests/test_organizations.py -v
```

| Domain | File | Tests |
|--------|------|-------|
| Bootstrap | `tests/test_bootstrap.py` | 27 meta table creation, idempotency, status, sync |
| Organizations | `tests/test_organizations.py` | Onboard, dryrun, status, sync, slug validation |
| Security | `tests/test_security.py` | Auth checks on admin and org endpoints |
| Validation | `tests/test_validation.py` | Org slug, email, plan validation |

### Schema Validation

```bash
# Verify all 20 bootstrap schemas exist
ls 02-api-service/configs/setup/bootstrap/schemas/*.json | wc -l
# Expected: 20

# Verify all org onboarding schemas exist
ls 02-api-service/configs/setup/organizations/onboarding/schemas/*.json | wc -l
# Expected: 20+

# Validate JSON schema syntax
python -c "import json, glob; [json.load(open(f)) for f in glob.glob('02-api-service/configs/setup/bootstrap/schemas/*.json')]"
python -c "import json, glob; [json.load(open(f)) for f in glob.glob('02-api-service/configs/setup/organizations/onboarding/schemas/*.json')]"
```

### Scheduler Job Tests

```bash
cd 05-scheduler-jobs/scripts

# Bootstrap (creates organizations dataset + 27 meta tables)
./run-job.sh stage bootstrap

# Bootstrap sync (adds new columns to existing tables)
./run-job.sh stage bootstrap-sync

# Org sync all (syncs ALL org datasets)
./run-job.sh stage org-sync-all
```

| Job | Purpose | Verification |
|-----|---------|-------------|
| `bootstrap` | Create organizations dataset + 27 tables | `GET /admin/bootstrap/status` returns SYNCED |
| `bootstrap-sync` | Add new columns to existing tables | No missing_columns in status |
| `org-sync-all` | Sync all org datasets | All orgs return SYNCED |

### Integration Tests

| Test | Command | Expected |
|------|---------|----------|
| Bootstrap | `curl -X POST http://localhost:8000/api/v1/admin/bootstrap -H "X-CA-Root-Key: $KEY"` | 200 with 27 tables created |
| Bootstrap status | `curl http://localhost:8000/api/v1/admin/bootstrap/status -H "X-CA-Root-Key: $KEY"` | `status: SYNCED` |
| Dryrun onboard | `curl -X POST http://localhost:8000/api/v1/organizations/dryrun -H "X-CA-Root-Key: $KEY" -d '{"org_slug":"test_org",...}'` | Validation result (no side effects) |
| Onboard org | `curl -X POST http://localhost:8000/api/v1/organizations/onboard -H "X-CA-Root-Key: $KEY" -d '{"org_slug":"test_org",...}'` | 200 with API key + dataset created |
| Org status | `curl http://localhost:8000/api/v1/organizations/test_org/status -H "X-CA-Root-Key: $KEY"` | `status: SYNCED` |
| Org sync | `curl -X POST http://localhost:8000/api/v1/organizations/test_org/sync -H "X-CA-Root-Key: $KEY" -d '{"sync_missing_tables":true}'` | 200 with sync results |

## 27 Meta Tables Checklist

| # | Table | Schema File | Verified |
|---|-------|-------------|----------|
| 1 | org_profiles | `org_profiles.json` | [ ] |
| 2 | org_api_keys | `org_api_keys.json` | [ ] |
| 3 | org_subscriptions | `org_subscriptions.json` | [ ] |
| 4 | org_usage_quotas | `org_usage_quotas.json` | [ ] |
| 5 | org_integration_credentials | `org_integration_credentials.json` | [ ] |
| 6 | org_pipeline_configs | `org_pipeline_configs.json` | [ ] |
| 7 | org_scheduled_pipeline_runs | `org_scheduled_pipeline_runs.json` | [ ] |
| 8 | org_pipeline_execution_queue | `org_pipeline_execution_queue.json` | [ ] |
| 9 | org_meta_pipeline_runs | `org_meta_pipeline_runs.json` | [ ] |
| 10 | org_meta_step_logs | `org_meta_step_logs.json` | [ ] |
| 11 | org_meta_state_transitions | `org_meta_state_transitions.json` | [ ] |
| 12 | org_meta_dq_results | `org_meta_dq_results.json` | [ ] |
| 13 | org_audit_logs | `org_audit_logs.json` | [ ] |
| 14 | org_cost_tracking | `org_cost_tracking.json` | [ ] |
| 15 | org_idempotency_keys | `org_idempotency_keys.json` | [ ] |
| 16 | org_notification_channels | `org_notification_channels.json` | [ ] |
| 17 | org_notification_rules | `org_notification_rules.json` | [ ] |
| 18 | org_notification_summaries | `org_notification_summaries.json` | [ ] |
| 19 | org_notification_history | `org_notification_history.json` | [ ] |
| 20 | org_hierarchy | `org_hierarchy.json` | [ ] |

## Manual Verification Checklist

| Check | How | Expected |
|-------|-----|----------|
| Bootstrap creates 27 tables | Run bootstrap, count tables in organizations dataset | 27 tables |
| Bootstrap is idempotent | Run bootstrap twice | Second run returns "already exists" |
| Status shows SYNCED | GET /admin/bootstrap/status | `status: SYNCED` |
| Schema sync adds column | Add column to JSON, run sync | Column added, no data loss |
| Onboard creates dataset | Onboard org, check BigQuery | `{org_slug}_prod` dataset exists |
| Onboard returns API key | Check onboard response | API key in `{org_slug}_api_{random}` format |
| API key only shown once | Try to retrieve API key after creation | Not retrievable |
| Dryrun has no side effects | Run dryrun, check BigQuery | No dataset or rows created |
| Duplicate slug rejected | Onboard same org_slug twice | 409 Conflict |
| PROFILE_ONLY detected | Delete org dataset, check status | `status: PROFILE_ONLY` |
| Sync recreates dataset | Run sync on PROFILE_ONLY org | Dataset + tables + views restored |
| Materialized views created | Check `{org_slug}_prod` for x_ views | 4 views present |
| x_org_hierarchy filtered | Query view for org | Only org's hierarchy rows |
| Org-sync-all job | Run job, check all org statuses | All SYNCED |
| Plan limits stored | Onboard with Starter plan | seats=2, providers=3 in org_subscriptions |

## Pass Criteria

| Criteria | Target |
|----------|--------|
| Bootstrap unit tests | 100% passing |
| Organization unit tests | 100% passing |
| 27 meta tables created | 27/27 |
| Bootstrap idempotency | Re-run produces no errors |
| Schema sync (no data loss) | 0 columns or rows deleted |
| Org dataset creation | Dataset + 20+ tables + 4 views |
| API key security | SHA256 hashed, KMS encrypted, shown once |
| Org slug validation | All invalid patterns rejected |
| Cross-org isolation | 0 cross-org data access |
| Status accuracy | Correct status for all 6 states (SYNCED, OUT_OF_SYNC, NOT_BOOTSTRAPPED, PROFILE_ONLY, NOT_FOUND) |

## Known Limitations

1. **Schema evolution is additive only**: Columns removed from JSON schemas remain in BigQuery as "extra_columns"; this is by design to prevent data loss but may accumulate unused columns over time
2. **force_recreate flags**: The `force_recreate_tables` and `force_recreate_views` flags exist but should NEVER be used in production as they delete all data; no test coverage for destructive operations
3. **BigQuery dataset creation latency**: Dataset creation in BigQuery may take a few seconds; integration tests may need short delays after onboard before checking status
4. **Materialized view refresh**: x_org_hierarchy auto-refreshes every 15 minutes; freshly created hierarchy entries may not appear in the view immediately
5. **Org slug generation**: Slugs are `{company}_{base36_timestamp}` at signup; in direct API onboarding, the slug is provided explicitly (no auto-generation)
6. **KMS key availability**: API key generation requires GCP KMS access; tests in CI mock the KMS client
7. **Meta table count**: The correct count is 27 meta tables (23 core + 4 chat); verify with schema file count in `config.yml`
