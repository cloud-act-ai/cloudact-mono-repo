"use client"

/**
 * CostDailyBarChart - Apple Health Activity style bar chart
 *
 * Features:
 * - Daily/weekly bar visualization
 * - Goal/budget line (dashed)
 * - Achievement indicator (X of Y days)
 * - Color-coded bars (exceeds/under budget)
 * - Responsive sizing
 */

import { cn } from "@/lib/utils"
import { formatCost, formatCostCompact } from "@/lib/costs"

// ============================================
// Types
// ============================================

export interface DailyBarData {
  /** Date or label (e.g., "Mon", "Dec 23") */
  label: string
  /** Value for the day */
  value: number
  /** Secondary value (stacked bar) */
  secondaryValue?: number
  /** Date string for tooltip */
  date?: string
}

export interface CostDailyBarChartProps {
  /** Chart title (e.g., "Daily Spend") */
  title: string
  /** Daily data points */
  data: DailyBarData[]
  /** Goal/budget line value */
  goal?: number
  /** Goal label */
  goalLabel?: string
  /** Currency code */
  currency?: string
  /** Primary bar color */
  primaryColor?: string
  /** Secondary bar color (for stacked) */
  secondaryColor?: string
  /** Days under budget count */
  daysUnderBudget?: number
  /** Total days in period */
  totalDays?: number
  /** Loading state */
  loading?: boolean
  /** Custom class name */
  className?: string
  /** Use compact currency format */
  compact?: boolean
  /** Show the goal value on right side */
  showGoalValue?: boolean
  /** Bar height in pixels */
  barHeight?: number
}

// ============================================
// Loading Skeleton
// ============================================

function BarChartSkeleton() {
  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6 animate-pulse">
      <div className="h-4 w-24 bg-slate-200 rounded mb-6" />
      <div className="flex items-end justify-between gap-1 h-32">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div
            key={i}
            className="flex-1 bg-slate-100 rounded-t"
            style={{ height: `${30 + Math.random() * 60}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-3">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="h-3 w-6 bg-slate-100 rounded" />
        ))}
      </div>
    </div>
  )
}

// ============================================
// Single Bar
// ============================================

interface BarProps {
  data: DailyBarData
  maxValue: number
  goal?: number
  primaryColor: string
  secondaryColor?: string
  chartHeight: number
  currency: string
  compact: boolean
}

function Bar({
  data,
  maxValue,
  goal,
  primaryColor,
  secondaryColor,
  chartHeight,
  currency,
  compact,
}: BarProps) {
  const totalValue = data.value + (data.secondaryValue ?? 0)
  const percentage = maxValue > 0 ? (totalValue / maxValue) * 100 : 0
  const barHeight = (percentage / 100) * chartHeight

  const primaryPercentage = maxValue > 0 ? (data.value / maxValue) * 100 : 0
  const primaryHeight = (primaryPercentage / 100) * chartHeight

  // Determine if exceeds goal (darker color) or under (lighter color)
  const exceedsGoal = goal !== undefined && totalValue > goal
  const barOpacity = exceedsGoal ? 1 : 0.7

  const formattedValue = compact
    ? formatCostCompact(totalValue, currency)
    : formatCost(totalValue, currency)

  return (
    <div className="flex-1 flex flex-col items-center gap-1 group relative">
      {/* Tooltip */}
      <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
        <div className="bg-slate-900 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap">
          {formattedValue}
          {data.date && <span className="text-slate-400 ml-1">{data.date}</span>}
        </div>
      </div>

      {/* Bar container */}
      <div
        className="w-full flex flex-col justify-end"
        style={{ height: chartHeight }}
      >
        {/* Stacked bars */}
        <div className="w-full flex flex-col justify-end">
          {/* Secondary bar (top) */}
          {data.secondaryValue !== undefined && data.secondaryValue > 0 && (
            <div
              className="w-full rounded-t transition-all duration-300"
              style={{
                height: ((data.secondaryValue / maxValue) * 100 / 100) * chartHeight,
                backgroundColor: secondaryColor || "#4285F4",
                opacity: barOpacity,
              }}
            />
          )}
          {/* Primary bar */}
          <div
            className={cn(
              "w-full transition-all duration-300",
              data.secondaryValue ? "rounded-b" : "rounded"
            )}
            style={{
              height: primaryHeight,
              backgroundColor: primaryColor,
              opacity: barOpacity,
            }}
          />
        </div>
      </div>

      {/* Label */}
      <span className="text-[10px] sm:text-xs text-slate-500 font-medium">
        {data.label}
      </span>
    </div>
  )
}

// ============================================
// Main Component
// ============================================

export function CostDailyBarChart({
  title,
  data,
  goal,
  goalLabel = "Budget",
  currency = "USD",
  primaryColor = "#10A37F",
  secondaryColor,
  daysUnderBudget,
  totalDays,
  loading = false,
  className,
  compact = true,
  showGoalValue = true,
  barHeight = 120,
}: CostDailyBarChartProps) {
  if (loading) {
    return <BarChartSkeleton />
  }

  // Calculate max value for scaling (consider goal line)
  const maxDataValue = Math.max(...data.map((d) => d.value + (d.secondaryValue ?? 0)), 0)
  const maxValue = goal ? Math.max(maxDataValue, goal * 1.2) : maxDataValue * 1.1

  // Calculate goal line position
  const goalLinePosition = goal && maxValue > 0
    ? ((maxValue - goal) / maxValue) * barHeight
    : undefined

  const formattedGoal = goal
    ? compact
      ? formatCostCompact(goal, currency)
      : formatCost(goal, currency)
    : undefined

  return (
    <div
      className={cn(
        "bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6",
        "shadow-sm",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: primaryColor }}
        >
          {title}
        </h3>
        {daysUnderBudget !== undefined && totalDays !== undefined && (
          <span className="text-sm text-slate-500">
            {daysUnderBudget} of {totalDays} days
          </span>
        )}
      </div>

      {/* Chart */}
      <div className="relative">
        {/* Goal line */}
        {goalLinePosition !== undefined && (
          <>
            <div
              className="absolute left-0 right-0 border-t-2 border-dashed z-10"
              style={{
                top: goalLinePosition,
                borderColor: primaryColor,
                opacity: 0.5,
              }}
            />
            {showGoalValue && (
              <div
                className="absolute right-0 text-xs font-semibold"
                style={{
                  top: goalLinePosition - 16,
                  color: primaryColor,
                }}
              >
                {goalLabel}
                <br />
                <span className="text-slate-900">{formattedGoal}</span>
              </div>
            )}
          </>
        )}

        {/* Bars */}
        <div className="flex items-end gap-1 sm:gap-2">
          {data.map((d, index) => (
            <Bar
              key={d.label + index}
              data={d}
              maxValue={maxValue}
              goal={goal}
              primaryColor={primaryColor}
              secondaryColor={secondaryColor}
              chartHeight={barHeight}
              currency={currency}
              compact={compact}
            />
          ))}
        </div>

        {/* Y-axis label (0) */}
        <div className="absolute bottom-0 right-0 text-[10px] text-slate-400 pr-1">
          {currency === "USD" ? "$0" : `0 ${currency}`}
        </div>
      </div>
    </div>
  )
}

// ============================================
// Preset: Weekly Cost Chart
// ============================================

export interface WeeklyCostChartProps {
  /** Array of 7 daily values [Mon, Tue, Wed, Thu, Fri, Sat, Sun] */
  dailyValues: number[]
  /** Daily budget target */
  dailyBudget?: number
  /** Currency */
  currency?: string
  /** Week start date for context */
  weekStartDate?: string
  /** Loading state */
  loading?: boolean
  /** Chart color */
  color?: string
  /** Custom class name */
  className?: string
}

export function WeeklyCostChart({
  dailyValues,
  dailyBudget,
  currency = "USD",
  weekStartDate,
  loading = false,
  color = "#10A37F",
  className,
}: WeeklyCostChartProps) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  const data: DailyBarData[] = days.map((label, index) => ({
    label,
    value: dailyValues[index] ?? 0,
  }))

  // Count days under budget
  const daysUnderBudget = dailyBudget
    ? dailyValues.filter((v) => v <= dailyBudget).length
    : undefined

  return (
    <CostDailyBarChart
      title="Daily Spend"
      data={data}
      goal={dailyBudget}
      goalLabel="Daily Budget"
      currency={currency}
      primaryColor={color}
      daysUnderBudget={daysUnderBudget}
      totalDays={7}
      loading={loading}
      className={className}
    />
  )
}

// ============================================
// Preset: Monthly Trend Chart
// ============================================

export interface MonthlyTrendChartProps {
  /** Daily values for the month */
  dailyValues: { date: string; value: number }[]
  /** Monthly budget (will calculate daily) */
  monthlyBudget?: number
  /** Currency */
  currency?: string
  /** Loading state */
  loading?: boolean
  /** Chart color */
  color?: string
  /** Custom class name */
  className?: string
}

export function MonthlyTrendChart({
  dailyValues,
  monthlyBudget,
  currency = "USD",
  loading = false,
  color = "#4285F4",
  className,
}: MonthlyTrendChartProps) {
  // Group by week or show last 14 days
  const recentData = dailyValues.slice(-14)

  const data: DailyBarData[] = recentData.map((d) => ({
    label: new Date(d.date).getDate().toString(),
    value: d.value,
    date: d.date,
  }))

  // Calculate daily budget from monthly
  const daysInMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0
  ).getDate()
  const dailyBudget = monthlyBudget ? monthlyBudget / daysInMonth : undefined

  const daysUnderBudget = dailyBudget
    ? data.filter((d) => d.value <= dailyBudget).length
    : undefined

  return (
    <CostDailyBarChart
      title="Daily Trend"
      data={data}
      goal={dailyBudget}
      goalLabel="Daily Target"
      currency={currency}
      primaryColor={color}
      daysUnderBudget={daysUnderBudget}
      totalDays={data.length}
      loading={loading}
      className={className}
      barHeight={100}
    />
  )
}
