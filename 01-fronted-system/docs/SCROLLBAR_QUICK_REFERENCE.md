# Scrollbar Styling - Quick Reference

## Visual Reference

```
┌─────────────────────────────┐
│  Content Area               │
│                             │ ═══  Track (Light Gray)
│                             ║ ██   Thumb (Gray → Teal on Hover)
│                             ║ ██
│                             ║ ██
│                             ║
│                             ║
│                             ║
│                             ═══
└─────────────────────────────┘
```

## Color Palette

### Light Mode
| Element | Color | Hex | Usage |
|---------|-------|-----|-------|
| Thumb Default | Gray | `#CBD5E1` | Default scrollbar thumb |
| Thumb Hover | Teal | `#007A78` | When hovering over thumb |
| Track | Light Gray | `#F1F5F9` | Scrollbar background track |
| Corner | Light Gray | `#F1F5F9` | Where scrollbars meet |

### Dark Mode
| Element | Color | Hex | Usage |
|---------|-------|-----|-------|
| Thumb Default | Gray | `#475569` | Default scrollbar thumb |
| Thumb Hover | Teal Light | `#14B8A6` | When hovering over thumb |
| Track | Dark Gray | `#1E293B` | Scrollbar background track |
| Corner | Dark Gray | `#1E293B` | Where scrollbars meet |

## Size Specifications

```css
/* Desktop (> 768px) */
width: 8px;
height: 8px;
border-radius: 4px;

/* Mobile (≤ 768px) */
width: 4px;
height: 4px;
border-radius: 2px;
```

## Usage Patterns

### 1. Native Overflow (Automatic)

```tsx
// No changes needed - global styles apply automatically
<div className="h-[400px] overflow-y-auto">
  {content}
</div>
```

### 2. ScrollArea Component (Recommended)

```tsx
import { ScrollArea } from "@/components/ui/scroll-area"

<ScrollArea className="h-[400px] w-full">
  {content}
</ScrollArea>
```

### 3. Horizontal Scrolling

```tsx
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

<ScrollArea className="w-full whitespace-nowrap">
  <div className="flex gap-4">
    {wideContent}
  </div>
  <ScrollBar orientation="horizontal" />
</ScrollArea>
```

## States

```
┌─────────────────────────┐
│ State         │ Color   │ Duration │
├───────────────┼─────────┼──────────┤
│ Default       │ Gray    │ -        │
│ Hover         │ Teal    │ 0.2s     │
│ Active/Drag   │ Teal    │ -        │
└─────────────────────────┘
```

## Browser Support

✅ Chrome/Edge - Full support (Webkit)
✅ Safari - Full support (Webkit)
✅ Firefox - Full support (scrollbar-width/scrollbar-color)
✅ Mobile Safari - Thin native scrollbars
✅ Chrome Android - Thin native scrollbars

## Common Use Cases

### Sidebar Menu
```tsx
<ScrollArea className="h-screen w-64">
  <nav>{menuItems}</nav>
</ScrollArea>
```

### Data Table
```tsx
<ScrollArea className="h-[500px]">
  <table>{rows}</table>
</ScrollArea>
```

### Modal Content
```tsx
<ScrollArea className="max-h-[60vh]">
  <div className="p-6">{content}</div>
</ScrollArea>
```

### Code Block
```tsx
<ScrollArea className="h-[300px]">
  <pre><code>{code}</code></pre>
  <ScrollBar orientation="horizontal" />
</ScrollArea>
```

## CSS Variables

```css
:root {
  --scrollbar-track: #F1F5F9;
  --scrollbar-thumb: #CBD5E1;
  --scrollbar-thumb-hover: #007A78;
}

.dark {
  --scrollbar-track: #1E293B;
  --scrollbar-thumb: #475569;
  --scrollbar-thumb-hover: #14B8A6;
}
```

## File Locations

| File | Purpose |
|------|---------|
| `app/globals.css` | Global scrollbar base styles |
| `app/[orgSlug]/console.css` | Console-specific enhancements |
| `app/(landingPages)/landing.css` | Landing page scrollbars |
| `components/ui/scroll-area.tsx` | ScrollArea component |
| `components/ui/scroll-area-example.tsx` | Usage examples |

## Testing Quick Check

Run through these visual checks:

1. ✓ Scrollbar appears on overflow content
2. ✓ Thumb is gray by default
3. ✓ Thumb turns teal on hover
4. ✓ Track is light gray background
5. ✓ Width is 8px on desktop
6. ✓ Width is 4px on mobile
7. ✓ Smooth scrolling enabled
8. ✓ Dark mode shows correct colors
9. ✓ Horizontal scrolling works
10. ✓ Cross-browser consistency

## Accessibility Features

- ✓ Respects `prefers-reduced-motion`
- ✓ Keyboard navigation support
- ✓ Touch-friendly on mobile
- ✓ High contrast in dark mode
- ✓ Focus indicators preserved

## Performance Notes

- Transitions use GPU acceleration
- No JavaScript required for basic scrolling
- ScrollArea component uses Radix UI (optimized)
- Minimal performance impact

---

**Quick Start**: For most cases, native `overflow-auto` will work perfectly with the global styles. Use `<ScrollArea>` component when you need enhanced control or cross-browser consistency.

**Need Help?** See full documentation in `SCROLLBAR_STYLING.md`
