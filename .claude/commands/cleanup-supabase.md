# /cleanup-supabase - Supabase Data Cleanup

Delete all users and data from Supabase for fresh bootstrap.

## Usage

```
/cleanup-supabase <environment>
```

## Environments

| Environment | Project ID | Project Name |
|-------------|------------|--------------|
| `stage` | kwroaccbrxppfiysqlzs | cloudactai_stage_local |
| `prod` | ovfxswhkkshouhsryzaf | cloudactai_prod |

## Examples

```
/cleanup-supabase stage   # Clean all data in stage Supabase
/cleanup-supabase prod    # Clean all data in prod Supabase (requires confirmation)
```

---

## Instructions

When user runs `/cleanup-supabase <env>`, execute the following:

### Step 1: Parse and Validate Environment

```
ENV=$1  # First argument: stage or prod

case $ENV in
  stage|test|local)
    PROJECT_ID=kwroaccbrxppfiysqlzs
    PROJECT_NAME=cloudactai_stage_local
    ;;
  prod)
    PROJECT_ID=ovfxswhkkshouhsryzaf
    PROJECT_NAME=cloudactai_prod
    # REQUIRE EXPLICIT CONFIRMATION FOR PROD
    ;;
  *)
    echo "ERROR: Invalid environment. Use: stage or prod"
    exit 1
    ;;
esac
```

### Step 2: If prod, ask for explicit confirmation

**CRITICAL:** For prod environment, use AskUserQuestion to confirm:
- "Are you sure you want to delete ALL users and data from PRODUCTION Supabase? This is irreversible!"
- Options: "Yes, delete prod data" / "No, cancel"

If user cancels, abort immediately.

### Step 3: List current users (for count)

Use Supabase MCP tool:
```
mcp__plugin_supabase_supabase__execute_sql
  project_id: $PROJECT_ID
  query: SELECT COUNT(*) as user_count FROM auth.users;
```

Display: "Found X users to delete"

### Step 4: Truncate all public tables (in correct order)

**IMPORTANT:** Must truncate dependent tables before auth.users due to foreign keys.

Use Supabase MCP tool:
```
mcp__plugin_supabase_supabase__execute_sql
  project_id: $PROJECT_ID
  query: |
    TRUNCATE TABLE public.activity_logs CASCADE;
    TRUNCATE TABLE public.stripe_webhook_events CASCADE;
    TRUNCATE TABLE public.usage_tracking CASCADE;
    TRUNCATE TABLE public.account_deletion_tokens CASCADE;
    TRUNCATE TABLE public.invites CASCADE;
    TRUNCATE TABLE public.rate_limits CASCADE;
    TRUNCATE TABLE public.org_api_keys_secure CASCADE;
    TRUNCATE TABLE public.subscription_meta CASCADE;
    TRUNCATE TABLE public.subscription_providers_meta CASCADE;
    TRUNCATE TABLE public.organization_members CASCADE;
    TRUNCATE TABLE public.profiles CASCADE;
    TRUNCATE TABLE public.organizations CASCADE;
```

Note: Some tables may not exist in all environments. Ignore "table does not exist" errors.

### Step 5: Delete all users

Use Supabase MCP tool:
```
mcp__plugin_supabase_supabase__execute_sql
  project_id: $PROJECT_ID
  query: DELETE FROM auth.users;
```

### Step 6: Verify and Report

Use Supabase MCP tool:
```
mcp__plugin_supabase_supabase__execute_sql
  project_id: $PROJECT_ID
  query: |
    SELECT
      (SELECT COUNT(*) FROM auth.users) as remaining_users,
      (SELECT COUNT(*) FROM public.organizations) as remaining_orgs;
```

Report summary:
- Users deleted: X
- Environment: $ENV ($PROJECT_NAME)
- Status: Clean / Has remaining data

---

## Tables Cleaned

| Schema | Tables |
|--------|--------|
| `public` | organizations, organization_members, profiles, org_api_keys_secure, invites, activity_logs, usage_tracking, rate_limits, account_deletion_tokens, stripe_webhook_events, subscription_meta, subscription_providers_meta |
| `auth` | users (and cascades to identities, sessions, etc.) |

## Safety Notes

1. **Prod requires confirmation** - Never auto-delete prod without explicit user approval
2. **All data deleted** - This includes all organizations, users, and related data
3. **Table structure preserved** - Only data is deleted, not the schema
4. **Stripe data not affected** - Stripe customers/subscriptions remain in Stripe (not Supabase)

## Variables

- `$REPO_ROOT` = `/Users/gurukallam/prod-ready-apps/cloudact-mono-repo`

## Debug Account (for testing cleanup)

| Field | Value |
|-------|-------|
| Email | `demo@cloudact.ai` |
| Password | `demo1234` |
| Org Slug | **Query from DB** (see `.claude/debug-config.md`) |

**To cleanup and recreate the debug account:**
```bash
# 1. Cleanup via this command
/cleanup-supabase stage

# 2. Recreate via demo-setup
npx tsx tests/demo-setup/setup-demo-account.ts
```

See `.claude/debug-config.md` for full debug configuration.
