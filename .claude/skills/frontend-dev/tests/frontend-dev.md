# Frontend Development - Test Plan

## Overview

Validates Next.js 16 pages, components, server actions, design system compliance, i18n support, and console error audits for the CloudAct frontend.

## Test File

`01-fronted-system/tests/e2e/` (various spec files)

## Test Matrix

### Page Loading (8 tests)

| # | Test | Type | Auth | Expected |
|---|------|------|------|----------|
| 1 | Dashboard page loads | Nav | storageState | `/{orgSlug}/dashboard` renders without error |
| 2 | Cost dashboards page loads | Nav | storageState | `/{orgSlug}/cost-dashboards` renders without error |
| 3 | Integrations page loads | Nav | storageState | `/{orgSlug}/integrations` renders without error |
| 4 | Pipelines page loads | Nav | storageState | `/{orgSlug}/pipelines` renders without error |
| 5 | Settings page loads | Nav | storageState | `/{orgSlug}/settings` renders without error |
| 6 | Login page loads | Nav | None | `/login` renders with h1 and form fields |
| 7 | Signup page loads | Nav | None | `/signup` renders with form fields |
| 8 | Billing page loads | Nav | storageState | `/{orgSlug}/billing` renders plan info |

### Component Rendering (7 tests)

| # | Test | Type | Auth | Expected |
|---|------|------|------|----------|
| 9 | Dashboard sidebar renders | UI | storageState | Sidebar with nav items visible |
| 10 | Loading skeletons display | UI | storageState | Skeleton components visible during async load |
| 11 | ErrorBoundary wraps pages | UI | storageState | No unhandled errors crash the page |
| 12 | StatRow component renders metrics | UI | storageState | Key-value stat pairs displayed in dashboard cards |
| 13 | Data tables render with columns | UI | storageState | Table headers and rows visible |
| 14 | Charts render (Recharts) | UI | storageState | Chart SVG elements present |
| 15 | Mobile navigation works | UI | storageState | Hamburger menu opens navigation |

### Design System Compliance (8 tests)

| # | Test | Type | Auth | Expected |
|---|------|------|------|----------|
| 16 | Mint (#90FCA6) used for primary buttons | Audit | storageState | Primary CTAs use mint background |
| 17 | Coral (#FF6C5E) used for cost/destructive | Audit | storageState | Delete buttons and cost badges use coral |
| 18 | Blue NOT used for buttons/links | Audit | storageState | Zero blue (`#007AFF`) buttons or links |
| 19 | DM Sans font loaded | Audit | storageState | `font-family` includes DM Sans |
| 20 | 8px spacing grid adherence | Audit | storageState | Spacing values are multiples of 8px |
| 21 | `max-w-7xl` on console pages | Audit | storageState | Console content bounded by max-width |
| 22 | Obsidian (#0a0a0b) for auth buttons | Audit | None | Dark buttons on login/signup pages |
| 23 | Provider brand colors in charts | Audit | storageState | GenAI/Cloud charts use correct provider hex |

### Server Actions (5 tests)

| # | Test | Type | Auth | Expected |
|---|------|------|------|----------|
| 24 | Cost data fetch action returns data | E2E | storageState | Server action returns cost records |
| 25 | Hierarchy fetch action returns tree | E2E | storageState | Server action returns hierarchy tree |
| 26 | Settings update action saves | E2E | storageState | Form submit persists changes |
| 27 | API client uses correct headers | Integration | storageState | `X-API-Key` header included |
| 28 | Pipeline client routes to port 8001 | Integration | storageState | Pipeline runs use `PIPELINE_SERVICE_URL` |

### Internationalization (6 tests)

| # | Test | Type | Auth | Expected |
|---|------|------|------|----------|
| 29 | Currency selector shows 50+ currencies | UI | storageState | ISO 4217 currencies listed |
| 30 | Timezone selector shows IANA timezones | UI | storageState | Common timezones listed |
| 31 | Cost formatting respects org currency | UI | storageState | Amounts formatted with correct currency symbol |
| 32 | Fiscal year setting is configurable | UI | storageState | Start month selectable (1, 4, 7, 10) |
| 33 | Date boundaries respect timezone | Functional | storageState | MTD/YTD calculations use org timezone |
| 34 | Exchange rate display (non-USD org) | UI | storageState | FX rate shown for non-USD orgs |

### Console Error Audit (3 tests)

| # | Test | Type | Auth | Expected |
|---|------|------|------|----------|
| 35 | Dashboard pages have zero console errors | Audit | storageState | 0 errors across dashboard, costs, integrations |
| 36 | Auth pages have zero console errors | Audit | None | 0 errors on login, signup, forgot-password |
| 37 | Settings pages have zero console errors | Audit | storageState | 0 errors across all 6 settings pages |

### Accessibility (3 tests)

| # | Test | Type | Auth | Expected |
|---|------|------|------|----------|
| 38 | Skip-to-content link present | UI | storageState | Accessibility link at top of page |
| 39 | Keyboard navigation works | UI | storageState | Tab focus order is logical |
| 40 | Text-first approach (no icon dependency) | Audit | storageState | Nav items readable without icons |

**Total: 40 tests**

## Run Commands

```bash
cd 01-fronted-system

# Run all E2E tests
npx playwright test --reporter=list

# Run specific spec
npx playwright test tests/e2e/dashboard.spec.ts --reporter=list
npx playwright test tests/e2e/costs.spec.ts --reporter=list
npx playwright test tests/e2e/settings.spec.ts --reporter=list

# Run with headed browser
npx playwright test tests/e2e/dashboard.spec.ts --headed

# Run with trace recording
npx playwright test tests/e2e/dashboard.spec.ts --trace on

# Design audit (manual)
# Open browser DevTools > Elements > search for #007AFF (should be charts only)
# Verify DM Sans in Computed > font-family

# Dev server
npm run dev
```

## Pass Criteria

| Criteria | Target |
|----------|--------|
| Page loading tests | 8/8 (100%) |
| Component rendering | 7/7 (100%) |
| Design system compliance | 7/8 (87%+, 8px grid is advisory) |
| Server actions | 5/5 (100%) |
| Console errors | 0 across all pages |
| i18n tests | 5/6 (FX display requires non-USD org) |
| Accessibility | 3/3 (100%) |

## Known Limitations

1. **Design audit**: 8px grid adherence is advisory -- some third-party components may not comply exactly.
2. **Server actions**: Require running API Service (port 8000) and Pipeline Service (port 8001) for full E2E testing.
3. **i18n FX rates**: Exchange rate display test requires an org configured with a non-USD currency.
4. **Chart rendering**: Recharts SVG elements may not be fully capturable in headless mode.
5. **Provider brand colors**: Exact hex matching requires populated cost data with multiple providers.
6. **Loading skeletons**: May flash too quickly to capture in fast headless tests (timing dependent).
7. **Mobile navigation**: Requires viewport resizing in Playwright (`--viewport-size=375,812`).

## Edge Cases Tested

- Page renders without API Service running (graceful error state)
- Empty cost data (dashboard shows zero-state UI)
- Invalid orgSlug in URL (404 or redirect)
- Unauthenticated access to protected pages (redirect to login)
- Multiple currencies in cost data display
- Fiscal year boundary calculations (Apr 1 start vs Jan 1 start)
