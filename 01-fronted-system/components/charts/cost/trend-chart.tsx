"use client"

/**
 * Cost Trend Chart
 *
 * Time-series chart for cost data with:
 * - Daily cost bars
 * - Rolling average line
 * - Budget reference line
 * - Zoom/brush functionality synced with time filter
 */

import React, { useMemo } from "react"
import { cn } from "@/lib/utils"
import { useCostData, type TimeRange, type CustomDateRange } from "@/contexts/cost-data-context"
import { useChartConfig } from "../provider/chart-provider"
import { BaseComboChart, type SeriesConfig } from "../base/combo-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// ============================================
// Types
// ============================================

export interface CostTrendDataPoint {
  date: string
  label: string
  value: number
  rollingAvg?: number
  [key: string]: unknown
}

export interface CostTrendChartProps {
  /** Card title */
  title: string
  /** Card subtitle */
  subtitle?: string
  /** Cost category to filter */
  category?: "genai" | "cloud" | "subscription"
  /** Time range override */
  timeRange?: TimeRange
  /** Custom date range */
  customRange?: CustomDateRange
  /** Manual data (bypasses context) */
  data?: CostTrendDataPoint[]
  /** Show daily cost bars */
  showBars?: boolean
  /** Bar color */
  barColor?: string
  /** Bar label */
  barLabel?: string
  /** Show rolling average line */
  showLine?: boolean
  /** Line color */
  lineColor?: string
  /** Line label */
  lineLabel?: string
  /** Show area fill under line */
  showAreaFill?: boolean
  /** Budget/reference line value */
  budgetLine?: number
  /** Budget line label */
  budgetLabel?: string
  /** Enable zoom/brush */
  enableZoom?: boolean
  /** Chart height (desktop) */
  height?: number
  /** Chart height for mobile (optional, defaults to height - 80) */
  mobileHeight?: number
  /** Show legend */
  showLegend?: boolean
  /** Loading state override */
  loading?: boolean
  /** Additional class names */
  className?: string
}

// ============================================
// Component
// ============================================

export function CostTrendChart({
  title,
  subtitle,
  category: _category,
  timeRange: _propTimeRange,
  customRange: _propCustomRange,
  data: propData,
  showBars = true,
  barColor,
  barLabel = "Daily Cost",
  showLine = true,
  lineColor,
  lineLabel = "Avg Daily",
  showAreaFill = true,
  budgetLine,
  budgetLabel = "Budget",
  enableZoom = false,
  height = 320,
  mobileHeight,
  showLegend = true,
  loading: propLoading,
  className,
}: CostTrendChartProps) {
  // Responsive height - use CSS media query approach
  const responsiveHeight = mobileHeight ?? Math.max(height - 80, 200)
  const { theme } = useChartConfig()
  // PERF-001 FIX: Destructure only needed values to prevent unnecessary re-renders
  const { getFilteredTimeSeries, isLoading: contextLoading } = useCostData()

  // Get data from context or use provided data
  // PERF-001 FIX: Depend on cacheVersion instead of entire costData object
  const chartData = useMemo(() => {
    if (propData) return propData

    // Get from context using unified filters
    const timeSeries = getFilteredTimeSeries()

    // Calculate rolling average (period average as flat reference line)
    const totalCost = timeSeries.reduce((sum: number, d: { date: string; total: number }) => {
      // DATA-001 FIX: Validate number before adding
      const value = d.total
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
    const avgDaily = timeSeries.length > 0 ? totalCost / timeSeries.length : 0
    const rollingAvg = Number.isFinite(avgDaily) ? Math.round(avgDaily * 100) / 100 : 0

    return timeSeries.map((point: { date: string; total: number }) => {
      const date = new Date(point.date)
      const value = Number.isFinite(point.total) ? point.total : 0
      return {
        date: point.date,
        // LOCALE-001 FIX: Use undefined to respect user's browser locale
        label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        value,
        rollingAvg,
      }
    })
  }, [propData, getFilteredTimeSeries])

  // Determine loading state
  const isLoading = propLoading ?? contextLoading

  // Build series config
  const series = useMemo<SeriesConfig[]>(() => {
    const result: SeriesConfig[] = []

    if (showBars) {
      result.push({
        type: "bar",
        dataKey: "value",
        name: barLabel,
        color: barColor || theme.primary,
        radius: [4, 4, 0, 0],
        maxBarSize: 40,
      })
    }

    if (showLine) {
      result.push({
        type: "line",
        dataKey: "rollingAvg",
        name: lineLabel,
        color: lineColor || theme.accent,
        strokeWidth: 2,
        showArea: showAreaFill,
        areaOpacity: 0.15,
      })
    }

    return result
  }, [showBars, showLine, barLabel, lineLabel, barColor, lineColor, showAreaFill, theme])

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-[15px] sm:text-[17px] font-bold text-slate-900">
          {title}
        </CardTitle>
        {subtitle && (
          <p className="text-xs sm:text-sm text-slate-500">{subtitle}</p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {/* Mobile-responsive chart wrapper */}
        <div className="block sm:hidden">
          <BaseComboChart
            data={chartData}
            xAxisKey="label"
            series={series}
            height={responsiveHeight}
            showGrid={true}
            showLegend={showLegend}
            compactLegend={true}
            referenceLine={budgetLine}
            referenceLineLabel={budgetLabel}
            enableZoom={enableZoom}
            loading={isLoading}
            emptyMessage="No cost data available for this period"
          />
        </div>
        {/* Desktop chart */}
        <div className="hidden sm:block">
          <BaseComboChart
            data={chartData}
            xAxisKey="label"
            series={series}
            height={height}
            showGrid={true}
            showLegend={showLegend}
            compactLegend={true}
            referenceLine={budgetLine}
            referenceLineLabel={budgetLabel}
            enableZoom={enableZoom}
            loading={isLoading}
            emptyMessage="No cost data available for this period"
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================
// Presets
// ============================================

/**
 * Monthly cost trend with average daily line
 */
export function MonthlyCostTrend(
  props: Omit<CostTrendChartProps, "title" | "timeRange">
) {
  return (
    <CostTrendChart
      title="Monthly Cost Trend"
      subtitle="Daily spend with average daily reference"
      timeRange="30"
      {...props}
    />
  )
}

/**
 * Quarterly cost trend with average daily line
 */
export function QuarterlyCostTrend(
  props: Omit<CostTrendChartProps, "title" | "timeRange">
) {
  return (
    <CostTrendChart
      title="Quarterly Cost Trend"
      subtitle="Daily spend with average daily reference"
      timeRange="90"
      {...props}
    />
  )
}

/**
 * Year-to-date cost trend with average daily line
 */
export function YearCostTrend(
  props: Omit<CostTrendChartProps, "title" | "timeRange">
) {
  return (
    <CostTrendChart
      title="Annual Cost Trend"
      subtitle="Daily spend with average daily reference"
      timeRange="365"
      enableZoom={true}
      {...props}
    />
  )
}
