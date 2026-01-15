# Frontend CLAUDE.md

Next.js frontend with Supabase auth and Stripe payments. Port 3000. Connects to api-service (8000) for onboarding and pipeline-service (8001) for execution.

## CRITICAL: Next.js 16 Uses proxy.ts NOT middleware.ts

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  !!! AI AGENTS: DO NOT CREATE middleware.ts !!!                              ║
║                                                                              ║
║  Next.js 16+ uses proxy.ts for route protection                             ║
║  middleware.ts is DEPRECATED and will break the app                         ║
║                                                                              ║
║  - DO NOT rename proxy.ts to middleware.ts                                   ║
║  - DO NOT create a middleware.ts file                                        ║
║  - DO NOT rename the `proxy` function to `middleware`                        ║
║                                                                              ║
║  Route protection: ./proxy.ts (exports `proxy` function)                     ║
║  Session refresh:  ./lib/supabase/middleware.ts (utility module, NOT route)  ║
║                                                                              ║
║  @see https://nextjs.org/docs/messages/middleware-to-proxy                   ║
║  @see https://nextjs.org/docs/app/api-reference/file-conventions/proxy       ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

## PRODUCTION-READY REQUIREMENTS (CRITICAL)

**MANDATORY for all code generation and modifications:**

1. **NO MOCKS OR STUBS** - Never create mock implementations, placeholder code, or TODO stubs unless explicitly requested
2. **NO HALLUCINATED CODE** - Only reference files, functions, and APIs that actually exist in the codebase
3. **WORKING CODE ONLY** - All generated code must be complete, functional, and production-ready
4. **VERIFY BEFORE REFERENCE** - Always read/check files before referencing them in code or documentation
5. **USE EXISTING PATTERNS** - Follow established patterns in the codebase, don't invent new ones
6. **NO NEW DEPENDENCIES** - Don't add new npm packages without explicit approval
7. **ENVIRONMENT FILES** - Use this project's environment files:
   - Local/Testing: `01-fronted-system/.env.local`
   - Staging: `01-fronted-system/.env.stage`
   - Production: `01-fronted-system/.env.prod`
   - **NEVER use `.env`** - always use environment-specific files

**Before writing code:**
- Read existing files to understand current patterns
- Verify imports and dependencies exist
- Check that referenced APIs/endpoints are real
- Ensure component props match actual interfaces

## Development

```bash
npm run dev          # Start (http://localhost:3000) - auto-runs migrations first
npm run build        # Production build
npm run lint         # ESLint
npx vitest           # Tests

# Supabase migrations (uses pooler connection: aws-0-{region}.pooler.supabase.com:6543)
npm run migrate                                  # Run pending migrations manually
cd scripts/supabase_db && ./migrate.sh           # Run pending migrations (bash)
cd scripts/supabase_db && ./migrate.sh --status  # Check status
```

**Auto-Migrations:** Frontend automatically checks and applies pending Supabase migrations on startup (`npm run dev` and `npm start`). See `scripts/AUTO_MIGRATIONS.md` for details.

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

## Environment Configuration

### Environment Files
```
01-fronted-system/
├── .env.local        # Local development
├── .env.test         # Test environment (Cloud Run test)
├── .env.production   # Production (used by Dockerfile for prod builds)
└── .env.prod         # Production reference
```

### Build-time vs Runtime Variables

**NEXT_PUBLIC_* variables** are baked into Docker image at build time:
- Cannot be changed after build
- Must rebuild to update

**Server-side variables** (STRIPE_SECRET_KEY, etc.) are set at Cloud Run runtime:
- Can be updated via `gcloud run services update`
- Secrets come from Secret Manager

### Local Development (.env.local)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://kwroaccbrxppfiysqlzs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_API_SERVICE_URL=http://localhost:8000
NEXT_PUBLIC_PIPELINE_SERVICE_URL=http://localhost:8001
CA_ROOT_API_KEY=your-admin-key-32chars
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEFAULT_TRIAL_DAYS=14
```

### Production Configuration (.env.production)
```bash
# Supabase Production
NEXT_PUBLIC_SUPABASE_URL=https://ovfxswhkkshouhsryzaf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...

# Stripe LIVE Keys (CRITICAL)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...  # From Secret Manager
STRIPE_WEBHOOK_SECRET=whsec_...  # From Secret Manager

# Production Price IDs
NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID=price_1SWJMfDoxINmrJKY7tOoJUIs
NEXT_PUBLIC_STRIPE_PROFESSIONAL_PRICE_ID=price_1SWJOYDoxINmrJKY8jEZwVuU
NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID=price_1SWJP8DoxINmrJKYfg0jmeLv

# Production URLs
NEXT_PUBLIC_API_SERVICE_URL=https://api.cloudact.ai
NEXT_PUBLIC_PIPELINE_SERVICE_URL=https://pipeline.cloudact.ai
NEXT_PUBLIC_APP_URL=https://cloudact.ai
NEXT_PUBLIC_DEFAULT_TRIAL_DAYS=14
```

### Environment Matrix

| Environment | Supabase Project | Stripe Keys | Price IDs |
|-------------|------------------|-------------|-----------|
| local/test | `kwroaccbrxppfiysqlzs` | TEST (`pk_test_*`) | `price_1SWBiD*` |
| stage | `kwroaccbrxppfiysqlzs` | TEST (`pk_test_*`) | `price_1SWBiD*` |
| prod | `ovfxswhkkshouhsryzaf` | LIVE (`pk_live_*`) | `price_1SWJMf*`, etc. |

### Production Stripe Products

| Plan | Price ID | Monthly |
|------|----------|---------|
| Starter | `price_1SWJMfDoxINmrJKY7tOoJUIs` | $19 |
| Professional | `price_1SWJOYDoxINmrJKY8jEZwVuU` | $69 |
| Scale | `price_1SWJP8DoxINmrJKYfg0jmeLv` | $199 |

### Cloud Run Secrets (Required for Frontend)

These secrets must exist in Secret Manager for frontend deployment:
- `ca-root-api-key-{env}` - System root API key
- `stripe-secret-key-{env}` - Stripe secret key (sk_live_*)
- `stripe-webhook-secret-{env}` - Stripe webhook signing secret
- `supabase-service-role-key-{env}` - Supabase service role JWT

**Validate before deployment:**
```bash
cd 04-inra-cicd-automation/CICD
./secrets/validate-env.sh prod frontend
./secrets/verify-secrets.sh prod
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
└── subscription-templates.csv
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

### Brand Colors (Updated 2025-12-27)

| Color | Hex | Usage |
|-------|-----|-------|
| **Mint** | `#90FCA6` | Primary buttons (console), success states, active indicators |
| **Mint Light** | `#B8FDCA` | Hover states, light backgrounds |
| **Mint Dark** | `#6EE890` | Pressed states, borders |
| **Coral** | `#FF6C5E` | Warnings, destructive actions, cost indicators |
| **Obsidian** | `#0a0a0b` | Premium dark buttons (auth flows), dark panels |
| **Black/Slate** | `#1C1C1E` | Links, text, secondary actions |

**Typography:** DM Sans | **Spacing:** 8px grid

### Button System

| Button Class | Background | Text | Use Case |
|--------------|------------|------|----------|
| `.cloudact-btn-primary` | Mint `#90FCA6` | Black | Console CTAs, dashboard actions |
| `.cloudact-btn-dark` | Obsidian `#0a0a0b` | White | Auth flows, premium contexts, high-contrast |
| `.cloudact-btn-secondary` | White | Black/Slate | Secondary actions |
| `.cloudact-btn-destructive` | Coral `#FF6C5E` | White | Delete, cancel, warnings |
| `.cloudact-btn-outline` | Transparent | Mint Dark | Tertiary actions |
| `.cloudact-btn-ghost` | Transparent | Black/Slate | Minimal actions |

**Blue Usage:** Charts and data visualization icons ONLY - never for links or buttons.

**When to use Dark vs Mint:**
- **Dark (`.cloudact-btn-dark`):** Auth pages, premium split-screen layouts, contexts with dark left panels
- **Mint (`.cloudact-btn-primary`):** Console/dashboard, general CTAs, success confirmations

### Color Usage Rules

```css
/* Primary buttons - BLACK text on mint */
.cloudact-btn-primary { background: #90FCA6; color: #000000; }

/* Dark/Premium buttons - WHITE text on obsidian */
.cloudact-btn-dark { background: #0a0a0b; color: #FFFFFF; }

/* Links use neutral black/slate (NOT blue) */
a { color: #1C1C1E; }

/* Text on mint backgrounds */
.text-on-mint { color: #1a7a3a; } /* Dark green for readability */

/* Success states */
.success { background: #90FCA6/10; border-color: #90FCA6; color: #1a7a3a; }

/* Destructive/warning */
.destructive { background: #FF6C5E; color: #FFFFFF; }
```

### CSS Variables (in landing.css, console.css, premium.css)

```css
:root {
  --cloudact-mint: #90FCA6;
  --cloudact-mint-light: #B8FDCA;
  --cloudact-mint-dark: #6EE890;
  --cloudact-coral: #FF6C5E;
  --cloudact-blue: #007AFF; /* Legacy - avoid using in console */

  /* Legacy aliases for backward compatibility */
  --cloudact-teal: #90FCA6;
  --cloudact-coral-legacy: #FF6C5E;
}
```

**CSS Files:** `globals.css`, `console.css`, `landing.css`, `premium.css`

**Premium theme:** White surfaces, mint tints - NO gray backgrounds

### Layout System (Apple Health / Fitness+ Pattern) - Updated 2025-12-30

**Design Philosophy:** CloudAct follows the Apple Health / Apple Fitness+ dashboard pattern:
- Content containers with bounded max-width (not full-bleed)
- Centered layout with premium breathing room
- Cards that don't stretch infinitely on ultra-wide monitors
- White space as a design element on large screens

#### Container Widths (Tailwind Classes)

| Class | Width | Usage |
|-------|-------|-------|
| `max-w-7xl` | **1280px** | **Console pages** - Dashboard, Analytics, Pipelines, Settings, Integrations |
| `max-w-3xl` | 768px | Focused forms (subscription add, custom forms) |
| `max-w-2xl` | 672px | Error pages, centered messages |
| `max-w-xl` | 576px | Modals, dialogs |

**Standard Console Page Container:**
```tsx
<div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 lg:space-y-8">
  {/* Page content */}
</div>
```

#### Spacing Scale (8px Grid)

| Variable | Value | Usage |
|----------|-------|-------|
| `space-1` | 4px | Tight spacing, icon gaps |
| `space-2` | 8px | Inline elements, small gaps |
| `space-3` | 12px | Card padding (mobile), list items |
| `space-4` | 16px | Standard gaps, section margins |
| `space-5` | 20px | Card padding (desktop) |
| `space-6` | 24px | Page padding, section gaps |
| `space-8` | 32px | Large section margins |
| `space-10` | 40px | Hero sections |
| `space-12` | 48px | Page top/bottom padding |

**Responsive Spacing Pattern:**
```tsx
className="space-y-4 sm:space-y-6 lg:space-y-8"  // Vertical
className="gap-3 sm:gap-4"                        // Grid gaps
className="p-3 sm:p-5"                            // Card padding
```

#### Border Radius Scale

| Variable | Value | Usage |
|----------|-------|-------|
| `radius-xs` | 4px | Badges, small elements |
| `radius-sm` | 8px | Buttons, inputs |
| `radius-md` | 12px | Cards (mobile) |
| `radius-lg` | 16px | Cards (desktop) |
| `radius-xl` | 20px | Metric cards, feature cards |
| `radius-2xl` | 24px | Hero sections, large panels |
| `radius-full` | 9999px | Pills, avatars, circular buttons |

**Responsive Radius Pattern:**
```tsx
className="rounded-xl sm:rounded-2xl"  // Cards
className="rounded-lg sm:rounded-xl"   // Buttons
```

#### Shadow System (Apple-style Subtle Shadows)

| Variable | Value | Usage |
|----------|-------|-------|
| `shadow-xs` | `0 1px 2px rgba(0,0,0,0.03)` | Subtle lift |
| `shadow-sm` | `0 1px 3px rgba(0,0,0,0.04)` | Cards at rest |
| `shadow-md` | `0 4px 12px rgba(0,0,0,0.06)` | Cards on hover |
| `shadow-lg` | `0 8px 24px rgba(0,0,0,0.08)` | Elevated elements |
| `shadow-xl` | `0 16px 48px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `shadow-glow-mint` | `0 0 40px rgba(144,252,166,0.25)` | Mint hover glow |
| `shadow-glow-coral` | `0 0 40px rgba(255,108,94,0.15)` | Coral hover glow |

#### Typography Scale

| Variable | Size | Usage |
|----------|------|-------|
| `text-xs` | 11px | Micro labels, badges |
| `text-sm` | 13px | Secondary text, captions |
| `text-base` | 15px | Body text, inputs |
| `text-lg` | 18px | Emphasized body |
| `text-xl` | 20px | Section titles |
| `text-2xl` | 24px | Card titles |
| `text-3xl` | 30px | Page subtitles |
| `text-4xl` | 36px | Page titles |
| `text-5xl` | 48px | Hero headlines |

**Font Weights:** 400 (normal), 500 (medium), 600 (semibold), 700 (bold)

**Letter Spacing:** `-0.03em` (tight headings), `-0.02em` (subheadings), `0` (body)

#### Grid System

**Metric Cards (4-column on desktop):**
```tsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
```

**Two-Column Layout (2:1 ratio):**
```tsx
<div className="grid gap-6 lg:grid-cols-3">
  <div className="lg:col-span-2">{/* Main content */}</div>
  <div className="lg:col-span-1">{/* Sidebar */}</div>
</div>
```

**Quick Actions (3-column):**
```tsx
<div className="grid gap-4 sm:grid-cols-3">
```

#### Mobile Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| (default) | < 640px | Mobile-first base styles |
| `sm:` | ≥ 640px | Large phones, small tablets |
| `md:` | ≥ 768px | Tablets |
| `lg:` | ≥ 1024px | Desktop |
| `xl:` | ≥ 1280px | Large desktop |
| `2xl:` | ≥ 1536px | Ultra-wide |

**Touch Targets:** Minimum 44px height for buttons/interactive elements on mobile.

#### Page Template Classes

```css
/* Page container with gradient */
.page-container {
  min-height: 100%;
  padding: var(--space-6);
  background: var(--surface-primary);
  background-image: radial-gradient(ellipse 120% 40% at 50% -10%, rgba(144, 252, 166, 0.08) 0%, transparent 60%);
}

/* Premium card with hover lift */
.premium-card {
  background: var(--surface-primary);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-premium-sm);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.premium-card:hover {
  box-shadow: var(--shadow-premium-md);
  transform: translateY(-2px);
  border-color: var(--border-mint);
}
```

### Auth Pages (FINALIZED - 2025-12-27)

**Status:** LOCKED - No changes without explicit user permission.

**Files:**
- `app/login/page.tsx` - Login page
- `app/signup/page.tsx` - Signup page (2-step flow)
- `components/auth/auth-layout.tsx` - Premium split-screen layout

**Design Decisions (Final):**
- Split-screen layout: Left panel (obsidian with animated orbs), Right panel (white form)
- **Mint buttons** for all primary CTAs (NOT dark/obsidian)
- 2-step signup: Step 1 (Account) → Step 2 (Organization)
- Mobile responsive with proper breakpoints (sm/lg)
- Dark mode ready (activates only when user enables)
- Form inputs: 48px mobile, 52px desktop, rounded-xl/2xl

**Key Elements:**
- Animated gradient orbs (mint, coral) with float animations
- Stats section: $2.4M+, 340+ teams, 99.9% uptime
- Feature cards with icons
- Trust badge with avatar stack
- Premium entrance animations

**DO NOT CHANGE** without user permission:
- Button colors (mint primary)
- Layout structure (split-screen)
- Form field styling
- Animation effects
- Mobile breakpoints

### Sidebar Navigation

**Two-zone layout with accordion behavior:**
- **Main Content (scrollable):**
  - Account Summary (Dashboard)
  - Cost Analytics (Overview, GenAI, Cloud, Subscription)
  - Pipelines (Subscription Runs, Cloud Runs, GenAI Runs)
  - Integrations (Cloud Providers, GenAI Providers, Subscriptions)
  - Org Settings (Organization, Hierarchy, Usage & Quotas, Team Members, Billing)
- **Footer:** User Profile (clickable → /settings/personal) → Get Help → Sign Out

**Accordion:** Only ONE section open at a time. Auto-expands based on route.

**User Profile:** Clicking the user avatar in footer navigates to `/settings/personal` (Profile page).

**Coral highlights (mobile):** `hover:bg-[#FF6C5E]/10 hover:text-[#FF6C5E]` for menu items.

**Key Components:**
- `components/dashboard-sidebar.tsx` - Desktop sidebar
- `components/mobile-nav.tsx` - Mobile navigation overlay
- `components/mobile-header.tsx` - Mobile header with hamburger

## Supabase Tables

- `organizations` - Org metadata + locale + backend columns
- `organization_members` - Team membership
- `profiles` - User profiles
- `invites` - Team invites
- `subscriptions` - Subscription tracking

**Backend Columns:** `backend_onboarded`, `backend_api_key_fingerprint`, `integration_*_status`

## Organizational Hierarchy

**Structure:** Org → Department → Project → Team (strict parent-child)

**BigQuery Table:** `org_hierarchy` in each org's dataset

**Frontend:** `app/[orgSlug]/settings/hierarchy/page.tsx`

**Actions:** `actions/hierarchy.ts`
- `getHierarchy(orgSlug)` - List all entities
- `getHierarchyTree(orgSlug)` - Get tree structure
- `createDepartment/Project/Team(orgSlug, data)`
- `updateEntity(orgSlug, entityType, entityId, data)`
- `deleteEntity(orgSlug, entityType, entityId)` - Blocks if children exist
- `importHierarchy(orgSlug, csvData)` - Bulk import
- `exportHierarchy(orgSlug)` - CSV export

**CSV Format:**
```csv
entity_type,entity_id,entity_name,parent_id,owner_id,owner_name,owner_email,description
department,DEPT-001,Engineering,,,John Doe,john@example.com,Engineering department
project,PROJ-001,Platform,DEPT-001,,Jane Smith,jane@example.com,Platform project
team,TEAM-001,Backend,PROJ-001,,Bob Wilson,bob@example.com,Backend team
```

**Default Seeding:** New orgs get default hierarchy (2 depts, 3 projects, 4 teams) during onboarding.

**Subscription Form UI:** `app/[orgSlug]/integrations/subscriptions/[provider]/page.tsx`
- Single N-level hierarchy dropdown (any node in tree)
- Uses `loadHierarchy()`, `handleHierarchyChange()`

**Subscription Integration (N-Level v14.0):** Each subscription can be assigned to any hierarchy entity via:
- `hierarchy_entity_id`, `hierarchy_entity_name` - Selected entity
- `hierarchy_level_code` - Entity's level (e.g., department, project, team)
- `hierarchy_path` - Materialized path (e.g., /DEPT-001/PROJ-001/TEAM-001)
- `hierarchy_path_names` - Human-readable path (e.g., Engineering > Platform > Backend)

**Cost Allocation Flow:**
```
subscription_plans (N-level hierarchy fields)
    ↓ sp_subscription_2_calculate_daily_costs
subscription_plan_costs_daily (with hierarchy)
    ↓ sp_subscription_3_convert_to_focus
cost_data_standard_1_3 (x_hierarchy_* extension fields)
```

## Supabase Configuration

**Important Production Settings:**
- **Email confirmation:** DISABLED (for immediate sign-in after signup)
- **If enabled:** Update signup flow to handle email confirmation

**Test vs Production:**
| Setting | Test | Production |
|---------|------|------------|
| Project | `kwroaccbrxppfiysqlzs` | `ovfxswhkkshouhsryzaf` |
| Email confirmation | Disabled | Disabled |
| Row Level Security | Enabled | Enabled |

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Signup 400 error | Email confirmation enabled | Disable in Supabase Auth settings |
| Stripe checkout fails | Missing STRIPE_SECRET_KEY | Run secrets setup script |
| Plans not loading | Wrong price IDs | Verify LIVE price IDs in .env.production |
| Build fails | Missing env vars | Check .env.production has all NEXT_PUBLIC_* |

## Current Version

| Environment | Version | URL |
|-------------|---------|-----|
| Production | v4.1.0 | https://cloudact.ai |
| Stage | main | Auto-deploy |
| Local | dev | http://localhost:3000 |

---
**Last Updated:** 2026-01-15
