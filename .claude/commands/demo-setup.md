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

## Complete Workflow

```
1. [Optional] Cleanup existing demo org
2. Create Account via Frontend (Playwright or browser)
3. Verify tables have partitioning/clustering
4. Get API key for org
5. Load demo raw data
6. Sync stored procedures
7. Run pipelines to generate costs
8. Verify dashboard
```

---

## Step 1: Cleanup (If Re-creating Demo Org)

### 1a. Delete BigQuery Dataset

```bash
export ORG_SLUG="acme_inc_01022026"
bq rm -r -f cloudact-testing-1:${ORG_SLUG}_local
```

### 1b. Delete from Central BigQuery Tables

```bash
bq query --use_legacy_sql=false "DELETE FROM \`cloudact-testing-1.organizations.org_profiles\` WHERE org_slug = '${ORG_SLUG}'"
bq query --use_legacy_sql=false "DELETE FROM \`cloudact-testing-1.organizations.org_api_keys\` WHERE org_slug = '${ORG_SLUG}'"
bq query --use_legacy_sql=false "DELETE FROM \`cloudact-testing-1.organizations.org_subscriptions\` WHERE org_slug = '${ORG_SLUG}'"
bq query --use_legacy_sql=false "DELETE FROM \`cloudact-testing-1.organizations.org_usage_quotas\` WHERE org_slug = '${ORG_SLUG}'"
bq query --use_legacy_sql=false "DELETE FROM \`cloudact-testing-1.organizations.org_hierarchy\` WHERE org_slug = '${ORG_SLUG}'"
```

### 1c. Delete from Supabase

**IMPORTANT**: Must disable `protect_owner` trigger first!

```sql
-- Run in Supabase SQL Editor (Test project: kwroaccbrxppfiysqlzs)

-- 1. Find user ID and org ID
SELECT id, email FROM auth.users WHERE email = 'john@example.com';
SELECT id, org_slug FROM organizations WHERE org_slug = 'acme_inc_01022026';

-- 2. Disable protect_owner trigger (prevents deletion)
ALTER TABLE public.organization_members DISABLE TRIGGER protect_owner;

-- 3. Delete in order (respecting foreign keys)
DELETE FROM public.organization_members WHERE org_id = '<org_id>';
DELETE FROM public.organizations WHERE org_slug = 'acme_inc_01022026';

-- 4. Re-enable trigger
ALTER TABLE public.organization_members ENABLE TRIGGER protect_owner;

-- 5. Delete user
DELETE FROM public.profiles WHERE id = '<user_id>';
DELETE FROM auth.users WHERE id = '<user_id>';
```

---

## Step 2: Create Demo Account

### Option A: Manual Browser Flow

1. Navigate to `http://localhost:3000/signup`
2. **Step 1 - Account Details:**
   - First name: `John`
   - Last name: `Doe`
   - Email: `john@example.com`
   - Password: `acme1234`
   - Phone: `5551234567`
   - Click "Continue"
3. **Step 2 - Organization:**
   - Company name: `Acme Inc 01022026`
   - Company type: `Company`
   - Currency: `$ USD`
   - Timezone: `PST/PDT - Los Angeles, USA`
   - Click "Create account"
4. **Plan Selection:**
   - Click "Select Plan" under Starter ($19)
   - Click "Continue to Checkout"
5. **Stripe Checkout:**
   - Click "Start trial" (no card needed for trial)
6. Wait for redirect to dashboard

### Option B: Playwright Automation (MCP)

Use Playwright MCP tools:
1. `browser_navigate` to `http://localhost:3000/signup`
2. `browser_fill_form` for account fields
3. `browser_click` for buttons
4. Follow the same flow as manual

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

# Get org API key
curl -s "http://localhost:8000/api/v1/admin/dev/api-key/acme_inc_01022026" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" | jq -r '.api_key'
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
curl -X POST "http://localhost:8001/api/v1/pipelines/run/${ORG_SLUG}/saas_subscription/costs/saas_cost" \
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

## Key Learnings & Gotchas

| Issue | Root Cause | Solution |
|-------|------------|----------|
| Dashboard shows $0 | `x_source_system` field is NULL | Pipelines must set this field |
| Cloud/SaaS shows $0 | Cost categorization uses `x_source_system` | Check stored procedures |
| Slow dashboard (~5s) | No partitioning on tables | Re-onboard to get partitioned tables |
| Supabase delete fails | `protect_owner` trigger | Disable trigger before deleting |
| Signup 400 error | Email confirmation enabled | Disable in Supabase Auth settings |
| Tables missing partition | Old onboarding code | Delete dataset and re-onboard |

## Cost Categorization Logic

The `cost_read` service (`02-api-service/src/core/services/cost_read/service.py`) categorizes costs using `x_source_system`:

```python
# GenAI: x_source_system contains "genai|llm|openai|anthropic|gemini"
# Cloud: x_source_system contains "cloud|gcp|aws|azure|oci"
# SaaS: x_source_system equals "subscription_costs_daily"
```

## Partitioning Configuration

All table partitioning is configured in:
- **File**: `02-api-service/src/app/routers/organizations.py` (lines 1309-1458)
- **Applied by**: `02-api-service/src/core/processors/setup/organizations/onboarding.py`

Key tables:
| Table | Partition Field | Clustering Fields |
|-------|-----------------|-------------------|
| `cost_data_standard_1_3` | `ChargePeriodStart` | `SubAccountId, ServiceProviderName, ServiceCategory` |
| `genai_payg_usage_raw` | `usage_date` | `provider, model` |
| `cloud_*_billing_raw_daily` | `usage_date` | provider-specific |
| `subscription_plan_costs_daily` | `cost_date` | `org_slug, subscription_id` |

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
