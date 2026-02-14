---
name: demo-setup
description: |
  Demo account setup for CloudAct. End-to-end account creation, data loading, pipeline execution,
  and cost validation using Playwright automation and Pipeline Service API.
  Use when: creating demo accounts, loading demo data, running demo pipelines, validating demo costs,
  debugging demo issues, cleaning up demo accounts, or preparing environments for demos/testing.
---

# /demo-setup - Demo Account Setup

End-to-end demo account lifecycle: create account via Playwright, load clean demo data, run all pipelines, set up alerts, validate costs. Supports local, stage, and prod environments.

## Trigger

```
/demo-setup                     # Full setup (cleanup → create → load → pipelines → alerts → validate)
/demo-setup create              # Create account only (Playwright)
/demo-setup load <org> <key>    # Load data + run pipelines for existing org
/demo-setup validate <org> <key># Validate costs across all layers
/demo-setup cleanup <email>     # Delete demo account + BigQuery dataset
/demo-setup alerts <org> <key>  # Configure cost alerts for demo org
```

## Multi-Environment Support

All scripts support `--env=local|stage|prod` flag. Presets auto-configure GCP project, Supabase, and service URLs.

| Environment | GCP Project | Supabase | Dataset Suffix | Services |
|-------------|-------------|----------|----------------|----------|
| `local` (default) | cloudact-testing-1 | kwroaccbrxppfiysqlzs | `_local` | localhost:3000/8000/8001/8002 |
| `stage` | cloudact-testing-1 | kwroaccbrxppfiysqlzs | `_stage` | cloudact.ai / api.cloudact.ai |
| `prod` | cloudact-prod | ovfxswhkkshouhsryzaf | `_prod` | cloudact.ai / api.cloudact.ai |

```bash
# Local (default)
npx tsx tests/demo-setup/load-demo-data-direct.ts --org-slug=$ORG --api-key=$KEY

# Stage
npx tsx tests/demo-setup/load-demo-data-direct.ts --org-slug=$ORG --api-key=$KEY --env=stage

# Prod (requires confirmation)
echo "yes" | npx tsx tests/demo-setup/cleanup-demo-account.ts --email=demo@cloudact.ai --env=prod
```

Env vars override presets: `GCP_PROJECT_ID`, `API_SERVICE_URL`, `PIPELINE_SERVICE_URL`, `NEXT_PUBLIC_SUPABASE_URL`.

**Secrets auto-resolve for stage/prod:** `CA_ROOT_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are auto-fetched from GCP Secret Manager when env vars are empty or contain placeholders (`INJECTED_FROM_SECRET_MANAGER`). Just ensure `gcloud` is authenticated.

## Prerequisites

| Requirement | Check | Expected |
|-------------|-------|----------|
| Frontend (3000) | `curl -s http://localhost:3000 -o /dev/null -w "%{http_code}"` | `200` |
| API Service (8000) | `curl -s http://localhost:8000/health` | `{"status":"ok"}` |
| Pipeline Service (8001) | `curl -s http://localhost:8001/health` | `{"status":"ok"}` |
| Chat Backend (8002) | `curl -s http://localhost:8002/health` | `{"status":"healthy"}` |
| Bootstrap done | System tables exist in BigQuery | Bootstrapped |
| Supabase email confirm | Supabase Dashboard → Auth → Settings | **DISABLED** |
| Environment loaded | `source 01-fronted-system/.env.local` | `CA_ROOT_API_KEY` set |

## Demo Account

| Field | Value |
|-------|-------|
| Email | `demo@cloudact.ai` |
| Password | `Demo1234` |
| Company | `Acme Inc` |
| Org Slug | `acme_inc_{base36_timestamp}` (auto-generated at signup) |
| Plan | `scale` (14-day trial) |

## Key Locations

| Resource | Path |
|----------|------|
| Setup script | `01-fronted-system/tests/demo-setup/setup-demo-account.ts` |
| Cleanup script | `01-fronted-system/tests/demo-setup/cleanup-demo-account.ts` |
| Data loader | `01-fronted-system/tests/demo-setup/load-demo-data-direct.ts` |
| Dashboard verify | `01-fronted-system/tests/demo-setup/verify-dashboard.ts` |
| Config | `01-fronted-system/tests/demo-setup/config.ts` |
| Data generator | `04-inra-cicd-automation/load-demo-data/generators/generate-demo-data.py` |
| Hierarchy template | `01-fronted-system/lib/seed/hierarchy_template.csv` |
| Hierarchy CSV | `04-inra-cicd-automation/load-demo-data/data/hierarchy/org_hierarchy.csv` |
| Pricing data | `04-inra-cicd-automation/load-demo-data/data/pricing/genai_payg_pricing.csv` |
| GenAI usage | `04-inra-cicd-automation/load-demo-data/data/genai/{provider}_usage_raw.json` |
| Cloud billing | `04-inra-cicd-automation/load-demo-data/data/cloud/{provider}_billing_raw.json` |
| Subscriptions | `04-inra-cicd-automation/load-demo-data/data/subscriptions/subscription_plans.csv` |
| Hierarchy populator | `04-inra-cicd-automation/load-demo-data/scripts/populate_hierarchy_in_data.py` |
| BigQuery schemas | `02-api-service/configs/setup/organizations/onboarding/schemas/*.json` |

## Demo Data

All demo data files have proper values with all required fields matching BigQuery schemas. Every file uses placeholder org slug `acme_inc_01022026` which gets replaced with the actual org slug at load time via `sed 's/acme_inc_[a-z0-9]*/${orgSlug}/g'`.

### Data Files (Complete - Hierarchy Pre-Populated)

| File | Table | Format | Records | Hierarchy Team |
|------|-------|--------|---------|----------------|
| `genai_payg_pricing.csv` | `genai_payg_pricing` | CSV | 31 | N/A (pricing) |
| `openai_usage_raw.json` | `genai_payg_usage_raw` | NDJSON | 3,650 | TEAM-BACKEND |
| `anthropic_usage_raw.json` | `genai_payg_usage_raw` | NDJSON | 2,190 | TEAM-MLOPS |
| `gemini_usage_raw.json` | `genai_payg_usage_raw` | NDJSON | 2,190 | TEAM-DATAENG |
| `gcp_billing_raw.json` | `cloud_gcp_billing_raw_daily` | NDJSON | 3,650 | TEAM-BACKEND |
| `aws_billing_raw.json` | `cloud_aws_billing_raw_daily` | NDJSON | 3,650 | TEAM-FRONTEND |
| `azure_billing_raw.json` | `cloud_azure_billing_raw_daily` | NDJSON | 2,920 | TEAM-MLOPS |
| `oci_billing_raw.json` | `cloud_oci_billing_raw_daily` | NDJSON | 2,920 | TEAM-DATAENG |
| `subscription_plans.csv` | `subscription_plans` | CSV | 15 | Mixed (4 teams) |
| `org_hierarchy.csv` | Reference only | CSV | 8 | All entities |

**Total: ~21,170 records across 730 days (Jan 2025 - Dec 2026)**

### Data Loading Flags

| Format | bq load Flags |
|--------|---------------|
| CSV | `--source_format=CSV --skip_leading_rows=1 --replace` |
| NDJSON | `--source_format=NEWLINE_DELIMITED_JSON --replace --ignore_unknown_values` |

### Hierarchy (2 Deep Trees)

```
Engineering (DEPT-ENG)
  └── Platform (PROJ-PLATFORM)
        ├── Backend (TEAM-BACKEND)
        └── Frontend (TEAM-FRONTEND)

Data Science (DEPT-DS)
  └── ML Pipeline (PROJ-MLPIPE)
        ├── ML Ops (TEAM-MLOPS)
        └── Data Engineering (TEAM-DATAENG)
```

3 levels: `c_suite` → `business_unit` → `function` | 8 entities total

### Hierarchy → Cost Distribution (Pre-Populated in Data Files)

All raw data files have `x_hierarchy_*` fields pre-populated. Hierarchy flows through all pipelines to `cost_data_standard_1_3`.

| Data Source | Team | Path | Department |
|-------------|------|------|------------|
| OpenAI (GenAI) | TEAM-BACKEND | Engineering > Platform > Backend | Engineering |
| Anthropic (GenAI) | TEAM-MLOPS | Data Science > ML Pipeline > ML Ops | Data Science |
| Gemini (GenAI) | TEAM-DATAENG | Data Science > ML Pipeline > Data Engineering | Data Science |
| GCP (Cloud) | TEAM-BACKEND | Engineering > Platform > Backend | Engineering |
| AWS (Cloud) | TEAM-FRONTEND | Engineering > Platform > Frontend | Engineering |
| Azure (Cloud) | TEAM-MLOPS | Data Science > ML Pipeline > ML Ops | Data Science |
| OCI (Cloud) | TEAM-DATAENG | Data Science > ML Pipeline > Data Engineering | Data Science |
| Subscriptions | Mixed | 4 teams across 15 SaaS apps | Both |

Cloud data has **provider-specific tag fields** set with `cost_center` = entity_id for FOCUS convert procedure hierarchy matching:

| Provider | Tag Fields Set |
|----------|---------------|
| GCP | `labels_json` → `$.cost_center`, `$.entity_id` |
| AWS | `resource_tags_json` + `cost_category_json` → `$.cost_center`, `$.entity_id` |
| Azure | `cost_center` (direct column) + `resource_tags_json` → `$.cost_center`, `$.entity_id` |
| OCI | `freeform_tags_json` + `defined_tags_json` → `$.cost_center`, `$.entity_id` |

To re-generate hierarchy assignments: `python3 04-inra-cicd-automation/load-demo-data/scripts/populate_hierarchy_in_data.py`

### Data Generator (2-Year Realistic Patterns)

```bash
cd 04-inra-cicd-automation/load-demo-data
python3 generators/generate-demo-data.py                  # Default: Jan 2025 - Dec 2026
python3 generators/generate-demo-data.py --demo           # Quick: last 30 days
python3 generators/generate-demo-data.py --start-date 2025-06-01 --end-date 2025-12-31
```

**Built-in patterns for realistic line charts:**
- 5% monthly compound growth (visible upward trend)
- Holiday spikes: Black Friday (2.5x), Christmas (2.0x), Cyber Monday (2.2x) - both 2025 + 2026
- Seasonal: Q4 higher (1.2-1.5x), summer lower (0.8-0.9x)
- Weekday/weekend: weekdays 1.2-1.6x, weekends 0.4-0.7x
- Anomalies: incident weeks (1.8x), summer dip weeks (0.6x), 26 random spike days
- Month-end budget flush: last 3 days 1.1-1.2x
- 7% credit records (negative amounts) for cloud providers

After generation, run `populate_hierarchy_in_data.py` to set hierarchy fields.

### Data Regeneration Workflow (Exact Steps)

When regenerating demo data, follow this EXACT sequence to avoid errors:

```bash
cd 04-inra-cicd-automation/load-demo-data

# Step 1: Generate raw data (includes x_org_slug, x_ingestion_id, x_ingestion_date, x_*_provider)
python3 generators/generate-demo-data.py
# Output: ~21,170 records across genai/, cloud/, subscriptions/ dirs

# Step 2: Populate hierarchy fields in all data files
python3 scripts/populate_hierarchy_in_data.py
# Output: Updates all NDJSON files with x_hierarchy_* fields + provider-specific tags

# Step 3: Verify fields present before loading
head -1 data/cloud/gcp_billing_raw.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('x_org_slug' in d, 'x_cloud_provider' in d, 'x_ingestion_id' in d)"
# Expected: True True True

# Step 4: Load into BigQuery via the data loader
cd ../../01-fronted-system
npx tsx tests/demo-setup/load-demo-data-direct.ts --org-slug=$ORG_SLUG --api-key=$ORG_API_KEY
```

**NEVER skip Step 2** — hierarchy fields are required for FOCUS convert pipelines to assign costs to teams.

### CRITICAL: BigQuery REQUIRED Fields in Raw Data

All raw data NDJSON files MUST include these `x_*` metadata fields — BigQuery REJECTS loads without them:

| Field | GenAI | Cloud (GCP/AWS/Azure/OCI) | Description |
|-------|-------|---------------------------|-------------|
| `x_org_slug` | **REQUIRED** | **REQUIRED** | Organization identifier (replaces old `org_slug`) |
| `x_genai_provider` | **REQUIRED** | N/A | Provider name: `openai`, `anthropic`, `gemini` |
| `x_cloud_provider` | N/A | **REQUIRED** | Provider name: `gcp`, `aws`, `azure`, `oci` |
| `x_ingestion_id` | **REQUIRED** | **REQUIRED** | UUID per record: `uuid.uuid4()` |
| `x_ingestion_date` | **REQUIRED** | **REQUIRED** | Date string: `YYYY-MM-DD` |

**Common mistake:** Using `org_slug` instead of `x_org_slug` — the `x_` prefix is mandatory for all pipeline metadata fields.

**Common mistake:** Omitting `x_ingestion_id` / `x_ingestion_date` — these are REQUIRED in the BQ schema, not optional.

Schemas are defined in: `02-api-service/configs/setup/organizations/onboarding/schemas/*.json`

### CSV Column Order = Schema Order

All CSV files have columns in the exact same order as the BigQuery schema JSON files in `02-api-service/configs/setup/organizations/onboarding/schemas/`.

## Procedures

### Full Setup Flow

```
PHASE 1: PRE-FLIGHT
  Check services → Check bootstrap → Verify demo data path → Load env
                              ↓
PHASE 2: ACCOUNT CREATION (Playwright)
  /signup → Fill form → Select plan → Stripe checkout
  NOTE: Prod uses pay.cloudact.ai (custom Stripe domain), not checkout.stripe.com
  → /onboarding/success (runs completeOnboarding server action)
  → Redirects to /{orgSlug}/integrations?welcome=true (NOT /dashboard)
  → Poll Supabase org_api_keys_secure for API key (up to 90s)
  → Extract org_slug from URL (fallback: query Supabase)
                              ↓
PHASE 3: DATA LOADING (bq CLI)
  Pre-flight: Check dataset exists → Auto-onboard if missing → Wait for readiness
  Pricing → Hierarchy → GenAI usage → Cloud billing → Subscriptions
  (sed replaces placeholder org slug, bq load --replace into existing tables)
                              ↓
PHASE 4: PIPELINE EXECUTION (API 8001)
  Sync procedures → Subscription pipeline → GenAI pipeline → Cloud FOCUS pipeline
  → Poll status every 5s → Auto-diagnose failures → Check logs
                              ↓
PHASE 5: ALERTS + 3-LAYER VALIDATION
  Create email channel → Create alert rules
  → BQ query (Layer 1) → API query (Layer 2) → Cross-validate (Layer 3)
  → Exit non-zero on validation failure
                              ↓
PHASE 6: DASHBOARD VERIFICATION (Playwright, --verify-dashboard)
  Login → Navigate to /{orgSlug}/dashboard (default time range: "365" days)
  → Wait up to 45s for cost data (networkidle + polling every 3s)
  → Screenshot → Extract dollar amounts ≥ $1,000 (filters CSS/JS noise)
  → Verify ≥3 distinct amounts → Check no "No cost data" warnings
  → Exit non-zero on failure
```

### Step-by-Step (Local)

```bash
cd 01-fronted-system && source .env.local

# 0. Cleanup (if re-creating)
npx tsx tests/demo-setup/cleanup-demo-account.ts --email=demo@cloudact.ai

# 1. Create account
npx tsx tests/demo-setup/setup-demo-account.ts
# Output: { orgSlug, apiKey, dashboardUrl }

# 2. Load data + run pipelines + set up alerts
export ORG_SLUG="acme_inc_xxx"
export ORG_API_KEY="..."
npx tsx tests/demo-setup/load-demo-data-direct.ts --org-slug=$ORG_SLUG --api-key=$ORG_API_KEY

# 3. Validate (date range: Jan 2025 - Dec 2026)
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total?start_date=2025-01-01&end_date=2026-12-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# 4. Dashboard verification (Playwright screenshot + dollar check)
npx tsx tests/demo-setup/verify-dashboard.ts --org-slug=$ORG_SLUG
# Or include in data loader:
npx tsx tests/demo-setup/load-demo-data-direct.ts --org-slug=$ORG_SLUG --api-key=$ORG_API_KEY --verify-dashboard
```

### Step-by-Step (Stage)

```bash
cd 01-fronted-system && source .env.stage

npx tsx tests/demo-setup/cleanup-demo-account.ts --email=demo@cloudact.ai --env=stage
npx tsx tests/demo-setup/setup-demo-account.ts --env=stage
npx tsx tests/demo-setup/load-demo-data-direct.ts --org-slug=$ORG_SLUG --api-key=$ORG_API_KEY --env=stage
```

## Quick Verification Tests

After demo setup, run these to verify everything works. Replace `$ORG_SLUG` and `$ORG_API_KEY` with actual values.

### 1. Service Health (all 4 must be healthy)

```bash
# API Service (8000)
curl -s http://localhost:8000/health | jq
# Expected: {"status":"healthy","service":"api-service","version":"v4.4.0",...}

# Pipeline Service (8001)
curl -s http://localhost:8001/health | jq
# Expected: {"status":"healthy","service":"data-pipeline-service","version":"v4.4.0",...}

# Chat Backend (8002)
curl -s http://localhost:8002/health | jq
# Expected: {"status":"healthy","service":"org-chat-backend","version":"1.0.0","bigquery":"connected"}

# Frontend (3000)
curl -s http://localhost:3000 -o /dev/null -w "HTTP %{http_code}\n"
# Expected: HTTP 200
```

### 2. Total Costs (date range: Jan 2025 - Dec 2026)

```bash
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total?start_date=2025-01-01&end_date=2026-12-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq
```

**Expected response (approximate — values depend on pipeline execution):**
```json
{
  "genai":         { "total_billed_cost": 6131735.34, "record_count": 8030, "providers": ["Google AI","OpenAI","Anthropic"] },
  "cloud":         { "total_billed_cost": 13350.33, "record_count": 13140, "providers": ["Microsoft Azure","OCI","AWS","Google Cloud"] },
  "subscription":  { "total_billed_cost": 84618.80, "record_count": 6120, "providers": ["Slack","Zoom","Figma",...15 total] },
  "total":         { "total_billed_cost": "~2.9M (API date-filtered)" },
  "date_range":    { "start": "2025-01-01", "end": "2026-12-31" },
  "currency": "USD"
}
```

**Quick check:** GenAI should be ~$6M+ (BQ) / ~$2.8M (API date-filtered). Cloud ~$13K (BQ) / ~$6K (API). Subscription ~$151K (BQ) / ~$85K (API). If any category = $0, wrong date range or pipeline failed. BQ-API mismatch is expected because API uses its own date range filter.

### 3. Cost by Provider (22 providers)

```bash
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/by-provider?start_date=2025-01-01&end_date=2026-12-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq '.data[:5]'
```

**Expected (top 5):**
```json
[
  { "provider": "Anthropic",    "total_cost": 2777843.03, "percentage": 30.54 },
  { "provider": "OpenAI",       "total_cost": 2217047.65, "percentage": 24.38 },
  { "provider": "Google Cloud", "total_cost": 980128.68,  "percentage": 10.78 },
  { "provider": "AWS",          "total_cost": 881287.64,  "percentage": 9.69 },
  { "provider": "Microsoft Azure", "total_cost": 557557.28, "percentage": 6.13 }
]
```

### 4. Notification Channels

```bash
curl -s "http://localhost:8000/api/v1/notifications/${ORG_SLUG}/channels" \
  -H "X-API-Key: $ORG_API_KEY" | jq '.[0] | {name, channel_type, email_recipients, is_active}'
```

**Expected:**
```json
{
  "name": "Cost Alerts (Email)",
  "channel_type": "email",
  "email_recipients": ["demo@cloudact.ai"],
  "is_active": true
}
```

### 5. Alert Rules (2 rules)

```bash
curl -s "http://localhost:8000/api/v1/notifications/${ORG_SLUG}/rules" \
  -H "X-API-Key: $ORG_API_KEY" | jq '.[] | {name, rule_type, is_active, priority}'
```

**Expected:**
```json
{ "name": "Daily Cost Spike Alert",    "rule_type": "absolute_threshold", "is_active": true, "priority": "high" }
{ "name": "Monthly Budget Threshold",  "rule_type": "budget_percent",     "is_active": true, "priority": "medium" }
```

**Alert configs:**
- Daily spike: triggers when daily spend > $5,000, 60min cooldown
- Monthly budget: alerts at 80% of $50K budget, 240min cooldown

### 6. Quota Status

```bash
curl -s "http://localhost:8000/api/v1/organizations/${ORG_SLUG}/quota" \
  -H "X-API-Key: $ORG_API_KEY" | jq '{dailyLimit, monthlyLimit, concurrentLimit, seatLimit, providersLimit, pipelinesRunToday, dailyUsagePercent}'
```

**Expected (Scale plan):**
```json
{
  "dailyLimit": 100,
  "monthlyLimit": 3000,
  "concurrentLimit": 20,
  "seatLimit": 11,
  "providersLimit": 10,
  "pipelinesRunToday": 5,
  "dailyUsagePercent": 5.0
}
```

### 7. Hierarchy Tree (8 entities, 3 levels)

```bash
curl -s "http://localhost:8000/api/v1/hierarchy/${ORG_SLUG}/tree" \
  -H "X-API-Key: $ORG_API_KEY" | jq '{levels: [.levels[] | .level_code], entity_count: (.entities | length)}'
```

**Expected:**
```json
{
  "levels": ["c_suite", "business_unit", "function"],
  "entity_count": 8
}
```

### 8. Pipeline Runs (5 completed)

```bash
curl -s "http://localhost:8001/api/v1/pipelines/runs?org_slug=${ORG_SLUG}&limit=10" \
  -H "X-API-Key: $ORG_API_KEY" | jq '.[] | {pipeline_id, status}' 2>/dev/null || \
  curl -s "http://localhost:8001/api/v1/pipelines/runs?org_slug=${ORG_SLUG}&limit=10" \
  -H "X-API-Key: $ORG_API_KEY" | jq '.runs[] | {pipeline_id, status}'
```

**Expected (5 runs, all COMPLETED):**
```
subscription-costs-subscription_cost:     COMPLETED
genai-unified-consolidate:                COMPLETED (or individual per-provider)
cloud-gcp-cost-focus_convert:             COMPLETED
cloud-aws-cost-focus_convert:             COMPLETED
cloud-azure-cost-focus_convert:           COMPLETED
cloud-oci-cost-focus_convert:             COMPLETED
```

### 9. Subscription Providers (15 SaaS apps)

```bash
curl -s "http://localhost:8000/api/v1/subscriptions/${ORG_SLUG}/providers" \
  -H "X-API-Key: $ORG_API_KEY" | jq '[.providers[] | select(.is_enabled) | .display_name]'
```

**Expected (15 enabled):**
```json
["Adobe Creative Cloud","Canva","ChatGPT Plus","Claude Pro","Confluence","Copilot","Cursor",
 "Figma","Github","Jira","Linear","Notion","Slack","Vercel","Zoom"]
```

### 10. Budget Data (12 budgets = 8 individual + 1 parent + 3 children from allocation)

```bash
curl -s "http://localhost:8000/api/v1/budgets/${ORG_SLUG}" \
  -H "X-API-Key: $ORG_API_KEY" | jq '{total: .total, categories: [.budgets[] | .category] | unique}'
```

**Expected:**
```json
{
  "total": 12,
  "categories": ["cloud", "genai", "subscription", "total"]
}
```

**Top-down allocation included:** Org cloud $100K → ENG 45% ($45K), DS 30% ($30K), OPS 15% ($15K), 10% margin

```bash
# Verify allocation tree
curl -s "http://localhost:8000/api/v1/budgets/${ORG_SLUG}/allocation-tree" \
  -H "X-API-Key: $ORG_API_KEY" | jq '.roots | length'
# Expected: >=1 (ORG root with 3 children)
```

### 11. Bootstrap Status (29 tables synced)

```bash
curl -s "http://localhost:8000/api/v1/admin/bootstrap/status" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" | jq '{status, tables_expected, tables_missing}'
```

**Expected:**
```json
{
  "status": "SYNCED",
  "tables_expected": 27,
  "tables_missing": []
}
```

### 11. Dashboard Visual Check (Playwright)

```bash
cd 01-fronted-system
npx tsx tests/demo-setup/verify-dashboard.ts --org-slug=$ORG_SLUG
```

**Expected:**
```
Dashboard Verification:
  URL: http://localhost:3000/acme_inc_xxx/dashboard
  Screenshot: tests/demo-setup/screenshots/dashboard-verified-XXX.png
  Dollar amounts found: $5,308,633, $2,905,849, $880,276, ...
  Result: PASSED
```

### Quick All-in-One Check

```bash
cd 01-fronted-system && source .env.local
ORG_SLUG="acme_inc_xxx"
ORG_API_KEY="..."

echo "=== Health ===" && \
curl -sf http://localhost:8000/health | jq -r '.status' && \
curl -sf http://localhost:8001/health | jq -r '.status' && \
curl -sf http://localhost:8002/health | jq -r '.status' && \
echo "=== Costs ===" && \
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total?start_date=2025-01-01&end_date=2026-12-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq '{genai: .genai.total_billed_cost, cloud: .cloud.total_billed_cost, subscription: .subscription.total_billed_cost, total: .total.total_billed_cost}' && \
echo "=== Alerts ===" && \
curl -s "http://localhost:8000/api/v1/notifications/${ORG_SLUG}/rules" \
  -H "X-API-Key: $ORG_API_KEY" | jq '[.[] | .name]' && \
echo "=== Quota ===" && \
curl -s "http://localhost:8000/api/v1/organizations/${ORG_SLUG}/quota" \
  -H "X-API-Key: $ORG_API_KEY" | jq '{plan_daily: .dailyLimit, plan_monthly: .monthlyLimit, used_today: .pipelinesRunToday}' && \
echo "=== DONE ==="
```

**Expected output:**
```
=== Health ===
healthy
healthy
healthy
=== Costs ===
{ "genai": 5308633.19, "cloud": 2905849.36, "subscription": 880276.13, "total": 9094758.68 }
=== Alerts ===
["Monthly Budget Threshold", "Daily Cost Spike Alert"]
=== Quota ===
{ "plan_daily": 100, "plan_monthly": 3000, "used_today": 5 }
=== DONE ===
```

## Pipeline Execution

The loader runs these 3 pipelines **SEQUENTIALLY** and polls until each completes before starting the next. This prevents BigQuery concurrent transaction conflicts on `cost_data_standard_1_3`.

| # | Pipeline | Endpoint | What It Does |
|---|----------|----------|------------|
| 1 | Subscription | `POST /api/v1/pipelines/run/{org}/subscription/costs/subscription_cost` | subscription_plans → subscription_plan_costs_daily → cost_data_standard_1_3 |
| 2 | GenAI | Direct SQL (not pipeline) | genai_payg_usage_raw + pricing → genai_costs_daily_unified → cost_data_standard_1_3 |
| 3 | Cloud FOCUS (×4) | `POST /api/v1/pipelines/run/{org}/cloud/{provider}/cost/focus_convert` | Per-provider, each waits before next starts |

**CRITICAL:** All pipelines writing to `cost_data_standard_1_3` MUST run one-at-a-time. Running them concurrently causes BigQuery "Transaction aborted due to concurrent update" errors. The `waitForSinglePipeline()` function polls each pipeline to completion before the next one starts.

### If a Pipeline Fails

The loader auto-diagnoses failures and suggests fixes. If it fails:

1. **Check Pipeline Service logs** - `tail -100 03-data-pipeline-service/logs/*.log`
2. **Check pipeline run details** - `curl -s http://localhost:8001/api/v1/pipelines/runs/{id} -H "X-API-Key: $ORG_API_KEY" | jq`
3. **Common causes:**
   - Procedures not synced → Re-run: `curl -X POST http://localhost:8001/api/v1/procedures/sync -H "X-CA-Root-Key: $CA_ROOT_API_KEY" -d '{"force":true}'`
   - Missing raw data → Re-run with `--raw-only` flag
   - Schema mismatch → Check table schema matches `configs/setup/organizations/onboarding/schemas/*.json`
4. **Re-run pipelines only** - `npx tsx tests/demo-setup/load-demo-data-direct.ts --org-slug=$ORG_SLUG --api-key=$ORG_API_KEY --pipelines-only`

## Alert Setup

The loader automatically creates:

| Alert | Type | Threshold |
|-------|------|-----------|
| Email channel | `email` | demo@cloudact.ai |
| Daily Cost Spike | `absolute_threshold` | $5,000/day |
| Monthly Budget | `budget_percent` | 80% of $50K |

## Budget Setup (Step 10.5)

The loader automatically creates 8 demo budgets via `setupDemoBudgets()`:

| Entity | Category | Type | Amount | Provider |
|--------|----------|------|--------|----------|
| DEPT-ENG | cloud | monetary | $30,000 | - |
| DEPT-DS | genai | monetary | $25,000 | - |
| PROJ-PLATFORM | cloud | monetary | $20,000 | gcp |
| PROJ-MLPIPE | genai | monetary | $20,000 | openai |
| TEAM-BACKEND | cloud | monetary | $12,000 | aws |
| TEAM-FRONTEND | subscription | monetary | $3,000 | - |
| TEAM-MLOPS | genai | token | 50,000,000 | - |
| DEPT-ENG | total | monetary | $50,000 | - |

**Period:** Q1 2026 (2026-01-01 to 2026-03-31), all quarterly.

### Verify Budgets

```bash
curl -s "http://localhost:8000/api/v1/budgets/$ORG_SLUG" \
  -H "X-API-Key: $ORG_API_KEY" | jq '{total: .total, categories: [.budgets[] | .category] | unique}'
# Expected: { "total": 8, "categories": ["cloud", "genai", "subscription", "total"] }
```

## Expected Costs (Jan 2025 - Dec 2026, 730 days)

| Category | Records | BQ Cost | Providers |
|----------|---------|---------|-----------|
| GenAI | ~8,030 | ~$6.1M | OpenAI, Anthropic, Gemini |
| Cloud | ~13,140 | ~$13K net | GCP, AWS, Azure, OCI |
| Subscription | 10,950 (15 plans × 730 days) | ~$151K (BQ) / ~$85K (API filtered) | 15 SaaS providers |
| **TOTAL** | ~31,850+ | **~$6.3M (BQ)** | |

**Note:** GenAI costs dominate because of high token volumes × pricing. Cloud costs are realistic daily amounts (~$18/day). BQ-API variance is expected because API queries use a date range filter (the default `start_date`/`end_date` window) while BQ validation queries the full table. Always ensure the API query date range covers the full data range: `?start_date=2025-01-01&end_date=2026-12-31`.

## 3-Layer Cost Validation

The data loader runs automated 3-layer validation after pipelines complete:

| Layer | Source | What It Checks |
|-------|--------|----------------|
| 1 - BigQuery | `cost_data_standard_1_3` | `SELECT ServiceCategory, SUM(BilledCost) GROUP BY ServiceCategory` |
| 2 - API | `GET /costs/{org}/total` | API response per category |
| 3 - Compare | BQ vs API vs Expected | Cross-validation with tolerances |

### Validation Rules

| Rule | Tolerance | Action |
|------|-----------|--------|
| Any category = $0 | 0% | ERROR - pipeline failed, exit non-zero |
| BQ vs API mismatch | > 1% | ERROR - data integrity issue |
| BQ vs Expected variance | > 10% | WARNING - may indicate data drift |

### Expected Totals (Jan 2025 - Dec 2026, 2-Year Data)

| Category | BQ Expected | Tolerance | Notes |
|----------|-------------|-----------|-------|
| GenAI | ~$6.1M | 20% | Dominant cost — high token volumes × pricing |
| Cloud | ~$13K | 50% | Realistic daily amounts (~$18/day × 730 days) |
| Subscription | ~$151K (BQ) / ~$85K (API) | 20% | 15 plans × 730 days = 10,950 daily cost records |
| **TOTAL** | **~$6.3M (BQ)** | 20% | |

**Note:** With 2-year data, the old 2-month expected values ($9.1M total) are OBSOLETE. BQ-API mismatch is expected if the API query doesn't cover the full date range.

### Validation Output

```
3-Layer Validation: PASSED
  Category       BQ              API             Expected        Variance
  GenAI          $5,3xx,xxx      $5,3xx,xxx      $5,300,000      x.x%
  Cloud          $2,9xx,xxx      $2,9xx,xxx      $2,900,000      x.x%
  Subscription   $9xx,xxx        $9xx,xxx        $900,000        x.x%
  TOTAL          $9,1xx,xxx      $9,1xx,xxx      $9,100,000      x.x%
```

### If Validation Fails

| Error | Cause | Fix |
|-------|-------|-----|
| BQ total = $0 | Pipeline didn't run or failed | Re-run with `--pipelines-only` |
| BQ-API > 1% | Caching or data inconsistency | Wait 30s, re-validate; check API cache TTL |
| BQ-Expected > 10% | Demo data changed or pipeline logic updated | Update EXPECTED_TOTALS in script |
| API query WARNING | Transient fetch timeout after heavy pipelines | Auto-handled: 3 retries + 5s settle delay. BQ totals used as fallback. Not a failure. |

### Manual Validation

```bash
# BigQuery direct
bq query --use_legacy_sql=false \
  "SELECT ServiceCategory, COUNT(*) as records, ROUND(SUM(BilledCost),2) as cost
   FROM \`cloudact-testing-1.${ORG_SLUG}_local.cost_data_standard_1_3\`
   WHERE ChargePeriodStart >= '2025-01-01'
   GROUP BY ServiceCategory"

# API
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total?start_date=2025-01-01&end_date=2026-12-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Frontend
# Login: http://localhost:3000 → demo@cloudact.ai / Demo1234
# Dashboard: http://localhost:3000/${ORG_SLUG}/dashboard
```

## Critical: Do's and Don'ts

### Onboarding Redirect Flow

**DO:** Expect this flow after Stripe checkout:
```
Stripe → /onboarding/success?session_id=... → completeOnboarding() server action
  → onboardToBackend() → stores API key in BigQuery AND Supabase org_api_keys_secure
  → Redirect to /{orgSlug}/integrations?welcome=true
```

**DON'T:** Expect redirect to `/dashboard` after signup. It goes to `/integrations`.

### API Key Storage

**DO:** Poll Supabase `org_api_keys_secure` table for the API key (that's where the frontend reads it from).

**DON'T:** Use `GET /admin/dev/api-key/{org}` or manual onboard fallback — the Playwright script now uses `pollForApiKeyFromSupabase()`.

### Cleanup

**DO:** Set `SUPABASE_ACCESS_TOKEN` env var — cleanup uses Management API SQL with `DISABLE TRIGGER USER` to bypass owner protection triggers.

**DON'T:** Try to delete org owners via REST API — Supabase has circular triggers (`protect_owner_role` + `prevent_last_owner_demotion`) that block it.

### Bootstrap

**DO:** Run `POST /admin/bootstrap/sync` if missing tables are reported. Bootstrap creates 27 tables (23 core + 4 chat).

**DON'T:** Block onboarding on missing `org_chat_*` tables — they're non-critical. Code filters them out automatically.

### Dashboard Verification

**DO:** Trust the default time range ("365" = Last 365 Days). Demo data from Dec 2025 - Jan 2026 is within range.

**DON'T:** Try to change the time range filter via Playwright — it's unnecessary. Wait for `networkidle` + 45s polling instead.

**DO:** Filter dollar amounts ≥ $1,000 to avoid CSS/JS false positives ($19, $69, $199 from pricing cards).

**DON'T:** Use a threshold < $1,000 — you'll get noise from Tailwind classes and pricing page values.

### Environment Variables

**DO:** Use inline env vars when running `npx tsx` scripts:
```bash
SUPABASE_SERVICE_ROLE_KEY=$(grep ...) npx tsx tests/demo-setup/cleanup-demo-account.ts
```

**DON'T:** Use `source .env.local` — it doesn't pass vars to child processes.

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| **bq load rejects NDJSON** | Missing required `x_*` fields | Generator MUST include `x_org_slug`, `x_ingestion_id`, `x_ingestion_date`, `x_cloud_provider`/`x_genai_provider` — see "CRITICAL: BigQuery REQUIRED Fields" above |
| **bq load says "Missing required fields"** | Used `org_slug` instead of `x_org_slug` | All pipeline metadata fields use `x_` prefix. The generator must use `x_org_slug`, NOT `org_slug` |
| API shows $0 | Wrong date range | Use `?start_date=2025-01-01&end_date=2026-12-31` |
| BQ-API cost mismatch >100% | API uses date filter, BQ queries full table | Ensure API query covers full range: `start_date=2025-01-01&end_date=2026-12-31` |
| Subscription pipeline FAILED | subscription_plans table empty or has wrong schema | Root cause: CSV had `org_slug` instead of `x_org_slug`, extra comma (36 vs 35 cols), or empty REQUIRED hierarchy fields. Fix CSV, `bq load`, re-run pipeline |
| **subscription_plans CSV 36 cols** | Extra comma between `contract_id` and `notes` | Use `csv.reader` to verify 35 columns per row. Every row must match header count exactly |
| **subscription_plans CSV: `x_hierarchy_level_code`** | Set to `function` instead of `team` | Valid values: `department`, `project`, `team` — match actual hierarchy level |
| Signup 400 | Email confirmation enabled | Disable in Supabase Auth settings |
| Pipeline not found | Procedures not synced | `POST /api/v1/procedures/sync` (port 8001) |
| No API key in Supabase | Onboarding failed silently | Check bootstrap sync (missing tables?), check API service health |
| Backend Not Connected | `onboardToBackend()` failed | Run `POST /admin/bootstrap/sync`, then re-onboard |
| Missing chat tables block onboard | Old code checked all tables | Already fixed — `org_chat_*` tables are non-critical |
| Cleanup fails (owner trigger) | Supabase circular triggers | Set `SUPABASE_ACCESS_TOKEN` env var for Management API SQL |
| Frontend shows $0 | Wrong date filter in UI | Default "365" covers demo data — wait for load |
| Cleanup deletes wrong dataset | Wrong env | Use `--env=stage` or `--env=prod` |
| Duplicate data on re-run | Expected | `--replace` flag overwrites existing data |
| CA_ROOT_API_KEY not set | Missing env | `source 01-fronted-system/.env.local` |
| Env vars not passed to scripts | `source` doesn't export to child | Use inline: `VAR=$(grep ...) npx tsx ...` |
| Org slug missing timestamp | URL didn't contain slug | Script auto-queries Supabase as fallback |
| Org slug format | base36 timestamp, NOT base64 | `acme_inc_{base36(Date.now())}` e.g. `acme_inc_mlj3ql4q` |
| Dashboard shows loading spinner | API calls still in flight | Wait for `networkidle`, verify API key in `org_api_keys_secure` |
| Validation "API query failed" | Transient timeout after heavy pipeline execution | Fixed: 5s settle delay + 3 retries. BQ is authoritative, API failure is WARNING not ERROR |
| Playwright can't find costs | Frontend not running | Verify port 3000 is up: `curl -s http://localhost:3000 -o /dev/null -w "%{http_code}"` |
| Screenshot blank/loading | Render timeout | Increase wait time or check frontend logs |
| Alert channel 500 error | Internal API error on notification channel creation | Non-blocking — alerts are optional. Retry or skip. |
| Hierarchy entities "already exist" | Re-running loader on same org | Expected — 400 on duplicate entities is safe to ignore |
| **BQ concurrent transaction conflict** | Multiple pipelines write to `cost_data_standard_1_3` at same time | Fixed: all pipelines now run sequentially via `waitForSinglePipeline()` |
| **Stripe checkout URL not detected** | Prod uses custom domain `pay.cloudact.ai` not `checkout.stripe.com` | Fixed: detect `pay.cloudact.ai` + `/c/pay/` + `checkout.stripe.com` |
| **`.env.prod` secrets = placeholders** | Values say `INJECTED_FROM_SECRET_MANAGER` | Fixed: `config.ts` auto-fetches from GCP Secret Manager |
| **Script uses localhost on prod** | Hardcoded `http://localhost:8000` URLs | Fixed: imports `TEST_CONFIG` from `config.ts` for env-aware URLs |

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/account-setup` | Tests account UI flows. Demo-setup creates actual accounts with data. |
| `/bootstrap-onboard` | System initialization. Demo-setup depends on bootstrap. |
| `/pipeline-ops` | Pipeline lifecycle. Demo-setup runs pipelines for cost calculation. |
| `/cost-analysis` | Cost data architecture. Demo-setup validates all cost types. |
| `/bigquery-ops` | BigQuery operations. Demo-setup loads data and validates tables. |
| `/budget-planning` | Demo creates 8 budgets across hierarchy levels for budget page testing. |
| `/notifications` | Demo creates 2 alert rules + 1 email channel for alert testing. |
| `/advanced-filters` | Demo data supports filter testing: 8 budgets, 2 alerts, 4 categories. |
