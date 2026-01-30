"use client"

/**
 * Metric Sparkline
 *
 * Compact sparkline chart for metric cards showing trends.
 * Integrates with CostDataContext for automatic data.
 *
 * ENT-001: Wrapped with ChartErrorBoundary for resilience
 * DATA-001: Safe number handling for edge cases
 */

import React, { useMemo } from "react"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { useCostData, type TimeRange } from "@/contexts/cost-data-context"
import { useChartConfig } from "../provider/chart-provider"
import { TrendSparkline } from "../base/sparkline"
import { Card, CardContent } from "@/components/ui/card"
import { ChartErrorBoundary } from "../chart-error-boundary"

// ============================================
// Types
// ============================================

export interface MetricSparklineProps {
  /** Metric title */
  title: string
  /** Current value (if manual) */
  value?: number
  /** Previous value for comparison */
  previousValue?: number
  /** Trend data points (if manual) */
  data?: number[]
  /** Auto-load from category */
  category?: "genai" | "cloud" | "subscription" | "total"
  /** Time range for data */
  timeRange?: TimeRange
  /** Color override */
  color?: string
  /** Show percentage change */
  showChange?: boolean
  /** Invert trend direction (lower is better) */
  invertTrend?: boolean
  /** Sparkline height */
  sparklineHeight?: number
  /** Show area fill */
  showArea?: boolean
  /** Compact mode (smaller padding) */
  compact?: boolean
  /** Loading state */
  loading?: boolean
  /** Click handler */
  onClick?: () => void
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

// ============================================
// Component
// ============================================

function MetricSparklineInner({
  title,
  value: propValue,
  previousValue: propPreviousValue,
  data: propData,
  category,
  timeRange: _timeRange = "30",
  color: _color,
  showChange = true,
  invertTrend = false,
  sparklineHeight = 32,
  showArea = true,
  compact = false,
  loading: propLoading,
  onClick,
  className,
}: MetricSparklineProps) {
  const { formatValue, formatValueCompact, isLoading: contextLoading } = useChartConfig()
  const costData = useCostData()

  // Get data from context if category specified
  // DATA-001: Apply safeNumber to all values
  const { trendData, currentValue, previousValue } = useMemo(() => {
    if (propData && propValue !== undefined) {
      return {
        trendData: propData.map(safeNumber),
        currentValue: safeNumber(propValue),
        previousValue: propPreviousValue !== undefined ? safeNumber(propPreviousValue) : undefined,
      }
    }

    // Get trend data using context's unified filters
    if (category) {
      const timeSeries = costData.getFilteredTimeSeries()
      const values = timeSeries.map((d: { date: string; total: number }) => safeNumber(d.total))

      const current = values.length > 0 ? values[values.length - 1] : 0
      const previous = values.length > 0 ? values[0] : 0

      if (values.length > 0) {
        return {
          trendData: values,
          currentValue: current,
          previousValue: previous,
        }
      }
    }

    // Fallback to total costs from context
    if (category && costData.totalCosts) {
      let current = 0
      if (category === "total") {
        current = safeNumber(costData.totalCosts.total?.total_monthly_cost)
      } else {
        current = safeNumber(costData.totalCosts[category]?.total_monthly_cost)
      }

      return {
        trendData: [],
        currentValue: current,
        previousValue: undefined,
      }
    }

    return {
      trendData: propData?.map(safeNumber) || [],
      currentValue: safeNumber(propValue),
      previousValue: propPreviousValue !== undefined ? safeNumber(propPreviousValue) : undefined,
    }
  }, [propData, propValue, propPreviousValue, category, costData])

  // Calculate percentage change
  const percentChange = useMemo(() => {
    if (previousValue === undefined || previousValue === 0) return null
    return ((currentValue - previousValue) / previousValue) * 100
  }, [currentValue, previousValue])

  // Determine trend direction
  const trendDirection = useMemo(() => {
    if (percentChange === null) return "neutral"
    if (Math.abs(percentChange) < 1) return "neutral"
    return percentChange > 0 ? "up" : "down"
  }, [percentChange])

  // Loading state
  const isLoading = propLoading ?? contextLoading

  // Loading skeleton
  if (isLoading) {
    return (
      <Card className={cn(
        "overflow-hidden",
        compact ? "p-3" : "p-4",
        onClick && "cursor-pointer",
        className
      )}>
        <CardContent className="p-0">
          <div className="animate-pulse">
            <div className="h-3 w-20 bg-slate-200 rounded mb-2" />
            <div className="h-6 w-24 bg-slate-200 rounded mb-2" />
            <div className="h-8 bg-slate-100 rounded" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      className={cn(
        "overflow-hidden transition-all duration-200",
        compact ? "p-3" : "p-4",
        onClick && "cursor-pointer hover:shadow-md hover:-translate-y-0.5",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-0">
        {/* Title */}
        <p className="text-xs font-medium text-slate-500 mb-1">
          {title}
        </p>

        {/* Value and change */}
        <div className="flex items-end justify-between mb-2">
          <span className="text-xl font-bold text-slate-900 tabular-nums">
            {compact ? formatValueCompact(currentValue) : formatValue(currentValue)}
          </span>

          {showChange && percentChange !== null && (
            <div className={cn(
              "flex items-center gap-0.5 text-xs font-medium",
              trendDirection === "neutral" && "text-slate-400",
              trendDirection === "up" && (invertTrend ? "text-coral-500" : "text-emerald-500"),
              trendDirection === "down" && (invertTrend ? "text-emerald-500" : "text-coral-500"),
            )}>
              {trendDirection === "up" && <TrendingUp className="h-3 w-3" />}
              {trendDirection === "down" && <TrendingDown className="h-3 w-3" />}
              {trendDirection === "neutral" && <Minus className="h-3 w-3" />}
              <span>{Math.abs(percentChange).toFixed(1)}%</span>
            </div>
          )}
        </div>

        {/* Sparkline */}
        {trendData.length > 1 && (
          <TrendSparkline
            data={trendData}
            height={sparklineHeight}
            showArea={showArea}
            invertColors={invertTrend}
          />
        )}
      </CardContent>
    </Card>
  )
}

/**
 * ENT-001: Wrapped component with error boundary for resilience
 * Prevents chart crashes from affecting the entire dashboard
 */
export function MetricSparkline(props: MetricSparklineProps) {
  return (
    <ChartErrorBoundary chartTitle={props.title} minHeight={props.sparklineHeight ?? 32}>
      <MetricSparklineInner {...props} />
    </ChartErrorBoundary>
  )
}

// ============================================
// Presets
// ============================================

/**
 * Total spend metric
 */
export function TotalSpendMetric(
  props: Omit<MetricSparklineProps, "title" | "category" | "invertTrend">
) {
  return (
    <MetricSparkline
      title="Total Spend"
      category="total"
      invertTrend={true}
      {...props}
    />
  )
}

/**
 * GenAI spend metric
 */
export function GenAISpendMetric(
  props: Omit<MetricSparklineProps, "title" | "category" | "invertTrend">
) {
  return (
    <MetricSparkline
      title="GenAI Spend"
      category="genai"
      invertTrend={true}
      {...props}
    />
  )
}

/**
 * Cloud spend metric
 */
export function CloudSpendMetric(
  props: Omit<MetricSparklineProps, "title" | "category" | "invertTrend">
) {
  return (
    <MetricSparkline
      title="Cloud Spend"
      category="cloud"
      invertTrend={true}
      {...props}
    />
  )
}

/**
 * Subscription spend metric
 */
export function SubscriptionSpendMetric(
  props: Omit<MetricSparklineProps, "title" | "category" | "invertTrend">
) {
  return (
    <MetricSparkline
      title="Subscriptions"
      category="subscription"
      invertTrend={true}
      {...props}
    />
  )
}

// ============================================
// Score Card Grid
// ============================================

export interface MetricGridProps {
  /** Show all 4 category metrics */
  showAll?: boolean
  /** Custom metrics */
  metrics?: MetricSparklineProps[]
  /** Time range for all metrics */
  timeRange?: TimeRange
  /** Compact mode */
  compact?: boolean
  /** Additional class names */
  className?: string
}

export function MetricGrid({
  showAll = true,
  metrics,
  timeRange = "30",
  compact = false,
  className,
}: MetricGridProps) {
  const defaultMetrics = useMemo<MetricSparklineProps[]>(() => [
    { title: "Total Spend", category: "total", invertTrend: true, timeRange },
    { title: "GenAI", category: "genai", invertTrend: true, timeRange },
    { title: "Cloud", category: "cloud", invertTrend: true, timeRange },
    { title: "Subscriptions", category: "subscription", invertTrend: true, timeRange },
  ], [timeRange])

  const displayMetrics = metrics || (showAll ? defaultMetrics : [])

  return (
    <div className={cn(
      "grid gap-3 sm:gap-4",
      displayMetrics.length === 4 && "grid-cols-2 lg:grid-cols-4",
      displayMetrics.length === 3 && "grid-cols-1 sm:grid-cols-3",
      displayMetrics.length === 2 && "grid-cols-1 sm:grid-cols-2",
      className
    )}>
      {displayMetrics.map((metric, index) => (
        <MetricSparkline
          key={metric.title || index}
          compact={compact}
          {...metric}
        />
      ))}
    </div>
  )
}
