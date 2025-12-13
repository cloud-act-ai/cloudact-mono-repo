# Loading Components - Quick Reference

## Component Import Paths

```tsx
import { Spinner } from "@/components/ui/spinner"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { LoadingButton } from "@/components/ui/loading-button"
```

---

## Spinner

### Basic Usage
```tsx
<Spinner />                                    // Default: Teal, medium
<Spinner size="sm" />                          // Small spinner
<Spinner variant="coral" />                    // Coral colored
<Spinner size="lg" variant="coral" />          // Large coral spinner
```

### Sizes
| Size | Dimensions | Use Case |
|------|------------|----------|
| `sm` | 16px | Inline text, small buttons |
| `md` | 32px | Default, cards, modals |
| `lg` | 48px | Full-page loading |
| `xl` | 64px | Hero sections |

### Variants
| Variant | Color | Use Case |
|---------|-------|----------|
| `teal` (default) | #007A78 | Primary actions, features |
| `coral` | #FF6E50 | Destructive actions, costs |
| `default` | Muted | Neutral loading states |

---

## Skeleton

### Basic Usage
```tsx
<Skeleton className="h-8 w-64 rounded-lg" />           // Default shimmer
<Skeleton variant="pulse" className="h-4 w-32" />      // Pulse animation
<Skeleton className="h-10 w-10 rounded-full" />        // Avatar
```

### Common Patterns
```tsx
// Text line
<Skeleton className="h-4 w-full rounded-md" />

// Heading
<Skeleton className="h-8 w-64 rounded-lg" />

// Button
<Skeleton className="h-10 w-32 rounded-xl" />

// Card
<Skeleton className="h-[150px] rounded-2xl" />

// Avatar
<Skeleton className="h-10 w-10 rounded-full" />

// Icon
<Skeleton className="h-5 w-5 rounded-sm" />
```

### Border Radius Guide
| Element | Class | Size |
|---------|-------|------|
| Cards | `rounded-2xl` | 16px |
| Buttons | `rounded-xl` | 12px |
| Headers | `rounded-lg` | 10px |
| Text/Content | `rounded-md` | 8px |
| Small items | `rounded-sm` | 6px |
| Avatars/Badges | `rounded-full` | 9999px |

---

## Progress

### Basic Usage
```tsx
<Progress value={60} />                                // Default: Teal, medium
<Progress value={75} showLabel />                      // With percentage label
<Progress value={45} variant="coral" size="lg" />      // Large coral progress
```

### Examples
```tsx
// Upload progress
<Progress value={uploadProgress} max={100} showLabel />

// Download progress
<Progress value={downloadProgress} variant="teal" />

// Cost indicator
<Progress value={costPercentage} variant="coral" showLabel />
```

### Sizes
| Size | Height | Use Case |
|------|--------|----------|
| `sm` | 4px | Compact, inline |
| `md` | 8px | Default, cards |
| `lg` | 12px | Prominent, hero |

---

## LoadingButton

### Basic Usage
```tsx
<LoadingButton isLoading={isSubmitting}>
  Submit
</LoadingButton>

<LoadingButton isLoading={isSubmitting} loadingText="Saving...">
  Save Changes
</LoadingButton>

<LoadingButton
  isLoading={isDeleting}
  spinnerVariant="coral"
  variant="destructive"
>
  Delete
</LoadingButton>
```

### Common Patterns
```tsx
// Form submit
<LoadingButton
  isLoading={isSubmitting}
  loadingText="Submitting..."
  type="submit"
>
  Submit Form
</LoadingButton>

// Destructive action
<LoadingButton
  isLoading={isDeleting}
  loadingText="Deleting..."
  spinnerVariant="coral"
  variant="destructive"
>
  Delete Account
</LoadingButton>

// Secondary action
<LoadingButton
  isLoading={isSaving}
  loadingText="Saving..."
  variant="secondary"
>
  Save Draft
</LoadingButton>
```

---

## Loading Page Pattern

### Full Page Loading
```tsx
export default function Loading() {
  return (
    <div
      className="space-y-8"
      role="status"
      aria-busy="true"
      aria-label="Loading page name"
    >
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-5 w-96 rounded-md" />
      </div>

      {/* Cards Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-[150px] rounded-2xl" />
        <Skeleton className="h-[150px] rounded-2xl" />
        <Skeleton className="h-[150px] rounded-2xl" />
      </div>
    </div>
  )
}
```

### Table Loading
```tsx
<Card className="rounded-2xl">
  <CardHeader>
    <Skeleton className="h-6 w-40 rounded-md" />
  </CardHeader>
  <CardContent>
    <div className="space-y-4">
      {/* Header row */}
      <div className="grid grid-cols-4 gap-4 pb-2 border-b">
        {["Col 1", "Col 2", "Col 3", "Col 4"].map((_, i) => (
          <Skeleton key={i} className="h-4 w-16 rounded-md" />
        ))}
      </div>

      {/* Data rows */}
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="grid grid-cols-4 gap-4 items-center py-3">
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-4 w-32 rounded-md" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  </CardContent>
</Card>
```

---

## Color Reference

| Color | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| Teal | `#007A78` | `#14B8A6` | Primary, features, spinners |
| Coral | `#FF6E50` | `#FF8A73` | Costs, destructive, warnings |
| Muted | `#F1F5F9` | `#334155` | Skeleton background |
| Shimmer (Light) | `white/60` | - | Skeleton animation |
| Shimmer (Dark) | - | `white/10` | Skeleton animation |

---

## Accessibility Attributes

All components include proper ARIA attributes automatically:

```tsx
// Spinner
<Spinner />
// Renders: role="status" aria-busy="true" aria-label="Loading"

// Skeleton
<Skeleton className="h-8 w-64" />
// Renders: role="status" aria-busy="true" aria-label="Loading content"

// Progress
<Progress value={60} />
// Renders: role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="60"

// LoadingButton
<LoadingButton isLoading={true}>Submit</LoadingButton>
// Renders: aria-busy="true" disabled={true}

// Loading Page
<div role="status" aria-busy="true" aria-label="Loading dashboard">
```

---

## Best Practices

### 1. Match Layout Structure
```tsx
// ❌ Generic skeleton
{isLoading && <Skeleton className="h-[400px]" />}

// ✅ Match actual content
{isLoading ? (
  <>
    <Skeleton className="h-8 w-64 rounded-lg" />
    <Skeleton className="h-4 w-96 rounded-md" />
    <div className="grid gap-4 md:grid-cols-3">
      <Skeleton className="h-[150px] rounded-2xl" />
      <Skeleton className="h-[150px] rounded-2xl" />
      <Skeleton className="h-[150px] rounded-2xl" />
    </div>
  </>
) : (
  <ActualContent />
)}
```

### 2. Preserve Static Elements
```tsx
// ❌ Hide everything
{isLoading ? <Spinner /> : <FullPage />}

// ✅ Keep page structure
<>
  <PageHeader /> {/* Always visible */}
  {isLoading ? <SkeletonCards /> : <DataCards />}
</>
```

### 3. Use Appropriate Colors
```tsx
// ✅ Features/Analytics
<Spinner variant="teal" />

// ✅ Costs/Billing
<Spinner variant="coral" />

// ✅ Destructive actions
<LoadingButton spinnerVariant="coral" variant="destructive">
  Delete
</LoadingButton>
```

### 4. Add Context with aria-label
```tsx
// ✅ Descriptive labels
<div role="status" aria-busy="true" aria-label="Loading dashboard">
<div role="status" aria-busy="true" aria-label="Loading billing information">
<div role="status" aria-busy="true" aria-label="Loading team members">
```

---

## Component Combinations

### Card with Loading State
```tsx
<Card className="rounded-2xl">
  <CardHeader>
    <CardTitle>Data Analytics</CardTitle>
  </CardHeader>
  <CardContent>
    {isLoading ? (
      <div className="space-y-3">
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-3/4 rounded-md" />
        <Skeleton className="h-4 w-1/2 rounded-md" />
      </div>
    ) : (
      <ActualData />
    )}
  </CardContent>
</Card>
```

### Form with Loading Button
```tsx
<form onSubmit={handleSubmit}>
  <Input name="email" />
  <Input name="password" />

  <LoadingButton
    type="submit"
    isLoading={isSubmitting}
    loadingText="Signing in..."
  >
    Sign In
  </LoadingButton>
</form>
```

### Upload with Progress
```tsx
{isUploading && (
  <div className="space-y-2">
    <div className="flex items-center gap-3">
      <Spinner size="sm" />
      <span className="text-sm text-muted-foreground">
        Uploading file...
      </span>
    </div>
    <Progress value={uploadProgress} max={100} showLabel />
  </div>
)}
```

---

## Animation Speeds

| Component | Duration | Easing | Notes |
|-----------|----------|--------|-------|
| Spinner | Default Tailwind | - | Uses `animate-spin` |
| Skeleton Shimmer | 1.5s | ease-in-out | Smooth gradient sweep |
| Skeleton Pulse | Default Tailwind | - | Legacy, use shimmer |
| Progress | 300ms | ease-in-out | Smooth bar transition |

---

## Files Modified/Created

### New Components
- ✅ `/components/ui/spinner.tsx`
- ✅ `/components/ui/progress.tsx`
- ✅ `/components/ui/loading-button.tsx`

### Updated Components
- ✅ `/components/ui/skeleton.tsx`
- ✅ `/components/ui/chart-skeleton.tsx`

### Updated Loading Pages
- ✅ `/app/[orgSlug]/dashboard/loading.tsx`
- ✅ `/app/[orgSlug]/billing/loading.tsx`
- ✅ `/app/[orgSlug]/subscriptions/loading.tsx`
- ✅ `/app/[orgSlug]/settings/loading.tsx`
- ✅ `/app/[orgSlug]/settings/integrations/loading.tsx`
- ✅ `/app/[orgSlug]/settings/members/loading.tsx`

### CSS Updates
- ✅ `/app/globals.css` (added shimmer keyframes)

### Documentation
- ✅ `/LOADING_COMPONENTS_SUMMARY.md` (comprehensive guide)
- ✅ `/LOADING_COMPONENTS_QUICK_REF.md` (this file)

---

**Quick Tip**: All components automatically support dark mode and respect `prefers-reduced-motion` settings!
