"use client"

/**
 * CostPeriodMetricsGrid - Extended period metrics display
 *
 * Displays cost metrics across multiple time periods:
 * - Yesterday, WTD, Last Week, MTD
 * - Previous Month, Last 2 Months, YTD, FY Forecast
 *
 * Integrates with filters and uses backend-provided data.
 */

import { useMemo } from "react"
import {
  CalendarDays,
  Calendar,
  CalendarRange,
  TrendingUp,
  Target,
  Clock,
  CalendarClock,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { CostMetricCard, CostMetricGrid } from "./cost-metric-card"
import {
  formatCost,
  formatCostCompact,
  getYesterdayRange,
  getWTDRange,
  getLastWeekRange,
  getMTDRange,
  getPreviousMonthRange,
  getLast2MonthsRange,
  getYTDRange,
  getFiscalYearRange,
  getFYTDRange,
  calculateFiscalYearForecast,
} from "@/lib/costs"

// ============================================
// Types
// ============================================

export interface PeriodCostData {
  /** Yesterday's cost */
  yesterday?: number
  /** Week to date cost */
  wtd?: number
  /** Last full week cost */
  lastWeek?: number
  /** Month to date cost */
  mtd?: number
  /** Previous full month cost */
  previousMonth?: number
  /** Last 2 months cost */
  last2Months?: number
  /** Year to date cost */
  ytd?: number
  /** Fiscal year to date cost */
  fytd?: number
  /** Fiscal year forecast */
  fyForecast?: number
}

export interface CostPeriodMetricsGridProps {
  /** Period cost data from API or calculations */
  data: PeriodCostData
  /** Currency code */
  currency?: string
  /** Loading state */
  loading?: boolean
  /** Custom class name */
  className?: string
  /** Fiscal year start month (1-12, default April = 4) */
  fiscalStartMonth?: number
  /** Show compact values (1.2K, 3.4M) */
  compact?: boolean
  /** Variant: 'full' shows all 8 metrics, 'summary' shows 4 key metrics */
  variant?: "full" | "summary"
}

// ============================================
// Period Label Helpers
// ============================================

function getFormattedPeriodLabel(periodFn: () => { label: string }): string {
  try {
    return periodFn().label
  } catch {
    return ""
  }
}

// ============================================
// Loading Skeleton
// ============================================

function PeriodMetricsSkeleton({ variant = "full" }: { variant?: "full" | "summary" }) {
  const count = variant === "full" ? 8 : 4

  return (
    <div className={cn(
      "grid gap-3 sm:gap-4",
      variant === "full" ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 lg:grid-cols-4"
    )}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-4 animate-pulse"
        >
          <div className="flex items-center gap-1.5 sm:gap-2 mb-2">
            <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 bg-slate-200 rounded" />
            <div className="h-3 w-14 bg-slate-200 rounded" />
          </div>
          <div className="h-6 sm:h-7 w-20 bg-slate-200 rounded mb-1" />
          <div className="h-2.5 w-16 bg-slate-100 rounded" />
        </div>
      ))}
    </div>
  )
}

// ============================================
// Main Component
// ============================================

export function CostPeriodMetricsGrid({
  data,
  currency = "USD",
  loading = false,
  className,
  fiscalStartMonth = 4,
  compact = false,
  variant = "full",
}: CostPeriodMetricsGridProps) {
  if (loading) {
    return <PeriodMetricsSkeleton variant={variant} />
  }

  // Get period labels
  const periodLabels = useMemo(() => ({
    yesterday: getFormattedPeriodLabel(getYesterdayRange),
    wtd: getFormattedPeriodLabel(getWTDRange),
    lastWeek: getFormattedPeriodLabel(getLastWeekRange),
    mtd: getFormattedPeriodLabel(getMTDRange),
    previousMonth: getFormattedPeriodLabel(getPreviousMonthRange),
    last2Months: getFormattedPeriodLabel(getLast2MonthsRange),
    ytd: getFormattedPeriodLabel(getYTDRange),
    fyLabel: getFormattedPeriodLabel(() => getFiscalYearRange(fiscalStartMonth)),
  }), [fiscalStartMonth])

  // Calculate FY forecast if not provided
  const fyForecast = useMemo(() => {
    if (data.fyForecast !== undefined) return data.fyForecast
    if (data.fytd !== undefined) {
      const fytdRange = getFYTDRange(fiscalStartMonth)
      const fyRange = getFiscalYearRange(fiscalStartMonth)
      return calculateFiscalYearForecast(data.fytd, fytdRange.days, fyRange.days)
    }
    return 0
  }, [data.fyForecast, data.fytd, fiscalStartMonth])

  // Summary variant shows only 4 key metrics
  if (variant === "summary") {
    return (
      <CostMetricGrid columns={4} className={className}>
        <CostMetricCard
          icon={Clock}
          label="Yesterday"
          value={data.yesterday ?? 0}
          currency={currency}
          subtitle="Previous day"
          variant="compact"
          iconColor="text-slate-600"
          compact={compact}
        />
        <CostMetricCard
          icon={CalendarDays}
          label="MTD"
          value={data.mtd ?? 0}
          currency={currency}
          subtitle={periodLabels.mtd}
          variant="compact"
          iconColor="text-emerald-600"
          compact={compact}
        />
        <CostMetricCard
          icon={Calendar}
          label="YTD"
          value={data.ytd ?? 0}
          currency={currency}
          subtitle={periodLabels.ytd}
          variant="compact"
          iconColor="text-purple-600"
          compact={compact}
        />
        <CostMetricCard
          icon={Target}
          label={`${periodLabels.fyLabel} Forecast`}
          value={fyForecast}
          currency={currency}
          subtitle="Fiscal year"
          variant="compact"
          iconColor="text-amber-600"
          compact={compact}
        />
      </CostMetricGrid>
    )
  }

  // Full variant shows all 8 metrics in 2 rows
  return (
    <div className={cn("space-y-3 sm:space-y-4", className)}>
      {/* Row 1: Short-term periods */}
      <CostMetricGrid columns={4}>
        <CostMetricCard
          icon={Clock}
          label="Yesterday"
          value={data.yesterday ?? 0}
          currency={currency}
          subtitle="Previous day"
          variant="compact"
          iconColor="text-slate-600"
          compact={compact}
        />
        <CostMetricCard
          icon={CalendarClock}
          label="WTD"
          value={data.wtd ?? 0}
          currency={currency}
          subtitle="Week to date"
          variant="compact"
          iconColor="text-blue-500"
          compact={compact}
        />
        <CostMetricCard
          icon={CalendarRange}
          label="Last Week"
          value={data.lastWeek ?? 0}
          currency={currency}
          subtitle={periodLabels.lastWeek}
          variant="compact"
          iconColor="text-indigo-500"
          compact={compact}
        />
        <CostMetricCard
          icon={CalendarDays}
          label="MTD"
          value={data.mtd ?? 0}
          currency={currency}
          subtitle="Month to date"
          variant="compact"
          iconColor="text-emerald-600"
          compact={compact}
        />
      </CostMetricGrid>

      {/* Row 2: Longer-term periods */}
      <CostMetricGrid columns={4}>
        <CostMetricCard
          icon={Calendar}
          label={periodLabels.previousMonth}
          value={data.previousMonth ?? 0}
          currency={currency}
          subtitle="Previous month"
          variant="compact"
          iconColor="text-teal-600"
          compact={compact}
        />
        <CostMetricCard
          icon={CalendarRange}
          label="Last 2 Months"
          value={data.last2Months ?? 0}
          currency={currency}
          subtitle={periodLabels.last2Months}
          variant="compact"
          iconColor="text-cyan-600"
          compact={compact}
        />
        <CostMetricCard
          icon={TrendingUp}
          label="YTD"
          value={data.ytd ?? 0}
          currency={currency}
          subtitle="Year to date"
          variant="compact"
          iconColor="text-purple-600"
          compact={compact}
        />
        <CostMetricCard
          icon={Sparkles}
          label={`${periodLabels.fyLabel} Forecast`}
          value={fyForecast}
          currency={currency}
          subtitle="Projected FY"
          variant="compact"
          iconColor="text-amber-600"
          compact={compact}
        />
      </CostMetricGrid>
    </div>
  )
}

// ============================================
// Single Row Compact Variant
// ============================================

export interface CostPeriodMetricsBarProps {
  /** Period cost data */
  data: PeriodCostData
  /** Currency code */
  currency?: string
  /** Loading state */
  loading?: boolean
  /** Custom class name */
  className?: string
}

export function CostPeriodMetricsBar({
  data,
  currency = "USD",
  loading = false,
  className,
}: CostPeriodMetricsBarProps) {
  if (loading) {
    return (
      <div className={cn(
        "flex items-center gap-4 sm:gap-6 overflow-x-auto py-2",
        className
      )}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 animate-pulse">
            <div className="h-4 w-4 bg-slate-200 rounded" />
            <div className="h-4 w-16 bg-slate-200 rounded" />
          </div>
        ))}
      </div>
    )
  }

  const metrics = [
    { label: "Yesterday", value: data.yesterday ?? 0, color: "text-slate-600" },
    { label: "WTD", value: data.wtd ?? 0, color: "text-blue-600" },
    { label: "MTD", value: data.mtd ?? 0, color: "text-emerald-600" },
    { label: "YTD", value: data.ytd ?? 0, color: "text-purple-600" },
  ]

  return (
    <div className={cn(
      "flex items-center gap-4 sm:gap-6 overflow-x-auto py-2 px-1",
      className
    )}>
      {metrics.map(({ label, value, color }) => (
        <div key={label} className="flex items-center gap-2 whitespace-nowrap">
          <span className={cn("text-xs font-medium", color)}>{label}:</span>
          <span className="text-sm font-semibold text-slate-900">
            {formatCostCompact(value, currency)}
          </span>
        </div>
      ))}
    </div>
  )
}
