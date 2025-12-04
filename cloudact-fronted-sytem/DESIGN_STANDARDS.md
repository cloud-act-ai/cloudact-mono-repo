# CloudAct Design System

**Brand:** Teal (#007A78) + Coral (#FF6E50)
**Font:** DM Sans (no fallbacks)
**Spacing:** 8px base unit

---

## Brand Colors

```css
/* Primary - Teal */
--cloudact-teal: #007A78
--cloudact-teal-light: #14B8A6
--cloudact-teal-dark: #005F5D

/* Secondary - Coral */
--cloudact-coral: #FF6E50
--cloudact-coral-light: #FF8A73
--cloudact-coral-dark: #E55A3C
```

## Slate Neutrals

```css
--slate-50: #F8FAFC   /* Backgrounds */
--slate-100: #F1F5F9  /* Hover bg */
--slate-200: #E2E8F0  /* Borders */
--slate-500: #64748B  /* Muted text */
--slate-700: #334155  /* Body text */
--slate-800: #1E293B  /* Emphasis */
--slate-900: #0F172A  /* Headings */
```

## Chart Colors

```css
--chart-1: #007A78  /* Teal */
--chart-2: #FF6E50  /* Coral */
--chart-3: #8B5CF6  /* Violet */
--chart-4: #F59E0B  /* Amber */
--chart-5: #3B82F6  /* Blue */
--chart-6: #10B981  /* Emerald */
```

---

## Typography

| Element | Size | Weight | Letter-spacing | Color |
|---------|------|--------|----------------|-------|
| Page Title | 1.5rem | 700 | -0.025em | #0F172A |
| Section Heading | 1.25rem | 600 | -0.015em | #0F172A |
| Card Title | 1rem | 600 | -0.01em | #1E293B |
| Body | 0.875rem | 400 | normal | #334155 |
| Subheading | 0.875rem | 400 | normal | #64748B |
| Small | 0.75rem | 400 | normal | #64748B |
| Table Header | 0.6875rem | 600 | 0.06em | #64748B |
| Metric | 2rem | 700 | normal | #0F172A |

### CSS Classes
```css
.console-page-title
.console-heading
.console-card-title
.console-body
.console-subheading
.console-small
.console-metric
.console-metric-teal
.console-metric-coral
```

---

## Spacing (8px base)

```
8px   (0.5rem)  - Base unit
12px  (0.75rem) - Small gaps
16px  (1rem)    - Standard padding
24px  (1.5rem)  - Card padding
32px  (2rem)    - Section spacing
```

### Tailwind Classes
- `space-y-8` - Page sections
- `p-6` - Card padding
- `gap-3` - Icon + text
- `px-4 py-3.5` - Table cells
- `px-5 py-2.5` - Buttons
- `px-2.5 py-1` - Badges

---

## Shadows

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.06), 0 2px 4px -1px rgba(0, 0, 0, 0.04);
--shadow-hover: 0 8px 25px -5px rgba(0, 122, 120, 0.18), 0 4px 10px -3px rgba(0, 0, 0, 0.06);
--shadow-teal: 0 4px 14px rgba(0, 122, 120, 0.15);
--shadow-coral: 0 4px 14px rgba(255, 110, 80, 0.15);
```

---

## Border Radius

```css
--radius-sm: 6px   /* Inputs */
--radius-md: 8px   /* Buttons */
--radius-lg: 10px  /* Cards */
--radius-xl: 14px  /* Large cards */
--radius-full: 9999px /* Badges */
```

---

## Components

### Buttons

```css
.console-button-primary   /* Teal bg, white text */
.console-button-secondary /* White bg, border */
.console-button-coral     /* Coral bg, white text */
```

**Hover:** `translateY(-2px)` + enhanced shadow

### Cards

```css
.console-stat-card   /* Stats with hover lift */
.console-chart-card  /* Charts container */
.console-table-card  /* Table wrapper */
```

### Tables

```css
.console-table-card        /* Wrapper */
.console-table-header-row  /* Header bg */
.console-table-header      /* Header cell */
.console-table-row         /* Body row */
.console-table-cell        /* Body cell */
```

Row hover: `#F0FDFA` (teal tint)

### Badges

```css
.console-badge         /* Base */
.console-badge-teal    /* Teal variant */
.console-badge-coral   /* Coral variant */
.console-badge-success /* Green */
.console-badge-warning /* Amber */
.console-badge-error   /* Red */
```

### Tabs

```css
.console-tabs  /* Container */
.console-tab   /* Tab item */
```

Active: Teal text + Coral underline

---

## Patterns

### Page Header

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

### Accordion Item

```jsx
<AccordionItem className="border border-slate-200 rounded-xl px-5 py-1 shadow-sm hover:shadow-md transition-shadow">
  <AccordionTrigger className="hover:no-underline py-4">
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-lg bg-[#007A78]/10">
        <Icon className="h-5 w-5 text-[#007A78]" />
      </div>
      <span className="font-semibold text-slate-900">Title</span>
      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-xs font-medium text-slate-600">
        {count} items
      </span>
    </div>
  </AccordionTrigger>
</AccordionItem>
```

### Icon Background

```jsx
/* Teal gradient */
<div className="p-2.5 rounded-lg bg-gradient-to-br from-[#007A78]/10 to-[#14B8A6]/10">
  <Icon className="h-6 w-6 text-[#007A78]" />
</div>

/* Teal solid */
<div className="p-2 rounded-lg bg-[#007A78]/10">
  <Icon className="h-5 w-5 text-[#007A78]" />
</div>

/* Coral */
<div className="p-2 rounded-lg bg-[#FF6E50]/10">
  <Icon className="h-5 w-5 text-[#FF6E50]" />
</div>
```

### Success Alert

```jsx
<Alert className="border-[#007A78]/20 bg-[#F0FDFA]">
  <Check className="h-4 w-4 text-[#007A78]" />
  <AlertTitle className="text-[#007A78]">Success</AlertTitle>
  <AlertDescription>{message}</AlertDescription>
</Alert>
```

---

## Hero / Banner Treatments

### Teal Banner (Primary)
```jsx
<div className="banner-teal rounded-xl p-8">
  <h1 className="text-hero text-white">
    GenAI Cloud Cost Intelligence. <span className="opacity-90">Simplified.</span>
  </h1>
</div>
```

### Coral Banner (Secondary/CTA)
```jsx
<div className="banner-coral rounded-xl p-8">
  <h1 className="text-hero text-white">
    Start Saving Today
  </h1>
</div>
```

### CSS Classes
```css
.banner-teal          /* Teal gradient with radial glow */
.banner-coral         /* Coral gradient with radial glow */
.text-hero            /* 2.5rem, bold, text-shadow */
.text-hero-sm         /* 1.75rem, bold, text-shadow */
.text-shadow-subtle   /* Subtle text shadow */
.text-shadow-strong   /* Strong text shadow */
.text-teal-glow       /* Teal text with glow */
.text-coral-glow      /* Coral text with glow */
.text-gradient-teal   /* Gradient text teal */
.text-gradient-coral  /* Gradient text coral */
.card-teal-accent     /* White card with teal left border */
.card-coral-accent    /* White card with coral left border */
```

### Gradient Text Example
```jsx
<h2 className="text-gradient-coral text-2xl font-bold">
  Cost Optimization
</h2>
```

### Accent Cards
```jsx
/* Teal accent - for primary info */
<div className="card-teal-accent p-6">
  <h3>Usage Summary</h3>
</div>

/* Coral accent - for alerts/CTAs */
<div className="card-coral-accent p-6">
  <h3>Action Required</h3>
</div>
```

---

## Transitions

```css
/* Standard */
transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

/* Slow (cards) */
transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

/* Quick (tables) */
transition: background-color 0.15s ease;
```

---

## Files

| File | Purpose |
|------|---------|
| `app/globals.css` | Design tokens, base styles |
| `app/[orgSlug]/console.css` | Console components |

---

*CloudAct Design System v2.0*
