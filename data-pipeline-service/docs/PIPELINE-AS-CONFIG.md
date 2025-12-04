# Pipeline as Config

**Core Principle:** Configuration defines WHAT to do. Processors define HOW to do it.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PIPELINE AS CONFIG                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   YAML Config                    Executor                    Processor      │
│   ───────────                    ────────                    ─────────      │
│                                                                             │
│   ┌─────────────┐               ┌─────────────┐             ┌─────────────┐ │
│   │ WHAT to do  │ ────────────► │ Orchestrate │ ──────────► │ HOW to do   │ │
│   │             │               │             │             │             │ │
│   │ • Steps     │               │ • Load YAML │             │ • API calls │ │
│   │ • Order     │               │ • Build DAG │             │ • BQ writes │ │
│   │ • Timeouts  │               │ • Timeouts  │             │ • Transform │ │
│   │ • Variables │               │ • Parallel  │             │ • Validate  │ │
│   └─────────────┘               └─────────────┘             └─────────────┘ │
│                                                                             │
│   configs/*.yml                 AsyncPipelineExecutor       processors/*.py │
│   (You edit this)               (Never changes)             (You edit this) │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Request Flow

```
API Request
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  POST /api/v1/integrations/{org}/openai/setup                               │
└─────────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. LOAD CONFIG                                                             │
│     configs/openai/auth/setup.yml                                           │
└─────────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. BUILD DAG                                                               │
│     Parse depends_on → determine execution order                            │
│                                                                             │
│     Step 1: store_credential (no dependencies)                              │
│         ↓                                                                   │
│     Step 2: seed_model_pricing (depends_on: store_credential)               │
│     Step 3: seed_subscriptions (depends_on: store_credential)               │
│         ↓                                                                   │
│     Steps 2 & 3 can run in PARALLEL (same dependency)                       │
└─────────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. EXECUTE STEPS                                                           │
│                                                                             │
│     For each step:                                                          │
│       • Resolve ps_type → processor module                                  │
│       • Apply timeout                                                       │
│       • Call processor.execute(step_config, context)                        │
│       • Log result                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. RETURN RESULT                                                           │
│     { status, duration, steps: [...] }                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Executor Responsibilities (Generic - Never Changes)

| Responsibility | Description |
|----------------|-------------|
| Load YAML | Read and parse pipeline config file |
| Build DAG | Determine step execution order from `depends_on` |
| Parallel Execution | Run independent steps concurrently |
| Timeouts | Enforce `timeout_minutes` at pipeline and step level |
| Pass Context | Provide `org_slug`, `variables`, `parameters` to processors |
| Metadata Logging | Log start/end times, status, errors to BigQuery |
| Error Handling | Catch failures, update status, continue or abort |

**The executor does NOT:**
- Know what each step does
- Understand config values
- Make API calls
- Write to BigQuery (except metadata)
- Transform data

---

## Processor Responsibilities (Custom - You Build These)

| Responsibility | Description |
|----------------|-------------|
| Read Config | Extract values from `step_config["config"]` |
| Resolve Variables | Replace `{variable}` placeholders from context |
| Business Logic | API calls, data transformation, validation |
| BigQuery Operations | Create tables, insert rows, run queries |
| Return Result | `{status, rows_processed, ...}` |

**Each processor is independent:**
- Knows nothing about the executor
- Receives `step_config` and `context`
- Returns a result dictionary

---

## Config Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Pipeline Config (YAML)                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  pipeline_id          Unique identifier for this pipeline                   │
│  name                 Human-readable name                                   │
│  description          What this pipeline does                               │
│  version              Config version                                        │
│                                                                             │
│  timeout_minutes      Max time for entire pipeline (default: 30)            │
│                                                                             │
│  variables            Key-value pairs passed to all steps                   │
│    seed_dir           Example: "configs/openai/seed"                        │
│    schema_dir         Example: "configs/openai/seed/schemas"                │
│                                                                             │
│  steps                List of steps to execute                              │
│    - step_id          Unique ID within pipeline                             │
│      ps_type          Processor type (maps to module path)                  │
│      description      What this step does                                   │
│      depends_on       Step ID(s) that must complete first                   │
│      timeout_minutes  Max time for this step (default: 10)                  │
│      config           Step-specific configuration (passed to processor)     │
│                                                                             │
│  schedule             (Optional) Scheduling configuration                   │
│    type               daily | monthly | hourly                              │
│    time               "02:00" (HH:MM)                                       │
│    timezone           UTC                                                   │
│                                                                             │
│  execution            Execution control                                     │
│    run_once           true = only run once per org                          │
│    force_param        Parameter name to force re-run                        │
│                                                                             │
│  requires_auth        true | false                                          │
│  auth_type            org_api_key | admin_key                               │
│                                                                             │
│  tags                 List of tags for categorization                       │
│  category             Pipeline category                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ps_type Resolution

The `ps_type` field maps directly to a processor module:

```
ps_type                         Module Path
───────                         ───────────
openai.usage          →         src/core/processors/openai/usage.py
openai.cost           →         src/core/processors/openai/cost.py
openai.seed_csv       →         src/core/processors/openai/seed_csv.py
integrations.kms_store →        src/core/processors/integrations/kms_store.py
gcp.bq_etl            →         src/core/processors/gcp/bq_etl.py
```

**Pattern:** `{provider}.{domain}` → `src/core/processors/{provider}/{domain}.py`

---

## Dependency Graph (DAG)

Steps can declare dependencies using `depends_on`:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Example: OpenAI Setup Pipeline                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Step 1: store_credential                                                   │
│  depends_on: (none)                                                         │
│                     │                                                       │
│                     ▼                                                       │
│          ┌─────────┴─────────┐                                              │
│          │                   │                                              │
│          ▼                   ▼                                              │
│  Step 2: seed_pricing    Step 3: seed_subs                                  │
│  depends_on: step_1      depends_on: step_1                                 │
│                                                                             │
│  Execution:                                                                 │
│    Level 1: [store_credential]          ← Runs first                        │
│    Level 2: [seed_pricing, seed_subs]   ← Run in PARALLEL                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Rules:**
- Steps with no dependencies run first
- Steps with same dependencies run in parallel
- Circular dependencies cause pipeline to fail

---

## Timeouts

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Timeout Hierarchy                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Pipeline Level                                                             │
│  ──────────────                                                             │
│  timeout_minutes: 10    ← Max time for entire pipeline                      │
│                           If exceeded → FAILED (TIMEOUT)                    │
│                                                                             │
│  Step Level                                                                 │
│  ──────────                                                                 │
│  steps:                                                                     │
│    - step_id: "extract"                                                     │
│      timeout_minutes: 5  ← Max time for this step                           │
│                            If exceeded → Step FAILED, pipeline FAILED       │
│                                                                             │
│  Defaults                                                                   │
│  ────────                                                                   │
│  Pipeline: 30 minutes                                                       │
│  Step: 10 minutes                                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**No retries.** If timeout or failure → re-run the pipeline manually.

---

## Variables and Context

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Variable Flow                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  YAML Config                                                                │
│  ───────────                                                                │
│  variables:                                                                 │
│    seed_dir: "configs/openai/seed"                                          │
│    schema_dir: "configs/openai/seed/schemas"                                │
│                                                                             │
│  steps:                                                                     │
│    - config:                                                                │
│        csv_file: "{seed_dir}/model_pricing.csv"                             │
│                          ↓                                                  │
│                                                                             │
│  Executor                                                                   │
│  ────────                                                                   │
│  context = {                                                                │
│    org_slug: "acme_corp",                                                   │
│    seed_dir: "configs/openai/seed",                                         │
│    schema_dir: "configs/openai/seed/schemas"                                │
│  }                                                                          │
│                          ↓                                                  │
│                                                                             │
│  Processor                                                                  │
│  ─────────                                                                  │
│  csv_file = resolve("{seed_dir}/model_pricing.csv", context)                │
│  # Result: "configs/openai/seed/model_pricing.csv"                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Important:** The executor passes variables to context. Processors must resolve `{variable}` placeholders themselves.

---

## Adding New Functionality

### To add a new config parameter:

```
1. Add to YAML config
   ────────────────────
   config:
     new_param: "value"

2. Read in processor
   ──────────────────
   new_param = config.get("new_param")

3. Done. No executor changes needed.
```

### To add a new processor:

```
1. Create processor file
   ──────────────────────
   src/core/processors/{provider}/{domain}.py

2. Implement required interface
   ────────────────────────────
   - get_engine() function
   - execute(step_config, context) method
   - Return {status, ...} dict

3. Use in YAML config
   ───────────────────
   ps_type: "{provider}.{domain}"

4. Done. No executor changes needed.
```

### To add a new pipeline:

```
1. Create YAML config
   ───────────────────
   configs/{provider}/{pipeline}.yml

2. Define steps with existing processors
   ─────────────────────────────────────
   steps:
     - step_id: "step_1"
       ps_type: "existing.processor"
       config: {...}

3. Done. No code changes if processors exist.
```

---

## File Organization

```
configs/
├── openai/
│   ├── auth/
│   │   ├── setup.yml           ← Integration setup (one-time)
│   │   └── validate.yml        ← Re-validate credentials
│   ├── seed/
│   │   ├── model_pricing.csv   ← Default pricing data (standard for all orgs)
│   │   └── schemas/
│   │       ├── openai_model_pricing.json
│   │       └── openai_subscriptions.json  ← Used by API-based subscriptions pipeline
│   ├── usage_cost.yml          ← Daily usage + cost pipeline
│   └── subscriptions.yml       ← Monthly subscriptions pipeline (fetches from API)

src/core/processors/
├── openai/
│   ├── usage.py                ← Extract usage from OpenAI API
│   ├── cost.py                 ← Transform usage to cost
│   ├── seed_csv.py             ← Load CSV seed data
│   └── subscriptions.py        ← Extract subscription data
├── integrations/
│   ├── kms_store.py            ← Store encrypted credentials
│   └── kms_decrypt.py          ← Decrypt credentials
└── gcp/
    └── bq_etl.py               ← BigQuery ETL operations
```

---

## Example: Complete Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Pipeline: OpenAI Usage & Cost (Daily)                                      │
│  Config: configs/openai/usage_cost.yml                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Trigger: POST /api/v1/pipelines/run/{org}/openai/usage_cost                │
│  Parameters: { start_date: "2024-01-15", end_date: "2024-01-15" }           │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Step 1: extract_usage                                                 │  │
│  │ ps_type: openai.usage                                                 │  │
│  │ timeout: 5 min                                                        │  │
│  │                                                                       │  │
│  │ What happens:                                                         │  │
│  │   1. Processor decrypts stored OpenAI API key                         │  │
│  │   2. Calls OpenAI Usage API for date range                            │  │
│  │   3. Writes raw data to openai_usage_daily_raw table                  │  │
│  │   4. Returns { status: SUCCESS, rows_processed: 150 }                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                      │                                      │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Step 2: transform_cost                                                │  │
│  │ ps_type: openai.cost                                                  │  │
│  │ depends_on: extract_usage                                             │  │
│  │ timeout: 3 min                                                        │  │
│  │                                                                       │  │
│  │ What happens:                                                         │  │
│  │   1. Reads pricing from openai_model_pricing table                    │  │
│  │   2. Reads usage from openai_usage_daily_raw table                    │  │
│  │   3. Calculates cost per model (tokens × price)                       │  │
│  │   4. Writes to openai_cost_daily table                                │  │
│  │   5. Returns { status: SUCCESS, total_cost_usd: 45.67 }               │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                      │                                      │
│                                      ▼                                      │
│  Result: { status: COMPLETED, duration_ms: 12500, steps: [...] }            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## GCP Billing Pipeline: Dual-Client Architecture

For GCP billing data, we read from **customer's GCP** and write to **CloudAct's BigQuery**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  GCP Billing Pipeline Flow                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ CUSTOMER'S GCP PROJECT                                               │   │
│  │ (Org A's billing data)                                               │   │
│  │                                                                      │   │
│  │  ┌─────────────────────────┐                                         │   │
│  │  │ billing_export dataset  │                                         │   │
│  │  │ └── gcp_billing_export  │ ◄── Customer's billing data             │   │
│  │  └─────────────────────────┘                                         │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              │ READ using Customer's SA credentials        │
│                              │ (decrypted from org_integration_credentials)│
│                              ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ PIPELINE: gcp.bq_etl                                                 │   │
│  │                                                                      │   │
│  │  1. GCPAuthenticator(org_slug="org_a")                               │   │
│  │     └── Decrypt SA JSON from org_integration_credentials             │   │
│  │     └── Create BigQuery client with customer's credentials           │   │
│  │                                                                      │   │
│  │  2. Execute query on CUSTOMER'S GCP                                  │   │
│  │     └── SELECT * FROM `customer_project.billing.gcp_billing_export`  │   │
│  │                                                                      │   │
│  │  3. Write to CLOUDACT's BQ using CloudAct's credentials              │   │
│  │     └── INSERT INTO `cloudact_project.org_a_prod.gcp_billing_daily`  │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              │ WRITE using CloudAct's credentials          │
│                              ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ CLOUDACT'S GCP PROJECT                                               │   │
│  │ (All customer data)                                                  │   │
│  │                                                                      │   │
│  │  org_a_prod dataset                                                  │   │
│  │  └── gcp_billing_daily_raw  ◄── Org A's billing data                 │   │
│  │                                                                      │   │
│  │  org_b_prod dataset                                                  │   │
│  │  └── gcp_billing_daily_raw  ◄── Org B's billing data                 │   │
│  │                                                                      │   │
│  │  org_c_prod dataset                                                  │   │
│  │  └── gcp_billing_daily_raw  ◄── Org C's billing data                 │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Pipeline Config for Customer GCP Reads

```yaml
# configs/gcp/billing.yml
steps:
  - step_id: "extract_billing"
    ps_type: "gcp.bq_etl"
    source:
      use_org_credentials: true    # ← Use customer's SA credentials
      query: |
        SELECT * FROM `{customer_project}.billing.gcp_billing_export`
        WHERE DATE(usage_start_time) = '{date}'
    destination:
      table: "gcp_billing_daily_raw"
      write_mode: "append"
```

### Credential Flow for 10K Orgs

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  10K Concurrent Pipelines                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Org A ──► Decrypt Org A's SA ──► Org A's GCP ──┐                           │
│  Org B ──► Decrypt Org B's SA ──► Org B's GCP ──┼──► CloudAct BQ            │
│  Org C ──► Decrypt Org C's SA ──► Org C's GCP ──┤    (shared destination)   │
│  ...                                            │                           │
│  Org N ──► Decrypt Org N's SA ──► Org N's GCP ──┘                           │
│                                                                             │
│  Each pipeline:                                                             │
│  ├── Creates temporary BQ client with THEIR SA credentials                 │
│  ├── Reads from THEIR GCP project                                          │
│  └── Writes to CloudAct's {org_slug}_{env} dataset                         │
│                                                                             │
│  Shared resources:                                                          │
│  ├── Thread pool (200 workers) - just async wrapper                         │
│  └── CloudAct BQ connection - BigQuery handles scheduling                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Two BigQuery Clients Per Pipeline

| Client | Credentials | Project | Purpose |
|--------|-------------|---------|---------|
| Source (Customer) | Customer's SA JSON | Customer's GCP | Read billing data |
| Destination (CloudAct) | CloudAct default | CloudAct GCP | Write to org dataset |

---

## Multi-Tenant Resource Considerations

### BigQuery Quotas

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Project-Level BigQuery Quotas                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  All organizations share the same GCP project.                              │
│  BigQuery quotas are enforced at PROJECT level, not per-org.                │
│                                                                             │
│  Shared Quotas:                                                             │
│  ───────────────                                                            │
│  • Concurrent queries (default: 100 per project)                            │
│  • Streaming insert rows/sec (default: 100,000 per table)                   │
│  • API requests/sec (default: 100 per user)                                 │
│  • Bytes scanned per day (varies by billing tier)                           │
│                                                                             │
│  Impact:                                                                    │
│  ────────                                                                   │
│  • Heavy tenant can exhaust quotas for all tenants                          │
│  • Spike in one org's pipeline affects others                               │
│  • No per-org quota isolation at BigQuery level                             │
│                                                                             │
│  Mitigations:                                                               │
│  ────────────                                                               │
│  • Per-request thread pool (10 workers) limits concurrency per org          │
│  • Step-level timeouts prevent runaway queries                              │
│  • org_usage_quotas table tracks daily pipeline runs per org                │
│                                                                             │
│  Enterprise Scale Consideration:                                            │
│  ─────────────────────────────────                                          │
│  For high-volume enterprise deployments, consider:                          │
│  • Separate GCP projects per subscription tier                              │
│  • Reserved slots for priority orgs                                         │
│  • Query prioritization in BigQuery                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tenant Isolation

| Resource | Isolation Level | How |
|----------|-----------------|-----|
| BigQuery Data | Per-org dataset | `{org_slug}_{env}` naming |
| Thread Pool | Shared | BigQuery SERVICE handles scheduling |
| BigQuery Client | Per-request | Fresh client per execution |
| API Credentials | Per-org | KMS encrypted, org_slug filter |
| Pipeline Execution | Per-request | Independent executor instance |

**Why shared thread pool is fine:**
- Thread pool just wraps sync BigQuery calls → async (doesn't affect query execution)
- BigQuery SERVICE handles actual query scheduling (100 concurrent per project)
- Tenant isolation is at DATA level (datasets), not thread level

---

## Key Principles

| Principle | Description |
|-----------|-------------|
| **Config is declarative** | YAML says WHAT, not HOW |
| **Processors are imperative** | Python does the work |
| **Executor is generic** | Never needs modification |
| **No fallbacks** | Missing data = explicit failure |
| **No retries** | Failure = re-run manually |
| **Timeouts are mandatory** | Every pipeline and step has limits |
| **Variables are explicit** | Processors resolve placeholders |
| **Dependencies are DAG** | Parallel where possible |
| **Data-level isolation** | Per-org datasets, BigQuery handles query scheduling |

---

## Quick Reference

| Config Field | Level | Default | Description |
|--------------|-------|---------|-------------|
| `timeout_minutes` | Pipeline | 30 | Max pipeline duration |
| `timeout_minutes` | Step | 10 | Max step duration |
| `depends_on` | Step | none | Step dependencies |
| `ps_type` | Step | required | Processor module path |
| `config` | Step | {} | Passed to processor |
| `variables` | Pipeline | {} | Available in context |
| `run_once` | Execution | false | One-time execution |

---

*Pipeline as Config v1.0 | Convergence Data Pipeline*
