"use client"

/**
 * Daily Cost Chart
 *
 * Vertical bar chart for daily cost breakdown.
 * Shows individual day costs with optional comparison.
 */

import React, { useMemo } from "react"
import { cn } from "@/lib/utils"
import { useCostData, type TimeRange, type CustomDateRange } from "@/contexts/cost-data-context"
import { useChartConfig, getCategoryColor } from "../provider/chart-provider"
import { BaseBarChart, type BarConfig } from "../base/bar-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// ============================================
// Types
// ============================================

export interface DailyDataPoint {
  date: string
  label: string
  value: number
  genai?: number
  cloud?: number
  subscription?: number
}

export interface DailyCostChartProps {
  /** Card title */
  title: string
  /** Card subtitle */
  subtitle?: string
  /** Time range override */
  timeRange?: TimeRange
  /** Custom date range */
  customRange?: CustomDateRange
  /** Manual data (bypasses context) */
  data?: DailyDataPoint[]
  /** Show stacked by category */
  stacked?: boolean
  /** Show only specific category */
  category?: "genai" | "cloud" | "subscription"
  /** Bar color (for non-stacked) */
  barColor?: string
  /** Chart height */
  height?: number
  /** Show legend */
  showLegend?: boolean
  /** Click handler */
  onBarClick?: (data: DailyDataPoint, index: number) => void
  /** Loading state override */
  loading?: boolean
  /** Empty message */
  emptyMessage?: string
  /** Additional class names */
  className?: string
}

// ============================================
// Component
// ============================================

export function DailyCostChart({
  title,
  subtitle,
  timeRange: propTimeRange,
  customRange: propCustomRange,
  data: propData,
  stacked = false,
  category,
  barColor,
  height = 280,
  showLegend = true,
  onBarClick,
  loading: propLoading,
  emptyMessage,
  className,
}: DailyCostChartProps) {
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

    // If stacked, we need category breakdown per day
    // Note: If the context data doesn't have category breakdown, stacked mode falls back to single bar
    if (stacked) {
      return trendData.map((point) => ({
        date: point.date,
        label: point.label,
        value: point.value,
        // Category breakdowns may not be available from context
        genai: (point as DailyDataPoint).genai || 0,
        cloud: (point as DailyDataPoint).cloud || 0,
        subscription: (point as DailyDataPoint).subscription || 0,
      }))
    }

    return trendData.map((point) => ({
      date: point.date,
      label: point.label,
      value: point.value,
    }))
  }, [propData, costData, timeRange, category, customRange, stacked])

  // Determine loading state
  const isLoading = propLoading ?? costData.isLoading

  // Build bar config
  const bars = useMemo<BarConfig[]>(() => {
    if (stacked) {
      return [
        {
          dataKey: "genai",
          name: "GenAI",
          color: getCategoryColor("genai", theme),
          stackId: "cost",
          radius: [0, 0, 0, 0],
        },
        {
          dataKey: "cloud",
          name: "Cloud",
          color: getCategoryColor("cloud", theme),
          stackId: "cost",
          radius: [0, 0, 0, 0],
        },
        {
          dataKey: "subscription",
          name: "Subscriptions",
          color: getCategoryColor("subscription", theme),
          stackId: "cost",
          radius: [4, 4, 0, 0],
        },
      ]
    }

    // Single bar for category or total
    const color = category
      ? getCategoryColor(category, theme)
      : barColor || theme.primary

    return [{
      dataKey: "value",
      name: category ? category.charAt(0).toUpperCase() + category.slice(1) : "Daily Cost",
      color,
      radius: [4, 4, 0, 0],
      maxBarSize: 40,
    }]
  }, [stacked, category, barColor, theme])

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-[17px] font-bold text-slate-900">
          {title}
        </CardTitle>
        {subtitle && (
          <p className="text-sm text-slate-500">{subtitle}</p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <BaseBarChart
          data={chartData}
          xAxisKey="label"
          bars={bars}
          stacked={stacked}
          height={height}
          showGrid={true}
          showLegend={showLegend && stacked}
          onBarClick={onBarClick ? (data, _, index) => onBarClick(data as DailyDataPoint, index) : undefined}
          loading={isLoading}
          emptyMessage={emptyMessage || "No daily cost data available"}
        />
      </CardContent>
    </Card>
  )
}

// ============================================
// Presets
// ============================================

/**
 * Weekly cost breakdown (7 days)
 */
export function WeeklyCostChart(
  props: Omit<DailyCostChartProps, "title" | "timeRange">
) {
  return (
    <DailyCostChart
      title="This Week"
      subtitle="Daily spend breakdown"
      timeRange="7"
      {...props}
    />
  )
}

/**
 * Monthly cost breakdown (30 days)
 */
export function MonthlyCostChart(
  props: Omit<DailyCostChartProps, "title" | "timeRange">
) {
  return (
    <DailyCostChart
      title="This Month"
      subtitle="Daily spend breakdown"
      timeRange="30"
      {...props}
    />
  )
}

/**
 * Category stacked daily chart
 */
export function StackedDailyChart(
  props: Omit<DailyCostChartProps, "title" | "stacked">
) {
  return (
    <DailyCostChart
      title="Daily Spend by Category"
      stacked={true}
      {...props}
    />
  )
}
