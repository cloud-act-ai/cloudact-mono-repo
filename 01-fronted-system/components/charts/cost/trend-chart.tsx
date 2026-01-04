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
  category,
  timeRange: propTimeRange,
  customRange: propCustomRange,
  data: propData,
  showBars = true,
  barColor,
  barLabel = "Daily Cost",
  showLine = true,
  lineColor,
  lineLabel = "7-day Avg",
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
  const { theme, timeRange: contextTimeRange, customRange: contextCustomRange } = useChartConfig()
  const costData = useCostData()

  // Determine time range
  const timeRange = propTimeRange || contextTimeRange
  const customRange = propCustomRange || contextCustomRange

  // Get data from context or use provided data
  const chartData = useMemo(() => {
    if (propData) return propData

    // Get from context
    const trendData = costData.getDailyTrendForRange(timeRange, category, customRange)

    return trendData.map((point) => ({
      date: point.date,
      label: point.label,
      value: point.value,
      rollingAvg: point.rollingAvg,
    }))
  }, [propData, costData, timeRange, category, customRange])

  // Determine loading state
  const isLoading = propLoading ?? costData.isLoading

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
 * Monthly cost trend with 7-day rolling average
 */
export function MonthlyCostTrend(
  props: Omit<CostTrendChartProps, "title" | "timeRange">
) {
  return (
    <CostTrendChart
      title="Monthly Cost Trend"
      subtitle="Daily spend with 7-day rolling average"
      timeRange="30"
      {...props}
    />
  )
}

/**
 * Quarterly cost trend with 14-day rolling average
 */
export function QuarterlyCostTrend(
  props: Omit<CostTrendChartProps, "title" | "timeRange" | "lineLabel">
) {
  return (
    <CostTrendChart
      title="Quarterly Cost Trend"
      subtitle="Daily spend with 14-day rolling average"
      timeRange="90"
      lineLabel="14-day Avg"
      {...props}
    />
  )
}

/**
 * Year-to-date cost trend with 30-day rolling average
 */
export function YearCostTrend(
  props: Omit<CostTrendChartProps, "title" | "timeRange" | "lineLabel">
) {
  return (
    <CostTrendChart
      title="Annual Cost Trend"
      subtitle="Daily spend with 30-day rolling average"
      timeRange="365"
      lineLabel="30-day Avg"
      enableZoom={true}
      {...props}
    />
  )
}
