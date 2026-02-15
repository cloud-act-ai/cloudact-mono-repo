# Theme System - Requirements

## Overview

CSS variable architecture, light/dark mode theming, design tokens, and visual consistency for the CloudAct multi-tenant cost analytics platform. The theme system ensures brand coherence across 50+ console pages, 32 landing pages, and chart components.

## Source Specifications

- `globals.css` — 286 CSS variables (light + dark)
- `console.css` — Console design system (cards, typography, sidebar, buttons)
- `design-tokens.ts` — Chart color palettes and provider color maps
- `theme-provider.tsx` + `theme-toggle.tsx` — Runtime theme switching
- `.claude/skills/design/SKILL.md` — Brand foundation spec

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                    Theme System Layers                                   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Layer 1: CSS Variables (globals.css)                                  │
│  ─────────────────────────────────────                                 │
│  :root { 286 variables }                                              │
│  .dark { inverted overrides }                                         │
│  ├─ Brand colors     (mint, coral, obsidian, blue)                    │
│  ├─ Semantic text     (primary, secondary, tertiary, muted)           │
│  ├─ Surfaces          (primary, secondary, tertiary, hover, active)   │
│  ├─ Borders           (subtle, light, medium, mint, coral)            │
│  ├─ Shadows           (xs–2xl, premium, glow, button)                 │
│  ├─ Typography        (fluid scale, weights, tracking, leading)       │
│  ├─ Z-index           (base → skip-link, 7 levels)                   │
│  ├─ Spacing           (8px grid via Tailwind)                         │
│  └─ shadcn/ui tokens  (background, foreground, primary, etc.)        │
│                                                                        │
│  Layer 2: Console Design System (console.css)                          │
│  ─────────────────────────────────────────────                         │
│  ├─ Typography classes   (.console-page-title, .console-body, etc.)   │
│  ├─ Card system          (.health-card, .metric-card, .console-*)     │
│  ├─ Button variants      (.console-button-primary/secondary/etc.)     │
│  ├─ Sidebar styles       ([data-sidebar], [data-active])              │
│  ├─ Table patterns       (.console-table-card, row hovers)            │
│  └─ Mobile overrides     (breakpoint-specific adjustments)            │
│                                                                        │
│  Layer 3: Global Utilities (globals.css utilities)                     │
│  ─────────────────────────────────────────────                         │
│  ├─ Button classes       (.cloudact-btn-primary/dark/secondary/etc.)  │
│  ├─ Typography classes   (.heading-hero/page/section, .body-*, etc.)  │
│  ├─ Gradient utilities   (.mesh-gradient, .glass-card, etc.)          │
│  ├─ Animations           (15+ @keyframes + utility classes)           │
│  └─ Layout helpers       (.console-page-inner, mobile tabs)           │
│                                                                        │
│  Layer 4: Design Tokens (design-tokens.ts)                             │
│  ─────────────────────────────────────────                              │
│  ├─ Provider color maps  (GenAI, Cloud, SaaS — hex values)            │
│  ├─ Chart palettes       (category-specific, mono, default)           │
│  └─ Helper functions     (getProviderColor, getChartColors, etc.)     │
│                                                                        │
│  Layer 5: Runtime (next-themes)                                        │
│  ──────────────────────────────                                        │
│  ├─ ThemeProvider        (attribute="class", defaultTheme="light")    │
│  ├─ ThemeToggle          (Light/Dark/System switcher UI)              │
│  └─ localStorage         (persisted user preference)                  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Functional Requirements

### FR-TH-001: CSS Variable System

- **FR-TH-001.1**: All theme colors MUST be defined as CSS custom properties in `:root {}` in `globals.css`
- **FR-TH-001.2**: Every CSS variable in `:root {}` MUST have a corresponding override in `.dark {}`
- **FR-TH-001.3**: Brand colors (mint, coral, obsidian, blue) MUST use named tokens: `--cloudact-mint`, `--cloudact-coral`, etc.
- **FR-TH-001.4**: Semantic text colors MUST follow the 4-tier hierarchy: `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-muted`
- **FR-TH-001.5**: Surface colors MUST follow the 5-tier hierarchy: `--surface-primary` through `--surface-active`
- **FR-TH-001.6**: Border colors MUST include at least: `--border-subtle`, `--border-light`, `--border-medium`
- **FR-TH-001.7**: Shadow system MUST include standard scale (`--shadow-xs` to `--shadow-2xl`) and premium variants
- **FR-TH-001.8**: Z-index scale MUST be defined as variables (`--z-base` through `--z-skip-link`)
- **FR-TH-001.9**: Typography scale MUST use `clamp()` for fluid sizing
- **FR-TH-001.10**: All CSS variables MUST be used via `var()` in components — never hardcoded hex in TSX

### FR-TH-002: Light/Dark Mode

- **FR-TH-002.1**: Theme switching MUST use `next-themes` with `attribute="class"` strategy
- **FR-TH-002.2**: Default theme MUST be `"light"`
- **FR-TH-002.3**: System preference detection MUST be enabled (`enableSystem`)
- **FR-TH-002.4**: Theme transitions MUST be disabled during switch (`disableTransitionOnChange`)
- **FR-TH-002.5**: Theme preference MUST persist to localStorage
- **FR-TH-002.6**: Dark mode `.dark {}` block MUST invert: text colors (light on dark), surfaces (dark backgrounds), borders (white-tinted), shadows (reduced opacity)
- **FR-TH-002.7**: ThemeToggle component MUST support collapsed (icon-only) and expanded (labeled buttons) modes
- **FR-TH-002.8**: ThemeToggle MUST handle hydration safely (render skeleton until mounted)
- **FR-TH-002.9**: Three theme options: Light, Dark, System

### FR-TH-003: Console Design System

- **FR-TH-003.1**: Console pages MUST use `.console-*` typography classes instead of raw Tailwind text sizes
- **FR-TH-003.2**: `.console-*` classes MUST include font smoothing, letter spacing, and mobile breakpoint overrides
- **FR-TH-003.3**: `.console-metric` MUST use `font-variant-numeric: tabular-nums` for aligned numbers
- **FR-TH-003.4**: Card system MUST include: `.health-card`, `.metric-card`, `.console-stat-card`, `.console-chart-card`, `.console-table-card`
- **FR-TH-003.5**: `.metric-card.clickable` MUST have hover lift (-3px) and glow effect
- **FR-TH-003.6**: `.metric-card.loading` MUST show shimmer animation
- **FR-TH-003.7**: Sidebar active states MUST use mint for navigation items and coral for cost items
- **FR-TH-003.8**: All interactive elements MUST have `min-height: 44px` touch target

### FR-TH-004: Design Tokens (Charts)

- **FR-TH-004.1**: Provider colors MUST be defined in `design-tokens.ts` with separate maps for GenAI, Cloud, and SaaS
- **FR-TH-004.2**: Chart palettes MUST be category-specific (not one-size-fits-all)
- **FR-TH-004.3**: Mono palettes MUST provide dark→light shade progressions for ring chart segments
- **FR-TH-004.4**: Helper functions MUST handle missing providers gracefully (fallback to default palette)
- **FR-TH-004.5**: `getTrendColor()` MUST return green for positive and coral for negative changes
- **FR-TH-004.6**: Chart colors are JavaScript constants (NOT CSS variables) — they don't change with theme

### FR-TH-005: Button System

- **FR-TH-005.1**: Console buttons: `.console-button-primary` (mint), `.console-button-secondary` (white), `.console-button-destructive` (coral)
- **FR-TH-005.2**: Global buttons: `.cloudact-btn-primary`, `.cloudact-btn-dark`, `.cloudact-btn-secondary`, `.cloudact-btn-destructive`, `.cloudact-btn-outline`, `.cloudact-btn-ghost`
- **FR-TH-005.3**: All buttons MUST have hover, active, focus, and disabled states
- **FR-TH-005.4**: All buttons MUST meet 44px minimum height for touch accessibility
- **FR-TH-005.5**: `.cloudact-btn-dark` MUST include shimmer effect on hover

### FR-TH-006: Animation System

- **FR-TH-006.1**: Core animations MUST include: `fadeIn`, `slideUp`, `shimmer`, `pulse`
- **FR-TH-006.2**: Decorative animations MUST include: `float-slow`, `float-slower`, `float-medium`
- **FR-TH-006.3**: Interactive animations MUST include: `input-glow`, `button-shimmer`, `gradient-shift`
- **FR-TH-006.4**: Animation delay utilities MUST support 100ms through 500ms increments
- **FR-TH-006.5**: Prefer `prefers-reduced-motion: reduce` — decorative animations should respect this media query

### FR-TH-007: Color Migration

- **FR-TH-007.1**: All new components MUST use CSS variables — no hardcoded slate-* Tailwind classes
- **FR-TH-007.2**: Existing components with slate classes should be migrated per the mapping table
- **FR-TH-007.3**: Landing pages (~193 slate instances) are exempt — separate design system
- **FR-TH-007.4**: Chart components (~132 slate instances) are exempt — use design-tokens.ts
- **FR-TH-007.5**: `bg-white`, non-slate colors, `translate-*`, `bg-slate-900` (dark buttons) MUST NOT be changed

---

## Non-Functional Requirements

### NFR-TH-001: Performance

| Standard | Target |
|----------|--------|
| CSS file size | globals.css < 100KB uncompressed |
| Theme switch latency | < 16ms (single frame) |
| No FOUC | Theme resolved before first paint |
| CSS variable lookup | Browser-native, zero JS overhead |

### NFR-TH-002: Accessibility

| Standard | Target |
|----------|--------|
| Text contrast (WCAG AA) | 4.5:1 minimum for normal text |
| Large text contrast | 3:1 minimum |
| Touch targets | 44px minimum height/width |
| Focus indicators | Visible focus ring on all interactive elements |
| Motion | Respect `prefers-reduced-motion` |
| Color not sole indicator | Icons/text accompany color meaning |

### NFR-TH-003: Consistency

| Standard | Target |
|----------|--------|
| Color source | All from CSS variables or design-tokens.ts |
| Typography source | `.console-*` classes or global typography classes |
| Spacing | 8px grid (Tailwind defaults) |
| Border radius | 20px cards, 12px buttons, 8px inputs |
| New hardcoded colors | Zero tolerance — fail code review |

### NFR-TH-004: Maintainability

| Standard | Target |
|----------|--------|
| Single source of truth | globals.css for variables, design-tokens.ts for chart colors |
| Dark mode parity | Every `:root` variable has `.dark` override |
| Variable naming | Semantic (not visual): `--text-primary` not `--text-black` |
| Documentation | This skill + design skill cover all patterns |

---

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/app/globals.css` | 286 CSS variables, animations, global utilities |
| `01-fronted-system/app/[orgSlug]/console.css` | Console design system (1,938 lines) |
| `01-fronted-system/components/theme-provider.tsx` | next-themes wrapper |
| `01-fronted-system/components/theme-toggle.tsx` | Light/Dark/System toggle UI |
| `01-fronted-system/components/console-page-shell.tsx` | Page wrapper with icon variants |
| `01-fronted-system/app/layout.tsx` | ThemeProvider integration |
| `01-fronted-system/lib/costs/design-tokens.ts` | Chart colors and provider maps |
| `01-fronted-system/tailwind.config.ts` | Tailwind theme extensions |
| `.claude/skills/design/SKILL.md` | Brand foundation reference |

---

## SDLC

### Development Workflow

1. **Define variable** — Add to `:root {}` in `globals.css`
2. **Add dark override** — Add corresponding value in `.dark {}`
3. **Use in component** — Reference via `var(--my-variable)` or Tailwind `[var(--my-variable)]`
4. **Test both modes** — Verify light and dark rendering
5. **Check contrast** — Ensure WCAG AA compliance in both modes
6. **Update docs** — If new pattern, add to this skill

### Testing Approach

| Layer | Tool | Scope |
|-------|------|-------|
| Variable completeness | Grep/manual | Every `:root` var has `.dark` counterpart |
| Color migration | Grep | No new slate-* in console components |
| Contrast ratios | Browser DevTools / axe | WCAG AA on all text/background combos |
| Theme switching | Browser | Toggle Light→Dark→System without FOUC |
| Touch targets | Browser DevTools | All buttons/links >= 44px |
| Chart colors | Visual | Correct palette per category |
| Animation | Browser | Respects prefers-reduced-motion |

### Deployment / CI/CD

- **Stage:** CSS changes deploy with frontend on `git push origin main`
- **Production:** Triggered by `git tag v*`
- **Dark mode gate:** Not shipped to users until all console pages pass dark mode visual review
- **No runtime cost:** CSS variables are browser-native, zero bundle impact

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/design` | Brand spec that theme implements. Colors, typography rules, accessibility standards. |
| `/console-ui` | Console components that consume theme variables. Card, sidebar, layout patterns. |
| `/charts` | Chart components use design-tokens.ts. Independent from CSS variable system. |
| `/frontend-dev` | Next.js patterns, component architecture, layout integration. |
| `/home-page` | Landing pages have separate color system, not on CSS variables yet. |
