"use client"

/**
 * CostMetricCard - Apple Health-style metric card for cost dashboards
 *
 * Features:
 * - Responsive sizing (mobile → desktop)
 * - Trend indicators (up/down/flat)
 * - Multiple variants (default, compact, large)
 * - Currency formatting integration
 * - Loading skeleton state
 */

import { useMemo } from "react"
import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCost, formatCostCompact, formatPercent, getTrendArrow, getTrendColorClass } from "@/lib/costs"

// ============================================
// Types
// ============================================

export interface CostMetricCardProps {
  /** Icon to display */
  icon: LucideIcon
  /** Label text (e.g., "MTD Spend") */
  label: string
  /** Numeric value */
  value: number
  /** Currency code (default: USD) */
  currency?: string
  /** Optional subtitle (e.g., "This month") */
  subtitle?: string
  /** Trend compared to previous period */
  trend?: {
    value: number
    direction: "up" | "down" | "flat"
  }
  /** Card variant */
  variant?: "default" | "compact" | "large"
  /** Use compact number formatting (1.2K, 3.4M) */
  compact?: boolean
  /** Loading state */
  loading?: boolean
  /** Custom class name */
  className?: string
  /** Icon color (Tailwind class or hex) */
  iconColor?: string
  /** Click handler */
  onClick?: () => void
}

// ============================================
// Loading Skeleton
// ============================================

function MetricCardSkeleton({ variant = "default" }: { variant?: "default" | "compact" | "large" }) {
  const sizeClasses = {
    compact: "p-2 sm:p-3",
    default: "p-3 sm:p-5",
    large: "p-4 sm:p-6",
  }

  return (
    <div className={cn(
      "bg-white rounded-xl sm:rounded-2xl border border-slate-200 animate-pulse",
      sizeClasses[variant]
    )}>
      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
        <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 bg-slate-200 rounded" />
        <div className="h-3 w-16 bg-slate-200 rounded" />
      </div>
      <div className="h-7 sm:h-8 w-24 bg-slate-200 rounded mb-1" />
      <div className="h-3 w-20 bg-slate-100 rounded" />
    </div>
  )
}

// ============================================
// Component
// ============================================

export function CostMetricCard({
  icon: Icon,
  label,
  value,
  currency = "USD",
  subtitle,
  trend,
  variant = "default",
  compact: useCompact = false,
  loading = false,
  className,
  iconColor = "text-slate-600",
  onClick,
}: CostMetricCardProps) {
  if (loading) {
    return <MetricCardSkeleton variant={variant} />
  }

  // PERF-002 FIX: Memoize formatted value to prevent recalculation on parent re-renders
  const formattedValue = useMemo(
    () => useCompact || value >= 100000
      ? formatCostCompact(value, currency)
      : formatCost(value, currency),
    [value, currency, useCompact]
  )

  // Size classes based on variant
  const sizeClasses = {
    compact: {
      container: "p-2 sm:p-3",
      iconContainer: "gap-1 sm:gap-1.5 mb-1.5 sm:mb-2",
      icon: "h-3 w-3 sm:h-3.5 sm:w-3.5",
      label: "text-[9px] sm:text-[10px]",
      value: "text-lg sm:text-xl lg:text-2xl",
      subtitle: "text-[9px] sm:text-[10px]",
    },
    default: {
      container: "p-3 sm:p-5",
      iconContainer: "gap-1.5 sm:gap-2 mb-2 sm:mb-3",
      icon: "h-3.5 w-3.5 sm:h-4 sm:w-4",
      label: "text-[10px] sm:text-xs",
      value: "text-xl sm:text-2xl lg:text-3xl",
      subtitle: "text-[10px] sm:text-xs",
    },
    large: {
      container: "p-4 sm:p-6",
      iconContainer: "gap-2 sm:gap-2.5 mb-3 sm:mb-4",
      icon: "h-4 w-4 sm:h-5 sm:w-5",
      label: "text-xs sm:text-sm",
      value: "text-2xl sm:text-3xl lg:text-4xl",
      subtitle: "text-xs sm:text-sm",
    },
  }

  const sizes = sizeClasses[variant]

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <div
      className={cn(
        "bg-white rounded-xl sm:rounded-2xl border border-slate-200",
        "shadow-sm hover:shadow-md transition-all duration-200",
        onClick && "cursor-pointer hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#90FCA6] focus:ring-offset-2",
        sizes.container,
        className
      )}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${label}: ${formattedValue}` : undefined}
    >
      {/* Header: Icon + Label */}
      <div className={cn("flex items-center", sizes.iconContainer)}>
        <Icon className={cn(sizes.icon, iconColor)} />
        <span className={cn(
          "font-medium uppercase tracking-wide text-slate-500",
          sizes.label
        )}>
          {label}
        </span>
      </div>

      {/* Value */}
      <div className={cn("font-bold text-slate-900 tracking-tight", sizes.value)}>
        {formattedValue}
      </div>

      {/* Subtitle & Trend */}
      <div className={cn(
        "flex items-center gap-2 mt-0.5 sm:mt-1",
        sizes.subtitle
      )}>
        {subtitle && (
          <span className="text-slate-500">{subtitle}</span>
        )}
        {trend && (
          <span className={cn(
            "flex items-center gap-0.5 font-medium",
            getTrendColorClass(trend.direction)
          )}>
            <span>{getTrendArrow(trend.direction)}</span>
            <span>{formatPercent(Math.abs(trend.value))}</span>
          </span>
        )}
      </div>
    </div>
  )
}

// ============================================
// Grid Component for Multiple Cards
// ============================================

export interface CostMetricGridProps {
  children: React.ReactNode
  columns?: 2 | 3 | 4
  className?: string
}

export function CostMetricGrid({
  children,
  columns = 4,
  className,
}: CostMetricGridProps) {
  const columnClasses = {
    2: "grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-3",
    4: "grid-cols-2 lg:grid-cols-4",
  }

  return (
    <div className={cn(
      "grid gap-3 sm:gap-4",
      columnClasses[columns],
      className
    )}>
      {children}
    </div>
  )
}

// ============================================
// Preset Metric Cards
// ============================================

export interface PresetMetricCardProps {
  value: number
  currency?: string
  trend?: { value: number; direction: "up" | "down" | "flat" }
  loading?: boolean
  className?: string
}

import { CalendarDays, TrendingUp, Target, Calendar } from "lucide-react"

export function MTDMetricCard({ value, currency, trend, loading, className }: PresetMetricCardProps) {
  return (
    <CostMetricCard
      icon={CalendarDays}
      label="MTD Spend"
      value={value}
      currency={currency}
      subtitle="This month"
      trend={trend}
      loading={loading}
      iconColor="text-emerald-600"
      className={className}
    />
  )
}

export function DailyRateMetricCard({ value, currency, trend, loading, className }: PresetMetricCardProps) {
  return (
    <CostMetricCard
      icon={TrendingUp}
      label="Daily Rate"
      value={value}
      currency={currency}
      subtitle="Per day average"
      trend={trend}
      loading={loading}
      iconColor="text-blue-600"
      className={className}
    />
  )
}

export function ForecastMetricCard({ value, currency, trend, loading, className }: PresetMetricCardProps) {
  return (
    <CostMetricCard
      icon={Target}
      label="Forecast"
      value={value}
      currency={currency}
      subtitle="End of month"
      trend={trend}
      loading={loading}
      iconColor="text-amber-600"
      className={className}
    />
  )
}

export function YTDMetricCard({ value, currency, trend, loading, className }: PresetMetricCardProps) {
  return (
    <CostMetricCard
      icon={Calendar}
      label="YTD Spend"
      value={value}
      currency={currency}
      subtitle="Year to date"
      trend={trend}
      loading={loading}
      iconColor="text-purple-600"
      className={className}
    />
  )
}
