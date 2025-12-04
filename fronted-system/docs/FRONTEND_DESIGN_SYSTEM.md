# CloudAct.ai Frontend Design System

This document defines the complete design system for CloudAct.ai. All frontend development MUST follow these guidelines to ensure visual consistency across the application.

---

## Brand Colors

### Primary Colors

| Color | Hex Code | Usage |
|-------|----------|-------|
| **Teal** | `#007A78` | Primary brand color, buttons, links, active states |
| **Teal Light** | `#14B8A6` | Hover states, accent highlights |
| **Teal Dark** | `#005F5D` | Hover on primary buttons, emphasis |
| **Coral/Orange** | `#FF6E50` | Accent color, CTAs, pricing values, alerts |
| **Coral Light** | `#FF8A73` | Coral hover states, secondary accents |

### Background Colors

| Color | Hex Code | Usage |
|-------|----------|-------|
| **Teal Background** | `#F0FDFA` | Icon boxes, badges, subtle teal backgrounds |
| **Coral Background** | `#FFF5F3` | Icon boxes, badges, subtle coral backgrounds |
| **White** | `#FFFFFF` | Page backgrounds, cards, forms |
| **Gray 50** | `#F9FAFB` | Section backgrounds, table headers |

### Text Colors

| Color | Hex Code | Usage |
|-------|----------|-------|
| **Gray 900** | `#111827` | Headings, primary text (NEVER use black #000) |
| **Gray 700** | `#374151` | Body text, form labels |
| **Gray 600** | `#4B5563` | Secondary body text |
| **Gray 500** | `#6B7280` | Subheadings, descriptions, muted text |

---

## Typography

### Font Families

| Font | Usage | Weight |
|------|-------|--------|
| **DM Sans** | Body text, buttons, console, form labels | 400, 500, 600, 700 |
| **Merriweather** | Landing page headings (h1, h2) | 300, 400 (light weight) |

### Landing Page Typography Scale

| Class | Size | Weight | Font | Line Height |
|-------|------|--------|------|-------------|
| `.cloudact-heading-xl` | clamp(2rem, 5vw, 4rem) | 300 | Merriweather | 1.15 |
| `.cloudact-heading-lg` | clamp(1.5rem, 3vw, 2.625rem) | 300 | Merriweather | 1.2 |
| `.cloudact-heading-md` | 1.25rem | 600 | DM Sans | 1.4 |
| `.cloudact-body` | 1rem | 400 | DM Sans | 1.6 |
| `.cloudact-body-sm` | 0.875rem | 400 | DM Sans | 1.5 |

### Console Typography Scale

| Class | Size | Weight | Usage |
|-------|------|--------|-------|
| `.console-page-title` | 1.5rem (24px) | 700 | Page titles |
| `.console-heading` | 1.25rem (20px) | 600 | Section headings |
| `.console-card-title` | 1rem (16px) | 600 | Card titles |
| `.console-subheading` | 0.875rem (14px) | 400 | Descriptions |
| `.console-body` | 0.875rem (14px) | 400 | Body text |
| `.console-small` | 0.75rem (12px) | 400 | Small text, labels |
| `.console-metric` | 2rem (32px) | 700 | Large numbers |

---

## Component Classes

### Landing Pages

#### Buttons

```html
<!-- Primary Button - Teal -->
<button class="cloudact-btn-primary">Get Started</button>

<!-- Secondary Button - Teal Outline -->
<button class="cloudact-btn-secondary">Learn More</button>
```

#### Cards

```html
<!-- Standard Card -->
<div class="cloudact-card p-8">Card content</div>

<!-- Featured Card -->
<div class="cloudact-card-featured p-8">Featured content</div>

<!-- Pricing Card -->
<div class="cloudact-pricing-card">
  <span class="cloudact-pricing-value">$49</span>
</div>
```

#### Icon Boxes

```html
<!-- Teal Icon Box -->
<div class="cloudact-icon-box">
  <Icon class="h-8 w-8" />
</div>

<!-- Coral Icon Box -->
<div class="cloudact-icon-box-coral">
  <Icon class="h-8 w-8" />
</div>
```

#### Badges

```html
<!-- Teal Badge -->
<span class="cloudact-badge">New Feature</span>

<!-- Coral Badge -->
<span class="cloudact-badge-coral">Popular</span>
```

#### Stats Section

```html
<section class="cloudact-stats-section py-20">
  <div class="cloudact-stat-value">67%</div>
  <p class="text-white/80">Cost Reduction</p>
</section>
```

### Console Pages

#### Buttons

```html
<button class="console-button-primary">Save Changes</button>
<button class="console-button-secondary">Cancel</button>
<button class="console-button-coral">Delete</button>
```

#### Cards

```html
<div class="console-stat-card">
  <p class="console-card-title">Title</p>
  <p class="console-metric">42</p>
</div>

<div class="console-chart-card">Chart here</div>
```

#### Tabs

```html
<div class="console-tabs">
  <button class="console-tab" data-state="active">Active Tab</button>
  <button class="console-tab">Inactive Tab</button>
</div>
```

#### Forms

```html
<label class="console-label">Email</label>
<input class="console-input" type="email" />
```

#### Badges

```html
<span class="console-badge console-badge-teal">Active</span>
<span class="console-badge console-badge-coral">Pending</span>
<span class="console-badge console-badge-success">Completed</span>
<span class="console-badge console-badge-warning">Warning</span>
```

---

## Design Rules - MUSTS

### Color Usage

1. **MUST use Teal (#007A78) as primary** - All primary buttons, links, active states
2. **MUST use Coral (#FF6E50) as accent** - Price values, CTAs, tab underlines, important highlights
3. **MUST use Gray 900 (#111827) for headings** - NEVER use black (#000000)
4. **MUST use white backgrounds** - Cards, forms, sections should have white or very light backgrounds
5. **MUST alternate teal/coral** for icon boxes in grids to create visual interest
6. **MUST use teal text with coral underline** for active tabs

### Typography

1. **MUST use Merriweather** for landing page H1 and H2 headings (light weight 300)
2. **MUST use DM Sans** for everything else (body, buttons, console, forms)
3. **MUST maintain consistent font sizes** as defined in the typography scale
4. **MUST use the provided CSS classes** - Do not use arbitrary Tailwind font sizes

### Spacing

1. **MUST use consistent section padding** - `py-16 md:py-20` for landing sections, `py-20` for larger sections
2. **MUST use consistent container padding** - `px-4 md:px-12`
3. **MUST use consistent card padding** - `p-8` for standard cards, `p-6 lg:p-8` for forms
4. **MUST use 6px or 8px gap** between grid items (`gap-6` or `gap-8`)

### Components

1. **MUST use CloudAct CSS classes** - Do not create new Tailwind color classes
2. **MUST use cloudact-* classes** for landing pages
3. **MUST use console-* classes** for console pages
4. **MUST follow the icon box pattern** - Alternating teal and coral for visual variety

---

## Design Rules - DON'Ts

### Color DON'Ts

1. **DON'T use black (#000000)** - Use Gray 900 (#111827) instead
2. **DON'T use random colors** (blue, green, purple, etc.) - Only teal, coral, and grays
3. **DON'T use dark backgrounds** - Keep backgrounds white or very light gray
4. **DON'T skip the coral accent** - Every page should have coral elements

### Typography DON'Ts

1. **DON'T use arbitrary font sizes** - Stick to the defined typography scale
2. **DON'T use sans-serif headings on landing pages** - Use Merriweather
3. **DON'T mix font families randomly** - Follow the defined pattern
4. **DON'T use font weights not in the scale** - DM Sans: 400, 500, 600, 700 only

### Component DON'Ts

1. **DON'T use raw Tailwind for colors** - Use cloudact-* or console-* classes
2. **DON'T create new button styles** - Use the provided button classes
3. **DON'T use generic card styles** - Use cloudact-card or console-stat-card
4. **DON'T forget hover states** - All interactive elements need hover effects

### Naming DON'Ts

1. **DON'T use competitor names** in class names or comments
2. **DON'T create classes named after other brands**
3. **DON'T reference external design systems** - This is CloudAct's own system

---

## Charts Color Palette

For all charts (Recharts), use this priority order:

```javascript
const CLOUDACT_COLORS = [
  "#007A78", // teal (primary) - ALWAYS first
  "#FF6E50", // coral (accent) - ALWAYS second
  "#14B8A6", // teal-light
  "#FF8A73", // coral-light
  "#0891B2", // cyan
  "#F472B6", // pink
  "#8B5CF6", // purple
  "#10B981", // emerald
  "#F59E0B", // amber
  "#60A5FA", // blue
]
```

**Chart Rules:**
- White background for all charts
- Teal primary for single-color charts
- Coral for secondary data series
- Use teal/coral for tooltips and active states

---

## File Structure

```
app/
├── globals.css              # Global styles, CSS variables
├── (landingPages)/
│   ├── landing.css          # Landing page specific styles
│   └── page.tsx             # Use cloudact-* classes
└── [orgSlug]/
    ├── console.css          # Console specific styles
    └── dashboard/page.tsx   # Use console-* classes

components/
├── charts/                  # Use CLOUDACT_COLORS palette
└── ui/                      # shadcn/ui components
```

---

## Implementation Checklist

When creating a new page, verify:

- [ ] Using correct font family (Merriweather for h1/h2 on landing, DM Sans for console)
- [ ] Using cloudact-* classes for landing pages
- [ ] Using console-* classes for console pages
- [ ] No black (#000) colors - using Gray 900 (#111827)
- [ ] Teal is primary color, coral is accent
- [ ] Icon boxes alternate between teal and coral
- [ ] Buttons use cloudact-btn-* or console-button-* classes
- [ ] Cards use cloudact-card or console-stat-card classes
- [ ] Spacing follows the defined patterns
- [ ] No arbitrary Tailwind color classes for brand colors

---

## Quick Reference

### Hero Section Pattern

```html
<section class="relative py-16 md:py-20 overflow-hidden bg-white">
  <div class="container px-4 md:px-12 relative z-10">
    <div class="mx-auto max-w-3xl text-center space-y-4">
      <div class="cloudact-badge">Badge Text</div>
      <h1 class="cloudact-heading-xl">Main Heading</h1>
      <p class="cloudact-body text-lg max-w-2xl mx-auto">Description text</p>
    </div>
  </div>
</section>
```

### Feature Grid Pattern

```html
<section class="py-16 md:py-24 bg-white">
  <div class="container px-4 md:px-12">
    <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <div class="cloudact-card p-8">
        <div class="cloudact-icon-box">Icon</div>
        <h3 class="cloudact-heading-md">Title</h3>
        <p class="cloudact-body-sm">Description</p>
      </div>
    </div>
  </div>
</section>
```

### Console Card Pattern

```html
<div class="console-stat-card">
  <div class="flex items-center gap-3 mb-4">
    <div class="h-10 w-10 rounded-lg bg-[#F0FDFA] flex items-center justify-center">
      <Icon class="h-5 w-5 text-[#007A78]" />
    </div>
    <div>
      <p class="console-card-title">Title</p>
      <p class="console-small">Subtitle</p>
    </div>
  </div>
  <p class="console-metric console-metric-teal">Value</p>
</div>
```

---

*CloudAct.ai Design System v1.0*
*Last Updated: December 2024*
