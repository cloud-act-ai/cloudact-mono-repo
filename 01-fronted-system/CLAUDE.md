# Frontend CLAUDE.md

## Gist

Next.js 16 frontend with Supabase auth and Stripe payments. Port 3000. Connects to 02-api-service (8000) for bootstrap/onboarding and 03-data-pipeline-service (8001) for integrations/pipelines.

**Full Platform Architecture:** `../00-requirements-docs/00-ARCHITECTURE.md`
**Root CLAUDE.md:** `../CLAUDE.md` (platform overview, commands, architecture)

## Frontend Architecture

### User Journey Flow

```
User Signup
    ↓
/signup → Email, password, company info (stored in user_metadata)
    ↓
/onboarding/billing → Select Stripe plan (pricing table)
    ↓
Stripe Checkout → Payment/trial setup
    ↓
/onboarding/success → Creates org + backend onboarding + API key
    ↓
/{orgSlug}/dashboard → Welcome to app
```

### Service Integration

| Operation | Service | Port | Headers |
|-----------|---------|------|---------|
| Bootstrap (one-time) | 02-api-service | 8000 | `X-CA-Root-Key` |
| Org onboarding | 02-api-service | 8000 | `X-CA-Root-Key` |
| Integration setup | 03-data-pipeline-service | 8001 | `X-API-Key` |
| Pipeline execution | 03-data-pipeline-service | 8001 | `X-API-Key` |
| SaaS subscription CRUD | 02-api-service | 8000 | `X-API-Key` |

## Frontend-Specific Guidelines

### DO
- Store API keys in `user.user_metadata.org_api_keys[org_slug]` (never in organizations table)
- Use `getPipelineBackendClient()` for backend API calls with proper headers
- Check subscription status before pipeline execution (frontend + backend)
- Validate all inputs before server actions (org slug, email, price IDs)
- Rate limit sensitive operations (invites: 10/hour, checkouts: 1/30sec)
- Escape HTML in emails using `escapeHtml()` from `lib/email.ts`
- Paginate all database queries (members: 100, invites: 50)
- Fetch Stripe plans dynamically (never hardcode)

### DON'T
- Never expose `CA_ROOT_API_KEY` to client-side code (server actions only)
- Never store actual credentials in Supabase (only status/fingerprints in columns)
- Never create org before successful Stripe checkout
- Never call backend APIs without proper auth headers
- Never skip input validation (see `00-requirements-docs/05_SECURITY.md`)

## Environment Variables (.env.local)

```bash
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# Stripe (Required)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Backend Services (Required)
NEXT_PUBLIC_API_SERVICE_URL=http://localhost:8000          # 02-api-service
NEXT_PUBLIC_PIPELINE_SERVICE_URL=http://localhost:8001     # 03-data-pipeline-service
CA_ROOT_API_KEY=your-admin-key-min-32-chars                # Server-side only

# App (Required)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Note:** See root `../CLAUDE.md` for complete environment setup across all services.

## Development Commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npx vitest           # Run all tests
npx vitest --watch   # Watch mode
```

**Database Migrations:**
```bash
cd scripts/supabase_db
./migrate.sh              # Run all pending migrations
./migrate.sh --status     # Show migration status
./migrate.sh --force 12   # Force re-run migration #12
```

## Testing

### User Flow Tests (15 comprehensive tests)

```bash
npx vitest tests/user_flows_comprehensive.test.ts --run
npx vitest tests/user_flows_comprehensive.test.ts -t "New User First-Time Flow" --run
npx vitest tests/user_flows_comprehensive.test.ts -t "Input Validation" --run
```

**Core Flows:** Signup → Billing → Checkout → Dashboard, Login, Password reset, Invite member, Seat limits, Plan changes, RBAC, Multi-org isolation

**Security Tests:** XSS prevention, Rate limiting, Input sanitization, Public/protected routes

**Test User:** `guru.kallam@gmail.com` / `guru1234`

**Full documentation:** `00-requirements-docs/05_TESTING.md`

## Next.js App Structure

### Route Groups

**`app/(landingPages)/`** - Public marketing (no auth, uses `landing.css`)
- Pages: `/`, `/features`, `/pricing`, `/solutions`, `/about`, `/contact`, `/privacy`, `/terms`

**`app/[orgSlug]/`** - Console (authenticated, uses `console.css`)
- Multi-tenant URLs: `/acme-corp/dashboard`, `/acme-corp/settings/integrations`
- Pages: `dashboard/`, `analytics/`, `billing/`, `pipelines/`, `settings/`

### Authentication Guards (`lib/auth.ts`)

```typescript
// Basic auth
await requireAuth()

// Org membership check
await requireOrgMembership(orgSlug)

// Subscription status check
await requireActiveSubscription(orgSlug)

// RBAC enforcement (admin > collaborator > read_only)
await requireRole(orgSlug, "admin")

// Owner-only operations
await requireOwner(orgSlug)
```

**Middleware:** `middleware.ts` + `lib/supabase/middleware.ts` handle route protection and session management.

### Key Directories

```
actions/                        # Server actions
├── backend-onboarding.ts       # Backend API key management, org onboarding
├── integrations.ts             # LLM/Cloud integration setup (OpenAI, Anthropic, GCP)
├── pipelines.ts                # Pipeline execution with org API key
├── subscription-providers.ts   # SaaS subscription CRUD (Canva, Slack, etc.)
├── stripe.ts                   # Stripe checkout, billing portal, plan changes
├── organization.ts             # Org creation, post-checkout onboarding
├── organization-locale.ts      # Org locale settings (currency, timezone)
├── members.ts                  # Team invites, roles
└── account.ts                  # Account deletion, org transfer

lib/
├── api/backend.ts              # PipelineBackendClient (backend API wrapper)
├── supabase/                   # Client, server, middleware for Supabase
├── auth.ts                     # Auth guards (requireAuth, requireRole, etc.)
├── stripe.ts                   # Stripe client initialization
├── email.ts                    # Email utilities with escapeHtml()
├── dashboard-data.ts           # Dashboard stats, activity logs
├── i18n/                       # Internationalization
│   ├── constants.ts            # Currencies, timezones, mappings
│   ├── formatters.ts           # formatCurrency, formatDateTime
│   └── index.ts                # Re-exports
└── utils.ts                    # cn(), logError()

components/
├── charts/                     # Cost visualization charts (4 charts)
├── ui/                         # shadcn/ui components (18 components)
├── dashboard-sidebar.tsx       # Navigation sidebar
└── integration-config-card.tsx # Integration setup card

scripts/supabase_db/            # Database migrations
├── 01_production_setup.sql     # Base schema + RLS
├── 04_backend_onboarding_columns.sql  # Backend integration columns
├── 12_saas_subscriptions_table.sql    # SaaS subscription tracking
├── 16_org_internationalization.sql    # i18n columns (currency, timezone)
└── migrate.sh                  # Migration runner
```

**Path Aliases:** Use `@/*` to import from project root (configured in `tsconfig.json`).

### Supabase Database

**Core Tables:** `organizations`, `organization_members`, `profiles`, `invites`, `activity_logs`, `saas_subscriptions`

**Backend Integration Columns (in organizations table):**
- `backend_onboarded`, `backend_api_key_fingerprint`, `backend_onboarded_at`
- `integration_{openai,anthropic,gcp}_status`
- `integration_{openai,anthropic,gcp}_configured_at`

**Internationalization Columns (in organizations table):**
- `locale_currency` - Organization's default currency (e.g., "USD", "INR")
- `locale_timezone` - Organization's timezone (e.g., "America/New_York", "Asia/Kolkata")
- `locale_country` - Country code (e.g., "US", "IN")
- `locale_language` - Language code (e.g., "en", "hi")

**Migration Scripts:** `scripts/supabase_db/*.sql` (see Migration Runner section above)

---

## Internationalization (i18n)

Organization-level internationalization settings for currency, timezone, country, and language. All cost data and timestamps are formatted according to the organization's locale preferences.

### Overview

- **Scope:** Organization-level (not user-level)
- **Settings:** Currency, timezone, country, language
- **Storage:** Supabase `organizations` table (`locale_*` columns)
- **Usage:** Cost formatting, timestamp display, regional defaults
- **Configuration:** Set during signup or updated in organization settings

### Supported Options

**Currencies (16):** USD, EUR, GBP, INR, JPY, CNY, AUD, CAD, SGD, AED, CHF, SEK, NOK, DKK, ZAR, BRL

**Timezones (15):** America/New_York, America/Los_Angeles, America/Chicago, Europe/London, Europe/Paris, Europe/Berlin, Asia/Kolkata, Asia/Tokyo, Asia/Singapore, Asia/Shanghai, Australia/Sydney, Pacific/Auckland, America/Sao_Paulo, Africa/Johannesburg, Asia/Dubai

**Countries (16):** US, GB, IN, JP, CN, AU, CA, SG, AE, CH, SE, NO, DK, ZA, BR, EU

**Languages (16):** en, es, fr, de, hi, ja, zh, pt, ar, ru, it, nl, sv, no, da, ko

### Frontend Utilities (`lib/i18n/`)

**Constants (`constants.ts`):**
```typescript
export const SUPPORTED_CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$", country: "US" },
  { code: "EUR", name: "Euro", symbol: "€", country: "EU" },
  { code: "GBP", name: "British Pound", symbol: "£", country: "GB" },
  { code: "INR", name: "Indian Rupee", symbol: "₹", country: "IN" },
  // ... 12 more
]

export const SUPPORTED_TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (US)", offset: "UTC-5/4" },
  { value: "America/Los_Angeles", label: "Pacific Time (US)", offset: "UTC-8/7" },
  { value: "Asia/Kolkata", label: "India Standard Time", offset: "UTC+5:30" },
  // ... 12 more
]

export const SUPPORTED_COUNTRIES = [...]
export const SUPPORTED_LANGUAGES = [...]

// Helper mappings
export const CURRENCY_BY_COUNTRY: Record<string, string>
export const TIMEZONE_BY_COUNTRY: Record<string, string>
```

**Formatters (`formatters.ts`):**
```typescript
// Format currency with proper symbol and decimals
export function formatCurrency(
  amount: number,
  currencyCode: string = "USD"
): string

// Format date/time in organization's timezone
export function formatDateTime(
  date: Date | string,
  timezone: string = "UTC",
  options?: Intl.DateTimeFormatOptions
): string

// Get currency symbol only
export function getCurrencySymbol(currencyCode: string): string
```

**Re-exports (`index.ts`):**
```typescript
export * from "./constants"
export * from "./formatters"
```

### Usage Examples

```typescript
import {
  formatCurrency,
  formatDateTime,
  getCurrencySymbol,
  SUPPORTED_CURRENCIES
} from "@/lib/i18n"

// Currency formatting
formatCurrency(100, "INR")     // "₹100.00"
formatCurrency(100, "USD")     // "$100.00"
formatCurrency(1234.56, "EUR") // "€1,234.56"

// Timestamp formatting
const date = new Date("2025-12-13T10:30:00Z")
formatDateTime(date, "Asia/Kolkata")        // "Dec 13, 2025, 4:00 PM IST"
formatDateTime(date, "America/New_York")    // "Dec 13, 2025, 5:30 AM EST"

// Custom date format
formatDateTime(date, "Europe/London", {
  dateStyle: "full",
  timeStyle: "short"
})  // "Friday, 13 December 2025 at 10:30"

// Currency symbol only
getCurrencySymbol("JPY")  // "¥"
getCurrencySymbol("AED")  // "د.إ"

// Dropdown options
<Select>
  {SUPPORTED_CURRENCIES.map(({ code, name, symbol }) => (
    <option value={code}>{name} ({symbol})</option>
  ))}
</Select>
```

### Server Actions (`actions/organization-locale.ts`)

```typescript
// Fetch organization locale settings
const locale = await getOrgLocale(orgSlug)
// Returns: { currency: "USD", timezone: "America/New_York", country: "US", language: "en" }

// Update organization locale
await updateOrgLocale(orgSlug, {
  currency: "INR",
  timezone: "Asia/Kolkata",
  country: "IN",
  language: "hi"
})
```

### Settings Page (`app/[orgSlug]/settings/organization/`)

**Page Structure:**
- `page.tsx` - Organization settings UI with locale dropdowns
- Currency dropdown (16 options)
- Timezone dropdown (15 options)
- Country dropdown (16 options)
- Language dropdown (16 options)
- Auto-population: Currency/timezone default based on country selection

**Features:**
- Saves to Supabase `organizations.locale_*` columns
- Validates against supported options
- Shows current settings on load
- Updates in real-time

### Signup Form Integration

**Signup Page (`app/signup/page.tsx`):**
- Currency dropdown (defaults to USD)
- Timezone dropdown (defaults to UTC)
- Stored in Supabase user metadata during signup
- Applied to organization during onboarding

**Onboarding Flow:**
```
Signup → Billing → Checkout → Organization Creation
  ↓         ↓         ↓              ↓
Currency  Plan    Payment       locale_currency
Timezone  Select  Success       locale_timezone
```

### Database Schema

**Migration:** `scripts/supabase_db/16_org_internationalization.sql`

```sql
ALTER TABLE organizations
  ADD COLUMN locale_currency VARCHAR(3) DEFAULT 'USD',
  ADD COLUMN locale_timezone VARCHAR(50) DEFAULT 'UTC',
  ADD COLUMN locale_country VARCHAR(2) DEFAULT 'US',
  ADD COLUMN locale_language VARCHAR(2) DEFAULT 'en';
```

### Integration Points

**Dashboard Charts:**
```typescript
// Use org locale for cost display
const { currency } = await getOrgLocale(orgSlug)
const formattedCost = formatCurrency(totalCost, currency)
```

**Activity Logs:**
```typescript
// Format timestamps in org timezone
const { timezone } = await getOrgLocale(orgSlug)
const displayTime = formatDateTime(log.created_at, timezone)
```

**Billing Pages:**
```typescript
// Show subscription costs in org currency
const { currency } = await getOrgLocale(orgSlug)
subscriptions.map(sub => ({
  ...sub,
  displayPrice: formatCurrency(sub.price, currency)
}))
```

### Best Practices

1. **Always fetch org locale** before displaying costs or timestamps
2. **Default to USD/UTC** if locale not set
3. **Validate currency codes** against `SUPPORTED_CURRENCIES` before saving
4. **Use timezone-aware date pickers** for scheduling
5. **Store all dates in UTC** in database, format on display only
6. **Cache locale settings** in client-side state to reduce DB calls

### Testing

**Test Coverage:**
- `tests/i18n/locale-formatting.test.ts` - Currency/date formatting
- `tests/i18n/locale-settings.test.ts` - Update/fetch locale settings

**Example:**
```typescript
test("formats currency correctly for different locales", () => {
  expect(formatCurrency(100, "USD")).toBe("$100.00")
  expect(formatCurrency(100, "INR")).toBe("₹100.00")
  expect(formatCurrency(1234.56, "EUR")).toBe("€1,234.56")
})
```

---

## Backend Integration Patterns

### API Key Storage

| Key | Storage | Access | Usage |
|-----|---------|--------|-------|
| `CA_ROOT_API_KEY` | `process.env` | Server actions only | Bootstrap, org onboarding |
| Org API Key | `user.user_metadata.org_api_keys[org_slug]` | Via Supabase session | Integrations, pipelines |
| Fingerprint | `organizations.backend_api_key_fingerprint` | Display only | Show last 8 chars |

**IMPORTANT:** Never expose `CA_ROOT_API_KEY` to client-side code. Only use in server actions.

### Backend Onboarding (`actions/backend-onboarding.ts`)

```typescript
// Onboard org to backend (creates BigQuery dataset + API key)
await onboardToBackend({
  orgSlug: "acmecorp",
  companyName: "Acme Corp",
  adminEmail: "admin@acme.com",
  subscriptionPlan: "STARTER"
})

// Get org API key from user metadata
const apiKey = await getOrgApiKeySecure("acmecorp")

// Check onboarding status
const status = await checkBackendOnboarding("acmecorp")

// Rotate API key
const rotated = await rotateApiKey("acmecorp")

// Sync subscription to backend BigQuery
await syncSubscriptionToBackend({
  orgSlug: "acmecorp",
  billingStatus: "active",  // Frontend status
  planName: "starter",
  dailyLimit: 6,
  monthlyLimit: 100
})
```

**DEV ONLY:** Get decrypted API key via 02-api-service:
```bash
curl -X GET "http://localhost:8000/api/v1/admin/dev/api-key/{org_slug}" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY"
```

### Integration Setup (`actions/integrations.ts`)

```typescript
// Setup integration (encrypts credentials via KMS in backend)
await setupIntegration({
  orgSlug: "acmecorp",
  provider: "openai",  // openai, anthropic, gcp
  credential: "sk-proj-...",
  credentialName: "OpenAI Production Key"
})

// Get all integrations status
const integrations = await getIntegrations("acmecorp")

// Validate integration
await validateIntegration("acmecorp", "openai")

// Delete integration
await deleteIntegration("acmecorp", "openai")

// LLM Pricing CRUD (all providers)
const pricing = await listLLMPricing("acmecorp", "openai")
await updateLLMPricing("acmecorp", "openai", "model-id", { ... })
await createLLMPricing("acmecorp", "openai", { ... })
await deleteLLMPricing("acmecorp", "openai", "model-id")

// Toggle integration enabled/disabled
await toggleIntegrationEnabled("acmecorp", "openai", false)
```

### SaaS Subscriptions (`actions/subscription-providers.ts`)

Tracks fixed-cost SaaS subscriptions (Canva, Slack, ChatGPT Plus, etc.) in BigQuery via 02-api-service.

```typescript
// Enable provider (no auto-seed - must add plans manually)
await enableProvider("acmecorp", "chatgpt_plus")

// Get template plans (from seed CSV)
const templates = await getAvailablePlans("acmecorp", "chatgpt_plus")

// List subscriptions
const { subscriptions } = await listSaaSSubscriptions("acmecorp", "slack")

// Create subscription
await createSaaSSubscription("acmecorp", "slack", {
  plan_name: "slack_pro",
  billing_cycle: "monthly",  // monthly | annual | quarterly
  price_per_unit: 12.99,
  quantity: 5,
  start_date: "2025-01-01",
  renewal_date: "2025-02-01"
})

// Edit with version history
await editPlanWithVersion("acmecorp", "slack", "sub-id", "2025-12-15", {
  price_per_unit: 14.99,
  quantity: 10
})  // Old row ends Dec 14, new row starts Dec 15

// End subscription (soft delete)
await endSubscription("acmecorp", "slack", "sub-id", "2025-12-31")
```

**Status:** `active`, `pending`, `cancelled`, `expired`

**UI Components:** `date-picker.tsx`, `calendar.tsx`, `popover.tsx`

**Providers:** Canva, Adobe, Figma, Notion, Slack, Zoom, GitHub, Jira, ChatGPT Plus, Claude Pro, Copilot, Cursor, v0, Linear, Vercel

### Pipeline Execution (`actions/pipelines.ts`)

```typescript
// Run GCP cost billing pipeline
await runGcpCostBillingPipeline("acmecorp", "2025-11-26")
```

**Quota Enforcement (Dual-Check):**
1. **Frontend:** Checks Supabase `subscription_status` (only `active`/`trialing` allowed)
2. **Backend:** Validates BigQuery `org_subscriptions.status` (only `ACTIVE`/`TRIAL` allowed)

### Backend API Client (`lib/api/backend.ts`)

```typescript
import { getPipelineBackendClient } from "@/lib/api/backend"

// With org API key (integrations/pipelines)
const client = getPipelineBackendClient({ orgApiKey: "org_xxx_api_xxxx" })

// With admin key (onboarding)
const adminClient = getPipelineBackendClient({
  adminApiKey: process.env.CA_ROOT_API_KEY  // Server-side only!
})

// Setup integration
await client.setupIntegration(orgSlug, "openai", { credential: "sk-..." })

// Run pipeline: runPipeline(orgSlug, provider, domain, template_name, params)
// Maps to: configs/{provider}/{domain}/{template_name}.yml
await client.runPipeline(orgSlug, "gcp", "cost", "billing", { date: "2025-11-26" })
```

### Common Integration Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| "Org API key not found" | User metadata missing | Run `saveApiKey()` or check `user.user_metadata.org_api_keys` |
| "Backend URL not configured" | Missing env var | Set `NEXT_PUBLIC_PIPELINE_SERVICE_URL` |
| "Integration not configured" | Provider not setup | Run `setupIntegration()` first |
| Pipeline 401 error | Invalid API key | Rotate key or check user metadata |

---

## Stripe Billing Integration

**Critical:** All plan data comes from Stripe. NO hardcoded fallbacks.

### Stripe Product Metadata (Required)

```
plan_id: "starter"                   # Unique identifier
teamMembers: "2"                     # Seat limit
providers: "3"                       # Provider limit
pipelinesPerDay: "6"                 # Daily pipeline limit
features: "Feature 1|Feature 2"      # Pipe-separated
order: "1"                           # Sort order
is_popular: "true"                   # Optional
```

**Plan ID Generation (Consistent!):**
```typescript
const planId = metadata.plan_id || product.name.toLowerCase().replace(/\s+/g, "_")
```

### Subscription Actions

| Action | Method | Flow |
|--------|--------|------|
| New subscription | `createCheckoutSession()` | Stripe Checkout |
| Upgrade/Downgrade | `changeSubscriptionPlan()` | Direct API (instant, prorated) |
| Cancel/Payment | `createBillingPortalSession()` | Stripe Portal |

### Stripe Functions (`actions/stripe.ts`)

```typescript
// Get all plans from Stripe
const { data: plans } = await getStripePlans()

// Create checkout session
const { sessionId } = await createOnboardingCheckoutSession(priceId)
const { sessionId } = await createCheckoutSession(priceId, orgSlug)

// Billing management
const { data: info } = await getBillingInfo(orgSlug)
const { url } = await createBillingPortalSession(orgSlug)
await changeSubscriptionPlan(orgSlug, newPriceId)
```

### Webhook Events (`app/api/webhooks/stripe/route.ts`)

Updates Supabase + syncs to backend BigQuery:

- `checkout.session.completed` - Activates subscription
- `customer.subscription.updated` - Updates plan/status/limits
- `customer.subscription.deleted` - Cancels subscription
- `invoice.payment_failed` - Sets `past_due` status
- `invoice.payment_succeeded` - Restores `active` status

**Status Mapping (Frontend → Backend):**

| Supabase | BigQuery |
|----------|----------|
| `trialing` | `TRIAL` |
| `active` | `ACTIVE` |
| `past_due` | `SUSPENDED` |
| `canceled` | `CANCELLED` |

**Quota Enforcement:** Only `ACTIVE` and `TRIAL` allow pipeline execution.

**Full documentation:** `00-requirements-docs/01_BILLING_STRIPE.md`

---

## Security Patterns

**Full documentation:** `00-requirements-docs/05_SECURITY.md`

### Input Validation (MANDATORY)

```typescript
// Org slug - prevents path traversal
const isValidOrgSlug = (slug: string): boolean => {
  return /^[a-zA-Z0-9_-]{2,100}$/.test(slug)
}

// Org name - prevents XSS/injection
const sanitizeOrgName = (name: string): string => {
  return name
    .replace(/<[^>]*>/g, "")      // Remove HTML
    .replace(/[<>"'&;]/g, "")     // Remove dangerous chars
    .trim().slice(0, 100)
}

// Email (RFC 5322)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

// Stripe price ID
const isValidStripePriceId = (priceId: string): boolean => {
  return priceId.startsWith("price_") && priceId.length > 10
}
```

**Files:** `actions/stripe.ts`, `actions/members.ts`, `actions/organization.ts`, `app/api/webhooks/stripe/route.ts`

### Rate Limiting

| Operation | Limit | Window | File |
|-----------|-------|--------|------|
| Checkout sessions | 1 | 30 sec | `actions/stripe.ts` |
| Member invites | 10 | 1 hour | `actions/members.ts` |
| Deletion tokens | 1000 max | Rolling | `actions/account.ts` |

### XSS Prevention (`lib/email.ts`)

```typescript
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
```

### Pagination (REQUIRED)

```typescript
// Always include .limit()
await supabase.from("organization_members").select("*").eq("org_id", orgId).limit(100)
```

**Limits:** Members: 100, Invites: 50, Invoices: 10

### Webhook Security

1. Signature verification (`stripe.webhooks.constructEvent`)
2. Content-type validation
3. Idempotency (in-memory + database)

### Public Routes (`middleware.ts`)

```typescript
const publicPaths = [
  "/", "/features", "/pricing", "/about", "/contact",
  "/privacy", "/terms", "/login", "/signup", "/forgot-password",
  "/reset-password", "/invite", "/onboarding"
]
```

### Security Checklist

- [ ] All inputs validated/sanitized
- [ ] Database queries paginated
- [ ] Sensitive ops rate limited
- [ ] Email content escaped
- [ ] Server actions authenticated
- [ ] In-memory caches bounded

---

## Design System

**Brand:** Teal (#007A78) + Coral (#FF6E50) | **Font:** DM Sans | **Spacing:** 8px base

### Colors

```css
--cloudact-teal: #007A78           --cloudact-coral: #FF6E50
--cloudact-teal-light: #14B8A6     --cloudact-coral-light: #FF8A73
--cloudact-teal-dark: #005F5D      --cloudact-coral-dark: #E55A3C
```

### Typography

| Element | Size | Weight | Spacing |
|---------|------|--------|---------|
| Page Title | 1.5rem | 700 | -0.025em |
| Heading | 1.25rem | 600 | -0.015em |
| Card Title | 1rem | 600 | -0.01em |
| Body | 0.875rem | 400 | normal |

### Key CSS Classes

```
.console-page-title    .console-heading      .console-card-title
.console-body          .console-metric       .console-badge-teal
.console-button-primary   .console-stat-card   .console-chart-card
```

### CSS Files

- `app/globals.css` - Design tokens, base styles
- `app/[orgSlug]/console.css` - Console-specific components
- `app/(landingPages)/landing.css` - Landing page styles

---

## Documentation

All documentation is centralized in `00-requirements-docs/`:

| Document | Description |
|----------|-------------|
| `00-ARCHITECTURE.md` | Full platform architecture |
| `00-DESIGN_STANDARDS.md` | Design system (colors, typography) |
| `00_CONSOLE_UI_DESIGN_STANDARDS.md` | Console UI patterns |
| `00_INTERNATIONALIZATION.md` | i18n implementation guide |
| `01_BILLING_STRIPE.md` | Billing architecture (Stripe-first) |
| `01_USER_MANAGEMENT.md` | Auth, roles, team invites |
| `05_SECURITY.md` | Security implementation details |
| `05_TESTING.md` | Testing guide (15 comprehensive flows) |

**Service CLAUDE.md files:**
- `CLAUDE.md` (root) - Platform overview, commands
- `02-api-service/CLAUDE.md` - API service
- `03-data-pipeline-service/CLAUDE.md` - Pipeline service

---

**Last Updated:** 2025-12-13
