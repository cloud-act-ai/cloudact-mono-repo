# Supabase Migrate - Test Plan

## Migration Script Tests

Migration validation via the `migrate.sh` script and Cloud Run Jobs:
- **Script:** `01-fronted-system/scripts/supabase_db/migrate.sh`
- **Cloud Run Job:** `05-scheduler-jobs/scripts/run-job.sh {env} migrate`
- **Run:** `cd 01-fronted-system/scripts/supabase_db && ./migrate.sh --status`

### Test Matrix (25 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | `./migrate.sh --status` returns applied list | Status | List of applied migrations with filenames |
| 2 | `./migrate.sh --status` shows pending migrations | Status | Pending files listed with "PENDING" indicator |
| 3 | `./migrate.sh --status --stage` reads stage environment | Status | Stage project `kwroaccbrxppfiysqlzs` queried |
| 4 | `./migrate.sh --status --prod` reads prod environment | Status | Prod project `ovfxswhkkshouhsryzaf` queried |
| 5 | `./migrate.sh` applies pending migrations locally | Execution | All pending SQL files applied in order |
| 6 | `./migrate.sh` on up-to-date environment is no-op | Idempotency | "No pending migrations" or "All migrations applied" |
| 7 | `./migrate.sh --stage` prompts for confirmation | Safety | Confirmation prompt displayed before execution |
| 8 | `./migrate.sh --prod` prompts for confirmation | Safety | Confirmation prompt displayed before execution |
| 9 | `./migrate.sh --yes --prod` skips confirmation | Automation | No prompt; migrations applied directly |
| 10 | `./migrate.sh --dry-run` shows plan without applying | Dry Run | SQL files listed but not executed; schema_migrations unchanged |
| 11 | `./migrate.sh --dry-run --stage` targets stage | Dry Run | Stage project queried for status; no writes |
| 12 | `./migrate.sh --force 37` re-runs migration 37 | Force | `37_*.sql` re-executed; checksum updated in schema_migrations |
| 13 | Migrations apply in numeric order | Ordering | File 01 before 02, 02 before 02a, 02a before 03 |
| 14 | Failed migration halts execution | Safety | Second file NOT applied when first fails; error reported |
| 15 | `schema_migrations` records filename + checksum | Tracking | Row inserted for each successful migration |
| 16 | Missing `SUPABASE_ACCESS_TOKEN` fails gracefully | Validation | Clear error message about missing token |
| 17 | Invalid `SUPABASE_ACCESS_TOKEN` fails with auth error | Auth | 401/403 from Supabase API; clear error message |
| 18 | Missing `jq` dependency detected | Dependency | Script checks for jq and reports if missing |
| 19 | Migration file with syntax error reports error details | Error | SQL error returned from Supabase API shown to user |
| 20 | Cloud Run Job `./run-job.sh stage migrate` executes | Cloud Run | Job starts and completes successfully |
| 21 | Cloud Run Job `./run-job.sh prod migrate` requires confirmation | Cloud Run | Confirmation prompt before prod execution |
| 22 | Re-running all migrations on fresh database works | Full Run | All 44+ migrations apply cleanly from scratch |
| 23 | Migration 00 creates schema_migrations table | Bootstrap | Table exists after first migration |
| 24 | Status after full run shows all applied | Verification | Zero pending migrations |
| 25 | Suffix ordering (02a after 02, 37a after 37) correct | Ordering | Alphabetical sort places `02a` between `02` and `03` |

## Backend Tests

### Script Validation

```bash
cd 01-fronted-system/scripts/supabase_db

# 1. Check status on all environments
./migrate.sh --status              # Local
./migrate.sh --status --stage      # Stage
./migrate.sh --status --prod       # Production

# 2. Dry run to preview pending changes
./migrate.sh --dry-run             # Local
./migrate.sh --dry-run --stage     # Stage
./migrate.sh --dry-run --prod      # Production

# 3. Apply migrations locally
./migrate.sh

# 4. Verify post-apply status
./migrate.sh --status
```

| Domain | Command | Validates |
|--------|---------|-----------|
| Status | `./migrate.sh --status` | Applied/pending tracking accuracy |
| Dry Run | `./migrate.sh --dry-run` | Preview without side effects |
| Apply | `./migrate.sh` | Pending migrations execute correctly |
| Idempotency | `./migrate.sh` (re-run) | No-op when all applied |
| Force | `./migrate.sh --force 44` | Specific migration re-execution |
| Prod Safety | `./migrate.sh --prod` | Confirmation prompt enforced |

### Cloud Run Job Tests

```bash
cd 05-scheduler-jobs/scripts

# Stage migration via Cloud Run Job
./run-job.sh stage migrate

# Production migration via Cloud Run Job (with confirmation)
echo "yes" | ./run-job.sh prod migrate

# Check job status
gcloud run jobs executions list --job=cloudact-migrate --region=us-central1
```

| Job | Environment | Verification |
|-----|-------------|-------------|
| `migrate` | stage | `./migrate.sh --status --stage` shows all applied |
| `migrate` | prod | `./migrate.sh --status --prod` shows all applied |

### SQL File Validation

```bash
cd 01-fronted-system/scripts/supabase_db

# Count total migration files
ls [0-9]*.sql | wc -l
# Expected: 44+ files

# Verify naming convention (NN_description.sql or NNa_description.sql)
ls [0-9]*.sql | grep -vE '^[0-9]+[a-z]?_' && echo "NAMING VIOLATION" || echo "All names valid"

# Check for common SQL issues (missing semicolons at end)
for f in [0-9]*.sql; do
  tail -c 1 "$f" | grep -q ";" || echo "WARNING: $f may be missing trailing semicolon"
done
```

### Integration Tests

| Test | Command | Expected |
|------|---------|----------|
| Check schema_migrations exists | `./migrate.sh --status` | Table queried successfully (no "relation does not exist" error) |
| Apply all to fresh local | Drop schema_migrations, run `./migrate.sh` | All 44+ migrations apply |
| Verify organizations table | Query `SELECT column_name FROM information_schema.columns WHERE table_name = 'organizations'` via status | All expected columns present |
| Verify RLS policies active | Check `pg_policies` for organizations, profiles tables | Policies exist and enabled |
| Verify indexes created | Check `pg_indexes` for performance indexes (migration 44) | Indexes present |

## Frontend Tests

Frontend functionality depends on migrations being applied. After migrations:

```bash
cd 01-fronted-system

# Run E2E tests that exercise Supabase tables
npx playwright test tests/e2e/settings.spec.ts
npx playwright test tests/e2e/billing.spec.ts

# Verify Supabase connection
npx tsx -e "
  const { createClient } = require('@supabase/supabase-js');
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  c.from('organizations').select('count').then(r => console.log('OK:', r));
"
```

## Manual Verification Checklist

| Check | How | Expected |
|-------|-----|----------|
| All migrations applied locally | `./migrate.sh --status` | 0 pending |
| All migrations applied on stage | `./migrate.sh --status --stage` | 0 pending |
| All migrations applied on prod | `./migrate.sh --status --prod` | 0 pending |
| Migration 00 created tracking table | Query `schema_migrations` | Table exists with rows |
| Organizations table has all columns | Check via Supabase dashboard or API | billing_status, stripe_price_id, etc. present |
| RLS policies enforce tenant isolation | Login as User A, query User B's org | Access denied |
| Org quotas table has correct columns | Check via `./migrate.sh --status` | daily_count, monthly_count, concurrent_count |
| Performance indexes exist (migration 44) | Check pg_indexes via Supabase SQL editor | Indexes on hot query paths |
| Dry run produces no side effects | Run `--dry-run`, check schema_migrations | No new rows after dry run |
| Force re-run updates checksum | `./migrate.sh --force 44`, check schema_migrations | Checksum updated for file 44 |
| Frontend works after migration | Login to app, navigate settings | No Supabase errors in console |
| Cloud Run Job completes successfully | Check job execution logs in GCP Console | Exit code 0, all migrations applied |
| Prod requires confirmation | Run `./migrate.sh --prod` without --yes | Prompt appears, Ctrl+C cancels safely |
| Token expiry handled | Use expired token | Clear error message, not cryptic 401 |

## SDLC Verification

| Phase | Check | Expected |
|-------|-------|----------|
| Development | New migration file follows naming convention | `NN_description.sql` (next sequential number) |
| Development | SQL is idempotent | Uses `IF NOT EXISTS`, `CREATE OR REPLACE` |
| Testing | Local apply succeeds | `./migrate.sh` completes without errors |
| Testing | Re-run is no-op | Second `./migrate.sh` reports nothing pending |
| Staging | Stage deploy before frontend | Migrations applied, then frontend deployed |
| Staging | E2E tests pass against stage | Playwright tests succeed |
| Production | Prod migration before tag | `./run-job.sh prod migrate` before `git tag v*` |
| Production | Status shows all applied | `./migrate.sh --status --prod` reports 0 pending |
| Post-deploy | Frontend functions correctly | No Supabase query errors in browser console |

## Pass Criteria

| Criteria | Target |
|----------|--------|
| Status command works on all 3 envs | 3/3 environments report correctly |
| Pending migrations apply cleanly | 100% of pending files succeed |
| Idempotent re-run | 0 errors on re-run |
| Production confirmation enforced | Cannot skip without `--yes` flag |
| Cloud Run Job completes | Exit code 0 with all migrations applied |
| Dry run has no side effects | 0 rows added to schema_migrations |
| Failed migration halts chain | Subsequent files NOT applied on error |
| Frontend E2E tests pass post-migration | 100% of Supabase-dependent tests pass |
| SQL file naming valid | 100% of files match `NN[a-z]?_*.sql` pattern |

## Known Limitations

1. **Local and stage share Supabase instance**: Both point to `kwroaccbrxppfiysqlzs`, so local migrations affect stage and vice versa. Test in isolation by checking status before applying.
2. **No automatic rollback**: Failed migrations require a new corrective migration file. The `--force` flag can re-run a fixed version of an existing migration but does not undo changes.
3. **Supabase Management API rate limits**: Rapid successive calls may hit API rate limits. The script does not implement backoff between migration executions.
4. **Token is personal, not project-scoped**: The `SUPABASE_ACCESS_TOKEN` grants access to ALL projects the user owns. Guard this token carefully.
5. **No parallel execution**: Migrations must run sequentially. Running `./migrate.sh` simultaneously from two terminals risks race conditions on `schema_migrations`.
6. **Suffix ordering depends on alphabetical sort**: Files like `02a_*.sql` sort between `02_*.sql` and `03_*.sql` by lexicographic order, which is correct but may confuse developers expecting numeric-only ordering.
7. **CI/CD does not auto-trigger migrations**: Developers must remember to run migrations manually before deploys. A forgotten migration causes runtime errors when frontend code references missing columns or tables.
