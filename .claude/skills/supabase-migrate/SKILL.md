---
name: supabase-migrate
description: |
  Supabase database migrations for CloudAct. Run migrations on local, stage, or production.
  Use when: running database migrations, checking migration status, deploying schema changes,
  or troubleshooting Supabase database issues.
---

# Supabase Migrations

## Overview
CloudAct uses Supabase for authentication and user data. Migrations are managed via `migrate.sh` script
which uses the Supabase Management API.

## Cloud Run Jobs (DEFAULT - Use for Stage/Prod)

**ALL stage/prod migrations run via Cloud Run Jobs — NOT local `migrate.sh`.**

```bash
cd /Users/openclaw/.openclaw/workspace/cloudact-mono-repo/05-scheduler-jobs/scripts

# Activate GCP credentials FIRST (ABSOLUTE paths - ~/ does NOT expand!)
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json  # stage
gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-prod.json                    # prod

# Run migrations
./run-job.sh stage migrate                  # Stage (cloudact-testing-1)
echo "yes" | ./run-job.sh prod migrate      # Prod (requires confirmation)
```

**`run-job.sh` valid envs:** `test`, `stage`, `prod` (NOT `local` — use `stage` for local).

### Verify via Cloud Run Logs (ALWAYS CHECK)

```bash
gcloud logging read \
  "resource.type=cloud_run_job AND resource.labels.job_name=cloudact-manual-supabase-migrate \
  AND timestamp>=\"$(date -u +%Y-%m-%dT00:00:00Z)\"" \
  --project=$PROJECT \
  --limit=30 \
  --format="table(timestamp,textPayload)" \
  --order=asc
```

**Expected patterns:**
- All current: `Already applied: 48 migrations, No pending migrations`
- Pending: `Pending migrations: N` → applies each
- Failed: `✗ Failed:` → check error, may need manual fix via SQL Editor

### Smart Migration Behavior (Verified 2026-02-12)

| Scenario | Result |
|----------|--------|
| All applied | Skips all — `No pending migrations` |
| New migrations | Applies only pending ones |
| After Supabase nuke (TRUNCATE) | `schema_migrations` survives, tracking preserved |
| Applied count > file count | Normal (48 applied vs 41 files — some consolidated) |

## Local Script (ONLY when user explicitly asks)

### Check Status
```bash
cd 01-fronted-system/scripts/supabase_db

./migrate.sh --status              # Local (default)
./migrate.sh --status --stage      # Stage
./migrate.sh --status --prod       # Production
```

### Run Migrations Locally
```bash
./migrate.sh                       # Local (default)
./migrate.sh --stage               # Stage (with confirmation)
./migrate.sh --prod                # Production (with confirmation)
./migrate.sh --yes --prod          # Production (skip confirmation)
```

### Dry Run
```bash
./migrate.sh --dry-run             # Local
./migrate.sh --dry-run --stage     # Stage
./migrate.sh --dry-run --prod      # Production
```

### Force Re-run Specific Migration
```bash
./migrate.sh --force 37            # Re-run 37_*.sql on local
./migrate.sh --force 37 --prod     # Re-run 37_*.sql on production
```

## Environment Configuration

| Environment | Supabase Project | Env File |
|-------------|------------------|----------|
| local | `kwroaccbrxppfiysqlzs` | `.env.local` |
| stage | `kwroaccbrxppfiysqlzs` | `.env.stage` |
| prod | `ovfxswhkkshouhsryzaf` | `.env.prod` |

### Required Environment Variable
```bash
# Same token works for all environments (personal access token)
SUPABASE_ACCESS_TOKEN=sbp_xxx...
```

Get token from: https://supabase.com/dashboard/account/tokens

## Migration Files

**Location:** `01-fronted-system/scripts/supabase_db/[0-9][0-9]_*.sql`

**Tracking Table:** `schema_migrations`

### Naming Convention
```
00_migration_tracking.sql      # Creates tracking table
01_production_setup.sql        # Initial setup
...
37_fix_logo_upload_rls.sql     # Feature: logo upload RLS fix
38_reveal_tokens_and_rotation_locks.sql
39_security_hardening.sql      # Security improvements
```

## Common Tasks

### Deploy New Migration to All Environments
```bash
cd 01-fronted-system/scripts/supabase_db

# 1. Create migration file
# Name: NN_description.sql (NN = next number)

# 2. Test on local
./migrate.sh --status
./migrate.sh

# 3. Deploy to stage
./migrate.sh --stage

# 4. Deploy to production
./migrate.sh --prod
```

### Check What's Applied
```bash
# Via script
./migrate.sh --status --prod

# Via API directly
curl -s -X POST \
  "https://api.supabase.com/v1/projects/ovfxswhkkshouhsryzaf/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT filename FROM schema_migrations ORDER BY id DESC LIMIT 10;"}'
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Auth fails | Check `SUPABASE_ACCESS_TOKEN` in env file |
| Migration fails | Check SQL syntax, run with `--dry-run` first |
| Token expired | Get new token from Supabase dashboard |
| jq not installed | `brew install jq` |

## Development Rules (Non-Negotiable)

- **Supabase best practices** - RLS policies on all tables, connection pooling, tight auth integration
- **Multi-tenancy support** - Proper `org_slug` isolation in all migration SQL
- **Don't break existing functionality** - Always `--dry-run` first, then run migrations
- **No over-engineering** - Simple, direct SQL migrations. No unnecessary abstractions.
- **Enterprise-grade for 10k customers** - Migrations must scale. Use indexes, constraints properly.
- **Update skills with learnings** - Document migration patterns and fixes in skill files

## Script Internals

The `migrate.sh` script:
1. Uses Supabase Management API (not psql/pooler)
2. Tracks migrations in `schema_migrations` table
3. Calculates checksums for each migration
4. Stops on first failure
5. Requires confirmation for stage/prod (unless `--yes`)

## 5 Implementation Pillars

| Pillar | How Supabase Migrate Handles It |
|--------|-------------------------------|
| **i18n** | Migrations may add locale columns (`currency`, `timezone`, `date_format`) to the `organizations` table |
| **Enterprise** | Migration versioning with checksums; rollback support via `--force`; dry-run mode; multi-environment targeting (local/stage/prod) |
| **Cross-Service** | Supabase schema changes affect Frontend (RLS policies) and API (auth queries); coordinate with BigQuery schema for data consistency |
| **Multi-Tenancy** | RLS policies enforce org isolation; migrations must not break cross-org boundaries; `org_slug` scoping in all new tables |
| **Reusability** | Shared `migrate.sh` script; consistent migration file naming (`NN_*.sql`); Management API pattern for all environments |

## Current Status

Run these commands to check current status:
```bash
# Production
./migrate.sh --status --prod

# Stage
./migrate.sh --status --stage

# Local
./migrate.sh --status
```
