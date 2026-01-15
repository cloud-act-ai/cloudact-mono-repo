# Console UI Design Standards

**v2.7** | 2026-01-15

> Apple Health design pattern for FinOps

---

## Brand Colors

| Color | Hex | Use |
|-------|-----|-----|
| Mint | `#90FCA6` | Primary buttons, success |
| Coral | `#FF6C5E` | Warnings, costs, alerts |
| Obsidian | `#0a0a0b` | Dark buttons (auth) |

---

## Design Principles

- White card backgrounds (pure white)
- Mint for features, Coral for costs
- `max-w-7xl` bounded width
- 8px spacing grid

---

## Buttons

```css
.cloudact-btn-primary    /* Mint - console CTAs */
.cloudact-btn-dark       /* Obsidian - auth flows */
.cloudact-btn-destructive /* Coral - delete */
```

---

## Layout

```
Container: max-w-7xl mx-auto
Cards: bg-white rounded-lg shadow-sm
Spacing: 8px grid (p-2, p-4, p-6, p-8)
```

---

## Key Files

| File | Purpose |
|------|---------|
| `globals.css` | CSS variables |
| `console.css` | Console styles |
| `premium.css` | Premium components |
