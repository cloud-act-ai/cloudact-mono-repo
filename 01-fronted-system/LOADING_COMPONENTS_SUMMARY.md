# Loading & Skeleton Components - Summary

## Overview
All loading/skeleton components have been updated to match the CloudAct design system with proper brand colors, accessibility, and animations.

## Brand Colors
- **Primary (Teal)**: `#007A78` (light mode), `#14B8A6` (dark mode)
- **Destructive (Coral)**: `#FF6E50` (light mode), `#FF8A73` (dark mode)
- **Skeleton Background**: `muted` color from design system
- **Shimmer Effect**: White with 60% opacity (light), 10% opacity (dark)

## New Components Created

### 1. Spinner Component
**Location**: `/components/ui/spinner.tsx`

**Features**:
- Teal color by default (`#007A78`)
- Coral variant for destructive actions
- 4 sizes: sm, md, lg, xl
- Accessible with `aria-busy` and `aria-label`
- Smooth spin animation

**Usage**:
```tsx
import { Spinner } from "@/components/ui/spinner"

// Default teal spinner
<Spinner size="md" />

// Coral variant
<Spinner size="sm" variant="coral" />

// Custom size
<Spinner size="lg" className="my-4" />
```

**Sizes**:
- `sm`: 16px (h-4 w-4)
- `md`: 32px (h-8 w-8) - default
- `lg`: 48px (h-12 w-12)
- `xl`: 64px (h-16 w-16)

---

### 2. Updated Skeleton Component
**Location**: `/components/ui/skeleton.tsx`

**Features**:
- Shimmer animation by default (better than pulse)
- Smooth gradient animation (1.5s ease-in-out)
- Dark mode support with appropriate opacity
- Accessible with `aria-busy`, `role="status"`, and `aria-label`
- Two variants: `shimmer` (default) and `pulse`

**Usage**:
```tsx
import { Skeleton } from "@/components/ui/skeleton"

// Default shimmer animation
<Skeleton className="h-8 w-64 rounded-lg" />

// Pulse variant (legacy)
<Skeleton variant="pulse" className="h-4 w-32" />
```

**Animation**:
The shimmer effect uses a gradient that moves from left to right:
- Light mode: White with 60% opacity
- Dark mode: White with 10% opacity
- Duration: 1.5 seconds
- Easing: ease-in-out
- Loop: infinite

---

### 3. Progress Bar Component
**Location**: `/components/ui/progress.tsx`

**Features**:
- Teal color by default (`#007A78`)
- Coral variant for cost/billing
- 3 sizes: sm, md, lg
- Optional percentage label
- Smooth transition animations
- Full accessibility support

**Usage**:
```tsx
import { Progress } from "@/components/ui/progress"

// Default teal progress
<Progress value={60} max={100} />

// With label
<Progress value={75} max={100} showLabel />

// Coral variant
<Progress value={45} variant="coral" size="lg" />
```

**Props**:
- `value`: Current progress value (0-100)
- `max`: Maximum value (default: 100)
- `variant`: `teal` | `coral` | `default`
- `size`: `sm` | `md` | `lg`
- `showLabel`: Show percentage text (boolean)

---

### 4. LoadingButton Component
**Location**: `/components/ui/loading-button.tsx`

**Features**:
- Extends the existing Button component
- Shows spinner during loading state
- Optional loading text
- Auto-disabled during loading
- Accessible with `aria-busy`

**Usage**:
```tsx
import { LoadingButton } from "@/components/ui/loading-button"

// Basic usage
<LoadingButton isLoading={isSubmitting}>
  Submit
</LoadingButton>

// With loading text
<LoadingButton
  isLoading={isSubmitting}
  loadingText="Saving..."
>
  Save Changes
</LoadingButton>

// Coral spinner variant
<LoadingButton
  isLoading={isDeleting}
  spinnerVariant="coral"
  variant="destructive"
>
  Delete
</LoadingButton>
```

---

## Updated Loading Pages

All loading.tsx files have been updated with:
1. **Accessibility**: `role="status"`, `aria-busy="true"`, descriptive `aria-label`
2. **Border Radius**: Matches design system (16px for cards = `rounded-2xl`, 12px for buttons = `rounded-xl`)
3. **Consistent Rounding**:
   - Headers: `rounded-lg`
   - Text: `rounded-md`
   - Buttons: `rounded-xl`
   - Cards: `rounded-2xl`
   - Icons/badges: `rounded-full` or `rounded-lg`

### Updated Files:
1. `/app/[orgSlug]/dashboard/loading.tsx`
2. `/app/[orgSlug]/billing/loading.tsx`
3. `/app/[orgSlug]/subscriptions/loading.tsx`
4. `/app/[orgSlug]/settings/loading.tsx`
5. `/app/[orgSlug]/settings/integrations/loading.tsx`
6. `/app/[orgSlug]/settings/members/loading.tsx`
7. `/components/ui/chart-skeleton.tsx`

**Note**: `/app/[orgSlug]/pipelines/loading.tsx` was already using a custom implementation with proper styling.

---

## CSS Updates

### Added Shimmer Animation
**Location**: `/app/globals.css`

```css
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
```

This animation is used by the Skeleton component for the smooth gradient effect.

---

## Accessibility Features

All components include proper ARIA attributes:

1. **Spinner**:
   - `role="status"`
   - `aria-busy="true"`
   - `aria-label="Loading"`
   - Screen reader text: "Loading..."

2. **Skeleton**:
   - `role="status"`
   - `aria-busy="true"`
   - `aria-label="Loading content"`
   - Screen reader text: "Loading..."

3. **Progress**:
   - `role="progressbar"`
   - `aria-valuemin`, `aria-valuemax`, `aria-valuenow`
   - `aria-label` with percentage

4. **LoadingButton**:
   - `aria-busy` when loading
   - Auto-disabled state

5. **Loading Pages**:
   - Container has `role="status"`, `aria-busy="true"`
   - Descriptive `aria-label` (e.g., "Loading dashboard", "Loading billing information")

---

## Design System Compliance

### Border Radius (matches `console.css`):
- **Cards**: `rounded-2xl` (16px) - Apple Health style
- **Buttons**: `rounded-xl` (12px)
- **Inputs**: `rounded-lg` (10px)
- **Headers**: `rounded-lg` (10px)
- **Text/Content**: `rounded-md` (8px)
- **Icons/Badges**: `rounded-full` or `rounded-lg`
- **Small Elements**: `rounded-sm` (6px)

### Colors:
All components use CSS variables from the design system:
- `--cloudact-teal`: #007A78
- `--cloudact-coral`: #FF6E50
- `--muted`: F1F5F9 (light) / #334155 (dark)
- Shimmer: `white/60` (light) / `white/10` (dark)

### Animations:
- **Shimmer**: 1.5s ease-in-out infinite
- **Spin**: Default Tailwind animation
- **Progress**: 300ms ease-in-out transition
- All animations respect `prefers-reduced-motion`

---

## Dark Mode Support

All components include dark mode variants:

1. **Spinner**: Border color adjusts automatically via Teal color variables
2. **Skeleton**: Shimmer opacity changes from 60% to 10%
3. **Progress**: Background uses `muted` color, bar uses Teal variables
4. **LoadingButton**: Inherits from Button component dark mode styles

Colors in dark mode:
- Teal: `#14B8A6` (lighter for contrast)
- Coral: `#FF8A73` (lighter for contrast)
- Skeleton shimmer: 10% opacity (subtle)

---

## Migration Guide

### Replace generic spinners:
```tsx
// Before
{isLoading && <Loader2 className="animate-spin" />}

// After
{isLoading && <Spinner size="md" />}
```

### Replace basic skeletons:
```tsx
// Before
<div className="animate-pulse bg-gray-200 h-8 w-64" />

// After
<Skeleton className="h-8 w-64 rounded-lg" />
```

### Replace button loading states:
```tsx
// Before
<Button disabled={isLoading}>
  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  Submit
</Button>

// After
<LoadingButton isLoading={isLoading}>
  Submit
</LoadingButton>
```

### Add progress bars:
```tsx
// New functionality
<Progress value={uploadProgress} max={100} showLabel />
```

---

## Performance Considerations

1. **Shimmer Animation**: Uses CSS transforms (GPU-accelerated) for smooth performance
2. **Reduced Motion**: All animations respect `prefers-reduced-motion` media query
3. **Dark Mode**: Uses CSS variables, no JavaScript required
4. **Bundle Size**: All components are tree-shakeable
5. **Rendering**: Skeleton components are lightweight (no data fetching)

---

## Testing Checklist

- [x] Spinner displays in all sizes
- [x] Spinner uses Teal color by default
- [x] Skeleton shimmer animation works in light mode
- [x] Skeleton shimmer animation works in dark mode
- [x] Progress bar transitions smoothly
- [x] LoadingButton shows spinner during loading
- [x] All loading pages match card border radius (16px)
- [x] All components have proper accessibility attributes
- [x] Dark mode colors are appropriate
- [x] Animations respect reduced motion preferences

---

## Browser Support

All components use standard CSS and are compatible with:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari 14+, Chrome Android 90+)

**Note**: CSS `@keyframes` and CSS variables are well-supported in all modern browsers.

---

## Future Improvements

Potential enhancements:
1. Add skeleton variants for specific components (table, card, form)
2. Create skeleton generator utility for custom layouts
3. Add indeterminate progress bar variant
4. Create loading state composition examples
5. Add animation duration/easing customization props

---

## Related Files

- Design System: `/app/globals.css`, `/app/[orgSlug]/console.css`
- Component Library: `/components/ui/`
- Loading States: `/app/[orgSlug]/*/loading.tsx`
- Documentation: `/components/ui/README_SKELETONS.md`

---

**Last Updated**: 2025-12-13
**Version**: 1.0.0
