# Provider Management - Requirements

## Overview

Configuration-driven provider lifecycle management for CloudAct. Covers the provider registry, credential management, processor creation, pipeline configuration, frontend integration, pricing data seeding, and validation. Supports three provider types (cloud, genai, saas) with KMS-encrypted credentials and a standardized 8-step workflow for adding new providers.

## Source Specifications

Defined in SKILL.md (`provider-mgmt/SKILL.md`).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    Provider Lifecycle Architecture                         │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Provider Registry (Source of Truth)                                      │
│  ───────────────────────────────────                                      │
│  03-data-pipeline-service/configs/system/providers.yml                    │
│  ├─ Provider name, type (cloud/genai/saas)                                │
│  ├─ Credential type (api_key, service_account, access_key, iam_role)      │
│  ├─ API base URL, auth header, validation endpoint                        │
│  ├─ Rate limits, data tables, seed paths                                  │
│  └─ Display name, status                                                  │
│                                                                           │
│  Credential Flow                                                          │
│  ───────────────                                                          │
│  User enters key → POST /integrations/{org}/{provider}/setup              │
│  ├─ Validate against provider API (validation_endpoint)                   │
│  ├─ Encrypt via GCP KMS (keyring per environment)                         │
│  ├─ Store in organizations.org_integration_credentials                    │
│  └─ Return { status: "configured", credential_id: "..." }                │
│                                                                           │
│  Pipeline Execution Flow                                                  │
│  ──────────────────────                                                   │
│  POST /pipelines/run/{org}/{provider}/{domain}/{pipeline}                 │
│  ├─ Load provider config from providers.yml                               │
│  ├─ Decrypt credential from org_integration_credentials                   │
│  ├─ Instantiate processor (PROCESSOR_REGISTRY[provider])                  │
│  ├─ Execute pipeline steps (extract → transform → load)                   │
│  ├─ Write to {org_slug}_prod dataset with x_* lineage fields             │
│  └─ Update org_meta_pipeline_runs with execution metadata                 │
│                                                                           │
│  Services Involved                                                        │
│  ─────────────────                                                        │
│  02-api-service (8000)         → Integration setup, credential storage    │
│  03-data-pipeline-service (8001) → Pipeline execution, processor logic    │
│  01-fronted-system (3000)      → Integration UI pages                     │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## SDLC Workflow

### Adding a New Provider

```
1. Add to providers.yml (registry entry)
   → Edit 03-data-pipeline-service/configs/system/providers.yml

2. Create processor (business logic)
   → Create 03-data-pipeline-service/src/core/processors/{provider}/processor.py
   → Register in PROCESSOR_REGISTRY

3. Create pipeline configs (execution templates)
   → Create 03-data-pipeline-service/configs/{provider}/*.yml

4. Add frontend integration page (UI)
   → Create 01-fronted-system/app/[orgSlug]/integrations/{type}/{provider}/page.tsx

5. Seed pricing data (for genai providers)
   → Add CSV to 03-data-pipeline-service/configs/genai/seed/{provider}/pricing.csv

6. Test pipeline locally
   → Run pipeline against test org
   → Verify data in BigQuery

7. Open PR + review
   → /pr-review skill validates changes
   → Tests pass, no breaking changes

8. Deploy + sync
   → Merge to main → auto-deploy to stage
   → Run bootstrap-sync (adds new tables if needed)
   → Run org-sync-all (syncs per-org datasets)
   → Tag for production release
```

### Deployment Sequence

| Step | Action | Command |
|------|--------|---------|
| 1 | Merge PR to main | `gh pr merge --squash` |
| 2 | Stage auto-deploys | Cloud Build trigger |
| 3 | Bootstrap sync (if new tables) | `./run-job.sh stage bootstrap-sync` |
| 4 | Org sync all | `./run-job.sh stage org-sync-all` |
| 5 | Test pipeline on stage | Manual pipeline run |
| 6 | Tag for production | `git tag v4.3.x && git push origin v4.3.x` |
| 7 | Prod bootstrap-sync | `echo "yes" \| ./run-job.sh prod bootstrap-sync` |
| 8 | Prod org-sync-all | `echo "yes" \| ./run-job.sh prod org-sync-all` |

### Testing Approach

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | pytest | Processor logic, config parsing, validation |
| Integration | pytest + BigQuery sandbox | Pipeline execution, data writes |
| E2E | Playwright | Frontend integration pages |
| Config | JSON Schema validation | providers.yml, pipeline configs |
| Manual | curl + BigQuery console | End-to-end provider pipeline |

---

## Functional Requirements

### FR-PM-001: Provider Registry

- **FR-PM-001.1**: Central registry at `03-data-pipeline-service/configs/system/providers.yml`
- **FR-PM-001.2**: Each provider entry contains: name, type, credential_type, display_name, api_base_url, auth_header, auth_prefix, validation_endpoint, rate_limit, data_tables, seed_path
- **FR-PM-001.3**: Registry is the single source of truth for provider configuration
- **FR-PM-001.4**: All services read from the same registry (pipeline service owns the file)
- **FR-PM-001.5**: Dataset type mapping in `03-data-pipeline-service/configs/system/dataset_types.yml`

### FR-PM-002: Provider Types

| Type | Description | Credential Types | Providers |
|------|-------------|-----------------|-----------|
| cloud | Cloud infrastructure billing | service_account, access_key, iam_role | GCP, AWS, Azure, OCI |
| genai | Generative AI usage/costs | api_key | OpenAI, Anthropic, Gemini, DeepSeek |
| saas | SaaS subscription tracking | api_key, oauth, manual | Canva, Slack, ChatGPT Plus |

- **FR-PM-002.1**: Cloud providers ingest billing exports (CSV, JSON, BigQuery ETL)
- **FR-PM-002.2**: GenAI providers extract usage via provider APIs and calculate costs from pricing catalogs
- **FR-PM-002.3**: SaaS providers track subscription costs via manual entry or API

### FR-PM-003: Credential Management

- **FR-PM-003.1**: Integration endpoint: `POST /api/v1/integrations/{org}/{provider}/setup`
- **FR-PM-003.2**: Credential validated against provider's validation_endpoint before storing
- **FR-PM-003.3**: All credentials encrypted via GCP KMS before storage
- **FR-PM-003.4**: Encrypted credentials stored in `organizations.org_integration_credentials`
- **FR-PM-003.5**: Credential record includes: credential_id, org_slug, provider, credential_type, encrypted_value, is_active, created_at
- **FR-PM-003.6**: One active credential per provider per org (new credential deactivates old)
- **FR-PM-003.7**: Credential deletion marks as inactive (soft delete), does not remove encrypted data

### FR-PM-004: Credential Types per Provider

| Provider | Credential Type | Fields | Validation |
|----------|----------------|--------|------------|
| OpenAI | api_key | API key | GET /v1/models |
| Anthropic | api_key | API key | GET /v1/models |
| Gemini | api_key | API key | GET /v1/models |
| DeepSeek | api_key | API key | GET /v1/models |
| GCP | service_account | JSON key file | IAM validateToken |
| AWS | access_key | Access Key ID + Secret | STS GetCallerIdentity |
| Azure | service_principal | Client ID + Secret + Tenant | OAuth token request |
| OCI | iam_role | Tenancy OCID + User OCID + Key | Identity API |
| Canva | api_key | API key | GET /v1/users/me |
| Slack | oauth | OAuth token | GET /api/auth.test |
| ChatGPT Plus | manual | Subscription details | No API validation |

### FR-PM-005: Processor Architecture

- **FR-PM-005.1**: All processors implement `ProcessorProtocol` (abstract interface)
- **FR-PM-005.2**: Processors located at `03-data-pipeline-service/src/core/processors/{provider}/processor.py`
- **FR-PM-005.3**: Processors registered in `PROCESSOR_REGISTRY` dict in `processors/__init__.py`
- **FR-PM-005.4**: Each processor implements: `extract_usage()`, `calculate_costs()`, and provider-specific methods
- **FR-PM-005.5**: Processors receive decrypted credentials at runtime (not stored in processor state)

### FR-PM-006: Pipeline Configuration

- **FR-PM-006.1**: Pipeline configs at `03-data-pipeline-service/configs/{provider}/{domain}/{pipeline}.yml`
- **FR-PM-006.2**: Each config includes: pipeline_id template, name, version, timeout, steps, schedule
- **FR-PM-006.3**: Pipeline ID format: `{org_slug}-{provider}-{domain}-{pipeline}`
- **FR-PM-006.4**: Pipeline execution via: `POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}`
- **FR-PM-006.5**: All pipeline writes include x_* lineage fields (x_org_slug, x_pipeline_id, x_credential_id, x_run_id, x_ingested_at, x_ingestion_date, x_pipeline_run_date)

### FR-PM-007: FOCUS 1.3 Conversion

- **FR-PM-007.1**: All provider cost data normalizes to FOCUS 1.3 standard
- **FR-PM-007.2**: Unified output table: `cost_data_standard_1_3` in `{org_slug}_prod` dataset
- **FR-PM-007.3**: Cloud providers: `cloud/{provider}/cost/billing` pipeline
- **FR-PM-007.4**: GenAI providers: `genai/payg/*` pipelines
- **FR-PM-007.5**: SaaS providers: `subscription/costs/subscription_cost` pipeline

### FR-PM-008: Provider Validation

- **FR-PM-008.1**: Validate provider exists in registry before any operation
- **FR-PM-008.2**: Validate credential format matches provider's credential_type
- **FR-PM-008.3**: Validate API key by making authenticated request to validation_endpoint
- **FR-PM-008.4**: Validate pipeline config exists for provider/domain/pipeline combination
- **FR-PM-008.5**: Rate limit validation requests per provider config (requests_per_minute)

### FR-PM-009: Current Provider Matrix

| Provider | Type | Status | Pipelines | Credential | Seed Data |
|----------|------|--------|-----------|------------|-----------|
| openai | genai | Active | usage, cost, subscriptions | api_key | pricing.csv |
| anthropic | genai | Active | usage, cost | api_key | pricing.csv |
| gemini | genai | Active | usage, cost | api_key | pricing.csv |
| deepseek | genai | Active | usage, cost | api_key | pricing.csv |
| gcp | cloud | Active | billing (BQ ETL) | service_account | N/A |
| aws | cloud | Active | billing (CUR) | access_key | N/A |
| azure | cloud | Active | billing (Cost Mgmt API) | service_principal | N/A |
| oci | cloud | Active | billing (Usage API) | iam_role | N/A |
| canva | saas | Active | subscription_cost | api_key | N/A |
| slack | saas | Active | subscription_cost | oauth | N/A |
| chatgpt_plus | saas | Active | subscription_cost | manual | N/A |

### FR-PM-010: 8-Step New Provider Workflow

| Step | Action | Location | Deliverable |
|------|--------|----------|-------------|
| 1 | Add to registry | `configs/system/providers.yml` | Provider entry in YAML |
| 2 | Create processor | `src/core/processors/{provider}/` | Processor class + registration |
| 3 | Create pipeline configs | `configs/{provider}/{domain}/*.yml` | Pipeline YAML configs |
| 4 | Add frontend integration | `01-fronted-system/app/[orgSlug]/integrations/` | Integration setup page |
| 5 | Seed pricing data | `configs/genai/seed/{provider}/pricing.csv` | Pricing CSV (genai only) |
| 6 | Test pipeline | Local test run | Verified data in BigQuery |
| 7 | Document | Update SKILL.md provider matrix | Updated documentation |
| 8 | Deploy | Merge + bootstrap-sync + org-sync | Live in stage/prod |

---

## Non-Functional Requirements

### NFR-PM-001: Security

- All credentials encrypted via GCP KMS at rest
- Decrypted credentials exist in memory only during pipeline execution
- No plaintext credentials in logs, error messages, or API responses
- Credential validation requests use HTTPS only
- KMS keyring per environment (stage vs prod, never shared)

### NFR-PM-002: Extensibility

- Adding a new provider requires NO code changes to the pipeline framework
- Provider registry is YAML-driven (no code compilation needed for config)
- Processor protocol ensures consistent interface across all provider types
- Pipeline configs are declarative YAML (no embedded code)

### NFR-PM-003: Reliability

- Credential validation must succeed before storage (no storing invalid keys)
- Pipeline execution retries on transient provider API failures (3 attempts with backoff)
- Rate limiting prevents provider API abuse per provider config
- Idempotent pipeline runs (same date + provider = same result via x_pipeline_run_date)

### NFR-PM-004: Multi-Tenancy

- Each org has independent credentials per provider
- Pipeline execution scoped to org via x_org_slug in all writes
- No cross-org credential access (org_slug validated on every request)
- Provider quotas enforced per org plan (Starter: 3 providers, Professional: 6, Scale: 10)

### NFR-PM-005: Performance

- Credential validation < 5 seconds per provider
- Provider registry load < 100ms (cached in memory)
- Pipeline execution timeout configurable per pipeline config (default 30 min)
- KMS encrypt/decrypt < 500ms per operation

### NFR-PM-006: Observability

- Pipeline execution logged to `org_meta_pipeline_runs` with status, duration, error details
- Step-level logs in `org_meta_step_logs` for debugging
- State transitions tracked in `org_meta_state_transitions`
- Data quality results in `org_meta_dq_results`

---

## Key Files

| File | Purpose |
|------|---------|
| `03-data-pipeline-service/configs/system/providers.yml` | Provider registry (source of truth) |
| `03-data-pipeline-service/configs/system/dataset_types.yml` | Dataset type mapping |
| `03-data-pipeline-service/src/core/processors/` | Provider processor implementations |
| `03-data-pipeline-service/src/core/processors/protocol.py` | Processor protocol (abstract interface) |
| `02-api-service/src/app/routers/integrations.py` | Integration setup endpoints |
| `02-api-service/src/core/services/encryption/kms_encryption.py` | KMS credential encryption |
| `01-fronted-system/app/[orgSlug]/integrations/` | Frontend integration pages |
| `03-data-pipeline-service/configs/genai/seed/` | GenAI pricing seed data |
| `03-data-pipeline-service/configs/` | Pipeline configuration files |

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/integration-setup` | Configures provider integrations per org. Provider-mgmt defines the registry; integration-setup executes the setup flow. |
| `/pipeline-ops` | Runs provider pipelines. Provider-mgmt defines pipeline configs; pipeline-ops executes them. |
| `/config-validator` | Validates provider and pipeline configs. Ensures providers.yml schema compliance. |
| `/bootstrap-onboard` | Bootstrap creates meta tables; org-sync creates per-org tables that providers write to. |
| `/security-audit` | Audits credential encryption. Ensures KMS compliance for all provider credentials. |
| `/cost-analysis` | Reads FOCUS 1.3 data produced by provider pipelines. |
| `/genai-costs` | Specialized GenAI cost analysis. Depends on genai provider pipelines for data. |
| `/subscription-costs` | SaaS subscription cost tracking. Depends on saas provider pipelines. |
