"use client"

/**
 * CostPeriodSelector - Apple Health style period selector (D/W/M/6M/Y)
 *
 * Features:
 * - Segmented control appearance
 * - Period-aware date calculation
 * - Smooth animation between selections
 * - Mobile-responsive sizing
 */

import { cn } from "@/lib/utils"
import { useState, useMemo } from "react"
import { formatLocalDate } from "@/lib/i18n/formatters"

// ============================================
// Types
// ============================================

export type PeriodType = "D" | "W" | "M" | "6M" | "Y"

export interface PeriodOption {
  /** Period key */
  key: PeriodType
  /** Display label */
  label: string
  /** Full description */
  description?: string
}

export interface DatePeriod {
  /** Start date */
  startDate: Date
  /** End date */
  endDate: Date
  /** Period label (e.g., "Dec 22-28, 2025") */
  label: string
}

export interface CostPeriodSelectorProps {
  /** Currently selected period */
  value: PeriodType
  /** Selection change handler */
  onChange: (period: PeriodType) => void
  /** Available periods (default: all) */
  periods?: PeriodOption[]
  /** Disabled state */
  disabled?: boolean
  /** Custom class name */
  className?: string
  /** Size variant */
  size?: "sm" | "md" | "lg"
}

// ============================================
// Default Periods
// ============================================

const DEFAULT_PERIODS: PeriodOption[] = [
  { key: "D", label: "D", description: "Day" },
  { key: "W", label: "W", description: "Week" },
  { key: "M", label: "M", description: "Month" },
  { key: "6M", label: "6M", description: "6 Months" },
  { key: "Y", label: "Y", description: "Year" },
]

// ============================================
// Date Calculation Helpers
// ============================================

export function getPeriodDates(period: PeriodType, baseDate: Date = new Date()): DatePeriod {
  const endDate = new Date(baseDate)
  const startDate = new Date(baseDate)

  switch (period) {
    case "D":
      // Today only
      startDate.setHours(0, 0, 0, 0)
      endDate.setHours(23, 59, 59, 999)
      break
    case "W":
      // Last 7 days
      startDate.setDate(endDate.getDate() - 6)
      startDate.setHours(0, 0, 0, 0)
      endDate.setHours(23, 59, 59, 999)
      break
    case "M":
      // Current month
      startDate.setDate(1)
      startDate.setHours(0, 0, 0, 0)
      endDate.setHours(23, 59, 59, 999)
      break
    case "6M":
      // Last 6 months
      startDate.setMonth(endDate.getMonth() - 5)
      startDate.setDate(1)
      startDate.setHours(0, 0, 0, 0)
      endDate.setHours(23, 59, 59, 999)
      break
    case "Y":
      // Current year (fiscal or calendar)
      startDate.setMonth(0, 1)
      startDate.setHours(0, 0, 0, 0)
      endDate.setHours(23, 59, 59, 999)
      break
  }

  // Format label
  const formatOptions: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
  const formatYear: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }

  let label: string
  if (period === "D") {
    label = endDate.toLocaleDateString(undefined, formatYear)
  } else {
    const start = startDate.toLocaleDateString(undefined, formatOptions)
    const end = endDate.toLocaleDateString(undefined, formatYear)
    label = `${start} - ${end}`
  }

  return { startDate, endDate, label }
}

export function formatPeriodLabel(period: PeriodType): string {
  const { label } = getPeriodDates(period)
  return label
}

// ============================================
// Main Component
// ============================================

export function CostPeriodSelector({
  value,
  onChange,
  periods = DEFAULT_PERIODS,
  disabled = false,
  className,
  size = "md",
}: CostPeriodSelectorProps) {
  const sizeClasses = {
    sm: {
      container: "h-8 text-xs",
      button: "px-2.5 min-w-[32px]",
    },
    md: {
      container: "h-10 text-sm",
      button: "px-3.5 min-w-[40px]",
    },
    lg: {
      container: "h-12 text-base",
      button: "px-4 min-w-[48px]",
    },
  }

  const sizes = sizeClasses[size]

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-xl bg-[var(--surface-secondary)] p-1",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
      role="tablist"
      aria-label="Period selector"
    >
      {periods.map((period) => {
        const isSelected = value === period.key

        return (
          <button
            key={period.key}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-label={period.description || period.label}
            onClick={() => onChange(period.key)}
            disabled={disabled}
            className={cn(
              "relative font-semibold rounded-lg transition-all duration-200",
              sizes.container,
              sizes.button,
              "flex items-center justify-center",
              isSelected
                ? "bg-white text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            )}
          >
            {period.label}
          </button>
        )
      })}
    </div>
  )
}

// ============================================
// With Date Display
// ============================================

export interface CostPeriodSelectorWithDateProps extends CostPeriodSelectorProps {
  /** Show date range below selector */
  showDateRange?: boolean
}

export function CostPeriodSelectorWithDate({
  value,
  onChange,
  periods,
  disabled,
  className,
  size,
  showDateRange = true,
}: CostPeriodSelectorWithDateProps) {
  const dateLabel = useMemo(() => formatPeriodLabel(value), [value])

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <CostPeriodSelector
        value={value}
        onChange={onChange}
        periods={periods}
        disabled={disabled}
        size={size}
      />
      {showDateRange && (
        <span className="text-xs text-[var(--text-tertiary)]">{dateLabel}</span>
      )}
    </div>
  )
}

// ============================================
// Hook: usePeriodSelector
// ============================================

export interface UsePeriodSelectorResult {
  /** Current period */
  period: PeriodType
  /** Set period */
  setPeriod: (p: PeriodType) => void
  /** Date range for current period */
  dates: DatePeriod
  /** API-ready start date (YYYY-MM-DD) */
  startDate: string
  /** API-ready end date (YYYY-MM-DD) */
  endDate: string
}

export function usePeriodSelector(
  initialPeriod: PeriodType = "M"
): UsePeriodSelectorResult {
  const [period, setPeriod] = useState<PeriodType>(initialPeriod)

  const dates = useMemo(() => getPeriodDates(period), [period])

  const startDate = formatLocalDate(dates.startDate)
  const endDate = formatLocalDate(dates.endDate)

  return {
    period,
    setPeriod,
    dates,
    startDate,
    endDate,
  }
}
