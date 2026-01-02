"use client"

/**
 * CostComboChart - Advanced bar + line combo chart
 *
 * Features:
 * - Bars for daily/period costs
 * - Line overlay for daily rate/moving average
 * - Reference lines for budget/goals
 * - Recharts-based with Apple Health styling
 * - Responsive and accessible
 */

import { useMemo } from "react"
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Area,
} from "recharts"
import { cn } from "@/lib/utils"
import { formatCostCompact } from "@/lib/costs"

// ============================================
// Types
// ============================================

export interface ComboDataPoint {
  /** Label for X-axis (e.g., "Dec 1", "Mon") */
  label: string
  /** Primary bar value (e.g., daily cost) */
  value: number
  /** Secondary bar value for stacking */
  secondaryValue?: number
  /** Line value (e.g., daily rate, moving average) */
  lineValue?: number
  /** Second line value (e.g., budget line) */
  secondLineValue?: number
  /** Date string for tooltip */
  date?: string
}

export interface CostComboChartProps {
  /** Chart title */
  title: string
  /** Subtitle or date range */
  subtitle?: string
  /** Data points */
  data: ComboDataPoint[]
  /** Currency code */
  currency?: string
  /** Primary bar color */
  barColor?: string
  /** Secondary bar color (for stacking) */
  secondaryBarColor?: string
  /** Line color (daily rate) */
  lineColor?: string
  /** Second line color (budget) */
  secondLineColor?: string
  /** Budget/goal reference line value */
  budgetLine?: number
  /** Budget label */
  budgetLabel?: string
  /** Bar label for legend */
  barLabel?: string
  /** Line label for legend */
  lineLabel?: string
  /** Show area fill under line */
  showAreaFill?: boolean
  /** Loading state */
  loading?: boolean
  /** Chart height */
  height?: number
  /** Custom class name */
  className?: string
  /** Show grid */
  showGrid?: boolean
  /** Show legend */
  showLegend?: boolean
  /** Y-axis domain (auto if not set) */
  yAxisDomain?: [number, number]
}

// ============================================
// Custom Tooltip
// ============================================

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    name: string
    value: number
    color: string
    dataKey: string
  }>
  label?: string
  currency: string
  barLabel: string
  lineLabel: string
}

function CustomTooltip({
  active,
  payload,
  label,
  currency,
  barLabel,
  lineLabel,
}: CustomTooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div className="bg-slate-900/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-xl border border-slate-700">
      <p className="text-slate-300 text-xs font-medium mb-1.5">{label}</p>
      <div className="space-y-1">
        {payload.map((entry, index) => {
          const isLine = entry.dataKey === "lineValue" || entry.dataKey === "secondLineValue"
          const displayLabel = isLine ? lineLabel : barLabel
          return (
            <div key={index} className="flex items-center gap-2">
              <div
                className={cn(
                  "w-2 h-2 rounded-full",
                  isLine && "w-3 h-0.5 rounded-none"
                )}
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-slate-400 text-xs">{displayLabel}:</span>
              <span className="text-white text-xs font-semibold tabular-nums">
                {formatCostCompact(entry.value, currency)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================
// Loading Skeleton
// ============================================

function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6 animate-pulse">
      <div className="h-4 w-32 bg-slate-200 rounded mb-2" />
      <div className="h-3 w-24 bg-slate-100 rounded mb-6" />
      <div
        className="bg-slate-100 rounded-lg"
        style={{ height: height - 80 }}
      />
    </div>
  )
}

// ============================================
// Main Component
// ============================================

export function CostComboChart({
  title,
  subtitle,
  data,
  currency = "USD",
  barColor = "#90FCA6",
  secondaryBarColor = "#4285F4",
  lineColor = "#FF6C5E",
  secondLineColor = "#7C3AED",
  budgetLine,
  budgetLabel = "Budget",
  barLabel = "Daily Cost",
  lineLabel = "Daily Rate",
  showAreaFill = false,
  loading = false,
  height = 280,
  className,
  showGrid = true,
  showLegend = true,
  yAxisDomain,
}: CostComboChartProps) {
  if (loading) {
    return <ChartSkeleton height={height} />
  }

  // Calculate dynamic Y-axis domain if not provided
  const calculatedDomain = useMemo(() => {
    if (yAxisDomain) return yAxisDomain

    const allValues = data.flatMap((d) => [
      d.value,
      d.secondaryValue ?? 0,
      d.lineValue ?? 0,
      d.secondLineValue ?? 0,
      budgetLine ?? 0,
    ])
    const maxValue = Math.max(...allValues, 0)
    return [0, maxValue * 1.15] as [number, number]
  }, [data, budgetLine, yAxisDomain])

  // Calculate moving average if not provided
  const enrichedData = useMemo(() => {
    return data.map((point, index) => {
      // Calculate 7-day moving average if lineValue not provided
      if (point.lineValue === undefined) {
        const windowStart = Math.max(0, index - 6)
        const windowData = data.slice(windowStart, index + 1)
        const avg = windowData.reduce((sum, d) => sum + d.value, 0) / windowData.length
        return { ...point, lineValue: avg }
      }
      return point
    })
  }, [data])

  // Custom X-axis tick
  const formatXAxisTick = (value: string) => {
    // Shorten long labels
    if (value.length > 6) {
      return value.slice(0, 6)
    }
    return value
  }

  // Custom Y-axis tick
  const formatYAxisTick = (value: number) => {
    return formatCostCompact(value, currency)
  }

  return (
    <div
      className={cn(
        "bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6",
        "shadow-sm hover:shadow-md transition-shadow duration-200",
        className
      )}
    >
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && (
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        )}
      </div>

      {/* Chart */}
      <div style={{ height: height - 80 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={enrichedData}
            margin={{ top: 20, right: 20, left: 0, bottom: 5 }}
          >
            {/* Grid */}
            {showGrid && (
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#E2E8F0"
                vertical={false}
              />
            )}

            {/* X Axis */}
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#64748B" }}
              tickFormatter={formatXAxisTick}
              interval="preserveStartEnd"
            />

            {/* Y Axis */}
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#64748B" }}
              tickFormatter={formatYAxisTick}
              domain={calculatedDomain}
              width={50}
            />

            {/* Tooltip */}
            <Tooltip
              content={
                <CustomTooltip
                  currency={currency}
                  barLabel={barLabel}
                  lineLabel={lineLabel}
                />
              }
              cursor={{ fill: "rgba(144, 252, 166, 0.1)" }}
            />

            {/* Legend */}
            {showLegend && (
              <Legend
                wrapperStyle={{ paddingTop: 16 }}
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span className="text-xs text-slate-600 ml-1">{value}</span>
                )}
              />
            )}

            {/* Budget Reference Line */}
            {budgetLine && (
              <ReferenceLine
                y={budgetLine}
                stroke={secondLineColor}
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{
                  value: budgetLabel,
                  position: "right",
                  fill: secondLineColor,
                  fontSize: 11,
                  fontWeight: 500,
                }}
              />
            )}

            {/* Area fill under line (optional) */}
            {showAreaFill && (
              <Area
                type="monotone"
                dataKey="lineValue"
                fill={lineColor}
                fillOpacity={0.1}
                stroke="none"
              />
            )}

            {/* Secondary Bar (stacked) */}
            {data.some((d) => d.secondaryValue !== undefined) && (
              <Bar
                dataKey="secondaryValue"
                stackId="stack"
                fill={secondaryBarColor}
                radius={[0, 0, 0, 0]}
                name="Secondary"
              />
            )}

            {/* Primary Bar */}
            <Bar
              dataKey="value"
              stackId="stack"
              fill={barColor}
              radius={[4, 4, 0, 0]}
              name={barLabel}
              maxBarSize={40}
            />

            {/* Primary Line (Daily Rate) */}
            <Line
              type="monotone"
              dataKey="lineValue"
              stroke={lineColor}
              strokeWidth={2.5}
              dot={false}
              activeDot={{
                r: 5,
                fill: lineColor,
                stroke: "#fff",
                strokeWidth: 2,
              }}
              name={lineLabel}
            />

            {/* Second Line (optional) */}
            {data.some((d) => d.secondLineValue !== undefined) && (
              <Line
                type="monotone"
                dataKey="secondLineValue"
                stroke={secondLineColor}
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                name="Target"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ============================================
// Preset: Monthly Cost Trend with Moving Average
// ============================================

export interface MonthlyCostTrendProps {
  /** Daily values with dates */
  dailyData: Array<{ date: string; cost: number }>
  /** Monthly budget */
  monthlyBudget?: number
  /** Currency */
  currency?: string
  /** Loading state */
  loading?: boolean
  /** Custom class name */
  className?: string
}

export function MonthlyCostTrendChart({
  dailyData,
  monthlyBudget,
  currency = "USD",
  loading = false,
  className,
}: MonthlyCostTrendProps) {
  const chartData = useMemo(() => {
    return dailyData.slice(-30).map((d, index, arr) => {
      // Calculate 7-day moving average
      const windowStart = Math.max(0, index - 6)
      const windowData = arr.slice(windowStart, index + 1)
      const movingAvg = windowData.reduce((sum, item) => sum + item.cost, 0) / windowData.length

      const date = new Date(d.date)
      return {
        label: date.getDate().toString(),
        value: d.cost,
        lineValue: movingAvg,
        date: d.date,
      }
    })
  }, [dailyData])

  // Calculate daily budget from monthly
  const daysInMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0
  ).getDate()
  const dailyBudget = monthlyBudget ? monthlyBudget / daysInMonth : undefined

  return (
    <CostComboChart
      title="Daily Cost Trend"
      subtitle="Last 30 days with 7-day moving average"
      data={chartData}
      currency={currency}
      barColor="#90FCA6"
      lineColor="#FF6C5E"
      budgetLine={dailyBudget}
      budgetLabel="Daily Budget"
      barLabel="Daily Cost"
      lineLabel="7-Day Avg"
      loading={loading}
      className={className}
      height={320}
      showAreaFill
    />
  )
}

// ============================================
// Preset: Provider Cost Comparison
// ============================================

export interface ProviderCostComparisonProps {
  /** Monthly provider costs */
  providerData: Array<{
    month: string
    values: Record<string, number>
  }>
  /** Providers to display */
  providers: string[]
  /** Provider colors */
  colors?: Record<string, string>
  /** Currency */
  currency?: string
  /** Loading state */
  loading?: boolean
  /** Custom class name */
  className?: string
}

export function ProviderCostComparisonChart({
  providerData,
  providers,
  colors = {},
  currency = "USD",
  loading = false,
  className,
}: ProviderCostComparisonProps) {
  const defaultColors = ["#10A37F", "#4285F4", "#FF6C5E", "#7C3AED", "#FF9900"]

  const chartData = useMemo(() => {
    return providerData.map((d) => {
      const total = Object.values(d.values).reduce((sum, v) => sum + v, 0)
      return {
        label: d.month,
        value: d.values[providers[0]] ?? 0,
        secondaryValue: providers.slice(1).reduce((sum, p) => sum + (d.values[p] ?? 0), 0),
        lineValue: total,
      }
    })
  }, [providerData, providers])

  return (
    <CostComboChart
      title="Provider Cost Trend"
      subtitle="Monthly breakdown by provider"
      data={chartData}
      currency={currency}
      barColor={colors[providers[0]] || defaultColors[0]}
      secondaryBarColor={colors[providers[1]] || defaultColors[1]}
      lineColor="#FF6C5E"
      barLabel={providers[0] || "Primary"}
      lineLabel="Total"
      loading={loading}
      className={className}
      height={320}
    />
  )
}

// ============================================
// Preset: Week Over Week Comparison
// ============================================

export interface WeekComparisonProps {
  /** This week's daily values */
  thisWeek: number[]
  /** Last week's daily values */
  lastWeek: number[]
  /** Currency */
  currency?: string
  /** Loading state */
  loading?: boolean
  /** Custom class name */
  className?: string
}

export function WeekComparisonChart({
  thisWeek,
  lastWeek,
  currency = "USD",
  loading = false,
  className,
}: WeekComparisonProps) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  const chartData = useMemo(() => {
    return days.map((day, index) => ({
      label: day,
      value: thisWeek[index] ?? 0,
      lineValue: lastWeek[index] ?? 0,
    }))
  }, [thisWeek, lastWeek])

  return (
    <CostComboChart
      title="Week Comparison"
      subtitle="This week vs last week"
      data={chartData}
      currency={currency}
      barColor="#90FCA6"
      lineColor="#94A3B8"
      barLabel="This Week"
      lineLabel="Last Week"
      loading={loading}
      className={className}
      height={280}
    />
  )
}
