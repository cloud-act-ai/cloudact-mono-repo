# CloudAct Console UI Design Guide

**Version 2.7** | **Status:** Final | **Updated:** 2025-12-24

---

## Document Info

| Property | Value |
|----------|-------|
| Applies to | Cloud Cost & Usage Console (Web + Mobile) |
| Density | Medium |
| Design Style | Apple Health (adapted for FinOps/GenAI) |
| Brand Colors | Teal + Coral |

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Brand Color System](#2-brand-color-system)
3. [Category Color System](#3-category-color-system)
4. [CSS Architecture](#4-css-architecture)
5. [Background & Gradients](#5-background--gradients)
6. [Metric Cards](#6-metric-cards)
7. [Sidebar Navigation](#7-sidebar-navigation)
8. [Button System](#8-button-system)
9. [Chart System](#9-chart-system)
10. [Tables](#10-tables)
11. [Forms](#11-forms)
12. [Modal & Dialog System](#12-modal--dialog-system)
13. [Tooltip System](#13-tooltip-system)
14. [Date Picker System](#14-date-picker-system)
15. [Layout & Spacing](#15-layout--spacing)
16. [Accessibility](#16-accessibility)

---

## 1. Design Philosophy

CloudAct follows the **Apple Health design style** adapted for **FinOps and GenAI cost analytics**.

### Core Principles

> White surfaces dominate. Teal is primary. Coral is for costs/alerts.
> Use Teal family for features, Coral family for money/costs.

### Key Characteristics

- **White card backgrounds** - Pure white, no tints
- **Teal for features** - Pipelines, integrations, settings
- **Coral for costs** - Subscriptions, billing, spending
- **Soft gradient header** - Teal/Coral gradient at top
- **Data-first layout** - Metrics are prominent

### Color Strategy

| Domain | Color Family | Why |
|--------|--------------|-----|
| Features & Tools | Teal | Primary brand, productivity |
| Costs & Money | Coral | Attention, spending alerts |
| Status | Semantic | Success/Warning/Error |

---

## 1.1 Premium White Theme Requirements

**CRITICAL: NO GRAY BACKGROUNDS**

The console uses a premium shiny white theme. Never use gray backgrounds like `#F5F5F7`, `#FAFAFA`, `#E8E8ED`.

### What to Use Instead

| Old Gray Value | Replacement | Usage |
|----------------|-------------|-------|
| `#F5F5F7` | `rgba(0, 122, 120, 0.04)` or `bg-[#007A78]/5` | Subtle backgrounds |
| `#FAFAFA` | `#FFFFFF` | Surface backgrounds |
| `#E8E8ED` | `rgba(0, 122, 120, 0.06)` or `bg-[#007A78]/8` | Hover states |
| `#8E8E93/10` | `rgba(0, 122, 120, 0.06)` or `bg-[#007A78]/8` | Icon backgrounds |

### CSS Classes (console.css)

Use these instead of hardcoded values:
- `.hover-premium` - Hover with subtle teal tint
- `.bg-neutral-premium` - Neutral background with teal tint
- `.row-hover-premium` - Table row hover
- `.icon-bg-neutral` - Icon container background
- `.status-neutral` - Neutral status badge
- `.console-badge-neutral` - Neutral badge

### Separation Without Gray

Use shadows instead of gray backgrounds for visual separation:
- Sidebar: White background + right shadow (`box-shadow: 2px 0 12px rgba(0, 0, 0, 0.04)`)
- Cards: White background + subtle shadow (`var(--shadow-premium-sm)`)
- Borders: Ultra-subtle (`rgba(0, 0, 0, 0.04)`)

---

## 2. Brand Color System

### Primary Palette

**Teal Family (Features)**

| Token | Hex | Usage |
|-------|-----|-------|
| `--cloudact-teal` | `#007A78` | Primary, main features |
| `--cloudact-teal-light` | `#14B8A6` | Hover, secondary features |
| `--cloudact-teal-dark` | `#005F5D` | Pressed, emphasis |
| Teal @ 70% | `rgba(0,122,120,0.7)` | Tertiary features |
| Teal @ 45% | `rgba(0,122,120,0.45)` | Quaternary |
| Teal @ 20% | `rgba(0,122,120,0.2)` | Focus rings |
| Teal @ 10% | `rgba(0,122,120,0.1)` | Active backgrounds |
| Teal @ 5% | `rgba(0,122,120,0.05)` | Hover backgrounds |

**Coral Family (Costs)**

| Token | Hex | Usage |
|-------|-----|-------|
| `--cloudact-coral` | `#FF6E50` | Costs, spending, alerts |
| `--cloudact-coral-light` | `#FF8A73` | Hover, secondary cost |
| `--cloudact-coral-dark` | `#E55A3C` | Pressed, emphasis |
| Coral @ 70% | `rgba(255,110,80,0.7)` | Tertiary cost |
| Coral @ 20% | `rgba(255,110,80,0.2)` | Error focus rings |
| Coral @ 10% | `rgba(255,110,80,0.1)` | Cost active backgrounds |
| Coral @ 5% | `rgba(255,110,80,0.05)` | Cost hover backgrounds |

### Semantic Colors (Status Only)

| Color | Hex | Usage |
|-------|-----|-------|
| Green | `#34C759` | Success, active |
| Orange | `#FF9500` | Warning, trialing |
| Red | `#FF3B30` | Error, destructive |
| Gray | `#8E8E93` | Neutral, disabled |

---

## 3. Category Color System

### CloudAct Categories

**Teal Family (Features & Tools)**

| Category | Color | Hex |
|----------|-------|-----|
| Dashboard | Teal | `#007A78` |
| Pipelines | Teal-dark | `#005F5D` |
| Integrations | Teal-light | `#14B8A6` |
| Cloud Providers | Teal | `#007A78` |
| LLM Providers | Teal-dark | `#005F5D` |
| Team/Members | Teal-light | `#14B8A6` |
| Organization | Teal | `#007A78` |
| Settings | Gray | `#8E8E93` |

**Coral Family (Costs & Money)**

| Category | Color | Hex |
|----------|-------|-----|
| Subscription Costs | Coral | `#FF6E50` |
| Billing | Coral-light | `#FF8A73` |
| SaaS Subscriptions | Coral | `#FF6E50` |
| Daily/MTD/YTD Costs | Coral | `#FF6E50` |

### Category CSS Classes

```css
/* Teal family (features) */
.category-teal { color: #007A78; }
.category-teal-light { color: #14B8A6; }
.category-teal-dark { color: #005F5D; }

/* Coral family (costs) */
.category-coral { color: #FF6E50; }
.category-coral-light { color: #FF8A73; }
.category-coral-dark { color: #E55A3C; }

/* Status (semantic) */
.category-success { color: #34C759; }
.category-warning { color: #FF9500; }
.category-error { color: #FF3B30; }
.category-neutral { color: #8E8E93; }
```

---

## 4. CSS Architecture

### File Structure

| File | Scope | Contents |
|------|-------|----------|
| `globals.css` | All pages | Variables, `.cloudact-btn-*` |
| `console.css` | Dashboard | `.metric-card-*`, `.console-*` |
| `landing.css` | Marketing | Landing-specific styles |

### CSS Variables

```css
:root {
  /* Brand - Teal Family */
  --cloudact-teal: #007A78;
  --cloudact-teal-light: #14B8A6;
  --cloudact-teal-dark: #005F5D;

  /* Brand - Coral Family */
  --cloudact-coral: #FF6E50;
  --cloudact-coral-light: #FF8A73;
  --cloudact-coral-dark: #E55A3C;

  /* Semantic */
  --success: #34C759;
  --warning: #FF9500;
  --error: #FF3B30;
  --neutral: #8E8E93;

  /* Surfaces - Premium White (NO GRAY) */
  --surface-primary: #FFFFFF;
  --surface-secondary: #FFFFFF;
  --surface-tertiary: rgba(0, 122, 120, 0.02);  /* Subtle teal tint */
  --surface-hover: rgba(0, 122, 120, 0.03);     /* Hover state */

  /* Borders */
  --border-light: rgba(0, 0, 0, 0.04);  /* Very subtle */
  --border-medium: rgba(0, 0, 0, 0.08);

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-elevated: 0 4px 16px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04);
  --shadow-xl: 0 10px 40px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06);
}
```

---

## 5. Background & Gradients

### Header Gradient

Soft Teal + Coral gradient at top, fading to white.

```css
.console-main-gradient {
  background:
    radial-gradient(ellipse 80% 50% at 90% 0%, rgba(0, 122, 120, 0.08) 0%, transparent 60%),
    radial-gradient(ellipse 50% 40% at 100% 5%, rgba(255, 110, 80, 0.06) 0%, transparent 50%);
  background-color: #FFFFFF;
}
```

### Rules

- Gradient opacity: **6-8% max**
- Only at **top of page**
- Cards: **Pure white** (no gradient)

---

## 6. Metric Cards

### Card Labels by Domain

**Features (Teal Family)**

| Card | Label Color | Class |
|------|-------------|-------|
| Organization | Teal `#007A78` | `metric-card-label-teal` |
| Pipelines Run | Teal-dark `#005F5D` | `metric-card-label-teal-dark` |
| Integrations | Teal-light `#14B8A6` | `metric-card-label-secondary` |
| Team Members | Teal-light `#14B8A6` | `metric-card-label-secondary` |
| Your Role | Teal-dark `#005F5D` | `metric-card-label-tertiary` |

**Costs (Coral Family)**

| Card | Label Color | Class |
|------|-------------|-------|
| Daily Costs | Coral `#FF6E50` | `metric-card-label-coral` |
| MTD Costs | Coral `#FF6E50` | `metric-card-label-coral` |
| YTD Costs | Coral-dark `#E55A3C` | `metric-card-label-coral-dark` |
| Active Plans | Coral `#FF6E50` | `metric-card-label-coral` |
| Monthly Forecast | Coral-light `#FF8A73` | `metric-card-label-coral-light` |

**Neutral**

| Card | Label Color | Class |
|------|-------------|-------|
| Categories Count | Gray `#8E8E93` | `metric-card-label-neutral` |

### Card Structure

```html
<div class="metric-card">
  <div class="metric-card-header">
    <div class="metric-card-label metric-card-label-coral">
      <DollarSign />
      <span>Daily Costs</span>
    </div>
  </div>
  <div class="metric-card-content">
    <div class="metric-card-value">$1,234</div>
    <div class="metric-card-description">vs $1,100 yesterday</div>
  </div>
</div>
```

### Card Styling

| Property | Value |
|----------|-------|
| Background | `#FFFFFF` |
| Border radius | 16px |
| Padding | 20px |
| Border | 1px solid `rgba(0,0,0,0.06)` |
| Shadow | `0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)` |
| Hover shadow | `0 4px 16px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)` |
| Value size | 28px, weight 600 |
| Label size | 15px, weight 600 |

### Shadow System

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
--shadow-card: 0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
--shadow-elevated: 0 4px 16px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04);
--shadow-xl: 0 10px 40px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06);
```

---

## 7. Sidebar Navigation

### Sidebar Layout Structure

The sidebar uses a **two-zone layout** with accordion behavior:

```
┌─────────────────────┐
│ [Logo] Org Name     │  ← Header
├─────────────────────┤
│ DASHBOARDS       ▼  │  ← Main Content (scrollable)
│   • Overview        │
│   • Subscriptions   │
│   • GenAI           │
│   • Cloud           │
├─────────────────────┤
│ PIPELINES        ▶  │
├═════════════════════┤  ← Footer Border
│ [Avatar] User Name  │  ← Footer: User Profile FIRST
│ user@email.com      │
├─────────────────────┤
│ INTEGRATIONS     ▶  │  ← Footer: Then Integrations
├─────────────────────┤
│ SETTINGS         ▶  │  ← Footer: Then Settings
├─────────────────────┤
│ 🔗 Get Help         │  ← Footer: Actions
│ 🚪 Sign Out         │
└─────────────────────┘
```

### Accordion Behavior

- **Only ONE section open at a time**
- When opening a section, others automatically close
- Auto-expands based on current route

### Sidebar Styling

| Property | Value |
|----------|-------|
| Background | `#FFFFFF` (white) |
| Border right | 1px solid `slate-100` |
| Header border | 1px solid `slate-100` |
| Footer border | 1px solid `slate-100` |

### Section Headers

| Property | Value |
|----------|-------|
| Font size | 11px |
| Font weight | 600 (semibold) |
| Text transform | uppercase |
| Letter spacing | wide |
| Color | `slate-500` |
| Hover | `bg-slate-50` |

### Menu Items - Coral Hover/Active

All menu items use **coral highlight** for hover and active states:

```tsx
// Normal state
"text-slate-600 hover:bg-[#FF6E50]/10 hover:text-[#FF6E50]"

// Active state
"text-[#FF6E50] bg-[#FF6E50]/10 font-semibold"
```

| Property | Value |
|----------|-------|
| Height | 26px |
| Font size | 12px |
| Font weight | 500 (normal), 600 (active) |
| Padding | px-3 |
| Margin | mx-2 |
| Border radius | rounded-md |
| Hover background | `#FF6E50` @ 10% |
| Active background | `#FF6E50` @ 10% |
| Active text | `#FF6E50` (coral) |

### Icon Colors by Domain

**Features (Teal)**

```tsx
<LayoutDashboard className="text-[#007A78]" />  // Dashboard
<Workflow className="text-[#005F5D]" />         // Pipelines
<Server className="text-[#14B8A6]" />           // Cloud Providers
<Brain className="text-[#005F5D]" />            // LLM Providers
```

**Footer Items**

```tsx
<User className="text-slate-500" />             // Personal Settings
<Building className="text-slate-500" />         // Organization
<BarChart3 className="text-slate-500" />        // Usage & Quotas
<UserPlus className="text-slate-500" />         // Invite
<CreditCard className="text-slate-500" />       // Billing
<HelpCircle className="text-[#007A78]" />       // Get Help (teal)
<LogOut className="text-slate-500" />           // Sign Out
```

### Navigation Sections

**Main Content Area:**
- Dashboards (Overview, Subscriptions, GenAI, Cloud)
- Pipelines (Subscription Runs, Cost Runs, GenAI Runs)

**Footer Area:**
1. User Profile (avatar, name, email)
2. Integrations (Cloud Providers, LLM Providers, Subscriptions)
3. Settings (Personal, Organization*, Usage & Quotas, Invite, Billing*)
4. Get Help
5. Sign Out

*Owner-only items

### Collapsed State (Icon Mode)

When sidebar is collapsed:
- Shows only icons centered
- Section headers hidden
- User avatar shown without name/email

---

## 8. Button System

### Global Buttons

| Class | Background | Text | Hover |
|-------|------------|------|-------|
| `.cloudact-btn-primary` | Teal `#007A78` | White | `#006664` |
| `.cloudact-btn-secondary` | White | Teal | Teal @ 5% bg |
| `.cloudact-btn-destructive` | Coral `#FF6E50` | White | `#E55A3C` |
| `.cloudact-btn-outline` | Transparent | Teal | Teal @ 5% bg |
| `.cloudact-btn-ghost` | Transparent | Black | Gray @ 5% bg |

### Console Buttons

| Class | Background | Text | Hover |
|-------|------------|------|-------|
| `.console-button-primary` | Teal `#007A78` | White | `#006664` |
| `.console-button-secondary` | `#F5F5F7` | Black | `#E8E8ED` |
| `.console-button-destructive` | Coral `#FF6E50` | White | `#E55A3C` |
| `.console-button-coral` | Coral `#FF6E50` | White | `#E55A3C` |
| `.console-button-ghost` | Transparent | Black | `#F5F5F7` |

### Button Specs

| Property | Value |
|----------|-------|
| Min height | 44px |
| Border radius | 12px |
| Font size | 15px |
| Font weight | 600 |
| Padding | 12px 24px |
| Focus outline | 2px solid Teal, offset 2px |

### Button States

```css
/* Primary Button */
.console-button-primary {
  background: #007A78;
  color: white;
}
.console-button-primary:hover {
  background: #006664;
}
.console-button-primary:active {
  background: #005452;
}
.console-button-primary:focus-visible {
  outline: 2px solid #007A78;
  outline-offset: 2px;
}

/* Coral Button (Costs) */
.console-button-coral {
  background: #FF6E50;
  color: white;
}
.console-button-coral:hover {
  background: #E55A3C;
}
.console-button-coral:active {
  background: #CC4F35;
}
.console-button-coral:focus-visible {
  outline: 2px solid #FF6E50;
  outline-offset: 2px;
}
```

---

## 9. Chart System

### Rule: One Color Family Per Chart

**Cost Charts → Coral Family**

| Series | Color |
|--------|-------|
| Primary | `#FF6E50` |
| Secondary | `#FF6E50` @ 70% |
| Tertiary | `#FF6E50` @ 45% |
| Area fill | `#FF6E50` @ 8% |

**Feature Charts → Teal Family**

| Series | Color |
|--------|-------|
| Primary | `#007A78` |
| Secondary | `#007A78` @ 70% |
| Tertiary | `#007A78` @ 45% |
| Area fill | `#007A78` @ 8% |

### Chart Specs

| Property | Value |
|----------|-------|
| Stroke | 2px |
| Dots | Hidden (hover only) |
| Area fill | 6-10% |
| Grid | Horizontal, light gray |
| Max series | 4 |

---

## 10. Tables

### Table Card Container

| Property | Value |
|----------|-------|
| Background | `#FFFFFF` |
| Border radius | 16px |
| Border | 1px solid `rgba(0,0,0,0.06)` |
| Shadow | `0 2px 8px rgba(0,0,0,0.06)` |
| Overflow | hidden |

### Header Row

| Property | Value |
|----------|-------|
| Background | `#F5F5F7` |
| Border bottom | 1px solid `rgba(0,0,0,0.06)` |
| Font size | 12px uppercase |
| Font weight | 600 |
| Color | `#8E8E93` |
| Padding | 14px 16px |

### Body Rows

| Property | Value |
|----------|-------|
| Border bottom | 1px solid `rgba(0,0,0,0.06)` |
| Font size | 15px |
| Color | Black |
| Padding | 16px |
| Hover | `#F0F0F2` (features) or `#FFF5F3` (costs) |

### Status Badges

| Status | Background | Text |
|--------|------------|------|
| Active | Green @ 12% | `#34C759` |
| Pending | Orange @ 12% | `#FF9500` |
| Error | Red @ 12% | `#FF3B30` |
| Cancelled | Gray @ 12% | `#8E8E93` |

---

## 11. Forms

### Input Fields

| Property | Value |
|----------|-------|
| Background | `#FFFFFF` |
| Border | 1px solid `rgba(0,0,0,0.1)` |
| Border radius | 12px (`rounded-xl`) |
| Padding | 14px 16px |
| Font size | 15px |
| Height | 36px (h-9) |

### Input States

| State | Border | Ring |
|-------|--------|------|
| Default | `rgba(0,0,0,0.1)` | None |
| Hover | `#007A78` @ 50% | None |
| Focus | `#007A78` | 2px `#007A78` @ 20% |
| Error | `#FF6E50` | 2px `#FF6E50` @ 20% |
| Disabled | `rgba(0,0,0,0.1)` | None, 50% opacity |

### Input CSS

```tsx
// Input component classes
className={cn(
  'h-9 w-full rounded-xl border bg-background px-3 py-1 text-base',
  // Border
  'border-[rgba(0,0,0,0.1)]',
  // Focus - Teal
  'focus-visible:border-[#007A78] focus-visible:ring-2 focus-visible:ring-[#007A78]/20',
  // Hover - Teal
  'hover:border-[#007A78]/50',
  // Error - Coral
  'aria-invalid:border-[#FF6E50] aria-invalid:ring-2 aria-invalid:ring-[#FF6E50]/20',
)}
```

### Labels

| Property | Value |
|----------|-------|
| Font size | 14px |
| Font weight | 600 |
| Color | `#1C1C1E` |
| Margin bottom | 8px |

### Select Dropdowns

| Property | Value |
|----------|-------|
| Same as inputs | + dropdown arrow |
| Arrow color | `#8E8E93` |
| Dropdown shadow | `shadow-md` |

### Textarea

| Property | Value |
|----------|-------|
| Same as inputs | |
| Min height | 80px |
| Resize | vertical |

### Switch Toggle

| Property | Value |
|----------|-------|
| Height | 18px (1.15rem) |
| Width | 32px (2rem) |
| Checked background | Teal `#007A78` |
| Unchecked background | Input gray |
| Focus ring | 2px `#007A78` @ 20% |

---

## 12. Modal & Dialog System

### Overlay

| Property | Value |
|----------|-------|
| Background | `rgba(0,0,0,0.8)` |
| Backdrop filter | `blur(4px)` |
| Z-index | 50 |

### Dialog Content

| Property | Value |
|----------|-------|
| Background | `#FFFFFF` |
| Border radius | 8px (`rounded-lg`) |
| Border | 1px solid `border-border` |
| Shadow | `shadow-xl` |
| Padding | 24px |
| Max width | 512px (sm:max-w-lg) |
| Animation | zoom-in-95, fade-in |

### Close Button

| Property | Value |
|----------|-------|
| Position | Top-right, 16px offset |
| Size | 24px |
| Border radius | 6px (`rounded-md`) |
| Padding | 6px |
| Opacity | 70% (100% on hover) |
| Hover background | `muted` |

### Dialog Footer

| Property | Value |
|----------|-------|
| Gap | 12px (`gap-3`) |
| Layout | `flex-col-reverse` mobile, `flex-row` desktop |
| Alignment | `justify-end` |

### Sheet (Slide Panel)

| Property | Value |
|----------|-------|
| Width | 75% (max 384px on sm) |
| Shadow | `shadow-xl` |
| Border | 1px solid `border-border` |
| Animation | slide-in-from-right, 500ms |

### AlertDialog

Same as Dialog, but without close button. Used for confirmations.

### Usage Example

```tsx
<Dialog>
  <DialogTrigger asChild>
    <button className="console-button-primary">Open Dialog</button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogDescription>Dialog description text.</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <button className="console-button-secondary">Cancel</button>
      <button className="console-button-primary">Confirm</button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## 13. Tooltip System

### Tooltip Styling

| Property | Value |
|----------|-------|
| Background | Dark (`bg-primary`) |
| Text color | White (`text-primary-foreground`) |
| Font size | 12px |
| Padding | 6px 12px |
| Border radius | 6px (`rounded-md`) |
| Shadow | `shadow-lg` |

### Tooltip Behavior

| Property | Value |
|----------|-------|
| Delay open | 300ms |
| Delay close | 0ms |
| Animation | fade-in, zoom-in-95 |
| Side offset | 4px |

### Usage Example

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <button className="icon-button">
      <HelpCircle className="h-4 w-4" />
    </button>
  </TooltipTrigger>
  <TooltipContent>
    <p>Helpful tooltip text</p>
  </TooltipContent>
</Tooltip>
```

---

## 14. Date Picker System

### Calendar Styling

| Property | Value |
|----------|-------|
| Background | `#FFFFFF` |
| Border radius | 12px |
| Shadow | `shadow-md` |
| Padding | 12px |

### Calendar Day States

| State | Background | Text | Border |
|-------|------------|------|--------|
| Default | Transparent | Black | None |
| Hover | `#F0FDFA` | Teal `#007A78` | None |
| Selected | Teal `#007A78` | White | None |
| Today | Transparent | Black | 2px Teal `#007A78` |
| Disabled | Transparent | Gray 30% | None |
| Outside month | Transparent | Gray 50% | None |

### Calendar CSS

```tsx
// Selected day
"aria-selected:bg-[#007A78] aria-selected:text-white"

// Today indicator
"[&[data-today]]:border-2 [&[data-today]]:border-[#007A78]"

// Hover state
"hover:bg-[#F0FDFA] hover:text-[#007A78]"
```

### Date Range Selection

| State | Background |
|-------|------------|
| Range start | Teal `#007A78` |
| Range end | Teal `#007A78` |
| In range | Teal @ 10% |

---

## 15. Layout & Spacing

### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `gap-1` | 4px | Tight spacing |
| `gap-2` | 8px | Related items |
| `gap-3` | 12px | Button groups |
| `gap-4` | 16px | Card sections |
| `gap-6` | 24px | Page sections |
| `gap-8` | 32px | Major sections |

### Responsive Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablet |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Large desktop |

### Container Sizing

| Property | Desktop | Mobile |
|----------|---------|--------|
| Card padding | 20px | 16px |
| Card radius | 16px | 14px |
| Section gap | 24px | 16px |
| Page padding | 32px | 16px |

---

## 16. Accessibility

### Touch Targets

| Element | Min Size |
|---------|----------|
| Buttons | 44x44px |
| Nav items | 42px height |
| Icon buttons | 40x40px |
| Form inputs | 36px height |

### Focus States

```css
:focus-visible {
  outline: 2px solid #007A78;
  outline-offset: 2px;
}

/* Error state focus */
:focus-visible[aria-invalid="true"] {
  outline: 2px solid #FF6E50;
  outline-offset: 2px;
}
```

### Color Contrast

| Combination | Ratio | Status |
|-------------|-------|--------|
| Teal on White | 4.5:1+ | Pass AA |
| Coral on White | 3.5:1 | Pass AA Large |
| White on Teal | 4.5:1+ | Pass AA |
| White on Coral | 3.5:1 | Pass AA Large |

### Screen Reader Support

- All interactive elements have accessible names
- Icons include `aria-label` or `sr-only` text
- Form errors announced via `aria-invalid` and `aria-describedby`
- Modal focus trap with `aria-modal="true"`

---

## Quick Reference

### Color Constants

```typescript
// Features (Teal family)
const TEAL = "#007A78"
const TEAL_LIGHT = "#14B8A6"
const TEAL_DARK = "#005F5D"

// Costs (Coral family)
const CORAL = "#FF6E50"
const CORAL_LIGHT = "#FF8A73"
const CORAL_DARK = "#E55A3C"

// Semantic
const SUCCESS = "#34C759"
const WARNING = "#FF9500"
const ERROR = "#FF3B30"
const NEUTRAL = "#8E8E93"
```

### Domain Mapping

```typescript
const DOMAIN_COLORS = {
  // Features → Teal
  dashboard: TEAL,
  pipelines: TEAL_DARK,
  integrations: TEAL_LIGHT,
  cloud: TEAL,
  llm: TEAL_DARK,
  team: TEAL_LIGHT,
  org: TEAL,

  // Costs → Coral
  costs: CORAL,
  billing: CORAL_LIGHT,
  saas: CORAL,
  subscriptions: CORAL,

  // Neutral
  settings: NEUTRAL,
}
```

### Component Quick Reference

| Component | Primary Color | File |
|-----------|---------------|------|
| Input | Teal focus | `components/ui/input.tsx` |
| Textarea | Teal focus | `components/ui/textarea.tsx` |
| Select | Teal focus | `components/ui/select.tsx` |
| Switch | Teal checked | `components/ui/switch.tsx` |
| Dialog | Teal focus | `components/ui/dialog.tsx` |
| Sheet | Teal focus | `components/ui/sheet.tsx` |
| AlertDialog | Teal/Coral | `components/ui/alert-dialog.tsx` |
| Calendar | Teal selected | `components/ui/calendar.tsx` |
| Tooltip | Dark bg | `components/ui/tooltip.tsx` |

---

## Changelog

### Version 2.7 (2025-12-24)
- **Sidebar Layout Redesign:**
  - Two-zone layout: Main Content + Footer
  - Accordion behavior (one section open at a time)
  - User Profile moved to footer (first item)
  - Integrations & Settings moved to footer
  - Coral hover/active highlight (removed left border)
  - Auto-expand based on current route
- Updated navigation sections structure
- Added collapsed state documentation

### Version 2.5 (2025-12-13)
- Added Modal & Dialog System documentation
- Added Tooltip System documentation
- Added Date Picker System documentation
- Updated Form inputs with error states (Coral)
- Added new button class `.console-button-coral`
- Updated sidebar with font-weight specs (500/600)
- Added opacity scale for brand colors
- Added surface and shadow CSS variables
- Updated metric card label classes
- Added hover row colors for cost tables

### Version 2.4 (2025-12-13)
- Initial Apple Health-style visual polish
- Teal + Coral brand color system
- Category color mapping

---

**Version 2.7** | Sidebar redesign with two-zone layout and coral highlights
