---
name: brand-color-badges
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: app/\[orgSlug\]/.*\.(tsx|jsx)$
  - field: new_text
    operator: regex_match
    pattern: (POPULAR|FEATURED|RECOMMENDED|BEST|NEW).*bg-(slate|gray|black|neutral|zinc)-[89]00
---

## Brand Color Violation - Badge/Label

You're using **black/dark colors** for a promotional badge or label.

### CloudAct Brand Guidelines

Badges like "MOST POPULAR", "RECOMMENDED", etc. should use **brand teal**:

**Wrong:**
```tsx
<div className="bg-slate-900 text-white">MOST POPULAR</div>
```

**Correct:**
```tsx
<div className="bg-[#007A78] text-white">MOST POPULAR</div>
```

Or use CSS variable:
```tsx
<div className="bg-[var(--cloudact-teal)] text-white">MOST POPULAR</div>
```

### Brand Colors Reference
- **Teal (Primary):** #007A78 / `var(--cloudact-teal)`
- **Coral (Accent):** #FF6E50 / `var(--cloudact-coral)`

Use teal for trust/professional badges, coral for attention-grabbing CTAs.
