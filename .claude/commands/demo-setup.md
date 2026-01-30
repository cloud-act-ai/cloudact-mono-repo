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
| Email | `demo@cloudact.ai` |
| Password | `demo1234` |
| Company | `Acme Inc` |
| Org Slug | `acme_inc_{timestamp}` (auto-generated, base36) |
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
npx tsx tests/demo-setup/cleanup-demo-account.ts --email=demo@cloudact.ai
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
# Check costs (demo data spans Dec 2025 - Jan 2026)
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total?start_date=2025-12-01&end_date=2026-01-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Expected (Dec 2025 - Jan 2026 demo data):
# GenAI: ~$232K (480 records - OpenAI, Anthropic, Gemini)
# Cloud: ~$382 (523 records - GCP, AWS, Azure, OCI)
# Subscription: ~$1.4K (105 records - 15 SaaS providers)
# TOTAL: ~$234K
```

**Dashboard:** `http://localhost:3000/${ORG_SLUG}/dashboard`
**Login:** `demo@cloudact.ai` / `demo1234`

### Step 4: Configure Alerts (Optional)

Set up cost alerts for demo account via API:

```bash
# Create a GenAI cost alert (threshold: $1000)
curl -s -X POST "http://localhost:8000/api/v1/cost-alerts/${ORG_SLUG}" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GenAI Cost Alert",
    "description": "Alert when GenAI costs exceed $1000",
    "scope": "genai",
    "threshold_value": 1000,
    "severity": "warning",
    "channels": ["email"],
    "cooldown_hours": 24
  }' | jq

# Create a total cost alert with Slack (threshold: $5000)
curl -s -X POST "http://localhost:8000/api/v1/cost-alerts/${ORG_SLUG}" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Total Cost Critical",
    "description": "Critical alert when total costs exceed $5000",
    "scope": "all",
    "threshold_value": 5000,
    "severity": "critical",
    "channels": ["email", "slack"],
    "cooldown_hours": 12
  }' | jq

# List all alerts
curl -s "http://localhost:8000/api/v1/cost-alerts/${ORG_SLUG}" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Get available presets
curl -s "http://localhost:8000/api/v1/cost-alerts/${ORG_SLUG}/presets" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Create from preset (e.g., cloud_1000)
curl -s -X POST "http://localhost:8000/api/v1/cost-alerts/${ORG_SLUG}/from-preset/cloud_1000" \
  -H "X-API-Key: $ORG_API_KEY" | jq
```

**Alert Scopes:** `all`, `cloud`, `genai`, `subscription`, `gcp`, `aws`, `azure`, `oci`, `openai`, `anthropic`

**Severity Levels:** `info`, `warning`, `critical`

**Channels:** `email`, `slack`

**Slack Configuration (when Slack channel configured):**
```json
{
  "channels": ["email", "slack"],
  "channel_config": {
    "channel": "#cost-alerts",
    "mention_channel": true
  }
}
```

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
2. **Date range required** - Demo data spans Dec 2025 - Jan 2026, use `?start_date=2025-12-01&end_date=2026-01-31`
3. **GenAI pricing REQUIRED** - Load `genai_payg_pricing` before running cost calculation, otherwise costs are $0
4. **x_source_system** - Must be set for cost categorization:
   - `'subscription_costs_daily'` for SaaS
   - `'genai_costs_daily_unified'` for GenAI
   - `'cloud_*_billing_raw_daily'` for Cloud
5. **ServiceProviderName** - Must use full names for API filtering:
   - `"Amazon Web Services"` (NOT "aws")
   - `"Microsoft Azure"` (NOT "azure")
   - `"Oracle Cloud Infrastructure"` (NOT "oci")
   - `"Google Cloud"` (NOT "gcp")
6. **Model/pricing match** - Usage model names must EXACTLY match pricing entries

## Troubleshooting

| Issue | Solution |
|-------|----------|
| API shows $0 | Use date range: `?start_date=2025-12-01&end_date=2026-01-31` (demo data spans Dec 2025 - Jan 2026) |
| Pipeline stuck PENDING | Check for duplicate runs, wait for completion |
| No costs calculated | Verify `x_source_system` field is set in FOCUS table |
| Missing FOCUS data | Check procedure logs, verify raw tables have data |
| Procedure not found | Run `POST /api/v1/procedures/sync` (port 8001) |
| Signup 400 error | Disable email confirmation in Supabase Auth settings |
| Cleanup fails | Use Supabase MCP to disable `protect_owner` trigger |
| Pricing mismatch | Add exact model name to `genai_payg_pricing` |
| Cloud FOCUS fails "column not found" | Demo raw tables missing pricing columns - use ALTER TABLE to add them |
| AWS/Azure FOCUS returns 0 rows | `usage_date` column NULL - populate from `usage_start_time` |
| GenAI consolidation fails "x_genai_provider" | Add column to `genai_commitment_costs_daily` and `genai_infrastructure_costs_daily` |
| GenAI costs show $0 | Load pricing from `04-inra-cicd-automation/load-demo-data/data/pricing/genai_payg_pricing.csv` |
| API key mismatch | Re-sync generates new key - modified to return existing active key |
| Pipeline not found | Register pipeline in `02-api-service/configs/system/pipelines.yml` |
| FOCUS conversion BillingCurrency null | Dataset uses `_local` suffix - procedure expects `_prod`; use direct INSERT |

## Troubleshooting Reference (Only If Issues Occur)

The following fixes were applied during initial go-live and should NOT be needed again.
They are documented here only for reference if similar issues occur in new environments.

### Schema Fixes (Already Applied)

**Cloud Raw Tables** - These columns were added to demo data:

**All Cloud Tables:**
- `usage_date` (DATE) - Populate from `usage_start_time[:10]`

**GCP (`cloud_gcp_billing_raw_daily`):**
- `price_list_price`, `price_effective_price`, `price_unit`
- `price_tier_start_amount`, `price_pricing_unit_quantity`
- `adjustment_info_json`, `consumption_model_json`, `export_time`, `credits_json`

**AWS (`cloud_aws_billing_raw_daily`):**
- `resource_name`, `pricing_quantity`, `public_on_demand_rate`, `unblended_rate`
- `product_family`, `product_instance_type`, `product_operating_system`, `product_tenancy`
- `discount_*` columns, `bill_type`, `line_item_description`

**Azure (`cloud_azure_billing_raw_daily`):**
- `billing_account_id`, `billing_period_start/end`, `publisher_type/name`
- `pricing_model`, `pricing_unit/quantity`, `payg_price`, `effective_price`
- `cost_in_billing_currency`, `azure_credit_applied`, `additional_info_json`
- `savings_plan_id/name`, `benefit_id/name`

**OCI (`cloud_oci_billing_raw_daily`):**
- `platform_type`, `overage_flag`, `cost_type`, `list_rate`, `my_cost`
- `credits_total`, `credits_json`, `currency`, `is_correction`
- `freeform_tags_json`, `defined_tags_json`

### GenAI Raw Tables:
**Commitment & Infrastructure tables need:**
- `x_genai_provider` (STRING) - Copy from `provider`
- `x_ingestion_id` (STRING) - Generate UUID
- `x_ingestion_date` (DATE) - Copy from `usage_date`

### GenAI Cost Tables:
**Commitment & Infrastructure COST tables need:**
- `x_genai_provider` (STRING) - Required by consolidation procedure

### GenAI Pricing Data:
**Source:** `04-inra-cicd-automation/load-demo-data/data/pricing/genai_payg_pricing.csv`
**Schema:** `02-api-service/configs/setup/organizations/onboarding/schemas/genai_payg_pricing.json`
**Models:** OpenAI (gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo), Anthropic (claude-3.5-sonnet, claude-3-opus, claude-3-haiku), Gemini (gemini-1.5-pro, gemini-1.5-flash, gemini-1.0-pro)

## One-Liner (Full Setup)

```bash
cd 01-fronted-system && source .env.local

# 0. Cleanup
npx tsx tests/demo-setup/cleanup-demo-account.ts --email=demo@cloudact.ai

# 1. Create account
npx tsx tests/demo-setup/setup-demo-account.ts
# → Note org_slug and apiKey from output

# 2. Load data
export ORG_SLUG="acme_inc_01062026"
export ORG_API_KEY="..."
npx tsx tests/demo-setup/load-demo-data-direct.ts --org-slug=$ORG_SLUG --api-key=$ORG_API_KEY

# 3. Verify (use correct date range - demo data is Dec 2025 - Jan 2026)
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total?start_date=2025-12-01&end_date=2026-01-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq
```

## Validation Checklist

After demo setup, validate costs match across all three layers:

### 1. Backend API Validation
```bash
# Total costs summary
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total?start_date=2025-12-01&end_date=2026-01-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Expected response structure:
# {
#   "subscription": { "total_billed_cost": 1422.90, "record_count": 105 },
#   "cloud": { "total_billed_cost": 382.35, "record_count": 523 },
#   "genai": { "total_billed_cost": 232887.63, "record_count": 480 },
#   "total": { "total_billed_cost": 234692.88 }
# }

# Breakdown by provider
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/by-provider?start_date=2025-12-01&end_date=2026-01-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Daily trend
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/daily?start_date=2025-12-25&end_date=2026-01-05" \
  -H "X-API-Key: $ORG_API_KEY" | jq
```

### 2. BigQuery Direct Validation
```sql
-- Verify FOCUS table totals match API
SELECT
  x_source_system,
  COUNT(*) as records,
  ROUND(SUM(CAST(BilledCost AS FLOAT64)), 2) as total_cost
FROM `{project}.{dataset}.cost_data_standard_1_3`
WHERE ChargePeriodStart >= '2025-12-01' AND ChargePeriodStart < '2026-02-01'
GROUP BY x_source_system;

-- Expected:
-- | x_source_system            | records | total_cost |
-- |----------------------------|---------|------------|
-- | subscription_costs_daily   | 105     | 1422.90    |
-- | cloud_*_billing_raw_daily  | 523     | 382.35     |
-- | genai_costs_daily_unified  | 480     | 232887.63  |
```

### 3. Frontend Validation
1. **Login**: `http://localhost:3000` → `demo@cloudact.ai` / `demo1234`
2. **Dashboard**: `/{orgSlug}/dashboard`
   - Total cost card should show ~$234K
   - Cost breakdown pie chart: GenAI (99%), Cloud (<1%), Subscription (<1%)
   - Provider list: OpenAI, Anthropic, Gemini, GCP, AWS, Azure, OCI, 15 SaaS
3. **Cost Analytics**: `/{orgSlug}/analytics/costs`
   - Date filter: Set to Dec 2025 - Jan 2026
   - Verify totals match API response
4. **GenAI Analytics**: `/{orgSlug}/analytics/genai`
   - Should show OpenAI, Anthropic, Gemini breakdown
   - Token usage charts populated

### 4. Cross-Validation Checks
| Check | Backend | Frontend | BigQuery |
|-------|---------|----------|----------|
| Total records | `total.record_count` | N/A | `COUNT(*)` |
| Total cost | `total.total_billed_cost` | Dashboard card | `SUM(BilledCost)` |
| GenAI cost | `genai.total_billed_cost` | GenAI section | `WHERE x_source_system LIKE 'genai%'` |
| Cloud cost | `cloud.total_billed_cost` | Cloud section | `WHERE x_source_system LIKE 'cloud%'` |
| Subscription | `subscription.total_billed_cost` | SaaS section | `WHERE x_source_system = 'subscription_costs_daily'` |

### 5. Common Validation Issues
| Symptom | Cause | Fix |
|---------|-------|-----|
| Backend shows costs, Frontend $0 | Wrong date filter in UI | Set date range to Dec 2025 - Jan 2026 |
| BigQuery has data, API returns $0 | `x_source_system` not set | Check FOCUS table has correct source |
| Counts don't match | Duplicate records | Check for duplicate `x_run_id` values |
| Frontend loads forever | API timeout | Check API service logs, increase timeout |

## GenAI Pipeline Flow (For Understanding)

This is the internal flow - handled automatically by `load-demo-data-direct.ts`:

```
1. Load Usage Data → genai_payg_usage_raw
2. Load Pricing Data → genai_payg_pricing (included in demo data)
3. Calculate Costs → genai_payg_costs_daily
4. Consolidate → genai_costs_daily_unified
5. Convert to FOCUS → cost_data_standard_1_3
```

All steps run automatically via `/genai/unified/consolidate` pipeline.

### Manual BigQuery Commands (Emergency Use Only)

If pipelines fail after all fixes applied, these commands can calculate costs directly:

```sql
-- 1. Load pricing (if empty)
-- Transform CSV from 04-inra-cicd-automation/load-demo-data/data/pricing/genai_payg_pricing.csv to JSONL
-- Then: bq load --source_format=NEWLINE_DELIMITED_JSON {dataset}.genai_payg_pricing pricing.jsonl

-- 2. Calculate costs
INSERT INTO `{project}.{dataset}.genai_payg_costs_daily` (...)
SELECT ... FROM genai_payg_usage_raw u
LEFT JOIN genai_payg_pricing p ON u.provider = p.provider AND u.model = p.model;

-- 3. Add missing columns if consolidation fails
ALTER TABLE `{project}.{dataset}.genai_commitment_costs_daily`
ADD COLUMN IF NOT EXISTS x_genai_provider STRING;
ALTER TABLE `{project}.{dataset}.genai_infrastructure_costs_daily`
ADD COLUMN IF NOT EXISTS x_genai_provider STRING;

-- 4. Sync procedures
curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" -d '{"force": true}'
```

## Reference

- Demo Setup: `01-fronted-system/tests/demo-setup/README.md`
- Load Data: `04-inra-cicd-automation/load-demo-data/README.md`
- GenAI Pricing: `04-inra-cicd-automation/load-demo-data/data/pricing/genai_payg_pricing.csv`
- Pipeline Registry: `02-api-service/configs/system/pipelines.yml`
- Onboarding: `02-api-service/src/core/processors/setup/organizations/onboarding.py`
- Procedures: `03-data-pipeline-service/configs/system/procedures/`
