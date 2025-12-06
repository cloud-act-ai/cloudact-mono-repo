# Skeleton Loading Components

## Quick Start

Replace generic loading spinners with content-aware skeletons to improve perceived performance.

### Available Components

#### 1. TableSkeleton
```tsx
import { TableSkeleton } from "@/components/ui/table-skeleton"

<TableSkeleton rows={5} columns={4} showHeader={true} />
```

**Props:**
- `rows?: number` - Number of skeleton rows (default: 5)
- `columns?: number` - Number of skeleton columns (default: 4)
- `showHeader?: boolean` - Show table header (default: true)

**Use Case:** Data tables, list views, transaction history

---

#### 2. CardSkeleton
```tsx
import { CardSkeleton } from "@/components/ui/card-skeleton"

<CardSkeleton count={4} showDescription={true} />
```

**Props:**
- `count?: number` - Number of cards (default: 1)
- `showDescription?: boolean` - Show description skeleton (default: false)

**Use Case:** Stat cards, summary cards, dashboard metrics

---

#### 3. ChartSkeleton
```tsx
import { ChartSkeleton } from "@/components/ui/chart-skeleton"

<ChartSkeleton
  title="Loading chart..."
  description="Optional description"
  height="h-[300px]"
/>
```

**Props:**
- `title?: string` - Skeleton title (default: "Loading chart...")
- `description?: string` - Optional description
- `height?: string` - Height class (default: "h-[300px]")

**Use Case:** Bar charts, line charts, analytics visualizations

---

## Usage Patterns

### Pattern 1: Replace Full-Page Spinner

❌ **Before:**
```tsx
if (isLoading) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  )
}
```

✅ **After:**
```tsx
if (isLoading) {
  return (
    <div className="space-y-6">
      {/* Preserve page header */}
      <div className="flex items-center gap-3">
        <Icon className="h-6 w-6" />
        <h1 className="console-page-title">Page Title</h1>
      </div>

      {/* Add matching skeletons */}
      <div className="grid gap-4 md:grid-cols-4">
        <CardSkeleton count={4} showDescription />
      </div>

      <Card className="console-table-card">
        <CardHeader>
          <CardTitle>Table Title</CardTitle>
        </CardHeader>
        <CardContent>
          <TableSkeleton rows={8} columns={6} />
        </CardContent>
      </Card>
    </div>
  )
}
```

### Pattern 2: Preserve Page Structure

Always show:
- Page headers
- Navigation elements
- Section titles
- Static icons

Replace only:
- Dynamic data
- Table rows
- Card content
- Chart visualizations

### Pattern 3: Match Layout Exactly

The skeleton should be indistinguishable from the actual content in terms of layout:

```tsx
{/* Actual Content */}
<div className="grid gap-4 md:grid-cols-3">
  {data.map(item => <Card>{item.name}</Card>)}
</div>

{/* Skeleton - Same grid layout */}
<div className="grid gap-4 md:grid-cols-3">
  <CardSkeleton count={3} />
</div>
```

---

## Design Guidelines

### 1. Layout Fidelity
- Match grid/flex structure exactly
- Use same spacing (gap, padding, margin)
- Preserve responsive breakpoints

### 2. Visual Hierarchy
- Show section structure (header, body, footer)
- Indicate relative importance (larger = more important)
- Maintain visual rhythm

### 3. Skeleton Density
- Match expected content density
- Show realistic number of items
- Don't over-simplify or over-complicate

### 4. Transition
- No layout shift when content loads
- Smooth opacity transition (built-in pulse animation)
- Maintain scroll position

---

## Common Mistakes

### ❌ Mistake 1: Generic skeleton that doesn't match content
```tsx
{isLoading ? (
  <Skeleton className="h-[400px] w-full" />  // Generic rectangle
) : (
  <ComplexTableWithCardsAndCharts />  // Complex layout
)}
```

### ✅ Fix: Match the actual layout
```tsx
{isLoading ? (
  <>
    <CardSkeleton count={3} />
    <TableSkeleton rows={5} columns={6} />
    <ChartSkeleton />
  </>
) : (
  <ComplexTableWithCardsAndCharts />
)}
```

---

### ❌ Mistake 2: Hiding page structure
```tsx
{isLoading ? (
  <Loader2 />  // Just spinner, no structure
) : (
  <>
    <PageHeader />
    <Cards />
    <Table />
  </>
)}
```

### ✅ Fix: Preserve page header
```tsx
{isLoading ? (
  <>
    <PageHeader />  // Keep static header
    <CardSkeleton count={4} />
    <TableSkeleton />
  </>
) : (
  <>
    <PageHeader />
    <Cards />
    <Table />
  </>
)}
```

---

### ❌ Mistake 3: Wrong number of skeleton items
```tsx
{isLoading ? (
  <TableSkeleton rows={3} />  // Only 3 rows
) : (
  <Table>{data.map(...)}</Table>  // Shows 10 rows
)}
```

### ✅ Fix: Match expected item count
```tsx
{isLoading ? (
  <TableSkeleton rows={10} />  // Match typical row count
) : (
  <Table>{data.map(...)}</Table>
)}
```

---

## Performance Tips

### 1. Don't Fetch Data for Skeletons
Skeletons should render immediately with no data fetching.

```tsx
// ✅ Good - Skeleton renders immediately
if (isLoading) return <TableSkeleton />

// ❌ Bad - Fetching data for skeleton
if (isLoading) {
  const count = await fetchItemCount()  // Don't do this!
  return <TableSkeleton rows={count} />
}
```

### 2. Use Static Props
Hard-code skeleton props based on typical/expected data.

```tsx
// ✅ Good - Static props
<TableSkeleton rows={10} columns={5} />

// ❌ Bad - Dynamic props requiring calculation
<TableSkeleton rows={data?.length || 10} columns={Object.keys(data[0]).length} />
```

### 3. Minimize Skeleton Complexity
Keep skeletons simple - they're temporary.

```tsx
// ✅ Good - Simple skeleton
<Skeleton className="h-4 w-32" />

// ❌ Bad - Overly detailed skeleton
<div className="flex items-center gap-2">
  <Skeleton className="h-3 w-3 rounded-full" />
  <Skeleton className="h-4 w-28" />
  <Skeleton className="h-3 w-12" />
  <Badge><Skeleton className="h-3 w-8" /></Badge>
</div>
```

---

## Custom Skeletons

For unique layouts, compose custom skeletons using the base `Skeleton` component:

```tsx
import { Skeleton } from "@/components/ui/skeleton"

function CustomProviderCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />  {/* Icon */}
            <div>
              <Skeleton className="h-5 w-32" />  {/* Title */}
              <Skeleton className="h-3 w-20" />  {/* Category */}
            </div>
          </div>
          <Skeleton className="h-6 w-10" />  {/* Toggle */}
        </div>
      </CardHeader>
    </Card>
  )
}
```

---

## Testing Checklist

When adding skeletons to a page:

- [ ] Skeleton layout matches actual content layout
- [ ] Page header and static elements preserved
- [ ] Grid/flex structure identical
- [ ] Appropriate number of skeleton items
- [ ] No layout shift when content loads
- [ ] Works on mobile (responsive breakpoints)
- [ ] Dark mode support (if applicable)
- [ ] Accessible (screen readers announce loading state)

---

## Examples

### Example 1: Dashboard Page with Cards and Chart

```tsx
if (isLoading) {
  return (
    <div className="space-y-6">
      <h1 className="console-page-title">Dashboard</h1>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <CardSkeleton count={4} showDescription />
      </div>

      {/* Chart */}
      <ChartSkeleton title="Revenue Trends" height="h-[400px]" />
    </div>
  )
}
```

### Example 2: Table with Filters

```tsx
if (isLoading) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-64" />  {/* Search input */}
        <Skeleton className="h-10 w-32" />  {/* Filter button */}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <TableSkeleton rows={10} columns={6} />
        </CardContent>
      </Card>
    </div>
  )
}
```

### Example 3: Grid of Items

```tsx
if (isLoading) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 9 }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-lg" />
            <div className="flex-1">
              <Skeleton className="h-5 w-32 mb-2" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
```

---

## Migration Guide

### Step 1: Identify Slow Pages
Use Chrome DevTools Network tab to find pages with >2s load time.

### Step 2: Analyze Content Structure
For each slow page, identify:
- Page header (preserve as-is)
- Summary cards (use CardSkeleton)
- Data tables (use TableSkeleton)
- Charts (use ChartSkeleton)
- Custom layouts (compose custom skeleton)

### Step 3: Replace Spinner with Skeleton
Keep the same conditional logic, just change the loading state:

```diff
  if (isLoading) {
-   return <Loader2 className="animate-spin" />
+   return (
+     <div className="space-y-6">
+       <PageHeader />
+       <CardSkeleton count={4} />
+       <TableSkeleton rows={8} columns={6} />
+     </div>
+   )
  }
```

### Step 4: Test and Iterate
- Test on slow 3G network
- Verify no layout shift
- Adjust skeleton item counts
- Fine-tune spacing and sizing

---

## Support

For questions or issues:
1. Check existing implementations in `/app/[orgSlug]/subscriptions/`
2. Review this README
3. See full documentation: `/LOADING_SKELETON_IMPLEMENTATION.md`
4. Compare before/after: `/SKELETON_COMPARISON.md`
