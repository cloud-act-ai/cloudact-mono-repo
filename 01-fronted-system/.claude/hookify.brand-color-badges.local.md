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

Badges like "MOST POPULAR", "RECOMMENDED", etc. should use **brand mint**:

**Wrong:**
```tsx
<div className="bg-slate-900 text-white">MOST POPULAR</div>
```

**Correct:**
```tsx
<div className="bg-[#90FCA6] text-black">MOST POPULAR</div>
```

Or use CSS variable:
```tsx
<div className="bg-[var(--cloudact-mint)] text-black">MOST POPULAR</div>
```

### Brand Colors Reference
- **Mint (Primary):** #90FCA6 / `var(--cloudact-mint)` - use black text
- **Coral (Accent):** #FF6C5E / `var(--cloudact-coral)` - use white text
- **Blue (Links/Info):** #007AFF / `var(--cloudact-blue)`

Use mint for trust/professional badges, coral for attention-grabbing CTAs.
