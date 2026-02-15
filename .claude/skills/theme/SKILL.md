---
name: theme
description: |
  CloudAct theme system. CSS variables, light/dark mode, design tokens, typography, shadows, and color palettes.
  Use when: modifying theme colors, adding CSS variables, working with dark mode, updating design tokens,
  changing typography, editing globals.css or console.css, migrating hardcoded colors to CSS variables,
  or integrating the theme toggle into the UI.
---

# /theme - CloudAct Theme System

CSS variable architecture, light/dark mode switching, design tokens, and the console design system.

## Trigger

```
/theme                                   # Overview
/theme variables                         # CSS variable reference
/theme dark-mode                         # Dark mode status & implementation
/theme migrate <component>              # Migrate hardcoded colors to CSS variables
/theme tokens                            # Design tokens reference (charts, providers)
```

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                     CloudAct Theme Architecture                         │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  next-themes (ThemeProvider)                                           │
│  ┌──────────────────────────────────────────┐                         │
│  │ attribute="class"                         │ Adds/removes .dark on  │
│  │ defaultTheme="light"                      │ <html> element         │
│  │ enableSystem                              │                         │
│  │ disableTransitionOnChange                 │                         │
│  └──────────────┬───────────────────────────┘                         │
│                  │                                                      │
│                  ▼                                                      │
│  globals.css                                                           │
│  ┌──────────────────────────────────────────┐                         │
│  │ :root { }           286 CSS variables     │ Light mode (default)   │
│  │ .dark { }           Inverted values       │ Dark mode (ready)      │
│  │ @layer base { }     Tailwind resets       │                         │
│  │ Animations          15+ keyframes         │                         │
│  │ Button system       6 button variants     │                         │
│  │ Typography          heading/body/metric   │                         │
│  └──────────────┬───────────────────────────┘                         │
│                  │                                                      │
│       ┌──────────┴──────────┐                                          │
│       ▼                     ▼                                          │
│  console.css           design-tokens.ts                                │
│  ┌──────────────┐    ┌──────────────────────┐                         │
│  │ .console-*   │    │ PROVIDER_COLORS      │                         │
│  │ .health-card │    │ CHART_PALETTES       │                         │
│  │ .metric-card │    │ getProviderColor()   │                         │
│  │ Sidebar      │    │ getChartColors()     │                         │
│  │ Buttons      │    │ getTrendColor()      │                         │
│  └──────────────┘    └──────────────────────┘                         │
│                                                                        │
│  Components                                                            │
│  ┌──────────────────────────────────────────┐                         │
│  │ theme-provider.tsx  next-themes wrapper   │                         │
│  │ theme-toggle.tsx    Light/Dark/System UI   │                         │
│  │ console-page-shell  Page wrapper + icons  │                         │
│  └──────────────────────────────────────────┘                         │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

## Key Locations

| Type | Path |
|------|------|
| **CSS Variables (light + dark)** | `01-fronted-system/app/globals.css` |
| **Console Design System** | `01-fronted-system/app/[orgSlug]/console.css` |
| **Theme Provider** | `01-fronted-system/components/theme-provider.tsx` |
| **Theme Toggle** | `01-fronted-system/components/theme-toggle.tsx` |
| **Console Page Shell** | `01-fronted-system/components/console-page-shell.tsx` |
| **Root Layout** | `01-fronted-system/app/layout.tsx` |
| **Design Tokens** | `01-fronted-system/lib/costs/design-tokens.ts` |
| **Tailwind Config** | `01-fronted-system/tailwind.config.ts` |
| **Design Skill** | `.claude/skills/design/SKILL.md` |

## Brand Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--cloudact-mint` | `#90FCA6` | Primary brand, CTAs, active states |
| `--cloudact-mint-light` | `#B8FDCA` | Hover tints, chart secondary |
| `--cloudact-mint-dark` | `#6EE890` | Chart tertiary |
| `--cloudact-mint-darker` | `#4DD979` | Pressed states |
| `--cloudact-mint-text` | `#0F5132` | Text on mint backgrounds |
| `--cloudact-coral` | `#FF6C5E` | Costs, warnings, destructive |
| `--cloudact-coral-light` | `#FF8A7F` | Coral hover |
| `--cloudact-coral-dark` | `#E5544A` | Coral pressed |
| `--cloudact-coral-text` | `#CC4F35` | Text on coral backgrounds |
| `--cloudact-blue` | `#007AFF` | Charts ONLY (never UI elements) |
| `--cloudact-obsidian` | `#0a0a0b` | Dark buttons |

## Semantic Color Variables

### Text

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--text-primary` | `#0f172a` (slate-900) | `#f8fafc` | Headings, titles |
| `--text-secondary` | `#334155` (slate-700) | `#e2e8f0` | Body text |
| `--text-tertiary` | `#64748b` (slate-500) | `#94a3b8` | Captions, metadata |
| `--text-muted` | `#94a3b8` (slate-400) | `#64748b` | Placeholders, disabled |

### Surfaces

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--surface-primary` | `#ffffff` | `#1c1c1e` | Main background |
| `--surface-secondary` | `#fafafa` | `#2c2c2e` | Off-white depth |
| `--surface-tertiary` | `rgba(mint, 0.04)` | `rgba(mint, 0.06)` | Mint tint |
| `--surface-hover` | `rgba(mint, 0.06)` | `rgba(mint, 0.08)` | Hover state |
| `--surface-active` | `rgba(mint, 0.12)` | `rgba(mint, 0.15)` | Active/selected |

### Borders

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--border-subtle` | `rgba(0,0,0,0.04)` | `rgba(255,255,255,0.06)` | Subtle dividers |
| `--border-light` | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.08)` | Light borders |
| `--border-medium` | `rgba(0,0,0,0.1)` | `rgba(255,255,255,0.12)` | Standard borders |
| `--border-mint` | `rgba(mint, 0.3)` | `rgba(mint, 0.4)` | Mint accent borders |
| `--border-coral` | `rgba(coral, 0.3)` | `rgba(coral, 0.4)` | Coral accent borders |

## Slate → CSS Variable Migration

**Completed 2026-02-12:** 600+ replacements across 40+ component files.

### Quick Migration Table

| Hardcoded Tailwind | CSS Variable | Semantic |
|-------------------|-------------|----------|
| `text-slate-900` / `text-slate-800` | `text-[var(--text-primary)]` | Primary text |
| `text-slate-700` / `text-slate-600` | `text-[var(--text-secondary)]` | Body text |
| `text-slate-500` | `text-[var(--text-tertiary)]` | Captions |
| `text-slate-400` / `text-slate-300` | `text-[var(--text-muted)]` | Placeholders |
| `bg-slate-100` / `bg-slate-50` | `bg-[var(--surface-secondary)]` | Secondary bg |
| `border-slate-200` / `border-slate-100` | `border-[var(--border-subtle)]` | Light borders |
| `border-slate-300` | `border-[var(--border-medium)]` | Medium borders |
| `bg-slate-200` | `bg-[var(--border-light)]` | Dividers |
| `hover:bg-slate-50` | `hover:bg-[var(--surface-hover)]` | Hover states |

### NEVER Change

- `bg-white` — Intentional light design
- Non-slate colors: `emerald-*`, `red-*`, `amber-*`, `blue-*`
- `translate-*` — CSS transforms, not colors
- `bg-slate-900` — Intentional obsidian dark buttons
- Landing pages (~193 instances) — Separate design system
- Charts (~132 instances) — Uses design-tokens.ts

## Typography System

### Console Classes (Always prefer over raw Tailwind)

| Class | Size | Weight | Use |
|-------|------|--------|-----|
| `.console-page-title` | 24px | 700 | Page headings |
| `.console-heading` | 18px | 700 | Section headings |
| `.console-section-title` | 18px | 700 | Section titles (+ margin) |
| `.console-card-title` | 14px | 600 | Card headings |
| `.console-body` | 14px | 400 | Body text |
| `.console-small` | 12px | 400 | Metadata, captions |
| `.console-metric` | 24px | 600 | Numbers (tabular-nums) |
| `.console-metric-unit` | 16px | 500 | Currency symbols, units |

### Global Typography Classes

| Class | Size | Weight | Use |
|-------|------|--------|-----|
| `.heading-hero` | 5xl | Bold | Hero sections |
| `.heading-page` | 4xl | Bold | Page titles |
| `.heading-section` | 2xl | Bold | Sections |
| `.heading-card` | xl | Semibold | Cards |
| `.body-lg` / `.body-base` / `.body-sm` | lg/base/sm | Normal | Body text |
| `.metric-value` / `.metric-value-lg` / `.metric-value-sm` | 4xl/5xl/2xl | Semibold | Metrics |
| `.badge-text` | xs | Semibold | Uppercase badges |

## Shadow System

| Variable | Usage |
|----------|-------|
| `--shadow-xs` through `--shadow-2xl` | Standard elevation scale |
| `--shadow-premium-xs` through `--shadow-premium-xl` | Refined Apple-style shadows |
| `--shadow-glow-mint` | Mint glow on hover/active |
| `--shadow-glow-coral` | Coral glow for warnings |
| `--shadow-button-mint` | Mint button shadow |
| `--shadow-button-coral` | Coral button shadow |

## Button System

### Console Buttons (CSS classes)

| Class | Colors | Text |
|-------|--------|------|
| `.console-button-primary` | Mint bg | Black text |
| `.console-button-secondary` | White bg, border | Black text |
| `.console-button-destructive` | Coral bg | White text |

### Global Buttons (CSS classes)

| Class | Colors | Text |
|-------|--------|------|
| `.cloudact-btn-primary` | Mint bg | Black text |
| `.cloudact-btn-dark` | Obsidian bg | White text |
| `.cloudact-btn-secondary` | White bg, border | Black text |
| `.cloudact-btn-destructive` | Coral bg | White text |
| `.cloudact-btn-outline` | Transparent, mint border | Mint text |
| `.cloudact-btn-ghost` | No bg | Inherit text |

All buttons: `min-height: 44px` touch target, hover/active/focus/disabled states, smooth transitions.

## Card System

| Class | Style | Use |
|-------|-------|-----|
| `.health-card` | 20px radius, subtle shadow | Apple Health style cards |
| `.metric-card` | Inner highlight gradient | KPI metric display |
| `.metric-card.clickable` | Hover: -3px lift + glow | Interactive metrics |
| `.metric-card.loading` | Shimmer animation | Loading state |
| `.console-stat-card` | Reusable stat card | Statistics |
| `.console-chart-card` | 20px radius container | Chart wrapper |
| `.console-table-card` | Hover shadow | Table wrapper |

## Theme Provider & Toggle

### ThemeProvider (layout.tsx)

```tsx
<ThemeProvider
  attribute="class"           // Adds/removes 'dark' class on <html>
  defaultTheme="light"        // Light is default
  enableSystem                // Respects OS preference
  disableTransitionOnChange   // Prevents flash
>
```

### ThemeToggle Component

```tsx
import { ThemeToggle } from "@/components/theme-toggle"

// Collapsed mode (icon-only, cycles Light→Dark→System)
<ThemeToggle collapsed={true} />

// Expanded mode (three labeled buttons)
<ThemeToggle collapsed={false} />
```

Uses `useTheme()` from `next-themes`. Icons: `Sun`, `Moon`, `Monitor` from Lucide.

## Design Tokens (Charts)

### Provider Color Maps

| Map | Providers |
|-----|-----------|
| `GENAI_PROVIDER_COLORS` | openai, anthropic, google, gemini, deepseek, azure_openai, aws_bedrock |
| `CLOUD_PROVIDER_COLORS` | gcp, aws, azure, oci |
| `SAAS_PROVIDER_COLORS` | slack, github, figma, canva |

### Chart Palettes

| Palette | Colors | Use |
|---------|--------|-----|
| `DEFAULT_CHART_PALETTE` | 8 generic | Fallback |
| `GENAI_CHART_PALETTE` | GenAI-specific | GenAI cost pages |
| `CLOUD_CHART_PALETTE` | Cloud-specific | Cloud cost pages |
| `SUBSCRIPTION_CHART_PALETTE` | SaaS-specific | Subscription pages |
| `OVERVIEW_CHART_PALETTE` | 3 colors (green/blue/coral) | Overview dashboard |
| `*_MONO_PALETTE` | Dark→light shades | Ring chart segments |

### Helper Functions

```typescript
getProviderColor(provider, category)     // Lookup by name + category
getCategoryColor(category)               // Category → color
getChartColors(items, category)          // Array for chart series
getChartColorAtIndex(index, category)    // Single color by index
getMonoShade(index, category)            // Ring chart segments
assignRingChartColors<T>(segments, cat)  // Color assignment utility
getTrendColor(change)                    // Green (positive) / Coral (negative)
```

## Animations

| Keyframe | Duration | Use |
|----------|----------|-----|
| `fadeIn` | 0.3s | General fade-in |
| `slideUp` | 0.3s | Modal/drawer entry |
| `shimmer` | 1.5s | Loading skeleton |
| `pulse` | 0.5s | Attention pulse |
| `float-slow/slower/medium` | 15-25s | Background decorations |
| `input-glow` | 2s | Focused input mint glow |
| `fade-up` | 0.6s | Scroll reveal |
| `gradient-shift` | 3s | Background gradient animation |
| `button-shimmer` | 0.6s | Button shine effect |
| `accordion-down/up` | Radix | Accordion expand/collapse |

## Z-Index Scale

| Variable | Value | Use |
|----------|-------|-----|
| `--z-base` | 0 | Default |
| `--z-sticky` | 10 | Sticky headers |
| `--z-dropdown` | 20 | Dropdowns |
| `--z-sidebar` | 30 | Sidebar |
| `--z-modal` | 40 | Modals, sheets |
| `--z-tooltip` | 50 | Tooltips |
| `--z-toast` | 60 | Toast notifications |
| `--z-skip-link` | 100 | Accessibility skip link |

## Procedures

### Add a New CSS Variable

1. Define in `:root {}` block in `globals.css`
2. Add dark mode override in `.dark {}` block
3. Use in components: `text-[var(--my-variable)]` or `className="..."` with CSS `var()`
4. Never hardcode colors in TSX — always use variables

### Migrate a Component to CSS Variables

1. Find hardcoded slate classes: `grep -n "slate-" path/to/component.tsx`
2. Replace using the migration table above
3. Test in light mode — values should look identical
4. Verify dark mode override exists in `.dark {}` for every variable used

### Add Dark Mode Support to a Component

1. Ensure ALL colors use CSS variables (no hardcoded Tailwind colors)
2. Test with `ThemeToggle` — switch to dark and back
3. Check contrast ratios (WCAG AA: 4.5:1 text, 3:1 large text)
4. Verify shadows use `--shadow-*` variables (dark mode inverts)

### Add a New Chart Color

1. Add to appropriate map in `design-tokens.ts` (`GENAI_PROVIDER_COLORS`, etc.)
2. Add to chart palette if needed (`GENAI_CHART_PALETTE`, etc.)
3. Use `getProviderColor(name, category)` in chart components

## Dark Mode Status

**Current state:** Dark mode CSS is **fully implemented** but **not shipped to users**.

- `:root {}` — 286 light mode variables (production)
- `.dark {}` — Complete dark mode overrides (ready)
- `ThemeProvider` — Configured in `layout.tsx` with `defaultTheme="light"`
- `ThemeToggle` — Component built, not wired into sidebar yet

**To ship dark mode:**
1. Add `<ThemeToggle />` to `dashboard-sidebar.tsx`
2. Test all console pages in dark mode
3. Verify chart colors work on dark backgrounds
4. Check 3rd-party components (shadcn/ui, Recharts) in dark mode

## Development Rules (Non-Negotiable)

- **CSS variables first** — Never hardcode colors in TSX. Use `var(--*)` tokens.
- **Console classes over Tailwind** — Use `.console-*` classes for typography, cards, buttons.
- **Design tokens for charts** — Use `design-tokens.ts` functions, never inline hex colors.
- **44px touch targets** — All interactive elements must meet mobile accessibility.
- **No `bg-white` removal** — Light theme is intentional; `bg-white` stays.
- **No slate in new code** — All new code uses CSS variables from the migration table.
- **Test both modes** — Even though dark mode isn't shipped, ensure variables have dark overrides.
- **FOCUS 1.3 costs always coral** — Cost/spending data uses `--cloudact-coral` family, never mint.
- **Update skills with learnings** — Document theme patterns and fixes in this skill.

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Flash of unstyled content on load | Missing `disableTransitionOnChange` | Already set in ThemeProvider |
| Hydration mismatch with theme | Rendering theme-dependent UI before mount | Use `mounted` check like ThemeToggle does |
| Dark mode text invisible | Missing `.dark {}` override for variable | Add dark mode value in globals.css |
| Chart colors wrong in dark mode | Using CSS variables in charts | Charts use design-tokens.ts (JS), not CSS variables |
| Sidebar active state wrong color | Using mint for cost items | Cost items use `.cost-item[data-active]` with coral |
| Button shadow too dark in dark mode | Hardcoded shadow values | Use `--shadow-*` CSS variables |
| Typography inconsistent | Mixing raw Tailwind with console classes | Use `.console-*` classes exclusively in console |

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/design` | Brand foundation, accessibility rules, component patterns. Theme implements design specs. |
| `/console-ui` | Console components consume theme variables. Card, sidebar, layout patterns. |
| `/charts` | Chart components use design-tokens.ts for colors, not CSS variables. |
| `/frontend-dev` | Next.js patterns, component architecture, layout integration. |
| `/home-page` | Landing pages have separate color system (NOT migrated to CSS variables). |
