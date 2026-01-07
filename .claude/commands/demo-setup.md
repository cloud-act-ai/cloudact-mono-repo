# Demo Account Setup

**Purpose**: Create a demo account with realistic demo data for testing and demonstration.

## Quick Reference

All scripts are consolidated in: `01-fronted-system/tests/demo-setup/`

| Script | Purpose |
|--------|---------|
| `cleanup-demo-account.ts` | Delete user + org from Supabase + BigQuery |
| `setup-demo-account.ts` | Create account via Playwright (includes Stripe checkout + API key fetch) |
| `load-demo-data-direct.ts` | Load raw data + run pipelines via Pipeline Service API |

## Demo Account Values

| Field | Value |
|-------|-------|
| Email | `john@example.com` |
| Password | `acme1234` |
| First Name | `Alex` |
| Last Name | `Kumar` |
| Phone | `5559876543` |
| Company | `Acme Inc` |
| Org Slug | `acme_inc_{MMDDYYYY}` (auto-generated, query from DB for actual value) |
| Plan | `scale` (14-day free trial, no credit card required) |
| Timezone | `PST/PDT - Los Angeles, USA` |
| Currency | `USD` |

## Prerequisites

1. **Bootstrap MUST be done first** (creates `organizations` dataset):
   ```bash
   curl -s -X POST "http://localhost:8000/api/v1/admin/bootstrap" \
     -H "Content-Type: application/json" \
     -H "X-CA-Root-Key: $CA_ROOT_API_KEY" -d '{}'
   ```
2. Frontend running: `http://localhost:3000`
3. API Service running: `http://localhost:8000`
4. Pipeline Service running: `http://localhost:8001`
5. Supabase: Email confirmation DISABLED in Auth settings
6. GCP authenticated: `gcloud auth login`
7. Environment variables loaded: `source 01-fronted-system/.env.local`

**CRITICAL:** If bootstrap is not done, signup will create user/org in Supabase but backend onboarding will FAIL (no API key created).

---

## Complete Workflow

```
Step 0: Cleanup existing demo org (if re-creating)
Step 1: Create Account via Playwright (includes Stripe checkout)
Step 2: Load demo data (Stage 1: bq CLI + Stage 2: Pipeline Service)
Step 3: Verify dashboard
```

---

## Step 0: Cleanup (If Re-creating Demo Org)

```bash
cd 01-fronted-system
source .env.local

# Cleanup by email
npx tsx tests/demo-setup/cleanup-demo-account.ts --email=john@example.com

# OR cleanup by org slug (query actual slug from Supabase first)
npx tsx tests/demo-setup/cleanup-demo-account.ts --org-slug=acme_inc_01062026
```

This automatically:
- Deletes auth.users record
- Deletes profiles record
- Deletes organization_members records
- Deletes organizations record
- Deletes BigQuery dataset (`{org_slug}_local`)

---

## Step 1: Create Demo Account (Playwright)

**ALWAYS use Playwright to create demo accounts.** This automates the full signup flow including Stripe checkout.

```bash
cd 01-fronted-system
source .env.local

# Default demo account (john@example.com / acme1234)
npx tsx tests/demo-setup/setup-demo-account.ts

# Custom email
npx tsx tests/demo-setup/setup-demo-account.ts --email=custom@test.com

# Custom company (org slug derived from company name)
npx tsx tests/demo-setup/setup-demo-account.ts --company="My Company"

# Run with visible browser (not headless)
TEST_HEADLESS=false npx tsx tests/demo-setup/setup-demo-account.ts
```

### What the Playwright Script Does

1. Navigates to `/signup`
2. Fills Step 1 (Account Details): name, email, password, phone
3. Fills Step 2 (Organization): company name, type, currency, timezone
4. Clicks "Create account" (triggers Supabase signup + backend onboarding)
5. Selects billing plan on `/onboarding/billing`
6. Clicks "Continue to Checkout" (redirects to Stripe)
7. **Clicks "Start trial" on Stripe** (no credit card required)
8. Waits for redirect to dashboard
9. **Fetches API key from backend**
10. Returns org slug, API key, and dashboard URL

**Output:**
```json
{
  "success": true,
  "orgSlug": "acme_inc_01062026",
  "apiKey": "org_api_key_...",
  "dashboardUrl": "http://localhost:3000/acme_inc_01062026/dashboard"
}
```

---

## Step 2: Load Demo Data + Run Pipelines

**Two-stage data loading process:**

- **Stage 1:** Load raw data via BigQuery `bq` CLI
- **Stage 2:** Run pipelines via Pipeline Service API

```bash
cd 01-fronted-system

# Use values from Step 1 output
export ORG_SLUG="acme_inc_01062026"
export ORG_API_KEY="org_api_key_..."

# Full mode (Stage 1 + Stage 2)
npx tsx tests/demo-setup/load-demo-data-direct.ts \
  --org-slug=$ORG_SLUG \
  --api-key=$ORG_API_KEY

# Stage 1 only (raw data)
npx tsx tests/demo-setup/load-demo-data-direct.ts \
  --org-slug=$ORG_SLUG \
  --api-key=$ORG_API_KEY \
  --raw-only

# Stage 2 only (pipelines)
npx tsx tests/demo-setup/load-demo-data-direct.ts \
  --org-slug=$ORG_SLUG \
  --api-key=$ORG_API_KEY \
  --pipelines-only
```

### What It Does

**Stage 1 (Raw Data):**
1. Loads pricing seed data → `organizations.genai_payg_pricing`
2. Loads GenAI usage raw → `{org}_local.genai_payg_usage_raw`
3. Loads Cloud billing raw → `{org}_local.cloud_*_billing_raw_daily`
4. Loads Subscription plans → `{org}_local.subscription_plans`

**Stage 2 (Pipelines):**
1. **Pre-flight health check** on API Service (8000) and Pipeline Service (8001)
2. Syncs stored procedures via `POST /api/v1/procedures/sync`
3. Runs subscription pipeline via `/pipelines/run/{org}/subscription/costs/subscription_cost`
4. Runs GenAI pipeline via `/pipelines/run/{org}/genai/unified/consolidate`
5. Runs Cloud FOCUS pipeline via `/pipelines/run/{org}/cloud/unified/cost/focus_convert`
6. Waits for pipelines to complete
7. **Diagnoses failures** and attempts auto-fixes
8. Verifies `cost_data_standard_1_3`
9. **Prints comprehensive final status report**

**Data Location**: `04-inra-cicd-automation/load-demo-data/data/`

### Error Investigation & Auto-Fix

The script **investigates pipeline failures** rather than just continuing:

1. **Pre-flight Health Check**
   - Checks API Service (8000) and Pipeline Service (8001) are healthy
   - Aborts if Pipeline Service is down (unless `--raw-only`)

2. **Pipeline Failure Diagnosis**
   - Analyzes error messages for common patterns
   - Checks if source tables exist
   - Identifies schema mismatches, missing data, permission issues

3. **Auto-Fix Capabilities**
   - Re-syncs stored procedures if procedure-related errors detected
   - Retries pipeline after successful auto-fix

4. **Final Status Report**
   - Shows service health status
   - Shows raw data loading status
   - Shows pipeline execution status with diagnosis
   - Lists auto-fixes applied
   - Provides next steps for manual fixes if needed

**Common Auto-Fixes:**
| Error Pattern | Auto-Fix | Manual Fix |
|---------------|----------|------------|
| `procedure not found` | Re-sync procedures | Check procedure configs |
| `404 pipeline not found` | Re-sync procedures | Check pipeline config exists |
| `schema mismatch` | N/A | Check table schema matches procedure |
| `No data` / `empty` | N/A | Load raw data with `--raw-only` |
| `permission denied` | N/A | Check API key has access |

---

## Step 3: Verify Dashboard

```bash
# Check costs via API (with 2025 date range)
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total?start_date=2025-01-01&end_date=2025-12-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Expected output (full year 2025):
# GenAI: ~$2.66M (4015 records - Anthropic, OpenAI, Google AI)
# Cloud: ~$1.42M (12045 records - GCP, AWS, Azure, OCI)
# Subscription: ~$76K (5475 records - 15 SaaS providers)
# TOTAL: ~$4.16M
```

**Dashboard URL**: `http://localhost:3000/${ORG_SLUG}/dashboard`

**Login**: `john@example.com` / `acme1234`

**⚠️ CRITICAL**: Demo data for Cloud and GenAI is for **2025 ONLY**.
- API defaults to **current month (Jan 2026)** which shows **$0 for Cloud and GenAI**
- You MUST specify date range: `?start_date=2025-01-01&end_date=2025-12-31`
- Dashboard must be set to **2025** date range to see Cloud/GenAI costs
- Subscription data has 2026 dates, so it shows costs even without date filter

**API with custom date range**:
```bash
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total?start_date=2025-12-01&end_date=2025-12-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq
```

---

## One-Liner (Full Setup)

```bash
cd 01-fronted-system
source .env.local

# 0. Cleanup existing
npx tsx tests/demo-setup/cleanup-demo-account.ts --email=john@example.com

# 1. Create account (Playwright)
npx tsx tests/demo-setup/setup-demo-account.ts
# → Note the org_slug and apiKey from output

# 2. Load data + run pipelines (use values from step 1)
export ORG_SLUG="acme_inc_01062026"
export ORG_API_KEY="..."  # From step 1 output
npx tsx tests/demo-setup/load-demo-data-direct.ts --org-slug=$ORG_SLUG --api-key=$ORG_API_KEY

# 3. Verify
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total" -H "X-API-Key: $ORG_API_KEY" | jq
```

---

## Key Learnings & Gotchas

| Issue | Root Cause | Solution |
|-------|------------|----------|
| Dashboard shows $0 | `x_source_system` field is NULL | Procedures must set this field |
| Cloud/SaaS shows $0 | Cost categorization uses `x_source_system` | Check stored procedures |
| Slow dashboard (~5s) | No partitioning on tables | Re-onboard to get partitioned tables |
| Supabase delete fails | `protect_owner` trigger | Use cleanup script |
| Signup 400 error | Email confirmation enabled | Disable in Supabase Auth settings |
| Tables missing partition | Old onboarding code | Delete dataset and re-onboard |
| Stripe checkout hangs | Test mode requires manual action | Script auto-clicks "Start trial" |
| Procedure fails | Procedures not synced | Script auto-syncs + retries |
| Pipeline fails | Multiple possible causes | **Script diagnoses and shows fix** |
| Service unhealthy | Service not running | Script shows which service to start |
| Source table missing | Raw data not loaded | Script suggests `--raw-only` flag |
| Schema mismatch | Table schema differs from procedure | Check procedure SQL expectations |
| API shows $0 costs | `x_source_system` categorization issue | Check cost_data_standard_1_3 directly via bq query |
| Pricing seed "ERROR" | bq output contains progress text | Actually succeeded (check for "DONE" in output) |
| Wrong org_slug in data | Source CSV has hardcoded org_slug | Load script auto-replaces org_slug from arg |
| GenAI shows $0 | Costs not calculated from usage | GenAI needs cost calculation from usage + pricing |
| GenAI PAYG pipeline fails | Requires integration credentials | Run cost MERGE query directly via BigQuery |
| GenAI pricing mismatch | Usage model names don't match pricing | Add pricing for exact model names (e.g., `claude-3-5-sonnet-20241022`) |
| GenAI provider mismatch | Usage has `gemini`, pricing has `google` | Add pricing with matching provider name |
| Cloud pipeline 404 | Cloud unified pipeline not configured | Run sp_convert_cloud_costs_to_focus_1_3 directly |
| API shows $0 for Cloud/GenAI | API defaults to current month (2026), demo data is 2025 | **MUST use date range**: `?start_date=2025-01-01&end_date=2025-12-31` |
| Subscription shows costs but Cloud/GenAI $0 | Subscription data has 2026 dates, Cloud/GenAI only 2025 | Set dashboard to 2025 date range |
| Cloud only shows 1st of month | Procedure run per-date | Run procedure loop for all dates in range |
| Consolidation only 1st of month | sp_consolidate_* processes single date | Use bulk INSERT for all dates at once |
| Missing x_source_system | GenAI data categorization | Must set x_source_system='genai_costs_daily_unified' in FOCUS insert |
| Only GCP in FOCUS | Cloud FOCUS conversion not done for other providers | Run bulk INSERT for AWS, Azure, OCI (see Cloud FOCUS section) |
| Cloud API filtering fails | ServiceProviderName must be exact full name | Use "Amazon Web Services", "Microsoft Azure", "Oracle Cloud Infrastructure" |

### GenAI Cost Calculation (CRITICAL - Missing Step)

The GenAI PAYG pipeline requires integration credentials. For demo data, run cost calculation directly via BigQuery:

**Step 1: Verify pricing matches usage models**
```bash
# Check for model mismatches (should return empty)
bq query --use_legacy_sql=false "
SELECT DISTINCT u.provider, u.model, p.model as pricing_match
FROM \`cloudact-testing-1.{ORG_SLUG}_local.genai_payg_usage_raw\` u
LEFT JOIN \`cloudact-testing-1.{ORG_SLUG}_local.genai_payg_pricing\` p
    ON u.provider = p.provider AND u.model = p.model
WHERE p.model IS NULL"
```

If mismatches exist, add matching pricing entries (see pricing CSV format below).

**Step 2: Run cost calculation MERGE**
```bash
bq query --use_legacy_sql=false "
MERGE \`cloudact-testing-1.{ORG_SLUG}_local.genai_payg_costs_daily\` T
USING (
    SELECT u.usage_date as cost_date, u.org_slug, u.provider, u.model, u.model_family, u.region,
        u.input_tokens, u.output_tokens, u.cached_input_tokens, u.total_tokens,
        ROUND(u.input_tokens * COALESCE(p.override_input_per_1m, p.input_per_1m) / 1000000, 6) as input_cost_usd,
        ROUND(u.output_tokens * COALESCE(p.override_output_per_1m, p.output_per_1m) / 1000000, 6) as output_cost_usd,
        ROUND(COALESCE(u.cached_input_tokens, 0) * COALESCE(p.cached_input_per_1m, p.input_per_1m * 0.5) / 1000000, 6) as cached_cost_usd,
        ROUND((u.input_tokens * COALESCE(p.override_input_per_1m, p.input_per_1m) +
               u.output_tokens * COALESCE(p.override_output_per_1m, p.output_per_1m)) / 1000000, 6) as total_cost_usd,
        0 as discount_applied_pct,
        p.input_per_1m as effective_rate_input, p.output_per_1m as effective_rate_output,
        u.request_count, u.hierarchy_entity_id, u.hierarchy_entity_name,
        u.hierarchy_level_code, u.hierarchy_path, u.hierarchy_path_names,
        CURRENT_TIMESTAMP() as calculated_at,
        'genai_payg_cost_demo' as x_pipeline_id, u.x_credential_id,
        u.usage_date as x_pipeline_run_date, 'demo_cost_calc' as x_run_id, CURRENT_TIMESTAMP() as x_ingested_at
    FROM \`cloudact-testing-1.{ORG_SLUG}_local.genai_payg_usage_raw\` u
    INNER JOIN \`cloudact-testing-1.{ORG_SLUG}_local.genai_payg_pricing\` p
        ON u.provider = p.provider AND u.model = p.model AND (p.region = u.region OR p.region = 'global')
) S ON T.cost_date = S.cost_date AND T.org_slug = S.org_slug AND T.provider = S.provider AND T.model = S.model
WHEN MATCHED THEN UPDATE SET total_cost_usd = S.total_cost_usd, input_cost_usd = S.input_cost_usd,
    output_cost_usd = S.output_cost_usd, x_ingested_at = S.x_ingested_at
WHEN NOT MATCHED THEN INSERT ROW"
```

**Step 3: Bulk consolidate to unified table**
```bash
bq query --use_legacy_sql=false "
DELETE FROM \`cloudact-testing-1.{ORG_SLUG}_local.genai_costs_daily_unified\` WHERE 1=1;
INSERT INTO \`cloudact-testing-1.{ORG_SLUG}_local.genai_costs_daily_unified\`
(cost_date, org_slug, cost_type, provider, model, region, input_cost_usd, output_cost_usd,
 total_cost_usd, discount_applied_pct, usage_quantity, usage_unit, source_table, consolidated_at,
 x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
SELECT cost_date, org_slug, 'payg', provider, model, region, input_cost_usd, output_cost_usd,
       total_cost_usd, discount_applied_pct, total_tokens, 'tokens', 'genai_payg_costs_daily',
       CURRENT_TIMESTAMP(), 'demo_consolidate', x_credential_id, cost_date, 'demo_run', CURRENT_TIMESTAMP()
FROM \`cloudact-testing-1.{ORG_SLUG}_local.genai_payg_costs_daily\`"
```

**Step 4: Convert to FOCUS 1.3**
```bash
bq query --use_legacy_sql=false "
INSERT INTO \`cloudact-testing-1.{ORG_SLUG}_local.cost_data_standard_1_3\`
(ChargePeriodStart, ChargePeriodEnd, BillingAccountId, BillingCurrency, InvoiceIssuerName,
 ServiceProviderName, ServiceCategory, ServiceName, ResourceId, ResourceName, ResourceType,
 RegionId, RegionName, ConsumedQuantity, ConsumedUnit, EffectiveCost, BilledCost,
 ChargeCategory, ChargeType, x_genai_cost_type, x_genai_provider, x_genai_model,
 x_source_system, x_pipeline_id, x_ingested_at)
SELECT TIMESTAMP(cost_date), TIMESTAMP(cost_date), org_slug, 'USD',
       CASE provider WHEN 'openai' THEN 'OpenAI' WHEN 'anthropic' THEN 'Anthropic' WHEN 'gemini' THEN 'Google' ELSE provider END,
       provider, 'AI and Machine Learning', CONCAT(provider, ' API'), model, model, cost_type,
       COALESCE(region, 'global'), COALESCE(region, 'global'), usage_quantity, usage_unit,
       total_cost_usd, total_cost_usd, 'Usage', 'Usage', cost_type, provider, model,
       'genai_costs_daily_unified', 'demo_focus', CURRENT_TIMESTAMP()
FROM \`cloudact-testing-1.{ORG_SLUG}_local.genai_costs_daily_unified\`
WHERE total_cost_usd > 0"
```

### Pipeline Execution via BigQuery

For demo data without integration credentials, run procedures directly:

```bash
# Cloud FOCUS conversion (all providers, per-date)
bq query --use_legacy_sql=false "
CALL \`cloudact-testing-1.organizations\`.sp_convert_cloud_costs_to_focus_1_3(
  'cloudact-testing-1',
  'acme_inc_01062026_local',
  DATE('2025-12-01'),
  'all',
  'demo_cloud_pipeline',
  'demo_credential',
  'demo_run_001'
)"

# Cloud conversion for all months (loop)
for month in 01 02 03 04 05 06 07 08 09 10 11 12; do
  bq query --use_legacy_sql=false "
  CALL \`cloudact-testing-1.organizations\`.sp_convert_cloud_costs_to_focus_1_3(
    'cloudact-testing-1',
    'acme_inc_01062026_local',
    DATE('2025-${month}-01'),
    'all',
    'demo_cloud_pipeline',
    'demo_credential',
    'demo_run_${month}'
  )"
done

# GenAI usage consolidation (per-date)
bq query --use_legacy_sql=false "
CALL \`cloudact-testing-1.organizations\`.sp_consolidate_genai_usage_daily(
  'cloudact-testing-1',
  'acme_inc_01062026_local',
  DATE('2025-01-01'),
  NULL,
  'demo_pipeline',
  NULL
)"

# GenAI cost consolidation (per-date) - requires genai_payg_costs_daily to have data
bq query --use_legacy_sql=false "
CALL \`cloudact-testing-1.organizations\`.sp_consolidate_genai_costs_daily(
  'cloudact-testing-1',
  'acme_inc_01062026_local',
  DATE('2025-01-01'),
  NULL,
  'demo_pipeline',
  NULL
)"
```

### Pipeline Flow

```
Subscription:
  subscription_plans → sp_calculate_subscription_plan_costs_daily → subscription_plan_costs_daily
  subscription_plan_costs_daily → sp_convert_subscription_costs_to_focus_1_3 → cost_data_standard_1_3

GenAI (requires cost calculation first):
  genai_payg_usage_raw + genai_payg_pricing → PAYGCostProcessor/MERGE → genai_payg_costs_daily
  genai_payg_costs_daily → sp_consolidate_genai_costs_daily → genai_costs_daily_unified
  genai_costs_daily_unified → sp_convert_genai_to_focus_1_3 → cost_data_standard_1_3

Cloud:
  cloud_*_billing_raw_daily → sp_convert_cloud_costs_to_focus_1_3 → cost_data_standard_1_3
```

### Cloud FOCUS Conversion (CRITICAL - Per-Provider Column Mapping)

The cloud FOCUS conversion procedure only handles GCP by default. For AWS, Azure, and OCI, run bulk INSERT queries directly:

**Raw table column differences:**
| Provider | Cost Column | Quantity Column | Account ID Column |
|----------|-------------|-----------------|-------------------|
| GCP | `cost` | `usage_amount` | `billing_account_id` |
| AWS | `unblended_cost` | `usage_amount` | `payer_account_id` |
| Azure | `cost_in_billing_currency` | `usage_quantity` | `subscription_id` |
| OCI | `cost` | `usage_quantity` | `tenancy_id` |

**CRITICAL:** `ServiceProviderName` must be exact full name for API filtering:
- `"Amazon Web Services"` (NOT "aws" or "AWS")
- `"Microsoft Azure"` (NOT "azure")
- `"Oracle Cloud Infrastructure"` (NOT "oci")
- `"Google Cloud"` (already set by procedure)

**AWS FOCUS Conversion:**
```bash
bq query --nouse_legacy_sql "
INSERT INTO \`cloudact-testing-1.{ORG_SLUG}_local.cost_data_standard_1_3\`
(BillingAccountId, BillingAccountName, SubAccountId, SubAccountName, ServiceProviderName,
 HostProviderName, InvoiceIssuerName, ProviderName, PublisherName, ServiceCategory,
 ServiceName, ResourceId, ResourceName, RegionName, BilledCost, EffectiveCost, ListCost,
 BillingCurrency, PricingCategory, ConsumedQuantity, ConsumedUnit, ChargeCategory, ChargeClass,
 ChargePeriodStart, ChargePeriodEnd, BillingPeriodStart, BillingPeriodEnd, ContractedCost,
 x_source_system, x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
SELECT
  payer_account_id, 'AWS Payer Account', '{ORG_SLUG}', 'Acme Inc',
  'Amazon Web Services', 'Amazon Web Services', 'Amazon Web Services', 'Amazon Web Services', 'Amazon Web Services',
  product_name, service_code, resource_id, resource_id, region,
  CAST(unblended_cost AS NUMERIC), CAST(unblended_cost AS NUMERIC), CAST(unblended_cost AS NUMERIC),
  'USD', 'On-Demand', CAST(usage_amount AS NUMERIC), 'Unit', 'Usage', 'Standard',
  TIMESTAMP(usage_date), TIMESTAMP(DATE_ADD(usage_date, INTERVAL 1 DAY)),
  TIMESTAMP(DATE_TRUNC(usage_date, MONTH)), TIMESTAMP(LAST_DAY(usage_date)), CAST(0 AS NUMERIC),
  'cloud_aws_billing_raw_daily', 'demo_focus_convert', 'demo_credential',
  usage_date, 'demo_run_aws', CURRENT_TIMESTAMP()
FROM \`cloudact-testing-1.{ORG_SLUG}_local.cloud_aws_billing_raw_daily\`
WHERE org_slug = '{ORG_SLUG}'
"
```

**Azure FOCUS Conversion:**
```bash
bq query --nouse_legacy_sql "
INSERT INTO \`cloudact-testing-1.{ORG_SLUG}_local.cost_data_standard_1_3\`
(BillingAccountId, BillingAccountName, SubAccountId, SubAccountName, ServiceProviderName,
 HostProviderName, InvoiceIssuerName, ProviderName, PublisherName, ServiceCategory,
 ServiceName, ResourceId, ResourceName, RegionName, BilledCost, EffectiveCost, ListCost,
 BillingCurrency, PricingCategory, ConsumedQuantity, ConsumedUnit, ChargeCategory, ChargeClass,
 ChargePeriodStart, ChargePeriodEnd, BillingPeriodStart, BillingPeriodEnd, ContractedCost,
 x_source_system, x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
SELECT
  subscription_id, subscription_name, '{ORG_SLUG}', 'Acme Inc',
  'Microsoft Azure', 'Microsoft Azure', 'Microsoft Azure', 'Microsoft Azure', 'Microsoft Azure',
  meter_category, service_name, resource_id, resource_name, resource_location,
  CAST(cost_in_billing_currency AS NUMERIC), CAST(cost_in_billing_currency AS NUMERIC), CAST(cost_in_billing_currency AS NUMERIC),
  COALESCE(billing_currency, 'USD'), 'On-Demand', CAST(usage_quantity AS NUMERIC), unit_of_measure, 'Usage', 'Standard',
  TIMESTAMP(usage_date), TIMESTAMP(DATE_ADD(usage_date, INTERVAL 1 DAY)),
  TIMESTAMP(DATE_TRUNC(usage_date, MONTH)), TIMESTAMP(LAST_DAY(usage_date)), CAST(0 AS NUMERIC),
  'cloud_azure_billing_raw_daily', 'demo_focus_convert', 'demo_credential',
  usage_date, 'demo_run_azure', CURRENT_TIMESTAMP()
FROM \`cloudact-testing-1.{ORG_SLUG}_local.cloud_azure_billing_raw_daily\`
WHERE org_slug = '{ORG_SLUG}'
"
```

**OCI FOCUS Conversion:**
```bash
bq query --nouse_legacy_sql "
INSERT INTO \`cloudact-testing-1.{ORG_SLUG}_local.cost_data_standard_1_3\`
(BillingAccountId, BillingAccountName, SubAccountId, SubAccountName, ServiceProviderName,
 HostProviderName, InvoiceIssuerName, ProviderName, PublisherName, ServiceCategory,
 ServiceName, ResourceId, ResourceName, RegionName, BilledCost, EffectiveCost, ListCost,
 BillingCurrency, PricingCategory, ConsumedQuantity, ConsumedUnit, ChargeCategory, ChargeClass,
 ChargePeriodStart, ChargePeriodEnd, BillingPeriodStart, BillingPeriodEnd, ContractedCost,
 x_source_system, x_pipeline_id, x_credential_id, x_pipeline_run_date, x_run_id, x_ingested_at)
SELECT
  tenancy_id, tenancy_name, '{ORG_SLUG}', 'Acme Inc',
  'Oracle Cloud Infrastructure', 'Oracle Cloud Infrastructure', 'Oracle Cloud Infrastructure', 'Oracle Cloud Infrastructure', 'Oracle Cloud Infrastructure',
  service_name, sku_name, resource_id, resource_name, region,
  CAST(cost AS NUMERIC), CAST(cost AS NUMERIC), CAST(cost AS NUMERIC),
  COALESCE(currency, 'USD'), 'On-Demand', CAST(usage_quantity AS NUMERIC), unit, 'Usage', 'Standard',
  TIMESTAMP(usage_date), TIMESTAMP(DATE_ADD(usage_date, INTERVAL 1 DAY)),
  TIMESTAMP(DATE_TRUNC(usage_date, MONTH)), TIMESTAMP(LAST_DAY(usage_date)), CAST(0 AS NUMERIC),
  'cloud_oci_billing_raw_daily', 'demo_focus_convert', 'demo_credential',
  usage_date, 'demo_run_oci', CURRENT_TIMESTAMP()
FROM \`cloudact-testing-1.{ORG_SLUG}_local.cloud_oci_billing_raw_daily\`
WHERE org_slug = '{ORG_SLUG}'
"
```

**Required FOCUS Fields:**
- `BillingAccountId`, `HostProviderName`, `InvoiceIssuerName`, `ContractedCost`, `x_pipeline_run_date` are required (cannot be NULL)

### GenAI Pricing Data Format

**CRITICAL:** Pricing model names must EXACTLY match usage model names. Common mismatches:

| Usage Model | Wrong Pricing | Correct Pricing |
|-------------|---------------|-----------------|
| `claude-3-5-sonnet-20241022` | `claude-3-5-sonnet-latest` | `claude-3-5-sonnet-20241022` |
| `claude-3-haiku-20240307` | `claude-3-5-haiku-latest` | `claude-3-haiku-20240307` |
| Provider: `gemini` | Provider: `google` | Provider: `gemini` |

**Add missing pricing entries:**
```bash
# Add to genai_payg_pricing table
cat > /tmp/genai_pricing_fix.csv << 'EOF'
{ORG_SLUG},anthropic,claude-3-5-sonnet-20241022,claude-3.5,sonnet,global,3.00,15.00,,,1.50,7.50,0,50,0,200000,8192,true,true,true,1000,400000,99.9,2024-10-22,,active,false,,,,,2024-12-01T00:00:00
{ORG_SLUG},anthropic,claude-3-haiku-20240307,claude-3,haiku,global,0.25,1.25,,,0.125,0.625,0,50,0,200000,4096,true,true,true,1000,400000,99.9,2024-03-07,,active,false,,,,,2024-12-01T00:00:00
{ORG_SLUG},gemini,gemini-1.5-pro,gemini-1.5,pro,global,1.25,5.00,0.3125,,0.625,2.50,75,50,0,2000000,8192,true,true,true,360,4000000,99.9,2024-05-14,,active,false,,,,,2024-12-01T00:00:00
{ORG_SLUG},gemini,gemini-1.5-flash,gemini-1.5,flash,global,0.075,0.30,0.01875,,0.0375,0.15,75,50,0,1000000,8192,true,true,true,1000,4000000,99.9,2024-05-14,,active,false,,,,,2024-12-01T00:00:00
EOF
bq load --source_format=CSV --skip_leading_rows=0 \
  "cloudact-testing-1:{ORG_SLUG}_local.genai_payg_pricing" /tmp/genai_pricing_fix.csv
```

### Error Investigation Philosophy

**DO NOT** just continue on pipeline failure. The script:
1. **Investigates** the root cause (schema, missing data, permissions, procedure)
2. **Attempts auto-fix** if possible (re-sync procedures)
3. **Retries** after successful fix
4. **Shows diagnosis** and **suggested manual fix** if auto-fix not possible
5. **Prints final status** with clear next steps

### Critical Rules

1. **NEVER manually call `/api/v1/organizations/onboard`** - Backend onboarding happens automatically during signup flow
2. **Bootstrap MUST be done before signup** - Otherwise backend onboarding fails silently (no API key created)
3. **Cleanup deletes:** Supabase (user, org, members) + BigQuery dataset only
4. **Cleanup script may fail with `protect_owner` trigger** - Use Supabase MCP SQL to disable trigger temporarily
5. **Get API key from dev endpoint** - `GET /api/v1/admin/dev/api-key/{org_slug}` with `X-CA-Root-Key` header
6. **BigQuery table format** - Use colon format: `project:dataset.table` (not `project.dataset.table`)
7. **Data file path** - Relative path from `01-fronted-system/tests/demo-setup/` to `04-inra-cicd-automation/load-demo-data/` is 3 levels up (not 4)
8. **Source data org_slug** - Load script automatically replaces `org_slug` in source files with the `--org-slug` argument

---

## Environment Configuration

| Environment | GCP Project | Supabase Project |
|-------------|-------------|------------------|
| `local/test` | `cloudact-testing-1` | `kwroaccbrxppfiysqlzs` |
| `stage` | `cloudact-stage` | `kwroaccbrxppfiysqlzs` |
| `prod` | `cloudact-prod` | `ovfxswhkkshouhsryzaf` |

---

## Reference Documentation

- **Demo Setup README**: `01-fronted-system/tests/demo-setup/README.md`
- **Load Demo Data README**: `04-inra-cicd-automation/load-demo-data/README.md`
- **Onboarding Code**: `02-api-service/src/core/processors/setup/organizations/onboarding.py`
- **Cost Read Service**: `02-api-service/src/core/services/cost_read/service.py`
- **Stored Procedures**: `03-data-pipeline-service/configs/system/procedures/`
