# Demo Account Setup - Requirements

## Overview

End-to-end demo account automation. Creates accounts via Playwright, loads clean demo data (all fields correct, schema-aligned CSVs), runs pipelines, sets up alerts, validates costs.

## Architecture

```
Playwright (Browser)           API Service (8000)        Pipeline (8001)
───────────────────            ─────────────────         ───────────────
setup-demo-account.ts          /admin/bootstrap          /procedures/sync
├─ /signup form                /admin/dev/api-key        /pipelines/run/*
├─ Stripe checkout             /hierarchy/*/levels/seed  /pipelines/runs/*
└─ Extract org_slug + key      /hierarchy/*/entities
                               /notifications/*/channels
cleanup-demo-account.ts        /notifications/*/rules
├─ Delete Supabase user/org    /costs/*/total
└─ Delete BQ dataset

load-demo-data-direct.ts       Demo Data (Clean - No Fixes)
├─ Replace org slug            04-inra-cicd-automation/load-demo-data/data/
├─ bq load all tables          ├─ pricing/  (CSV, schema-aligned)
├─ Run 3 pipelines             ├─ genai/    (NDJSON, all x_* fields)
├─ Set up alerts               ├─ cloud/    (NDJSON, all x_* fields)
└─ Validate costs              └─ subscriptions/ (CSV, schema-aligned)
```

## Functional Requirements

### FR-DS-001: Account Cleanup

| ID | Requirement |
|----|-------------|
| FR-DS-001.1 | Delete Supabase auth user, profile, org_members, organizations, invites by email |
| FR-DS-001.2 | Delete BigQuery dataset `{org_slug}_{environment}` |
| FR-DS-001.3 | Support `--email` or `--org-slug` argument |
| FR-DS-001.4 | Idempotent - re-running on cleaned account succeeds silently |

### FR-DS-002: Account Creation (Playwright)

| ID | Requirement |
|----|-------------|
| FR-DS-002.1 | Navigate to `/signup`, fill account + org details, select scale plan |
| FR-DS-002.2 | Complete Stripe checkout ("Start trial"), wait for dashboard redirect |
| FR-DS-002.3 | Extract org_slug from URL (fallback: query Supabase) |
| FR-DS-002.4 | Verify backend onboarding: poll for API key → manual onboard fallback (FR-DS-007) |
| FR-DS-002.5 | Return JSON: `{ success, orgSlug, apiKey, dashboardUrl }` - apiKey always present on success |
| FR-DS-002.6 | Timeout after 120 seconds |

### FR-DS-003: Data Loading

| ID | Requirement |
|----|-------------|
| FR-DS-003.1 | All demo data files have complete fields matching BigQuery schema order |
| FR-DS-003.2 | CSV columns in exact same order as schema JSON in `configs/setup/organizations/onboarding/schemas/` |
| FR-DS-003.3 | All files use placeholder `acme_inc_01022026` - replaced with actual org slug via sed |
| FR-DS-003.4 | Load pricing (CSV), GenAI usage (NDJSON), Cloud billing (NDJSON), Subscriptions (CSV) |
| FR-DS-003.5 | Seed hierarchy: 2 deep trees, 8 entities (Engineering + Data Science) |
| FR-DS-003.6 | No external fix scripts - data is correct as-is |

### FR-DS-004: Pipeline Execution

| ID | Requirement |
|----|-------------|
| FR-DS-004.1 | Sync procedures: `POST /api/v1/procedures/sync` with force=true |
| FR-DS-004.2 | Run subscription pipeline: `subscription/costs/subscription_cost` |
| FR-DS-004.3 | Run GenAI pipeline: `genai/unified/consolidate` |
| FR-DS-004.4 | Run Cloud pipeline: `cloud/unified/cost/focus_convert` (fallback to per-provider) |
| FR-DS-004.5 | Poll status every 5s until COMPLETED/FAILED |
| FR-DS-004.6 | Auto-diagnose failures with error pattern matching |
| FR-DS-004.7 | Auto-retry procedure-related failures (max 1 retry) |
| FR-DS-004.8 | Log check instructions on failure |

### FR-DS-005: Alert Setup

| ID | Requirement |
|----|-------------|
| FR-DS-005.1 | Create email notification channel (demo@cloudact.ai) |
| FR-DS-005.2 | Create daily cost spike alert ($5K threshold) |
| FR-DS-005.3 | Create monthly budget alert (80% of $50K) |
| FR-DS-005.4 | Skip gracefully if alerts already exist (409) |

### FR-DS-006: Cost Validation

| ID | Requirement |
|----|-------------|
| FR-DS-006.1 | Query `GET /api/v1/costs/{org}/total?start_date=2025-12-01&end_date=2026-01-31` |
| FR-DS-006.2 | GenAI ~$171K, Cloud ~$382, Subscription ~$7.7K, Total ~$179K |
| FR-DS-006.3 | Cross-validate API vs BigQuery vs Frontend |

### FR-DS-007: Onboarding Verification

| ID | Requirement |
|----|-------------|
| FR-DS-007.1 | After signup, poll `GET /admin/dev/api-key/{org}` every 5s for 60s |
| FR-DS-007.2 | If API key not found, attempt manual onboard via `POST /organizations/onboard` |
| FR-DS-007.3 | After manual onboard, retry API key poll for 30s |
| FR-DS-007.4 | Throw error (exit non-zero) if API key still not found after both attempts |
| FR-DS-007.5 | No silent fallback - always return verified API key or fail |

### FR-DS-008: Dataset Pre-flight Check

| ID | Requirement |
|----|-------------|
| FR-DS-008.1 | Before data loading, verify BigQuery dataset exists via `bq show` |
| FR-DS-008.2 | If missing, attempt `POST /organizations/onboard` to create it |
| FR-DS-008.3 | Wait 5s after onboarding for dataset readiness |
| FR-DS-008.4 | Fail explicitly (exit non-zero) if dataset creation fails |

### FR-DS-009: 3-Layer Cost Validation

| ID | Requirement |
|----|-------------|
| FR-DS-009.1 | Layer 1: Query BigQuery `cost_data_standard_1_3` by ServiceCategory |
| FR-DS-009.2 | Layer 2: Query API `GET /costs/{org}/total` with date range |
| FR-DS-009.3 | Layer 3: Cross-validate BQ vs API vs expected totals |
| FR-DS-009.4 | BQ-API mismatch > 1% = ERROR (data integrity) |
| FR-DS-009.5 | BQ-Expected variance > 10% = WARNING (data drift) |
| FR-DS-009.6 | Any category = $0 = ERROR (pipeline failure) |
| FR-DS-009.7 | Print comparison table with per-category BQ/API/Expected/Variance |
| FR-DS-009.8 | Exit non-zero on validation errors |

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-DS-001 | Full setup completes within 10 minutes |
| NFR-DS-002 | Account creation < 120s, data loading < 60s, pipelines < 300s |
| NFR-DS-003 | Root key for bootstrap/procedures only; org key for org operations |
| NFR-DS-004 | All FOCUS records have non-NULL x_source_system |
| NFR-DS-005 | ServiceCategory lowercase: genai, cloud, subscription |
| NFR-DS-006 | ServiceProviderName short codes: gcp, aws, azure, oci, openai, anthropic, gemini |
| NFR-DS-007 | Multi-environment: `--env=local\|stage\|prod` flag with auto-configured presets |
| NFR-DS-008 | Production safety: requires explicit confirmation for prod operations |
| NFR-DS-009 | Environment validation: reject invalid ENVIRONMENT values |
| NFR-DS-010 | Consistent sed pattern `acme_inc_[a-z0-9]*` across all data loaders |
| NFR-DS-011 | `bq load --replace` on all tables to prevent duplicates on re-runs |
| NFR-DS-012 | `bq load --ignore_unknown_values` on all NDJSON loads for schema evolution tolerance |

## Hierarchy

2 deep trees, 3 levels, 8 entities:

```
Engineering (DEPT-ENG, c_suite)
  └── Platform (PROJ-PLATFORM, business_unit)
        ├── Backend (TEAM-BACKEND, function)
        └── Frontend (TEAM-FRONTEND, function)

Data Science (DEPT-DS, c_suite)
  └── ML Pipeline (PROJ-MLPIPE, business_unit)
        ├── ML Ops (TEAM-MLOPS, function)
        └── Data Engineering (TEAM-DATAENG, function)
```

Template: `01-fronted-system/lib/seed/hierarchy_template.csv`

## SDLC

### Development

- Scripts: `01-fronted-system/tests/demo-setup/`
- Data: `04-inra-cicd-automation/load-demo-data/data/`
- Config: `01-fronted-system/tests/demo-setup/config.ts`

### Testing

- Unit: Config exports, data file validation, schema column order
- Integration: Account create/cleanup, data loading, pipeline execution
- E2E: Full lifecycle (cleanup → create → load → pipelines → alerts → validate → cleanup)

### Environments

| Env | Dataset Suffix | GCP Project | Supabase | Services |
|-----|----------------|-------------|----------|----------|
| local | `_local` | cloudact-testing-1 | kwroaccbrxppfiysqlzs | localhost |
| stage | `_stage` | cloudact-testing-1 | kwroaccbrxppfiysqlzs | Cloud Run |
| prod | `_prod` | cloudact-prod | ovfxswhkkshouhsryzaf | Cloud Run |

**Production requires explicit confirmation.** Use `echo "yes" |` to pipe confirmation for non-interactive runs.

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/tests/demo-setup/setup-demo-account.ts` | Playwright account creation |
| `01-fronted-system/tests/demo-setup/cleanup-demo-account.ts` | Account + BQ cleanup |
| `01-fronted-system/tests/demo-setup/load-demo-data-direct.ts` | Data loading + pipeline runner |
| `01-fronted-system/tests/demo-setup/config.ts` | Centralized configuration |
| `01-fronted-system/lib/seed/hierarchy_template.csv` | 2-tree hierarchy (8 entities) |
| `04-inra-cicd-automation/load-demo-data/data/pricing/genai_payg_pricing.csv` | GenAI pricing (31 models, all x_* fields) |
| `04-inra-cicd-automation/load-demo-data/data/subscriptions/subscription_plans.csv` | 15 SaaS plans (schema-aligned) |
| `02-api-service/configs/setup/organizations/onboarding/schemas/` | BigQuery table schemas |

## Related Skills

`/account-setup` `/bootstrap-onboard` `/pipeline-ops` `/cost-analysis` `/bigquery-ops` `/stripe-billing`
