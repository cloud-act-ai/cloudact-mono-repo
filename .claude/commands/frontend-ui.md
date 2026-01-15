# /frontend-ui - Premium Console UI Guidelines

Build stunning, premium CloudAct console interfaces with shiny white surfaces and creative user experiences.

## Usage

```
/frontend-ui                    # Show full design guidelines
/frontend-ui page               # Create a new console page
/frontend-ui form               # Create a premium form layout
/frontend-ui card               # Create metric/feature cards
/frontend-ui banner             # Create status/alert banners
/frontend-ui fix <component>    # Improve existing component
```

---

## REUSABLE COMPONENTS (MANDATORY)

**CRITICAL RULE:** Before creating ANY new component, check if a reusable version exists. If not, create one in the appropriate folder. NEVER duplicate component code across pages.

### Component Hierarchy
```
components/
├── ui/                    # Primitives (button, input, select, etc.)
├── forms/                 # Form patterns (field, section, stepper)
├── charts/                # All chart components
├── tables/                # Table variants
├── cards/                 # Card patterns
├── hierarchy/             # Org hierarchy components
├── subscriptions/         # Subscription-specific
├── integrations/          # Integration-specific
├── costs/                 # Cost display components
├── feedback/              # Toasts, banners, empty states
└── layout/                # Page layouts, containers
```

### Mandatory Reusable Components

#### Charts (components/charts/)
| Component | File | Usage |
|-----------|------|-------|
| `<CostTrendChart>` | `cost-trend-chart.tsx` | Line chart for cost over time |
| `<CostBreakdownChart>` | `cost-breakdown-chart.tsx` | Donut/pie for cost distribution |
| `<BarComparisonChart>` | `bar-comparison-chart.tsx` | Horizontal bars for comparisons |
| `<SparklineChart>` | `sparkline-chart.tsx` | Inline mini trend indicators |
| `<AreaStackedChart>` | `area-stacked-chart.tsx` | Stacked area for cumulative |
| `<HeatmapChart>` | `heatmap-chart.tsx` | Usage patterns, calendar views |

#### Tables (components/tables/)
| Component | File | Usage |
|-----------|------|-------|
| `<DataTable>` | `data-table.tsx` | Generic sortable/filterable table |
| `<SubscriptionTable>` | `subscription-table.tsx` | SaaS subscriptions list |
| `<CostTable>` | `cost-table.tsx` | Cost breakdown with totals |
| `<UsageTable>` | `usage-table.tsx` | Usage metrics with trends |
| `<MembersTable>` | `members-table.tsx` | Team members list |

#### Cards (components/cards/)
| Component | File | Usage |
|-----------|------|-------|
| `<MetricCard>` | `metric-card.tsx` | KPI display with trend |
| `<ProviderCard>` | `provider-card.tsx` | Integration provider tile |
| `<SubscriptionCard>` | `subscription-card.tsx` | Subscription summary |
| `<PlanCard>` | `plan-card.tsx` | Pricing plan selection |
| `<AlertCard>` | `alert-card.tsx` | Warning/info highlights |
| `<FeatureCard>` | `feature-card.tsx` | Clickable feature tiles |

#### Feedback (components/feedback/)
| Component | File | Usage |
|-----------|------|-------|
| `<EmptyState>` | `empty-state.tsx` | No data placeholder |
| `<LoadingSkeleton>` | `loading-skeleton.tsx` | Loading placeholders |
| `<StatusBanner>` | `status-banner.tsx` | Page-level alerts |
| `<Toast>` | `toast.tsx` | Notifications |
| `<ConfirmDialog>` | `confirm-dialog.tsx` | Confirmation modals |

---

## CHART COMPONENTS (Recharts-based)

### Chart Color Palette
```tsx
// lib/chart-colors.ts
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

### Cost Trend Chart (Line)
```tsx
// components/charts/cost-trend-chart.tsx
"use client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area } from 'recharts';
import { formatCurrency } from '@/lib/i18n';

interface CostTrendChartProps {
  data: Array<{ date: string; value: number; previous?: number }>;
  currency?: string;
  showComparison?: boolean;
  height?: number;
}

export function CostTrendChart({
  data,
  currency = 'USD',
  showComparison = false,
  height = 300
}: CostTrendChartProps) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id="mintGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#90FCA6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#90FCA6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#9CA3AF', fontSize: 12 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#9CA3AF', fontSize: 12 }}
            tickFormatter={(v) => formatCurrency(v, currency, { compact: true })}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatCurrency(payload[0].value as number, currency)}
                  </p>
                  {showComparison && payload[1] && (
                    <p className="text-sm text-gray-400">
                      Previous: {formatCurrency(payload[1].value as number, currency)}
                    </p>
                  )}
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#90FCA6"
            fill="url(#mintGradient)"
            strokeWidth={2}
          />
          {showComparison && (
            <Line
              type="monotone"
              dataKey="previous"
              stroke="#9CA3AF"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
            />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke="#90FCA6"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 6, fill: '#90FCA6', stroke: '#fff', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### Cost Breakdown Chart (Donut)
```tsx
// components/charts/cost-breakdown-chart.tsx
"use client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/i18n';
import { CATEGORY_COLORS } from '@/lib/chart-colors';

interface CostBreakdownChartProps {
  data: Array<{ name: string; value: number; color?: string }>;
  currency?: string;
  size?: number;
  showLegend?: boolean;
}

export function CostBreakdownChart({
  data,
  currency = 'USD',
  size = 200,
  showLegend = true
}: CostBreakdownChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="flex items-center gap-6">
      {/* Chart */}
      <div style={{ width: size, height: size }} className="relative">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="60%"
              outerRadius="90%"
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.name}
                  fill={entry.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                  className="hover:opacity-80 transition-opacity cursor-pointer"
                />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0].payload;
                return (
                  <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3">
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    <p className="text-lg font-semibold">{formatCurrency(item.value, currency)}</p>
                    <p className="text-xs text-gray-400">
                      {((item.value / total) * 100).toFixed(1)}% of total
                    </p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-xs text-gray-400">Total</p>
          <p className="text-xl font-bold text-gray-900">
            {formatCurrency(total, currency, { compact: true })}
          </p>
        </div>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="flex-1 space-y-2">
          {data.map((item, index) => (
            <div key={item.name} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                />
                <span className="text-sm text-gray-600 truncate">{item.name}</span>
              </div>
              <span className="text-sm font-medium text-gray-900">
                {formatCurrency(item.value, currency, { compact: true })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Bar Comparison Chart (Horizontal)
```tsx
// components/charts/bar-comparison-chart.tsx
"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatCurrency } from '@/lib/i18n';

interface BarComparisonChartProps {
  data: Array<{ name: string; value: number; change?: number }>;
  currency?: string;
  height?: number;
  layout?: 'horizontal' | 'vertical';
}

export function BarComparisonChart({
  data,
  currency = 'USD',
  height = 300,
  layout = 'horizontal'
}: BarComparisonChartProps) {
  const maxValue = Math.max(...data.map(d => d.value));

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout={layout}
          margin={{ top: 5, right: 30, bottom: 5, left: 80 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={layout === 'horizontal'} vertical={layout === 'vertical'} />
          {layout === 'horizontal' ? (
            <>
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
              <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 13 }} width={70} />
            </>
          ) : (
            <>
              <XAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
              <YAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
            </>
          )}
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0].payload;
              return (
                <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3">
                  <p className="text-sm font-medium text-gray-900">{item.name}</p>
                  <p className="text-lg font-semibold">{formatCurrency(item.value, currency)}</p>
                  {item.change !== undefined && (
                    <p className={`text-sm ${item.change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {item.change >= 0 ? '+' : ''}{item.change}% vs last period
                    </p>
                  )}
                </div>
              );
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 4, 4]} maxBarSize={24}>
            {data.map((entry, index) => (
              <Cell
                key={entry.name}
                fill={entry.value === maxValue ? '#90FCA6' : '#E5E7EB'}
                className="hover:opacity-80 transition-opacity"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### Sparkline Chart (Inline Mini)
```tsx
// components/charts/sparkline-chart.tsx
"use client";
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface SparklineChartProps {
  data: number[];
  color?: 'mint' | 'coral' | 'gray';
  width?: number;
  height?: number;
}

const COLORS = {
  mint: '#90FCA6',
  coral: '#FF6C5E',
  gray: '#9CA3AF',
};

export function SparklineChart({
  data,
  color = 'mint',
  width = 80,
  height = 24
}: SparklineChartProps) {
  const chartData = data.map((value, index) => ({ value, index }));
  const trend = data[data.length - 1] >= data[0] ? 'mint' : 'coral';
  const strokeColor = color === 'mint' ? COLORS[trend] : COLORS[color];

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer>
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Usage in MetricCard
<MetricCard
  label="Monthly Spend"
  value="$12,450"
  change="+5.2%"
  sparkline={[100, 120, 115, 140, 135, 160, 180]}
/>
```

---

## COMMON CARD COMPONENTS

### Metric Card (with Sparkline)
```tsx
// components/cards/metric-card.tsx
import { SparklineChart } from '@/components/charts/sparkline-chart';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string;
  change?: string;
  changeType?: 'increase' | 'decrease' | 'neutral';
  sparkline?: number[];
  icon?: React.ReactNode;
  href?: string;
}

export function MetricCard({
  label,
  value,
  change,
  changeType = 'neutral',
  sparkline,
  icon,
  href
}: MetricCardProps) {
  const Wrapper = href ? 'a' : 'div';
  const wrapperProps = href ? { href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`
        group relative bg-white rounded-2xl p-5 border border-gray-100 shadow-sm
        transition-all duration-300 overflow-hidden
        ${href ? 'cursor-pointer hover:shadow-lg hover:-translate-y-1 hover:border-[#90FCA6]/30' : ''}
      `}
    >
      {/* Shine effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />

      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 tracking-tight">{value}</p>
          {change && (
            <div className={`mt-2 flex items-center gap-1 text-sm font-medium ${
              changeType === 'increase' ? 'text-emerald-600' :
              changeType === 'decrease' ? 'text-red-600' : 'text-gray-500'
            }`}>
              {changeType === 'increase' && <TrendingUp className="w-4 h-4" />}
              {changeType === 'decrease' && <TrendingDown className="w-4 h-4" />}
              <span>{change}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {icon && (
            <div className="p-2 rounded-lg bg-gray-50 group-hover:bg-[#90FCA6]/10 transition-colors">
              {icon}
            </div>
          )}
          {sparkline && <SparklineChart data={sparkline} />}
        </div>
      </div>
    </Wrapper>
  );
}
```

### Provider Card (Integration)
```tsx
// components/cards/provider-card.tsx
import { Check, ChevronRight } from 'lucide-react';

interface ProviderCardProps {
  provider: string;
  name: string;
  description: string;
  logo: string;
  status?: 'connected' | 'available' | 'coming_soon';
  onClick?: () => void;
}

export function ProviderCard({
  provider,
  name,
  description,
  logo,
  status = 'available',
  onClick
}: ProviderCardProps) {
  const isDisabled = status === 'coming_soon';

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`
        group w-full text-left bg-white rounded-2xl p-5 border transition-all duration-300
        ${isDisabled
          ? 'border-gray-100 opacity-60 cursor-not-allowed'
          : status === 'connected'
            ? 'border-[#90FCA6]/50 shadow-sm hover:shadow-lg hover:-translate-y-1'
            : 'border-gray-100 shadow-sm hover:shadow-lg hover:border-[#90FCA6]/30 hover:-translate-y-1'}
      `}
    >
      <div className="flex items-start gap-4">
        {/* Logo */}
        <div className={`
          w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden
          ${status === 'connected' ? 'bg-[#90FCA6]/10' : 'bg-gray-50 group-hover:bg-[#90FCA6]/10'}
          transition-colors
        `}>
          <img src={logo} alt={name} className="w-10 h-10 object-contain" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">{name}</h3>
            {status === 'connected' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-xs font-medium">
                <Check className="w-3 h-3" />
                Connected
              </span>
            )}
            {status === 'coming_soon' && (
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
                Coming Soon
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500 line-clamp-2">{description}</p>
        </div>

        {/* Arrow */}
        {!isDisabled && (
          <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-[#90FCA6] group-hover:translate-x-1 transition-all shrink-0" />
        )}
      </div>
    </button>
  );
}
```

### Empty State (Engaging)
```tsx
// components/feedback/empty-state.tsx
import { LucideIcon, Plus } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action
}: EmptyStateProps) {
  const ActionIcon = action?.icon || Plus;

  return (
    <div className="text-center py-16 px-6">
      {Icon && (
        <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-[#90FCA6]/20 to-[#90FCA6]/5 flex items-center justify-center mb-6">
          <Icon className="w-10 h-10 text-gray-400" />
        </div>
      )}
      <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-500 max-w-sm mx-auto mb-8">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-2 bg-[#90FCA6] text-black hover:bg-[#6EE890] rounded-xl px-6 py-3 font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
        >
          <ActionIcon className="w-5 h-5" />
          {action.label}
        </button>
      )}
    </div>
  );
}
```

### Loading Skeleton (Premium)
```tsx
// components/feedback/loading-skeleton.tsx
interface SkeletonProps {
  variant?: 'text' | 'card' | 'metric' | 'table' | 'chart';
  count?: number;
}

export function Skeleton({ variant = 'text', count = 1 }: SkeletonProps) {
  const items = Array.from({ length: count });

  switch (variant) {
    case 'metric':
      return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/2 mb-3" />
              <div className="h-8 bg-gray-100 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      );

    case 'card':
      return (
        <div className="space-y-4">
          {items.map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-100 rounded-xl" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      );

    case 'table':
      return (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
          <div className="h-12 bg-gray-50 border-b border-gray-100" />
          {items.map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4 border-b border-gray-100 last:border-0">
              <div className="h-4 bg-gray-100 rounded w-1/4" />
              <div className="h-4 bg-gray-100 rounded w-1/3" />
              <div className="h-4 bg-gray-100 rounded w-1/6" />
              <div className="h-4 bg-gray-100 rounded w-1/6" />
            </div>
          ))}
        </div>
      );

    case 'chart':
      return (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 animate-pulse">
          <div className="h-4 bg-gray-100 rounded w-1/4 mb-4" />
          <div className="h-64 bg-gray-100 rounded-xl" />
        </div>
      );

    default:
      return (
        <div className="space-y-2 animate-pulse">
          {items.map((_, i) => (
            <div key={i} className="h-4 bg-gray-100 rounded" style={{ width: `${100 - i * 10}%` }} />
          ))}
        </div>
      );
  }
}

// Usage
<Skeleton variant="metric" count={4} />
<Skeleton variant="table" count={5} />
<Skeleton variant="chart" />
```

---

## REUSABILITY RULES (ENFORCED)

### Before Creating New Component
```
CHECKLIST:
□ Check components/ui/ for primitives
□ Check components/charts/ for chart variants
□ Check components/cards/ for card patterns
□ Check components/tables/ for table variants
□ Check components/feedback/ for feedback patterns
□ If exists → USE IT with props customization
□ If not exists → CREATE in appropriate folder
□ NEVER inline complex components in pages
```

### Component Creation Rules
1. **Single Responsibility** - One component, one purpose
2. **Props over Hardcoding** - Make it configurable
3. **TypeScript Interfaces** - Always define prop types
4. **Default Props** - Sensible defaults for optional props
5. **Composition** - Build complex from simple components
6. **Documentation** - Add JSDoc comments for props

### Example: Reusing vs Creating
```tsx
// ❌ BAD: Inline component in page
export default function DashboardPage() {
  return (
    <div className="bg-white rounded-2xl p-5 border...">
      <p className="text-sm text-gray-500">Total Spend</p>
      <p className="text-2xl font-bold">$12,450</p>
    </div>
  );
}

// ✅ GOOD: Use reusable component
import { MetricCard } from '@/components/cards/metric-card';

export default function DashboardPage() {
  return (
    <MetricCard
      label="Total Spend"
      value="$12,450"
      change="+5.2%"
      changeType="increase"
      sparkline={[100, 120, 115, 140]}
    />
  );
}
```

---

## DESIGN PHILOSOPHY

**Enterprise-Grade Professional Design (MANDATORY)**

CloudAct is a B2B SaaS platform for enterprise customers. Every screen must convey:
- **Trust & Credibility** - CFOs and IT leaders will use this daily
- **Professional Polish** - No playful, consumer-app aesthetics
- **Data Confidence** - Financial data requires visual precision
- **Enterprise Ready** - Looks like it costs $50K+/year

### Professional Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Visual Hierarchy** | Clear distinction between primary, secondary, tertiary elements |
| **Data Density** | Show meaningful data, not decorative fluff |
| **Precision** | Aligned grids, consistent spacing, no visual slop |
| **Restraint** | Minimal color use, let data speak |
| **Clarity** | Every element has purpose, no ambiguity |
| **Authority** | Design that commands respect |

### Enterprise vs Consumer UI

| Aspect | Consumer (Avoid) | Enterprise (Use) |
|--------|------------------|------------------|
| Colors | Bright, playful gradients | Muted, professional tones |
| Animation | Bouncy, fun transitions | Subtle, purposeful motion |
| Typography | Casual, rounded fonts | Clean, authoritative type |
| Icons | Cute, illustrated | Crisp, geometric |
| Spacing | Tight, compact | Generous, breathable |
| Cards | Colorful backgrounds | White with subtle borders |
| Empty States | Fun illustrations | Professional, action-focused |
| Buttons | Rounded pills | Refined rectangles |

### Trust Signals (Required Elements)

```tsx
// Security badge on sensitive pages
<div className="flex items-center gap-2 text-xs text-gray-500">
  <Shield className="w-4 h-4" />
  <span>256-bit encryption • SOC 2 Type II</span>
</div>

// Data freshness indicator
<div className="flex items-center gap-1.5 text-xs text-gray-400">
  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
  <span>Live data • Updated 2 min ago</span>
</div>

// Professional footer on reports
<div className="text-xs text-gray-400 border-t border-gray-100 pt-4 mt-8">
  <p>Generated by CloudAct • {new Date().toLocaleDateString()}</p>
  <p>Data retention: 7 years • Audit log ID: {auditId}</p>
</div>
```

### Executive-Ready Data Display

```tsx
// Currency with proper formatting (never 12450, always $12,450.00)
<span className="text-2xl font-semibold tabular-nums">
  {formatCurrency(value, currency, { minimumFractionDigits: 2 })}
</span>

// Percentage changes with context
<div className="flex items-center gap-1">
  <TrendingUp className="w-4 h-4 text-emerald-600" />
  <span className="text-sm font-medium text-emerald-600">+12.5%</span>
  <span className="text-xs text-gray-400">vs last month</span>
</div>

// Data tables with totals row
<tfoot className="bg-gray-50 font-semibold">
  <tr>
    <td className="px-4 py-3">Total</td>
    <td className="px-4 py-3 text-right tabular-nums">$124,580.00</td>
  </tr>
</tfoot>
```

### Professional Color Usage

```
PRIMARY PALETTE (Business):
- White (#FFFFFF) - Primary surface
- Gray-50 (#F9FAFB) - Secondary surface
- Gray-900 (#111827) - Primary text
- Gray-500 (#6B7280) - Secondary text

ACCENT (Minimal use):
- Mint (#90FCA6) - Primary CTA only (buttons)
- Emerald (#10B981) - Success, positive trends
- Red (#DC2626) - Errors, negative trends
- Amber (#F59E0B) - Warnings only

NEVER:
- Bright blues for decoration
- Gradient backgrounds on cards
- Multiple accent colors on same screen
- Colored text except for status
```

---

**Apple Health / Fitness+ Premium Pattern**
- Stunning shiny white surfaces with subtle depth
- Bounded content (max-w-7xl = 1280px), never full-bleed stretch
- Generous breathing room and whitespace
- Subtle shadows that create floating card effect
- Hover states that feel responsive and alive
- Creative micro-interactions that delight users

---

## COLOR RULES (CRITICAL)

### Primary Palette
```
Surface:      #FFFFFF (Pure white - primary background)
Surface Alt:  #FAFAFA (Off-white for depth layers)
Text Primary: #1C1C1E (Slate black - all body text)
Text Secondary: #6B7280 (Gray-500 - labels, captions)
Text Muted:   #9CA3AF (Gray-400 - placeholders, hints)
Border:       rgba(0,0,0,0.06) - Subtle dividers
Border Hover: rgba(0,0,0,0.12) - Interactive elements
```

### Accent Colors (Use Sparingly)
```
Mint:         #90FCA6 → BUTTONS ONLY, NEVER for text
Mint Hover:   #6EE890 → Button hover state
Coral:        #FF6C5E → Destructive actions, warnings
Obsidian:     #0a0a0b → Auth flows only (not console)
Success:      #10B981 → Success indicators (emerald, NOT mint)
Info:         #3B82F6 → Information icons (charts only)
```

### TEXT COLOR RULES
| Context | Color | Class |
|---------|-------|-------|
| Headings | #1C1C1E | `text-gray-900` |
| Body text | #1C1C1E | `text-gray-900` |
| Labels | #6B7280 | `text-gray-500` |
| Captions | #9CA3AF | `text-gray-400` |
| Links | #1C1C1E underline | `text-gray-900 underline` |
| Success text | #059669 | `text-emerald-600` |
| Error text | #DC2626 | `text-red-600` |
| Warning text | #D97706 | `text-amber-600` |

**NEVER USE MINT (#90FCA6) FOR TEXT** - It has poor contrast on white backgrounds.

---

## BUTTON SYSTEM (Keep These!)

### Primary Button (Console CTAs)
```tsx
<button className="bg-[#90FCA6] text-black hover:bg-[#6EE890] active:bg-[#5DD97F] rounded-lg px-4 py-2.5 font-medium shadow-sm hover:shadow-md transition-all duration-200">
  Save Changes
</button>
```

### Large Primary Button (Hero CTAs)
```tsx
<button className="bg-[#90FCA6] text-black hover:bg-[#6EE890] active:bg-[#5DD97F] rounded-xl px-6 py-3.5 font-semibold text-lg shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
  Get Started
</button>
```

### Secondary Button
```tsx
<button className="bg-white text-gray-900 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-lg px-4 py-2.5 font-medium transition-all duration-200">
  Cancel
</button>
```

### Ghost Button
```tsx
<button className="bg-transparent text-gray-700 hover:bg-gray-100 rounded-lg px-4 py-2.5 font-medium transition-all duration-200">
  Learn More
</button>
```

### Destructive Button
```tsx
<button className="bg-[#FF6C5E] text-white hover:bg-[#e85a4d] active:bg-[#d94d3f] rounded-lg px-4 py-2.5 font-medium shadow-sm transition-all duration-200">
  Delete
</button>
```

### Icon Button
```tsx
<button className="p-2.5 rounded-lg bg-white border border-gray-200 hover:border-[#90FCA6] hover:shadow-md text-gray-600 hover:text-gray-900 transition-all duration-200">
  <Icon className="w-5 h-5" />
</button>
```

---

## PAGE STRUCTURE

### Console Page Template
```tsx
export default function ConsolePage() {
  return (
    <div className="min-h-full bg-white">
      {/* Subtle top gradient glow */}
      <div className="absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-[#90FCA6]/5 via-[#90FCA6]/2 to-transparent pointer-events-none" />

      {/* Status Banners (if needed) */}
      <OnboardingBanner />
      <BillingAlertBanner />

      {/* Main Content */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
        {/* Page Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Page Title
          </h1>
          <p className="mt-1 text-gray-500">
            Brief description of what this page does
          </p>
        </div>

        {/* Page Content */}
        <div className="space-y-6 sm:space-y-8">
          {/* Content sections */}
        </div>
      </div>
    </div>
  );
}
```

---

## PREMIUM CARDS

### Metric Card (with shine effect)
```tsx
<div className="group relative bg-white rounded-2xl p-5 sm:p-6 border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden">
  {/* Shine effect on hover */}
  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />

  <div className="relative">
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm font-medium text-gray-500">Total Spend</span>
      <div className="p-2 rounded-lg bg-gray-50 group-hover:bg-[#90FCA6]/10 transition-colors">
        <DollarSign className="w-4 h-4 text-gray-400 group-hover:text-emerald-600" />
      </div>
    </div>
    <p className="text-3xl font-bold text-gray-900 tracking-tight">$24,580</p>
    <p className="mt-1 text-sm text-emerald-600 font-medium">+12.5% from last month</p>
  </div>
</div>
```

### Feature Card (Clickable)
```tsx
<button className="group w-full text-left bg-white rounded-2xl p-5 sm:p-6 border border-gray-100 shadow-sm hover:shadow-lg hover:border-[#90FCA6]/30 hover:-translate-y-1 transition-all duration-300">
  <div className="flex items-start gap-4">
    <div className="p-3 rounded-xl bg-gray-50 group-hover:bg-[#90FCA6]/10 transition-colors">
      <Cloud className="w-6 h-6 text-gray-600 group-hover:text-gray-900" />
    </div>
    <div className="flex-1 min-w-0">
      <h3 className="font-semibold text-gray-900 group-hover:text-gray-900">
        Cloud Providers
      </h3>
      <p className="mt-1 text-sm text-gray-500">
        Connect AWS, GCP, or Azure accounts
      </p>
    </div>
    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-[#90FCA6] group-hover:translate-x-1 transition-all" />
  </div>
</button>
```

### Content Card (with sections)
```tsx
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
  {/* Card Header */}
  <div className="px-5 sm:px-6 py-4 border-b border-gray-100 bg-gray-50/50">
    <h2 className="font-semibold text-gray-900">Section Title</h2>
  </div>

  {/* Card Body */}
  <div className="p-5 sm:p-6">
    {/* Content */}
  </div>

  {/* Card Footer (optional) */}
  <div className="px-5 sm:px-6 py-4 border-t border-gray-100 bg-gray-50/30 flex items-center justify-end gap-3">
    <button className="...">Cancel</button>
    <button className="bg-[#90FCA6] text-black ...">Save</button>
  </div>
</div>
```

---

## FORM LAYOUTS (Smart UI Techniques)

### Folder Structure for Form Components
```
01-fronted-system/
├── components/
│   ├── ui/                          # Base UI primitives
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── combobox.tsx             # Searchable dropdown
│   │   ├── tree-select.tsx          # Hierarchy tree picker
│   │   ├── multi-select.tsx         # Multi-choice dropdown
│   │   └── command.tsx              # Command palette (cmdk)
│   │
│   ├── forms/                       # Reusable form patterns
│   │   ├── form-section.tsx         # Collapsible section
│   │   ├── form-stepper.tsx         # Multi-step wizard
│   │   ├── form-field.tsx           # Label + input + error
│   │   └── form-grid.tsx            # Responsive grid wrapper
│   │
│   ├── hierarchy/                   # Hierarchy-specific
│   │   ├── hierarchy-tree.tsx       # Visual tree component
│   │   ├── hierarchy-picker.tsx     # Searchable tree select
│   │   └── hierarchy-breadcrumb.tsx # Path display
│   │
│   └── subscriptions/               # Domain-specific
│       ├── plan-form/
│       │   ├── index.tsx            # Main form orchestrator
│       │   ├── basic-info-step.tsx  # Step 1: Name, provider
│       │   ├── pricing-step.tsx     # Step 2: Cost, billing
│       │   ├── allocation-step.tsx  # Step 3: Hierarchy
│       │   └── review-step.tsx      # Step 4: Summary
│       └── provider-logo.tsx
│
├── app/[orgSlug]/
│   └── integrations/subscriptions/
│       └── [provider]/
│           ├── page.tsx             # Uses plan-form/index.tsx
│           └── add/page.tsx         # Add new plan
```

---

### Multi-Step Form (For Complex Forms)
**When to use:** Forms with 5+ fields or logical groupings

```tsx
// components/forms/form-stepper.tsx
interface Step {
  id: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
}

export function FormStepper({
  steps,
  currentStep,
  onStepClick,
  allowNavigation = false
}: FormStepperProps) {
  return (
    <nav className="mb-8">
      <ol className="flex items-center">
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-center">
            {/* Step circle */}
            <button
              onClick={() => allowNavigation && onStepClick?.(index)}
              disabled={!allowNavigation}
              className={`
                relative flex items-center justify-center w-10 h-10 rounded-full
                font-semibold text-sm transition-all duration-300
                ${index < currentStep
                  ? 'bg-[#90FCA6] text-black'
                  : index === currentStep
                    ? 'bg-gray-900 text-white ring-4 ring-gray-100'
                    : 'bg-gray-100 text-gray-400'}
                ${allowNavigation && index <= currentStep ? 'cursor-pointer hover:scale-105' : ''}
              `}
            >
              {index < currentStep ? (
                <Check className="w-5 h-5" />
              ) : (
                index + 1
              )}
            </button>

            {/* Step label (desktop) */}
            <div className="hidden sm:block ml-3 mr-8">
              <p className={`text-sm font-medium ${
                index <= currentStep ? 'text-gray-900' : 'text-gray-400'
              }`}>
                {step.title}
              </p>
              {step.description && (
                <p className="text-xs text-gray-400">{step.description}</p>
              )}
            </div>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div className={`
                hidden sm:block w-16 h-0.5 mr-4 transition-colors duration-300
                ${index < currentStep ? 'bg-[#90FCA6]' : 'bg-gray-200'}
              `} />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

// Usage in subscription form
const STEPS: Step[] = [
  { id: 'basic', title: 'Basic Info', description: 'Name & provider' },
  { id: 'pricing', title: 'Pricing', description: 'Cost & billing' },
  { id: 'allocation', title: 'Allocation', description: 'Cost center' },
  { id: 'review', title: 'Review', description: 'Confirm details' },
];
```

---

### Searchable Combobox (For Long Lists)
**When to use:** Dropdowns with 10+ options

```tsx
// components/ui/combobox.tsx
"use client";
import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

interface Option {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Search...",
  emptyMessage = "No results found"
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = options.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase()) ||
    opt.description?.toLowerCase().includes(search.toLowerCase())
  );

  const selected = options.find(opt => opt.value === value);

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 h-12 px-4
                   rounded-xl border border-gray-200 bg-white text-left
                   hover:border-gray-300 focus:border-[#90FCA6] focus:ring-2
                   focus:ring-[#90FCA6]/20 transition-all"
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 w-full mt-2 bg-white rounded-xl border border-gray-200
                        shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type to search..."
                className="w-full h-10 pl-9 pr-4 rounded-lg border border-gray-200
                           focus:border-[#90FCA6] focus:ring-2 focus:ring-[#90FCA6]/20
                           text-sm placeholder:text-gray-400 outline-none"
                autoFocus
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
          </div>

          {/* Options */}
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">{emptyMessage}</p>
            ) : (
              filtered.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
                    transition-colors
                    ${option.value === value
                      ? 'bg-[#90FCA6]/10 text-gray-900'
                      : 'hover:bg-gray-50 text-gray-700'}
                  `}
                >
                  {option.icon && <span className="shrink-0">{option.icon}</span>}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{option.label}</p>
                    {option.description && (
                      <p className="text-xs text-gray-400 truncate">{option.description}</p>
                    )}
                  </div>
                  {option.value === value && (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

### Hierarchy Tree Picker (Visual Tree Selection)
**When to use:** Selecting from nested org structure

```tsx
// components/hierarchy/hierarchy-picker.tsx
"use client";
import { useState } from 'react';
import { ChevronRight, ChevronDown, Building2, FolderKanban, Users, Search, Check } from 'lucide-react';

interface HierarchyNode {
  entity_id: string;
  entity_name: string;
  entity_type: 'department' | 'project' | 'team';
  children?: HierarchyNode[];
}

const ICONS = {
  department: Building2,
  project: FolderKanban,
  team: Users,
};

const COLORS = {
  department: 'text-blue-600 bg-blue-50',
  project: 'text-purple-600 bg-purple-50',
  team: 'text-emerald-600 bg-emerald-50',
};

function TreeNode({
  node,
  level = 0,
  selected,
  onSelect,
  expanded,
  onToggle
}: TreeNodeProps) {
  const Icon = ICONS[node.entity_type];
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expanded.includes(node.entity_id);
  const isSelected = selected === node.entity_id;

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node)}
        className={`
          w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left
          transition-all duration-150
          ${isSelected
            ? 'bg-[#90FCA6]/15 ring-1 ring-[#90FCA6]'
            : 'hover:bg-gray-50'}
        `}
        style={{ paddingLeft: `${12 + level * 20}px` }}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.entity_id);
            }}
            className="p-0.5 rounded hover:bg-gray-200 transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </button>
        ) : (
          <span className="w-5" /> // Spacer
        )}

        {/* Icon */}
        <span className={`p-1.5 rounded-lg ${COLORS[node.entity_type]}`}>
          <Icon className="w-4 h-4" />
        </span>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{node.entity_name}</p>
          <p className="text-xs text-gray-400 capitalize">{node.entity_type}</p>
        </div>

        {/* Selected indicator */}
        {isSelected && (
          <Check className="w-5 h-5 text-emerald-600 shrink-0" />
        )}
      </button>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="animate-in slide-in-from-top-1 duration-200">
          {node.children!.map(child => (
            <TreeNode
              key={child.entity_id}
              node={child}
              level={level + 1}
              selected={selected}
              onSelect={onSelect}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function HierarchyPicker({
  tree,
  value,
  onChange,
  placeholder = "Select cost allocation..."
}: HierarchyPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);

  // Find selected node for display
  const findNode = (nodes: HierarchyNode[], id: string): HierarchyNode | null => {
    for (const node of nodes) {
      if (node.entity_id === id) return node;
      if (node.children) {
        const found = findNode(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const selectedNode = value ? findNode(tree, value) : null;
  const SelectedIcon = selectedNode ? ICONS[selectedNode.entity_type] : null;

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 h-14 px-4 rounded-xl border border-gray-200
                   bg-white text-left hover:border-gray-300 focus:border-[#90FCA6]
                   focus:ring-2 focus:ring-[#90FCA6]/20 transition-all"
      >
        {selectedNode ? (
          <>
            <span className={`p-1.5 rounded-lg ${COLORS[selectedNode.entity_type]}`}>
              <SelectedIcon className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{selectedNode.entity_name}</p>
              <p className="text-xs text-gray-400 capitalize">{selectedNode.entity_type}</p>
            </div>
          </>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 w-full mt-2 bg-white rounded-xl border border-gray-200
                        shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2">
          {/* Search */}
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search departments, projects, teams..."
                className="w-full h-10 pl-9 pr-4 rounded-lg border border-gray-200
                           focus:border-[#90FCA6] focus:ring-2 focus:ring-[#90FCA6]/20
                           text-sm outline-none"
                autoFocus
              />
            </div>
          </div>

          {/* Tree */}
          <div className="max-h-80 overflow-y-auto p-2">
            {tree.map(node => (
              <TreeNode
                key={node.entity_id}
                node={node}
                selected={value}
                onSelect={(node) => {
                  onChange(node.entity_id, node);
                  setOpen(false);
                }}
                expanded={expanded}
                onToggle={(id) => setExpanded(prev =>
                  prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                )}
              />
            ))}
          </div>

          {/* Quick actions */}
          <div className="p-2 border-t border-gray-100 bg-gray-50/50">
            <button
              type="button"
              onClick={() => setExpanded([])}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Collapse all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

### Collapsible Form Sections
**When to use:** Long forms that need visual grouping

```tsx
// components/forms/form-section.tsx
"use client";
import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export function FormSection({
  title,
  description,
  icon: Icon,
  defaultOpen = false,
  isComplete = false,
  children
}: FormSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Header (clickable) */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50/50 transition-colors"
      >
        {Icon && (
          <span className={`p-2 rounded-lg ${isComplete ? 'bg-emerald-50' : 'bg-gray-100'}`}>
            <Icon className={`w-5 h-5 ${isComplete ? 'text-emerald-600' : 'text-gray-600'}`} />
          </span>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            {isComplete && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-xs font-medium">
                Complete
              </span>
            )}
          </div>
          {description && (
            <p className="text-sm text-gray-500 mt-0.5">{description}</p>
          )}
        </div>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Content */}
      {open && (
        <div className="px-5 pb-5 pt-2 border-t border-gray-100 animate-in slide-in-from-top-2 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}
```

---

### Split Form Layout (Side-by-Side)
**When to use:** Forms with preview or context panel

```tsx
// Two-panel form layout
<div className="grid lg:grid-cols-5 gap-6">
  {/* Form panel - 3 cols */}
  <div className="lg:col-span-3 space-y-6">
    <FormSection title="Basic Info" icon={FileText} defaultOpen>
      {/* Form fields */}
    </FormSection>
    <FormSection title="Pricing" icon={DollarSign}>
      {/* Form fields */}
    </FormSection>
  </div>

  {/* Preview panel - 2 cols */}
  <div className="lg:col-span-2">
    <div className="sticky top-6 bg-gray-50 rounded-xl p-5 border border-gray-100">
      <h3 className="font-semibold text-gray-900 mb-4">Preview</h3>
      <SubscriptionCard data={formData} />
    </div>
  </div>
</div>
```

---

### Multi-Select Tags (For Multiple Choices)
```tsx
// components/ui/multi-select.tsx
export function MultiSelect({
  options,
  value = [],
  onChange,
  placeholder = "Select options..."
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  const toggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter(v => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  return (
    <div className="relative">
      {/* Selected tags */}
      <div
        onClick={() => setOpen(!open)}
        className="min-h-[48px] flex flex-wrap gap-2 p-2 rounded-xl border border-gray-200
                   bg-white cursor-pointer hover:border-gray-300 transition-colors"
      >
        {value.length === 0 ? (
          <span className="px-2 py-1 text-gray-400">{placeholder}</span>
        ) : (
          value.map(v => {
            const option = options.find(o => o.value === v);
            return (
              <span
                key={v}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg
                           bg-[#90FCA6]/10 text-gray-900 text-sm"
              >
                {option?.label}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(v);
                  }}
                  className="p-0.5 rounded hover:bg-[#90FCA6]/20"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 w-full mt-2 bg-white rounded-xl border shadow-xl p-1">
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => toggle(option.value)}
              className={`
                w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left
                ${value.includes(option.value) ? 'bg-[#90FCA6]/10' : 'hover:bg-gray-50'}
              `}
            >
              <span>{option.label}</span>
              {value.includes(option.value) && <Check className="w-4 h-4 text-emerald-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### Form Field Wrapper (Consistent Styling)
```tsx
// components/forms/form-field.tsx
export function FormField({
  label,
  required,
  error,
  hint,
  children
}: FormFieldProps) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}

// Usage
<FormField label="Plan Name" required hint="The name shown on invoices">
  <Input placeholder="e.g., Slack Pro" />
</FormField>
```

---

## DECISION MATRIX (When to Use What)

### Form Complexity
| Fields | Pattern | Example |
|--------|---------|---------|
| 1-4 | Single card | Quick settings toggle |
| 5-8 | Collapsible sections | Integration setup |
| 9+ | Multi-step wizard | Subscription add |
| Related data | Split panel (form + preview) | Plan editor |

### Dropdown Selection
| Options | Pattern | Component |
|---------|---------|-----------|
| 2-5 | Radio group or toggle | Billing cycle |
| 6-15 | Standard select | Currency picker |
| 15+ | Searchable combobox | Provider list |
| Nested/tree | Tree picker | Hierarchy selector |
| Multiple choice | Multi-select tags | Features, tags |

### Data Display
| Rows | Pattern | Component |
|------|---------|-----------|
| 1-10 | Simple list | Recent activity |
| 10-50 | Paginated table | Subscriptions list |
| 50+ | Virtual scroll | Usage logs |
| Cards | Grid layout | Integration cards |

### User Feedback
| Type | Pattern | Duration |
|------|---------|----------|
| Success | Toast (bottom-right) | 3s auto-dismiss |
| Error | Toast (stays) | Manual dismiss |
| Warning | Inline banner | Persistent |
| Info | Subtle badge | Persistent |
| Blocking | Modal dialog | User action |

---

## DATA TABLES (Premium)

### Basic Table
```tsx
// components/ui/data-table.tsx
export function DataTable<T>({
  data,
  columns,
  onRowClick,
  emptyMessage = "No data found"
}: DataTableProps<T>) {
  if (data.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row, idx) => (
              <tr
                key={idx}
                onClick={() => onRowClick?.(row)}
                className={`
                  transition-colors
                  ${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}
                `}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-4 text-sm text-gray-900">
                    {col.render ? col.render(row) : String(row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Table with Actions
```tsx
<DataTable
  data={subscriptions}
  columns={[
    { key: 'name', header: 'Name', render: (row) => (
      <div className="flex items-center gap-3">
        <ProviderLogo provider={row.provider} size={32} />
        <div>
          <p className="font-medium">{row.plan_name}</p>
          <p className="text-xs text-gray-400">{row.provider}</p>
        </div>
      </div>
    )},
    { key: 'cost', header: 'Monthly Cost', render: (row) => (
      <span className="font-semibold">{formatCurrency(row.monthly_cost, row.currency)}</span>
    )},
    { key: 'seats', header: 'Seats' },
    { key: 'status', header: 'Status', render: (row) => (
      <StatusBadge status={row.status} />
    )},
    { key: 'actions', header: '', render: (row) => (
      <DropdownMenu>
        <DropdownMenuItem onClick={() => edit(row)}>Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={() => archive(row)} className="text-red-600">Archive</DropdownMenuItem>
      </DropdownMenu>
    )},
  ]}
/>
```

---

## MODALS & DIALOGS

### Confirmation Dialog
```tsx
// components/ui/confirm-dialog.tsx
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default" // default | destructive
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4
                      animate-in zoom-in-95 fade-in duration-200">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          <p className="mt-2 text-gray-500">{description}</p>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-gray-700 font-medium hover:bg-gray-100 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2.5 rounded-lg font-medium transition-all ${
              variant === 'destructive'
                ? 'bg-[#FF6C5E] text-white hover:bg-[#e85a4d]'
                : 'bg-[#90FCA6] text-black hover:bg-[#6EE890]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Slide-Over Panel
```tsx
// components/ui/slide-over.tsx
export function SlideOver({
  open,
  onClose,
  title,
  children,
  width = "max-w-md"
}: SlideOverProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`absolute inset-y-0 right-0 ${width} w-full`}>
        <div className="h-full bg-white shadow-2xl flex flex-col
                        animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## TOAST NOTIFICATIONS

```tsx
// components/ui/toast.tsx
// Using sonner or react-hot-toast pattern

export function showToast({
  type = 'default',
  title,
  description,
  action
}: ToastProps) {
  const icons = {
    success: <CheckCircle className="w-5 h-5 text-emerald-600" />,
    error: <AlertCircle className="w-5 h-5 text-red-600" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-600" />,
    default: <Info className="w-5 h-5 text-gray-600" />,
  };

  return (
    <div className="flex items-start gap-3 bg-white rounded-xl shadow-lg border border-gray-100 p-4 min-w-[320px]">
      {icons[type]}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900">{title}</p>
        {description && (
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="text-sm font-medium text-gray-900 hover:underline"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// Usage
showToast({
  type: 'success',
  title: 'Subscription saved',
  description: 'Your changes have been applied',
});

showToast({
  type: 'error',
  title: 'Failed to save',
  description: 'Please check your connection and try again',
  action: { label: 'Retry', onClick: () => retry() }
});
```

---

## ACCESSIBILITY REQUIREMENTS (CRITICAL)

### Focus Management
```tsx
// Always trap focus in modals
useEffect(() => {
  if (open) {
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();
  }
}, [open]);

// Return focus on close
const previouslyFocused = useRef<HTMLElement | null>(null);
useEffect(() => {
  if (open) {
    previouslyFocused.current = document.activeElement as HTMLElement;
  } else {
    previouslyFocused.current?.focus();
  }
}, [open]);
```

### Keyboard Navigation
```tsx
// Escape to close
useEffect(() => {
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) onClose();
  };
  document.addEventListener('keydown', handleEscape);
  return () => document.removeEventListener('keydown', handleEscape);
}, [open, onClose]);

// Arrow keys for lists
const handleKeyDown = (e: KeyboardEvent) => {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      setFocusedIndex(i => Math.min(i + 1, options.length - 1));
      break;
    case 'ArrowUp':
      e.preventDefault();
      setFocusedIndex(i => Math.max(i - 1, 0));
      break;
    case 'Enter':
      e.preventDefault();
      onSelect(options[focusedIndex]);
      break;
  }
};
```

### ARIA Labels
```tsx
// Buttons without text
<button aria-label="Close dialog">
  <X className="w-5 h-5" />
</button>

// Form fields
<input
  id="plan-name"
  aria-describedby="plan-name-hint plan-name-error"
  aria-invalid={!!error}
/>
<p id="plan-name-hint">Enter the subscription name</p>
{error && <p id="plan-name-error" role="alert">{error}</p>}

// Live regions for dynamic content
<div aria-live="polite" aria-atomic="true">
  {status && <p>{status}</p>}
</div>
```

### Color Contrast
```
Minimum contrast ratios (WCAG AA):
- Normal text: 4.5:1
- Large text (18px+): 3:1
- UI components: 3:1

✅ gray-900 on white = 16:1
✅ gray-500 on white = 7:1
✅ emerald-600 on white = 4.5:1
❌ mint (#90FCA6) on white = 1.5:1 (NEVER for text!)
```

### Touch Targets
```tsx
// Minimum 44x44px for all interactive elements
<button className="min-h-[44px] min-w-[44px] ...">

// For icon buttons, use padding
<button className="p-3 ..."> {/* 12px padding + 20px icon = 44px */}
  <Icon className="w-5 h-5" />
</button>
```

---

## PERFORMANCE PATTERNS

### Virtualized List (50+ items)
```tsx
// Use @tanstack/react-virtual or react-window
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // row height
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-[400px] overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <ListItem item={items[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Debounced Search
```tsx
import { useDebouncedCallback } from 'use-debounce';

const debouncedSearch = useDebouncedCallback((value: string) => {
  onSearch(value);
}, 300);

<input
  onChange={(e) => debouncedSearch(e.target.value)}
  placeholder="Search..."
/>
```

### Optimistic Updates
```tsx
async function handleToggle(id: string) {
  // Optimistic update
  setItems(prev => prev.map(item =>
    item.id === id ? { ...item, enabled: !item.enabled } : item
  ));

  try {
    await api.toggle(id);
  } catch (error) {
    // Revert on error
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, enabled: !item.enabled } : item
    ));
    showToast({ type: 'error', title: 'Failed to update' });
  }
}
```

---

## STATUS BANNERS (Smart Alerts)

### Onboarding Issues Banner
```tsx
{!isBackendOnboarded && (
  <div className="bg-amber-50 border-b border-amber-200">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-full bg-amber-100">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-amber-800">
              Backend setup incomplete
            </p>
            <p className="text-xs text-amber-600">
              Some features are limited until setup is complete
            </p>
          </div>
        </div>
        <button className="shrink-0 px-4 py-2 rounded-lg bg-amber-100 text-amber-800 text-sm font-medium hover:bg-amber-200 transition-colors">
          Complete Setup
        </button>
      </div>
    </div>
  </div>
)}
```

### Billing Alert Banner
```tsx
{billingIssue && (
  <div className="bg-red-50 border-b border-red-200">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-full bg-red-100">
            <CreditCard className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-red-800">
              Payment issue detected
            </p>
            <p className="text-xs text-red-600">
              Please update your payment method to continue using all features
            </p>
          </div>
        </div>
        <button className="shrink-0 px-4 py-2 rounded-lg bg-red-100 text-red-800 text-sm font-medium hover:bg-red-200 transition-colors">
          Update Payment
        </button>
      </div>
    </div>
  </div>
)}
```

### Success Banner (Dismissible)
```tsx
{showSuccess && (
  <div className="bg-emerald-50 border-b border-emerald-200">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-full bg-emerald-100">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-sm font-medium text-emerald-800">
            Changes saved successfully
          </p>
        </div>
        <button onClick={() => setShowSuccess(false)} className="p-1 rounded hover:bg-emerald-100">
          <X className="w-4 h-4 text-emerald-600" />
        </button>
      </div>
    </div>
  </div>
)}
```

---

## CREATIVE USER EXPERIENCES

### Empty State (Engaging)
```tsx
<div className="text-center py-16 px-6">
  <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-[#90FCA6]/20 to-[#90FCA6]/5 flex items-center justify-center mb-6">
    <Inbox className="w-10 h-10 text-gray-400" />
  </div>
  <h3 className="text-xl font-semibold text-gray-900 mb-2">
    No subscriptions yet
  </h3>
  <p className="text-gray-500 max-w-sm mx-auto mb-8">
    Track your SaaS spending by adding your first subscription. We'll help you visualize costs across your organization.
  </p>
  <button className="bg-[#90FCA6] text-black hover:bg-[#6EE890] rounded-xl px-6 py-3 font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
    <Plus className="w-5 h-5 inline mr-2" />
    Add Your First Subscription
  </button>
</div>
```

### Loading State (Premium Skeleton)
```tsx
<div className="animate-pulse space-y-4">
  <div className="h-8 bg-gray-100 rounded-lg w-1/3" />
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
    {[...Array(4)].map((_, i) => (
      <div key={i} className="h-32 bg-gray-100 rounded-2xl" />
    ))}
  </div>
  <div className="h-64 bg-gray-100 rounded-2xl" />
</div>
```

### Interactive List Item
```tsx
<div className="group flex items-center gap-4 p-4 rounded-xl bg-white border border-gray-100 hover:border-[#90FCA6]/30 hover:shadow-md transition-all duration-200 cursor-pointer">
  <div className="w-12 h-12 rounded-xl bg-gray-100 group-hover:bg-[#90FCA6]/10 flex items-center justify-center transition-colors">
    <img src={logo} alt="" className="w-8 h-8" />
  </div>
  <div className="flex-1 min-w-0">
    <h4 className="font-medium text-gray-900 truncate">Slack Pro</h4>
    <p className="text-sm text-gray-500">$12.50/user/month • 45 seats</p>
  </div>
  <div className="text-right">
    <p className="font-semibold text-gray-900">$562.50</p>
    <p className="text-xs text-gray-400">per month</p>
  </div>
  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-[#90FCA6] group-hover:translate-x-1 transition-all" />
</div>
```

### Progress Indicator (Onboarding)
```tsx
<div className="flex items-center gap-2 mb-8">
  {steps.map((step, i) => (
    <React.Fragment key={i}>
      <div className={`
        w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all
        ${i < currentStep ? 'bg-[#90FCA6] text-black' : ''}
        ${i === currentStep ? 'bg-gray-900 text-white ring-4 ring-gray-900/10' : ''}
        ${i > currentStep ? 'bg-gray-100 text-gray-400' : ''}
      `}>
        {i < currentStep ? <Check className="w-5 h-5" /> : i + 1}
      </div>
      {i < steps.length - 1 && (
        <div className={`flex-1 h-1 rounded-full transition-colors ${i < currentStep ? 'bg-[#90FCA6]' : 'bg-gray-100'}`} />
      )}
    </React.Fragment>
  ))}
</div>
```

---

## SPACING & LAYOUT REFERENCE

### Container Widths
| Class | Width | Usage |
|-------|-------|-------|
| `max-w-7xl` | 1280px | Console pages (standard) |
| `max-w-4xl` | 896px | Settings pages |
| `max-w-3xl` | 768px | Forms, focused content |
| `max-w-2xl` | 672px | Modals, dialogs |
| `max-w-xl` | 576px | Small dialogs |

### Spacing Scale (8px Grid)
```
space-1:  4px   (tight: icon gaps)
space-2:  8px   (inline elements)
space-3:  12px  (list items)
space-4:  16px  (standard gaps)
space-5:  20px  (card padding mobile)
space-6:  24px  (card padding desktop)
space-8:  32px  (section margins)
space-10: 40px  (large gaps)
space-12: 48px  (page sections)
```

### Responsive Patterns
```tsx
// Spacing
className="space-y-4 sm:space-y-6 lg:space-y-8"
className="gap-4 sm:gap-6"
className="p-4 sm:p-6 lg:p-8"

// Grid
className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"

// Typography
className="text-xl sm:text-2xl lg:text-3xl"
```

---

## DO's

| Category | Guideline |
|----------|-----------|
| **Enterprise** | Design for CFOs and IT leaders - professional, authoritative |
| **Enterprise** | Include trust signals (security badges, data freshness) |
| **Enterprise** | Use `tabular-nums` for all financial data |
| **Enterprise** | Show totals, averages, and comparisons in tables |
| **Enterprise** | Add export options (CSV, PDF) on data views |
| **Surfaces** | Use pure white (#FFFFFF) for cards and backgrounds |
| **Surfaces** | Add subtle gradient glow at page top |
| **Text** | Use gray-900 for headings, gray-500 for labels |
| **Text** | NEVER use mint for text - poor contrast! |
| **Data** | Format currency properly ($12,450.00 not 12450) |
| **Data** | Always show context (vs last month, YTD, etc.) |
| **Data** | Include data timestamps and audit trails |
| **Buttons** | Use mint #90FCA6 with black text |
| **Buttons** | Add hover lift (-translate-y) for premium feel |
| **Cards** | Use rounded-2xl for modern look |
| **Cards** | Add shine/glow effects on hover |
| **Forms** | Make inputs h-12 minimum (48px touch target) |
| **Forms** | Use generous spacing (space-y-6) between fields |
| **Hierarchy** | Use h-14 for hierarchy selects (not squeezy) |
| **Banners** | Show issues at top, don't redirect away |
| **Empty States** | Make them professional with clear CTAs |
| **Loading** | Use premium skeleton animations |

## DON'Ts

| Category | Avoid |
|----------|-------|
| **Enterprise** | Playful/cute illustrations (use professional icons) |
| **Enterprise** | Bright colorful gradients (screams consumer app) |
| **Enterprise** | Casual language ("Awesome!", "Yay!") |
| **Enterprise** | Rounded pill buttons (too casual) |
| **Enterprise** | Missing data context (raw numbers without comparison) |
| **Colors** | Mint text on white (poor contrast) |
| **Colors** | Blue for links (use gray-900 + underline) |
| **Colors** | Gray backgrounds on console pages |
| **Colors** | Multiple accent colors on same screen |
| **Layout** | Full-width stretching (always bound content) |
| **Layout** | Cramped/squeezy forms |
| **Forms** | Small inputs (< 44px height) |
| **Forms** | Missing helper text and labels |
| **Spacing** | Inconsistent gaps (stick to 8px grid) |
| **Redirects** | Redirecting users for backend issues |
| **Shadows** | Heavy drop shadows |
| **Animation** | Bouncy/playful transitions (keep subtle) |
| **Data** | Unformatted numbers (12450 instead of $12,450) |
| **Data** | Missing decimal places on currency |
| **Data** | Data without timestamps or freshness indicator |

---

## ENTERPRISE COMPONENTS

### Executive Dashboard Header
```tsx
// components/layout/executive-header.tsx
export function ExecutiveHeader({
  title,
  subtitle,
  dateRange,
  onExport,
  onDateRangeChange
}: ExecutiveHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-gray-500">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Date Range Selector */}
        <select
          value={dateRange}
          onChange={(e) => onDateRangeChange?.(e.target.value)}
          className="h-10 px-3 rounded-lg border border-gray-200 text-sm font-medium
                     text-gray-700 bg-white hover:border-gray-300 focus:border-[#90FCA6]
                     focus:ring-2 focus:ring-[#90FCA6]/20 transition-all"
        >
          <option value="mtd">Month to Date</option>
          <option value="qtd">Quarter to Date</option>
          <option value="ytd">Year to Date</option>
          <option value="last30">Last 30 Days</option>
          <option value="last90">Last 90 Days</option>
          <option value="custom">Custom Range</option>
        </select>

        {/* Export Button */}
        <button
          onClick={onExport}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-gray-200
                     text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>
    </div>
  );
}
```

### KPI Summary Row (Executive View)
```tsx
// components/cards/kpi-summary.tsx
export function KPISummary({ metrics }: { metrics: KPIMetric[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500">{metric.label}</span>
            {metric.badge && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                metric.badge === 'live' ? 'bg-emerald-50 text-emerald-600' :
                metric.badge === 'projected' ? 'bg-amber-50 text-amber-600' :
                'bg-gray-100 text-gray-600'
              }`}>
                {metric.badge === 'live' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />}
                {metric.badge}
              </span>
            )}
          </div>

          <div className="flex items-end justify-between">
            <div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">
                {metric.value}
              </p>
              {metric.change && (
                <div className={`flex items-center gap-1 mt-1 text-sm font-medium ${
                  metric.changeType === 'positive' ? 'text-emerald-600' :
                  metric.changeType === 'negative' ? 'text-red-600' :
                  'text-gray-500'
                }`}>
                  {metric.changeType === 'positive' && <TrendingUp className="w-4 h-4" />}
                  {metric.changeType === 'negative' && <TrendingDown className="w-4 h-4" />}
                  <span>{metric.change}</span>
                  <span className="text-gray-400 font-normal">vs {metric.comparePeriod}</span>
                </div>
              )}
            </div>

            {metric.sparkline && (
              <SparklineChart data={metric.sparkline} width={60} height={24} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Professional Data Table (with Export)
```tsx
// components/tables/professional-table.tsx
export function ProfessionalTable<T>({
  title,
  data,
  columns,
  totals,
  onExport,
  emptyMessage = "No data available"
}: ProfessionalTableProps<T>) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        {onExport && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onExport('csv')}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium"
            >
              CSV
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={() => onExport('pdf')}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium"
            >
              PDF
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {data.length === 0 ? (
        <div className="py-12 text-center text-gray-500">{emptyMessage}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-5 py-4 text-sm ${
                        col.align === 'right' ? 'text-right tabular-nums' : ''
                      } ${col.className || 'text-gray-900'}`}
                    >
                      {col.render ? col.render(row) : String(row[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>

            {/* Totals Row */}
            {totals && (
              <tfoot>
                <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                  {columns.map((col, idx) => (
                    <td
                      key={col.key}
                      className={`px-5 py-4 text-sm ${
                        col.align === 'right' ? 'text-right tabular-nums' : ''
                      }`}
                    >
                      {idx === 0 ? 'Total' : totals[col.key] || ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/30 flex items-center justify-between text-xs text-gray-400">
        <span>{data.length} items</span>
        <span>Last updated: {new Date().toLocaleString()}</span>
      </div>
    </div>
  );
}
```

### Audit Trail Component
```tsx
// components/feedback/audit-trail.tsx
export function AuditTrail({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-400" />
          Audit Trail
        </h3>
      </div>

      <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
        {entries.map((entry, idx) => (
          <div key={idx} className="px-5 py-3 flex items-start gap-3">
            <div className={`w-2 h-2 rounded-full mt-1.5 ${
              entry.type === 'create' ? 'bg-emerald-500' :
              entry.type === 'update' ? 'bg-blue-500' :
              entry.type === 'delete' ? 'bg-red-500' :
              'bg-gray-400'
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900">{entry.action}</p>
              <p className="text-xs text-gray-400">
                {entry.user} • {new Date(entry.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Security Badge
```tsx
// components/feedback/security-badge.tsx
export function SecurityBadge({ variant = 'default' }: { variant?: 'default' | 'compact' }) {
  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-400">
        <Shield className="w-3.5 h-3.5" />
        <span>Encrypted</span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
      <Shield className="w-4 h-4 text-emerald-600" />
      <div className="text-xs">
        <span className="font-medium text-gray-700">256-bit encryption</span>
        <span className="text-gray-400"> • SOC 2 Type II</span>
      </div>
    </div>
  );
}
```

### Data Freshness Indicator
```tsx
// components/feedback/data-freshness.tsx
export function DataFreshness({
  lastUpdated,
  isLive = false
}: {
  lastUpdated: Date;
  isLive?: boolean;
}) {
  const timeAgo = formatDistanceToNow(lastUpdated, { addSuffix: true });

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-400">
      {isLive ? (
        <>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-emerald-600 font-medium">Live</span>
          <span>•</span>
        </>
      ) : (
        <Clock className="w-3.5 h-3.5" />
      )}
      <span>Updated {timeAgo}</span>
    </div>
  );
}
```

### Professional Report Footer
```tsx
// components/layout/report-footer.tsx
export function ReportFooter({ reportId }: { reportId?: string }) {
  return (
    <div className="mt-8 pt-4 border-t border-gray-100 text-xs text-gray-400">
      <div className="flex items-center justify-between">
        <div>
          <p>Generated by CloudAct • {new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</p>
          {reportId && <p>Report ID: {reportId}</p>}
        </div>
        <div className="text-right">
          <p>Data retention: 7 years</p>
          <p>Confidential - Internal Use Only</p>
        </div>
      </div>
    </div>
  );
}
```

---

## QUICK COPY-PASTE

### Page Container
```tsx
<div className="min-h-full bg-white">
  <div className="absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-[#90FCA6]/5 to-transparent pointer-events-none" />
  <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
```

### Premium Card
```tsx
<div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
```

### Primary Button
```tsx
<button className="bg-[#90FCA6] text-black hover:bg-[#6EE890] rounded-lg px-4 py-2.5 font-medium shadow-sm hover:shadow-md transition-all duration-200">
```

### Form Input
```tsx
<input className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-[#90FCA6] focus:ring-2 focus:ring-[#90FCA6]/20 text-gray-900 placeholder:text-gray-400 transition-all" />
```

### Hierarchy Select
```tsx
<select className="w-full h-14 px-4 rounded-xl border border-gray-200 focus:border-[#90FCA6] focus:ring-2 focus:ring-[#90FCA6]/20 text-gray-900 appearance-none cursor-pointer text-base">
```

---

## VERIFICATION REQUIREMENTS (CRITICAL)

### Never Break Existing Logic
Before making ANY UI changes:
1. **Read the entire component file** - understand existing logic
2. **Identify all event handlers** - onClick, onChange, onSubmit, etc.
3. **Check data fetching** - useEffect, server actions, API calls
4. **Preserve all imports** - don't remove unused-looking imports
5. **Keep form validation** - existing validation rules must stay
6. **Maintain state management** - don't change state structure

### Browser Automation Verification (MANDATORY)
**NEVER consider a UI change complete until verified with Playwright:**

```
VERIFICATION CHECKLIST:
□ Navigate to the modified page
□ Take a screenshot (browser_take_screenshot)
□ Capture accessibility snapshot (browser_snapshot)
□ Check element spacing visually
□ Verify touch targets (min 44px)
□ Test hover states
□ Test form submissions
□ Verify responsive behavior
```

### Verification Commands
```typescript
// 1. Navigate and screenshot
await browser_navigate({ url: "http://localhost:3000/[orgSlug]/page" })
await browser_take_screenshot({ filename: "page-verification.png" })

// 2. Get accessibility snapshot
await browser_snapshot({})

// 3. Verify specific elements
await browser_hover({ element: "Primary button", ref: "button[0]" })
await browser_take_screenshot({ filename: "hover-state.png" })

// 4. Test form interactions
await browser_fill_form({ fields: [...] })
await browser_click({ element: "Submit button", ref: "button[0]" })

// 5. Check console for errors
await browser_console_messages({ level: "error" })
```

### Spacing Verification
```typescript
// Use browser_evaluate to check actual computed styles
await browser_evaluate({
  function: `() => {
    const card = document.querySelector('.premium-card');
    const styles = getComputedStyle(card);
    return {
      padding: styles.padding,
      margin: styles.margin,
      borderRadius: styles.borderRadius,
      height: card.offsetHeight,
      width: card.offsetWidth
    };
  }`
})
```

### Required Screenshots Before Closing
1. **Desktop view** (1280px width) - full page
2. **Mobile view** (375px width) - full page
3. **Hover states** - buttons, cards
4. **Form states** - empty, filled, error
5. **Loading states** - skeleton animations

### Error Recovery
If verification fails:
1. DO NOT close the browser
2. Take error screenshot
3. Check console messages
4. Fix the issue
5. Re-verify
6. Only close after ALL checks pass

```typescript
// Keep browser open pattern
const result = await browser_click({ element: "...", ref: "..." })
if (result.includes("error")) {
  await browser_take_screenshot({ filename: "error-state.png" })
  await browser_console_messages({ level: "error" })
  // FIX THE ISSUE
  // RE-VERIFY
}
// Only close when verified
await browser_close({})
```

---

## WORKFLOW

1. **Read** → Read existing component completely
2. **Understand** → Map out existing logic and state
3. **Plan** → List specific UI changes (no logic changes)
4. **Edit** → Make surgical UI-only changes
5. **Verify** → Use Playwright to check ALL changes
6. **Screenshot** → Capture proof of correct rendering
7. **Complete** → Only mark done after visual verification

---

*CloudAct Premium UI v1.0 | Stunning white surfaces | Creative user experiences | Always verify with Playwright*
