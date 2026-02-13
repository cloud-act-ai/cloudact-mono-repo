---
name: design
description: |
  CloudAct brand foundation and design system. Colors, typography, buttons, UX rules, accessibility.
  Use when: applying brand colors, choosing typography, creating buttons, reviewing UI for brand compliance,
  checking accessibility, or establishing design patterns for any CloudAct page (console or landing).
---

# Design - Brand Foundation

CloudAct design system source of truth. Light-only theme. Mobile-first responsive. DM Sans typography. Mint/Coral/Obsidian color system.

## Trigger

Use when: applying brand colors, choosing typography, creating buttons, reviewing UI for brand compliance, checking accessibility, or establishing design patterns.

```
/design                    # Full brand guide
/design colors             # Color system reference
/design buttons            # Button patterns
/design typography         # Font and text rules
/design mobile             # Mobile responsive rules
/design checklist          # Pre-delivery QA checklist
```

## Key Locations

| File | Purpose |
|------|---------|
| `01-fronted-system/app/globals.css` | CSS variables, chart colors |
| `01-fronted-system/app/[orgSlug]/console.css` | Console-specific styles |
| `01-fronted-system/app/(landingPages)/landing.css` | Landing page styles |
| `01-fronted-system/lib/costs/design-tokens.ts` | Chart palettes, provider colors, color helpers (439 lines) |

---

## Theme

**Light-first.** Default is white surfaces. Dark mode CSS variables exist in `.dark {}` block of `globals.css` and are used by typography/surface classes. No theme toggle shipped yet, but all new code must use CSS variables for theme readiness.

---

## Color System

### Brand Colors

| Color | Variable | Hex | Use |
|-------|----------|-----|-----|
| **Mint** | `--cloudact-mint` | `#90FCA6` | Primary buttons, success, features, positive trends |
| Mint Light | `--cloudact-mint-light` | `#B8FDCA` | Hover backgrounds, subtle tints |
| Mint Dark | `--cloudact-mint-dark` | `#6EE890` | Button hover state |
| Mint Active | - | `#5DD97F` | Button active/pressed state |
| Mint Text | `--cloudact-mint-text` | `#0F5132` | Text on mint backgrounds |
| **Coral** | `--cloudact-coral` | `#FF6C5E` | Costs, warnings, destructive, alerts |
| Coral Light | `--cloudact-coral-light` | `#FF8A7F` | Hover states |
| Coral Dark | `--cloudact-coral-dark` | `#E5544A` | Active states |
| **Obsidian** | `--cloudact-obsidian` | `#0a0a0b` | Dark buttons, auth panels |
| **Blue** | `--cloudact-blue` | `#007AFF` | Charts ONLY (never links/buttons) |

### Semantic Usage

| Context | Color | Rule |
|---------|-------|------|
| Primary CTA | Mint `#90FCA6` | Console buttons, landing CTAs |
| Secondary CTA | Obsidian `#0a0a0b` | Dark buttons, auth flows |
| Destructive | Coral `#FF6C5E` | Delete, warnings |
| Success indicator | Emerald `#10B981` | NOT mint (emerald has better contrast) |
| Info | Blue `#3B82F6` | Charts only |
| Warning text | Amber `#D97706` | Caution indicators |
| Error text | Red `#DC2626` | Error messages |

### Forbidden Console Colors

**NEVER** use these colors in console UI (outside of charts):

| Color | Why Forbidden |
|-------|---------------|
| Purple / Violet (`#8B5CF6`, `#7C3AED`) | Off-brand. Use slate for neutral accents. |
| Indigo (`#4F46E5`, `#6366F1`) | Removed from brand. Use mint for primary accent. |
| Blue (`#3B82F6`) | Reserved for chart data only. Not for buttons, links, or badges. |

**Allowed substitutions:** Use `slate-600`/`slate-100` for neutral, `--cloudact-mint` for primary, `--cloudact-coral` for warnings/costs.

### Where Colors Are Allowed

| Color | Allowed | Forbidden |
|-------|---------|-----------|
| Mint `#90FCA6` | Buttons, borders, glows, section gradients | Text, headings (poor contrast on white) |
| Coral `#FF6C5E` | Alerts, warnings, cost highlights, gradients | Primary CTAs, headings |
| Blue `#007AFF` | Chart data lines/bars | Buttons, links, text |
| Obsidian `#0a0a0b` | Dark buttons, auth panels | Console card backgrounds |

### Surface Colors

```
Surface:       #FFFFFF  (Primary background - white)
Surface Alt:   #FAFAFA  (Off-white for depth layers)
Surface Alt 2: #F9FAFB  (Gray-50 - secondary surface, console only)
```

### Text Colors

| Context | Color | Class |
|---------|-------|-------|
| Headings | `#1C1C1E` | `text-gray-900` |
| Body text | `#1C1C1E` | `text-gray-900` |
| Labels | `#6B7280` | `text-gray-500` |
| Captions | `#9CA3AF` | `text-gray-400` |
| Links | `#1C1C1E` underline | `text-gray-900 underline` |
| Success | `#059669` | `text-emerald-600` |
| Error | `#DC2626` | `text-red-600` |
| Warning | `#D97706` | `text-amber-600` |

### Chart Color Palette

```tsx
// lib/costs/design-tokens.ts (simplified - actual file is 439 lines)
export const CHART_COLORS = {
  primary: '#90FCA6',      // Mint - primary metric
  secondary: '#6EE890',    // Mint dark - secondary
  tertiary: '#B8FDCA',     // Mint light - tertiary
  coral: '#FF6C5E',        // Warnings, negative
  blue: '#3B82F6',         // Info, neutral data
  purple: '#8B5CF6',       // Categories
  amber: '#F59E0B',        // Attention
  gray: '#9CA3AF',         // Baseline, inactive
};

export const CATEGORY_COLORS = [
  '#3B82F6', // blue
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#F59E0B', // amber
  '#10B981', // emerald
  '#6366F1', // indigo
];
```

### Provider Colors

| Category | Provider | Hex |
|----------|----------|-----|
| GenAI | OpenAI | `#10A37F` |
| GenAI | Anthropic | `#D97757` |
| GenAI | Google/Gemini | `#4285F4` / `#8E75B2` |
| GenAI | DeepSeek | `#5865F2` |
| GenAI | Azure OpenAI | `#0078D4` |
| GenAI | AWS Bedrock | `#FF9900` |
| Cloud | GCP | `#4285F4` |
| Cloud | AWS | `#FF9900` |
| Cloud | Azure | `#0078D4` |
| Cloud | OCI | `#F80000` |
| SaaS | Slack | `#4A154B` |
| SaaS | Canva | `#00C4CC` |
| SaaS | GitHub | `#24292F` |

### Category Colors

| Category | Hex | Use |
|----------|-----|-----|
| GenAI | `#10A37F` | GenAI cost dashboards |
| Cloud | `#4285F4` | Cloud cost dashboards |
| Subscription | `#FF6C5E` | SaaS cost dashboards |

---

## Typography

**Font:** DM Sans (loaded via `next/font/google`)

### Console Type Scale (from console.css)

| Class | Size | Weight | Use |
|-------|------|--------|-----|
| `.console-page-title` | 1.5rem (24px) | 700 | Page headers |
| `.console-heading` | 1.125rem (18px) | 700 | Section headers |
| `.console-section-title` | 1.125rem (18px) | 700 | Section titles (with margin) |
| `.console-card-title` | 0.875rem (14px) | 600 | Card titles |
| `.console-body` | 0.875rem (14px) | 400 | Body text |
| `.console-small` | 0.75rem (12px) | 400 | Secondary text, captions |
| `.console-metric` | 1.5rem (24px) | 600 | Large numbers (`tabular-nums`) |
| `.console-metric-unit` | 1rem (16px) | 500 | Currency symbols next to metrics |

### Typography Rules

- Base font size: 14px (`0.875rem`) — reduced to openclaw dashboard standard
- Line height: 1.5 for body, 1.3 for card titles, 1.4 for small text
- Line length: 65-75 characters max per line
- Currency values: `tabular-nums` + `font-variant-numeric: tabular-nums`
- Code: JetBrains Mono (monospace)
- Minimum body text on mobile: 16px (prevents iOS zoom)
- Font smoothing: `-webkit-font-smoothing: antialiased` on all console text

### Font Consistency (CRITICAL)

**ALWAYS use `.console-*` CSS classes** instead of hardcoded Tailwind sizes.

| DO NOT USE | USE INSTEAD |
|------------|-------------|
| `text-[20px]`, `text-2xl` | `.console-page-title` (1.5rem) |
| `text-[18px]`, `text-lg` | `.console-heading` (1.125rem) |
| `text-[14px]`, `text-sm` | `.console-body` (0.875rem) |
| `text-[12px]`, `text-xs` | `.console-small` (0.75rem) |
| `text-[24px]`, `text-xl` | `.console-metric` (1.5rem) |
| `text-[10px]` | `.console-small` (0.75rem minimum) |

**Why:** Hardcoded Tailwind sizes bypass mobile responsive overrides in `console.css`. The `.console-*` classes include font smoothing, letter spacing, and mobile breakpoint adjustments.

---

## Button System

### Console Buttons

| Type | Background | Text | Use |
|------|------------|------|-----|
| Primary | `#90FCA6` | `#000000` | Console CTAs (Save, Create) |
| Secondary | `#FFFFFF` border | `#1C1C1E` | Cancel, secondary actions |
| Ghost | Transparent | `#374151` | Learn More, tertiary |
| Destructive | `#FF6C5E` | `#FFFFFF` | Delete, remove |
| Dark | `#0a0a0b` | `#FFFFFF` | Auth flows |
| Icon | `#FFFFFF` border | `#6B7280` | Icon-only buttons |

```tsx
// Primary (console)
<button className="bg-[#90FCA6] text-black hover:bg-[#6EE890] active:bg-[#5DD97F] rounded-lg px-4 py-2.5 font-medium shadow-sm hover:shadow-md transition-all duration-200">
  Save Changes
</button>

// Secondary
<button className="bg-white text-gray-900 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-lg px-4 py-2.5 font-medium transition-all duration-200">
  Cancel
</button>

// Destructive
<button className="bg-[#FF6C5E] text-white hover:bg-[#e85a4d] active:bg-[#d94d3f] rounded-lg px-4 py-2.5 font-medium shadow-sm transition-all duration-200">
  Delete
</button>
```

### Landing Page Buttons (MUST USE INLINE STYLES)

**CRITICAL:** `landing.css` and `globals.css` override Tailwind classes. Always use `style={{}}` for button colors on landing pages.

```tsx
// Primary CTA (mint)
<Link
  href="/signup"
  className="group relative inline-flex items-center h-11 px-6 rounded-lg overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-[#90FCA6]/30 hover:-translate-y-0.5"
  style={{ backgroundColor: '#90FCA6' }}
>
  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
  <span className="relative text-sm font-semibold" style={{ color: '#0f172a' }}>
    Get Started Free
  </span>
</Link>

// Secondary CTA (dark)
style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
```

### Key Button Features

- Touch target: `h-11` (44px minimum)
- Border radius: `rounded-lg` (enterprise)
- Hover lift: `hover:-translate-y-0.5`
- Shine sweep: `duration-700` gradient animation
- `overflow-hidden` required for shine effect
- Smooth transitions: `transition-all duration-200`

---

## CSS-First Rule (CRITICAL)

**Colors, font sizes, and layout constraints MUST be defined in CSS classes — NOT hardcoded in TSX files.**

| DO NOT | DO |
|--------|----|
| `text-[14px]` in TSX | `.console-body` CSS class |
| `text-purple-600` in TSX | `.console-color-ytd` or `text-slate-600` |
| `bg-[#4F46E5]` in TSX | `bg-[var(--cloudact-mint)]` or CSS class |
| `max-w-7xl mx-auto` (repeated) | `.console-page-inner` CSS class |

**Why:** Hardcoded values can't be overridden at breakpoints, create inconsistency, and make design changes require touching 50+ files. CSS classes change once, apply everywhere.

**CSS class source:** `globals.css` (bottom section: "Console Design System Classes")

---

## Layout Architecture

### Dashboard Layout (Root)

`app/[orgSlug]/layout.tsx` wraps ALL console pages with:
- Sidebar (desktop) + Mobile header (mobile)
- `<main className="console-main-gradient flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">` — provides responsive padding

**Individual pages do NOT need padding.** The root layout handles it.

### Page Content Pattern

```tsx
// CORRECT: Inside dashboard layout
<div className="console-page-inner">
  {/* max-w-7xl mx-auto + vertical spacing between sections */}
  <h1>Page Title</h1>
  <div>Section 1</div>
  <div>Section 2</div>
</div>

// WRONG: Don't add your own shell/padding inside dashboard
<main className="min-h-screen bg-white">           {/* ← Nested main = wrong */}
  <div className="max-w-7xl mx-auto px-4 py-6">    {/* ← Double padding = wrong */}
```

### Layout Classes

| Class | Use | Provides |
|-------|-----|----------|
| `.console-page-inner` | Dashboard pages | `max-w-7xl` + `mx-auto` + vertical section spacing |
| `.console-page-shell` | Standalone pages (auth, landing) | `min-height: 100vh` + padding (no parent layout) |

### Sub-Layout Pattern

Settings, integrations, and other sub-layouts should use `console-page-inner` or pass through:

```tsx
// Settings layout — provides centering for all settings pages
export default function SettingsLayout({ children }) {
  return <div className="console-page-inner">{children}</div>
}
```

---

## Spacing and Layout

### Grid System

8px base grid. All spacing multiples of 8.

| Token | Value | Tailwind |
|-------|-------|----------|
| `--space-1` | 4px | `p-1` |
| `--space-2` | 8px | `p-2` |
| `--space-4` | 16px | `p-4` |
| `--space-6` | 24px | `p-6` |
| `--space-8` | 32px | `p-8` |

### Border Radius

| Size | Value | Use |
|------|-------|-----|
| sm | 8px | Buttons, inputs |
| md | 12px | Cards |
| lg | 16px | Panels, modals |
| xl | 20px | Large feature cards |
| 2xl | 24px | Hero cards |

### Max Width

All console pages: `max-w-7xl` (1280px). Never full-bleed stretch.

---

## Mobile Responsive (CRITICAL)

### Breakpoints

| Breakpoint | Width | Use |
|------------|-------|-----|
| Default | 0-639px | Mobile portrait |
| `sm` | 640px+ | Mobile landscape / small tablet |
| `md` | 768px+ | Tablet |
| `lg` | 1024px+ | Desktop |
| `xl` | 1280px+ | Wide desktop |

### Mobile Rules

1. **Touch targets:** Minimum 44x44px on all interactive elements
2. **Font size:** Minimum 16px body text on mobile (prevents zoom on iOS)
3. **No horizontal scroll:** Content must fit viewport width
4. **Viewport meta:** `width=device-width, initial-scale=1`
5. **Stack columns:** Grid columns collapse to single column on mobile
6. **Sidebar:** Sheet overlay on mobile, collapsible rail on desktop
7. **Cards:** Full-width on mobile, grid on desktop
8. **Tables:** Horizontally scrollable or card-view on mobile
9. **Charts:** Responsive container, simplified on small screens
10. **Navigation:** Bottom nav or hamburger menu on mobile

### Responsive Patterns

```tsx
// Grid: 1 col mobile → 2 col tablet → 4 col desktop
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">

// Padding: tighter on mobile
<div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

// Text: smaller on mobile
<h1 className="text-2xl sm:text-3xl font-bold">

// Cards: full width mobile, constrained desktop
<div className="w-full max-w-7xl mx-auto">

// Hide on mobile, show on desktop
<div className="hidden lg:block">

// Show on mobile only
<div className="lg:hidden">
```

---

## Accessibility

### CRITICAL (Priority 1)

- **Color contrast:** Minimum 4.5:1 ratio for normal text
- **Focus states:** Visible focus rings on all interactive elements
- **Alt text:** Descriptive alt text for meaningful images
- **ARIA labels:** `aria-label` for icon-only buttons
- **Keyboard nav:** Tab order matches visual order
- **Form labels:** `<label>` with `htmlFor` attribute
- **Skip-to-content:** Link at top of every page

### Touch & Interaction (Priority 2)

- **Touch targets:** Minimum 44x44px
- **Hover vs tap:** Primary interactions via click/tap
- **Loading buttons:** Disable during async operations
- **Error feedback:** Clear messages near the problem
- **Cursor pointer:** On all clickable elements
- **Smooth transitions:** 150-300ms for micro-interactions

### Performance (Priority 3)

- **Image optimization:** WebP, srcset, lazy loading
- **Reduced motion:** Check `prefers-reduced-motion`
- **Content jumping:** Reserve space for async content

---

## Pre-Delivery Checklist

### Visual Quality
- [ ] Light theme only (no dark mode references)
- [ ] No emoji icons (use Lucide SVG icons)
- [ ] All icons from consistent set (Lucide)
- [ ] Hover states don't cause layout shift
- [ ] Brand colors used correctly (mint=features, coral=costs)

### Buttons
- [ ] Landing page buttons use `style={{}}` for colors
- [ ] Console buttons use Tailwind classes
- [ ] All buttons have 44px minimum touch target
- [ ] Hover/active states defined

### Typography
- [ ] DM Sans font loaded
- [ ] Using `.console-*` CSS classes (NOT hardcoded Tailwind sizes)
- [ ] Body text 14px (`.console-body`) minimum
- [ ] Mobile text 16px minimum (inputs auto-sized in console.css)
- [ ] `tabular-nums` on currency values
- [ ] Line length under 75 characters

### Mobile
- [ ] Responsive at 375px, 768px, 1024px, 1440px
- [ ] No horizontal scroll on mobile
- [ ] Touch targets 44x44px minimum
- [ ] Sidebar collapses to sheet on mobile
- [ ] Grid columns stack on mobile

### Accessibility
- [ ] Color contrast 4.5:1 minimum
- [ ] Focus states visible
- [ ] Form inputs have labels
- [ ] `prefers-reduced-motion` respected
- [ ] Skip-to-content link present

### Layout
- [ ] Uses `console-page-inner` (NOT manual `max-w-7xl mx-auto`)
- [ ] No nested `<main>` tags inside dashboard layout
- [ ] No redundant padding (root layout provides `p-4 md:p-6 lg:p-8`)
- [ ] 8px grid spacing
- [ ] No content behind fixed elements

### Color Compliance
- [ ] No purple/violet/indigo in console UI (slate for neutral, mint for primary)
- [ ] Blue used only in charts
- [ ] Brand colors via CSS variables, not hex literals
- [ ] No `text-[9px]` or `text-[10px]` (minimum 12px / `text-xs`)

---

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Button text disappears (landing) | CSS overrides Tailwind | Use `style={{}}` for colors |
| Mint text unreadable | Poor contrast on white | Never use mint for text |
| Blue used for buttons | Mixing chart/UI colors | Blue is charts ONLY |
| Layout shift on hover | Scale transforms | Use color/opacity transitions |
| Mobile text too small | Missing responsive size | Use `text-base` (16px) minimum |
| Sidebar overlaps content | Missing mobile breakpoint | Use Sheet on mobile |
| Font sizes inconsistent | Hardcoded Tailwind (text-[20px]) | Use `.console-*` CSS classes |
| Mobile text not scaling | Hardcoded px values | `.console-*` classes have mobile overrides |
| Double padding | Page adds own `<main>` + padding inside layout | Use `console-page-inner` only (no `<main>`) |
| Purple/indigo in console | Off-brand color | Replace with slate (neutral) or mint (primary) |
| Left-aligned page | Missing `mx-auto` | Use `console-page-inner` CSS class |

---

## Page Layout Standard (Mobile-First)

```
Root Layout [orgSlug]/layout.tsx
  └─ <main className="console-main-gradient flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
      └─ Page content (NO <main>, NO min-h-screen, NO bg-white)
```

| Type | CSS Class | Width | Use |
|------|-----------|-------|-----|
| **Standard** | `console-page-inner` | `max-w-7xl` (1280px) centered | Dashboard, analytics, pipelines, integrations, notifications, settings |
| **Full-bleed** | None (fills parent) | 100% of main area | Chat (needs viewport height) |
| **Standalone** | `console-page-shell` + `console-page-inner` | Full viewport + 1280px inner | Auth pages, landing (no sidebar) |

**Rules:** No `max-w-2xl` or `max-w-3xl` page wrappers. If a form needs narrow layout, use grid columns.

---

## Theme Variable Usage

Typography classes (`console-page-title`, `console-heading`, `console-body`, `console-small`, `console-metric`) all use `--text-*` CSS variables. These auto-switch in `.dark {}`.

| Variable | Light | Dark | Use |
|----------|-------|------|-----|
| `--text-primary` | `#0f172a` | `#f8fafc` | Page titles, headings, metric values |
| `--text-secondary` | `#334155` | `#e2e8f0` | Body text, descriptions |
| `--text-tertiary` | `#64748b` | `#94a3b8` | Captions, labels, metadata |
| `--text-muted` | `#94a3b8` | `#64748b` | Placeholders, disabled text |
| `--surface-primary` | `#ffffff` | `#1c1c1e` | Page backgrounds, cards, sidebar |
| `--border-subtle` | `rgba(0,0,0,0.04)` | `rgba(255,255,255,0.1)` | Section dividers, sidebar borders |
| `--border-medium` | `rgba(0,0,0,0.1)` | `rgba(255,255,255,0.15)` | Card borders, input borders |

---

## CSS Variable Migration Standard (Slate → Theme Variables)

All console components MUST use CSS variables instead of hardcoded `slate-*` Tailwind classes. This migration was completed across 40+ component files.

### Color Mapping Table

| Hardcoded Slate Class | CSS Variable Replacement | Semantic Meaning |
|----------------------|--------------------------|------------------|
| `text-slate-900`, `text-slate-800` | `text-[var(--text-primary)]` | Primary text, headings |
| `text-slate-700`, `text-slate-600` | `text-[var(--text-secondary)]` | Body text, descriptions |
| `text-slate-500` | `text-[var(--text-tertiary)]` | Captions, labels, metadata |
| `text-slate-400`, `text-slate-300` | `text-[var(--text-muted)]` | Placeholders, disabled text |
| `bg-slate-100`, `bg-slate-50` | `bg-[var(--surface-secondary)]` | Secondary surfaces, hover backgrounds |
| `bg-slate-200` | `bg-[var(--surface-hover)]` | Hover states |
| `border-slate-200`, `border-slate-100` | `border-[var(--border-subtle)]` | Light borders, dividers |
| `border-slate-300` | `border-[var(--border-medium)]` | Medium borders, input borders |
| `divide-slate-200`, `divide-slate-100` | `divide-[var(--border-subtle)]` | Table/list dividers |
| `ring-slate-200` | `ring-[var(--border-subtle)]` | Focus rings |
| `placeholder-slate-400` | `placeholder-[var(--text-muted)]` | Input placeholders |

### Rules

1. **Preserve state prefixes** — `hover:`, `focus:`, `disabled:`, `dark:`, `group-hover:` prefixes stay: e.g., `hover:text-slate-700` → `hover:text-[var(--text-secondary)]`
2. **Never change `bg-white`** — White backgrounds are intentional light-theme design
3. **Never change non-slate colors** — Emerald, red, blue, amber, mint, coral are semantic and stay as-is
4. **`translate-*` is NOT a color** — `grep slate-` matches `translate-y-0.5` etc. — these are CSS transforms, not colors
5. **Intentional dark buttons stay** — `bg-slate-900`/`hover:bg-slate-800` for obsidian CTA buttons are intentional

### Remaining (Intentional or Out of Scope)

| Category | Count | Reason |
|----------|-------|--------|
| Landing pages | ~193 | Separate design system (`landing.css`), uses `style={{}}` inline |
| Charts | ~132 | Chart-specific color logic in `design-tokens.ts` |
| Dark button variants | ~15 | Intentional `bg-slate-900` for obsidian/dark CTAs |
| CSS transform `translate-*` | ~49 | False positives — not color classes |

---

## Forbidden Patterns (Console Pages)

| Pattern | Replace With |
|---------|-------------|
| `bg-white` on page wrappers | Remove (parent layout provides background) |
| `bg-white` on cards/sidebar | `bg-[var(--surface-primary)]` |
| `color: #0f172a` or `text-slate-900` | `var(--text-primary)` or `console-page-title` class |
| `border-slate-100` on dividers | `border-[var(--border-subtle)]` |
| `min-h-screen` on page content | Remove (parent layout handles height) |
| `<main>` inside console pages | `<div>` (layout already provides `<main>`) |
| `text-[#90FCA6]` on white bg | `text-[var(--cloudact-mint-text)]` (#0F5132) |
| `max-w-2xl` on page wrappers | Remove (use `console-page-inner` from parent) |
| `text-slate-*` / `bg-slate-*` / `border-slate-*` | Use CSS variables (see migration table above) |

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `home-page` | Landing page patterns (extends brand with gradient alternation) |
| `console-ui` | Console component library (applies brand to dashboard UI) |
| `charts` | Recharts library (uses chart color palette from this skill) |
| `frontend-dev` | Next.js code patterns (implements brand in pages) |
