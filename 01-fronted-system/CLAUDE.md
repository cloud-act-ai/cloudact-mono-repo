# Frontend CLAUDE.md

Next.js frontend with Supabase auth and Stripe payments. Port 3000. Connects to api-service (8000) for onboarding and pipeline-service (8001) for execution.

## Development

```bash
npm run dev          # Start (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npx vitest           # Tests

# Database migrations
cd scripts/supabase_db && ./migrate.sh
```

## User Flow

```
/signup → /onboarding/billing → Stripe Checkout → /onboarding/success → /{orgSlug}/dashboard
```

**Important:** All company/locale info collected at signup, stored in `user_metadata`, applied after Stripe checkout.

## Service Integration

| Operation | Port | Header |
|-----------|------|--------|
| Bootstrap, Onboarding | 8000 | `X-CA-Root-Key` |
| Integration setup | 8001 | `X-API-Key` |
| Pipeline execution | 8001 | `X-API-Key` |
| SaaS subscription CRUD | 8000 | `X-API-Key` |

## DO's and DON'Ts

**DO:** Store API keys in `user.user_metadata.org_api_keys[org_slug]`, validate inputs, rate limit operations

**DON'T:** Expose CA_ROOT_API_KEY client-side, create org before Stripe checkout, skip input validation

## Environment (.env.local)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_API_SERVICE_URL=http://localhost:8000
NEXT_PUBLIC_PIPELINE_SERVICE_URL=http://localhost:8001
CA_ROOT_API_KEY=your-admin-key-32chars
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Route Groups

**`app/(landingPages)/`** - Public marketing (no auth)
- `/`, `/features`, `/pricing`, `/about`, `/contact`, `/privacy`, `/terms`

**`app/[orgSlug]/`** - Console (authenticated)
- `dashboard/`, `analytics/`, `billing/`, `pipelines/`, `settings/`

## Key Directories

```
actions/                    # Server actions
├── backend-onboarding.ts   # API key management
├── integrations.ts         # LLM/Cloud setup
├── pipelines.ts            # Pipeline execution
├── subscription-providers.ts # SaaS CRUD
├── stripe.ts               # Stripe checkout
└── organization.ts         # Org creation

lib/
├── api/backend.ts          # Backend API client
├── auth.ts                 # Auth guards
├── i18n/                   # Currency, timezone formatting
├── seed/csv-loader.ts      # CSV seed data
└── currency/exchange-rates.ts

data/seed/
├── exchange-rates.csv      # 16 currencies
└── saas-subscription-templates.csv
```

## Authentication Guards

```typescript
await requireAuth()
await requireOrgMembership(orgSlug)
await requireActiveSubscription(orgSlug)
await requireRole(orgSlug, "admin")
await requireOwner(orgSlug)
```

## i18n

**Currencies (16):** USD, EUR, GBP, INR, JPY, CNY, AUD, CAD, SGD, AED + 6 more

**Timezones (15):** America/*, Europe/*, Asia/*, Australia/Sydney

```typescript
import { formatCurrency, formatDateTime, formatDateOnly, convertFromUSD } from "@/lib/i18n"

formatCurrency(100, "INR")        // "₹100.00"
formatDateTime(date, "Asia/Kolkata")  // "Dec 13, 2025, 4:00 PM IST"
convertFromUSD(25, "INR")         // 2078.00
```

## Backend Integration

```typescript
// Get API key
const apiKey = await getOrgApiKeySecure(orgSlug)

// Setup integration
await setupIntegration({ orgSlug, provider: "openai", credential: "sk-..." })

// SaaS subscriptions
await createSaaSSubscription(orgSlug, "slack", { plan_name: "slack_pro", ... })
await editPlanWithVersion(orgSlug, "slack", subscriptionId, effectiveDate, updates)

// Run pipeline
await runGcpCostBillingPipeline(orgSlug, "2025-12-08")
```

## Stripe Integration

```typescript
// Get plans from Stripe
const { data: plans } = await getStripePlans()

// Create checkout
const { sessionId } = await createCheckoutSession(priceId, orgSlug)

// Change plan
await changeSubscriptionPlan(orgSlug, newPriceId)

// Billing portal
const { url } = await createBillingPortalSession(orgSlug)
```

**Webhooks:** `app/api/webhooks/stripe/route.ts`
- `checkout.session.completed` → Activate subscription
- `customer.subscription.updated` → Update plan/status
- `invoice.payment_failed` → Set `past_due`

## Security Patterns

```typescript
// Input validation
const isValidOrgSlug = (slug: string) => /^[a-zA-Z0-9_-]{2,100}$/.test(slug)
const sanitizeOrgName = (name: string) => name.replace(/<[^>]*>/g, "").slice(0, 100)

// Rate limiting
Checkout: 1 per 30sec | Invites: 10 per hour
```

**XSS:** Use `escapeHtml()` from `lib/email.ts`

**Pagination:** Always `.limit(100)` for members, `.limit(50)` for invites

## Design System

**Brand:** Teal (#007A78) + Coral (#FF6E50) | Font: DM Sans | Spacing: 8px

**CSS Files:** `globals.css`, `console.css`, `landing.css`

**Premium theme:** White surfaces, teal tints - NO gray backgrounds

### Sidebar Navigation (Updated 2025-12-24)

**Two-zone layout with accordion behavior:**
- Main Content: Dashboards, Pipelines (scrollable)
- Footer: User Profile → Integrations → Settings → Get Help → Sign Out

**Accordion:** Only ONE section open at a time. Auto-expands based on route.

**Coral highlights:** `hover:bg-[#FF6E50]/10 hover:text-[#FF6E50]` for menu items.

**Key Components:**
- `components/dashboard-sidebar.tsx` - Desktop sidebar
- `components/mobile-nav.tsx` - Mobile navigation overlay
- `components/mobile-header.tsx` - Mobile header with hamburger

## Supabase Tables

- `organizations` - Org metadata + locale + backend columns
- `organization_members` - Team membership
- `profiles` - User profiles
- `invites` - Team invites
- `saas_subscriptions` - SaaS tracking

**Backend Columns:** `backend_onboarded`, `backend_api_key_fingerprint`, `integration_*_status`

---
**Last Updated:** 2025-12-24
