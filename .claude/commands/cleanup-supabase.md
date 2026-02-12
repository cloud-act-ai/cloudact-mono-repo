# /cleanup-supabase - Supabase Full Cleanup + Migrations

**Nuke ALL Supabase data and rebuild via Cloud Run Jobs.**

## Usage

```
/cleanup-supabase <environment>
```

## Environments

| Input | Supabase Project ID | Access Token Source | `run-job.sh` Arg |
|-------|---------------------|---------------------|------------------|
| `local` / `test` / `stage` | kwroaccbrxppfiysqlzs | `01-fronted-system/.env.local` | `stage` |
| `prod` | ovfxswhkkshouhsryzaf | `01-fronted-system/.env.prod` | `prod` |

> **Note:** `local`, `test`, `stage` = same Supabase project.
> **Note:** `run-job.sh` only accepts `test`, `stage`, or `prod` (NOT `local`). Map `local` → `stage`.

## What Gets Deleted

| Schema | Tables Truncated |
|--------|-----------------|
| `public` | organizations, organization_members, profiles, org_api_keys_secure, org_quotas, invites, activity_logs, usage_tracking, account_deletion_tokens, subscription_meta, subscription_providers_meta |
| `auth` | users (cascades to identities, sessions, refresh_tokens, etc.) |

> **Preserved:** Table structure (DDL), migration tracking (`schema_migrations`), RLS policies, triggers, functions.

## Full Workflow

```
Step 1: Read Supabase credentials from env file
Step 2: Count current users (for reporting)
Step 3: TRUNCATE all public tables (bypasses triggers!)
Step 4: DELETE all auth.users
Step 5: Verify Supabase is clean (all counts = 0)
Step 6: Activate GCP credentials for Cloud Run
Step 7: Run Supabase migrations via Cloud Run Job (smart - skips already applied)
```

---

## Instructions

### Step 1: Parse Environment + Get Credentials

```
case $ENV in
  local|test|stage)
    PROJECT_ID="kwroaccbrxppfiysqlzs"
    ENV_FILE="01-fronted-system/.env.local"
    JOB_ENV="stage"
    ;;
  prod)
    PROJECT_ID="ovfxswhkkshouhsryzaf"
    ENV_FILE="01-fronted-system/.env.prod"
    JOB_ENV="prod"
    ;;
esac
```

Read `SUPABASE_ACCESS_TOKEN` (starts with `sbp_`) from the env file.

### Step 2: If prod, ask for explicit confirmation

Use AskUserQuestion:
- "Delete ALL users and data from PRODUCTION Supabase and re-run migrations? This is irreversible!"
- Options: "Yes, nuke + rebuild prod" / "No, cancel"

### Step 3: Count Users Before Cleanup

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT COUNT(*) as user_count FROM auth.users;"}'
```

Display: "Found X users to delete"

### Step 4: TRUNCATE All Public Tables

**CRITICAL:** Must use `TRUNCATE ... CASCADE` via the **Supabase Management API**.

Why TRUNCATE (not DELETE):
- Bypasses the `organization_members` owner-protection trigger ("Cannot delete organization owner")
- Bypasses the "Cannot remove the last owner" update trigger
- The REST API (`rest/v1`) CANNOT do bulk deletes due to these triggers

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "TRUNCATE TABLE public.organization_members, public.organizations, public.profiles, public.org_quotas, public.org_api_keys_secure, public.activity_logs, public.usage_tracking, public.account_deletion_tokens, public.invites, public.subscription_meta, public.subscription_providers_meta CASCADE;"
  }'
```

Empty result `[]` = success. Ignore "table does not exist" errors.

### Step 5: Delete All Auth Users

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query": "DELETE FROM auth.users;"}'
```

### Step 6: Verify Supabase is Clean

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT (SELECT COUNT(*) FROM auth.users) as users, (SELECT COUNT(*) FROM public.organizations) as orgs, (SELECT COUNT(*) FROM public.organization_members) as members, (SELECT COUNT(*) FROM public.profiles) as profiles;"
  }'
```

All counts must be 0: `[{"users":0,"orgs":0,"members":0,"profiles":0}]`

### Step 7: Activate GCP Credentials + Run Migrations

**IMPORTANT:** Migrations run as Cloud Run Jobs, so GCP credentials must be activated first.

```bash
# Activate GCP credentials
case $JOB_ENV in
  stage)
    gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json
    ;;
  prod)
    gcloud auth activate-service-account --key-file=/Users/openclaw/.gcp/cloudact-prod.json
    ;;
esac

cd /Users/openclaw/.openclaw/workspace/cloudact-mono-repo/05-scheduler-jobs/scripts

# Stage/test
./run-job.sh stage migrate

# Prod
echo "yes" | ./run-job.sh prod migrate
```

### Step 8: Verify Migrations via Cloud Run Logs

**Always check actual job logs** to confirm what happened:

```bash
gcloud logging read \
  "resource.type=cloud_run_job AND resource.labels.job_name=cloudact-manual-supabase-migrate AND timestamp>=\"$(date -u +%Y-%m-%dT00:00:00Z)\"" \
  --project=$GCP_PROJECT \
  --limit=30 \
  --format="table(timestamp,textPayload)" \
  --order=asc
```

Where `$GCP_PROJECT` is:
- `cloudact-testing-1` for stage/test
- `cloudact-prod` for prod

**Expected output patterns:**
- All current: `Already applied: 48 migrations, No pending migrations`
- Pending: `Pending migrations: N` → lists and applies each one
- Failed: `✗ Failed:` → check error, may need manual fix via SQL Editor

### Step 9: Report Summary

```
=== Supabase Cleanup + Migrations Complete ===
Environment: $ENV ($PROJECT_ID)
Users deleted: X
Tables truncated: 11 public tables + auth.users
Migrations: OK (48 applied, 0 pending)
```

---

## Smart Migration Behavior (Verified 2026-02-12)

| Scenario | Result |
|----------|--------|
| **All applied** | "Already applied: 48 migrations, No pending" → skips all |
| **New migrations** | Applies only pending ones |
| **After TRUNCATE** | `schema_migrations` table survives, tracking preserved |
| **Applied > Files** | Normal - 48 applied vs 41 files (some consolidated) |

> TRUNCATE only deletes data from the listed tables. The `schema_migrations` tracking table
> is NOT in the TRUNCATE list, so migration history is preserved. Smart migrations detect
> this and correctly report "No pending migrations."

## API Reference

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Execute SQL | `https://api.supabase.com/v1/projects/{id}/database/query` | POST |
| Auth header | `Authorization: Bearer $SUPABASE_ACCESS_TOKEN` | - |
| Body format | `{"query": "SQL HERE"}` | JSON |
| Success | Empty `[]` | - |

> **DO NOT use:** `mcp__plugin_supabase_supabase__execute_sql` (not available in this env)
> **DO NOT use:** REST API `rest/v1` for bulk deletes (triggers block it)
> **DO NOT use:** `DISABLE TRIGGER ALL` (permission denied on system triggers)

## Cloud Run Job Reference

| Step | Command (stage) | Command (prod) |
|------|-----------------|----------------|
| Migrate | `./run-job.sh stage migrate` | `echo "yes" \| ./run-job.sh prod migrate` |

**Scripts location:** `05-scheduler-jobs/scripts/`

**`run-job.sh` valid envs:** `test`, `stage`, `prod` (NOT `local` — map local → stage)

## Known Issues & Solutions (Verified 2026-02-12)

| Issue | Root Cause | Solution |
|-------|-----------|----------|
| "Cannot delete organization owner" | BEFORE DELETE trigger on `organization_members` | Use TRUNCATE CASCADE via Management API |
| "Cannot remove the last owner" | BEFORE UPDATE trigger prevents role change | Use TRUNCATE CASCADE |
| REST API 400 on bulk delete | Row-level triggers fire on each DELETE | Use Management API SQL endpoint |
| "permission denied: system trigger" | Can't DISABLE TRIGGER on FK constraints | Use TRUNCATE (bypasses row triggers) |
| `head -n -1` errors on macOS | GNU vs BSD syntax difference | Use `python3 -c` for parsing or avoid `head -n -1` |
| Prod `SUPABASE_ACCESS_TOKEN` placeholder | Env file has `INJECTED_FROM_SECRET_MANAGER` | Get real token from GCP Secret Manager or Supabase dashboard |
| `~/.gcp/` path not found | Tilde doesn't expand in gcloud | Use absolute path `/Users/openclaw/.gcp/` |

## Safety Notes

1. **Prod requires confirmation** - Never auto-delete prod without user approval
2. **All data deleted** - All organizations, users, and related data
3. **Schema preserved** - Table structure, triggers, functions, RLS policies survive
4. **Migration tracking preserved** - `schema_migrations` not truncated
5. **Stripe unaffected** - Stripe customers/subscriptions remain in Stripe
6. **Cloud Run Jobs only** - Migrations via Cloud Run Jobs, NOT local `./migrate.sh`
7. **Use absolute paths** - `~/.gcp/` does NOT expand; use `/Users/openclaw/.gcp/`
8. **Map local → stage** - `run-job.sh` doesn't accept `local`, use `stage` instead
