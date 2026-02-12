# Home Page - Requirements

## Overview

Public marketing and landing pages for CloudAct (32 pages total). Includes the home page, pricing, features, documentation, legal, and company pages. All served under the `(landingPages)` route group with a shared PublicLayout wrapper.

## Source Specification

- `00-requirements-specs/04_LANDING_PAGES.md` (v1.2, 2026-02-08)

---

## Functional Requirements

### FR-HP-001: Page Workflow

```
User visits cloudact.ai -> PublicLayout wrapper (layout.tsx + landing.css)
                        -> Landing page content
                        -> /pricing -> Plan comparison -> Signup CTA
                        -> /signup -> Stripe Checkout -> Console dashboard
```

### FR-HP-002: Core Pages

| Route | Purpose |
|-------|---------|
| `/` | Home -- hero, features, social proof (33KB, feature-rich) |
| `/pricing` | Plan comparison (Starter/Professional/Scale) |
| `/features` | Feature showcase |
| `/about` | Company info |
| `/contact` | Contact form |
| `/demo` | Product demo / request demo |

### FR-HP-003: Documentation Pages

| Route | Purpose |
|-------|---------|
| `/docs` | Documentation hub |
| `/docs/*` | Sub-pages for specific documentation topics |

### FR-HP-004: Legal Pages

| Route | Purpose |
|-------|---------|
| `/legal/privacy` | Privacy policy |
| `/legal/terms` | Terms of service |
| `/compliance` | Compliance information |
| `/cookies` | Cookie policy |

### FR-HP-005: Company Pages

| Route | Purpose |
|-------|---------|
| `/careers` | Job listings |
| `/investors` | Investor information |
| `/community` | Community hub |

### FR-HP-006: Resource Pages

| Route | Purpose |
|-------|---------|
| `/help` | Help center |
| `/learning-paths` | Educational content / guides |
| `/integrations` | Public integrations showcase |

---

## Non-Functional Requirements

### NFR-HP-001: Layout Structure

All landing pages use the `(landingPages)` Next.js route group:

```
app/(landingPages)/
├─ layout.tsx              # PublicLayout wrapper (21KB, header + footer)
├─ landing.css             # Custom landing styles (22KB)
├─ _components/            # Shared landing components
├─ page.tsx                # Home (33KB)
├─ pricing/page.tsx
├─ features/page.tsx
├─ about/page.tsx
├─ contact/page.tsx
├─ demo/page.tsx
├─ docs/
│  └─ page.tsx + sub-pages
├─ legal/
│  ├─ privacy/page.tsx
│  └─ terms/page.tsx
├─ compliance/page.tsx
├─ cookies/page.tsx
├─ careers/page.tsx
├─ investors/page.tsx
├─ community/page.tsx
├─ help/page.tsx
├─ learning-paths/page.tsx
└─ integrations/page.tsx
```

### NFR-HP-002: Design Standards

- Enterprise-grade, Apple Health design pattern
- No icons -- text-first approach
- Brand colors: Mint (#90FCA6) primary, Coral (#FF6C5E) accent
- Mint for features, Coral for costs
- Full color/typography specs in `00_CONSOLE_UI_DESIGN_STANDARDS.md`

### NFR-HP-003: Pricing Plans

Three tiers displayed on `/pricing`:

| Plan | Price |
|------|-------|
| Starter | $19/mo |
| Professional | $69/mo |
| Scale | $199/mo |

---

## Key Files

| File | Purpose | Size |
|------|---------|------|
| `app/(landingPages)/layout.tsx` | PublicLayout (header + footer) | 21KB |
| `app/(landingPages)/landing.css` | Custom landing styles | 22KB |
| `app/(landingPages)/page.tsx` | Home page | 33KB |
| `app/(landingPages)/_components/` | Shared landing components | -- |
