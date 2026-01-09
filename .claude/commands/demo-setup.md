# Demo Account Setup

Create demo account with realistic data for testing and demonstration.

## Scripts

All scripts in: `01-fronted-system/tests/demo-setup/`

| Script | Purpose |
|--------|---------|
| `cleanup-demo-account.ts` | Delete user/org from Supabase + BigQuery |
| `setup-demo-account.ts` | Create account via Playwright (includes Stripe checkout + API key) |
| `load-demo-data-direct.ts` | Load raw data + run pipelines via API |

## Demo Account Values

| Field | Value |
|-------|-------|
| Email | `john@example.com` |
| Password | `acme1234` |
| Company | `Acme Inc` |
| Org Slug | `acme_inc_{MMDDYYYY}` (auto-generated) |
| Plan | `scale` (14-day trial) |
| Currency | `USD` |
| Timezone | `PST/PDT - Los Angeles, USA` |

## Prerequisites

```bash
# 1. Bootstrap MUST be done first
curl -s -X POST "http://localhost:8000/api/v1/admin/bootstrap" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" -d '{}'

# 2. Services running
# - Frontend: http://localhost:3000
# - API Service: http://localhost:8000
# - Pipeline Service: http://localhost:8001

# 3. Supabase: Email confirmation DISABLED

# 4. Load environment
source 01-fronted-system/.env.local
```

## Workflow

### Step 0: Cleanup (if re-creating)
```bash
cd 01-fronted-system
npx tsx tests/demo-setup/cleanup-demo-account.ts --email=john@example.com
```

### Step 1: Create Account
```bash
cd 01-fronted-system
npx tsx tests/demo-setup/setup-demo-account.ts

# Output:
# {
#   "success": true,
#   "orgSlug": "acme_inc_01062026",
#   "apiKey": "org_api_key_...",
#   "dashboardUrl": "http://localhost:3000/acme_inc_01062026/dashboard"
# }
```

**What it does:**
1. Navigates to `/signup`
2. Fills account + org details
3. Selects billing plan
4. Completes Stripe checkout (auto-clicks "Start trial")
5. Fetches API key from backend
6. Returns org slug, API key, dashboard URL

### Step 2: Load Data + Run Pipelines
```bash
export ORG_SLUG="acme_inc_01062026"  # From Step 1
export ORG_API_KEY="..."             # From Step 1

# Full workflow (raw data + pipelines)
npx tsx tests/demo-setup/load-demo-data-direct.ts \
  --org-slug=$ORG_SLUG \
  --api-key=$ORG_API_KEY

# Raw data only
npx tsx tests/demo-setup/load-demo-data-direct.ts \
  --org-slug=$ORG_SLUG \
  --api-key=$ORG_API_KEY \
  --raw-only

# Pipelines only
npx tsx tests/demo-setup/load-demo-data-direct.ts \
  --org-slug=$ORG_SLUG \
  --api-key=$ORG_API_KEY \
  --pipelines-only
```

**What it does:**
- **Stage 1:** Loads pricing, usage, billing, subscriptions via `bq` CLI
- **Stage 2:** Syncs procedures + runs pipelines via API (8001)
- **Auto-fixes:** Re-syncs procedures if pipeline fails
- **Diagnostics:** Shows detailed failure analysis + suggested fixes

### Step 3: Verify
```bash
# Check costs (MUST use 2025 date range - demo data is 2025 only)
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total?start_date=2025-01-01&end_date=2025-12-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Expected (full year 2025):
# GenAI: ~$2.66M (4015 records)
# Cloud: ~$1.42M (12045 records - GCP, AWS, Azure, OCI)
# Subscription: ~$76K (5475 records - 15 SaaS providers)
# TOTAL: ~$4.16M
```

**Dashboard:** `http://localhost:3000/${ORG_SLUG}/dashboard`
**Login:** `john@example.com` / `acme1234`

## Data Architecture

```
Stage 1: Raw Data (bq CLI)
  ├─ organizations.genai_payg_pricing
  ├─ {org}_local.genai_payg_usage_raw
  ├─ {org}_local.cloud_*_billing_raw_daily (GCP, AWS, Azure, OCI)
  └─ {org}_local.subscription_plans

Stage 2: Pipelines (API 8001)
  ├─ Subscription → subscription_plan_costs_daily → cost_data_standard_1_3
  ├─ GenAI → genai_costs_daily_unified → cost_data_standard_1_3
  └─ Cloud → cost_data_standard_1_3 (FOCUS conversion)
```

## Critical Rules

1. **Bootstrap first** - Required before signup, otherwise no API key created
2. **Date range required** - Cloud/GenAI data is 2025 only, API defaults to 2026
3. **x_source_system** - Must be set for cost categorization:
   - `'subscription_costs_daily'` for SaaS
   - `'genai_costs_daily_unified'` for GenAI
   - `'cloud_*_billing_raw_daily'` for Cloud
4. **ServiceProviderName** - Must use full names for API filtering:
   - `"Amazon Web Services"` (NOT "aws")
   - `"Microsoft Azure"` (NOT "azure")
   - `"Oracle Cloud Infrastructure"` (NOT "oci")
   - `"Google Cloud"` (NOT "gcp")
5. **Model/pricing match** - Usage model names must EXACTLY match pricing entries

## Troubleshooting

| Issue | Solution |
|-------|----------|
| API shows $0 | Use date range: `?start_date=2025-01-01&end_date=2025-12-31` |
| Pipeline stuck PENDING | Check for duplicate runs, wait for completion |
| No costs calculated | Verify `x_source_system` field is set in FOCUS table |
| Missing FOCUS data | Check procedure logs, verify raw tables have data |
| Procedure not found | Run `POST /api/v1/procedures/sync` (port 8001) |
| Signup 400 error | Disable email confirmation in Supabase Auth settings |
| Cleanup fails | Use Supabase MCP to disable `protect_owner` trigger |
| Pricing mismatch | Add exact model name to `genai_payg_pricing` |

## One-Liner (Full Setup)

```bash
cd 01-fronted-system && source .env.local

# 0. Cleanup
npx tsx tests/demo-setup/cleanup-demo-account.ts --email=john@example.com

# 1. Create account
npx tsx tests/demo-setup/setup-demo-account.ts
# → Note org_slug and apiKey from output

# 2. Load data
export ORG_SLUG="acme_inc_01062026"
export ORG_API_KEY="..."
npx tsx tests/demo-setup/load-demo-data-direct.ts --org-slug=$ORG_SLUG --api-key=$ORG_API_KEY

# 3. Verify
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total?start_date=2025-01-01&end_date=2025-12-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq
```

## Reference

- Demo Setup: `01-fronted-system/tests/demo-setup/README.md`
- Load Data: `04-inra-cicd-automation/load-demo-data/README.md`
- Onboarding: `02-api-service/src/core/processors/setup/organizations/onboarding.py`
- Procedures: `03-data-pipeline-service/configs/system/procedures/`
