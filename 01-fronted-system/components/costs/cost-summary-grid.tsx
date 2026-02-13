"use client"

/**
 * CostSummaryGrid - Complete cost summary section with metrics and comparison
 *
 * Combines CostMetricCards with optional period comparison.
 * Integrates with lib/costs helpers for calculations.
 */

import { CalendarDays, TrendingUp, Target, Calendar, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { CostMetricCard, CostMetricGrid } from "./cost-metric-card"
import {
  formatCost,
  formatPercent,
  getTrendArrow,
  getTrendColorClass,
} from "@/lib/costs"
import type { PeriodComparison } from "@/lib/costs"
import type { TimeRange } from "@/contexts/cost-data-context"

// ============================================
// Types
// ============================================

export interface CostSummaryData {
  /** Month-to-date total */
  mtd: number
  /** Daily rate/average */
  dailyRate: number
  /** Forecast for end of month */
  forecast: number
  /** Year-to-date total */
  ytd: number
  /** Currency code */
  currency?: string
}

export interface CostSummaryGridProps {
  /** Summary data */
  data: CostSummaryData
  /** Optional comparison data for trend indicators */
  comparison?: PeriodComparison
  /** Loading state */
  loading?: boolean
  /** Custom class name */
  className?: string
  /** Card click handler */
  onCardClick?: (metric: "mtd" | "daily" | "forecast" | "ytd") => void
  /** Current time range for dynamic labels */
  timeRange?: TimeRange
}

// ============================================
// Loading Skeleton
// ============================================

function SummarySkeleton() {
  return (
    <CostMetricGrid columns={4}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-5 animate-pulse"
        >
          <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
            <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 bg-slate-200 rounded" />
            <div className="h-3 w-16 bg-slate-200 rounded" />
          </div>
          <div className="h-7 sm:h-8 w-24 bg-slate-200 rounded mb-1" />
          <div className="h-3 w-20 bg-slate-100 rounded" />
        </div>
      ))}
    </CostMetricGrid>
  )
}

export function CostSummaryGrid({
  data,
  comparison,
  loading = false,
  className,
  onCardClick,
  timeRange,
}: CostSummaryGridProps) {
  if (loading) {
    return <SummarySkeleton />
  }

  const { mtd, dailyRate, forecast, ytd, currency = "USD" } = data

  // Calculate trend from comparison if available
  const trend = comparison
    ? {
        value: comparison.changePercent,
        direction: comparison.trend,
      }
    : undefined

  // Dynamic labels based on time range
  const isMtd = timeRange === "mtd"
  const isYtd = timeRange === "ytd"
  const isCustom = timeRange === "custom" || (timeRange && timeRange !== "mtd" && timeRange !== "ytd")

  const spendLabel = isMtd ? "MTD Spend" : isYtd ? "YTD Spend" : "Period Spend"
  const spendSubtitle = isMtd ? "This month" : isYtd ? "Year to date" : "Selected period"

  return (
    <CostMetricGrid columns={4} className={className}>
      <CostMetricCard
        icon={CalendarDays}
        label={spendLabel}
        value={mtd}
        currency={currency}
        subtitle={spendSubtitle}
        trend={trend}
        iconColor="text-emerald-600"
        onClick={onCardClick ? () => onCardClick("mtd") : undefined}
      />

      <CostMetricCard
        icon={TrendingUp}
        label="Daily Rate"
        value={dailyRate}
        currency={currency}
        subtitle="Per day average"
        iconColor="text-blue-600"
        onClick={onCardClick ? () => onCardClick("daily") : undefined}
      />

      <CostMetricCard
        icon={Target}
        label="Forecast"
        value={forecast}
        currency={currency}
        subtitle="End of month"
        iconColor="text-amber-600"
        onClick={onCardClick ? () => onCardClick("forecast") : undefined}
      />

      <CostMetricCard
        icon={Calendar}
        label="YTD Spend"
        value={ytd}
        currency={currency}
        subtitle="Year to date"
        iconColor="text-slate-600"
        onClick={onCardClick ? () => onCardClick("ytd") : undefined}
      />
    </CostMetricGrid>
  )
}

// ============================================
// Comparison Banner
// ============================================

export interface CostComparisonBannerProps {
  comparison: PeriodComparison
  currency?: string
  className?: string
}

export function CostComparisonBanner({
  comparison,
  currency = "USD",
  className,
}: CostComparisonBannerProps) {
  const TrendIcon =
    comparison.trend === "up"
      ? ArrowUpRight
      : comparison.trend === "down"
        ? ArrowDownRight
        : Minus

  // VIS-005: Use branded design token colors for comparison banner
  // Coral (#FF6C5E) for cost increase (bad), Green (#10A37F) for decrease (good)
  const bgClass =
    comparison.trend === "up"
      ? "bg-[#FF6C5E]/10 border-[#FF6C5E]/30"
      : comparison.trend === "down"
        ? "bg-[#10A37F]/10 border-[#10A37F]/30"
        : "bg-slate-50 border-slate-200"

  return (
    <div
      className={cn(
        "rounded-xl border p-3 sm:p-4 flex items-center justify-between gap-4",
        bgClass,
        className
      )}
    >
      <div className="flex items-center gap-3">
        <TrendIcon
          className={cn("h-5 w-5", getTrendColorClass(comparison.trend))}
        />
        <div>
          <p className="text-sm font-medium text-slate-700">
            {comparison.current.label} vs {comparison.previous.label}
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            {formatCost(comparison.previous.total, currency)} →{" "}
            {formatCost(comparison.current.total, currency)}
          </p>
        </div>
      </div>

      <div className="text-right">
        <p
          className={cn(
            "text-base font-bold tabular-nums",
            getTrendColorClass(comparison.trend)
          )}
        >
          {getTrendArrow(comparison.trend)} {formatPercent(Math.abs(comparison.changePercent))}
        </p>
        <p className="text-xs text-slate-500 tabular-nums">
          {comparison.change >= 0 ? "+" : ""}
          {formatCost(comparison.change, currency)}
        </p>
      </div>
    </div>
  )
}

// ============================================
// Combined Summary with Comparison
// ============================================

export interface CostSummaryWithComparisonProps {
  data: CostSummaryData
  comparison?: PeriodComparison
  loading?: boolean
  showComparisonBanner?: boolean
  className?: string
}

export function CostSummaryWithComparison({
  data,
  comparison,
  loading = false,
  showComparisonBanner = true,
  className,
}: CostSummaryWithComparisonProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <CostSummaryGrid
        data={data}
        comparison={comparison}
        loading={loading}
      />

      {showComparisonBanner && comparison && !loading && (
        <CostComparisonBanner
          comparison={comparison}
          currency={data.currency}
        />
      )}
    </div>
  )
}
