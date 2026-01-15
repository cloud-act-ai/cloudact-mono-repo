# Console UI Design Standards

**v2.9** | 2026-01-15

> Apple Health design pattern for FinOps. Single source of truth for CloudAct console styling.

---

## Design Philosophy

```
White surfaces dominate. Mint for features. Coral for costs/alerts.
Premium, minimal, Apple-inspired. 8px spacing grid.
```

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

## Chart Colors (CSS Variables)

| Variable | Hex | Use |
|----------|-----|-----|
| `--chart-1` | `#90FCA6` | Mint Primary |
| `--chart-2` | `#B8FDCA` | Mint Light |
| `--chart-3` | `#6EE890` | Mint Dark |
| `--chart-4` | `rgba(144,252,166,0.7)` | Mint 70% |
| `--chart-5` | `rgba(144,252,166,0.45)` | Mint 45% |
| `--chart-6` | `#FF6C5E` | Coral (for cost charts) |

---

## Chart Palettes (TypeScript)

**File:** `lib/costs/design-tokens.ts`

### Default Palette (8 colors)

```typescript
DEFAULT_CHART_PALETTE = [
  "#4285F4", // Blue
  "#FF9900", // Orange
  "#10A37F", // Green
  "#D97757", // Coral
  "#8E75B2", // Purple
  "#00CED1", // Cyan
  "#FF6C5E", // Red
  "#FFD700", // Gold
]
```

### GenAI Palette

```typescript
GENAI_CHART_PALETTE = [
  "#10A37F", // OpenAI Green
  "#D97757", // Anthropic Coral
  "#4285F4", // Google Blue
  "#8E75B2", // Gemini Purple
  "#FF7000", // Mistral Orange
  "#5046E5", // Cohere Indigo
  "#0078D4", // Azure Blue
  "#FF9900", // AWS Orange
]
```

### Cloud Palette

```typescript
CLOUD_CHART_PALETTE = [
  "#4285F4", // GCP Blue
  "#FF9900", // AWS Orange
  "#0078D4", // Azure Blue
  "#F80000", // Oracle Red
  "#0080FF", // DigitalOcean Blue
  "#00A95C", // Linode Green
]
```

### Subscription Palette

```typescript
SUBSCRIPTION_CHART_PALETTE = [
  "#FF6C5E", // Coral (primary)
  "#4A154B", // Slack Purple
  "#F24E1E", // Figma Orange
  "#24292F", // GitHub Dark
  "#0052CC", // Atlassian Blue
  "#00A1E0", // Salesforce Blue
]
```

---

## Provider Colors

### GenAI Providers

| Provider | Hex | Variable |
|----------|-----|----------|
| OpenAI | `#10A37F` | `GENAI_PROVIDER_COLORS.openai` |
| Anthropic | `#D97757` | `GENAI_PROVIDER_COLORS.anthropic` |
| Google/Gemini | `#4285F4` | `GENAI_PROVIDER_COLORS.google` |
| Gemini | `#8E75B2` | `GENAI_PROVIDER_COLORS.gemini` |
| DeepSeek | `#5865F2` | `GENAI_PROVIDER_COLORS.deepseek` |
| Azure OpenAI | `#0078D4` | `GENAI_PROVIDER_COLORS.azure_openai` |
| AWS Bedrock | `#FF9900` | `GENAI_PROVIDER_COLORS.aws_bedrock` |
| GCP Vertex | `#4285F4` | `GENAI_PROVIDER_COLORS.gcp_vertex` |

### Cloud Providers

| Provider | Hex | Variable |
|----------|-----|----------|
| GCP | `#4285F4` | `CLOUD_PROVIDER_COLORS.gcp` |
| AWS | `#FF9900` | `CLOUD_PROVIDER_COLORS.aws` |
| Azure | `#0078D4` | `CLOUD_PROVIDER_COLORS.azure` |
| OCI | `#F80000` | `CLOUD_PROVIDER_COLORS.oci` |

### SaaS Providers

| Provider | Hex | Variable |
|----------|-----|----------|
| Slack | `#4A154B` | `SAAS_PROVIDER_COLORS.slack` |
| Figma | `#F24E1E` | `SAAS_PROVIDER_COLORS.figma` |
| Canva | `#00C4CC` | `SAAS_PROVIDER_COLORS.canva` |
| GitHub | `#24292F` | `SAAS_PROVIDER_COLORS.github` |
| Notion | `#000000` | `SAAS_PROVIDER_COLORS.notion` |
| Jira | `#0052CC` | `SAAS_PROVIDER_COLORS.jira` |

---

## Category Colors

| Category | Hex | Use |
|----------|-----|-----|
| GenAI | `#10A37F` | GenAI cost dashboards |
| Cloud | `#4285F4` | Cloud cost dashboards |
| Subscription | `#FF6C5E` | SaaS cost dashboards |
| AI | `#10A37F` | AI-related subscriptions |
| Design | `#F24E1E` | Design tool subscriptions |
| Productivity | `#4285F4` | Productivity subscriptions |
| Development | `#24292F` | Dev tool subscriptions |

---

## Chart Usage

```typescript
import {
  getProviderColor,
  getChartColors,
  GENAI_CHART_PALETTE
} from "@/lib/costs/design-tokens"

// Get specific provider color
const color = getProviderColor("openai") // "#10A37F"

// Get chart colors for a list
const colors = getChartColors(providers, "genai")
```

---

## Typography

**Font:** DM Sans (loaded via next/font)

| Class | Size | Weight | Use |
|-------|------|--------|-----|
| `.console-page-title` | 2rem | 700 | Page headers |
| `.console-heading` | 1.375rem | 700 | Section headers |
| `.console-card-title` | 0.9375rem | 600 | Card titles |
| `.console-body` | 0.9375rem | 400 | Body text |
| `.console-small` | 0.8125rem | 400 | Secondary text |
| `.console-metric` | 2.25rem | 600 | Large numbers |

---

## Spacing (8px Grid)

| Variable | Size | Tailwind |
|----------|------|----------|
| `--space-2` | 8px | `p-2` |
| `--space-4` | 16px | `p-4` |
| `--space-6` | 24px | `p-6` |
| `--space-8` | 32px | `p-8` |

---

## Border Radius

| Variable | Size | Use |
|----------|------|-----|
| `--radius-sm` | 8px | Small buttons |
| `--radius-md` | 12px | Buttons, inputs |
| `--radius-lg` | 16px | Cards |
| `--radius-xl` | 20px | Metric cards |

---

## Buttons

| Class | Background | Text | Use |
|-------|------------|------|-----|
| `.cloudact-btn-primary` | Mint | Black | Console CTAs |
| `.cloudact-btn-dark` | Obsidian | White | Auth flows |
| `.cloudact-btn-destructive` | Coral | White | Delete actions |

---

## Key Files

| File | Purpose |
|------|---------|
| `app/globals.css` | CSS variables, chart colors |
| `app/[orgSlug]/console.css` | Console styles |
| `lib/costs/design-tokens.ts` | Chart palettes, provider colors |
| `components/charts/` | Chart components |

---

## Usage Rules

1. **Never use blue for buttons/links** - Blue is charts only
2. **Mint = features, Coral = costs** - Consistent semantic meaning
3. **Use provider colors for charts** - Match brand colors
4. **8px grid** - All spacing multiples of 8
5. **max-w-7xl** - All console pages bounded
