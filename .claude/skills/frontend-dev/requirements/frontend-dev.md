# Frontend Development - Requirements

## Overview

UI design standards and component patterns for the CloudAct console. Follows Apple Health design patterns for FinOps with a premium, minimal, enterprise-ready approach. Light-only theme with mint/coral semantic color system.

## Source Specification

`00_CONSOLE_UI_DESIGN_STANDARDS.md` (v4.0 | 2026-02-08)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Frontend Architecture (Next.js 16)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Browser ──▶ Next.js App Router ──▶ Server Components (default)             │
│                   │                       │                                  │
│                   │                       ├─ Data fetching (server-side)     │
│                   │                       ├─ Supabase Auth (JWT validation)  │
│                   │                       └─ API Service calls (port 8000)   │
│                   │                                                          │
│                   └──▶ Client Components (interactive UI)                    │
│                              │                                               │
│                              └─ React state, charts, forms                   │
│                                                                             │
│  Multi-Tenant Routing:                                                      │
│  app/[orgSlug]/                                                             │
│  ├─ dashboard/          # Main dashboard (cost overview)                    │
│  ├─ costs/              # Cloud, GenAI, Subscription cost pages             │
│  ├─ settings/           # Org, personal, billing, hierarchy, invite         │
│  ├─ integrations/       # Provider setup (cloud, genai, saas)               │
│  ├─ analytics/          # Usage analytics                                   │
│  ├─ notifications/      # Alert management                                  │
│  └─ chat/               # AI chat assistant                                 │
│                                                                             │
│  Key Directories:                                                           │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌────────────┐  │
│  │  components/  │  │   actions/    │  │     lib/      │  │ contexts/  │  │
│  │  Design system│  │ Server actions│  │  Utilities    │  │ React ctx  │  │
│  │  ui/, charts/ │  │ stripe.ts    │  │  i18n/, costs/│  │ OrgProvide │  │
│  │  dashboard/   │  │ login.ts     │  │  supabase/    │  │ rs, theme  │  │
│  │  settings/    │  │ members.ts   │  │  chat/        │  │            │  │
│  └───────────────┘  └───────────────┘  └───────────────┘  └────────────┘  │
│                                                                             │
│  Data Flow:                                                                 │
│  Server Action ──▶ Supabase (auth/org data) ──▶ API Service (8000)         │
│       │                                              │                      │
│       └──▶ Response ◀── Polars (BigQuery reads) ◀────┘                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Functional Requirements

### FR-UI-001: Design Philosophy

White surfaces dominate. Mint for features. Coral for costs/alerts. Premium, minimal, Apple-inspired. 8px spacing grid. No icons -- enterprise-ready, text-first approach.

### FR-UI-002: Brand Color System

| Color | Variable | Hex | Use |
|-------|----------|-----|-----|
| Mint | `--cloudact-mint` | `#90FCA6` | Primary buttons, success, features |
| Mint Light | `--cloudact-mint-light` | `#B8FDCA` | Hover states |
| Mint Dark | `--cloudact-mint-dark` | `#6EE890` | Active states |
| Mint Text | `--cloudact-mint-text` | `#0F5132` | Text on mint backgrounds |
| Coral | `--cloudact-coral` | `#FF6C5E` | Costs, warnings, destructive |
| Coral Light | `--cloudact-coral-light` | `#FF8A7F` | Hover states |
| Coral Dark | `--cloudact-coral-dark` | `#E5544A` | Active states |
| Blue | `--cloudact-blue` | `#007AFF` | Charts ONLY (never links/buttons) |
| Obsidian | `--cloudact-obsidian` | `#0a0a0b` | Dark buttons, auth panels |
| Indigo | `--cloudact-indigo` | `#4F46E5` | Premium secondary accent |

### FR-UI-003: Chart Color Palettes

All palettes defined in `lib/costs/design-tokens.ts`:

| Palette | Use |
|---------|-----|
| Default | General charts (Blue, Orange, Green, Coral, Purple, Cyan, Red, Gold) |
| GenAI | GenAI dashboards (provider brand colors) |
| Cloud | Cloud dashboards (GCP, AWS, Azure, Oracle) |
| Subscription | SaaS dashboards (Coral, Slack, Figma, GitHub, Atlassian, Salesforce) |

### FR-UI-004: Provider Colors

Specific hex colors assigned per provider:
- GenAI: OpenAI `#10A37F`, Anthropic `#D97757`, Google `#4285F4`, Gemini `#8E75B2`, DeepSeek `#5865F2`, Azure OpenAI `#0078D4`, AWS Bedrock `#FF9900`
- Cloud: GCP `#4285F4`, AWS `#FF9900`, Azure `#0078D4`, OCI `#F80000`
- SaaS: Slack `#4A154B`, Canva `#00C4CC`, GitHub `#24292F`

### FR-UI-005: Category Colors

| Category | Hex | Use |
|----------|-----|-----|
| GenAI | `#10A37F` | GenAI cost dashboards |
| Cloud | `#4285F4` | Cloud cost dashboards |
| Subscription | `#FF6C5E` | SaaS cost dashboards |

### FR-UI-006: Typography

Font: DM Sans (loaded via `next/font`)

| Class | Size | Weight | Use |
|-------|------|--------|-----|
| `.console-page-title` | 2rem | 700 | Page headers |
| `.console-heading` | 1.375rem | 700 | Section headers |
| `.console-card-title` | 0.9375rem | 600 | Card titles |
| `.console-body` | 0.9375rem | 400 | Body text |
| `.console-small` | 0.8125rem | 400 | Secondary text |
| `.console-metric` | 2.25rem | 600 | Large numbers |

### FR-UI-007: Spacing and Layout

| Standard | Value |
|----------|-------|
| Grid | 8px base (`--space-2`=8px, `--space-4`=16px, `--space-6`=24px, `--space-8`=32px) |
| Border radius | sm=8px, md=12px, lg=16px, xl=20px |
| Max width | `max-w-7xl` for all console pages |

### FR-UI-008: Button Standards

| Class | Background | Text | Use |
|-------|------------|------|-----|
| `.cloudact-btn-primary` | Mint | Black | Console CTAs |
| `.cloudact-btn-dark` | Obsidian | White | Auth flows |
| `.cloudact-btn-destructive` | Coral | White | Delete actions |

### FR-UI-009: Component Patterns

- **ErrorBoundary Wrapping**: Every page and major component section MUST be wrapped with an ErrorBoundary
- **Loading States**: All async operations MUST show a spinner component during loading. No blank screens.
- **Skip-to-Content**: Accessibility link at the top of each page for keyboard navigation
- **StatRow Component**: Premium metric display for dashboard cards (horizontal row of key-value stat pairs)
- **OrgProviders Context**: React context providing current org's active providers to all child components

### FR-UI-010: Key Implementation Files

| File | Purpose |
|------|---------|
| `app/globals.css` | CSS variables, chart colors |
| `app/[orgSlug]/console.css` | Console styles |
| `lib/costs/design-tokens.ts` | Chart palettes, provider colors |
| `components/charts/` | Chart components |
| `components/ui/error-boundary.tsx` | ErrorBoundary component |
| `components/ui/loading-spinner.tsx` | Loading spinner |
| `components/dashboard/stat-row.tsx` | StatRow premium component |
| `contexts/org-providers.tsx` | OrgProviders context |

---

## Non-Functional Requirements

### NFR-UI-001: Color Usage Rules

1. NEVER use blue for buttons/links -- blue is charts only
2. Mint = features, Coral = costs -- consistent semantic meaning
3. Use provider colors for charts -- match brand identity
4. Blue (`#007AFF`) is reserved exclusively for chart data

### NFR-UI-002: Layout Constraints

1. 8px grid -- all spacing MUST be multiples of 8
2. `max-w-7xl` -- all console pages bounded
3. No icons -- enterprise-ready, text-first

### NFR-UI-003: Resilience Patterns

1. ErrorBoundary wrapping on every page and major section
2. Loading spinners for all async operations
3. No blank screens allowed during data fetching

### NFR-UI-004: Accessibility

1. Skip-to-content link on every page
2. Keyboard navigation support
3. Text-first approach (no icon dependency)

---

## Internationalization Requirements

### Source Specification

`00_INTERNATIONALIZATION.md` (v13.0 | 2026-02-08)

### Overview

Org-level internationalization covering currency, timezone, country, and fiscal year. All cost data is displayed in the organization's selected currency with FX conversion from USD base.

### FR-I18N-001: Core Attributes

| Attribute | Standard | Selectable | Notes |
|-----------|----------|------------|-------|
| Currency | ISO 4217 | Yes (signup) | Determines display + FX conversion |
| Timezone | IANA | Yes (signup) | Affects date boundaries, cron schedules |
| Country | ISO 3166-1 | Auto (from currency) | Derived, not user-selected |
| Language | BCP 47 | Fixed (`en`) | English only (20+ languages in model, UI English-only) |
| Fiscal Year | Month number | Yes (settings) | Start month for fiscal year calculations |

### FR-I18N-002: Supported Currencies (50+)

Defined in `SupportedCurrency` enum in `i18n_models.py`:

- **Major:** USD, EUR, GBP, JPY, CHF, CAD, AUD, CNY, INR, SGD, HKD, NZD, SEK, NOK, DKK, KRW, TWD, THB, MYR, PHP, IDR, VND, BRL, MXN, CLP, COP, ARS, PEN, ZAR, NGN, KES, EGP, TRY, PLN, CZK, HUF, RON, BGN, HRK, ISK, RUB, UAH, ILS, PKR
- **Arab:** AED, SAR, QAR, KWD, BHD, OMR

### FR-I18N-003: Supported Timezones

IANA timezone database. Common zones: UTC, America/New_York, America/Chicago, America/Denver, America/Los_Angeles, America/Toronto, America/Sao_Paulo, Europe/London, Europe/Paris, Europe/Berlin, Europe/Moscow, Asia/Tokyo, Asia/Shanghai, Asia/Singapore, Asia/Kolkata, Asia/Dubai, Asia/Seoul, Asia/Hong_Kong, Australia/Sydney, Pacific/Auckland

### FR-I18N-004: Fiscal Year Support

Configured via `fiscal_year_start_month` in `org_profiles`:

| Value | Fiscal Year | Used By |
|-------|-------------|---------|
| 1 | Calendar year (Jan-Dec) | USA, many countries |
| 4 | Apr-Mar | India, UK, Japan |
| 7 | Jul-Jun | Australia |
| 10 | Oct-Sep | US Federal Government |

**Impact areas:**
- Subscription cost amortization: Annual, quarterly, semi-annual costs allocated based on fiscal year boundaries
- Budget periods: Budget tracking aligns to fiscal year
- Reporting periods: Dashboard date ranges respect fiscal year

### FR-I18N-005: FX Conversion Standard

| Property | Implementation |
|----------|----------------|
| Base currency | All internal pricing templates stored in USD |
| Conversion timing | At signup, using current exchange rates |
| Storage fields | `source_currency`, `exchange_rate_used` stored with converted values |
| Display | Cost data always displayed in org's selected currency |
| Backend validation | Currency validators enforce valid ISO 4217 codes |

### FR-I18N-006: Language Support

| Layer | Status |
|-------|--------|
| Backend model | 20+ languages defined |
| Frontend UI | English only |
| Future | i18n framework ready for multi-language rollout |

### NFR-I18N-001: Key Implementation Files

| File | Purpose |
|------|---------|
| `01-fronted-system/lib/i18n/currencies.ts` | Currency config + formatting |
| `01-fronted-system/lib/i18n/timezones.ts` | Timezone config + display names |
| `02-api-service/src/app/models/i18n_models.py` | `SupportedCurrency` enum, validators |
| `02-api-service/src/app/models/org_models.py` | `fiscal_year_start_month` field |

### NFR-I18N-002: Workflow

Signup -> Select Currency + Timezone -> Stored on org record -> FX rates fetched (USD base) -> Templates converted to org currency -> All cost data displayed in org currency -> Fiscal year configured in org_profiles

---

## SDLC

### Development Workflow

```
Create/edit page or component ──▶ npm run dev (localhost:3000)
         │                              │
         ▼                              ▼
  Write Vitest unit tests         Verify in browser
  (components, utilities)         (multi-tenant routing with orgSlug)
         │                              │
         ▼                              ▼
  Write Playwright E2E            tsc --noEmit (type check)
  (full user flows)               npm run build (SSR validation)
         │                              │
         └──────────┬───────────────────┘
                    ▼
              PR ──▶ Cloud Build ──▶ Deploy
```

### Testing Approach

| Type | Tool | Coverage |
|------|------|----------|
| Unit tests | Vitest | Components, utilities, design tokens, hooks |
| E2E tests | Playwright | Full user flows (login, costs, settings, billing) |
| Type checking | `tsc --noEmit` | All TypeScript files, strict mode |
| Build validation | `npm run build` | SSR rendering, server component boundaries |
| Linting | ESLint + Prettier | Code style, import order, unused variables |
| Accessibility | Playwright + axe-core | WCAG 2.1 AA (skip-to-content, labels, keyboard nav) |

### Deployment / CI/CD

- **Local dev**: `cd 01-fronted-system && npm run dev` (port 3000)
- **Stage**: `git push origin main` auto-deploys via `cloudbuild-stage.yaml`
- **Production**: `git tag v*` triggers `cloudbuild-prod.yaml`
- **Build**: Next.js static + SSR build, output deployed to Cloud Run (2 CPU, 8Gi)
- **Environment**: Secrets injected from GCP Secret Manager (Supabase keys, Stripe keys)
