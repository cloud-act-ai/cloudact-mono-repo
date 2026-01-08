# Demo Data Loader for CloudAct

Load realistic demo data into BigQuery for demo organizations.

---

## Complete Demo Setup from Scratch (Quick Reference)

### Default Demo Credentials
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

### Prerequisites
- Frontend running: `http://localhost:3000`
- API Service running: `http://localhost:8000`
- Pipeline Service running: `http://localhost:8001`
- Supabase: Email confirmation DISABLED
- GCP auth: `gcloud auth login`

### Step 1: Full Cleanup (If Re-creating)

```bash
# Set variables
export ORG_SLUG="acme_inc_01022026"
export CA_ROOT_API_KEY="test-ca-root-key-dev-32chars"
export SUPABASE_PROJECT="kwroaccbrxppfiysqlzs"  # Test project

# 1a. Delete BigQuery dataset
bq rm -r -f cloudact-testing-1:${ORG_SLUG}_local

# 1b. Delete from central BigQuery tables
bq query --use_legacy_sql=false "DELETE FROM \`cloudact-testing-1.organizations.org_profiles\` WHERE org_slug = '${ORG_SLUG}'"
bq query --use_legacy_sql=false "DELETE FROM \`cloudact-testing-1.organizations.org_api_keys\` WHERE org_slug = '${ORG_SLUG}'"
bq query --use_legacy_sql=false "DELETE FROM \`cloudact-testing-1.organizations.org_subscriptions\` WHERE org_slug = '${ORG_SLUG}'"
bq query --use_legacy_sql=false "DELETE FROM \`cloudact-testing-1.organizations.org_usage_quotas\` WHERE org_slug = '${ORG_SLUG}'"
bq query --use_legacy_sql=false "DELETE FROM \`cloudact-testing-1.organizations.org_hierarchy\` WHERE org_slug = '${ORG_SLUG}'"

# 1c. Delete from Supabase (via MCP or SQL)
# In Supabase SQL Editor:
# 1. Find user: SELECT id FROM auth.users WHERE email = 'john@example.com';
# 2. Find org: SELECT id FROM organizations WHERE org_slug = 'acme_inc_01022026';
# 3. Disable trigger: ALTER TABLE organization_members DISABLE TRIGGER protect_owner;
# 4. Delete members: DELETE FROM organization_members WHERE org_id = '<org_id>';
# 5. Delete org: DELETE FROM organizations WHERE org_slug = 'acme_inc_01022026';
# 6. Enable trigger: ALTER TABLE organization_members ENABLE TRIGGER protect_owner;
# 7. Delete profile: DELETE FROM profiles WHERE id = '<user_id>';
# 8. Delete user: DELETE FROM auth.users WHERE id = '<user_id>';
```

### Step 2: Create Demo Account via Frontend

Use Playwright or manual browser:

```
1. Navigate to http://localhost:3000/signup
2. Fill Step 1 (Account):
   - First name: John
   - Last name: Doe
   - Email: john@example.com
   - Password: acme1234
   - Phone: 5551234567
   - Click "Continue"
3. Fill Step 2 (Organization):
   - Company name: Acme Inc 01022026
   - Company type: Company
   - Currency: $ USD
   - Timezone: PST/PDT - Los Angeles, USA
   - Click "Create account"
4. Select Plan:
   - Click "Select Plan" under Starter ($19)
   - Click "Continue to Checkout"
5. Stripe Checkout:
   - Click "Start trial" (no card needed for trial)
6. Wait for redirect to dashboard
```

### Step 3: Verify Partitioning & Get API Key

```bash
# Verify all tables have partitioning/clustering
bq ls --format=prettyjson cloudact-testing-1:acme_inc_01022026_local | \
  jq -r '.[] | select(.type == "TABLE") | "\(.tableReference.tableId): \(.timePartitioning.field // "NONE")"'

# Get API key
curl -s "http://localhost:8000/api/v1/admin/dev/api-key/acme_inc_01022026" \
  -H "X-CA-Root-Key: test-ca-root-key-dev-32chars" | jq -r '.api_key'
```

### Step 4: Load Demo Data

```bash
cd 04-inra-cicd-automation/load-demo-data

export ORG_SLUG="acme_inc_01022026"
export ORG_API_KEY="<api-key-from-step-3>"
export CA_ROOT_API_KEY="test-ca-root-key-dev-32chars"
export ENVIRONMENT="local"

# Load all raw data
./scripts/load-all.sh --skip-validation
```

### Step 5: Run Pipelines

```bash
# Sync stored procedures first
curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"

# Run subscription costs pipeline
curl -X POST "http://localhost:8001/api/v1/pipelines/run/${ORG_SLUG}/subscription/costs/subscription_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"start_date":"2025-01-01","end_date":"2026-01-02"}'

# Run GenAI cost pipelines (per provider)
for provider in openai anthropic gemini; do
  curl -X POST "http://localhost:8001/api/v1/pipelines/run/${ORG_SLUG}/genai/payg/${provider}" \
    -H "X-API-Key: $ORG_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"start_date":"2025-01-01","end_date":"2026-01-02"}'
done

# Run Cloud cost pipelines (per provider)
for provider in gcp aws azure oci; do
  curl -X POST "http://localhost:8001/api/v1/pipelines/run/${ORG_SLUG}/${provider}/cost/billing" \
    -H "X-API-Key: $ORG_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"start_date":"2025-01-01","end_date":"2026-01-02"}'
done
```

### Step 6: Verify Dashboard

```bash
# Check costs via API
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Expected: GenAI costs > Cloud costs
# Navigate to: http://localhost:3000/acme_inc_01022026/dashboard
# Login: john@example.com / acme1234
```

### Key Learnings & Gotchas

| Issue | Root Cause | Solution |
|-------|------------|----------|
| Dashboard shows $0 | `x_source_system` field is NULL | Pipelines must set this field correctly |
| Cloud/SaaS shows $0 | Cost categorization uses `x_source_system` | Check cost_read service filters |
| Slow dashboard (~5s) | No partitioning on tables | Re-onboard to get partitioned tables |
| Supabase delete fails | Foreign key constraints | Disable `protect_owner` trigger first |
| Signup 400 error | Email confirmation enabled | Disable in Supabase Auth settings |
| Tables missing partition | Old onboarding code | Delete dataset and re-onboard |

### Cost Categorization Logic

The `cost_read` service categorizes costs using `x_source_system`:

```python
# GenAI: x_source_system contains "genai|llm|openai|anthropic|gemini"
# Cloud: x_source_system contains "cloud|gcp|aws|azure|oci"
# SaaS: x_source_system equals "subscription_costs_daily"
```

### Partitioning Requirements (Mandatory)

All tables MUST have partitioning and clustering. Configured in:
- `02-api-service/src/app/routers/organizations.py` (lines 1309-1458)

Key tables:
| Table | Partition Field | Clustering Fields |
|-------|-----------------|-------------------|
| `cost_data_standard_1_3` | `ChargePeriodStart` | `SubAccountId, ServiceProviderName, ServiceCategory` |
| `genai_payg_usage_raw` | `usage_date` | `provider, model` |
| `cloud_*_billing_raw_daily` | `usage_date` | provider-specific |
| `subscription_plan_costs_daily` | `cost_date` | `org_slug, subscription_id` |

---

## Overview

This tool loads **RAW source data only**. Pipelines generate all final costs.

**Data Loaded:**
- **GenAI Usage Data**: OpenAI, Anthropic, Gemini token counts (367 days, ~4,000 records)
- **Cloud Billing Data**: GCP, AWS, Azure, OCI daily costs (367 days, ~12,000 records)
- **SaaS Subscription Plans**: 15 master plan records (NOT daily costs)

**Data Flow:**
```
Raw Demo Data → BigQuery Tables → Run Pipelines → cost_data_standard_1_3 (FOCUS 1.3)
```

## Quick Start

```bash
cd 04-inra-cicd-automation/load-demo-data

# 1. Set environment (local, stage, prod)
export ENVIRONMENT="local"
export ORG_SLUG="demo_acme_01022026"
export ORG_API_KEY="your-org-api-key"
export CA_ROOT_API_KEY="your-root-api-key"

# 2. Load everything and run pipelines
./scripts/00-load-pricing-seed.sh
./scripts/01-load-genai-data.sh
./scripts/02-load-cloud-data.sh
./scripts/03-load-subscriptions.sh
./scripts/05-sync-procedures.sh
./scripts/04-run-pipelines.sh

# OR use the master script
./scripts/load-all.sh
./scripts/05-sync-procedures.sh
./scripts/04-run-pipelines.sh
```

## Environment Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `ENVIRONMENT` | Target environment (local, stage, prod) | `local` |
| `ORG_SLUG` | Organization slug (required) | - |
| `ORG_API_KEY` | Organization API key (for pipelines) | - |
| `CA_ROOT_API_KEY` | System admin key (for procedure sync) | - |
| `DEMO_PREFIX` | Prefix for demo orgs (safety check) | `demo_` |
| `START_DATE` | Demo data start date | `2025-01-01` |
| `END_DATE` | Demo data end date | `2026-01-02` |

### Environment Matrix

| Environment | GCP Project | API Service | Pipeline Service |
|-------------|-------------|-------------|------------------|
| `local` | `cloudact-testing-1` | `localhost:8000` | `localhost:8001` |
| `stage` | `cloudact-stage` | Cloud Run | Cloud Run |
| `prod` | `cloudact-prod` | `api.cloudact.ai` | `pipeline.cloudact.ai` |

## Folder Structure

```
load-demo-data/
├── data/
│   ├── genai/                          # RAW token usage (no costs)
│   │   ├── openai_usage_raw.json      # ~1,835 records
│   │   ├── anthropic_usage_raw.json   # ~1,101 records
│   │   └── gemini_usage_raw.json      # ~1,101 records
│   ├── cloud/                          # RAW billing (with costs)
│   │   ├── gcp_billing_raw.json       # ~3,670 records
│   │   ├── aws_billing_raw.json       # ~3,670 records
│   │   ├── azure_billing_raw.json     # ~2,936 records
│   │   └── oci_billing_raw.json       # ~1,835 records
│   └── subscriptions/                  # Master data only
│       └── subscription_plans.csv     # 15 plans (NO daily costs)
├── schemas/                            # BigQuery schemas
├── scripts/
│   ├── config.sh                      # Environment configuration
│   ├── 00-load-pricing-seed.sh        # Load GenAI pricing (run first!)
│   ├── 01-load-genai-data.sh          # Load GenAI usage raw
│   ├── 02-load-cloud-data.sh          # Load cloud billing raw
│   ├── 03-load-subscriptions.sh       # Load subscription plans
│   ├── 04-run-pipelines.sh            # Run all cost pipelines
│   ├── 05-sync-procedures.sh          # Sync stored procedures
│   ├── 99-cleanup-demo-data.sh        # Delete demo data (safety checks)
│   └── load-all.sh                    # Master data load script
└── generators/
    └── generate-demo-data.py          # Data generator
```

**Important:** Daily costs are NOT loaded. They are generated by pipelines.

## Scripts Reference

| Script | Purpose | Requires |
|--------|---------|----------|
| `00-load-pricing-seed.sh` | Load GenAI pricing to `organizations.genai_payg_pricing` | GCP auth |
| `01-load-genai-data.sh` | Load GenAI usage raw data | GCP auth, ORG_SLUG |
| `02-load-cloud-data.sh` | Load cloud billing raw data | GCP auth, ORG_SLUG |
| `03-load-subscriptions.sh` | Load subscription plans (master) | GCP auth, ORG_SLUG |
| `04-run-pipelines.sh` | Run all cost calculation pipelines | ORG_API_KEY |
| `05-sync-procedures.sh` | Deploy stored procedures to BigQuery | CA_ROOT_API_KEY |
| `load-all.sh` | Load all raw data (runs 01-03) | GCP auth, ORG_SLUG |
| **Safe Demo for Real Orgs:** | | |
| `load-demo-to-org.sh` | Load demo data into ANY org (replaces org_slug) | GCP auth, ORG_SLUG |
| `cleanup-demo-by-marker.sh` | Delete ONLY demo data using markers | GCP auth, ORG_SLUG |
| **Demo-Prefix Orgs Only:** | | |
| `99-cleanup-demo-data.sh` | Delete ALL data from demo_ prefixed orgs | GCP auth, demo org |

## Configuration

Edit `scripts/config.sh` or set environment variables:

```bash
export GCP_PROJECT_ID="your-project-id"
export DATASET="genai_community_12282025_prod"  # or _local
```

## Data Characteristics

### GenAI Usage
- **Date Range**: Jan 1, 2025 - Jan 2, 2026 (367 days)
- **Patterns**:
  - Weekday usage: 1.3-1.7x baseline
  - Weekend usage: 0.4-0.7x baseline
  - Monthly growth: 5% increase
  - Q4 seasonal peak: 1.1-1.3x

### Cloud Billing
- **GCP Services**: Compute, Storage, BigQuery, Cloud Run, SQL, etc.
- **AWS Services**: EC2, S3, RDS, Lambda, EKS, etc.
- **Azure Services**: VMs, Storage, SQL, AKS, Functions, etc.
- **OCI Services**: Compute, Object Storage, Autonomous DB, etc.

### SaaS Subscriptions
| Provider | Plan | Seats | Monthly Cost |
|----------|------|-------|--------------|
| ChatGPT | TEAM | 25 | $625 |
| Claude | TEAM | 20 | $500 |
| Slack | BUSINESS+ | 50 | $750 |
| GitHub | TEAM | 30 | $120 |
| Figma | ORG | 15 | $675 |
| Notion | BUSINESS | 40 | $720 |
| And 9 more... | | | |

## Usage

### Validate Environment
```bash
./scripts/00-validate-env.sh
```

### Load Individual Data Types
```bash
./scripts/01-load-genai-data.sh       # GenAI only
./scripts/02-load-cloud-data.sh       # Cloud only
./scripts/03-load-subscriptions.sh    # Subscriptions only
```

### Load All Data
```bash
./scripts/load-all.sh
./scripts/load-all.sh --skip-validation  # Skip env check
./scripts/load-all.sh --genai-only       # Only GenAI
```

### Regenerate Data
```bash
# Default: Full year 2025
python3 generators/generate-demo-data.py

# Custom date range
python3 generators/generate-demo-data.py --start-date 2025-06-01 --end-date 2025-12-31

# Different random seed
python3 generators/generate-demo-data.py --seed 123
```

## After Loading: Run Pipelines

**CRITICAL:** Raw data must be processed by pipelines to appear in dashboards.

### Step 1: Sync Stored Procedures

```bash
curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"
```

### Step 2: Run Cost Pipelines

```bash
# Subscription costs (amortizes plans into daily costs)
curl -X POST "http://localhost:8001/api/v1/pipelines/run/${ORG_SLUG}/subscription/costs/subscription_cost" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"start_date":"2025-01-01","end_date":"2025-12-28"}'

# GenAI costs (calculates from usage + pricing)
curl -X POST "http://localhost:8001/api/v1/pipelines/run/${ORG_SLUG}/genai/payg/openai" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"start_date":"2025-01-01","end_date":"2025-12-28"}'

curl -X POST "http://localhost:8001/api/v1/pipelines/run/${ORG_SLUG}/genai/payg/anthropic" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"start_date":"2025-01-01","end_date":"2025-12-28"}'

curl -X POST "http://localhost:8001/api/v1/pipelines/run/${ORG_SLUG}/genai/payg/gemini" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"start_date":"2025-01-01","end_date":"2025-12-28"}'

# Cloud costs (converts to FOCUS 1.3)
curl -X POST "http://localhost:8001/api/v1/pipelines/run/${ORG_SLUG}/gcp/cost/billing" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"start_date":"2025-01-01","end_date":"2025-12-28"}'

# Repeat for aws, azure, oci...
```

### Step 3: Verify Costs

```bash
# Check cost_data_standard_1_3
curl -s "http://localhost:8000/api/v1/costs/${ORG_SLUG}/total" \
  -H "X-API-Key: $ORG_API_KEY" | python3 -m json.tool
```

## Target Tables

### Seed Tables (organizations dataset)
| Table | Records | Purpose |
|-------|---------|---------|
| `genai_payg_pricing` | 18 | Per-model token pricing (OpenAI, Anthropic, Gemini) |

### Raw Tables (loaded by this tool → org dataset)
| Table | Records | Has Costs? |
|-------|---------|------------|
| `genai_payg_usage_raw` | ~4,000 | NO (token counts only) |
| `cloud_gcp_billing_raw_daily` | ~3,600 | YES (provider costs) |
| `cloud_aws_billing_raw_daily` | ~3,600 | YES (provider costs) |
| `cloud_azure_billing_raw_daily` | ~2,900 | YES (provider costs) |
| `cloud_oci_billing_raw_daily` | ~1,800 | YES (provider costs) |
| `subscription_plans` | 15 | NO (master data, not time-series) |

### Output Tables (generated by pipelines)
| Table | Description | Source |
|-------|-------------|--------|
| `genai_costs_daily_unified` | GenAI costs from usage + pricing | sp_genai_2_consolidate_costs_daily |
| `subscription_plan_costs_daily` | Daily amortized subscription costs | sp_subscription_2_calculate_daily_costs |
| `cost_data_standard_1_3` | **FOCUS 1.3 unified costs** | All sp_convert_*_to_focus_1_3 procedures |

## Troubleshooting

### Dashboard Shows $0
- **Cause:** Raw data loaded but pipelines not run
- **Solution:** Run pipelines as shown in "After Loading: Run Pipelines" section
- Verify `cost_data_standard_1_3` has records after pipelines complete

### Authentication Error
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### Dataset Not Found
Ensure the organization is onboarded first:
```bash
curl -X POST "http://localhost:8000/api/v1/organizations/onboard" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -d '{"org_slug":"your_org_slug",...}'
```

### Schema Mismatch
Schemas in `schemas/` must match the target table schemas. Update if needed.

### GenAI Costs Missing
- **Cause:** Pricing seed data not loaded
- **Solution:** Run `./scripts/00-load-pricing-seed.sh` before GenAI pipelines

## Pipeline Order

For correct cost calculation, follow this order:

1. **Load pricing seed** → `00-load-pricing-seed.sh` (required for GenAI)
2. **Load raw data** → `01-load-genai-data.sh`, `02-load-cloud-data.sh`, `03-load-subscriptions.sh`
3. **Sync procedures** → `POST /api/v1/procedures/sync`
4. **Run subscription pipeline** → Creates `subscription_plan_costs_daily`
5. **Run GenAI pipelines** → Creates `genai_costs_daily_unified`
6. **Run cloud pipelines** → Converts to FOCUS 1.3
7. **Final output** → All costs appear in `cost_data_standard_1_3`

## Loading Demo Data into Real Organizations

For loading demo data into a REAL organization (like `rama_inc`), use the safe loader:

```bash
# Set your real org
export ORG_SLUG="rama_inc"
export ORG_API_KEY="your-api-key"

# Preview what will be loaded
./scripts/load-demo-to-org.sh --dry-run

# Load demo data (prompts for confirmation)
./scripts/load-demo-to-org.sh

# Force load without confirmation
./scripts/load-demo-to-org.sh --force

# Clear existing demo data before loading fresh data
./scripts/load-demo-to-org.sh --clear-existing
```

### How It Works

1. **org_slug Replacement**: The loader replaces `india_inc_01022026` in demo files with your target org
2. **Demo Markers**: Demo data contains markers for safe identification:
   - `x_credential_id` contains "demo" (e.g., `cred_openai_demo_001`)
   - `x_run_id` starts with "run_demo_" (e.g., `run_demo_openai_20250101_...`)
3. **Safe Deletion**: Only data with these markers is deleted - real data is NEVER touched

### Delete Demo Data from Real Org

```bash
# Set your real org
export ORG_SLUG="rama_inc"

# Preview what will be deleted (ONLY demo data)
./scripts/cleanup-demo-by-marker.sh --dry-run

# Delete demo data (keeps all real data)
./scripts/cleanup-demo-by-marker.sh

# Force delete without confirmation
./scripts/cleanup-demo-by-marker.sh --force
```

## Demo Cleanup (Demo-Prefixed Orgs Only)

For organizations with `demo_` prefix, use the full cleanup:

```bash
# Set demo org (must have demo_ prefix for safety)
export ORG_SLUG="demo_acme_01022026"

# Dry run - see what would be deleted
./scripts/99-cleanup-demo-data.sh --all --dry-run

# Delete all demo data (prompts for confirmation)
./scripts/99-cleanup-demo-data.sh --all

# Delete only raw data (keep processed costs)
./scripts/99-cleanup-demo-data.sh --raw-only

# Delete only processed costs (keep raw data)
./scripts/99-cleanup-demo-data.sh --costs-only

# Force delete without confirmation
./scripts/99-cleanup-demo-data.sh --all --force
```

**Safety:** The `99-cleanup-demo-data.sh` script ONLY works on organizations with the `demo_` prefix.

## Demo Data Markers

Demo data files contain embedded markers for safe identification:

| Marker | Pattern | Example |
|--------|---------|---------|
| `x_credential_id` | Contains "demo" | `cred_openai_demo_001` |
| `x_run_id` | Starts with "run_demo_" | `run_demo_openai_20250101_abc123` |
| Subscription notes | Contains "Demo subscription" | `Demo subscription for ChatGPT Team` |

These markers ensure that:
- Demo data can be loaded into ANY org (including production)
- ONLY demo data is deleted during cleanup
- Real data is NEVER affected

## License

Internal use only - CloudAct demo data.
