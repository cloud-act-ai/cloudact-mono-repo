# Layout Guidelines - CloudAct Frontend

This document defines the standardized layout patterns used throughout the CloudAct frontend application.

## Grid Layout Standards

### Class Order Convention

**ALWAYS** use this order for grid classes:
```tsx
className="grid grid-cols-{breakpoint} gap-{size}"
```

**Correct:**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
```

**Incorrect:**
```tsx
<div className="grid gap-4 grid-cols-1 sm:grid-cols-2">  ❌
<div className="grid gap-4 md:grid-cols-3">              ❌
```

### Responsive Breakpoints

Standard responsive patterns for different layouts:

#### 1. Metric Cards / Dashboard Stats
**Pattern:** 3-column grid (4-column for summary metrics)

```tsx
// Standard metric cards (3-column)
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

// Summary metrics (4-column)
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
```

**Breakpoints:**
- Mobile (< 640px): 1 column
- Tablet (640px - 1023px): 2 columns
- Desktop (≥ 1024px): 3 or 4 columns

**Used in:**
- `/[orgSlug]/dashboard` - Pinned metric cards
- `/[orgSlug]/subscriptions` - Summary cards
- `/[orgSlug]/settings/integrations` - Integration cards

#### 2. Settings Cards / Integration Cards
**Pattern:** 3-column grid with smaller breakpoint

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
```

**Breakpoints:**
- Mobile (< 640px): 1 column, gap-4
- Tablet (640px - 1023px): 2 columns, gap-5
- Desktop (≥ 1024px): 3 columns, gap-5

**Used in:**
- `/[orgSlug]/settings/integrations` - All provider sections
- `/[orgSlug]/settings/integrations/llm`
- `/[orgSlug]/settings/integrations/cloud`
- `/[orgSlug]/settings/integrations/subscriptions`

#### 3. Pricing Cards
**Pattern:** 3-column grid with larger gaps

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
```

**Breakpoints:**
- Mobile (< 640px): 1 column, gap-4
- Tablet (640px - 767px): 2 columns, gap-6
- Desktop (≥ 768px): 3 columns, gap-6

**Used in:**
- `/[orgSlug]/billing` - Plan selection
- `/(landingPages)/pricing` - Public pricing page
- `/onboarding/billing` - Onboarding plan selection

#### 4. Forms / Two-Column Layouts
**Pattern:** Simple 2-column grid

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
```

**Breakpoints:**
- Mobile (< 768px): 1 column
- Desktop (≥ 768px): 2 columns

**Used in:**
- `/onboarding/organization` - Organization setup form
- Form inputs that should stack on mobile

#### 5. Landing Page Content
**Pattern:** Flexible multi-column grids

```tsx
// Features grid (3-column)
<div className="grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">

// Two-column content
<div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2">
```

**Used in:**
- `/(landingPages)/features`
- `/(landingPages)/about`
- `/(landingPages)/resources`

## Gap Spacing Standards

### Standard Gap Sizes

| Size | px Value | Use Case |
|------|----------|----------|
| `gap-4` | 16px | Dense layouts, metric cards, default |
| `gap-5` | 20px | Settings cards, integration cards |
| `gap-6` | 24px | Pricing cards, landing pages |
| `gap-8` | 32px | Landing page sections (large spacing) |
| `gap-10` | 40px | Landing page hero sections |
| `gap-12` | 48px | Landing page major sections |

### Responsive Gap Pattern

When gaps differ by breakpoint, use this pattern:

```tsx
gap-4 sm:gap-5    // 16px mobile, 20px tablet+
gap-4 sm:gap-6    // 16px mobile, 24px tablet+
gap-5 sm:gap-6    // 20px mobile, 24px tablet+
gap-6 sm:gap-8    // 24px mobile, 32px tablet+
```

## Table Layouts

### Full-Width Tables with Horizontal Scroll

```tsx
<div className="health-card p-0 overflow-hidden">
  <div className="overflow-x-auto">
    <Table className="min-w-[700px]">
      {/* Table content */}
    </Table>
  </div>
</div>
```

**Key features:**
- `overflow-hidden` on outer container (for rounded corners)
- `overflow-x-auto` on scroll wrapper
- `min-w-[XXXpx]` on table for consistent column widths
- Standard min-widths: 700px (standard), 900px (wide tables)

**Used in:**
- `/[orgSlug]/pipelines` - Pipeline runs table
- `/[orgSlug]/subscriptions` - Subscriptions table
- `/[orgSlug]/settings/members` - Members table
- `/[orgSlug]/billing` - Invoices table

## Flex Layouts

### Centered Content

```tsx
// Centered loading state
<div className="flex items-center justify-center min-h-[400px]">
  <Loader2 className="h-10 w-10 animate-spin" />
</div>

// Centered empty state
<div className="flex flex-col items-center justify-center py-12">
  <Icon className="h-12 w-12 mb-4" />
  <h3>Empty State Title</h3>
  <p>Description</p>
</div>
```

### Header Layouts

```tsx
// Page header with action button
<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
  <div>
    <h1>Page Title</h1>
    <p>Description</p>
  </div>
  <Button>Action</Button>
</div>
```

### Card Headers

```tsx
// Metric card header (space-between)
<div className="metric-card-header">
  <div className="metric-card-label">Label</div>
  <div className="metric-card-time">Time</div>
</div>

// Or with Tailwind
<div className="flex items-center justify-between">
  <span>Label</span>
  <Badge>Status</Badge>
</div>
```

## Container Patterns

### Max Width Containers

```tsx
// Standard page container (console pages)
<div className="space-y-6 sm:space-y-8">
  {/* Page content */}
</div>

// Centered container with max-width (landing pages)
<div className="container px-4 md:px-12">
  <div className="mx-auto max-w-3xl">
    {/* Centered content */}
  </div>
</div>
```

**Max-width values:**
- `max-w-3xl` (768px): Forms, centered content
- `max-w-4xl` (896px): Medium content sections
- `max-w-6xl` (1152px): Wide content, pricing grids
- `max-w-7xl` (1280px): Full-width console pages

### Spacing Between Sections

```tsx
// Console pages (Apple Health style)
<div className="space-y-6 sm:space-y-8">
  <section>...</section>
  <section>...</section>
</div>

// Landing pages
<section className="py-12 sm:py-16 md:py-20">
  {/* Section content */}
</section>
```

## Card Patterns

### Metric Cards (Apple Health Style)

```tsx
<div className="metric-card">
  <div className="metric-card-header">
    <div className="metric-card-label metric-card-label-teal">
      <Icon className="h-5 w-5" />
      Label
    </div>
  </div>
  <div className="metric-card-content">
    <div className="metric-card-value">$1,234</div>
    <div className="metric-card-description">Description</div>
  </div>
</div>
```

### Health Cards (Minimal style)

```tsx
<div className="health-card">
  <h3 className="text-[15px] font-semibold">Title</h3>
  <p className="text-[13px] text-[#8E8E93]">Description</p>
</div>
```

## Equal Height Cards

For grids where cards should have equal height:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  <div className="metric-card flex flex-col">
    <div className="flex-1">
      {/* Card content */}
    </div>
    <div>
      {/* Card footer (optional) */}
    </div>
  </div>
</div>
```

**Key: Add `flex flex-col` to the card wrapper**

## Loading Skeletons

Loading skeletons should match the actual layout:

```tsx
// Dashboard loading (3-column grid)
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  <Skeleton className="h-[150px] rounded-2xl" />
  <Skeleton className="h-[150px] rounded-2xl" />
  <Skeleton className="h-[150px] rounded-2xl" />
</div>

// Pricing cards loading (3-column grid)
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
  {[1, 2, 3].map((i) => (
    <Card key={i}>
      {/* Skeleton content */}
    </Card>
  ))}
</div>
```

## Common Layout Issues - FIXED

### ✅ Correct Grid Patterns (All Fixed)

- Dashboard: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`
- Integrations: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5`
- Billing: `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6`
- Subscriptions: `grid grid-cols-2 lg:grid-cols-4 gap-4` (summary)
- Pricing: `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8`

### ❌ Anti-Patterns to Avoid

```tsx
// Wrong: gap before grid-cols
<div className="grid gap-4 md:grid-cols-3">  ❌

// Wrong: missing mobile breakpoint
<div className="grid md:grid-cols-3 gap-4">  ❌

// Wrong: inconsistent gaps
<div className="grid grid-cols-1 gap-3 sm:gap-7">  ❌

// Correct patterns
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">  ✅
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">  ✅
```

## Checklist for New Layouts

When creating a new grid layout, ensure:

- [ ] Grid classes in correct order: `grid grid-cols-{bp} gap-{size}`
- [ ] Mobile-first: Always start with `grid-cols-1` (except 2-col summaries)
- [ ] Proper breakpoints: Use `sm:`, `md:`, `lg:` consistently
- [ ] Appropriate gaps: 4 (dense), 5 (medium), 6 (spacious)
- [ ] Responsive gaps: Use `gap-4 sm:gap-5` when needed
- [ ] Min-width on tables: `min-w-[700px]` or `min-w-[900px]`
- [ ] Equal height cards: Add `flex flex-col` when needed
- [ ] Loading skeletons match actual layout
- [ ] No overflow issues on mobile
- [ ] Proper wrapping at all breakpoints

## Testing Checklist

Test layouts at these viewport widths:

- [ ] Mobile: 375px (iPhone SE)
- [ ] Mobile Large: 428px (iPhone Pro Max)
- [ ] Tablet: 768px (iPad)
- [ ] Tablet Large: 1024px (iPad Pro)
- [ ] Desktop: 1280px
- [ ] Desktop Large: 1920px

## Files Updated (2025-12-13)

**Console Pages:**
- `/[orgSlug]/dashboard/page.tsx`
- `/[orgSlug]/billing/page.tsx`
- `/[orgSlug]/settings/integrations/page.tsx`
- `/[orgSlug]/settings/integrations/llm/page.tsx`
- `/[orgSlug]/settings/integrations/cloud/page.tsx`
- `/[orgSlug]/settings/integrations/subscriptions/page.tsx`

**Loading States:**
- `/[orgSlug]/dashboard/loading.tsx`
- `/[orgSlug]/billing/loading.tsx`
- `/[orgSlug]/settings/integrations/loading.tsx`
- `/[orgSlug]/subscriptions/loading.tsx`

**Onboarding:**
- `/onboarding/billing/page.tsx`
- `/onboarding/organization/page.tsx`

**Landing Pages:**
- `/(landingPages)/pricing/page.tsx`
- `/(landingPages)/features/page.tsx`
- `/(landingPages)/about/page.tsx`
- `/(landingPages)/resources/page.tsx`
- `/(landingPages)/contact/page.tsx`

---

**Last Updated:** 2025-12-13
**Status:** All grid layouts standardized and consistent
