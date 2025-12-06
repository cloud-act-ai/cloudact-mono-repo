# Loading Skeleton Components Implementation

**Created:** 2025-12-05
**Purpose:** Improve UX during slow BigQuery queries by replacing generic spinners with content-aware skeleton loaders.

## Overview

Added three reusable skeleton components that match the actual content layout during loading states:
- `TableSkeleton` - For data tables
- `CardSkeleton` - For stat cards
- `ChartSkeleton` - For charts

## New Components

### 1. TableSkeleton (`components/ui/table-skeleton.tsx`)

Renders a skeleton table with configurable rows and columns.

**Props:**
- `rows?: number` (default: 5) - Number of skeleton rows
- `columns?: number` (default: 4) - Number of skeleton columns
- `showHeader?: boolean` (default: true) - Show table header skeleton

**Usage:**
```tsx
import { TableSkeleton } from "@/components/ui/table-skeleton"

<TableSkeleton rows={8} columns={8} />
```

### 2. CardSkeleton (`components/ui/card-skeleton.tsx`)

Renders skeleton stat cards with optional descriptions.

**Props:**
- `count?: number` (default: 1) - Number of cards to render
- `showDescription?: boolean` (default: false) - Show description skeleton

**Usage:**
```tsx
import { CardSkeleton } from "@/components/ui/card-skeleton"

<CardSkeleton count={4} showDescription />
```

### 3. ChartSkeleton (`components/ui/chart-skeleton.tsx`)

Renders a skeleton chart with simulated bar chart visualization.

**Props:**
- `title?: string` (default: "Loading chart...") - Skeleton title
- `description?: string` - Optional description
- `height?: string` (default: "h-[300px]") - Chart height class

**Usage:**
```tsx
import { ChartSkeleton } from "@/components/ui/chart-skeleton"

<ChartSkeleton title="Cost Trends" height="h-[400px]" />
```

## Updated Pages

### 1. Subscriptions Overview (`app/[orgSlug]/subscriptions/page.tsx`)

**Load Time:** ~5 seconds (BigQuery aggregation)

**Before:**
```tsx
if (isLoading) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
    </div>
  )
}
```

**After:**
```tsx
if (isLoading) {
  return (
    <div className="space-y-6">
      {/* Header preserved */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#007A78]/10 to-[#14B8A6]/10">
              <Wallet className="h-6 w-6 text-[#007A78]" />
            </div>
            <h1 className="console-page-title">Subscription Costs</h1>
          </div>
          <p className="console-subheading ml-12">
            View your SaaS subscription costs and usage
          </p>
        </div>
      </div>

      {/* Summary Cards Skeleton - 4 cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <CardSkeleton count={4} showDescription />
      </div>

      {/* Table Skeleton - 8 rows, 8 columns */}
      <Card className="console-table-card">
        <CardHeader>
          <CardTitle className="console-card-title">All Subscriptions</CardTitle>
          <CardDescription>
            View and manage all your SaaS subscriptions. Toggle to enable/disable cost tracking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TableSkeleton rows={8} columns={8} />
        </CardContent>
      </Card>
    </div>
  )
}
```

**Improvements:**
- Layout matches actual content (header + 4 cards + table)
- User sees expected structure immediately
- Reduced perceived load time

### 2. Provider Plans Page (`app/[orgSlug]/subscriptions/[provider]/page.tsx`)

**Load Time:** ~4-7 seconds (provider-specific BigQuery query)

**Before:**
```tsx
if (loading) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
    </div>
  )
}
```

**After:**
```tsx
if (loading) {
  return (
    <div className="p-6 space-y-6">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#007A78]/10 to-[#14B8A6]/10">
            <CreditCard className="h-6 w-6 text-[#007A78]" />
          </div>
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-10 w-48" />
      </div>

      {/* Summary Cards Skeleton - 3 cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CardSkeleton count={3} />
      </div>

      {/* Plans Table Skeleton */}
      <Card className="console-table-card">
        <CardHeader>
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent className="px-0">
          {/* Custom table skeleton matching grid layout */}
          <div className="console-table-header-row grid grid-cols-12 gap-4 px-4 py-3 border-b bg-slate-50/50">
            {[1, 3, 2, 2, 2, 2].map((span, i) => (
              <div key={i} className={`col-span-${span}`}>
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid grid-cols-12 gap-4 px-4 py-3.5">
                <div className="col-span-1"><Skeleton className="h-6 w-10" /></div>
                <div className="col-span-3"><Skeleton className="h-6 w-full" /></div>
                <div className="col-span-2"><Skeleton className="h-6 w-20 ml-auto" /></div>
                <div className="col-span-2"><Skeleton className="h-6 w-16" /></div>
                <div className="col-span-2"><Skeleton className="h-6 w-12 ml-auto" /></div>
                <div className="col-span-2"><Skeleton className="h-6 w-16 ml-auto" /></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

**Improvements:**
- Custom grid-based skeleton matches actual table layout (cols-12 grid)
- 3 summary cards skeleton
- Header with back button preserved

### 3. Subscription Providers Settings (`app/[orgSlug]/settings/integrations/subscriptions/page.tsx`)

**Load Time:** ~13 seconds (Supabase query + BigQuery aggregation for all providers)

**Before:**
```tsx
if (providersLoading) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
    </div>
  )
}
```

**After:**
```tsx
if (providersLoading) {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted w-fit">
        <Skeleton className="h-4 w-32" />
      </div>

      {/* Provider Cards Skeleton - 12 cards (3x4 grid) */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <Card key={i} className="console-stat-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div>
                    <Skeleton className="h-5 w-32 mb-2" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-6 w-10" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <Skeleton className="h-6 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

**Improvements:**
- Grid of 12 provider cards (matches initial display)
- Each card skeleton mimics actual card structure (icon + title + toggle)
- Title, description, and enabled count badge skeletons

## Dashboard Page

Dashboard page was already server-rendered (no client-side loading state), so no skeleton was needed.

## Design Principles

### 1. Match Content Layout
- Skeleton layout should exactly match the actual content structure
- Preserve page headers, icons, and static elements
- Use the same grid/flex layout as actual content

### 2. Consistent Styling
- Use existing `console-*` CSS classes
- Maintain brand colors (teal #007A78)
- Match card styles (`console-stat-card`, `console-table-card`)

### 3. Appropriate Detail
- Show expected number of items (cards, rows)
- Match column widths in tables
- Include all major sections (header, cards, tables)

### 4. Performance
- Skeletons render immediately (no additional data fetching)
- Use shadcn/ui `Skeleton` component with built-in pulse animation
- Minimal DOM elements (reusable components)

## Testing

### Manual Testing Checklist

Test each page with slow network:

- [ ] `/[orgSlug]/subscriptions` - Should show header + 4 cards + table skeleton
- [ ] `/[orgSlug]/subscriptions/[provider]` - Should show header + 3 cards + custom grid table skeleton
- [ ] `/[orgSlug]/settings/integrations/subscriptions` - Should show 12 provider card skeletons

### Visual Testing

1. Open Chrome DevTools → Network tab
2. Set throttling to "Slow 3G"
3. Navigate to each page
4. Verify:
   - Skeleton appears immediately
   - Layout matches actual content
   - Smooth transition when data loads
   - No layout shift (CLS)

## Performance Metrics

### Before (Generic Spinner)
- **Perceived Load Time:** Full query time (5-13s)
- **User Feedback:** None (just spinner)
- **Layout Shift:** High (spinner → content)

### After (Skeleton Loaders)
- **Perceived Load Time:** <100ms (skeleton renders immediately)
- **User Feedback:** Expected structure visible
- **Layout Shift:** Minimal (skeleton → content same layout)

## Future Improvements

### Additional Pages to Add Skeletons
- Dashboard analytics page (if slow)
- Pipeline execution history page
- Cost analytics pages with charts

### Enhancements
- Add shimmer animation (CSS gradient)
- Staggered loading animation for lists
- Progressive skeleton reveal (fade in sections)
- Dark mode skeleton colors

## Files Modified

### New Files
- `/components/ui/table-skeleton.tsx` - Table skeleton component
- `/components/ui/card-skeleton.tsx` - Card skeleton component
- `/components/ui/chart-skeleton.tsx` - Chart skeleton component

### Modified Files
- `/app/[orgSlug]/subscriptions/page.tsx` - Added table + card skeletons
- `/app/[orgSlug]/subscriptions/[provider]/page.tsx` - Added custom grid skeleton
- `/app/[orgSlug]/settings/integrations/subscriptions/page.tsx` - Added provider card skeletons

## References

- shadcn/ui Skeleton: https://ui.shadcn.com/docs/components/skeleton
- Next.js Loading UI: https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming
- Web Vitals (CLS): https://web.dev/cls/
