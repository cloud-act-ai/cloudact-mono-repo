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
| `local` (default) | cloudact-testing-1 | kwroaccbrxppfiysqlzs | `_local` | localhost:3000/8000/8001 |
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

## Prerequisites

| Requirement | Check | Expected |
|-------------|-------|----------|
| Frontend (3000) | `curl -s http://localhost:3000 -o /dev/null -w "%{http_code}"` | `200` |
| API Service (8000) | `curl -s http://localhost:8000/health` | `{"status":"ok"}` |
| Pipeline Service (8001) | `curl -s http://localhost:8001/health` | `{"status":"ok"}` |
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
| Config | `01-fronted-system/tests/demo-setup/config.ts` |
| Hierarchy template | `01-fronted-system/lib/seed/hierarchy_template.csv` |
| Pricing data | `04-inra-cicd-automation/load-demo-data/data/pricing/genai_payg_pricing.csv` |
| GenAI usage | `04-inra-cicd-automation/load-demo-data/data/genai/{provider}_usage_raw.json` |
| Cloud billing | `04-inra-cicd-automation/load-demo-data/data/cloud/{provider}_billing_raw.json` |
| Subscriptions | `04-inra-cicd-automation/load-demo-data/data/subscriptions/subscription_plans.csv` |
| BigQuery schemas | `02-api-service/configs/setup/organizations/onboarding/schemas/*.json` |

## Demo Data

All demo data files have proper values with all required fields matching BigQuery schemas. Every file uses placeholder org slug `acme_inc_01022026` which gets replaced with the actual org slug at load time via `sed 's/acme_inc_[a-z0-9]*/${orgSlug}/g'`.

### Data Files (Complete - No Fixes Needed)

| File | Table | Format | Records | Schema Match |
|------|-------|--------|---------|-------------|
| `genai_payg_pricing.csv` | `genai_payg_pricing` | CSV | 31 | 38/38 columns, exact order |
| `openai_usage_raw.json` | `genai_payg_usage_raw` | NDJSON | ~160 | All REQUIRED fields present |
| `anthropic_usage_raw.json` | `genai_payg_usage_raw` | NDJSON | ~160 | All REQUIRED fields present |
| `gemini_usage_raw.json` | `genai_payg_usage_raw` | NDJSON | ~160 | All REQUIRED fields present |
| `gcp_billing_raw.json` | `cloud_gcp_billing_raw_daily` | NDJSON | ~150 | All REQUIRED + x_cloud_provider |
| `aws_billing_raw.json` | `cloud_aws_billing_raw_daily` | NDJSON | ~150 | All REQUIRED + x_cloud_provider |
| `azure_billing_raw.json` | `cloud_azure_billing_raw_daily` | NDJSON | ~120 | All REQUIRED + x_cloud_provider |
| `oci_billing_raw.json` | `cloud_oci_billing_raw_daily` | NDJSON | ~120 | All REQUIRED + x_cloud_provider |
| `subscription_plans.csv` | `subscription_plans` | CSV | 15 | 35/35 columns, exact order |

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

### CSV Column Order = Schema Order

All CSV files have columns in the exact same order as the BigQuery schema JSON files in `02-api-service/configs/setup/organizations/onboarding/schemas/`.

## Procedures

### Full Setup Flow

```
PHASE 1: PRE-FLIGHT
  Check services → Check bootstrap → Verify demo data path → Load env
                              ↓
PHASE 2: ACCOUNT CREATION (Playwright)
  /signup → Fill form → Select plan → Stripe checkout → Extract org_slug
  → Poll for API key (60s) → Manual onboard fallback → Verify API key
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

# 3. Validate (date range: Dec 2025 - Jan 2026)
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total?start_date=2025-12-01&end_date=2026-01-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq
```

### Step-by-Step (Stage)

```bash
cd 01-fronted-system && source .env.stage

npx tsx tests/demo-setup/cleanup-demo-account.ts --email=demo@cloudact.ai --env=stage
npx tsx tests/demo-setup/setup-demo-account.ts --env=stage
npx tsx tests/demo-setup/load-demo-data-direct.ts --org-slug=$ORG_SLUG --api-key=$ORG_API_KEY --env=stage
```

## Pipeline Execution

The loader runs these 3 pipelines and polls until completion:

| # | Pipeline | Endpoint | What It Does |
|---|----------|----------|------------|
| 1 | Subscription | `POST /api/v1/pipelines/run/{org}/subscription/costs/subscription_cost` | subscription_plans → subscription_plan_costs_daily → cost_data_standard_1_3 |
| 2 | GenAI | `POST /api/v1/pipelines/run/{org}/genai/unified/consolidate` | genai_payg_usage_raw + pricing → genai_costs_daily_unified → cost_data_standard_1_3 |
| 3 | Cloud FOCUS | `POST /api/v1/pipelines/run/{org}/cloud/unified/cost/focus_convert` | cloud_*_billing_raw_daily → cost_data_standard_1_3 |

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

## Expected Costs (Dec 2025 - Jan 2026)

| Category | Records | Cost | Providers |
|----------|---------|------|-----------|
| GenAI | ~330 | ~$171K | OpenAI, Anthropic, Gemini |
| Cloud | ~540 | ~$382 | GCP, AWS, Azure, OCI |
| Subscription | ~15 plans | ~$7.7K | 15 SaaS providers |
| **TOTAL** | ~885 | **~$179K** | |

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

### Expected Totals (Dec 2025 - Jan 2026)

| Category | Expected | Tolerance |
|----------|----------|-----------|
| GenAI | ~$171K | 10% |
| Cloud | ~$382 | 10% |
| Subscription | ~$7.7K | 10% |
| **TOTAL** | **~$179K** | 10% |

### Validation Output

```
3-Layer Validation: PASSED
  Category       BQ              API             Expected        Variance
  GenAI          $171,2xx        $171,2xx        $171,000        0.1%
  Cloud          $382.xx         $382.xx         $370             3.3%
  Subscription   $7,7xx          $7,7xx          $7,700           0.3%
  TOTAL          $179,3xx        $179,3xx        $179,070         0.2%
```

### If Validation Fails

| Error | Cause | Fix |
|-------|-------|-----|
| BQ total = $0 | Pipeline didn't run or failed | Re-run with `--pipelines-only` |
| BQ-API > 1% | Caching or data inconsistency | Wait 30s, re-validate; check API cache TTL |
| BQ-Expected > 10% | Demo data changed or pipeline logic updated | Update EXPECTED_TOTALS in script |

### Manual Validation

```bash
# BigQuery direct
bq query --use_legacy_sql=false \
  "SELECT ServiceCategory, COUNT(*) as records, ROUND(SUM(BilledCost),2) as cost
   FROM \`cloudact-testing-1.${ORG_SLUG}_local.cost_data_standard_1_3\`
   WHERE ChargePeriodStart >= '2025-12-01'
   GROUP BY ServiceCategory"

# API
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total?start_date=2025-12-01&end_date=2026-01-31" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Frontend
# Login: http://localhost:3000 → demo@cloudact.ai / Demo1234
# Dashboard: http://localhost:3000/${ORG_SLUG}/dashboard
```

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| API shows $0 | Wrong date range | Use `?start_date=2025-12-01&end_date=2026-01-31` |
| Signup 400 | Email confirmation enabled | Disable in Supabase Auth settings |
| Pipeline not found | Procedures not synced | `POST /api/v1/procedures/sync` (port 8001) |
| No API key | Bootstrap not done | Run bootstrap first |
| Frontend shows $0 | Wrong date filter in UI | Set to Dec 2025 - Jan 2026 |
| Cleanup deletes wrong dataset | Wrong env | Use `--env=stage` or `--env=prod` |
| Duplicate data on re-run | Expected | `--replace` flag overwrites existing data |
| CA_ROOT_API_KEY not set | Missing env | `source 01-fronted-system/.env.local` |
| Env vars not passed to scripts | `source` doesn't export to child | Use inline: `VAR=$(grep ...) npx tsx ...` |
| Org slug missing timestamp | URL didn't contain slug | Script auto-queries Supabase as fallback |
| Org slug format | base36 timestamp, NOT base64 | `acme_inc_{base36(Date.now())}` e.g. `acme_inc_mlj3ql4q` |

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/account-setup` | Tests account UI flows. Demo-setup creates actual accounts with data. |
| `/bootstrap-onboard` | System initialization. Demo-setup depends on bootstrap. |
| `/pipeline-ops` | Pipeline lifecycle. Demo-setup runs pipelines for cost calculation. |
| `/cost-analysis` | Cost data architecture. Demo-setup validates all cost types. |
| `/bigquery-ops` | BigQuery operations. Demo-setup loads data and validates tables. |
