# Demo Account Setup - Requirements

## Overview

End-to-end demo account automation. Creates accounts via Playwright, loads clean demo data (all fields correct, schema-aligned CSVs), runs pipelines, sets up alerts, validates costs.

## Architecture

```
Playwright (Browser)           API Service (8000)        Pipeline (8001)      Chat Backend (8002)
───────────────────            ─────────────────         ───────────────      ───────────────────
setup-demo-account.ts          /admin/bootstrap          /procedures/sync     /chat/*/message
├─ /signup form                /hierarchy/*/levels/seed  /pipelines/run/*     /chat/*/conversations
├─ Stripe checkout             /hierarchy/*/entities     /pipelines/runs/*
└─ Extract org_slug + key      /notifications/*/channels
                               /notifications/*/rules
cleanup-demo-account.ts        /costs/*/total
├─ Delete Supabase user/org
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
| FR-DS-001.1 | Delete Supabase auth user, profile, org_members, organizations, invites, org_api_keys_secure, org_quotas by email |
| FR-DS-001.2 | Delete BigQuery dataset `{org_slug}_{environment}` |
| FR-DS-001.3 | Support `--email` or `--org-slug` argument |
| FR-DS-001.4 | Idempotent - re-running on cleaned account succeeds silently |
| FR-DS-001.5 | Use Supabase Management API SQL with `DISABLE TRIGGER USER` to bypass owner protection triggers |
| FR-DS-001.6 | Require `SUPABASE_ACCESS_TOKEN` env var for Management API access |

### FR-DS-002: Account Creation (Playwright)

| ID | Requirement |
|----|-------------|
| FR-DS-002.1 | Navigate to `/signup`, fill account + org details, select scale plan |
| FR-DS-002.2 | Complete Stripe checkout ("Start trial"), wait for `/onboarding/success` page |
| FR-DS-002.3 | Wait for `completeOnboarding()` to finish — page redirects to `/{orgSlug}/integrations?welcome=true` (NOT `/dashboard`) |
| FR-DS-002.4 | Extract org_slug from URL matching `/(dashboard|integrations)` (fallback: query Supabase) |
| FR-DS-002.5 | Poll Supabase `org_api_keys_secure` table for API key (up to 90s) — FR-DS-007 |
| FR-DS-002.6 | Return JSON: `{ success, orgSlug, apiKey, dashboardUrl }` - apiKey always present on success |
| FR-DS-002.7 | Timeout after 120 seconds |

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
| FR-DS-006.2 | GenAI ~$5.3M, Cloud ~$2.9M, Subscription ~$900K, Total ~$9.1M |
| FR-DS-006.3 | Cross-validate API vs BigQuery vs Frontend |

### FR-DS-007: Onboarding Verification (Supabase Polling)

| ID | Requirement |
|----|-------------|
| FR-DS-007.1 | After Stripe checkout, wait for redirect: `/onboarding/success` → `/{orgSlug}/integrations` |
| FR-DS-007.2 | `completeOnboarding()` stores API key in both BigQuery AND Supabase `org_api_keys_secure` |
| FR-DS-007.3 | Poll Supabase `org_api_keys_secure` for API key every 5s, up to 90s |
| FR-DS-007.4 | Non-critical `org_chat_*` tables don't block onboarding (filtered in `backend-onboarding.ts`) |
| FR-DS-007.5 | Throw error (exit non-zero) if API key not found after 90s polling |
| FR-DS-007.6 | No manual onboard fallback — rely on the frontend's `completeOnboarding()` server action |

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

### FR-DS-010: Frontend Dashboard Verification

| ID | Requirement |
|----|-------------|
| FR-DS-010.1 | Login as demo@cloudact.ai via Playwright headless browser |
| FR-DS-010.2 | Navigate to `/{orgSlug}/dashboard` — default time range "365" covers demo data (Dec 2025 - Jan 2026) |
| FR-DS-010.3 | Wait for `networkidle` then poll up to 45s for cost data |
| FR-DS-010.4 | Extract dollar amounts ≥ $1,000 from page body text (filters CSS/JS/pricing noise) |
| FR-DS-010.5 | Verify at least 3 distinct amounts ≥ $1,000 present |
| FR-DS-010.6 | Check absence of "No cost data", "No GenAI costs", "No cloud costs" text |
| FR-DS-010.7 | Save screenshot to `tests/demo-setup/screenshots/` |
| FR-DS-010.8 | Print verification summary with amounts and screenshot path |
| FR-DS-010.9 | Exit non-zero if verification fails |
| FR-DS-010.10 | Runnable standalone: `npx tsx tests/demo-setup/verify-dashboard.ts --org-slug=X` |
| FR-DS-010.11 | Do NOT change time range filter — default "365" days already includes demo data period |

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
| local | `_local` | cloudact-testing-1 | kwroaccbrxppfiysqlzs | localhost (3000/8000/8001/8002) |
| stage | `_stage` | cloudact-testing-1 | kwroaccbrxppfiysqlzs | Cloud Run |
| prod | `_prod` | cloudact-prod | ovfxswhkkshouhsryzaf | Cloud Run |

**Production requires explicit confirmation.** Use `echo "yes" |` to pipe confirmation for non-interactive runs.

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/tests/demo-setup/setup-demo-account.ts` | Playwright account creation |
| `01-fronted-system/tests/demo-setup/cleanup-demo-account.ts` | Account + BQ cleanup |
| `01-fronted-system/tests/demo-setup/load-demo-data-direct.ts` | Data loading + pipeline runner |
| `01-fronted-system/tests/demo-setup/verify-dashboard.ts` | Playwright dashboard verification |
| `01-fronted-system/tests/demo-setup/config.ts` | Centralized configuration |
| `01-fronted-system/lib/seed/hierarchy_template.csv` | 2-tree hierarchy (8 entities) |
| `04-inra-cicd-automation/load-demo-data/data/pricing/genai_payg_pricing.csv` | GenAI pricing (31 models, all x_* fields) |
| `04-inra-cicd-automation/load-demo-data/data/subscriptions/subscription_plans.csv` | 15 SaaS plans (schema-aligned) |
| `02-api-service/configs/setup/organizations/onboarding/schemas/` | BigQuery table schemas |

## Related Skills

`/account-setup` `/bootstrap-onboard` `/pipeline-ops` `/cost-analysis` `/bigquery-ops` `/stripe-billing`
