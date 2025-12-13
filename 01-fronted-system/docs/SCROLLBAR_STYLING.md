# Scrollbar Styling Documentation

## Overview

This document describes the scrollbar styling implementation across the CloudAct frontend application. All scrollbars follow the brand design system with Teal and gray colors.

## Brand Colors

```css
/* Light Mode */
--scrollbar-track: #F1F5F9 (Slate 100)
--scrollbar-thumb: #CBD5E1 (Slate 300)
--scrollbar-thumb-hover: #007A78 (CloudAct Teal)

/* Dark Mode */
--scrollbar-track: #1E293B (Slate 800)
--scrollbar-thumb: #475569 (Slate 600)
--scrollbar-thumb-hover: #14B8A6 (CloudAct Teal Light)
```

## Implementation Details

### 1. Global Scrollbar Styling

Location: `/app/globals.css`

All scrollbars across the application use:
- **Width**: 8px (desktop), 4px (mobile)
- **Thumb**: Gray by default, Teal on hover
- **Track**: Very light gray background
- **Smooth transitions**: 0.2s ease

### 2. Console-Specific Styling

Location: `/app/[orgSlug]/console.css`

Enhanced scrollbars for the console with:
- Custom CSS variables for easy theming
- Specific styling for main content area
- Sidebar scrollbar styling
- Table scrollbar with fade indicators

### 3. Landing Page Styling

Location: `/app/(landingPages)/landing.css`

Consistent brand-aligned scrollbars for public marketing pages.

### 4. ScrollArea Component

Location: `/components/ui/scroll-area.tsx`

Radix UI-based scroll area component featuring:
- Vertical and horizontal scrolling support
- Touch-friendly mobile scrolling
- Dark mode support
- Brand color integration

## Browser Support

### Webkit Browsers (Chrome, Safari, Edge)

```css
*::-webkit-scrollbar { width: 8px; height: 8px; }
*::-webkit-scrollbar-track { background: #F1F5F9; }
*::-webkit-scrollbar-thumb { background: #CBD5E1; }
*::-webkit-scrollbar-thumb:hover { background: #007A78; }
*::-webkit-scrollbar-corner { background: #F1F5F9; }
```

### Firefox

```css
* {
  scrollbar-width: thin;
  scrollbar-color: #CBD5E1 #F1F5F9;
}
```

## Responsive Behavior

### Desktop (> 768px)
- Scrollbar width: 8px
- Visible track and thumb
- Hover state changes to Teal

### Mobile (≤ 768px)
- Scrollbar width: 4px (thinner)
- Native scroll behavior on touch devices
- Reduced visual prominence

## ScrollArea Component Usage

### Basic Usage

```tsx
import { ScrollArea } from "@/components/ui/scroll-area"

<ScrollArea className="h-[400px] w-full">
  <div className="p-4">
    {/* Your scrollable content */}
  </div>
</ScrollArea>
```

### Horizontal Scrolling

```tsx
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

<ScrollArea className="w-full whitespace-nowrap">
  <div className="flex gap-4">
    {/* Wide content */}
  </div>
  <ScrollBar orientation="horizontal" />
</ScrollArea>
```

### Both Directions

```tsx
<ScrollArea className="h-[400px] w-full">
  <div className="w-[800px]">
    {/* Content wider and taller than container */}
  </div>
  <ScrollBar orientation="horizontal" />
</ScrollArea>
```

## Key Features

### 1. Scrollbar Thumb Color
- Default: Gray (`#CBD5E1`)
- Hover: Teal (`#007A78`)
- Dark Mode Default: Gray (`#475569`)
- Dark Mode Hover: Teal Light (`#14B8A6`)

### 2. Scrollbar Track Color
- Light Mode: Very light gray (`#F1F5F9`)
- Dark Mode: Dark gray (`#1E293B`)

### 3. Thumb Hover State
- Smooth color transition (0.2s ease)
- Changes to brand Teal color
- Provides visual feedback

### 4. Thin Scrollbar on Desktop
- 8px width for comfortable interaction
- Not too thick to obstruct content
- Not too thin to be hard to click

### 5. Native Scroll on Mobile
- 4px width for minimal visual impact
- Touch-optimized
- Uses native mobile scroll behavior

### 6. Smooth Scrolling
- `scroll-behavior: smooth` on `<html>`
- Respects `prefers-reduced-motion`
- Disabled in reduced motion mode

### 7. Corner Piece Styled
- Matches track color
- Styled for both light and dark modes
- Appears when both scrollbars are visible

### 8. Horizontal Scroll Support
- Same styling as vertical scrollbars
- Consistent height (8px desktop, 4px mobile)
- Used in tables and wide content areas

### 9. Fade Indicators
- CSS gradient overlays on `.console-table-card`
- Left/right fade for horizontal scroll
- Shows when content is scrolled

### 10. Cross-Browser Consistency
- Webkit-specific styles for Chrome/Safari/Edge
- Firefox-specific `scrollbar-width` and `scrollbar-color`
- Fallback to native scrollbars if custom styles unsupported

## Accessibility

### Reduced Motion Support

```css
@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}
```

### Keyboard Navigation
- Scrollbars don't interfere with keyboard focus
- Arrow keys work for scrolling
- Tab navigation unaffected

### Touch Devices
- Thinner scrollbars on mobile (4px)
- Native touch scrolling preserved
- Momentum scrolling supported

## Console-Specific Features

### Main Content Area

```css
.console-main-gradient::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}
```

### Sidebar Scrolling

```css
[data-sidebar="sidebar"]::-webkit-scrollbar {
  width: 8px;
}
```

### Table Fade Indicators

```css
.console-table-card::before {
  background: linear-gradient(to right, var(--surface-primary), transparent);
}
```

## Testing Checklist

- [ ] Scrollbar thumb is gray by default
- [ ] Scrollbar thumb turns Teal on hover
- [ ] Scrollbar track is very light gray
- [ ] Scrollbar width is 8px on desktop
- [ ] Scrollbar width is 4px on mobile
- [ ] Dark mode scrollbars use appropriate colors
- [ ] Corner piece is styled (when both scrollbars visible)
- [ ] Horizontal scrolling works in tables
- [ ] Smooth scrolling enabled (unless reduced motion)
- [ ] Firefox shows thin scrollbars
- [ ] Chrome/Safari/Edge show custom scrollbars

## Files Modified

1. `/app/globals.css` - Global scrollbar styling
2. `/app/[orgSlug]/console.css` - Console-specific enhancements
3. `/app/(landingPages)/landing.css` - Landing page scrollbars
4. `/components/ui/scroll-area.tsx` - ScrollArea component (NEW)
5. `/components/ui/scroll-area-example.tsx` - Usage examples (NEW)

## Migration Guide

If you have existing code using `overflow-y-auto` or `overflow-x-auto`, you can optionally migrate to the ScrollArea component for enhanced control:

```tsx
// Before
<div className="h-[400px] overflow-y-auto">
  {content}
</div>

// After (with ScrollArea)
<ScrollArea className="h-[400px]">
  {content}
</ScrollArea>
```

The ScrollArea component provides:
- Consistent cross-browser behavior
- Better mobile support
- More styling control
- Horizontal scroll support

However, native `overflow-auto` will still work and use the global scrollbar styles defined in CSS.

## Dark Mode Support

All scrollbar styles automatically adapt to dark mode:

```tsx
<html className="dark">
  {/* Scrollbars use dark mode colors */}
</html>
```

Colors are defined using CSS custom properties that change based on the `.dark` class.

---

**Last Updated**: 2025-12-13
**Maintained By**: Frontend Team
**Related Docs**:
- [Design System](/docs/DESIGN_SYSTEM.md)
- [Accessibility Guide](/docs/ACCESSIBILITY.md)
