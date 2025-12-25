---
name: warn-inline-button-styles
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: app/\[orgSlug\]/.*\.(tsx|jsx)$
  - field: new_text
    operator: regex_match
    pattern: <button[^>]*className=[^>]*(bg-slate-|bg-gray-|bg-neutral-|bg-zinc-)[0-9]+[^>]*>
---

## Inline Button Styling Detected

You're using **inline Tailwind background colors** on a button in the console UI.

### Why This Matters
The console UI has a **design system with predefined button styles** that ensure:
- Consistent brand colors (Teal #007A78, Coral #FF6E50)
- Proper hover/focus/active states
- Accessibility compliance
- Visual consistency across the app

### Design System Button Classes

| Purpose | Class |
|---------|-------|
| Primary CTA | `console-button-primary` |
| Secondary action | `console-button-secondary` |
| Danger/delete | `console-button-destructive` |
| Subtle/ghost | `console-button-ghost` |
| Outlined | `console-button-outline` |

### Quick Fix

Replace inline styles:
```tsx
// Before
<button className="bg-gray-800 text-white px-4 py-2 rounded-lg">

// After
<button className="console-button-primary">
```

### Additional Styling

If you need custom sizing, add it alongside the design class:
```tsx
<button className="console-button-primary h-11 px-6 text-[14px]">
```

The design system handles colors, shadows, and states - you just customize size if needed.
