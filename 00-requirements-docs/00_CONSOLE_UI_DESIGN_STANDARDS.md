
# CloudAct Console UI Design Guide (v2.0)
**Status**: FINAL – Single Source of Truth  
**Updated**: 2025-12-13  
**Applies to**: Cloud Cost & Usage Console (Web)  
**Density**: Medium  
**Primary Users**: Individual, Company, Enterprise, Executives  

---

## 1. Design Philosophy

CloudAct follows a **calm, data-first, enterprise-grade visual language** inspired by early Apple Health.

**Core principle**
> White surfaces dominate. Data is primary. Color is an accent, never a surface.

**Non‑negotiables**
- No tinted cards
- No rainbow charts
- No brand-colored body text
- No decorative gradients
- Accent colors are subtle and semantic

---

## 2. Brand Color System

### Primary Palette

```css
--cloudact-teal: #007A78;
--cloudact-teal-light: #14B8A6;
--cloudact-teal-dark: #005F5D;

--cloudact-coral: #FF6E50;
--cloudact-coral-light: #FF8A73;
--cloudact-coral-dark: #E55A3C;
```

### Color Roles (Strict)

| Role | Color |
|----|----|
| Default data | Teal |
| Comparison data | Teal tints |
| Forecast / projected | Teal (dashed / lighter) |
| Savings / efficiency | Teal‑light |
| Anomaly / alert | Coral |
| UI chrome | Neutral grays only |

---

## 3. Accent & “Soft Coral Shadow” Standard

**Definition**
> Accent = glow, edge, or hint. Never a filled surface.

### Allowed Accent Patterns
- Thin left border (2–3px)
- Top‑edge gradient fade
- Subtle shadow tint

### Coral Limits
- Opacity: **≤ 6–8%**
- Area: **≤ 15% of component**

```css
box-shadow: 0 4px 12px rgba(255,110,80,0.08);
```

---

## 4. Quiet Score Cards

**Definition**
Quiet Score Cards surface key metrics with minimal visual noise.

### Rules
- White background only
- One primary metric
- Optional micro‑trend or delta
- Optional accent glow (teal default, coral for alerts only)

❌ No embedded full charts  
❌ No colored card fills  

---

## 5. Chart System (Recharts Standard)

### 5.1 Line Charts – Single Series

- Stroke: Teal (100%)
- Width: 2px
- Dots: Disabled (active dot on hover only)
- Area fill: Teal → transparent (6–10% max)

---

### 5.2 Line Charts – Multiple Series (Very Important)

Multiple colors are allowed **only with semantic meaning**.

#### Approved Extension Palette (Same Hue Family)

| Series Priority | Color |
|----|----|
| Primary | Teal (100%) |
| Secondary | Teal @ 70% |
| Tertiary | Teal @ 45% |
| Forecast | Teal dashed @ 60% |
| Anomaly | Coral (solid, no fill) |

**Rules**
- Never introduce a new hue
- Never exceed 4 lines per chart
- If more data exists → use table or filter

---

### 5.3 Bar Charts

- Default bars: Teal @ 75–80%
- Hover: Teal @ 100%
- Alerts: Coral @ 85%
- Radius: 4px (top only)
- No borders

---

### 5.4 Average / Benchmark Line Over Bars

**Correct Pattern**
- Average line: Neutral dark gray or Teal‑dark
- Stroke: 1.5px
- Dash: Short dash pattern
- Label: “Average” or “Benchmark”

❌ Do not use coral for averages  
❌ Do not use bright colors  

---

### 5.5 Pie / Donut Charts (Use Sparingly)

Pie charts are **secondary** in CloudAct.

**Allowed Colors**
- Teal (primary slice)
- Teal‑light
- Teal @ 50%
- Teal @ 30%
- Coral (alerts only)

**Rules**
- Max 4–5 slices
- Prefer donut over pie
- Always show numeric labels or legend
- No gradients

If more than 5 categories → use table + bar chart instead.

---

## 6. Gridlines, Axes & Labels

- Gridlines: Light gray only
- Horizontal gridlines only
- Axis labels: Neutral gray, 12–13px
- Never brand‑colored axes or ticks

---

## 7. Tables + Charts Inline (Preferred Layout)

```
Section Header
→ Compact inline chart
→ Detailed data table
```

Tables are first‑class citizens and must work without color.

### Table Standards
- Font: 13–14px
- Row height: 40–44px
- Zebra striping: Very subtle
- No colored rows

---

## 8. Sidebar Navigation – Progressive Hierarchy

**Principle**
> Navigation becomes quieter as hierarchy deepens.

### Font Scale
| Level | Size | Weight |
|----|----|----|
| L1 | 14px | Semibold |
| L2 | 13px | Regular |
| L3 | 12px | Regular |

### Visual Rules
- White or light‑gray background
- Active = teal text + thin indicator
- Icons only at top level
- No filled active backgrounds

---

## 9. Layout & Spacing

- Card padding: 16–20px
- Section spacing: 24–32px
- Chart height: Compact
- Border radius: 10–12px

Medium density = efficient, never cramped.

---

## 10. Theme System

Themes control **light / dark appearance only**.

Themes do NOT:
- Increase color usage
- Change density
- Alter chart rules

Dark mode follows identical restraint principles.

---

## 11. Guardrails (Enforced)

- No tinted cards
- No rainbow charts
- No brand‑colored text
- Accent opacity ≤ 10%
- Charts must remain readable in grayscale

---

## 12. Versioning

- v1.x – Structural reference
- **v2.0 – Visual + experiential authority**
- All new features must comply with v2.0

---

**This document is the final authority for CloudAct Console UI.**
