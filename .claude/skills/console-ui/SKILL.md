---
name: console-ui
description: |
  CloudAct console UI components and layouts. Sidebar, cards, tables, feedback, page templates, dashboard layouts.
  Use when: building console pages, creating components, implementing sidebar navigation, designing dashboard layouts,
  adding metric cards, tables, empty states, or following CloudAct's premium enterprise UI patterns.
---

# Console UI - Dashboard Components & Layouts

Premium enterprise console interface. Apple Health / Fitness+ inspired. Subtle depth, bounded content. Theme-ready via CSS variables (`--surface-primary`, `--text-primary`, `--border-subtle`). Mobile responsive.

## Trigger

Use when: building console pages, creating components, implementing sidebar, designing dashboard layouts, adding cards/tables/feedback.

```
/console-ui                    # Full component guide
/console-ui sidebar            # Sidebar patterns
/console-ui page               # Create a new console page
/console-ui card               # Card component patterns
/console-ui table              # Table component patterns
/console-ui form               # Form layout patterns
/console-ui feedback           # Empty states, loading, toasts
/console-ui mobile             # Mobile responsive patterns
```

## Key Locations

| File | Purpose |
|------|---------|
| `01-fronted-system/components/dashboard-sidebar.tsx` | Desktop sidebar (independent collapse, Plus/Minus) |
| `01-fronted-system/components/mobile-nav.tsx` | Mobile navigation overlay (280px slide-in panel) |
| `01-fronted-system/components/mobile-header.tsx` | Mobile header bar (hamburger + chat icon) |
| `01-fronted-system/components/ui/sidebar.tsx` | shadcn sidebar primitives |
| `01-fronted-system/components/ui/` | Base UI primitives (44 files: button, input, select, dialog, etc.) |
| `01-fronted-system/components/ui/premium-card.tsx` | PremiumCard, MetricCard components |
| `01-fronted-system/components/ui/empty-state.tsx` | EmptyState component |
| `01-fronted-system/components/costs/` | Cost display components (metric cards, filters) |
| `01-fronted-system/components/premium/` | Premium page components (data-table, page-header, section) |
| `01-fronted-system/components/charts/` | Chart components (see `/charts` skill) |
| `01-fronted-system/components/layout/premium-page-shell.tsx` | Page layout shell |
| `01-fronted-system/components/dashboard/` | Dashboard-specific cards (integrations, quick actions) |
| `01-fronted-system/app/[orgSlug]/layout.tsx` | Org layout with sidebar |
| `01-fronted-system/app/[orgSlug]/console.css` | Console styles (1962 lines) |
| `01-fronted-system/contexts/cost-data-context.tsx` | Unified cost data context |

---

## Design Philosophy

Enterprise-grade B2B SaaS. Every screen must convey trust and precision.

| Principle | Implementation |
|-----------|----------------|
| **Visual Hierarchy** | Clear primary/secondary/tertiary distinction |
| **Data Density** | Meaningful data, not decorative fluff |
| **Precision** | Aligned grids, consistent spacing |
| **Restraint** | Minimal color, let data speak |
| **Clarity** | Every element has purpose |
| **Light-Only** | No dark mode. White surfaces only. |

---

## Sidebar

### Architecture

Flat grouped navigation matching mobile nav style. Independent collapse (all sections expanded by default). Plus/Minus toggles. Mint `bg-[#90FCA6]/15` active state with green icons.

```
┌─────────────────────┐
│ [Logo] OrgName   [◀] │  ← Brand header + collapse toggle
├─────────────────────┤
│ AI CHAT          [−] │  ← Section 1 (always first)
│   Chat [Beta]        │
│   Chat Settings      │
│ ACCOUNT SUMMARY  [−] │  ← All sections expanded by default
│   Dashboard          │
│ COST ANALYTICS   [−] │  ← Independent collapse (Set-based)
│   Overview           │
│   GenAI              │
│   Cloud              │
│   Subscription       │
│ PIPELINES        [−] │
│   Subscription Runs  │
│   Cloud Runs         │
│   GenAI Runs         │
│ INTEGRATIONS     [−] │
│   Cloud Providers    │
│   GenAI Providers    │
│   Subscriptions      │
│ NOTIFICATIONS    [−] │
│   Overview           │
│   Channels, Alerts...│
│ ORG SETTINGS     [−] │
│   Organization       │
│   Hierarchy          │
│   Usage & Quotas     │
│   Team Members       │
│   Billing            │
├─────────────────────┤
│ [Avatar] User Name   │  ← Footer (fixed)
│ Get Help │ Sign Out  │
└─────────────────────┘
```

### Sidebar Dimensions

| Property | Desktop | Mobile |
|----------|---------|--------|
| Width (expanded) | `16rem` (256px) | `280px` |
| Width (collapsed) | `3rem` (48px) | Hidden |
| Behavior | Collapsible rail | Sheet overlay |
| Toggle shortcut | `⌘B` | Hamburger button |
| Cookie | `sidebar_state` (7 day TTL) | N/A |

### Key Sidebar Features

- **Independent collapse:** All sections open/close independently (Set-based state)
- **All expanded by default:** Every section starts expanded (matches mobile nav)
- **Plus/Minus toggles:** `+` to expand, `−` to collapse (not chevrons)
- **Section labels:** `text-[11px] font-semibold tracking-wide` uppercase labels
- **Active state:** `bg-[#90FCA6]/15` mint background + `font-semibold` + green icons `[&_svg]:text-[#16a34a]`
- **Item style:** `min-h-[42px] rounded-lg text-[13px]` flat buttons
- **Auto-expand:** Section auto-expands based on current route (adds to Set)
- **Collapse rail:** Desktop collapses to icon-only rail (48px)
- **Mobile nav:** Separate `MobileNav` component with identical section order and style
- **Footer fixed:** User profile, help, sign out always visible

### Desktop ↔ Mobile Consistency

Desktop sidebar and mobile nav **MUST** share:

| Property | Value |
|----------|-------|
| Section order | Chat → Account Summary → Cost Analytics → Pipelines → Integrations → Notifications → Settings |
| Toggle icons | Plus/Minus |
| Label style | `text-[11px] font-semibold text-slate-400 tracking-wide` (11px for labels only) |
| Item height | `min-h-[42px]` |
| Active bg | `bg-[#90FCA6]/15` |
| Active icon | `text-[#16a34a]` (green-600) |
| Item text | `text-sm text-slate-600` (14px — industry standard: Notion, GitHub, Stripe) |
| Footer name | `text-sm font-semibold` (14px) |
| Footer email | `text-xs text-slate-400` (12px minimum) |
| Border radius | `rounded-lg` |
| Collapse state | Independent (Set-based, all expanded by default) |

### Sidebar Component Usage

```tsx
// app/[orgSlug]/layout.tsx
import { SidebarProvider } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard-sidebar"

export default function OrgLayout({ children, params }) {
  return (
    <SidebarProvider>
      <DashboardSidebar orgSlug={params.orgSlug} />
      <main className="console-main-gradient flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        {children}
      </main>
    </SidebarProvider>
  )
}
```

### Navigation Sections (in order)

| # | Section | Items |
|---|---------|-------|
| 1 | **AI Chat** | Chat [Beta], Chat Settings |
| 2 | Account Summary | Dashboard |
| 3 | Cost Analytics | Overview, GenAI, Cloud, Subscription |
| 4 | Pipelines | Subscription Runs, Cloud Runs, GenAI Runs |
| 5 | Integrations | Cloud Providers, GenAI Providers, Subscriptions |
| 6 | Notifications | Overview, Channels, Alert Rules, Summaries, History |
| 7 | Org Settings | Organization*, Hierarchy*, Usage & Quotas, Team Members, Billing* |

\* Owner-only items

---

## Component Organization

Components are organized by **feature domain**, not by type.

```
components/
├── ui/                    # 44 shadcn primitives (button, input, select, dialog, etc.)
│   ├── premium-card.tsx   #   PremiumCard, MetricCard wrapper
│   ├── empty-state.tsx    #   EmptyState component
│   ├── card-skeleton.tsx  #   Card loading skeleton
│   ├── table-skeleton.tsx #   Table loading skeleton
│   ├── chart-skeleton.tsx #   Chart loading skeleton
│   └── alert-dialog.tsx   #   Confirmation dialogs
├── charts/                # Recharts library (see /charts skill)
├── costs/                 # Cost-specific components
│   ├── cost-metric-card.tsx  # MTD, DailyRate, Forecast, YTD variants
│   ├── cost-filters.tsx      # TimeRangeFilter, CostFilters
│   └── ...                   # 8+ cost display components
├── premium/               # Premium page components
│   ├── data-table.tsx     #   TanStack Table with sorting/filtering
│   ├── page-header.tsx    #   Standard page header
│   └── section.tsx        #   Page section wrapper
├── dashboard/             # Dashboard-specific
│   ├── IntegrationsCard.tsx
│   └── QuickActionsCard.tsx
├── hierarchy/             # Org hierarchy
│   └── cascading-hierarchy-selector.tsx
├── cloud/                 # Cloud provider templates
│   └── provider-page-template.tsx
├── genai/                 # GenAI pricing/templates
├── layout/                # Page shells
│   └── premium-page-shell.tsx
├── auth/                  # Auth components
├── chat/                  # Chat UI components
├── pipelines/             # Pipeline components
├── settings/              # Settings page components
├── landing/               # Landing page components
└── export-import/         # Export/import tools
```

**RULE:** Before creating ANY new component, check if a reusable version exists. NEVER duplicate component code across pages.

---

## Key Components (Actual Paths)

### Cards

| Component | Location | Usage |
|-----------|----------|-------|
| `PremiumCard` | `ui/premium-card.tsx` | Base card wrapper with header/footer |
| `CostMetricCard` | `costs/cost-metric-card.tsx` | KPI cards (MTD, DailyRate, Forecast, YTD) |
| `IntegrationsCard` | `dashboard/IntegrationsCard.tsx` | Dashboard integrations summary |
| `QuickActionsCard` | `dashboard/QuickActionsCard.tsx` | Dashboard quick actions |

### Tables

| Component | Location | Usage |
|-----------|----------|-------|
| `DataTable` | `premium/data-table.tsx` | Generic TanStack Table with sorting/filtering |
| `DataTable` | `charts/shared/data-table.tsx` | Chart-context data table |
| `CostDataTable` | `charts/cost/data-table.tsx` | Cost-specific data table |

### Feedback

| Component | Location | Usage |
|-----------|----------|-------|
| `EmptyState` | `ui/empty-state.tsx` | No data placeholder |
| `CardSkeleton` | `ui/card-skeleton.tsx` | Card loading skeleton |
| `TableSkeleton` | `ui/table-skeleton.tsx` | Table loading skeleton |
| `ChartSkeleton` | `ui/chart-skeleton.tsx` | Chart loading skeleton |
| `AlertDialog` | `ui/alert-dialog.tsx` | Confirmation dialogs |

### Filters

| Component | Location | Usage |
|-----------|----------|-------|
| `TimeRangeFilter` | `costs/cost-filters.tsx` | Time range dropdown |
| `CostFilters` | `costs/cost-filters.tsx` | Category/provider/hierarchy filters |

---

## Page Template

```tsx
export default function ConsolePage() {
  return (
    <div className="min-h-full bg-white">
      {/* Subtle top gradient glow */}
      <div className="absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-[#90FCA6]/5 via-[#90FCA6]/2 to-transparent pointer-events-none" />

      {/* Status Banners */}
      <OnboardingBanner />
      <BillingAlertBanner />

      {/* Main Content */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
        {/* Page Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="console-page-title">Page Title</h1>
          <p className="mt-1 console-body text-gray-500">Brief description</p>
        </div>

        {/* Page Content */}
        <div className="space-y-6 sm:space-y-8">
          {/* Content sections */}
        </div>
      </div>
    </div>
  );
}
```

---

## Dashboard Layouts

### Main Dashboard (`/[orgSlug]/dashboard`)

```
┌──────────────────────────────────────────────────────────────────┐
│ Welcome Message + Time Range Selector                            │
├──────────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                 │
│ │ Total   │ │ GenAI   │ │ Cloud   │ │ SaaS    │  MetricGrid     │
│ │ Spend   │ │ Spend   │ │ Spend   │ │ Spend   │                 │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘                 │
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────┐ ┌────────────────────────────────┐│
│ │     CostTrendChart         │ │   CategoryRingChart            ││
│ │     (30-day with zoom)     │ │   (Donut breakdown)            ││
│ └────────────────────────────┘ └────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────┐ ┌────────────────────────────────┐│
│ │   ProviderBreakdown        │ │   Quick Actions                ││
│ └────────────────────────────┘ └────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

### Cost Overview (`/[orgSlug]/cost-dashboards/overview`)

```
┌──────────────────────────────────────────────────────────────────┐
│ Cost Analytics Header + Time Range + Filters                     │
├──────────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  MetricGrid    │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘                 │
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────────┐│
│ │          CostTrendChart (Full width, with zoom)                ││
│ └────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────┐ ┌────────────────────────────────┐│
│ │   CategoryBreakdown        │ │   ProviderBreakdown            ││
│ └────────────────────────────┘ └────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

### Category Pages (GenAI/Cloud/Subscription)

```
┌──────────────────────────────────────────────────────────────────┐
│ Category Header + Time Range + Filters                           │
├──────────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  Metrics       │
│ │ Total   │ │ Daily   │ │ Monthly │ │ YoY     │                 │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘                 │
├──────────────────────────────────────────────────────────────────┤
│ │      CostTrendChart (category filtered, with zoom)             │
├──────────────────────────────────────────────────────────────────┤
│ │      ProviderBreakdown (category filtered)                     │
└──────────────────────────────────────────────────────────────────┘
```

---

## Card Styles

### Card Base (from console.css)
```
Background: bg-white
Border radius: 20px (health-card, metric-card, stat-card)
Shadow: var(--shadow-premium-sm) → var(--shadow-premium-md) on hover
Border: 1px solid rgba(0, 0, 0, 0.04)
Padding: 22px (metric-card) / 18px (health-card)
Hover: translateY(-2px) + shadow increase
```

### Cost Metric Card

```tsx
import { CostMetricCard } from '@/components/costs/cost-metric-card';

// MTD variant
<CostMetricCard variant="mtd" value={12450} currency="USD" />

// DailyRate variant
<CostMetricCard variant="daily-rate" value={415} currency="USD" />

// Forecast variant
<CostMetricCard variant="forecast" value={14900} currency="USD" />
```

### Empty State

```tsx
import { EmptyState } from '@/components/ui/empty-state';

<EmptyState
  icon={CloudIcon}
  title="No integrations yet"
  description="Connect your first cloud provider to start tracking costs."
  action={{ label: "Add Integration", onClick: () => {} }}
/>
```

---

## Loading Skeletons

```tsx
import { CardSkeleton } from '@/components/ui/card-skeleton';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { ChartSkeleton } from '@/components/ui/chart-skeleton';

<CardSkeleton count={4} />   // 4 metric card skeletons
<TableSkeleton count={5} />  // 5 table row skeletons
<ChartSkeleton />            // Chart placeholder
```

---

## Mobile Responsive Patterns

### Mobile Navigation

| Component | Purpose |
|-----------|---------|
| `components/mobile-nav.tsx` | Full mobile navigation overlay (slide-in panel, 280px) |
| `components/mobile-header.tsx` | Mobile header bar with hamburger + chat icon |

Desktop sidebar and mobile nav share identical section order and visual style. Mobile nav uses a data-driven approach (`getNavGroups()`) while desktop sidebar uses JSX sections — both must stay in sync.

```tsx
// Mobile nav is triggered from mobile-header.tsx
<MobileHeader orgSlug={orgSlug} ... />
// Opens MobileNav overlay on hamburger click
// Chat icon also available in header right side
```

### Grid Responsiveness

```tsx
// Metric cards: 2 cols mobile → 4 cols desktop
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">

// Two-column: stack on mobile → side-by-side desktop
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

// Full-width chart spans both columns
<div className="lg:col-span-2">
```

### Mobile Card Adjustments

```tsx
// Padding: tighter on mobile
<div className="p-4 sm:p-5">

// Text: scale down on mobile
<h1 className="console-page-title">

// Hide secondary info on mobile
<span className="hidden sm:inline text-gray-500">vs last period</span>
```

### Mobile Tables

```tsx
// Wrap table in horizontal scroll container
<div className="overflow-x-auto -mx-4 sm:mx-0">
  <table className="min-w-full">...</table>
</div>

// Or use card view on mobile
<div className="hidden sm:block"><DataTable /></div>
<div className="sm:hidden space-y-3">
  {data.map(item => <MobileCardRow key={item.id} {...item} />)}
</div>
```

---

## Data Flow

```
CostDataContext (org-level cache)
    │
    ├── totalCosts          → MetricGrid, summary cards
    ├── providerBreakdown   → ProviderBreakdown, CostBreakdownChart
    ├── dailyTrend          → CostTrendChart
    ├── categoryTrendData   → Category-specific trends
    │
    └── ChartProvider (currency, theme, time range)
            │
            └── All chart components
```

---

## Shared UI Elements

### Time Range Filter

```tsx
import { TimeRangeFilter } from "@/components/costs/cost-filters"
import { useCostData } from "@/contexts/cost-data-context"

const { selectedTimeRange, setTimeRange } = useCostData()
<TimeRangeFilter value={selectedTimeRange} onChange={setTimeRange} />
```

Options: `7`, `14`, `30` (default), `90`, `365`, `mtd`, `qtd`, `ytd`, `custom`

### Filter Controls

```tsx
import { CostFilters } from "@/components/costs/cost-filters"

<CostFilters
  showCategories={true}     // GenAI/Cloud/Subscription
  showProviders={true}      // Provider dropdown
  showHierarchy={true}      // Dept/Project/Team
/>
```

### Trust Signals

```tsx
// Security badge on sensitive pages
<div className="flex items-center gap-2 text-xs text-gray-500">
  <Shield className="w-4 h-4" />
  <span>256-bit encryption</span>
</div>

// Data freshness indicator
<div className="flex items-center gap-1.5 text-xs text-gray-400">
  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
  <span>Live data</span>
</div>
```

---

## Design Spacing

| Context | Value |
|---------|-------|
| Page sections | `space-y-6` |
| Card grids | `gap-4 sm:gap-6` |
| Card padding | `p-4 sm:p-5` |
| Container width | `max-w-7xl mx-auto` |
| Page padding | `px-4 sm:px-6 lg:px-8 py-6 sm:py-8` |

---

## Font Consistency

**CRITICAL:** Always use `.console-*` CSS classes from `console.css` instead of hardcoded Tailwind sizes. See `/design` typography for the full type scale.

```tsx
// CORRECT - uses design system classes
<h1 className="console-page-title">Dashboard</h1>
<h2 className="console-heading">Cost Overview</h2>
<p className="console-body">Total spend this month</p>
<span className="console-small">Last updated 5m ago</span>
<span className="console-metric">$12,450</span>

// WRONG - hardcoded sizes bypass mobile responsive overrides
<h1 className="text-[20px] font-bold">Dashboard</h1>
<p className="text-[12px]">Total spend</p>
```

---

## Component Creation Rules

1. **Single Responsibility** - One component, one purpose
2. **Props over Hardcoding** - Make configurable
3. **TypeScript Interfaces** - Always define prop types
4. **Default Props** - Sensible defaults for optional props
5. **Composition** - Build complex from simple
6. **Check Before Creating** - Verify no existing component handles it

### Before Creating New Component

```
CHECKLIST:
□ Check components/ui/ for primitives (44 files)
□ Check components/charts/ for chart variants
□ Check components/costs/ for cost-specific components
□ Check components/premium/ for page-level components
□ Check components/dashboard/ for dashboard cards
□ If exists → USE IT with props customization
□ If not exists → CREATE in appropriate feature folder
□ NEVER inline complex components in pages
```

---

## Common Issues

| Issue | Fix |
|-------|-----|
| Sidebar overlaps content on mobile | Use MobileNav overlay (separate component) |
| Sidebar sections all collapsed | Initial `openSections` must include ALL section IDs |
| Chat not first in sidebar | Chat section JSX must be before Account Summary |
| Desktop/mobile nav out of sync | Keep section order identical in both components |
| Sidebar uses accordion (one at a time) | **Wrong.** Use Set-based independent collapse |
| Cards not stacking on mobile | Use `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` |
| Table overflows on mobile | Wrap in `overflow-x-auto` or use card view |
| Content hidden behind navbar | Add proper top padding |
| Inconsistent card heights | Use `h-full flex flex-col` on cards |
| Font sizes inconsistent | Use `.console-*` CSS classes, not hardcoded Tailwind |

---

## Page Layout Compliance

All console pages under `app/[orgSlug]/` must follow the layout standard from `/design`.

| Route | Type | Status | Notes |
|-------|------|--------|-------|
| `dashboard` | Standard | Compliant | All theme vars, no bg-white/slate remnants |
| `cost-dashboards/overview` | Standard | Compliant | Uses console-page-inner |
| `cost-dashboards/genai-costs` | Standard | Compliant | |
| `cost-dashboards/cloud-costs` | Standard | Compliant | |
| `cost-dashboards/subscription-costs` | Standard | Compliant | |
| `pipelines/*` | Standard | Compliant | Only bg-slate-900 dark button (intentional) |
| `integrations/*` | Standard | Compliant | All sub-pages (cloud, genai, subscriptions) |
| `notifications` | Standard | Compliant | All theme vars, zero slate remnants |
| `chat` | Full-bleed | Compliant | Special: needs viewport height |
| `settings/ai-chat` | Standard | Compliant | No max-w-2xl, uses console typography |
| `settings/organization` | Standard | Compliant | All cards/borders use theme vars |
| `settings/personal` | Standard | Compliant | 26 class replacements applied |
| `settings/invite` | Standard | Compliant | 35+ class replacements applied |
| `settings/quota-usage` | Standard | Compliant | 28+ class replacements applied |
| `settings/hierarchy` | Standard | Compliant | 23+ class replacements applied |
| `billing` | Standard | Compliant | 60+ replacements applied |

**Sidebar/Nav/Header:** All three (`dashboard-sidebar.tsx`, `mobile-nav.tsx`, `mobile-header.tsx`) fully use CSS variables (dark-mode ready).

**Intentional hardcoded colors (NOT violations):**
- `bg-slate-900`/`hover:bg-slate-800` — dark/obsidian CTA buttons
- `from-slate-50`/`from-slate-500` — gradient utilities in dashboard constants
- `bg-slate-300` — disabled permission dots (invite page)
- `ring-slate-100` — focus ring on billing plan cards
- `text-slate-900/XX` — opacity-modified variants (personal page labels)
- `hover:border-slate-300` — tab hover borders (personal, hierarchy)

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `design` | Brand colors, typography, button system, page layout standard, theme variables |
| `charts` | Recharts chart library used in dashboards |
| `frontend-dev` | Next.js code patterns, server actions, Supabase auth |
| `home-page` | Landing page patterns (different from console) |
