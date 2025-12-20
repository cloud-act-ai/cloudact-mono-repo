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
/signup → Email, password, company info, currency, timezone
         (stored in user_metadata: pending_company_name, pending_currency, etc.)
    ↓
/onboarding/billing → Select Stripe plan → Redirects to Stripe Checkout
    ↓
Stripe Checkout → Payment/trial setup (metadata from user_metadata passed here)
    ↓
/onboarding/success → Creates org + applies locale + backend onboarding + API key
    ↓
/{orgSlug}/dashboard → Welcome to app
```

**Important:** The onboarding flow MUST go through Stripe Checkout. All company/locale info is collected at `/signup` and stored in `user_metadata`, then applied to the organization after successful Stripe checkout in `/onboarding/success`.

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
├── currency/                   # Currency conversion (v12.2)
│   └── exchange-rates.ts       # Exchange rates, convertFromUSD(), convertWithAudit()
├── i18n/                       # Internationalization
│   ├── constants.ts            # Currencies, timezones, mappings
│   ├── formatters.ts           # formatCurrency, formatDateTime, formatDateOnly
│   └── index.ts                # Re-exports (includes currency conversion)
├── seed/                       # CSV seed data system
│   └── csv-loader.ts           # Load seed data from CSV files
└── utils.ts                    # cn(), logError()

data/seed/                      # CSV seed data files
├── exchange-rates.csv          # Currency exchange rates (16 currencies)
└── saas-subscription-templates.csv  # Default SaaS subscription templates

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

// Format DATE only (timezone-safe) - use for DATE fields like start_date, end_date
export function formatDateOnly(
  dateString: string | Date,
  locale: string = "en-US"
): string
// Example: "2025-01-15" → "Jan 15, 2025"
// CRITICAL: Use this for DATE fields to avoid timezone shifts

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
  formatDateOnly,
  getCurrencySymbol,
  SUPPORTED_CURRENCIES,
  // Currency conversion (v12.2)
  convertFromUSD,
  convertCurrency,
  getExchangeRate,
  convertWithAudit,
  convertFromUSDAsync,
  getExchangeRateAsync,
} from "@/lib/i18n"

// Currency formatting
formatCurrency(100, "INR")     // "₹100.00"
formatCurrency(100, "USD")     // "$100.00"
formatCurrency(1234.56, "EUR") // "€1,234.56"

// Currency conversion (v12.2 - synchronous, uses cached rates)
convertFromUSD(15, "INR")      // 1246.80 (15 USD → INR)
convertCurrency(100, "USD", "AED") // 367.30 (100 USD → AED)
getExchangeRate("INR")         // 83.12 (rate vs USD)

// Currency conversion (v12.2+ - async, checks last_updated timestamp)
const { converted, rate, lastUpdated } = await convertFromUSDAsync(15, "INR")
// Returns: { converted: 1246.80, rate: 83.12, lastUpdated: "2025-12-13" }

const { rate, lastUpdated } = await getExchangeRateAsync("INR")
// Returns: { rate: 83.12, lastUpdated: "2025-12-13" }

// Timestamp formatting
const date = new Date("2025-12-13T10:30:00Z")
formatDateTime(date, "Asia/Kolkata")        // "Dec 13, 2025, 4:00 PM IST"
formatDateTime(date, "America/New_York")    // "Dec 13, 2025, 5:30 AM EST"

// DATE-only formatting (timezone-safe)
formatDateOnly("2025-01-15")                // "Jan 15, 2025"
formatDateOnly(new Date("2025-01-15"))      // "Jan 15, 2025"
// CRITICAL: Always use for DATE fields (start_date, end_date, etc.)

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

**Currency Display:**
1. **Never hardcode `$` symbol** - Always use `formatCurrency(amount, currency)` from `@/lib/i18n`
2. **Get currency from Stripe** - Stripe prices have a `currency` field; use `plan.currency` or `subscription.plan.currency`
3. **Org locale vs Stripe currency** - These are different:
   - `org.locale_currency` = User's preference for internal cost display (INR, EUR, etc.)
   - `plan.currency` = What Stripe actually charges (from the Stripe Price object)
4. **Stripe Checkout shows Stripe's currency** - User's locale preference doesn't change Stripe's display; Stripe uses the Price's currency
5. **SaaS subscription templates (v12.2)** - Template prices are USD, convert using `convertFromUSD(price, orgCurrency)` before display
6. **Currency is locked** - SaaS subscription forms lock currency to org default for consistent reporting

**Data Types:**
```typescript
// DynamicPlan includes currency from Stripe
interface DynamicPlan {
  price: number
  currency: string  // e.g., "USD", "EUR" - from Stripe Price
  // ...
}

// BillingInfo subscription also has currency
interface BillingInfo {
  subscription: {
    plan: {
      price: number
      currency: string  // From Stripe subscription's price
      // ...
    }
  }
}
```

**General:**
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

## CSV Seed Data System

CSV-based seed data loader for exchange rates and SaaS subscription templates. Provides default data for organizations without hardcoding in source code.

### Overview

- **Location:** `data/seed/` (CSV files), `lib/seed/csv-loader.ts` (loader)
- **Purpose:** Seed default data for exchange rates and SaaS subscription templates
- **Format:** CSV files with headers
- **Loading:** Synchronous parser using `csv-parse/sync`
- **Validation:** Type-safe interfaces, schema validation

### CSV Files

**`data/seed/exchange-rates.csv`** - Currency exchange rates (16 currencies)

```csv
currency_code,rate_vs_usd,last_updated
USD,1.00,2025-12-13
EUR,0.92,2025-12-13
GBP,0.79,2025-12-13
INR,83.12,2025-12-13
JPY,149.50,2025-12-13
CNY,7.24,2025-12-13
AUD,1.52,2025-12-13
CAD,1.36,2025-12-13
SGD,1.34,2025-12-13
AED,3.67,2025-12-13
CHF,0.88,2025-12-13
SEK,10.35,2025-12-13
NOK,10.72,2025-12-13
DKK,6.87,2025-12-13
ZAR,18.25,2025-12-13
BRL,4.95,2025-12-13
```

**Fields:**
- `currency_code` - 3-letter currency code (ISO 4217)
- `rate_vs_usd` - Exchange rate vs USD (1 USD = X currency)
- `last_updated` - Date rates were last updated (YYYY-MM-DD)

**`data/seed/saas-subscription-templates.csv`** - Default SaaS subscription templates

```csv
provider,plan_name,category,description,billing_cycle,price_per_unit,currency,default_quantity,features
canva,canva_pro,design,Canva Pro Design Platform,monthly,12.99,USD,1,Premium templates|Brand kit|Unlimited storage
slack,slack_pro,collaboration,Slack Pro Team Chat,monthly,7.25,USD,10,Unlimited message history|Screen sharing|Apps
chatgpt_plus,chatgpt_plus,ai,ChatGPT Plus Subscription,monthly,20.00,USD,1,GPT-4 access|Faster responses|Priority access
```

**Fields:**
- `provider` - Provider slug (lowercase, underscores)
- `plan_name` - Plan identifier (lowercase, underscores)
- `category` - Category (design, collaboration, ai, development, productivity, analytics)
- `description` - Human-readable description
- `billing_cycle` - Billing cycle (monthly, annual, quarterly)
- `price_per_unit` - Default price per unit in USD
- `currency` - Currency code (always USD for templates)
- `default_quantity` - Default quantity (usually 1 or 5-10 for team plans)
- `features` - Pipe-separated list of features

### CSV Loader (`lib/seed/csv-loader.ts`)

```typescript
import { parse } from "csv-parse/sync"
import fs from "fs"
import path from "path"

// Exchange rate schema
interface ExchangeRateSeed {
  currency_code: string
  rate_vs_usd: number
  last_updated: string
}

// SaaS subscription template schema
interface SaaSSubscriptionTemplateSeed {
  provider: string
  plan_name: string
  category: string
  description: string
  billing_cycle: "monthly" | "annual" | "quarterly"
  price_per_unit: number
  currency: string
  default_quantity: number
  features: string
}

// Load exchange rates from CSV
export function loadExchangeRates(): ExchangeRateSeed[] {
  const csvPath = path.join(process.cwd(), "data", "seed", "exchange-rates.csv")
  const csvContent = fs.readFileSync(csvPath, "utf-8")

  return parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    cast: (value, context) => {
      if (context.column === "rate_vs_usd") return parseFloat(value)
      return value
    }
  })
}

// Load SaaS subscription templates from CSV
export function loadSaaSSubscriptionTemplates(): SaaSSubscriptionTemplateSeed[] {
  const csvPath = path.join(process.cwd(), "data", "seed", "saas-subscription-templates.csv")
  const csvContent = fs.readFileSync(csvPath, "utf-8")

  return parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    cast: (value, context) => {
      if (context.column === "price_per_unit" || context.column === "default_quantity") {
        return parseFloat(value)
      }
      return value
    }
  })
}
```

### Usage Examples

```typescript
import { loadExchangeRates, loadSaaSSubscriptionTemplates } from "@/lib/seed/csv-loader"

// Load exchange rates
const rates = loadExchangeRates()
console.log(rates[0])
// { currency_code: "USD", rate_vs_usd: 1.00, last_updated: "2025-12-13" }

// Load SaaS subscription templates
const templates = loadSaaSSubscriptionTemplates()
console.log(templates[0])
// {
//   provider: "canva",
//   plan_name: "canva_pro",
//   category: "design",
//   description: "Canva Pro Design Platform",
//   billing_cycle: "monthly",
//   price_per_unit: 12.99,
//   currency: "USD",
//   default_quantity: 1,
//   features: "Premium templates|Brand kit|Unlimited storage"
// }

// Filter templates by provider
const slackTemplates = templates.filter(t => t.provider === "slack")

// Get template for specific plan
const chatgptPlusTemplate = templates.find(
  t => t.provider === "chatgpt_plus" && t.plan_name === "chatgpt_plus"
)
```

### Integration with Server Actions

**`actions/subscription-providers.ts`:**

```typescript
import { loadSaaSSubscriptionTemplates } from "@/lib/seed/csv-loader"

// Get available templates for a provider
export async function getAvailablePlans(orgSlug: string, provider: string) {
  const templates = loadSaaSSubscriptionTemplates()
  const providerTemplates = templates.filter(t => t.provider === provider)

  return {
    success: true,
    data: providerTemplates.map(t => ({
      plan_name: t.plan_name,
      description: t.description,
      billing_cycle: t.billing_cycle,
      price_per_unit: t.price_per_unit,
      currency: t.currency,
      default_quantity: t.default_quantity,
      features: t.features.split("|")
    }))
  }
}
```

**`lib/currency/exchange-rates.ts`:**

```typescript
import { loadExchangeRates } from "@/lib/seed/csv-loader"

// Load rates from CSV into cache
const EXCHANGE_RATES_CACHE: Map<string, { rate: number; lastUpdated: string }> = new Map()

function initializeExchangeRates() {
  const rates = loadExchangeRates()
  rates.forEach(({ currency_code, rate_vs_usd, last_updated }) => {
    EXCHANGE_RATES_CACHE.set(currency_code, {
      rate: rate_vs_usd,
      lastUpdated: last_updated
    })
  })
}

// Initialize on module load
initializeExchangeRates()
```

### Best Practices

**CSV Format:**
1. Always include headers in first row
2. Use lowercase_with_underscores for column names
3. Keep numeric values clean (no currency symbols, no commas)
4. Use ISO standards (ISO 4217 for currencies, ISO 8601 for dates)
5. Use pipe `|` as delimiter for multi-value fields (e.g., features)

**Loading:**
1. Load CSV files at module initialization (cached in memory)
2. Use synchronous `csv-parse/sync` for simplicity (small files)
3. Validate schema with TypeScript interfaces
4. Handle missing files gracefully with try-catch

**Updating:**
1. Update CSV files to refresh default data
2. No code changes needed (data-driven)
3. Exchange rates should be updated regularly (weekly/monthly)
4. SaaS templates updated when providers change pricing

**Testing:**
```typescript
test("loads exchange rates from CSV", () => {
  const rates = loadExchangeRates()
  expect(rates.length).toBeGreaterThan(0)
  expect(rates[0]).toHaveProperty("currency_code")
  expect(rates[0]).toHaveProperty("rate_vs_usd")
  expect(rates[0]).toHaveProperty("last_updated")
})

test("loads SaaS templates from CSV", () => {
  const templates = loadSaaSSubscriptionTemplates()
  expect(templates.length).toBeGreaterThan(0)
  expect(templates[0]).toHaveProperty("provider")
  expect(templates[0]).toHaveProperty("price_per_unit")
  expect(typeof templates[0].price_per_unit).toBe("number")
})
```

---

## Multi-Currency Support

Comprehensive multi-currency support with exchange rates, async conversion functions, and audit trail for all currency operations.

### Overview

- **Supported Currencies:** 16 currencies (USD, EUR, GBP, INR, JPY, CNY, AUD, CAD, SGD, AED, CHF, SEK, NOK, DKK, ZAR, BRL)
- **Exchange Rates:** Loaded from CSV with `last_updated` tracking
- **Conversion:** Synchronous (cached) and async (with timestamp check) functions
- **Audit Trail:** Track source currency, exchange rate used, conversion timestamp
- **Update Frequency:** Exchange rates updated weekly/monthly in CSV

### Exchange Rates with Last Updated Tracking

**Data Structure:**
```typescript
interface ExchangeRate {
  currency_code: string
  rate_vs_usd: number
  last_updated: string  // YYYY-MM-DD format
}
```

**CSV Source (`data/seed/exchange-rates.csv`):**
```csv
currency_code,rate_vs_usd,last_updated
USD,1.00,2025-12-13
EUR,0.92,2025-12-13
INR,83.12,2025-12-13
```

**Loading Mechanism (`lib/currency/exchange-rates.ts`):**
```typescript
import { loadExchangeRates } from "@/lib/seed/csv-loader"

const EXCHANGE_RATES_CACHE: Map<string, { rate: number; lastUpdated: string }> = new Map()

function initializeExchangeRates() {
  const rates = loadExchangeRates()
  rates.forEach(({ currency_code, rate_vs_usd, last_updated }) => {
    EXCHANGE_RATES_CACHE.set(currency_code, {
      rate: rate_vs_usd,
      lastUpdated: last_updated
    })
  })
}

// Initialize on module load
initializeExchangeRates()
```

### Synchronous Conversion Functions (Cached)

**Get Exchange Rate:**
```typescript
export function getExchangeRate(currencyCode: string): number {
  if (currencyCode === "USD") return 1.0

  const rateData = EXCHANGE_RATES_CACHE.get(currencyCode)
  if (!rateData) {
    console.warn(`Exchange rate not found for ${currencyCode}, defaulting to 1.0`)
    return 1.0
  }

  return rateData.rate
}
```

**Convert from USD:**
```typescript
export function convertFromUSD(amountUSD: number, targetCurrency: string): number {
  const rate = getExchangeRate(targetCurrency)
  return parseFloat((amountUSD * rate).toFixed(2))
}
```

**Convert between currencies:**
```typescript
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): number {
  if (fromCurrency === toCurrency) return amount

  // Convert to USD first, then to target currency
  const amountInUSD = fromCurrency === "USD" ? amount : amount / getExchangeRate(fromCurrency)
  return convertFromUSD(amountInUSD, toCurrency)
}
```

### Async Conversion Functions (With Last Updated)

**Get Exchange Rate Async:**
```typescript
export async function getExchangeRateAsync(
  currencyCode: string
): Promise<{ rate: number; lastUpdated: string }> {
  if (currencyCode === "USD") {
    return { rate: 1.0, lastUpdated: new Date().toISOString().split("T")[0] }
  }

  const rateData = EXCHANGE_RATES_CACHE.get(currencyCode)
  if (!rateData) {
    console.warn(`Exchange rate not found for ${currencyCode}, defaulting to 1.0`)
    return { rate: 1.0, lastUpdated: new Date().toISOString().split("T")[0] }
  }

  return {
    rate: rateData.rate,
    lastUpdated: rateData.lastUpdated
  }
}
```

**Convert from USD Async:**
```typescript
export async function convertFromUSDAsync(
  amountUSD: number,
  targetCurrency: string
): Promise<{ converted: number; rate: number; lastUpdated: string }> {
  const { rate, lastUpdated } = await getExchangeRateAsync(targetCurrency)

  return {
    converted: parseFloat((amountUSD * rate).toFixed(2)),
    rate,
    lastUpdated
  }
}
```

**Usage Example:**
```typescript
// Display template prices in org currency with last updated info
const templates = loadSaaSSubscriptionTemplates()
const orgCurrency = "INR"

const convertedPlans = await Promise.all(
  templates.map(async (template) => {
    const { converted, rate, lastUpdated } = await convertFromUSDAsync(
      template.price_per_unit,
      orgCurrency
    )

    return {
      ...template,
      displayPrice: converted,
      displayCurrency: orgCurrency,
      exchangeRate: rate,
      ratesUpdated: lastUpdated
    }
  })
)

// Show rates age to user
console.log(`Prices shown in ${orgCurrency} (rates updated: ${convertedPlans[0].ratesUpdated})`)
```

### Audit Trail Fields

All currency conversions in SaaS subscriptions include audit fields for transparency and debugging:

**Database Schema (`saas_subscriptions` table):**
```typescript
interface SaaSSubscription {
  // Primary fields
  plan_name: string
  price_per_unit: number
  currency: string  // Organization's default currency

  // Audit trail fields (added in v12.2)
  source_currency: string  // Original template currency (usually "USD")
  source_price: number     // Original template price (before conversion)
  exchange_rate_used: number  // Exchange rate used for conversion
  conversion_timestamp: string  // When conversion was performed (ISO 8601)
}
```

**Conversion with Audit Trail:**
```typescript
export function convertWithAudit(
  sourceAmount: number,
  sourceCurrency: string,
  targetCurrency: string
): {
  convertedAmount: number
  sourceAmount: number
  sourceCurrency: string
  targetCurrency: string
  exchangeRate: number
  conversionTimestamp: string
} {
  const rate = getExchangeRate(targetCurrency)
  const converted = convertFromUSD(sourceAmount, targetCurrency)

  return {
    convertedAmount: converted,
    sourceAmount,
    sourceCurrency,
    targetCurrency,
    exchangeRate: rate,
    conversionTimestamp: new Date().toISOString()
  }
}
```

**Usage in SaaS Subscription Creation:**
```typescript
// Create subscription with audit trail
const template = templates.find(t => t.plan_name === "canva_pro")
const orgCurrency = await getOrgCurrency(orgSlug)

const audit = convertWithAudit(
  template.price_per_unit,
  template.currency,  // "USD"
  orgCurrency         // "INR"
)

await createSaaSSubscription(orgSlug, "canva", {
  plan_name: template.plan_name,
  price_per_unit: audit.convertedAmount,  // 1079.11
  currency: orgCurrency,                   // "INR"
  source_currency: audit.sourceCurrency,   // "USD"
  source_price: audit.sourceAmount,        // 12.99
  exchange_rate_used: audit.exchangeRate,  // 83.12
  conversion_timestamp: audit.conversionTimestamp  // "2025-12-13T10:30:00Z"
})
```

### Currency Enforcement

All SaaS subscription plans MUST use the organization's default currency. 3-layer validation ensures consistency.

**Enforcement Rules:**
1. Plans are locked to org's `locale_currency` (set during signup or in settings)
2. Template prices (USD) are auto-converted to org currency
3. Manual price entry must match org currency
4. Currency field is disabled in UI (read-only)
5. Validation at UI, action, and API layers

**Layer 1: UI Enforcement (`components/ui/currency-input.tsx`):**
```typescript
<CurrencyInput
  value={pricePerUnit}
  onChange={setPricePerUnit}
  currency={orgCurrency}  // Locked to org currency
  disabled={false}
/>

<Select disabled value={orgCurrency}>
  <SelectItem value={orgCurrency}>{orgCurrency}</SelectItem>
</Select>
```

**Layer 2: Server Action Validation (`actions/subscription-providers.ts`):**
```typescript
export async function createSaaSSubscription(
  orgSlug: string,
  provider: string,
  data: CreateSubscriptionData
) {
  // Get org's default currency
  const { currency: orgCurrency } = await getOrgLocale(orgSlug)

  // Validate currency matches org default
  if (data.currency !== orgCurrency) {
    return {
      success: false,
      error: `Currency must match organization default: ${orgCurrency}`,
    }
  }

  // Proceed with creation...
}
```

**Layer 3: API Validation (02-api-service):**
```python
# Backend also validates currency matches org settings
org_currency = get_org_currency(org_slug)
if request.currency != org_currency:
    raise ValidationError(f"Currency must match org default: {org_currency}")
```

**Benefits:**
- **Consistent reporting:** All costs in single currency
- **Simplified analytics:** No currency mixing in charts
- **User clarity:** No confusion about which currency to use
- **Audit trail:** Source prices preserved for reference

---

## SaaS Subscription Plan Features

Advanced features for SaaS subscription management including duplicate detection, version history, and comprehensive audit trails.

### Duplicate Detection

Prevents creating multiple active subscriptions for the same provider+plan combination.

**Validation Logic:**
```typescript
// Check for existing active subscription
const { data: existingPlans } = await supabase
  .from("saas_subscriptions")
  .select("id, plan_name, status")
  .eq("org_id", orgId)
  .eq("provider", provider)
  .eq("plan_name", planName)
  .in("status", ["active", "pending"])
  .is("end_date", null)

if (existingPlans && existingPlans.length > 0) {
  return {
    success: false,
    error: `An active subscription for ${planName} already exists. Please edit or end the existing subscription first.`,
  }
}
```

**UI Feedback:**
```typescript
// In subscription form
if (duplicateError) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Duplicate Subscription</AlertTitle>
      <AlertDescription>
        An active subscription for {planName} already exists.
        <Link href={`/${orgSlug}/settings/subscriptions/${provider}`}>
          View existing subscription
        </Link>
      </AlertDescription>
    </Alert>
  )
}
```

**Business Rules:**
- Only checks `active` and `pending` status
- Allows duplicate if existing plan has `end_date` set (soft deleted)
- Allows same plan from different providers
- Prevents accidental duplicate entries

### Version History via Edit-Version Endpoint

When editing a subscription, create a new version instead of updating in place. Preserves full audit trail.

**Edit Flow:**
```typescript
export async function editPlanWithVersion(
  orgSlug: string,
  provider: string,
  subscriptionId: string,
  effectiveDate: string,
  updates: Partial<SubscriptionData>
) {
  // Step 1: End current version (set end_date to day before effective_date)
  const endDate = new Date(effectiveDate)
  endDate.setDate(endDate.getDate() - 1)

  // Step 2: Create new version starting from effective_date
  // Backend handles this via edit-version endpoint
  const response = await backendClient.editSubscriptionWithVersion(
    orgSlug,
    provider,
    subscriptionId,
    effectiveDate,
    updates
  )

  return response
}
```

**Backend Processing (02-api-service):**
```python
# POST /api/v1/subscriptions/{org}/providers/{provider}/plans/{id}/edit-version
# 1. Find current active plan
current_plan = get_plan_by_id(org_slug, provider, plan_id)

# 2. Set end_date on current plan (day before effective_date)
end_date = datetime.fromisoformat(effective_date) - timedelta(days=1)
update_plan_end_date(current_plan.id, end_date.strftime("%Y-%m-%d"))

# 3. Create new plan row with updated values, start_date = effective_date
new_plan = {
    **current_plan,  # Copy all fields
    **updates,       # Apply updates
    "start_date": effective_date,
    "end_date": None,
    "status": "active",
    "created_at": datetime.utcnow().isoformat()
}
insert_new_plan(new_plan)
```

**Version History Query:**
```typescript
// Get all versions of a subscription
const { data: versions } = await supabase
  .from("saas_subscriptions")
  .select("*")
  .eq("org_id", orgId)
  .eq("provider", provider)
  .eq("plan_name", planName)
  .order("start_date", { ascending: false })

// Display timeline
versions.map(v => ({
  period: `${v.start_date} to ${v.end_date || "present"}`,
  price: formatCurrency(v.price_per_unit, v.currency),
  quantity: v.quantity,
  status: v.status
}))
```

**Use Cases:**
- Price changes (keeping historical pricing)
- Quantity changes (team size increases)
- Billing cycle changes (monthly → annual)
- Plan upgrades (pro → enterprise)

**Benefits:**
- Complete audit trail
- Historical cost analysis
- No data loss
- Regulatory compliance (SOX, GDPR)

### Comprehensive Audit Trail

Every subscription includes full audit metadata for compliance and debugging.

**Audit Fields:**
```typescript
interface SaaSSubscriptionAudit {
  // Identity
  id: string
  org_id: string
  provider: string
  plan_name: string

  // Lifecycle
  status: "active" | "pending" | "cancelled" | "expired"
  start_date: string  // YYYY-MM-DD
  end_date: string | null  // YYYY-MM-DD or null
  renewal_date: string  // YYYY-MM-DD

  // Pricing
  price_per_unit: number
  currency: string
  quantity: number
  billing_cycle: "monthly" | "annual" | "quarterly"

  // Currency conversion audit (v12.2)
  source_currency: string  // Original template currency
  source_price: number     // Original template price
  exchange_rate_used: number  // Rate at conversion time
  conversion_timestamp: string  // ISO 8601

  // Change tracking
  created_at: string  // ISO 8601
  updated_at: string  // ISO 8601
  created_by: string  // User ID
  updated_by: string  // User ID
}
```

**Audit Log Display:**
```typescript
// Subscription change history
const auditLog = [
  {
    timestamp: "2025-12-13T10:30:00Z",
    action: "CREATED",
    user: "admin@acme.com",
    changes: {
      plan_name: "slack_pro",
      price_per_unit: 725.00,
      currency: "INR",
      source_price: 7.25,
      source_currency: "USD",
      exchange_rate: 83.12
    }
  },
  {
    timestamp: "2025-12-14T14:20:00Z",
    action: "UPDATED",
    user: "admin@acme.com",
    changes: {
      quantity: { from: 10, to: 15 },
      effective_date: "2025-12-15"
    }
  }
]
```

### Status Management

**Status Values:**
- `active` - Currently active subscription
- `pending` - Scheduled to start (start_date in future)
- `cancelled` - Manually cancelled (has end_date)
- `expired` - Expired (end_date in past)

**Status Transitions:**
```typescript
// Create → active (if start_date <= today)
// Create → pending (if start_date > today)

// Edit → active (always creates new active version)

// End → cancelled (sets end_date)

// Auto-transition → expired (background job checks end_date < today)
```

**Status Checks:**
```typescript
export function getActiveSubscriptions(orgSlug: string) {
  return supabase
    .from("saas_subscriptions")
    .select("*")
    .eq("org_id", orgId)
    .in("status", ["active", "pending"])
    .is("end_date", null)
}

export function getExpiredSubscriptions(orgSlug: string) {
  return supabase
    .from("saas_subscriptions")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "expired")
    .not("end_date", "is", null)
}
```

### Best Practices

**Creating Subscriptions:**
1. Always validate org currency before creation
2. Check for duplicates (same provider+plan, status=active)
3. Use templates from CSV for default values
4. Convert template prices from USD to org currency
5. Include audit trail fields (source_price, exchange_rate_used)

**Editing Subscriptions:**
1. Use edit-version endpoint (NOT direct update)
2. Specify effective_date for when changes take effect
3. Preserve historical data (old version gets end_date)
4. Show version history timeline to users

**Ending Subscriptions:**
1. Soft delete via end_date (NOT hard delete)
2. Allow user to specify end date (default: today)
3. Status changes to `cancelled`
4. Keep in database for historical reporting

**Currency Handling:**
1. Lock currency to org default (disable field in UI)
2. Validate currency at 3 layers (UI, action, API)
3. Always include source_currency and exchange_rate_used
4. Show "prices as of" date for transparency

**Reporting:**
1. Query active + pending for current costs
2. Include expired for historical analysis
3. Sum by provider for cost breakdown
4. Group by billing_cycle for cash flow planning

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

**CRITICAL:** Premium white theme - NO gray backgrounds (`#F5F5F7`, `#FAFAFA`, `#E8E8ED`). Use white surfaces with teal tints (`rgba(0,122,120,0.04)`) or shadows for separation. See `00-requirements-docs/00_CONSOLE_UI_DESIGN_STANDARDS.md` section 1.1 for complete requirements.

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

**Last Updated:** 2025-12-14
