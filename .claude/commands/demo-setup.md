# Demo Account Setup

**Purpose**: Create a demo account with realistic demo data for testing and demonstration.

## Default Demo Credentials

| Field | Value |
|-------|-------|
| Email | `john@example.com` |
| Password | `acme1234` |
| First Name | `John` |
| Last Name | `Doe` |
| Phone | `5551234567` |
| Company | `Acme Inc {MMDDYYYY}` (e.g., `Acme Inc 01022026`) |
| Org Slug | `acme_inc_{MMDDYYYY}` (e.g., `acme_inc_01022026`) |
| Plan | `starter` ($19/month, 14-day trial) |
| Timezone | `PST/PDT - Los Angeles, USA` |
| Currency | `USD` |

## Prerequisites

1. Frontend running: `http://localhost:3000`
2. API Service running: `http://localhost:8000`
3. Pipeline Service running: `http://localhost:8001`
4. Supabase: Email confirmation DISABLED in Auth settings
5. GCP authenticated: `gcloud auth login`
6. Environment variables loaded: `source 01-fronted-system/.env.local`

## Complete Workflow

```
1. [Optional] Cleanup existing demo org (use cleanup script)
2. Create Account via Playwright automation
3. Verify tables have partitioning/clustering
4. Get API key for org
5. Load demo raw data
6. Sync stored procedures
7. Run pipelines to generate costs
8. Verify dashboard
```

---

## Step 1: Cleanup (If Re-creating Demo Org)

### Using Cleanup Script (RECOMMENDED)

```bash
cd 01-fronted-system

# Cleanup by email
npx ts-node tests/demo-setup/cleanup-demo-account.ts --email=john@example.com

# OR cleanup by org slug
npx ts-node tests/demo-setup/cleanup-demo-account.ts --org-slug=acme_inc_01022026
```

This script automatically:
- Deletes auth.users record
- Deletes profiles record
- Deletes organization_members records
- Deletes organizations record
- Deletes BigQuery dataset (`{org_slug}_local`)

### Manual Cleanup (If Script Fails)

#### 1a. Delete BigQuery Dataset

```bash
export ORG_SLUG="acme_inc_01022026"
bq rm -r -f cloudact-testing-1:${ORG_SLUG}_local
```

#### 1b. Delete from Central BigQuery Tables

```bash
bq query --use_legacy_sql=false "DELETE FROM \`cloudact-testing-1.organizations.org_profiles\` WHERE org_slug = '${ORG_SLUG}'"
bq query --use_legacy_sql=false "DELETE FROM \`cloudact-testing-1.organizations.org_api_keys\` WHERE org_slug = '${ORG_SLUG}'"
bq query --use_legacy_sql=false "DELETE FROM \`cloudact-testing-1.organizations.org_subscriptions\` WHERE org_slug = '${ORG_SLUG}'"
bq query --use_legacy_sql=false "DELETE FROM \`cloudact-testing-1.organizations.org_usage_quotas\` WHERE org_slug = '${ORG_SLUG}'"
bq query --use_legacy_sql=false "DELETE FROM \`cloudact-testing-1.organizations.org_hierarchy\` WHERE org_slug = '${ORG_SLUG}'"
```

#### 1c. Delete from Supabase (SQL Editor)

```sql
-- Disable protect_owner trigger first
ALTER TABLE public.organization_members DISABLE TRIGGER protect_owner;

-- Delete in order
DELETE FROM public.organization_members WHERE org_id IN (SELECT id FROM organizations WHERE org_slug = 'acme_inc_01022026');
DELETE FROM public.organizations WHERE org_slug = 'acme_inc_01022026';

-- Re-enable trigger
ALTER TABLE public.organization_members ENABLE TRIGGER protect_owner;

-- Delete user
DELETE FROM public.profiles WHERE email = 'john@example.com';
DELETE FROM auth.users WHERE email = 'john@example.com';
```

---

## Step 2: Create Demo Account (PLAYWRIGHT)

**ALWAYS use Playwright to create demo accounts.** This ensures consistent org creation and handles the full signup flow including Stripe checkout.

### Using Playwright Script (RECOMMENDED)

```bash
cd 01-fronted-system

# Default demo account (john@example.com / acme1234)
npx ts-node tests/demo-setup/setup-demo-account.ts

# Custom email
npx ts-node tests/demo-setup/setup-demo-account.ts --email=custom@test.com

# Custom company (org slug derived from company name)
npx ts-node tests/demo-setup/setup-demo-account.ts --company="My Company 01022026"

# Full custom options
npx ts-node tests/demo-setup/setup-demo-account.ts \
  --firstName=Jane \
  --lastName=Smith \
  --email=jane@test.com \
  --password=test1234 \
  --company="Test Corp 01022026" \
  --plan=professional

# Run with visible browser (not headless)
TEST_HEADLESS=false npx ts-node tests/demo-setup/setup-demo-account.ts
```

### Environment Variables for Playwright

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_BASE_URL` | `http://localhost:3000` | Frontend URL |
| `TEST_HEADLESS` | `true` | Run browser in headless mode |
| `TEST_SLOW_MO` | `0` | Slow down actions by ms (for debugging) |
| `TEST_TIMEOUT` | `60000` | Timeout in ms |

### What the Playwright Script Does

1. Navigates to `/signup`
2. Fills Step 1 (Account Details): name, email, password, phone
3. Fills Step 2 (Organization): company name, type, currency, timezone
4. Clicks "Create account" (this triggers Supabase signup + backend onboarding)
5. Selects billing plan on `/onboarding/billing`
6. Clicks "Continue to Checkout" (redirects to Stripe)
7. Returns org slug and dashboard URL

### Using Playwright MCP (Alternative)

If running within Claude with Playwright MCP:

```
1. browser_navigate to http://localhost:3000/signup
2. browser_snapshot to see the page
3. browser_fill_form for account fields:
   - First name: John
   - Last name: Doe
   - Email: john@example.com
   - Password: acme1234
   - Phone: 5551234567
4. browser_click "Continue" button
5. browser_fill_form for organization fields
6. browser_click "Create account"
7. Wait for billing page, select plan
8. browser_click "Continue to Checkout"
9. Complete Stripe checkout
```

---

## Step 3: Verify Partitioning

All tables MUST have partitioning and clustering:

```bash
# Verify partitioning on all tables
bq ls --format=prettyjson cloudact-testing-1:acme_inc_01022026_local | \
  jq -r '.[] | select(.type == "TABLE") | "\(.tableReference.tableId): \(.timePartitioning.field // "NONE")"'
```

**Expected**: Every table should show a partition field (not "NONE")

If tables are missing partitioning, the org was created before the fix. Delete and re-onboard.

---

## Step 4: Get API Key

```bash
export CA_ROOT_API_KEY="test-ca-root-key-dev-32chars"
export ORG_SLUG="acme_inc_01022026"

# Get org API key
ORG_API_KEY=$(curl -s "http://localhost:8000/api/v1/admin/dev/api-key/${ORG_SLUG}" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" | jq -r '.api_key')

echo "API Key: $ORG_API_KEY"
```

---

## Step 5: Load Demo Data

```bash
cd 04-inra-cicd-automation/load-demo-data

export ORG_SLUG="acme_inc_01022026"
export ORG_API_KEY="<api-key-from-step-4>"
export CA_ROOT_API_KEY="test-ca-root-key-dev-32chars"
export ENVIRONMENT="local"

# Load all raw data
./scripts/load-all.sh --skip-validation
```

---

## Step 6: Sync Procedures

```bash
curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"
```

---

## Step 7: Run Pipelines

```bash
# Subscription costs
curl -X POST "http://localhost:8001/api/v1/pipelines/run/${ORG_SLUG}/subscription/costs/subscription_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"start_date":"2025-01-01","end_date":"2026-01-02"}'

# GenAI costs (per provider)
for provider in openai anthropic gemini; do
  curl -X POST "http://localhost:8001/api/v1/pipelines/run/${ORG_SLUG}/genai/payg/${provider}" \
    -H "X-API-Key: $ORG_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"start_date":"2025-01-01","end_date":"2026-01-02"}'
done

# Cloud costs (per provider)
for provider in gcp aws azure oci; do
  curl -X POST "http://localhost:8001/api/v1/pipelines/run/${ORG_SLUG}/${provider}/cost/billing" \
    -H "X-API-Key: $ORG_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"start_date":"2025-01-01","end_date":"2026-01-02"}'
done
```

---

## Step 8: Verify Dashboard

```bash
# Check costs via API
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Expected output:
# GenAI: ~$1.4M
# Cloud: ~$1.4M
# SaaS: ~$77K
# GenAI should be slightly > Cloud
```

**Dashboard URL**: `http://localhost:3000/acme_inc_01022026/dashboard`

**Login**: `john@example.com` / `acme1234`

---

## Script Locations

| Script | Path | Purpose |
|--------|------|---------|
| Setup (Playwright) | `01-fronted-system/tests/demo-setup/setup-demo-account.ts` | Create demo account via browser |
| Cleanup | `01-fronted-system/tests/demo-setup/cleanup-demo-account.ts` | Delete user + BigQuery dataset |
| Config | `01-fronted-system/tests/demo-setup/config.ts` | Default demo credentials |
| Load Data | `04-inra-cicd-automation/load-demo-data/scripts/load-all.sh` | Load raw demo data |

---

## Key Learnings & Gotchas

| Issue | Root Cause | Solution |
|-------|------------|----------|
| Dashboard shows $0 | `x_source_system` field is NULL | Pipelines must set this field |
| Cloud/SaaS shows $0 | Cost categorization uses `x_source_system` | Check stored procedures |
| Slow dashboard (~5s) | No partitioning on tables | Re-onboard to get partitioned tables |
| Supabase delete fails | `protect_owner` trigger | Use cleanup script or disable trigger |
| Signup 400 error | Email confirmation enabled | Disable in Supabase Auth settings |
| Tables missing partition | Old onboarding code | Delete dataset and re-onboard |
| Stripe checkout hangs | Test mode requires manual action | Use "Start trial" button |

## Dynamic Org Slug Convention

Org slugs include the date to prevent collisions:

```
Format: {company_name}_{MMDDYYYY}
Example: acme_inc_01022026

Derived from: "Acme Inc 01022026" -> "acme_inc_01022026"
```

This allows:
- Multiple demo accounts on different dates
- Easy identification of when demo was created
- No cleanup conflicts between sessions

## Environment Configuration

| Environment | GCP Project | Supabase Project |
|-------------|-------------|------------------|
| `local/test` | `cloudact-testing-1` | `kwroaccbrxppfiysqlzs` |
| `stage` | `cloudact-stage` | `kwroaccbrxppfiysqlzs` |
| `prod` | `cloudact-prod` | `ovfxswhkkshouhsryzaf` |

## Reference Documentation

- **Full README**: `04-inra-cicd-automation/load-demo-data/README.md`
- **Load Scripts**: `04-inra-cicd-automation/load-demo-data/scripts/`
- **Onboarding Code**: `02-api-service/src/core/processors/setup/organizations/onboarding.py`
- **Cost Read Service**: `02-api-service/src/core/services/cost_read/service.py`
