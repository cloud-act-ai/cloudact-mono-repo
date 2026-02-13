"use client"

/**
 * Daily Cost Trend Chart (Simple Bar + Line)
 *
 * Clean bar+line chart for Executive Dashboard:
 * - Bars: Daily/Weekly/Monthly cost spend (smart aggregation)
 * - Line: Rolling average trend
 * - SMART-AXIS: Auto-groups data based on time range
 *   - ≤30 days → Daily
 *   - 31-90 days → Weekly
 *   - >90 days → Monthly
 * - Respects global cost filters
 * - CloudAct brand colors
 *
 * ENT-001: Wrapped with ChartErrorBoundary for resilience
 * A11Y-001: WCAG 2.1 AA compliant with proper ARIA labels
 * PERF-001: Memoized calculations to prevent re-renders
 * SMART-001: Adaptive time bucketing for optimal visualization
 */

import { useMemo, useId } from "react"
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useChartConfig, getCategoryChartColors } from "../provider/chart-provider"
import { ChartTooltip } from "../shared/tooltip"
import { CompactLegend } from "../shared/legend"
import { ChartSkeleton } from "../shared/skeleton"
import { ChartEmptyState } from "../shared/empty-state"
import { ChartErrorBoundary } from "../chart-error-boundary"

// ============================================
// Types
// ============================================

/** Time range values from cost-data-context */
export type ChartTimeRange = "7" | "14" | "30" | "90" | "365" | "mtd" | "ytd" | "custom" | string

/** Aggregation bucket type based on time range */
export type AggregationType = "daily" | "weekly" | "monthly"

export interface DailyTrendDataPoint {
  date: string
  label: string
  value: number
}

export interface AggregatedDataPoint {
  bucketKey: string    // ISO date string for bucket start
  label: string        // Display label (e.g., "Jan 15", "Week 3", "January")
  value: number        // Sum of values in bucket
  count: number        // Number of data points in bucket
  rollingAvg?: number  // Rolling average (calculated later)
}

export interface DailyTrendChartProps {
  /** Chart title */
  title: string
  /** Chart subtitle */
  subtitle?: string
  /** Chart data (already filtered by context) */
  data: DailyTrendDataPoint[]
  /** Selected time range - enables smart aggregation */
  timeRange?: ChartTimeRange
  /** Cost category - resolves bar/line colors from theme */
  category?: "genai" | "cloud" | "subscription"
  /** Bar color override (falls back to category → theme) */
  barColor?: string
  /** Line color override (falls back to category → theme) */
  lineColor?: string
  /** Rolling average window (in buckets, not days) */
  rollingWindow?: number
  /** Chart height */
  height?: number
  /** Mobile chart height */
  mobileHeight?: number
  /** Show legend */
  showLegend?: boolean
  /** Loading state */
  loading?: boolean
  /** Additional class names */
  className?: string
}

// ============================================
// Helpers
// ============================================

/**
 * DATA-001: Safe number extraction that handles NaN/Infinity/null/undefined
 */
function safeNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return value
}

/**
 * SMART-001: Determine aggregation type based on time range
 * - ≤30 days → daily (show each day)
 * - 31-90 days → weekly (group by week)
 * - >90 days → monthly (group by month)
 */
function getAggregationType(timeRange: ChartTimeRange | undefined, dataLength: number): AggregationType {
  // Parse numeric time ranges
  const days = timeRange ? parseInt(timeRange, 10) : dataLength
  const effectiveDays = Number.isNaN(days) ? dataLength : days

  // Handle named ranges
  if (timeRange === "mtd") {
    const today = new Date()
    return today.getDate() <= 30 ? "daily" : "weekly"
  }
  if (timeRange === "ytd") {
    return "monthly"
  }

  // Numeric ranges
  if (effectiveDays <= 30) return "daily"
  if (effectiveDays <= 90) return "weekly"
  return "monthly"
}

/**
 * Get the bucket key for a date based on aggregation type
 */
function getBucketKey(dateStr: string, aggregationType: AggregationType): string {
  const date = new Date(dateStr)

  switch (aggregationType) {
    case "daily":
      return dateStr // Use date as-is

    case "weekly": {
      // Get Monday of the week (ISO week)
      const day = date.getDay()
      const diff = date.getDate() - day + (day === 0 ? -6 : 1) // Adjust for Sunday
      const monday = new Date(date)
      monday.setDate(diff)
      return monday.toISOString().split("T")[0]
    }

    case "monthly": {
      // First day of month
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`
    }
  }
}

/**
 * Format bucket label based on aggregation type
 */
function formatBucketLabel(bucketKey: string, aggregationType: AggregationType): string {
  const date = new Date(bucketKey)

  switch (aggregationType) {
    case "daily":
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })

    case "weekly": {
      // Show "Week of Jan 15" or "Jan 15-21"
      const endDate = new Date(date)
      endDate.setDate(endDate.getDate() + 6)
      const startLabel = date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      const endLabel = date.getMonth() === endDate.getMonth()
        ? endDate.getDate().toString()
        : endDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      return `${startLabel}-${endLabel}`
    }

    case "monthly":
      return date.toLocaleDateString(undefined, { month: "short", year: "2-digit" })
  }
}

/**
 * SMART-001: Aggregate data into time buckets
 * Groups data by day/week/month and sums values
 */
function aggregateData(
  data: DailyTrendDataPoint[],
  aggregationType: AggregationType
): AggregatedDataPoint[] {
  if (!data || data.length === 0) return []

  // Group by bucket
  const buckets = new Map<string, { sum: number; count: number }>()

  for (const point of data) {
    const bucketKey = getBucketKey(point.date, aggregationType)
    const existing = buckets.get(bucketKey) || { sum: 0, count: 0 }
    existing.sum += safeNumber(point.value)
    existing.count += 1
    buckets.set(bucketKey, existing)
  }

  // Convert to array and sort by date
  const result: AggregatedDataPoint[] = []
  const sortedKeys = Array.from(buckets.keys()).sort()

  for (const bucketKey of sortedKeys) {
    const bucket = buckets.get(bucketKey)!
    result.push({
      bucketKey,
      label: formatBucketLabel(bucketKey, aggregationType),
      value: Math.round(bucket.sum * 100) / 100,
      count: bucket.count,
    })
  }

  return result
}

/**
 * Calculate rolling average on aggregated data
 * PERF-001: Optimized with single pass calculation
 * DATA-001: Safe number handling for edge cases
 */
function calculateRollingAverage(
  data: AggregatedDataPoint[],
  windowSize: number
): AggregatedDataPoint[] {
  if (!data || data.length === 0) return []

  // Use the window size directly (already adaptive based on aggregation type)
  // Only cap it if data is too short
  const effectiveWindow = Math.min(windowSize, data.length)

  // PERF-001: Use sliding window for O(n) instead of O(n*w)
  let windowSum = 0
  const result: AggregatedDataPoint[] = []

  for (let i = 0; i < data.length; i++) {
    const currentValue = safeNumber(data[i].value)
    windowSum += currentValue

    // Remove oldest value from window if window is full
    if (i >= effectiveWindow) {
      windowSum -= safeNumber(data[i - effectiveWindow].value)
    }

    // Calculate average for current window
    const windowLength = Math.min(i + 1, effectiveWindow)
    const avg = windowLength > 0 ? windowSum / windowLength : 0

    result.push({
      ...data[i],
      value: currentValue, // Ensure value is safe
      rollingAvg: Math.round(avg * 100) / 100,
    })
  }

  return result
}

/**
 * Get the label for the aggregation type
 */
function getAggregationLabel(aggregationType: AggregationType): string {
  switch (aggregationType) {
    case "daily": return "Daily"
    case "weekly": return "Weekly"
    case "monthly": return "Monthly"
  }
}

/**
 * SMART-001: Get adaptive rolling window based on aggregation type
 * - Daily: 7-day rolling average
 * - Weekly: 4-week rolling average (~1 month)
 * - Monthly: 3-month rolling average (~1 quarter)
 */
function getAdaptiveRollingWindow(aggregationType: AggregationType): number {
  switch (aggregationType) {
    case "daily": return 7      // 7-day avg
    case "weekly": return 4     // 4-week avg (~1 month)
    case "monthly": return 3    // 3-month avg (~1 quarter)
  }
}

/**
 * Get rolling average label based on aggregation type
 */
function getRollingAvgLabel(aggregationType: AggregationType, window: number): string {
  switch (aggregationType) {
    case "daily": return `${window}-Day Avg`
    case "weekly": return `${window}-Week Avg`
    case "monthly": return `${window}-Month Avg`
  }
}

// ============================================
// Component
// ============================================

function DailyTrendChartInner({
  title,
  subtitle,
  data,
  timeRange,
  category,
  barColor,
  lineColor,
  rollingWindow = 7,
  height = 300,
  mobileHeight,
  showLegend = true,
  loading = false,
  className,
}: DailyTrendChartProps) {
  const { formatValueCompact, theme } = useChartConfig()

  // Resolve colors: explicit prop > category from theme > default (genai)
  const categoryColors = getCategoryChartColors(category, theme)
  const resolvedBarColor = barColor || categoryColors.bar
  const resolvedLineColor = lineColor || categoryColors.line
  const responsiveHeight = mobileHeight ?? Math.max(height - 60, 200)
  const chartId = useId() // A11Y-001: Unique ID for ARIA relationships

  // SMART-001: Determine aggregation type based on time range
  const aggregationType = useMemo(
    () => getAggregationType(timeRange, data?.length || 0),
    [timeRange, data?.length]
  )

  // SMART-001: Get adaptive rolling window based on aggregation type
  const adaptiveWindow = useMemo(
    () => getAdaptiveRollingWindow(aggregationType),
    [aggregationType]
  )

  // SMART-001: Aggregate data based on time range, then calculate rolling average
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return []

    // First aggregate (daily/weekly/monthly)
    const aggregated = aggregateData(data, aggregationType)

    // Then calculate rolling average on aggregated data with adaptive window
    return calculateRollingAverage(aggregated, adaptiveWindow)
  }, [data, aggregationType, adaptiveWindow])

  // Dynamic legend based on aggregation type
  const aggregationLabel = getAggregationLabel(aggregationType)
  const avgLabel = getRollingAvgLabel(aggregationType, adaptiveWindow)

  // Legend items
  const legendItems = useMemo(
    () => [
      { name: `${aggregationLabel} Cost`, color: resolvedBarColor },
      { name: avgLabel, color: resolvedLineColor },
    ],
    [resolvedBarColor, resolvedLineColor, aggregationLabel, avgLabel]
  )

  // Loading state
  if (loading) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-[14px] sm:text-[16px] font-bold text-[var(--text-primary)]">
            {title}
          </CardTitle>
          {subtitle && (
            <p className="text-xs sm:text-sm text-[var(--text-tertiary)]">{subtitle}</p>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <ChartSkeleton height={height} variant="bar" />
        </CardContent>
      </Card>
    )
  }

  // Empty state
  if (!chartData || chartData.length === 0) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-[14px] sm:text-[16px] font-bold text-[var(--text-primary)]">
            {title}
          </CardTitle>
          {subtitle && (
            <p className="text-xs sm:text-sm text-[var(--text-tertiary)]">{subtitle}</p>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <ChartEmptyState
            height={height}
            variant="bar"
            message="No cost data for this period"
          />
        </CardContent>
      </Card>
    )
  }

  // Chart content (shared between mobile/desktop)
  const renderChart = (chartHeight: number) => (
    <ResponsiveContainer width="100%" height={chartHeight} minWidth={100}>
      <ComposedChart
        data={chartData}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
        {/* Gradient for bar fill */}
        <defs>
          <linearGradient id={`barGradient-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={resolvedBarColor} stopOpacity={1} />
            <stop offset="100%" stopColor={resolvedBarColor} stopOpacity={0.6} />
          </linearGradient>
        </defs>

        {/* Subtle grid */}
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={theme.grid}
          strokeOpacity={0.5}
          vertical={false}
        />

        {/* X-axis with date labels */}
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fill: theme.mutedText, fontSize: 10 }}
          interval="preserveStartEnd"
          minTickGap={30}
        />

        {/* Y-axis with currency formatting */}
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: theme.mutedText, fontSize: 10 }}
          tickFormatter={formatValueCompact}
          width={50}
        />

        {/* Premium tooltip */}
        <Tooltip
          content={(props) => (
            <ChartTooltip
              active={props.active}
              payload={props.payload?.map((p) => ({
                name: p.name as string,
                value: p.value as number,
                color: p.color,
                dataKey: p.dataKey as string,
                payload: p.payload,
              }))}
              label={props.label as string}
            />
          )}
          cursor={{ fill: "rgba(0, 0, 0, 0.04)" }}
        />

        {/* Daily cost bars */}
        <Bar
          dataKey="value"
          name={`${aggregationLabel} Cost`}
          fill={`url(#barGradient-${chartId})`}
          radius={[4, 4, 0, 0]}
          maxBarSize={40}
          animationDuration={600}
          animationEasing="ease-out"
        />

        {/* Rolling average line */}
        <Line
          type="monotone"
          dataKey="rollingAvg"
          name={avgLabel}
          stroke={resolvedLineColor}
          strokeWidth={2.5}
          dot={false}
          activeDot={{
            r: 5,
            fill: resolvedLineColor,
            strokeWidth: 2,
            stroke: "#fff",
            style: { filter: `drop-shadow(0 0 4px ${resolvedLineColor}80)` },
          }}
          animationDuration={800}
          animationEasing="ease-out"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )

  // A11Y-001: Calculate summary for screen readers
  const totalCost = chartData.reduce((sum, d) => sum + d.value, 0)
  const avgCost = chartData.length > 0 ? totalCost / chartData.length : 0
  const a11ySummary = `${title}: Total ${formatValueCompact(totalCost)}, Average ${formatValueCompact(avgCost)} per day over ${chartData.length} days`

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle
              id={`${chartId}-title`}
              className="text-[14px] sm:text-[16px] font-bold text-[var(--text-primary)]"
            >
              {title}
            </CardTitle>
            {subtitle && (
              <p
                id={`${chartId}-desc`}
                className="text-xs sm:text-sm text-[var(--text-tertiary)] mt-0.5"
              >
                {subtitle}
              </p>
            )}
          </div>
          {/* Compact legend in header */}
          {showLegend && (
            <CompactLegend items={legendItems} className="shrink-0" />
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* A11Y-001: Screen reader summary */}
        <span className="sr-only" aria-live="polite">
          {a11ySummary}
        </span>
        {/* Mobile */}
        <div
          className="block sm:hidden"
          role="img"
          aria-labelledby={`${chartId}-title`}
          aria-describedby={subtitle ? `${chartId}-desc` : undefined}
        >
          {renderChart(responsiveHeight)}
        </div>
        {/* Desktop */}
        <div
          className="hidden sm:block"
          role="img"
          aria-labelledby={`${chartId}-title`}
          aria-describedby={subtitle ? `${chartId}-desc` : undefined}
        >
          {renderChart(height)}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * ENT-001: Wrapped component with error boundary for resilience
 * Prevents chart crashes from affecting the entire dashboard
 */
export function DailyTrendChart(props: DailyTrendChartProps) {
  return (
    <ChartErrorBoundary chartTitle={props.title} minHeight={props.height ?? 300}>
      <DailyTrendChartInner {...props} />
    </ChartErrorBoundary>
  )
}

// ============================================
// Export
// ============================================

export default DailyTrendChart
