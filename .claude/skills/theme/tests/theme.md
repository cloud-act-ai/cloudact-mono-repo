# Theme System - Test Plan

## Overview

Validates CSS variable completeness, light/dark mode switching, color migration coverage, design token accuracy, accessibility compliance, and visual consistency across the CloudAct theme system.

## Test Matrix

### CSS Variable Completeness (8 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | All `:root` variables have `.dark` counterpart | Validation | Every variable in `:root {}` exists in `.dark {}` |
| 2 | Brand colors defined | Validation | `--cloudact-mint`, `--cloudact-coral`, `--cloudact-obsidian`, `--cloudact-blue` present |
| 3 | Text 4-tier hierarchy | Validation | `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-muted` defined |
| 4 | Surface 5-tier hierarchy | Validation | `--surface-primary` through `--surface-active` defined |
| 5 | Border variables present | Validation | `--border-subtle`, `--border-light`, `--border-medium`, `--border-mint`, `--border-coral` |
| 6 | Shadow scale complete | Validation | `--shadow-xs` through `--shadow-2xl` + premium variants |
| 7 | Z-index scale complete | Validation | `--z-base` through `--z-skip-link` (7 levels) |
| 8 | shadcn/ui tokens defined | Validation | `--background`, `--foreground`, `--primary`, `--secondary`, `--destructive`, `--border`, `--ring` |

### Light/Dark Mode Switching (7 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 9 | ThemeProvider renders without error | Unit | No hydration mismatch, no FOUC |
| 10 | Default theme is "light" | E2E | `<html>` has no `class="dark"` on initial load |
| 11 | Toggle to dark adds class | E2E | `<html class="dark">` after clicking dark toggle |
| 12 | Toggle to system respects OS | E2E | Matches `prefers-color-scheme` media query |
| 13 | Theme persists on reload | E2E | localStorage `theme` value survives page refresh |
| 14 | ThemeToggle shows skeleton before mount | Unit | Animated skeleton renders during hydration |
| 15 | ThemeToggle collapsed mode cycles correctly | E2E | Light → Dark → System → Light |

### Color Migration (6 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 16 | No new `slate-*` in console components | Audit | `grep slate- components/` returns 0 new instances |
| 17 | No hardcoded hex in TSX files | Audit | No `#hex` color literals in component props |
| 18 | `bg-white` preserved (not migrated) | Audit | `bg-white` still used where intentional |
| 19 | `translate-*` not changed (false positive) | Audit | No CSS variable applied to translate utilities |
| 20 | Landing pages exempt | Audit | `app/(marketing)/` files can use slate-* |
| 21 | Chart files exempt | Audit | `design-tokens.ts` can use hardcoded hex |

### Console Design System (8 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 22 | `.console-page-title` renders at 24px bold | Visual | Font size 1.5rem, weight 700 |
| 23 | `.console-metric` uses tabular-nums | Visual | Numbers align vertically in columns |
| 24 | `.health-card` has 20px border-radius | Visual | Cards match Apple Health style |
| 25 | `.metric-card.clickable` lifts on hover | Visual | -3px translateY + glow shadow |
| 26 | `.metric-card.loading` shows shimmer | Visual | Animated shimmer overlay |
| 27 | Sidebar `[data-active="true"]` shows mint | Visual | Active nav item has mint background |
| 28 | Cost items use coral active state | Visual | `.cost-item[data-active="true"]` uses coral |
| 29 | All buttons meet 44px min-height | Visual | Touch target compliance on all button variants |

### Design Tokens (6 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 30 | `GENAI_PROVIDER_COLORS` has all GenAI providers | Validation | openai, anthropic, google, gemini, deepseek, azure_openai, aws_bedrock |
| 31 | `CLOUD_PROVIDER_COLORS` has all cloud providers | Validation | gcp, aws, azure, oci |
| 32 | `SAAS_PROVIDER_COLORS` has all SaaS providers | Validation | slack, github, figma, canva + others |
| 33 | `getProviderColor()` returns fallback for unknown | Unit | Returns default palette color, not undefined |
| 34 | `getTrendColor()` returns green for positive | Unit | Positive change → green, negative → coral |
| 35 | Chart palettes have correct length | Validation | Each palette has >= 4 colors |

### Button System (5 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 36 | `.cloudact-btn-primary` is mint with black text | Visual | Background #90FCA6, color black |
| 37 | `.cloudact-btn-dark` has shimmer on hover | Visual | Shimmer animation on hover |
| 38 | `.cloudact-btn-destructive` is coral with white text | Visual | Background #FF6C5E, color white |
| 39 | All button variants have disabled state | Visual | Reduced opacity, no pointer events |
| 40 | Focus ring visible on all buttons | Accessibility | Visible focus outline on Tab navigation |

### Accessibility (6 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 41 | Primary text contrast (light mode) | Accessibility | `--text-primary` on `--surface-primary` >= 4.5:1 |
| 42 | Primary text contrast (dark mode) | Accessibility | Dark mode `--text-primary` on dark `--surface-primary` >= 4.5:1 |
| 43 | Mint text on white readable | Accessibility | `--cloudact-mint-text` on white >= 4.5:1 |
| 44 | Coral text readable | Accessibility | `--cloudact-coral-text` on white >= 4.5:1 |
| 45 | Reduced motion respected | Accessibility | Decorative animations paused when `prefers-reduced-motion: reduce` |
| 46 | Color not sole indicator | Accessibility | Status badges have icon + text, not just color |

### Animation System (4 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 47 | `fadeIn` animation plays on page load | Visual | 0.3s ease-out opacity transition |
| 48 | `shimmer` animation loops on loading states | Visual | Continuous sweep animation |
| 49 | Animation delay utilities work | Visual | `.animation-delay-100` through `-500` apply correctly |
| 50 | `accordion-down`/`up` work with Radix | Visual | Smooth height transition on accordion open/close |

**Total: 50 tests**

## Verification Commands

```bash
# Count CSS variables in :root
grep -c "^\s*--" 01-fronted-system/app/globals.css

# Check :root vs .dark variable parity
ROOT_VARS=$(grep -oP '^\s*--[\w-]+' 01-fronted-system/app/globals.css | head -300 | sort -u)
DARK_VARS=$(sed -n '/.dark/,/^}/p' 01-fronted-system/app/globals.css | grep -oP '^\s*--[\w-]+' | sort -u)
diff <(echo "$ROOT_VARS") <(echo "$DARK_VARS")

# Find remaining slate-* in console components (excluding landing/charts)
grep -rn "slate-" 01-fronted-system/components/ 01-fronted-system/app/\[orgSlug\]/ \
  --include="*.tsx" --include="*.ts" \
  | grep -v "node_modules" | grep -v "design-tokens" | grep -v "(marketing)"

# Find hardcoded hex colors in TSX
grep -rn '#[0-9a-fA-F]\{6\}' 01-fronted-system/components/ --include="*.tsx" \
  | grep -v "node_modules" | grep -v "design-tokens" | grep -v "console.css"

# Verify all buttons have min-height
grep -A5 "cloudact-btn-\|console-button-" 01-fronted-system/app/globals.css 01-fronted-system/app/\[orgSlug\]/console.css \
  | grep "min-height"

# Check design tokens have all providers
grep -c "openai\|anthropic\|gemini\|deepseek\|azure_openai\|aws_bedrock" \
  01-fronted-system/lib/costs/design-tokens.ts

# Verify theme provider config
grep -A5 "ThemeProvider" 01-fronted-system/app/layout.tsx

# Check touch target compliance
grep -rn "min-height:\s*4[0-3]px\|h-[0-9]\b\|h-8\b" 01-fronted-system/components/ --include="*.tsx" \
  | grep -v "node_modules"

# Contrast ratio check (manual — use browser DevTools or axe)
# 1. Open http://localhost:3000/{orgSlug}/dashboard
# 2. Run axe DevTools extension
# 3. Check "Color contrast" category
```

## Pass Criteria

| Criteria | Target |
|----------|--------|
| CSS variable completeness | 100% `:root` → `.dark` parity |
| Color migration | 0 new slate-* in console components |
| Console typography | 100% `.console-*` classes (not raw Tailwind) |
| Touch targets | 100% buttons >= 44px |
| Contrast ratios | WCAG AA (4.5:1) on all text |
| Design tokens | All providers in color maps |
| Theme switching | No FOUC, persists on reload |
| Button states | Hover + active + focus + disabled on all variants |

## Known Limitations

1. **Dark mode not shipped**: CSS is ready but ThemeToggle is not wired into sidebar. Visual testing requires manual toggle.
2. **Chart colors**: Design-tokens.ts uses JS constants, not CSS variables. Charts won't auto-switch in dark mode without separate handling.
3. **Landing pages**: ~193 slate instances are intentional (separate design system). Not covered by migration.
4. **3rd-party components**: shadcn/ui components use their own token system (`--primary`, `--secondary`). Mapped in globals.css.
5. **Contrast in dark mode**: Not all component combinations have been audited in dark mode. Some may fail WCAG.
6. **Animation performance**: Float animations use `transform` and `will-change`. May cause GPU compositing on low-end devices.
7. **Browser support**: CSS custom properties require modern browsers. IE11 not supported.
