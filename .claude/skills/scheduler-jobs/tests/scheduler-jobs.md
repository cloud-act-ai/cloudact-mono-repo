# Scheduler Jobs - Test Plan

## Test Matrix

| Test ID | Category | Test | Expected | Environment |
|---------|----------|------|----------|-------------|
| SJ-T001 | Infrastructure | Create all jobs (stage) | 8 jobs created | stage |
| SJ-T002 | Infrastructure | List jobs (stage) | 8 jobs listed with status | stage |
| SJ-T003 | Infrastructure | Verify schedulers | 5 schedulers active | stage |
| SJ-T004 | Manual | Run bootstrap (stage) | 21+ tables synced | stage |
| SJ-T005 | Manual | Run org-sync-all (stage) | N orgs synced | stage |
| SJ-T006 | Manual | Run migrate (stage) | Migrations applied | stage |
| SJ-T007 | Daily | Run quota-reset (stage) | Daily counters reset | stage |
| SJ-T008 | Daily | Run quota-cleanup (stage) | Old records deleted | stage |
| SJ-T009 | Daily | Run stale-cleanup (stage) | Stale counters fixed | stage |
| SJ-T010 | Daily | Run alerts (stage) | Alerts processed | stage |
| SJ-T011 | Monthly | Run quota-monthly (stage) | Monthly counters reset | stage |
| SJ-T012 | Order | Run out of order (org-sync before bootstrap) | Graceful failure | stage |
| SJ-T013 | Env | Invalid env (local) | Error: invalid env | local |
| SJ-T014 | Env | Prod requires confirmation | Prompts for "yes" | prod |
| SJ-T015 | Idempotent | Run bootstrap twice | Second run syncs (no error) | stage |
| SJ-T016 | Idempotent | Run migrate twice | Second run skips applied | stage |
| SJ-T017 | Auth | Run without credentials | Auth error | stage |
| SJ-T018 | Auth | Run with wrong project | Project mismatch error | stage |
| SJ-T019 | E2E | Full release workflow | migrate → bootstrap → org-sync all pass | stage |
| SJ-T020 | E2E | Verify after release | API healthy, tables synced, orgs present | stage |

## Test Procedures

### SJ-T001: Create All Jobs

```bash
cd 05-scheduler-jobs/scripts
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json
./create-all-jobs.sh stage
```

**Verify:**
```bash
./list-jobs.sh stage
# Expected: 8 jobs listed
#   cloudact-manual-bootstrap
#   cloudact-manual-org-sync-all
#   cloudact-manual-supabase-migrate
#   cloudact-daily-quota-reset
#   cloudact-daily-quota-cleanup
#   cloudact-daily-stale-cleanup
#   cloudact-daily-alerts
#   cloudact-monthly-quota-reset
```

### SJ-T003: Verify Schedulers

```bash
gcloud scheduler jobs list --location=us-central1 --project=cloudact-testing-1
# Expected: 5 schedulers
#   cloudact-daily-quota-reset-trigger       0 0 * * *
#   cloudact-daily-quota-cleanup-trigger     0 1 * * *
#   cloudact-daily-stale-cleanup-trigger     0 2 * * *
#   cloudact-daily-alerts-trigger            0 8 * * *
#   cloudact-monthly-quota-reset-trigger     5 0 1 * *
```

### SJ-T004: Bootstrap

```bash
./run-job.sh stage bootstrap
# Expected: Execution starts, completes within 60s
# Check execution:
gcloud run jobs executions list --job=cloudact-manual-bootstrap \
  --region=us-central1 --project=cloudact-testing-1 --limit=1
# Expected: Status = Succeeded
```

### SJ-T019: Full Release Workflow (E2E)

```bash
cd 05-scheduler-jobs/scripts

# Activate stage credentials
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json

# Step 1: Migrate
./run-job.sh stage migrate
# Wait for completion...

# Step 2: Bootstrap
./run-job.sh stage bootstrap
# Wait for completion...

# Step 3: Org Sync
./run-job.sh stage org-sync-all
# Wait for completion...

# Verify
curl -s https://cloudact-api-service-test-*.a.run.app/health | python3 -m json.tool
# Expected: {"status": "healthy"}
```

### SJ-T013: Invalid Environment

```bash
./run-job.sh local bootstrap
# Expected: Error message about invalid environment
# "local" is not a valid env — must use test, stage, or prod
```

### SJ-T014: Prod Confirmation

```bash
./run-job.sh prod bootstrap
# Expected: Prompts "Are you sure? (yes/no)"
# Without "yes", job should NOT execute

echo "yes" | ./run-job.sh prod bootstrap
# Expected: Job executes
```

## Regression Tests

After any changes to scheduler jobs:

1. Run `create-all-jobs.sh stage` — verify 8 jobs created
2. Run `run-job.sh stage bootstrap` — verify completion
3. Run `list-jobs.sh stage` — verify all jobs listed
4. Run `run-job.sh stage quota-reset` — verify quota reset
5. Verify Cloud Scheduler triggers: `gcloud scheduler jobs list`

## Coverage by Requirement

| Requirement | Test IDs |
|-------------|----------|
| FR-SJ-001 (Infrastructure) | SJ-T001, SJ-T002, SJ-T003 |
| FR-SJ-002 (Manual Jobs) | SJ-T004, SJ-T005, SJ-T006, SJ-T012 |
| FR-SJ-003 (Daily Jobs) | SJ-T007, SJ-T008, SJ-T009, SJ-T010 |
| FR-SJ-004 (Monthly Jobs) | SJ-T011 |
| FR-SJ-005 (API-First) | SJ-T017, SJ-T018 |
| FR-SJ-006 (Multi-Env) | SJ-T013, SJ-T014 |
| NFR-SJ-001 (Idempotent) | SJ-T015, SJ-T016 |
| E2E | SJ-T019, SJ-T020 |
