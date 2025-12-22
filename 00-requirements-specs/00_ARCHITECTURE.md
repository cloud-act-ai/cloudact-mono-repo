# CloudAct Platform Architecture

**System-level architecture for multi-tenant GenAI and cloud cost analytics platform**

---

## System Overview

CloudAct is a multi-tenant SaaS platform that helps organizations track and optimize GenAI and cloud spending. The platform consists of three main systems:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CLOUDACT PLATFORM                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌──────────────────┐      ┌────────────────────┐      ┌────────────────────┐  │
│   │     FRONTEND     │      │    API-SERVICE     │      │ DATA-PIPELINE-SVC  │  │
│   │  (User Interface)│◄────►│  (Frontend-Facing) │      │ (Pipeline Engine)  │  │
│   ├──────────────────┤      ├────────────────────┤      ├────────────────────┤  │
│   │ • Next.js 16     │      │ • Bootstrap        │      │ • Scheduled ETL    │  │
│   │ • React 19       │      │ • Org Onboarding   │      │ • Usage Processing │  │
│   │ • Supabase       │      │ • Integrations     │      │ • Cost Calculation │  │
│   │ • Stripe         │      │ • LLM Data CRUD    │      │ • Cloud Scheduler  │  │
│   │ • Tailwind v4    │      │ • API Key Mgmt     │      │ • Batch Jobs       │  │
│   └──────────────────┘      └────────────────────┘      └────────────────────┘  │
│           │                          │                           │               │
│           │    Frontend API          │     Same BigQuery         │               │
│           └──────────────────────────┘◄─────────────────────────►│               │
│                                       │     Same Auth            │               │
│                                       └──────────────────────────┘               │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### System Components

| Component                     | Technology                   | Purpose                                                        |
| ----------------------------- | ---------------------------- | -------------------------------------------------------------- |
| **Frontend**                  | Next.js 16, Supabase, Stripe | User auth, org management, billing, UI/UX                      |
| **api-service**      | FastAPI, BigQuery, KMS       | Frontend-facing API: bootstrap, onboarding                     |
| **data-pipeline-service** | FastAPI, BigQuery, KMS       | Pipeline execution, integrations, LLM data CRUD, scheduled ETL |
| **Authentication**            | Supabase Auth                | User authentication, session management                        |
| **Billing**                   | Stripe                       | Subscription management, payment processing                    |
| **Data Storage**              | BigQuery                     | Analytics data, pipeline execution logs                        |
| **Secret Management**         | Google Cloud KMS             | Credential encryption at rest                                  |

### Backend Service Split

| Service                       | Responsibility           | Endpoints                                                                  |
| ----------------------------- | ------------------------ | -------------------------------------------------------------------------- |
| **api-service**      | Bootstrap & Onboarding   | `/api/v1/admin/bootstrap`, `/api/v1/organizations/*`                       |
| **data-pipeline-service** | Pipelines & Integrations | `/api/v1/pipelines/run/*`, `/api/v1/integrations/*`, `/api/v1/scheduler/*` |

**Shared Resources:**

- Both services use the **same BigQuery datasets** (organizations, per-org datasets)
- Both services use the **same CA_ROOT_API_KEY** for admin operations
- Both services use the **same auth flow** (org API key validation via `organizations.org_api_keys`)
- Both services use the **same KMS encryption keys** for credentials

---

## Folder Structure

The codebase is organized as a monorepo containing the following core components:

### `02-api-service/`

**Frontend-Facing API (FastAPI)**
Handles organization onboarding, integration setup, and LLM data management.

- `src/`: Application source code (routers, services, models).
- `configs/`: Service configurations.
- `tests/`: Pytest test suite.

### `03-data-pipeline-service/`

**Pipeline Engine (FastAPI + BigQuery)**
Handles scheduled ETL jobs, usage processing, and cost calculations.

- `src/`: Pipeline logic, processors, and scheduler.
- `configs/`: Pipeline definitions (YAML) and SQL queries.
- `scripts/`: Deployment and utility scripts.
- `tests/`: Pipeline verification tests.

### `01-fronted-system/`

**User Interface (Next.js 16)**
The main web application for users to interact with the platform.

- `app/`: Next.js App Router pages and API routes.
- `components/`: Reusable React components (UI library).
- `lib/`: Shared utilities, Supabase client, and Stripe logic.
- `supabase/`: Database migrations and type definitions.
- `actions/`: Server actions for form handling and data mutation.
- `tests/`: End-to-end and unit tests.

### `inra-cicd-automation/`

**CI/CD Automation**
Scripts and workflows for infrastructure and deployment automation.

### `00-requirements-docs/`

**Documentation**
Architecture diagrams, requirements, and design specifications.

---

## Customer Lifecycle

CloudAct follows a 4-phase customer journey:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CUSTOMER JOURNEY                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  PHASE 1: SIGNUP & SUBSCRIPTION (Frontend Only)                        │
│  ────────────────────────────────────────────────────────              │
│  1. User creates account (Supabase Auth)                               │
│  2. User creates organization (Supabase DB)                            │
│  3. User subscribes to plan (Stripe Checkout)                          │
│  4. Organization record created in Supabase                            │
│                                                                         │
│  Data stored: User profile, org metadata, subscription status          │
│  ↓                                                                      │
│                                                                         │
│  PHASE 2: BACKEND ONBOARDING (One-time per org)                        │
│  ────────────────────────────────────────────────────────              │
│  1. Frontend calls backend onboard API (X-CA-Root-Key)                 │
│  2. Backend creates:                                                   │
│     - BigQuery dataset for org ({org_slug}_{env})                      │
│     - Org profile in central BigQuery dataset                          │
│     - Org API key (hashed + KMS encrypted)                             │
│     - Org subscription record in BigQuery                              │
│  3. Returns API key (shown ONCE to user)                               │
│  4. Frontend stores:                                                   │
│     - Full API key in user.user_metadata (Supabase)                    │
│     - Fingerprint (last 4 chars) in organizations table                │
│  5. Webhook syncs subscription to backend:                             │
│     - Calls syncSubscriptionToBackend() with billingStatus, trialEndsAt│
│     - Maps: trialing→TRIAL, active→ACTIVE, past_due→SUSPENDED,        │
│              canceled→CANCELLED, paused→SUSPENDED                      │
│     - Backend updates org_subscriptions and org_usage_quotas           │
│                                                                         │
│  Data stored: Org dataset, API key, subscription limits                │
│  ↓                                                                      │
│                                                                         │
│  PHASE 3: INTEGRATIONS (User provides credentials)                     │
│  ────────────────────────────────────────────────────────              │
│  User adds LLM/Cloud provider credentials via data-pipeline-service:    │
│  - POST /api/v1/integrations/{org}/openai/setup                        │
│  - POST /api/v1/integrations/{org}/anthropic/setup                     │
│  - POST /api/v1/integrations/{org}/gcp/setup                           │
│                                                                         │
│  Pipeline service: Validates credential, encrypts with KMS, stores     │
│  Frontend: Updates integration status in Supabase (reference only)     │
│                                                                         │
│  Data stored: Encrypted credentials (BigQuery), status (Supabase)      │
│  ↓                                                                      │
│                                                                         │
│  PHASE 4: PIPELINE EXECUTION (Data Processing)                         │
│  ────────────────────────────────────────────────────────              │
│  A) SCHEDULED PIPELINES (Daily Automatic)                              │
│     - Cloud Scheduler triggers daily cron                              │
│     - Backend processes all orgs with valid integrations               │
│     - No user action needed                                            │
│                                                                         │
│  B) AD-HOC PIPELINES (User Triggered)                                  │
│     - User clicks "Run Now" in frontend                                │
│     - Useful for: backfills, testing, immediate refresh                │
│                                                                         │
│  Pipeline Flow:                                                        │
│  1. Frontend checks subscription status (active or trialing only)      │
│  2. Backend validates org API key → gets org_slug                      │
│  3. Backend checks org_subscriptions status (ACTIVE/TRIAL)             │
│  4. Backend decrypts stored credentials (KMS)                          │
│  5. Fetches data from provider APIs                                    │
│  6. Transforms and loads into org's BigQuery dataset                   │
│  7. Logs execution metadata                                            │
│                                                                         │
│  Pipeline Quota Enforcement:                                           │
│  - Frontend: Checks subscription_status in ('active', 'trialing')      │
│  - Backend: Checks org_subscriptions.status in ('ACTIVE', 'TRIAL')    │
│  - Rejects pipelines if status is SUSPENDED, CANCELLED, or EXPIRED     │
│                                                                         │
│  Data stored: Usage data, cost data, execution logs                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Phase Summary

| Phase            | Duration | Actor       | Output                             |
| ---------------- | -------- | ----------- | ---------------------------------- |
| **Signup**       | 5 min    | User        | Supabase org + Stripe subscription |
| **Onboarding**   | 30 sec   | System      | BigQuery dataset + API key         |
| **Integrations** | 2-5 min  | User        | Encrypted credentials in BigQuery  |
| **Pipelines**    | Ongoing  | System/User | Cost analytics data                |

---

## Data Architecture

### Storage Split

CloudAct uses a **dual-storage architecture** to optimize for different use cases:

| Data Type                     | Storage                                     | Reason                               |
| ----------------------------- | ------------------------------------------- | ------------------------------------ |
| **User accounts**             | Supabase (auth)                             | Built-in authentication system       |
| **Org metadata** (name, slug) | Supabase                                    | Fast frontend queries, RLS policies  |
| **Subscription/billing**      | Supabase + Stripe                           | Payment processing, webhook updates  |
| **Billing status**            | Supabase (lowercase) + BigQuery (UPPERCASE) | Synced via webhook                   |
| **Integration status**        | Supabase columns                            | Quick UI updates, cache layer        |
| **Org API keys**              | BigQuery (hashed + KMS)                     | Security - never exposed to frontend |
| **Provider credentials**      | BigQuery (KMS encrypted)                    | Security - encrypted at rest         |
| **Pipeline data**             | BigQuery                                    | Analytics, aggregations, reporting   |
| **Execution logs**            | BigQuery                                    | Audit trail, debugging               |

### Billing Status Mapping

Stripe webhooks sync subscription status to both Supabase and BigQuery with different formats:

| Stripe Status | Supabase (frontend) | BigQuery (backend) | Pipeline Access |
| ------------- | ------------------- | ------------------ | --------------- |
| `trialing`    | `trialing`          | `TRIAL`            | ✅ Allowed      |
| `active`      | `active`            | `ACTIVE`           | ✅ Allowed      |
| `past_due`    | `past_due`          | `SUSPENDED`        | ❌ Blocked      |
| `canceled`    | `canceled`          | `CANCELLED`        | ❌ Blocked      |
| `paused`      | `paused`            | `SUSPENDED`        | ❌ Blocked      |
| `incomplete`  | `incomplete`        | `SUSPENDED`        | ❌ Blocked      |
| `unpaid`      | `unpaid`            | `SUSPENDED`        | ❌ Blocked      |

**Webhook Sync Flow:**

1. Stripe webhook receives event (checkout, subscription.updated, etc.)
2. Webhook updates Supabase organizations table with lowercase status
3. Webhook calls `syncSubscriptionToBackend()` with `billingStatus` and `trialEndsAt`
4. Backend maps status and updates BigQuery `org_subscriptions` table
5. Pipeline execution checks status before running

### Why This Split?

**Supabase (PostgreSQL):**

- Fast read/write for user-facing operations
- Built-in RLS for row-level security
- Real-time subscriptions for UI updates
- Easy integration with Next.js server actions

**BigQuery:**

- Petabyte-scale analytics capabilities
- Columnar storage optimized for aggregations
- Serverless - no infrastructure management
- Natural fit for time-series cost data

### Multi-Tenancy Model

CloudAct implements **org-scoped isolation** at the data layer:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MULTI-TENANT ISOLATION                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. DATASET ISOLATION                                                  │
│     Each org gets dedicated BigQuery dataset                            │
│     - acmecorp_prod (Acme Corp's data)                                  │
│     - guruinc_prod (Guru Inc's data)                                    │
│     - NO shared data tables between orgs                               │
│                                                                         │
│  2. ROW-LEVEL ISOLATION                                                │
│     Central tables use org_slug filter                                  │
│     SELECT * FROM org_api_keys WHERE org_slug = @org_slug              │
│                                                                         │
│  3. API KEY SCOPING                                                    │
│     Each org gets unique API key                                        │
│     - acmecorp_api_xxxxxxxx → only access acmecorp_prod                │
│     - guruinc_api_xxxxxxxx → only access guruinc_prod                  │
│                                                                         │
│  4. KMS ENCRYPTION                                                     │
│     Single KMS key encrypts all org credentials                         │
│     Isolation via query filters (org_slug), not encryption             │
│                                                                         │
│  5. CONCURRENT EXECUTION SAFETY                                        │
│     Separate BigQuery client per pipeline execution                    │
│     No shared state between concurrent runs                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Concurrent Pipeline Example

```
Org A Pipeline                    Org B Pipeline
     │                                 │
     ▼                                 ▼
X-API-Key: acme_api_xxx         X-API-Key: guru_api_yyy
     │                                 │
     ▼                                 ▼
org_slug = "acme"               org_slug = "guru"
     │                                 │
     ▼                                 ▼
Fetch credentials:              Fetch credentials:
WHERE org_slug = "acme"         WHERE org_slug = "guru"
     │                                 │
     ▼                                 ▼
Write to: acme_prod.*           Write to: guru_prod.*
```

**Key Principle:** Isolation happens at the **data layer** (org_slug filters), not the **encryption layer** (shared KMS key).

---

## Data Flow

### API Request Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    API REQUEST → DATA FLOW                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. USER REQUEST                                                       │
│     Frontend: POST /api/v1/pipelines/run/acme/gcp/cost/billing         │
│     Header: X-API-Key: acme_api_xxxxxxxx                               │
│     ↓                                                                   │
│                                                                         │
│  2. AUTHENTICATION                                                     │
│     Backend: Validate API key → Extract org_slug                       │
│     Query: SELECT org_slug FROM org_api_keys WHERE key_hash = SHA256() │
│     Result: org_slug = "acme"                                           │
│     ↓                                                                   │
│                                                                         │
│  3. AUTHORIZATION                                                      │
│     Backend: Check quota limits for org                                │
│     Query: SELECT * FROM org_subscriptions WHERE org_slug = "acme"     │
│     ↓                                                                   │
│                                                                         │
│  4. CREDENTIAL RETRIEVAL                                               │
│     Backend: Fetch encrypted GCP credentials                           │
│     Query: SELECT encrypted_credential FROM org_integration_credentials│
│            WHERE org_slug = "acme" AND provider = "GCP_SA"             │
│     KMS Decrypt: credentials → JSON                                    │
│     ↓                                                                   │
│                                                                         │
│  5. PIPELINE EXECUTION                                                 │
│     Backend: Load pipeline config from configs/gcp/cost/billing.yml    │
│     Processor: gcp.bq_etl extracts billing data                        │
│     ↓                                                                   │
│                                                                         │
│  6. DATA WRITE                                                         │
│     Backend: Write to org's dataset                                    │
│     INSERT INTO acme_prod.gcp_billing_daily_raw (...)                  │
│     ↓                                                                   │
│                                                                         │
│  7. LOGGING                                                            │
│     Backend: Log execution metadata                                    │
│     INSERT INTO organizations.org_meta_pipeline_runs (...)             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Security Principles

**Full security documentation:** See `03-data-pipeline-service/SECURITY.md`

### Core Security Measures

| Measure                       | Implementation                                                   |
| ----------------------------- | ---------------------------------------------------------------- |
| **Secrets Never in Supabase** | Only fingerprints/status stored in Supabase                      |
| **KMS Encryption**            | All credentials encrypted at rest with Cloud KMS                 |
| **API Key Hashing**           | Org API keys stored as SHA256 hash in BigQuery                   |
| **One-Time Display**          | API keys shown only once during onboarding                       |
| **Constant-Time Comparison**  | Admin key uses `hmac.compare_digest()` to prevent timing attacks |
| **Production Validation**     | App fails to start if security config is invalid                 |
| **Request Tracing**           | Every request gets `X-Request-ID` header                         |
| **Rate Limiting**             | Enabled by default in production                                 |

### Production Requirements

**CRITICAL:** Backend will NOT start in production without these:

```bash
export ENVIRONMENT="production"
export CA_ROOT_API_KEY="secure-key-min-32-chars"  # NEVER use default
export DISABLE_AUTH="false"                       # MUST be false
export RATE_LIMIT_ENABLED="true"                  # MUST be true
```

See backend CLAUDE.md for complete production checklist.

---

## Supported Integrations

### Integration Categories

CloudAct tracks three distinct types of integrations:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    INTEGRATION ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. CLOUD PROVIDERS                                                     │
│     Purpose: Billing data extraction                                   │
│     Example: GCP (extracts billing export from BigQuery)               │
│     Storage: BigQuery (KMS encrypted credentials)                      │
│                                                                         │
│  2. LLM PROVIDERS                                                       │
│     Purpose: API usage tracking & per-token cost calculation           │
│     Examples: OpenAI, Anthropic, Gemini, DeepSeek                      │
│     Storage: BigQuery (KMS encrypted API keys)                         │
│     Features:                                                          │
│       - Model pricing tables (per-token input/output costs)            │
│       - Subscription tiers (TIER1, TIER2, TIER3, PAY_AS_YOU_GO)       │
│       - Usage data extraction via provider APIs                        │
│                                                                         │
│  3. SAAS SUBSCRIPTIONS (NEW)                                           │
│     Purpose: Track fixed-cost SaaS subscriptions                       │
│     Examples: Canva, Adobe CC, ChatGPT Plus, Claude Pro, Figma, etc.  │
│     Storage: Supabase (org metadata, not usage data)                   │
│     Features:                                                          │
│       - Monthly/Annual/Quarterly billing cycles                        │
│       - Per-seat/license tracking                                      │
│       - Category grouping (design, productivity, ai, development)     │
│       - Enable/disable without deleting                                │
│       - Monthly cost summary calculation                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Provider Matrix

| Provider               | Type  | Credential           | Validation      | Storage  | Status     |
| ---------------------- | ----- | -------------------- | --------------- | -------- | ---------- |
| **GCP**                | Cloud | Service Account JSON | ADC auth test   | BigQuery | Production |
| **OpenAI**             | LLM   | API Key (sk-...)     | List models API | BigQuery | Production |
| **Anthropic**          | LLM   | API Key              | List models API | BigQuery | Production |
| **Gemini**             | LLM   | API Key              | List models API | BigQuery | Production |
| **DeepSeek**           | LLM   | API Key              | List models API | BigQuery | Production |
| **Canva, Adobe, etc.** | SaaS  | N/A (manual entry)   | N/A             | Supabase | Production |

### Integration Setup Flow

**Cloud/LLM Providers:**
Users provide credentials via frontend → Backend validates → KMS encrypts → Stores in BigQuery

**SaaS Subscriptions:**
Users add subscription via frontend → Stored in Supabase `saas_subscriptions` table → No external validation

**Auto-Initialization:** When OpenAI integration is set up, backend automatically creates and populates:

- `openai_model_pricing` table (GPT-4o, GPT-4, GPT-3.5, o1 models)
- `openai_subscriptions` table (FREE, TIER1, TIER2, TIER3, PAY_AS_YOU_GO)

### SaaS Subscription Management

SaaS subscriptions are stored in Supabase (not BigQuery) since they are org metadata, not usage data:

```sql
-- Table: saas_subscriptions
CREATE TABLE saas_subscriptions (
    id UUID PRIMARY KEY,
    org_id UUID REFERENCES organizations(id),
    provider_name VARCHAR(100),    -- e.g., "canva", "adobe_cc", "chatgpt_plus"
    display_name VARCHAR(200),     -- e.g., "Canva Pro", "Adobe Creative Cloud"
    billing_cycle VARCHAR(20),     -- monthly, annual, quarterly, custom
    cost_per_cycle DECIMAL(10,2),
    currency VARCHAR(3),
    seats INTEGER,
    renewal_date DATE,
    category VARCHAR(50),          -- design, productivity, ai, development
    notes TEXT,
    is_enabled BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

**Common SaaS Providers:** Canva, Adobe CC, Figma, Notion, Slack, Zoom, GitHub, GitLab, Jira, ChatGPT Plus, Claude Pro, Gemini Advanced, Copilot, Cursor, Lovable, v0, Miro, Linear, Vercel, etc.

---

## Quick Start - Local Development

### Prerequisites

- Node.js 18+
- Python 3.11+
- GCP Project with BigQuery + KMS enabled
- Supabase project
- Stripe account

### Backend Setup (Two Services)

```bash
# Terminal 1: Start api-service (Port 8000)
# Handles: bootstrap, onboarding, integrations, LLM data CRUD
cd api-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Set environment variables
export GCP_PROJECT_ID="your-project"
export CA_ROOT_API_KEY="test-admin-key"
export KMS_KEY_NAME="projects/.../cryptoKeys/..."
export ENVIRONMENT="development"
export DISABLE_AUTH="true"  # Local dev only!

# Start API service
python -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload

# Health check
curl http://localhost:8000/health
```

```bash
# Terminal 2: Start data-pipeline-service (Port 8001)
# Handles: scheduled ETL, usage processing, pipeline execution
cd data-pipeline-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Set same environment variables
export GCP_PROJECT_ID="your-project"
export CA_ROOT_API_KEY="test-admin-key"
export KMS_KEY_NAME="projects/.../cryptoKeys/..."
export ENVIRONMENT="development"
export DISABLE_AUTH="true"  # Local dev only!

# Start pipeline service
python -m uvicorn src.app.main:app --host 0.0.0.0 --port 8001 --reload

# Health check
curl http://localhost:8001/health
```

### Frontend Setup

```bash
# Terminal 3: Start frontend
cd fronted-system
npm install

# Configure .env.local
cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
STRIPE_SECRET_KEY=your-stripe-key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your-publishable-key
STRIPE_WEBHOOK_SECRET=your-webhook-secret
NEXT_PUBLIC_API_SERVICE_URL=http://localhost:8000
NEXT_PUBLIC_PIPELINE_SERVICE_URL=http://localhost:8001
CA_ROOT_API_KEY=test-admin-key
EOF

# Start dev server
npm run dev

# Open browser
open http://localhost:3000
```

### Bootstrap System (One-Time)

```bash
# Create central BigQuery tables
curl -X POST http://localhost:8000/api/v1/admin/bootstrap \
  -H "X-CA-Root-Key: test-admin-key" \
  -H "Content-Type: application/json"

# Run Supabase migrations
# In Supabase SQL Editor, run migrations in order from:
# 01-fronted-system/scripts/supabase_db/*.sql
# See 01-fronted-system/scripts/supabase_db/README.md for details

# Configure Stripe products
cd fronted-system
python scripts/stripe/update_product_metadata.py
```

### Test Full Flow

```bash
# 1. Signup → Create org → Subscribe → Dashboard
open http://localhost:3000/signup

# 2. Backend onboard organization (done automatically after signup via api-service)

# 3. Setup integration (via api-service on port 8000)
# Navigate to /{orgSlug}/settings/integrations
# Add OpenAI, GCP, or other credentials

# 4. Run pipeline (via data-pipeline-service on port 8001)
curl -X POST http://localhost:8001/api/v1/pipelines/run/{org}/gcp/cost/billing \
  -H "X-API-Key: {org_api_key}" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-29"}'
```

---

## Documentation Links

### Component Documentation

| Component             | Documentation                       | Description                                              |
| --------------------- | ----------------------------------- | -------------------------------------------------------- |
| **API Service**       | `02-api-service/CLAUDE.md`             | Bootstrap, onboarding, integrations, LLM data CRUD       |
| **Pipeline Service**  | `03-data-pipeline-service/CLAUDE.md`   | Pipeline execution, processors, ETL jobs                 |
| **Pipeline Security** | `03-data-pipeline-service/SECURITY.md` | Security requirements, credential handling               |
| **Frontend**          | `01-fronted-system/CLAUDE.md`          | Next.js setup, auth flow, billing, backend integration   |
| **Billing**           | `00-requirements-docs/01_BILLING_STRIPE.md` | Stripe integration, subscription flows, webhook handling |

### API Endpoint Reference

**api-service (Port 8000):**

- Admin endpoints: bootstrap, onboarding
- Organization management: onboard, subscription updates

**data-pipeline-service (Port 8001):**

- Pipeline endpoints: run, status
- Integration endpoints: setup, validate, delete
- LLM data CRUD: pricing, subscriptions
- Scheduler endpoints: trigger, queue, process

### Naming Conventions

See backend CLAUDE.md for naming conventions:

- File/folder structure (snake_case)
- Pipeline IDs (kebab-case)
- BigQuery tables ({provider}_{domain}_{granularity}\_{state})
- Dataset naming ({org*slug}*{env})

---

## Architecture Decisions

### Why BigQuery for Analytics?

- **Serverless:** No infrastructure to manage
- **Scalable:** Handles petabyte-scale data
- **Cost-effective:** Pay only for queries + storage
- **Time-series optimized:** Built-in partitioning/clustering
- **SQL-based:** Easy to query and integrate

### Why Supabase for Auth/Metadata?

- **Fast queries:** PostgreSQL optimized for transactional workloads
- **RLS policies:** Row-level security out of the box
- **Real-time:** UI updates without polling
- **Next.js integration:** Server actions, middleware support

### Why Separate Frontend/Backend?

- **Separation of concerns:** UI vs data processing
- **Independent scaling:** Frontend (user traffic) vs backend (pipeline execution)
- **Technology fit:** Next.js for UI, FastAPI for data pipelines
- **Team structure:** Frontend devs vs data engineers

### Why KMS for Credentials?

- **Security:** Industry-standard encryption
- **Compliance:** Meets regulatory requirements
- **Key management:** Automatic rotation, audit logging
- **Integration:** Native GCP service

---

## Deployment Architecture

### Production Environments

| Environment | Frontend            | Backend                        |
| ----------- | ------------------- | ------------------------------ |
| **Stage**   | Vercel (preview)    | Cloud Run (stage-526075321773) |
| **Prod**    | Vercel (production) | Cloud Run (prod-820784027009)  |

### Deployment URLs

| Service  | Stage                                                                 | Production                                                           |
| -------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Frontend | `https://cloudact-stage.vercel.app`                                   | `https://cloudact.ai`                                                |
| Pipeline Service  | `https://convergence-pipeline-stage-526075321773.us-central1.run.app` | `https://convergence-pipeline-prod-820784027009.us-central1.run.app` |

> **Note:** Pipeline service Cloud Run deployments still use "convergence-pipeline" naming. Renaming requires infrastructure updates.

### Deployment Process

**Backend:**

```bash
cd api-service
./simple_deploy.sh stage|prod  # Deploys to Cloud Run
./simple_test.sh stage|prod    # Runs health checks
```

**Frontend:**

```bash
cd fronted-system
git push origin main  # Auto-deploys via Vercel
```

---

## Performance & Scaling

### Current Limits

| Resource              | Limit      | Notes                                                  |
| --------------------- | ---------- | ------------------------------------------------------ |
| **Orgs per system**   | Unlimited  | Multi-tenant by design                                 |
| **Pipelines per org** | Plan-based | STARTER: 6/day, PROFESSIONAL: 20/day, SCALE: unlimited |
| **Team members**      | Plan-based | STARTER: 2, PROFESSIONAL: 10, SCALE: unlimited         |
| **Integrations**      | Plan-based | STARTER: 3, PROFESSIONAL: 10, SCALE: unlimited         |

### Scaling Strategy

- **Frontend:** Auto-scales on Vercel (CDN + edge functions)
- **Backend:** Cloud Run auto-scales based on request load
- **BigQuery:** Serverless, auto-scales with data volume
- **Supabase:** Scales with plan (can upgrade as needed)

---

## Troubleshooting

### Common Issues

| Issue                | Cause                 | Solution                                                      |
| -------------------- | --------------------- | ------------------------------------------------------------- |
| Backend won't start  | Missing env vars      | Check `ENVIRONMENT`, `CA_ROOT_API_KEY`, `GCP_PROJECT_ID`      |
| API key not found    | User metadata missing | Re-run backend onboarding for org                             |
| Integration fails    | Invalid credentials   | Validate credentials in provider console                      |
| Pipeline 401 error   | Invalid API key       | Check user metadata or rotate key                             |
| No plans from Stripe | Missing metadata      | Add `teamMembers`, `providers`, `pipelinesPerDay` to products |

### Health Checks

```bash
# API Service health (port 8000)
curl http://localhost:8000/health

# Pipeline Service health (port 8001)
curl http://localhost:8001/health

# Frontend health
curl http://localhost:3000

# Check BigQuery connectivity
gcloud auth application-default login
bq ls  # Should list datasets

# Check Stripe webhook
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

---

## Next Steps

1. **For new developers:** Read backend and frontend CLAUDE.md files
2. **For backend work:** Review backend CLAUDE.md for production requirements and security
3. **For billing/subscriptions:** Read 00-requirements-docs/01_BILLING_STRIPE.md
4. **For integrations:** See backend CLAUDE.md for integration endpoints
5. **For deployment:** Follow deployment scripts in respective directories

---

**Last Updated:** 2025-12-04
**Version:** 2.4 (Renamed convergence-data-pipeline to data-pipeline-service)
**Maintainers:** CloudAct Platform Team
