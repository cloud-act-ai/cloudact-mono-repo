# CloudAct Console Design System

This document defines the complete design system for the CloudAct Console (authenticated dashboard area). Directly inspired by Apple Health's clean, borderless UI while maintaining CloudAct's brand identity.

---

## Design Philosophy

**Clean. Borderless. Modern. Color-coded.**

The console follows Apple Health's exact design principles:
- Pure white sidebar with no grey backgrounds
- Soft gradient ONLY at top of content area (280px), rest is pure white
- NO borders on cards or tables - clean white backgrounds
- Color-coded icons using Apple System Colors
- Apple-style typography with proper hierarchy (SF Pro-inspired sizing)
- Mobile-first responsive design

---

## Color System

### Brand Colors

| Color | Hex | CSS Variable | Usage |
|-------|-----|--------------|-------|
| **CloudAct Teal** | `#007A78` | `--cloudact-teal` | Brand accent, dashboard icon |
| **CloudAct Teal Light** | `#14B8A6` | `--cloudact-teal-light` | Gradients |
| **CloudAct Coral** | `#FF6E50` | `--cloudact-coral` | Subscription costs, alerts |
| **CloudAct Coral Light** | `#FF8A73` | `--cloudact-coral-light` | Gradients |

### Apple System Colors (Used for UI Elements)

| Color | Hex | Usage |
|-------|-----|-------|
| **Blue** | `#007AFF` | Primary actions, links, active states |
| **Pink** | `#FF2D55` | AI/LLM providers, highlights |
| **Green** | `#34C759` | Success, active status, billing |
| **Orange** | `#FF9500` | Warnings, integrations, pending |
| **Purple** | `#AF52DE` | Pipelines, design |
| **Indigo** | `#5856D6` | Development, invite |
| **Red** | `#FF3B30` | Destructive actions, errors, sign out |
| **Gray** | `#8E8E93` | Secondary text, labels, disabled |

### Background & Surface Colors

| Color | Hex | Usage |
|-------|-----|-------|
| **White** | `#FFFFFF` | Cards, sidebar, main surfaces |
| **System Gray 6** | `#F5F5F7` | Hover backgrounds, secondary surfaces |
| **System Gray 5** | `#E5E5EA` | Dividers, borders |
| **Label Secondary** | `#8E8E93` | Secondary text |
| **Label Tertiary** | `#C7C7CC` | Placeholder, disabled |

### Gradient Colors (Top Section Only)

| Position | Color | Usage |
|----------|-------|-------|
| Start | `#FFE8E0` | Peach tint (top-left) |
| Middle | `#F5E6F5` | Lavender tint (center) |
| End | `#E8F4F8` | Sky tint (top-right) |

---

## Main Layout Gradient

The console uses a subtle gradient **ONLY at the top 280px** - the rest is pure white:

```css
.console-main-gradient {
  background:
    linear-gradient(135deg, #FFE8E0 0%, #F5E6F5 50%, #E8F4F8 100%);
  background-size: 100% 280px;
  background-repeat: no-repeat;
  background-color: #FFFFFF;
  min-height: 100%;
}
```

**Key Principles:**
- Gradient is ONLY at top 280px (like Apple Health)
- Pure white (#FFFFFF) below the gradient
- Cards sit on clean white background
- Never use gradient across entire page

---

## Typography

### Font Sizes (Apple Health Inspired)

| Element | Size | Weight | Usage |
|---------|------|--------|-------|
| Page Title | 32-34px | 700 | Main page headings |
| Section Title | 22px | 700 | Section headings (Pinned, Quick Actions) |
| Card Title | 17px | 600 | Card headers, nav items |
| Body | 15px | 400 | Main content |
| Small | 13px | 400 | Descriptions, captions |
| Tiny | 11px | 600 | Labels, badges, uppercase text |

### Text Colors

| Element | Color | Hex |
|---------|-------|-----|
| Primary | Black | `#000000` |
| Secondary | Label Secondary | `#8E8E93` |
| Links | Blue | `#007AFF` |
| Success | Green | `#34C759` |
| Warning | Orange | `#FF9500` |
| Error | Red | `#FF3B30` |

---

## Health Card Component (Apple Health Style)

The signature Apple Health-style pinned cards:

```html
<div class="health-card">
  <div class="health-card-header">
    <div class="health-card-label health-card-label-teal">
      <Icon class="h-[18px] w-[18px]" />
      <span>Organization</span>
    </div>
  </div>
  <div class="health-card-content">
    <div class="health-card-value">$4,285</div>
    <div class="health-card-description">Current daily rate</div>
  </div>
</div>
```

### Health Card CSS

```css
.health-card {
  background: #FFFFFF;
  border-radius: 16px;
  padding: 16px;
  box-shadow: none;
  border: none;
}

.health-card-label {
  font-size: 0.9375rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.health-card-value {
  font-size: 1.75rem;
  font-weight: 600;
  color: #000000;
  line-height: 1.1;
}

.health-card-description {
  font-size: 0.8125rem;
  color: #8E8E93;
}
```

### Health Card Label Colors

| Class | Color | Hex |
|-------|-------|-----|
| `.health-card-label-teal` | CloudAct Teal | `#007A78` |
| `.health-card-label-coral` | CloudAct Coral | `#FF6E50` |
| `.health-card-label-pink` | Apple Pink | `#FF2D55` |
| `.health-card-label-blue` | Apple Blue | `#007AFF` |
| `.health-card-label-purple` | Apple Purple | `#AF52DE` |
| `.health-card-label-orange` | Apple Orange | `#FF9500` |
| `.health-card-label-green` | Apple Green | `#34C759` |
| `.health-card-label-indigo` | Apple Indigo | `#5856D6` |

---

## Sidebar Design (Apple Health Style)

### Key Principles

- **Pure white background** (#FFFFFF) - NO grey, NO gradients
- **No borders** - clean, borderless design
- **Color-coded icons** - Each category has its own Apple system color
- **Full-width items** - No rounded corners on nav items
- **44px touch targets** - iOS standard height
- **17px font** - Apple standard navigation size

### Navigation Icon Colors

| Category | Icon Color | Hex |
|----------|------------|-----|
| Dashboard | CloudAct Teal | `#007A78` |
| Subscription Costs | CloudAct Coral | `#FF6E50` |
| Pipelines | Apple Purple | `#AF52DE` |
| Integrations | Apple Orange | `#FF9500` |
| Cloud Providers | Apple Blue | `#007AFF` |
| LLM Providers | Apple Pink | `#FF2D55` |
| Subscriptions | Apple Green | `#34C759` |
| Billing | Apple Green | `#34C759` |
| Invite | Apple Indigo | `#5856D6` |
| Organization | Apple Blue | `#007AFF` |
| Settings | Apple Gray | `#8E8E93` |
| Sign Out | Apple Red | `#FF3B30` |

### Sidebar CSS

```css
[data-sidebar="sidebar"] {
  background: #FFFFFF !important;
  border-right: none !important;
}

[data-sidebar="menu-button"] {
  font-size: 1.0625rem !important;  /* 17px */
  font-weight: 400 !important;
  color: #000000 !important;
  padding: 12px 20px !important;
  border-radius: 0 !important;
  height: 44px;
}

[data-sidebar="menu-button"]:hover {
  background: #F5F5F7 !important;
}

[data-sidebar="group-label"] {
  font-size: 0.6875rem !important;  /* 11px */
  font-weight: 600 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.04em !important;
  color: #8E8E93 !important;
}
```

---

## Tables (Apple Health Style)

Clean, borderless tables:

```css
.console-table-header {
  font-size: 0.75rem;
  font-weight: 500;
  color: #8E8E93;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 12px 16px;
  border: none;
}

.console-table-row {
  border: none;
}

.console-table-row:hover {
  background: #F5F5F7;
}

.console-table-cell {
  font-size: 0.9375rem;
  color: #000000;
  padding: 14px 16px;
  border: none;
}
```

---

## Badges (Apple Health Style)

Use subtle background colors with 12% opacity:

```css
/* Status Badges */
.bg-[#34C759]/12 .text-[#34C759]  /* Active - Green */
.bg-[#FF9500]/12 .text-[#FF9500]  /* Pending - Orange */
.bg-[#8E8E93]/12 .text-[#8E8E93]  /* Cancelled - Gray */
.bg-[#FF3B30]/12 .text-[#FF3B30]  /* Expired/Error - Red */

/* Category Badges */
.bg-[#FF2D55]/12 .text-[#FF2D55]  /* AI */
.bg-[#AF52DE]/12 .text-[#AF52DE]  /* Design */
.bg-[#007AFF]/12 .text-[#007AFF]  /* Productivity */
.bg-[#34C759]/12 .text-[#34C759]  /* Communication */
.bg-[#5856D6]/12 .text-[#5856D6]  /* Development */
.bg-[#FF9500]/12 .text-[#FF9500]  /* Cloud */
```

---

## Buttons

### Primary Button (Apple Blue)

```css
.h-[36px] .px-4 .bg-[#007AFF] .text-white .rounded-xl .text-[15px] .font-semibold
```

### Ghost Button

```css
.h-[36px] .px-4 .text-[#8E8E93] .hover:bg-[#F5F5F7] .rounded-xl
```

### Icon Button

```css
.h-8 .w-8 .rounded-lg .hover:bg-[color]/10
```

---

## Responsive Design

### Breakpoints

| Breakpoint | Width | Adjustments |
|------------|-------|-------------|
| **Mobile** | < 640px | Smaller cards, compact tables |
| **Tablet** | 640-1024px | Standard sizing |
| **Desktop** | > 1024px | Full layout with sidebar |

### Mobile Adjustments

```css
@media (max-width: 640px) {
  .console-main-gradient {
    background-size: 100% 200px;
    padding: 16px;
  }

  .health-card {
    padding: 14px;
    border-radius: 14px;
  }

  .health-card-value {
    font-size: 1.375rem;
  }

  .console-table-header {
    font-size: 0.6875rem;
    padding: 10px 12px;
  }

  .console-table-cell {
    font-size: 0.8125rem;
    padding: 12px;
  }
}
```

---

## Quick Reference

### Most Used Classes

```
Health Cards:
  .health-card          .health-card-header    .health-card-content
  .health-card-label    .health-card-value     .health-card-description
  .health-card-label-teal   .health-card-label-coral
  .health-card-label-blue   .health-card-label-green
  .health-card-label-purple .health-card-label-orange

Typography:
  text-[32px] font-bold text-black    /* Page title */
  text-[22px] font-bold text-black    /* Section title */
  text-[17px] font-semibold text-black /* Card title */
  text-[15px] text-[#8E8E93]          /* Description */
  text-[13px] text-[#8E8E93]          /* Small text */

Tables:
  .console-table-header .console-table-row .console-table-cell

Colors:
  text-[#007AFF]  /* Links, primary actions */
  text-[#34C759]  /* Success */
  text-[#FF9500]  /* Warning */
  text-[#FF3B30]  /* Error */
  text-[#8E8E93]  /* Secondary */
  bg-[#F5F5F7]    /* Hover background */
```

---

## Files Reference

| File | Description |
|------|-------------|
| `app/[orgSlug]/console.css` | All console-specific styles |
| `app/globals.css` | Design tokens, base styles |
| `components/dashboard-sidebar.tsx` | Sidebar component |
| `app/[orgSlug]/layout.tsx` | Console layout with gradient |
| `app/[orgSlug]/dashboard/page.tsx` | Dashboard with health cards |
| `app/[orgSlug]/subscriptions/page.tsx` | Subscriptions with health cards |

---

*CloudAct Console Design System v2.0*
*Inspired by Apple Health's clean, modern UI*
*Using Apple System Colors for UI consistency*
*Last Updated: December 2024*
