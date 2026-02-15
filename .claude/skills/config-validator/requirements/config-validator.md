# Configuration Validator - Requirements

## Overview

Configuration validation for CloudAct covering pipeline YAML configs, JSON BigQuery schemas, and the provider registry. CloudAct is configuration-driven: pipelines are defined in YAML, BigQuery table schemas in JSON, and provider capabilities in a central registry. This skill validates all config types before deployment to catch structural errors, missing fields, invalid references, and cross-config inconsistencies.

## Source Specifications

Defined in SKILL.md (`config-validator/SKILL.md`). Validation rules derived from pipeline execution requirements and BigQuery schema creation logic.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Configuration Validation Flow                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Pipeline YAML                  JSON Schemas                         │
│  ──────────────                 ────────────                         │
│  03-data-pipeline-service/      02-api-service/configs/setup/        │
│  configs/                       ├── bootstrap/schemas/ (27 files)    │
│  ├── cloud/                     │   ├── org_profiles.json            │
│  │   ├── gcp/cost/billing.yml   │   ├── org_api_keys.json           │
│  │   ├── aws/cost/billing.yml   │   ├── org_subscriptions.json      │
│  │   ├── azure/cost/billing.yml │   │   ... (30 meta tables)        │
│  │   └── oci/cost/billing.yml   └── organizations/onboarding/       │
│  ├── genai/                         schemas/ (20 files)              │
│  │   ├── payg/openai.yml            ├── cost_data_standard_1_3.json │
│  │   ├── payg/anthropic.yml         ├── genai_payg_pricing.json     │
│  │   ├── commitment/aws.yml         ├── cloud_gcp_billing_raw.json  │
│  │   └── unified/consolidate.yml    │   ... (20 org tables)         │
│  ├── subscription/                                                   │
│  │   └── costs/subscription_cost.yml  Provider Registry              │
│  ├── alerts/                          ─────────────────              │
│  │   ├── cost_alerts.yml              configs/system/providers.yml   │
│  │   └── subscription_alerts.yml      (all supported providers)      │
│  ├── aggregated/                                                     │
│  │   └── cost/unified_cost_sync.yml                                  │
│  ├── notify_systems/                                                 │
│  │   ├── email_notification/config.yml                               │
│  │   └── slack_notification/config.yml                               │
│  └── system/                                                         │
│      ├── providers.yml                                               │
│      └── dataset_types.yml                                           │
│                                                                      │
│  Validation: Pre-deploy check → CI hook potential                    │
│  Cross-validation: pipeline ps_type → provider registry              │
│  Cross-validation: schema clustering → field existence               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Functional Requirements

### FR-CV-001: Pipeline YAML Structure

- **FR-CV-001.1**: Every pipeline YAML must contain `pipeline_id`, `name`, `version`, and `steps`
- **FR-CV-001.2**: `pipeline_id` follows `{org_slug}-{provider}-{domain}` naming convention
- **FR-CV-001.3**: `version` must be semantic version format (X.Y.Z)
- **FR-CV-001.4**: `steps` array must contain at least one step
- **FR-CV-001.5**: Each step must have `step_id` and `ps_type` fields
- **FR-CV-001.6**: `step_id` values must be unique within a pipeline
- **FR-CV-001.7**: `ps_type` must reference a valid processor in the processor registry
- **FR-CV-001.8**: Optional `timeout_minutes` must be between 1 and 120 if present
- **FR-CV-001.9**: Optional `category` must be one of: `cost`, `usage`, `subscription`, `etl`, `alert`, `notification`
- **FR-CV-001.10**: YAML files must use spaces for indentation (not tabs)

### FR-CV-002: Provider Registry (providers.yml)

- **FR-CV-002.1**: Each provider entry must have `type`, `credential_type`, and `display_name`
- **FR-CV-002.2**: `type` must be one of: `llm`, `cloud`, `saas`
- **FR-CV-002.3**: `credential_type` must be one of: `api_key`, `service_account`, `oauth`
- **FR-CV-002.4**: `api_base_url` must be a valid URL format if present
- **FR-CV-002.5**: `rate_limit` block must contain `requests_per_minute` and `retry_after_seconds` if present
- **FR-CV-002.6**: `auth_prefix` must be one of: `Bearer`, `Basic`, `ApiKey` if present
- **FR-CV-002.7**: `validation_endpoint` must be a valid path if present

### FR-CV-003: Bootstrap JSON Schemas

- **FR-CV-003.1**: Every JSON schema file must be valid JSON (no trailing commas, no comments)
- **FR-CV-003.2**: Must contain `table_name` (string, valid BigQuery identifier)
- **FR-CV-003.3**: Must contain `schema` array with at least one field definition
- **FR-CV-003.4**: Each field must have `name` and `type`; `mode` defaults to `NULLABLE`
- **FR-CV-003.5**: `type` must be one of: `STRING`, `INTEGER`, `FLOAT`, `BOOLEAN`, `TIMESTAMP`, `DATE`, `RECORD`, `JSON`, `BYTES`, `FLOAT64`, `INT64`
- **FR-CV-003.6**: `mode` must be one of: `REQUIRED`, `NULLABLE`, `REPEATED`
- **FR-CV-003.7**: `clustering` fields must reference fields that exist in the schema
- **FR-CV-003.8**: `partitioning.field` must reference a field of type `DATE` or `TIMESTAMP`
- **FR-CV-003.9**: `table_name` must match the filename (e.g., `org_profiles.json` contains `"table_name": "org_profiles"`)

### FR-CV-004: Onboarding JSON Schemas

- **FR-CV-004.1**: Same structural rules as bootstrap schemas (FR-CV-003.1 through FR-CV-003.9)
- **FR-CV-004.2**: Must cover all per-org tables: cloud billing, genai, subscription, cost_data_standard_1_3
- **FR-CV-004.3**: schema_versions table must exist for migration tracking
- **FR-CV-004.4**: cost_data_standard_1_3 must include all FOCUS 1.3 mandatory columns

### FR-CV-005: Cross-Validation Rules

- **FR-CV-005.1**: Pipeline `ps_type` providers must exist in `providers.yml` (or be `generic`)
- **FR-CV-005.2**: Pipeline configs for a provider must have corresponding provider entry
- **FR-CV-005.3**: Bootstrap schema `table_name` values must be unique across all bootstrap JSON files
- **FR-CV-005.4**: Onboarding schema `table_name` values must be unique across all onboarding JSON files
- **FR-CV-005.5**: `dataset_types.yml` references must map to valid dataset naming patterns

### FR-CV-006: SDLC Integration

- **FR-CV-006.1**: Validation should run before deployment (pre-deploy check)
- **FR-CV-006.2**: Potential CI pre-commit hook for config validation
- **FR-CV-006.3**: Validation output must clearly identify file path, rule ID, and error message
- **FR-CV-006.4**: Exit code 0 for all valid, non-zero for any validation failure
- **FR-CV-006.5**: Validation can be run standalone or as part of test suite

---

## Validation Rules Summary

### Pipeline Rules (P001-P006)

| Rule | Check | Severity |
|------|-------|----------|
| P001 | `pipeline_id` follows `{context}-{provider}-{domain}` convention | ERROR |
| P002 | `version` is semantic versioning (X.Y.Z) | ERROR |
| P003 | All `step_id` values unique within pipeline | ERROR |
| P004 | `ps_type` references valid processor | ERROR |
| P005 | `timeout_minutes` between 1 and 120 | WARNING |
| P006 | `schedule` has valid type (cron, interval) | WARNING |

### Registry Rules (R001-R004)

| Rule | Check | Severity |
|------|-------|----------|
| R001 | `type` is `llm`, `cloud`, or `saas` | ERROR |
| R002 | `credential_type` is `api_key`, `service_account`, or `oauth` | ERROR |
| R003 | `api_base_url` is valid URL format | WARNING |
| R004 | `rate_limit` has `requests_per_minute` and `retry_after_seconds` | WARNING |

### Schema Rules (S001-S005)

| Rule | Check | Severity |
|------|-------|----------|
| S001 | `table_name` is valid BigQuery identifier (`^[a-zA-Z_][a-zA-Z0-9_]*$`) | ERROR |
| S002 | All fields have valid `type` (STRING, INTEGER, FLOAT, etc.) | ERROR |
| S003 | Required fields have `mode: REQUIRED` | WARNING |
| S004 | `clustering` fields exist in `schema` | ERROR |
| S005 | `partitioning.field` exists and is DATE or TIMESTAMP | ERROR |

---

## Non-Functional Requirements

### NFR-CV-001: Validation Performance

| Standard | Target |
|----------|--------|
| Full validation run | < 5s for all configs |
| Single file validation | < 100ms |
| Error output | Human-readable with file path and line context |

### NFR-CV-002: Error Reporting

- Each error includes: rule ID, severity, file path, field name, expected vs actual value
- Errors grouped by file for readability
- Summary count at end: X errors, Y warnings
- Exit code 1 if any ERROR-severity violations

### NFR-CV-003: CI/CD Integration

| Aspect | Detail |
|--------|--------|
| Pre-commit hook | Optional, validates changed config files only |
| CI pipeline step | Validate all configs before Cloud Build deploy |
| Local validation | Run manually via Python script |
| Stage gate | Fail deployment if validation errors found |

---

## Config File Inventory

### Pipeline YAML (03-data-pipeline-service/configs/)

| Category | Path | Count |
|----------|------|-------|
| Cloud billing | `cloud/{gcp,aws,azure,oci}/cost/billing.yml` | 4 |
| Cloud FOCUS | `cloud/{gcp,aws,azure,oci}/cost/focus_convert.yml` | 4 |
| Cloud unified | `cloud/unified/focus_convert.yml` | 1 |
| Cloud GCP API | `cloud/gcp/api/*.yml` | 4 |
| GenAI PAYG | `genai/payg/{openai,anthropic,gemini,deepseek,azure_openai,cost_only}.yml` | 6 |
| GenAI commitment | `genai/commitment/{aws_bedrock,azure_ptu,gcp_vertex}.yml` | 3 |
| GenAI infra | `genai/infrastructure/gcp_gpu.yml` | 1 |
| GenAI unified | `genai/unified/consolidate.yml` | 1 |
| Subscription | `subscription/costs/subscription_cost.yml` | 1 |
| Aggregated | `aggregated/cost/unified_cost_sync.yml` | 1 |
| Alerts | `alerts/{cost_alerts,subscription_alerts}.yml` | 2 |
| Notifications | `notify_systems/{email,slack}_notification/config.yml` | 2 |
| System | `system/{providers,dataset_types}.yml` | 2 |

### Bootstrap JSON Schemas (02-api-service/configs/setup/bootstrap/schemas/)

| Count | Content |
|-------|---------|
| 27 | Meta tables for organizations dataset (org_profiles, org_api_keys, org_subscriptions, org_chat_*, etc.) |

### Onboarding JSON Schemas (02-api-service/configs/setup/organizations/onboarding/schemas/)

| Count | Content |
|-------|---------|
| 20 | Per-org tables (cost_data_standard_1_3, cloud billing, genai, subscription, schema_versions) |

---

## SDLC

### Development Workflow

1. **Edit config** -- Modify YAML pipeline config or JSON schema in the appropriate `configs/` directory
2. **Validate locally** -- Run config validator against the modified files
3. **Test pipeline** -- Run the affected pipeline locally to verify config changes work end-to-end
4. **PR review** -- Config changes reviewed alongside any code changes
5. **Deploy** -- Push to `main` (stage auto-deploy) or tag `v*` (prod)

### Testing Approach

| Layer | Tool | Scope |
|-------|------|-------|
| YAML schema | pytest | Required fields, type validation, enum values |
| JSON schema | pytest | BigQuery field types, partitioning config, clustering |
| Provider registry | pytest | All providers defined, required fields present |
| Template resolution | pytest | `{{org_slug}}`, `{{credential_id}}` resolve correctly |
| Cross-reference | pytest | Pipeline configs reference valid providers and schemas |
| Integration | pytest + BigQuery | Config-driven table creation matches expected schema |

### Deployment / CI/CD

- **Stage:** Config files deployed with service containers on `git push origin main`
- **Production:** Triggered by `git tag v*` via `cloudbuild-prod.yaml`
- **Validation gate:** Config validation should run as part of PR checks
- **Post-deploy:** Verify bootstrap status (`GET /admin/bootstrap/status`) to confirm schema correctness

---

## Key Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/system/providers.yml` | Central provider registry |
| `03-data-pipeline-service/configs/system/dataset_types.yml` | Dataset type definitions |
| `03-data-pipeline-service/configs/cloud/*/cost/billing.yml` | Cloud billing pipeline configs |
| `03-data-pipeline-service/configs/genai/payg/*.yml` | GenAI PAYG pipeline configs |
| `02-api-service/configs/setup/bootstrap/schemas/*.json` | Bootstrap meta table schemas |
| `02-api-service/configs/setup/organizations/onboarding/schemas/*.json` | Per-org table schemas |
| `02-api-service/configs/genai/seed/` | GenAI pricing seed data |

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/pipeline-ops` | Pipeline execution uses these YAML configs. Invalid configs cause pipeline failures. |
| `/bigquery-ops` | JSON schemas define BigQuery table structures. Invalid schemas cause bootstrap failures. |
| `/provider-mgmt` | Provider registry defines available integrations. Missing providers block pipeline setup. |
| `/bootstrap-onboard` | Bootstrap and onboarding consume JSON schemas to create BigQuery tables. |
| `/api-dev` | API Service loads config files at startup; validation prevents runtime errors. |
| `/integration-setup` | Provider credentials reference registry entries for validation endpoints. |
