# Supabase Migrate - Requirements

## Overview

Supabase database migration system for CloudAct. Manages schema evolution across local, stage, and production Supabase instances using a sequential SQL migration approach. Migrations are executed via the Supabase Management API (not direct database connections) and tracked in a `schema_migrations` table with checksum verification.

## Source Specifications

Defined in SKILL.md (`supabase-migrate/SKILL.md`). No external specification document.

---

## Architecture

```
+---------------------------------------------------------------------------+
|                    Supabase Migration Flow                                 |
+---------------------------------------------------------------------------+
|                                                                            |
|  Developer                                                                 |
|  ----------                                                                |
|  1. Write SQL migration file (NN_description.sql)                          |
|  2. Test locally:   ./migrate.sh                                           |
|  3. Deploy stage:   ./migrate.sh --stage                                   |
|  4. Deploy prod:    ./migrate.sh --prod (confirmation required)            |
|                                                                            |
|  OR via Cloud Run Jobs (preferred for stage/prod):                         |
|  3a. Stage:  ./run-job.sh stage migrate                                    |
|  4a. Prod:   echo "yes" | ./run-job.sh prod migrate                       |
|                                                                            |
|  Script Internals                                                          |
|  ----------------                                                          |
|  migrate.sh                                                                |
|  +-- Reads SUPABASE_ACCESS_TOKEN from .env.{local|stage|prod}             |
|  +-- Calls Supabase Management API                                         |
|      POST /v1/projects/{ref}/database/query                               |
|  +-- Queries schema_migrations for applied state                           |
|  +-- Applies pending .sql files in numeric order                           |
|  +-- Records filename + checksum on success                                |
|  +-- Stops on first failure (no partial state)                             |
|                                                                            |
|  Supabase Instances                                                        |
|  ------------------                                                        |
|  local/stage: kwroaccbrxppfiysqlzs                                         |
|  prod:        ovfxswhkkshouhsryzaf                                         |
|                                                                            |
|  Tables Managed (Supabase)                                                 |
|  -------------------------                                                 |
|  organizations, profiles, organization_members, org_quotas,                |
|  invites, security_events, plan_change_audit, schema_migrations,           |
|  subscription_providers_meta, cloud_provider_integrations,                 |
|  org_logos (storage bucket), RLS policies, indexes                         |
|                                                                            |
+---------------------------------------------------------------------------+
```

---

## Functional Requirements

### FR-SM-001: Migration File Management

- **FR-SM-001.1**: Migration files stored in `01-fronted-system/scripts/supabase_db/` as `NN_description.sql`
- **FR-SM-001.2**: Files named with sequential numeric prefix (00, 01, 02, ... 44) followed by underscore and description
- **FR-SM-001.3**: Suffix variants allowed for hotfix ordering (e.g., `02a_stripe_first_migration.sql`, `37a_pending_backend_syncs.sql`)
- **FR-SM-001.4**: Each migration file must be idempotent where possible (use `IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP IF EXISTS`)
- **FR-SM-001.5**: Migration file 00 creates the `schema_migrations` tracking table itself

### FR-SM-002: Migration Execution

- **FR-SM-002.1**: `./migrate.sh` applies all pending migrations to the local environment by default
- **FR-SM-002.2**: `./migrate.sh --stage` targets the stage Supabase instance with confirmation prompt
- **FR-SM-002.3**: `./migrate.sh --prod` targets production with mandatory confirmation prompt
- **FR-SM-002.4**: `./migrate.sh --yes --prod` skips confirmation (for CI/CD and Cloud Run Jobs)
- **FR-SM-002.5**: Migrations applied in numeric filename order (sorted ascending)
- **FR-SM-002.6**: Execution stops on first failure (no partial state across multiple files)
- **FR-SM-002.7**: Each migration recorded in `schema_migrations` with filename and checksum after successful execution

### FR-SM-003: Status Checking

- **FR-SM-003.1**: `./migrate.sh --status` shows applied vs pending migrations for local
- **FR-SM-003.2**: `./migrate.sh --status --stage` shows status for stage environment
- **FR-SM-003.3**: `./migrate.sh --status --prod` shows status for production environment
- **FR-SM-003.4**: Status output lists each migration file with applied/pending indicator

### FR-SM-004: Dry Run and Force Re-run

- **FR-SM-004.1**: `./migrate.sh --dry-run` shows which migrations would be applied without executing
- **FR-SM-004.2**: `./migrate.sh --dry-run --stage` dry run against stage
- **FR-SM-004.3**: `./migrate.sh --force NN` re-runs a specific migration (identified by numeric prefix)
- **FR-SM-004.4**: Force re-run updates the checksum in `schema_migrations` for the re-run file

### FR-SM-005: Environment Configuration

- **FR-SM-005.1**: Local environment uses `.env.local` with Supabase project `kwroaccbrxppfiysqlzs`
- **FR-SM-005.2**: Stage environment uses `.env.stage` with Supabase project `kwroaccbrxppfiysqlzs` (same as local)
- **FR-SM-005.3**: Production environment uses `.env.prod` with Supabase project `ovfxswhkkshouhsryzaf`
- **FR-SM-005.4**: All environments require `SUPABASE_ACCESS_TOKEN` (personal access token from Supabase dashboard)
- **FR-SM-005.5**: Same token works across all environments (it is a personal access token, not project-scoped)

### FR-SM-006: Cloud Run Job Integration

- **FR-SM-006.1**: Stage migrations via Cloud Run Job: `./run-job.sh stage migrate`
- **FR-SM-006.2**: Production migrations via Cloud Run Job: `echo "yes" | ./run-job.sh prod migrate`
- **FR-SM-006.3**: Cloud Run Jobs are the preferred method for stage/prod (not local script execution)
- **FR-SM-006.4**: Migrations must be deployed BEFORE frontend deploys (schema must exist before app code references it)

### FR-SM-007: Supabase Tables Managed

| Table | Purpose | Key Migration |
|-------|---------|---------------|
| `schema_migrations` | Tracks applied migrations | `00_migration_tracking.sql` |
| `organizations` | Org metadata, billing fields, plan limits | `01_production_setup.sql` |
| `profiles` | User profiles linked to auth.users | `01_production_setup.sql` |
| `organization_members` | Org membership and roles | `01_production_setup.sql` |
| `org_quotas` | Daily/monthly pipeline usage counters | `21_org_pipeline_limits.sql` |
| `invites` | Team invitation tokens (48h expiry) | `01_production_setup.sql` |
| `security_events` | Security audit log | `39_security_hardening.sql` |
| `plan_change_audit` | Plan upgrade/downgrade history | `01_production_setup.sql` |
| `subscription_providers_meta` | SaaS provider metadata | `31_recreate_subscription_providers_meta.sql` |
| `cloud_provider_integrations` | Cloud provider setup state | `25_cloud_provider_integrations.sql` |

### FR-SM-008: Rollback Strategy

- **FR-SM-008.1**: No automatic rollback mechanism (forward-only migrations)
- **FR-SM-008.2**: Rollback is a new migration that reverses the previous change
- **FR-SM-008.3**: Use `--dry-run` to validate before applying
- **FR-SM-008.4**: For emergencies, `--force NN` re-runs a corrected migration
- **FR-SM-008.5**: Production rollbacks require a new migration file committed to the repository

---

## SDLC: Development Workflow

### Writing a New Migration

```
1. Determine next number:  ls 01-fronted-system/scripts/supabase_db/*.sql | tail -1
2. Create file:            NN_description.sql
3. Write idempotent SQL:   IF NOT EXISTS, CREATE OR REPLACE
4. Test locally:           ./migrate.sh
5. Verify:                 ./migrate.sh --status
6. Deploy to stage:        ./run-job.sh stage migrate
7. Verify stage:           ./migrate.sh --status --stage
8. Deploy to prod:         echo "yes" | ./run-job.sh prod migrate
9. Verify prod:            ./migrate.sh --status --prod
```

### Deployment Order (Critical)

```
1. Merge migration PR to main
2. Run migrations on stage:   ./run-job.sh stage migrate
3. Run migrations on prod:    echo "yes" | ./run-job.sh prod migrate
4. Deploy frontend:           git tag v4.x.x && git push origin v4.x.x
```

Migrations MUST be applied BEFORE the frontend deploy because new frontend code may reference columns or tables that only exist after migration.

### CI/CD Integration

- Migrations are NOT auto-triggered by Cloud Build
- They are run manually (or via Cloud Run Jobs) before each deploy that requires schema changes
- Stage deploys auto-trigger on `git push origin main` but do NOT auto-run migrations
- Production deploys trigger on `git tag v*` but do NOT auto-run migrations
- The developer is responsible for running migrations in the correct order

### Testing Approach

1. **Local validation**: Run `./migrate.sh` against local Supabase
2. **Dry run**: Use `--dry-run` to preview changes before applying
3. **Stage verification**: Apply to stage, verify with `--status`, test frontend against stage
4. **Production deployment**: Apply to prod only after stage verification passes

---

## Non-Functional Requirements

### NFR-SM-001: Safety

| Standard | Implementation |
|----------|----------------|
| Stop on failure | First failed SQL statement halts all remaining migrations |
| Checksum tracking | Each migration recorded with filename + content checksum |
| Confirmation prompts | Stage and prod require explicit confirmation (unless `--yes`) |
| No direct DB connection | Uses Supabase Management API exclusively |
| Forward-only | No automatic rollback; new migrations to fix issues |

### NFR-SM-002: Idempotency

- Re-running `./migrate.sh` on an up-to-date environment is safe (no-op)
- Already-applied migrations are skipped based on `schema_migrations` records
- Individual SQL files should use `IF NOT EXISTS` / `CREATE OR REPLACE` where possible
- `--force NN` allows re-running a specific migration when the SQL content has changed

### NFR-SM-003: Environment Isolation

| Env | Supabase Project | Notes |
|-----|------------------|-------|
| local | `kwroaccbrxppfiysqlzs` | Development and testing |
| stage | `kwroaccbrxppfiysqlzs` | Pre-production validation (same instance as local) |
| prod | `ovfxswhkkshouhsryzaf` | Production (separate instance) |

### NFR-SM-004: Dependencies

- `jq` must be installed (`brew install jq`)
- `curl` for API calls
- `SUPABASE_ACCESS_TOKEN` in environment
- Supabase Management API must be reachable (internet access)

---

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/scripts/supabase_db/migrate.sh` | Migration runner script |
| `01-fronted-system/scripts/supabase_db/00_migration_tracking.sql` | Creates schema_migrations table |
| `01-fronted-system/scripts/supabase_db/01_production_setup.sql` | Initial schema (orgs, profiles, members) |
| `01-fronted-system/scripts/supabase_db/39_security_hardening.sql` | RLS + security events |
| `01-fronted-system/scripts/supabase_db/42_consolidate_quotas.sql` | Quota table consolidation |
| `01-fronted-system/scripts/supabase_db/44_add_performance_indexes.sql` | Latest migration (performance indexes) |
| `05-scheduler-jobs/scripts/run-job.sh` | Cloud Run Job runner (preferred for stage/prod) |

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/bootstrap-onboard` | Bootstrap creates BigQuery tables; migrations create Supabase tables. Both must be in sync before deploys. |
| `/stripe-billing` | Stripe webhooks write to Supabase tables (organizations, plan_change_audit) that migrations create. |
| `/account-setup` | Account setup depends on Supabase tables being up to date (profiles, organization_members, invites). |
| `/frontend-dev` | Frontend code references Supabase tables; migrations must run BEFORE frontend deploys. |
| `/infra-cicd` | Cloud Run Jobs execute migrations in stage/prod; deployment pipelines depend on migration ordering. |
| `/security-audit` | Security migrations (RLS policies, security_events table) enforce multi-tenancy in Supabase. |
