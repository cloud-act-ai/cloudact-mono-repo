# Frontend CLAUDE.md

## Gist

Next.js 16 frontend with Supabase auth and Stripe payments. Port 3000. Connects to api-service (8000) for backend operations. Multi-tenant SaaS platform for GenAI and cloud cost management.

**Full Platform Architecture:** `../requirements-docs/00-ARCHITECTURE.md`

## Frontend Flow

```
User Journey
    │
    ├─ Public Routes (no auth)
    │   ├─ Landing pages (/features, /pricing, /about)
    │   └─ Signup/Login (/signup, /login)
    │
    ├─ Onboarding (authenticated)
    │   ├─ Billing plan selection (/onboarding/billing)
    │   ├─ Stripe checkout (payment/trial)
    │   └─ Success page → Create org → Backend onboarding
    │
    └─ Console (/{orgSlug}/...)
        ├─ Dashboard (/dashboard)
        ├─ Settings (/settings/integrations)
        │   └─ Setup credentials → api-service:8000
        ├─ Pipelines (/pipelines)
        │   └─ Run pipeline → pipeline:8001
        └─ Billing (/billing)
            └─ Manage subscription → Stripe
```

## DO's and DON'Ts

### DO
- Connect to api-service (8000) for backend calls (onboarding, integrations)
- Use Supabase for authentication and org metadata
- Use Stripe for subscription and billing management
- Validate all inputs before server actions
- Rate limit sensitive operations (invites, checkouts)
- Escape HTML in emails to prevent XSS
- Store API keys in user.user_metadata (never in organizations table)
- Check subscription status before allowing pipeline execution
- Sync billing status from Stripe to backend via webhooks

### DON'T
- Never call pipeline service (8001) directly from frontend
- Never expose CA_ROOT_API_KEY to client-side code
- Never store actual credentials in Supabase (only status/fingerprints)
- Never skip input validation or sanitization
- Never allow unbounded database queries (always paginate)
- Never create org before successful Stripe checkout
- Never skip rate limiting on sensitive operations
- Never hardcode Stripe plan data (always fetch from Stripe)

## Service Integration

This file provides guidance to Claude Code when working with the CloudAct.ai frontend codebase.

## Environment Setup (.env.local)

All credentials are stored in `.env.local`. This file is loaded automatically by:
- Next.js for development and production
- Vitest for running tests

**Required variables:**

```bash
# .env.local
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Backend Services
NEXT_PUBLIC_API_SERVICE_URL=http://localhost:8000
NEXT_PUBLIC_PIPELINE_SERVICE_URL=http://localhost:8001
CA_ROOT_API_KEY=your-admin-key-32chars

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Build for production
npm run lint     # Run ESLint
npm run start    # Start production server
```

## Running Tests

Tests automatically load credentials from `.env.local`:

```bash
# Run all tests (uses .env.local credentials)
npx vitest

# Run specific test file
npx vitest tests/auth-flow.test.ts

# Watch mode
npx vitest --watch

# Run with verbose output
npx vitest run --reporter=verbose
```

## Validation Testing

Run comprehensive user flow validation tests:
```bash
npx vitest tests/user_flows_comprehensive.test.ts --run  # Run all 15 flows
npx vitest tests/user_flows_comprehensive.test.ts -t "New User First-Time Flow" --run  # Specific flow
npx vitest tests/user_flows_comprehensive.test.ts -t "Input Validation" --run  # Security tests
```

### Core User Journeys (10 tests)

| Test | Flow | Description |
|------|------|-------------|
| 1 | New User First-Time | Signup (with company info) → Billing → Checkout → Dashboard |
| 2 | Returning User Sign-In | Login and dashboard access |
| 3 | Forgot Password + Reset | Password recovery flow |
| 4 | Org Owner Invites Member | Invitation creation |
| 5 | Seat Limit Enforcement | Plan limit validation |
| 6 | Billing Upgrade/Downgrade | Plan changes |
| 7 | Subscription Cancellation | Access control gating |
| 8 | Role-Based Access Control | Permission validation |
| 9 | Multi-Org Isolation | Cross-org prevention |
| 10 | Invite Acceptance | Join existing org |

### Security Validation Tests (5 tests)

| Test | Security Feature | Description |
|------|------------------|-------------|
| 11 | XSS Prevention | `<script>` tags in org name |
| 12 | Rate Limiting | Invite spam prevention |
| 13 | Input Sanitization | Dangerous characters removed |
| 14 | Public Routes | Verify middleware allows public paths |
| 15 | Protected Routes | Verify auth required for console |

**Requirements**: Dev server running, Supabase configured, test user `guru.kallam@gmail.com` / `guru1234`

**Troubleshooting**:
- If tests hang: Check dev server is running on port 3000
- If navigation fails: Verify Supabase auth is configured
- If assertions fail: Check database state and RLS policies
- If security tests fail: Check `docs/SECURITY.md` for implementation details

## Architecture

CloudAct.ai is a multi-tenant SaaS platform for GenAI and cloud cost management built with Next.js 16 (App Router), React 19, Supabase, and Stripe.

### Route Groups

**`app/(landingPages)/`** - Public marketing site (no auth required)
- Uses `landing.css` for styling
- Layout includes shared header/footer
- Zero configuration needed - works immediately
- Pages: `/`, `/features`, `/pricing`, `/solutions`, `/resources`, `/about`, `/contact`, `/privacy`, `/terms`

**`app/[orgSlug]/`** - Authenticated console (protected routes)
- Uses `console.css` for styling
- Multi-tenant: URLs like `/acme-corp/dashboard`
- Requires Supabase + Stripe configuration
- Pages:
  - `dashboard/` - Main dashboard
  - `analytics/` - Analytics page
  - `billing/` - Billing management
  - `pipelines/` - Pipeline execution
  - `settings/` - Settings (profile, members, integrations, security, danger, onboarding)

### Authentication Flow

1. Middleware (`middleware.ts`) checks public vs protected routes
2. `lib/supabase/middleware.ts` manages Supabase session
3. `lib/auth.ts` provides auth guards:
   - `requireAuth()` - basic authentication
   - `requireOrgMembership(orgSlug)` - validates org access
   - `requireActiveSubscription(orgSlug)` - checks billing status
   - `requireRole(orgSlug, role)` - enforces RBAC (admin > collaborator > read_only)
   - `requireOwner(orgSlug)` - requires owner role

### Key Directories

```
actions/
├── account.ts                  # Account deletion, org transfer, leave org
├── backend-onboarding.ts       # Backend API key management, onboarding
├── integrations.ts             # LLM/Cloud integration setup
├── llm-data.ts                 # Generic LLM pricing/subscriptions CRUD
├── members.ts                  # Team member invites, roles
├── openai-data.ts              # OpenAI-specific pricing/subscriptions
├── organization.ts             # Org creation, onboarding completion
├── pipelines.ts                # Pipeline execution
├── saas-subscriptions.ts       # SaaS subscription management (Canva, Adobe, etc.)
└── stripe.ts                   # Stripe checkout, billing, plan changes

lib/
├── api/
│   └── backend.ts              # PipelineBackendClient (backend API wrapper)
├── supabase/
│   ├── client.ts               # Client-side Supabase client
│   ├── server.ts               # Server-side Supabase client
│   └── middleware.ts           # Session management middleware
├── auth.ts                     # Auth guards and RBAC
├── constants.ts                # App constants
├── dashboard-data.ts           # Dashboard stats, activity logs
├── email.ts                    # Email sending utilities
├── source.ts                   # Source utilities
├── stripe.ts                   # Stripe client initialization
└── utils.ts                    # Common utilities (cn, logError)

components/
├── charts/
│   ├── cost-by-account-chart.tsx
│   ├── cost-by-region-chart.tsx
│   ├── cost-by-service-chart.tsx
│   └── cost-trend-chart.tsx
├── ui/                         # shadcn/ui components (18 components)
├── api-key-display.tsx         # API key display component
├── dashboard-sidebar.tsx       # Dashboard navigation sidebar
├── integration-config-card.tsx # Integration configuration card
├── mobile-header.tsx           # Mobile header
├── pricing-card.tsx            # Pricing display card
└── theme-provider.tsx          # Theme context provider

scripts/
├── stripe/
│   └── update_product_metadata.py  # Stripe metadata management
└── supabase_db/                # Database migration scripts
    ├── 01_production_setup.sql
    ├── 02_fix_rls_functions.sql
    ├── 02_stripe_first_migration.sql
    ├── 03_soft_delete_migration.sql
    ├── 03_webhook_idempotency.sql
    ├── 04_backend_onboarding_columns.sql
    ├── 05_secure_api_keys.sql
    ├── 06_webhook_deduplication.sql
    ├── 07_deletion_tokens.sql
    ├── 08_rate_limiting_and_cleanup.sql
    ├── 09_billing_sync_retry.sql
    ├── 10_gemini_integration_columns.sql
    ├── 11_integration_enabled_columns.sql
    ├── 12_saas_subscriptions_table.sql
    └── migrate.sh               # Migration runner script

docs/
├── ANALYTICS_API.md            # Analytics API documentation
├── ANALYTICS_README.md         # Analytics overview
├── api_key_generation_flow.md # API key generation flow
├── BILLING.md                  # Billing documentation
├── integration_setup_flow.md  # Integration setup flow
├── LOCAL_SETUP.md              # Local development setup
├── pipeline_execution_flow.md # Pipeline execution flow
├── SECURITY.md                 # Security documentation
└── TESTING.md                  # Testing documentation
```

### Path Aliases

Use `@/*` to import from project root (configured in tsconfig.json).

### Database Schema (Supabase)

Core tables: `organizations`, `organization_members`, `profiles`, `invites`, `activity_logs`, `saas_subscriptions`

Setup scripts location: `scripts/supabase_db/`
- `01_production_setup.sql` - Base schema (tables, RLS, triggers)
- `02_stripe_first_migration.sql` - Stripe-first billing
- `04_backend_onboarding_columns.sql` - Backend integration columns
- `10_gemini_integration_columns.sql` - Gemini/DeepSeek integration columns
- `11_integration_enabled_columns.sql` - Integration enable/disable toggles
- `12_saas_subscriptions_table.sql` - SaaS subscription tracking

**Migration Runner:**
```bash
cd scripts/supabase_db
./migrate.sh              # Run all pending migrations
./migrate.sh --status     # Show migration status
./migrate.sh --force 12   # Force re-run specific migration
```

### Environment Variables

Landing pages work without configuration. Console features require:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL` - For redirect URLs
- `NEXT_PUBLIC_API_SERVICE_URL` - api-service URL (e.g., http://localhost:8000)
- `CA_ROOT_API_KEY` - Server-side only, for backend onboarding

### User Flow

New user signup flow (subscription required):
1. `/signup` - Email, password, company name, company type (stored in user_metadata)
2. `/onboarding/billing` - Select plan (pricing table only)
3. Stripe Checkout - Payment/trial setup
4. `/onboarding/success` - Creates org, backend onboarding, redirects to dashboard
5. `/{orgSlug}/dashboard` - Welcome to the app

Returning user: `/login` → `/{orgSlug}/dashboard`

**Key Implementation Details:**
- Company info stored in Supabase `user_metadata` during signup
- Org is created AFTER successful checkout (not before)
- `completeOnboarding()` in `actions/organization.ts` handles post-checkout org creation
- Stripe webhook skips onboarding checkouts (org created on success page)

---

## Backend Integration (Pipeline Backend)

**See full architecture:** `../requirements-docs/00-ARCHITECTURE.md`

### Overview

After Supabase signup, frontend connects to FastAPI backend for:
1. **Backend Onboarding** - Creates BigQuery dataset + API key (one-time per org)
2. **Integrations** - Store LLM/cloud credentials (encrypted via KMS)
3. **Pipelines** - Run data pipelines (scheduled daily + ad-hoc)

### Quick Start

```bash
# Start backend server
cd ../data-pipeline-service
export GCP_PROJECT_ID="your-project"
export CA_ROOT_API_KEY="your-admin-key"
export KMS_KEY_NAME="projects/.../cryptoKeys/..."
python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000

# Bootstrap (one-time)
curl -X POST http://localhost:8000/api/v1/admin/bootstrap \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json"
```

### API Key Hierarchy

```
CA_ROOT_API_KEY (system admin)
    │
    ├── Bootstrap: POST /api/v1/admin/bootstrap
    │   └── One-time system initialization (meta tables)
    │
    └── Creates → Org API Keys (per-organization)
                    │
                    ├── Integrations: POST /api/v1/integrations/{org}/{provider}/setup
                    ├── Pipelines: POST /api/v1/pipelines/run/{org}/...
                    └── Data Access: Query org-specific BigQuery datasets
```

**Key Types:**
| Key | Header | Purpose | Scope |
|-----|--------|---------|-------|
| `CA_ROOT_API_KEY` | `X-CA-Root-Key` | Bootstrap, org onboarding | System-wide |
| Org API Key | `X-API-Key` | Integrations, pipelines, data | Per-organization |
| Provider Keys | N/A (stored encrypted) | OpenAI, Anthropic, GCP SA | Per-provider |

### Backend API Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. USER SIGNUP (Supabase)                                      │
│  Frontend: /signup → /onboarding/billing → checkout             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. ORGANIZATION ONBOARDING                                     │
│  Frontend: actions/organization.ts → actions/backend-onboarding.ts
│  Backend:  POST /api/v1/organizations/onboard                   │
│  Header:   X-CA-Root-Key: {CA_ROOT_API_KEY} (server-side only)  │
│                                                                 │
│  Flow:                                                          │
│  1. createOrganization() creates Supabase org record            │
│  2. onboardToBackend() calls backend with CA_ROOT_API_KEY       │
│  3. Backend creates org dataset + generates org API key         │
│  4. API key stored in user.user_metadata.org_api_keys[org_slug] │
│  5. Fingerprint stored in Supabase organizations table          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. INTEGRATION SETUP                                           │
│  Frontend: Settings > Integrations page                         │
│  Backend:  POST /api/v1/integrations/{org_slug}/{provider}/setup│
│  Header:   X-API-Key: {org_api_key} (from user metadata)        │
│                                                                 │
│  Providers: openai, anthropic, gcp                              │
│                                                                 │
│  Flow:                                                          │
│  1. User enters credentials (OpenAI key, GCP SA JSON, etc.)     │
│  2. Frontend gets org API key from user.user_metadata           │
│  3. Calls backend with X-API-Key header                         │
│  4. Backend validates & encrypts credentials (KMS)              │
│  5. For OpenAI: auto-initializes pricing/subscription tables    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. PIPELINE EXECUTION                                          │
│  Frontend: Dashboard > Run Pipeline                             │
│  Backend:  POST /api/v1/pipelines/run/{org}/...                 │
│  Header:   X-API-Key: {org_api_key} (from user metadata)        │
│                                                                 │
│  Flow:                                                          │
│  1. Frontend gets org API key from user.user_metadata           │
│  2. Calls backend with X-API-Key header                         │
│  3. Backend validates key → gets org_slug                       │
│  4. Retrieves org's credentials (KMS decrypt)                   │
│  5. Executes pipeline with org's credentials                    │
│  6. Writes to org's dataset: {org_slug}.*                       │
└─────────────────────────────────────────────────────────────────┘
```

### Key Storage

| Key | Storage Location | Access |
|-----|------------------|--------|
| CA_ROOT_API_KEY | process.env (server only) | Server actions only |
| Org API Key | user.user_metadata.org_api_keys[org_slug] | Frontend via Supabase |
| Fingerprint | organizations.backend_api_key_fingerprint | Display only |

### Backend Integration Files

| File | Purpose |
|------|---------|
| `actions/backend-onboarding.ts` | Backend onboarding, API key management |
| `actions/integrations.ts` | Integration setup/delete with org API key |
| `actions/pipelines.ts` | Pipeline execution with org API key |
| `lib/api/backend.ts` | PipelineBackendClient (backend API wrapper) |

### Backend Onboarding Functions

```typescript
// From actions/backend-onboarding.ts

// Onboard organization to backend
const result = await onboardToBackend({
  orgSlug: "acmecorp",
  companyName: "Acme Corp",
  adminEmail: "admin@acme.com",
  subscriptionPlan: "STARTER"
})

// Get org API key (from user metadata)
const apiKey = await getOrgApiKeySecure("acmecorp")

// Check if org is onboarded
const status = await checkBackendOnboarding("acmecorp")

// Get API key info (fingerprint)
const info = await getApiKeyInfo("acmecorp")

// Rotate API key
const rotated = await rotateApiKey("acmecorp")

// Save API key to user metadata
await saveApiKey("acmecorp", "acmecorp_api_xxxxxxxx")

// Check if API key exists
const hasKey = await hasStoredApiKey("acmecorp")

// Sync subscription to backend
await syncSubscriptionToBackend({
  orgSlug: "acmecorp",
  plan: "STARTER",
  status: "active"
})
```

### Integration Functions

```typescript
// From actions/integrations.ts

// Setup integration
const result = await setupIntegration({
  orgSlug: "acmecorp",
  provider: "openai",
  credential: "sk-proj-...",
  credentialName: "OpenAI Production Key"
})

// Get all integrations status
const integrations = await getIntegrations("acmecorp")

// Validate integration
await validateIntegration("acmecorp", "openai")

// Delete integration
await deleteIntegration("acmecorp", "openai")

// LLM Pricing CRUD (works for all LLM providers)
const pricing = await listLLMPricing("acmecorp", "openai")
await updateLLMPricing("acmecorp", "openai", "model-id", { ... })
await createLLMPricing("acmecorp", "openai", { ... })
await deleteLLMPricing("acmecorp", "openai", "model-id")
await resetLLMPricing("acmecorp", "openai")

// LLM Subscriptions CRUD
const subs = await listLLMSubscriptions("acmecorp", "openai")
await updateLLMSubscription("acmecorp", "openai", "plan-name", { ... })
await createLLMSubscription("acmecorp", "openai", { ... })
await deleteLLMSubscription("acmecorp", "openai", "plan-name")
await resetLLMSubscriptions("acmecorp", "openai")

// Toggle integration enabled/disabled
await toggleIntegrationEnabled("acmecorp", "openai", false)
```

### SaaS Subscription Functions

SaaS subscriptions track fixed-cost subscriptions (Canva, Adobe, ChatGPT Plus, etc.) stored in BigQuery via backend API.

```typescript
// From actions/subscription-providers.ts

// List all subscriptions for an org
const result = await listSaaSSubscriptions("acmecorp", "slack")
// Returns: { success: true, subscriptions: [...], count: 5 }

// Create a new subscription with start date
const result = await createSaaSSubscription("acmecorp", "slack", {
  plan_name: "slack_pro",
  display_name: "Slack Pro",
  billing_cycle: "monthly",  // monthly | annual | quarterly
  price_per_unit: 12.99,
  quantity: 5,
  start_date: "2025-01-01",  // When subscription starts
  renewal_date: "2025-02-01",
  owner_email: "admin@acme.com",
  department: "Engineering",
  notes: "Team communication"
})

// Edit with version history (creates new row, ends old row)
const result = await editPlanWithVersion(
  "acmecorp",
  "slack",
  "subscription-id",
  "2025-12-15",  // effective_date - when changes take effect
  {
    price_per_unit: 14.99,
    quantity: 10,
    notes: "Upgraded seats"
  }
)
// Old row gets end_date = Dec 14, new row starts Dec 15

// End subscription (soft delete via end_date)
await endSubscription("acmecorp", "slack", "subscription-id", "2025-12-31")
// Sets end_date and status = 'cancelled', preserves history

// Toggle subscription enabled/disabled
await toggleSaaSSubscription("acmecorp", "subscription-uuid", false)
```

**Status Values:** `active` (current), `pending` (future start_date), `cancelled` (ended), `expired` (past end_date)

**UI Components:**
- `components/ui/date-picker.tsx` - Date selection for start/end/effective dates
- `components/ui/calendar.tsx` - Calendar component (react-day-picker)
- `components/ui/popover.tsx` - Radix popover wrapper

**Common SaaS Providers:** Canva, Adobe CC, Figma, Notion, Slack, Zoom, GitHub, GitLab, Jira, ChatGPT Plus, Claude Pro, Gemini Advanced, Copilot, Cursor, Lovable, v0, Miro, Linear, Vercel, Netlify, AWS, GCP, Azure

### Pipeline Functions

```typescript
// From actions/pipelines.ts

// Run GCP cost billing pipeline
const result = await runGcpCostBillingPipeline("acmecorp", "2025-11-26")

// Run any pipeline (note: actual implementation may differ)
const result2 = await runPipeline(
  "acmecorp",
  "gcp_cost_billing",
  { date: "2025-11-26" }
)
```

**Pipeline Quota Enforcement:**

Before pipeline execution, the system checks subscription status at two levels:

1. **Frontend Check** (`actions/pipelines.ts`):
   - Queries Supabase `organizations.subscription_status`
   - Only allows `active` or `trialing` status
   - Rejects with error if status is `past_due`, `canceled`, etc.

2. **Backend Check** (BigQuery):
   - Backend validates `org_subscriptions.status`
   - Only allows `ACTIVE` or `TRIAL` status
   - Rejects pipelines with `SUSPENDED`, `CANCELLED`, `EXPIRED` status

This dual-check ensures pipelines cannot run for organizations with invalid subscriptions.

### Backend API Client Usage

```typescript
import { getPipelineBackendClient } from "@/lib/api/backend"

// With org API key (for integrations/pipelines)
const client = getPipelineBackendClient({ orgApiKey: "org_xxx_api_xxxx" })

// With admin key (for onboarding)
const adminClient = getPipelineBackendClient({ adminApiKey: process.env.CA_ROOT_API_KEY })

// Setup integration
await client.setupIntegration(orgSlug, "openai", { credential: "sk-..." })

// Run pipeline: runPipeline(orgSlug, provider, domain, template_name, params)
// Config path: configs/{provider}/{domain}/{template_name}.yml
await client.runPipeline(orgSlug, "gcp", "cost", "billing", { date: "2025-11-26" })
```

### Data Storage Split

| Data | Storage | Notes |
|------|---------|-------|
| User auth, org metadata | Supabase | Frontend queries |
| `backend_onboarded`, `backend_api_key_fingerprint` | Supabase | Reference only |
| `integration_{provider}_status` | Supabase columns | Status reference |
| Actual API keys & credentials | BigQuery (KMS) | Never in Supabase |

### Supabase Columns (Backend Integration)

Run `scripts/supabase_db/04_backend_onboarding_columns.sql`:
- `backend_onboarded`, `backend_api_key_fingerprint`, `backend_onboarded_at`
- `integration_{openai,anthropic,gcp}_status`
- `integration_{openai,anthropic,gcp}_configured_at`

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| "Organization API key not found" | User metadata missing key | Run `saveApiKey(orgSlug, apiKey)` |
| "Backend URL not configured" | Missing env var | Set `NEXT_PUBLIC_API_SERVICE_URL` |
| "Required integration not configured" | Integration not setup | Run `setupIntegration()` first |
| Pipeline fails with 401 | Invalid API key | Check user metadata or rotate key |

---

## Billing Architecture (Stripe-First)

**Critical:** All plan data comes from Stripe. NO hardcoded fallbacks allowed.

### Billing Files

| File | Purpose |
|------|---------|
| `actions/stripe.ts` | Server actions: checkout, billing portal, plan changes, billing info |
| `app/api/webhooks/stripe/route.ts` | Webhook handler - syncs subscription status and limits to database |
| `app/[orgSlug]/billing/page.tsx` | Billing page with direct upgrade/downgrade |
| `scripts/stripe/update_product_metadata.py` | Script to update Stripe product metadata |

### Stripe Product Metadata (Required)

Every Stripe product MUST have these metadata fields:
```
plan_id: "starter"           # Unique plan identifier
teamMembers: "2"             # Seat limit
providers: "3"               # Provider limit
pipelinesPerDay: "6"         # Daily pipeline limit
features: "Feature 1|Feature 2"  # Pipe-separated features
order: "1"                   # Sort order (lower = first)
is_popular: "true"           # Optional: marks plan as popular
```

### Plan ID Generation (Must Be Consistent!)

All files must use the same logic:
```typescript
const planId = metadata.plan_id || product.name.toLowerCase().replace(/\s+/g, "_")
```

Files that use this: `actions/stripe.ts`, `app/api/webhooks/stripe/route.ts`

### Subscription Flows

| Action | Method | Notes |
|--------|--------|-------|
| New subscription | `createCheckoutSession()` → Stripe Checkout | For users without subscription |
| Upgrade/Downgrade | `changeSubscriptionPlan()` → Direct API | Instant, with proration |
| Cancel/Payment update | `createBillingPortalSession()` → Stripe Portal | User manages in portal |

### Stripe Functions

```typescript
// From actions/stripe.ts

// Get all plans from Stripe
const { data: plans } = await getStripePlans()

// Create checkout session (onboarding)
const { sessionId } = await createOnboardingCheckoutSession(priceId)

// Create checkout session (existing user)
const { sessionId } = await createCheckoutSession(priceId, orgSlug)

// Get billing info
const { data: info } = await getBillingInfo(orgSlug)

// Create billing portal session
const { url } = await createBillingPortalSession(orgSlug)

// Change subscription plan
await changeSubscriptionPlan(orgSlug, newPriceId)
```

### Webhook Events Handled

Stripe webhooks update Supabase and sync to backend BigQuery:

- `checkout.session.completed` - Activates subscription, syncs to backend
- `customer.subscription.updated` - Updates plan/status/limits, syncs to backend
- `customer.subscription.deleted` - Sets status to canceled, syncs to backend
- `invoice.payment_failed` - Sets status to past_due, syncs to backend
- `invoice.payment_succeeded` - Restores active status, syncs to backend

### Subscription Sync to Backend

Webhooks call `syncSubscriptionToBackend()` to sync billing status to BigQuery:

```typescript
// From actions/backend-onboarding.ts
await syncSubscriptionToBackend({
  orgSlug: "acmecorp",
  billingStatus: "trialing",      // Frontend status
  trialEndsAt: "2025-12-31T23:59:59.999Z",
  planName: "starter",
  dailyLimit: 6,
  monthlyLimit: 100
  // Note: concurrent_pipelines_limit removed (not used in current implementation)
})
```

**Status Mapping (Frontend → Backend):**
| Frontend (Supabase) | Backend (BigQuery) |
|---------------------|-------------------|
| `trialing` | `TRIAL` |
| `active` | `ACTIVE` |
| `past_due` | `SUSPENDED` |
| `canceled` | `CANCELLED` |
| `paused` | `SUSPENDED` |
| `incomplete` | `SUSPENDED` |

**Pipeline Access:** Only `ACTIVE` and `TRIAL` statuses allow pipeline execution.

**Note:** The `concurrent_pipelines_limit` field has been removed from the subscription sync as it is not used in the current implementation. Quota enforcement focuses on `daily_limit` and `monthly_limit` only.

### Recent Improvements (December 2024)

#### Subscription Sync Reliability
- **Fixed webhook billing sync** to backend BigQuery:
  - Webhooks now properly call `syncSubscriptionToBackend()` after updating Supabase
  - Ensures backend quota enforcement stays in sync with frontend billing status
  - Prevents stale subscription data in BigQuery

#### Quota Management Simplification
- **Removed `concurrent_pipelines_limit`** from subscription model:
  - Not used in current pipeline execution logic
  - Simplified quota tracking to `daily_limit` and `monthly_limit`
  - Reduced complexity in webhook handlers and backend sync

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| "No plans returned from Stripe" | Products missing required metadata | Add teamMembers, providers, pipelinesPerDay metadata |
| Plan shows wrong name after upgrade | Plan ID mismatch between webhook and getStripePlans | Ensure both use same `plan_id || product.name.toLowerCase()` logic |
| Limits not updating | Webhook not received | Check `stripe listen` is running; subscription may need lookup by customer ID |
| Backend quota out of sync | Webhook sync failed | Check backend logs; manually call `syncSubscriptionToBackend()` |

### Documentation

Full billing documentation: `docs/BILLING.md`

---

## Security Architecture

**CRITICAL:** This section documents security measures implemented across the codebase. All developers MUST follow these patterns.

### Security Documentation

Full security documentation: `docs/SECURITY.md`

### Input Validation (MANDATORY)

All server actions MUST validate inputs before processing:

```typescript
// Organization slug validation - prevents path traversal
const isValidOrgSlug = (slug: string): boolean => {
  return /^[a-zA-Z0-9_-]{2,100}$/.test(slug)
}

// Organization name sanitization - prevents XSS/injection
const sanitizeOrgName = (name: string): string => {
  return name
    .replace(/<[^>]*>/g, "")      // Remove HTML tags
    .replace(/[<>"'&;]/g, "")     // Remove dangerous characters
    .trim()
    .slice(0, 100)                // Limit length
}

// Email validation (RFC 5322 simplified)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

// Stripe price ID validation
const isValidStripePriceId = (priceId: string): boolean => {
  return priceId.startsWith("price_") && priceId.length > 10
}
```

**Files with validation:**
- `actions/stripe.ts` - Price ID, org slug validation
- `actions/members.ts` - Org slug, email validation
- `actions/organization.ts` - Org name sanitization
- `app/api/webhooks/stripe/route.ts` - Content-type validation

### Rate Limiting

Rate limiting is implemented for sensitive operations:

| Operation | Limit | Window | File |
|-----------|-------|--------|------|
| Checkout sessions | 1 per user | 30 seconds | `actions/stripe.ts` |
| Member invites | 10 per user | 1 hour | `actions/members.ts` |
| Deletion tokens | Max 1000 total | Rolling cleanup | `actions/account.ts` |

```typescript
// Example: Rate limit check
const inviteRateLimits = new Map<string, { count: number; resetTime: number }>()
const INVITE_RATE_LIMIT = 10
const INVITE_RATE_WINDOW = 3600000 // 1 hour

function checkInviteRateLimit(userId: string): boolean {
  const now = Date.now()
  const userLimit = inviteRateLimits.get(userId)

  if (!userLimit || now > userLimit.resetTime) {
    inviteRateLimits.set(userId, { count: 1, resetTime: now + INVITE_RATE_WINDOW })
    return true
  }

  if (userLimit.count >= INVITE_RATE_LIMIT) return false
  userLimit.count++
  return true
}
```

### XSS Prevention in Emails

All user-provided content in emails MUST be escaped:

```typescript
// lib/email.ts - escapeHtml function
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

// Usage in email templates
const safeOrgName = escapeHtml(orgName)
const safeInviteLink = escapeHtml(inviteLink)
```

### CSRF Protection

Next.js 14+ server actions include built-in CSRF protection:
- Request origin is automatically validated
- Actions only execute from same-origin requests
- No additional CSRF tokens needed for server actions

**Note:** API routes (`/api/*`) should still validate requests appropriately.

### Memory Leak Prevention

In-memory caches MUST have size limits and cleanup:

```typescript
// Example: Bounded cache with cleanup
const deletionTokens = new Map<string, TokenData>()
const MAX_TOKENS = 1000

function cleanupExpiredTokens() {
  const now = Date.now()
  const keysToDelete: string[] = []

  deletionTokens.forEach((value, key) => {
    if (value.expiresAt < now) keysToDelete.push(key)
  })

  keysToDelete.forEach(key => deletionTokens.delete(key))

  // Enforce max size
  if (deletionTokens.size > MAX_TOKENS) {
    const entries = Array.from(deletionTokens.entries())
      .sort((a, b) => a[1].expiresAt.getTime() - b[1].expiresAt.getTime())
    entries.slice(0, deletionTokens.size - MAX_TOKENS)
      .forEach(([key]) => deletionTokens.delete(key))
  }
}
```

### Pagination Requirements

All database queries returning lists MUST include limits:

```typescript
// Good - with pagination
const { data } = await supabase
  .from("organization_members")
  .select("*")
  .eq("org_id", orgId)
  .limit(100)  // REQUIRED

// Bad - unbounded query
const { data } = await supabase
  .from("organization_members")
  .select("*")
  .eq("org_id", orgId)  // Missing limit!
```

**Current limits:**
- Members per page: 100
- Invites per page: 50
- Invoices: 10 (Stripe default)

### Webhook Security

Stripe webhooks are validated using:
1. Signature verification (`stripe.webhooks.constructEvent`)
2. Content-type header validation
3. Idempotency (in-memory + database)

```typescript
// Content-type check
const contentType = request.headers.get("content-type")
if (contentType && !contentType.includes("application/json") && !contentType.includes("text/")) {
  return NextResponse.json({ error: "Invalid content type" }, { status: 400 })
}

// Signature verification
const event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
```

### Public Routes Configuration

The middleware defines public routes that don't require authentication:

```typescript
// middleware.ts
const publicPaths = [
  "/", "/features", "/pricing", "/solutions", "/integrations",
  "/resources", "/about", "/contact", "/security", "/docs",
  "/privacy", "/terms", "/login", "/signup", "/forgot-password",
  "/reset-password", "/invite", "/onboarding", "/unauthorized"
]

// Handles nested paths too (e.g., /invite/[token])
const isPublicPath = publicPaths.includes(path) ||
  publicPaths.some((p) => path.startsWith(p + "/"))
```

### Type Safety for Dynamic Routes

Always use typed params in client components:

```typescript
// Good - typed params
const params = useParams<{ orgSlug: string }>()
const orgSlug = params.orgSlug  // Type: string

// Bad - untyped params
const params = useParams()
const orgSlug = params.orgSlug as string  // Type assertion
```

### Error Logging

All errors are logged in both development and production:

```typescript
// lib/utils.ts
export function logError(context: string, error: unknown): string {
  const message = error instanceof Error ? error.message : "An unexpected error occurred"

  // Always log (server-side logs are captured by hosting platform)
  console.error(`[${context}]`, error)

  // TODO: Add Sentry in production
  // if (process.env.NODE_ENV === "production") {
  //   Sentry.captureException(error, { tags: { context } })
  // }

  return message
}
```

### Security Checklist for New Features

Before deploying any new feature, verify:

- [ ] All user inputs are validated/sanitized
- [ ] Database queries have pagination limits
- [ ] Sensitive operations have rate limiting
- [ ] Email content is HTML-escaped
- [ ] Error messages don't leak sensitive info
- [ ] Server actions verify user authentication
- [ ] API routes validate request headers
- [ ] In-memory caches have size limits

---

## Styling - CloudAct Design System

**Brand:** Teal (#007A78) + Coral (#FF6E50) | **Font:** DM Sans | **Spacing:** 8px base

**Full reference:** `DESIGN_STANDARDS.md` | **Slash command:** `/frontend-design`

### Colors
```css
--cloudact-teal: #007A78      --cloudact-coral: #FF6E50
--cloudact-teal-light: #14B8A6   --cloudact-coral-light: #FF8A73
--cloudact-teal-dark: #005F5D    --cloudact-coral-dark: #E55A3C
```

### Typography
| Element | Size | Weight | Letter-spacing |
|---------|------|--------|----------------|
| Page Title | 1.5rem | 700 | -0.025em |
| Heading | 1.25rem | 600 | -0.015em |
| Card Title | 1rem | 600 | -0.01em |
| Body | 0.875rem | 400 | normal |
| Table Header | 0.6875rem | 600 | 0.06em |

### CSS Classes
```
.console-page-title    .console-heading      .console-card-title
.console-body          .console-subheading   .console-small
.console-metric        .console-metric-teal  .console-metric-coral
.console-button-primary   .console-button-secondary   .console-button-coral
.console-stat-card     .console-chart-card   .console-table-card
.console-badge-teal    .console-badge-coral  .console-badge-success
```

### Chart Colors
`#007A78` Teal | `#FF6E50` Coral | `#8B5CF6` Violet | `#F59E0B` Amber | `#3B82F6` Blue | `#10B981` Emerald

### Patterns

**Page Header:**
```jsx
<div className="space-y-2">
  <div className="flex items-center gap-3">
    <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#007A78]/10 to-[#14B8A6]/10">
      <Icon className="h-6 w-6 text-[#007A78]" />
    </div>
    <h1 className="console-page-title">Title</h1>
  </div>
  <p className="console-subheading ml-12">Description</p>
</div>
```

**Accordion:**
```jsx
<AccordionItem className="border border-slate-200 rounded-xl px-5 py-1 shadow-sm hover:shadow-md">
```

### CSS Files
| File | Purpose |
|------|---------|
| `app/globals.css` | Design tokens, base styles |
| `app/[orgSlug]/console.css` | Console components |

---

## Documentation

| Document | Description |
|----------|-------------|
| `docs/ANALYTICS_API.md` | Analytics API documentation |
| `docs/ANALYTICS_README.md` | Analytics overview |
| `docs/api_key_generation_flow.md` | API key generation flow |
| `docs/BILLING.md` | Complete billing documentation |
| `docs/integration_setup_flow.md` | Integration setup flow |
| `docs/LOCAL_SETUP.md` | Local development setup |
| `docs/pipeline_execution_flow.md` | Pipeline execution flow |
| `docs/SECURITY.md` | Security documentation |
| `docs/TESTING.md` | Testing documentation |

---

**Last Updated:** 2025-12-07
