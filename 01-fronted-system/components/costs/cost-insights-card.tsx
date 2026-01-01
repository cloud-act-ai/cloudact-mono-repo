"use client"

/**
 * CostInsightsCard - Apple Health Highlights style insight cards
 *
 * Features:
 * - Current vs Average comparison
 * - Trend line visualization
 * - Natural language insights
 * - Animated chart
 */

import { cn } from "@/lib/utils"
import { formatCost, formatCostCompact } from "@/lib/costs"
import { TrendingUp, TrendingDown, Minus, ChevronRight, DollarSign } from "lucide-react"
import type { LucideIcon } from "lucide-react"

// ============================================
// Types
// ============================================

export interface TrendDataPoint {
  /** X-axis value (time) */
  x: number
  /** Y-axis value */
  value: number
}

export interface CostInsightsCardProps {
  /** Card title (e.g., "Daily Spend") */
  title: string
  /** Current period value */
  currentValue: number
  /** Current period label */
  currentLabel?: string
  /** Average/comparison value */
  averageValue: number
  /** Average label */
  averageLabel?: string
  /** Insight text */
  insight: string
  /** Trend data for line chart */
  trendData?: TrendDataPoint[]
  /** Average trend data for comparison line */
  averageTrendData?: TrendDataPoint[]
  /** Currency code */
  currency?: string
  /** Primary color for current line */
  primaryColor?: string
  /** Secondary color for average line */
  secondaryColor?: string
  /** Icon */
  icon?: LucideIcon
  /** Show chevron for navigation */
  showChevron?: boolean
  /** Click handler */
  onClick?: () => void
  /** Loading state */
  loading?: boolean
  /** Custom class name */
  className?: string
  /** Use compact currency format */
  compact?: boolean
}

// ============================================
// Loading Skeleton
// ============================================

function InsightsSkeleton() {
  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-5 bg-slate-200 rounded" />
        <div className="h-4 w-24 bg-slate-200 rounded" />
      </div>
      <div className="h-4 w-48 bg-slate-100 rounded mb-4" />
      <div className="flex gap-6 mb-4">
        <div className="space-y-1">
          <div className="h-3 w-12 bg-slate-100 rounded" />
          <div className="h-6 w-20 bg-slate-200 rounded" />
        </div>
        <div className="space-y-1">
          <div className="h-3 w-12 bg-slate-100 rounded" />
          <div className="h-6 w-20 bg-slate-200 rounded" />
        </div>
      </div>
      <div className="h-24 bg-slate-50 rounded" />
    </div>
  )
}

// ============================================
// Simple Line Chart
// ============================================

interface LineChartProps {
  currentData: TrendDataPoint[]
  averageData?: TrendDataPoint[]
  primaryColor: string
  secondaryColor: string
  height?: number
}

function LineChart({
  currentData,
  averageData,
  primaryColor,
  secondaryColor,
  height = 80,
}: LineChartProps) {
  if (currentData.length === 0) return null

  const width = 280
  const padding = 4

  // Get all values for scaling
  const allValues = [
    ...currentData.map((d) => d.value),
    ...(averageData?.map((d) => d.value) ?? []),
  ]
  const maxValue = Math.max(...allValues, 1)
  const minValue = Math.min(...allValues, 0)
  const range = maxValue - minValue || 1

  // Generate path
  const generatePath = (data: TrendDataPoint[]) => {
    const xStep = (width - padding * 2) / Math.max(data.length - 1, 1)

    return data
      .map((point, index) => {
        const x = padding + index * xStep
        const y = height - padding - ((point.value - minValue) / range) * (height - padding * 2)
        return `${index === 0 ? "M" : "L"} ${x} ${y}`
      })
      .join(" ")
  }

  const currentPath = generatePath(currentData)
  const averagePath = averageData ? generatePath(averageData) : null

  // Calculate endpoint positions for dots
  const lastCurrent = currentData[currentData.length - 1]
  const lastAverage = averageData?.[averageData.length - 1]

  const currentEndX = width - padding
  const currentEndY =
    height - padding - ((lastCurrent.value - minValue) / range) * (height - padding * 2)

  const averageEndX = averagePath ? width - padding : 0
  const averageEndY = lastAverage
    ? height - padding - ((lastAverage.value - minValue) / range) * (height - padding * 2)
    : 0

  return (
    <svg width={width} height={height} className="w-full h-auto">
      {/* Grid lines */}
      <line
        x1={padding}
        y1={height / 2}
        x2={width - padding}
        y2={height / 2}
        stroke="#f1f5f9"
        strokeWidth={1}
        strokeDasharray="4 4"
      />

      {/* Average line */}
      {averagePath && (
        <>
          <path
            d={averagePath}
            fill="none"
            stroke={secondaryColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-all duration-500"
          />
          <circle
            cx={averageEndX}
            cy={averageEndY}
            r={4}
            fill={secondaryColor}
            className="transition-all duration-500"
          />
        </>
      )}

      {/* Current line */}
      <path
        d={currentPath}
        fill="none"
        stroke={primaryColor}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-all duration-500"
      />
      <circle
        cx={currentEndX}
        cy={currentEndY}
        r={5}
        fill={primaryColor}
        className="transition-all duration-500"
      />

      {/* X-axis labels */}
      <text x={padding} y={height - 1} fontSize={9} fill="#94a3b8">
        Start
      </text>
      <text x={width - padding} y={height - 1} fontSize={9} fill="#94a3b8" textAnchor="end">
        Now
      </text>
    </svg>
  )
}

// ============================================
// Main Component
// ============================================

export function CostInsightsCard({
  title,
  currentValue,
  currentLabel = "Current",
  averageValue,
  averageLabel = "Average",
  insight,
  trendData,
  averageTrendData,
  currency = "USD",
  primaryColor = "#FF6C5E",
  secondaryColor = "#94a3b8",
  icon: Icon = DollarSign,
  showChevron = false,
  onClick,
  loading = false,
  className,
  compact = true,
}: CostInsightsCardProps) {
  if (loading) {
    return <InsightsSkeleton />
  }

  // Determine trend
  const percentChange =
    averageValue > 0 ? ((currentValue - averageValue) / averageValue) * 100 : 0
  const trend: "up" | "down" | "flat" =
    percentChange > 5 ? "up" : percentChange < -5 ? "down" : "flat"

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus

  const formattedCurrent = compact
    ? formatCostCompact(currentValue, currency)
    : formatCost(currentValue, currency)

  const formattedAverage = compact
    ? formatCostCompact(averageValue, currency)
    : formatCost(averageValue, currency)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <div
      className={cn(
        "bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6",
        "shadow-sm hover:shadow-md transition-all duration-200",
        onClick && "cursor-pointer hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#90FCA6] focus:ring-offset-2",
        className
      )}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? "button" : "article"}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5" style={{ color: primaryColor }} />
          <h3 className="text-sm font-semibold" style={{ color: primaryColor }}>
            {title}
          </h3>
        </div>
        {showChevron && <ChevronRight className="h-4 w-4 text-slate-400" />}
      </div>

      {/* Insight text */}
      <p className="text-sm text-slate-700 mb-4 leading-relaxed">{insight}</p>

      {/* Value comparison */}
      <div className="flex items-baseline gap-6 mb-4">
        <div>
          <div className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: primaryColor }}
            />
            <span className="text-xs text-slate-500">{currentLabel}</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900" style={{ color: primaryColor }}>
            {formattedCurrent}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: secondaryColor }}
            />
            <span className="text-xs text-slate-500">{averageLabel}</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold" style={{ color: secondaryColor }}>
            {formattedAverage}
          </div>
        </div>

        {/* Trend indicator */}
        <div className="ml-auto flex items-center gap-1">
          <TrendIcon
            className={cn(
              "h-4 w-4",
              trend === "up" && "text-red-500",
              trend === "down" && "text-green-500",
              trend === "flat" && "text-slate-400"
            )}
          />
          <span
            className={cn(
              "text-sm font-semibold",
              trend === "up" && "text-red-500",
              trend === "down" && "text-green-500",
              trend === "flat" && "text-slate-400"
            )}
          >
            {Math.abs(percentChange).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Chart */}
      {trendData && trendData.length > 1 && (
        <div className="mt-3">
          <LineChart
            currentData={trendData}
            averageData={averageTrendData}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
          />
        </div>
      )}
    </div>
  )
}

// ============================================
// Preset: Spend Comparison Card
// ============================================

export interface SpendComparisonCardProps {
  todaySpend: number
  averageSpend: number
  currency?: string
  loading?: boolean
  onClick?: () => void
  className?: string
}

export function SpendComparisonCard({
  todaySpend,
  averageSpend,
  currency = "USD",
  loading = false,
  onClick,
  className,
}: SpendComparisonCardProps) {
  const isHigher = todaySpend > averageSpend * 1.1
  const isLower = todaySpend < averageSpend * 0.9

  const insight = isHigher
    ? "Your spending today is higher than your usual average."
    : isLower
      ? "Great job! You're spending less than your typical average."
      : "Your spending today is in line with your typical average."

  // Generate sample trend data
  const trendData: TrendDataPoint[] = Array.from({ length: 12 }, (_, i) => ({
    x: i,
    value: averageSpend * (0.7 + Math.random() * 0.6) * (i / 11),
  }))
  trendData[trendData.length - 1].value = todaySpend

  const averageTrendData: TrendDataPoint[] = Array.from({ length: 12 }, (_, i) => ({
    x: i,
    value: averageSpend * (i / 11),
  }))

  return (
    <CostInsightsCard
      title="Today's Spend"
      currentValue={todaySpend}
      currentLabel="Today"
      averageValue={averageSpend}
      averageLabel="7-day avg"
      insight={insight}
      trendData={trendData}
      averageTrendData={averageTrendData}
      currency={currency}
      primaryColor="#FF6C5E"
      secondaryColor="#94a3b8"
      loading={loading}
      onClick={onClick}
      className={className}
    />
  )
}

// ============================================
// Preset: Period Comparison Card
// ============================================

export interface PeriodComparisonCardProps {
  currentPeriodValue: number
  previousPeriodValue: number
  currentPeriodLabel: string
  previousPeriodLabel: string
  currency?: string
  loading?: boolean
  color?: string
  onClick?: () => void
  className?: string
}

export function PeriodComparisonCard({
  currentPeriodValue,
  previousPeriodValue,
  currentPeriodLabel,
  previousPeriodLabel,
  currency = "USD",
  loading = false,
  color = "#10A37F",
  onClick,
  className,
}: PeriodComparisonCardProps) {
  const percentChange =
    previousPeriodValue > 0
      ? ((currentPeriodValue - previousPeriodValue) / previousPeriodValue) * 100
      : 0

  const isHigher = percentChange > 5
  const isLower = percentChange < -5

  const insight = isHigher
    ? `${currentPeriodLabel} spending is ${Math.abs(percentChange).toFixed(0)}% higher than ${previousPeriodLabel.toLowerCase()}.`
    : isLower
      ? `${currentPeriodLabel} spending is ${Math.abs(percentChange).toFixed(0)}% lower than ${previousPeriodLabel.toLowerCase()}.`
      : `${currentPeriodLabel} spending is similar to ${previousPeriodLabel.toLowerCase()}.`

  return (
    <CostInsightsCard
      title="Period Comparison"
      currentValue={currentPeriodValue}
      currentLabel={currentPeriodLabel}
      averageValue={previousPeriodValue}
      averageLabel={previousPeriodLabel}
      insight={insight}
      currency={currency}
      primaryColor={color}
      secondaryColor="#94a3b8"
      loading={loading}
      onClick={onClick}
      className={className}
    />
  )
}
