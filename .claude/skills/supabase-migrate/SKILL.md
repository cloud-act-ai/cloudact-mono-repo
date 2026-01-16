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

## Quick Reference

### Check Status
```bash
cd 01-fronted-system/scripts/supabase_db

./migrate.sh --status              # Local (default)
./migrate.sh --status --stage      # Stage
./migrate.sh --status --prod       # Production
```

### Run Migrations
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

## Script Internals

The `migrate.sh` script:
1. Uses Supabase Management API (not psql/pooler)
2. Tracks migrations in `schema_migrations` table
3. Calculates checksums for each migration
4. Stops on first failure
5. Requires confirmation for stage/prod (unless `--yes`)

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
