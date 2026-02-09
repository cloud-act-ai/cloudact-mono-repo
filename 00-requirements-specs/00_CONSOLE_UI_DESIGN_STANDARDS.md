# Console UI Design Standards

**v4.0** | 2026-02-08

> Apple Health design pattern for FinOps. Single source of truth for CloudAct console styling.

---

## Design Philosophy

White surfaces dominate. Mint for features. Coral for costs/alerts. Premium, minimal, Apple-inspired. 8px spacing grid. No icons -- enterprise-ready, text-first approach.

---

## Brand Colors

| Color | Variable | Hex | Use |
|-------|----------|-----|-----|
| **Mint** | `--cloudact-mint` | `#90FCA6` | Primary buttons, success, features |
| Mint Light | `--cloudact-mint-light` | `#B8FDCA` | Hover states |
| Mint Dark | `--cloudact-mint-dark` | `#6EE890` | Active states |
| Mint Text | `--cloudact-mint-text` | `#0F5132` | Text on mint backgrounds |
| **Coral** | `--cloudact-coral` | `#FF6C5E` | Costs, warnings, destructive |
| Coral Light | `--cloudact-coral-light` | `#FF8A7F` | Hover states |
| Coral Dark | `--cloudact-coral-dark` | `#E5544A` | Active states |
| **Blue** | `--cloudact-blue` | `#007AFF` | Charts ONLY (never links/buttons) |
| **Obsidian** | `--cloudact-obsidian` | `#0a0a0b` | Dark buttons, auth panels |
| **Indigo** | `--cloudact-indigo` | `#4F46E5` | Premium secondary accent |

---

## Chart Color Palettes

All palettes defined in `lib/costs/design-tokens.ts`.

| Palette | Colors | Use |
|---------|--------|-----|
| Default | Blue `#4285F4`, Orange `#FF9900`, Green `#10A37F`, Coral `#D97757`, Purple `#8E75B2`, Cyan `#00CED1`, Red `#FF6C5E`, Gold `#FFD700` | General charts |
| GenAI | OpenAI `#10A37F`, Anthropic `#D97757`, Google `#4285F4`, Gemini `#8E75B2`, Mistral `#FF7000`, Cohere `#5046E5`, Azure `#0078D4`, AWS `#FF9900` | GenAI dashboards |
| Cloud | GCP `#4285F4`, AWS `#FF9900`, Azure `#0078D4`, Oracle `#F80000` | Cloud dashboards |
| Subscription | Coral `#FF6C5E`, Slack `#4A154B`, Figma `#F24E1E`, GitHub `#24292F`, Atlassian `#0052CC`, Salesforce `#00A1E0` | SaaS dashboards |

---

## Provider Colors

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

---

## Category Colors

| Category | Hex | Use |
|----------|-----|-----|
| GenAI | `#10A37F` | GenAI cost dashboards |
| Cloud | `#4285F4` | Cloud cost dashboards |
| Subscription | `#FF6C5E` | SaaS cost dashboards |

---

## Typography

**Font:** DM Sans (loaded via `next/font`)

| Class | Size | Weight | Use |
|-------|------|--------|-----|
| `.console-page-title` | 2rem | 700 | Page headers |
| `.console-heading` | 1.375rem | 700 | Section headers |
| `.console-card-title` | 0.9375rem | 600 | Card titles |
| `.console-body` | 0.9375rem | 400 | Body text |
| `.console-small` | 0.8125rem | 400 | Secondary text |
| `.console-metric` | 2.25rem | 600 | Large numbers |

---

## Spacing & Layout Standards

| Standard | Value |
|----------|-------|
| Grid | 8px base (`--space-2`=8px, `--space-4`=16px, `--space-6`=24px, `--space-8`=32px) |
| Border radius | sm=8px, md=12px, lg=16px, xl=20px |
| Max width | `max-w-7xl` for all console pages |

---

## Button Standards

| Class | Background | Text | Use |
|-------|------------|------|-----|
| `.cloudact-btn-primary` | Mint | Black | Console CTAs |
| `.cloudact-btn-dark` | Obsidian | White | Auth flows |
| `.cloudact-btn-destructive` | Coral | White | Delete actions |

---

## Component Patterns

### ErrorBoundary Wrapping

Every page and major component section is wrapped with an ErrorBoundary to prevent cascading failures. Pattern:

```tsx
<ErrorBoundary fallback={<ErrorFallback />}>
  <PageContent />
</ErrorBoundary>
```

### Loading States

All async operations show a spinner component during loading. No blank screens.

### Skip-to-Content

Accessibility link at the top of each page for keyboard navigation:

```tsx
<a href="#main-content" className="skip-to-content">Skip to content</a>
```

### StatRow Component

Premium metric display component for dashboard cards. Renders a horizontal row of key-value stat pairs with consistent styling.

### OrgProviders Context

React context pattern that provides the current organization's active providers to all child components, avoiding prop drilling.

---

## Usage Rules

1. **Never use blue for buttons/links** -- blue is charts only
2. **Mint = features, Coral = costs** -- consistent semantic meaning
3. **Use provider colors for charts** -- match brand identity
4. **8px grid** -- all spacing multiples of 8
5. **`max-w-7xl`** -- all console pages bounded
6. **No icons** -- enterprise-ready, text-first
7. **ErrorBoundary wrapping** -- every page and major section
8. **Loading spinners** -- all async operations

---

## Key Files

| File | Purpose |
|------|---------|
| `app/globals.css` | CSS variables, chart colors |
| `app/[orgSlug]/console.css` | Console styles |
| `lib/costs/design-tokens.ts` | Chart palettes, provider colors |
| `components/charts/` | Chart components |
| `components/ui/error-boundary.tsx` | ErrorBoundary component |
| `components/ui/loading-spinner.tsx` | Loading spinner |
| `components/dashboard/stat-row.tsx` | StatRow premium component |
| `contexts/org-providers.tsx` | OrgProviders context |
