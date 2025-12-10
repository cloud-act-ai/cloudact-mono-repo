# CloudAct Design System

**Brand:** Teal (#007A78) + Coral (#FF6E50) | **Font:** DM Sans | **Spacing:** 8px base

## Colors
```css
--cloudact-teal: #007A78      --cloudact-coral: #FF6E50
--cloudact-teal-light: #14B8A6   --cloudact-coral-light: #FF8A73
--cloudact-teal-dark: #005F5D    --cloudact-coral-dark: #E55A3C
```

## Typography
| Element | Size | Weight | Letter-spacing |
|---------|------|--------|----------------|
| Page Title | 1.5rem | 700 | -0.025em |
| Heading | 1.25rem | 600 | -0.015em |
| Card Title | 1rem | 600 | -0.01em |
| Body | 0.875rem | 400 | normal |
| Table Header | 0.6875rem | 600 | 0.06em |

## Classes
```css
.console-page-title    .console-heading      .console-card-title
.console-body          .console-subheading   .console-small
.console-metric        .console-metric-teal  .console-metric-coral
.console-button-primary   .console-button-secondary   .console-button-coral
.console-stat-card     .console-chart-card   .console-table-card
.console-badge-teal    .console-badge-coral  .console-badge-success
```

## Spacing
`space-y-8` sections | `p-6` cards | `gap-3` icon+text | `px-4 py-3.5` cells

## Patterns

**Page Header:**
```jsx
<div className="space-y-2">
  <div className="flex items-center gap-3">
    <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#007A78]/10 to-[#14B8A6]/10">
      <Icon className="h-6 w-6 text-[#007A78]" />
    </div>
    <h1 className="console-page-title">Title</h1>
  </div>
  <p className="console-subheading ml-12">Description</p>
</div>
```

**Accordion:**
```jsx
<AccordionItem className="border border-slate-200 rounded-xl px-5 py-1 shadow-sm hover:shadow-md">
  <AccordionTrigger className="hover:no-underline py-4">
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-lg bg-[#007A78]/10">
        <Icon className="h-5 w-5 text-[#007A78]" />
      </div>
      <span className="font-semibold text-slate-900">Title</span>
      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-xs font-medium text-slate-600">{count}</span>
    </div>
  </AccordionTrigger>
</AccordionItem>
```

**Charts:** `#007A78` `#FF6E50` `#8B5CF6` `#F59E0B` `#3B82F6` `#10B981`

See `DESIGN_STANDARDS.md` for full reference.
