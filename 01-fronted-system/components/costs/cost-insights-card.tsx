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
  const padding = 8
  const chartHeight = height - 16 // Leave room for labels

  // Get all values for scaling
  const allValues = [
    ...currentData.map((d) => d.value),
    ...(averageData?.map((d) => d.value) ?? []),
  ]
  const maxValue = Math.max(...allValues, 1)
  const minValue = Math.min(...allValues, 0)
  const range = maxValue - minValue || 1

  // Generate smooth curve path using bezier curves
  const generateSmoothPath = (data: TrendDataPoint[]) => {
    if (data.length < 2) return ""

    const xStep = (width - padding * 2) / Math.max(data.length - 1, 1)
    const points = data.map((point, index) => ({
      x: padding + index * xStep,
      y: chartHeight - padding - ((point.value - minValue) / range) * (chartHeight - padding * 2),
    }))

    // Create smooth curve using quadratic bezier
    let path = `M ${points[0].x} ${points[0].y}`
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i]
      const next = points[i + 1]
      const midX = (current.x + next.x) / 2
      const midY = (current.y + next.y) / 2

      if (i === 0) {
        path += ` Q ${current.x} ${current.y} ${midX} ${midY}`
      } else {
        path += ` T ${midX} ${midY}`
      }
    }
    // Connect to last point
    const last = points[points.length - 1]
    path += ` L ${last.x} ${last.y}`

    return path
  }

  // Generate area fill path
  const generateAreaPath = (data: TrendDataPoint[], color: string) => {
    if (data.length < 2) return ""

    const xStep = (width - padding * 2) / Math.max(data.length - 1, 1)
    const points = data.map((point, index) => ({
      x: padding + index * xStep,
      y: chartHeight - padding - ((point.value - minValue) / range) * (chartHeight - padding * 2),
    }))

    let path = `M ${points[0].x} ${chartHeight - padding}`
    points.forEach(p => {
      path += ` L ${p.x} ${p.y}`
    })
    path += ` L ${points[points.length - 1].x} ${chartHeight - padding} Z`

    return path
  }

  const currentPath = generateSmoothPath(currentData)
  const averagePath = averageData ? generateSmoothPath(averageData) : null
  const areaPath = generateAreaPath(currentData, primaryColor)

  // Calculate endpoint positions for dots
  const lastCurrent = currentData[currentData.length - 1]
  const lastAverage = averageData?.[averageData.length - 1]
  const xStep = (width - padding * 2) / Math.max(currentData.length - 1, 1)

  const currentEndX = padding + (currentData.length - 1) * xStep
  const currentEndY =
    chartHeight - padding - ((lastCurrent.value - minValue) / range) * (chartHeight - padding * 2)

  const averageEndX = averagePath ? padding + ((averageData?.length || 1) - 1) * xStep : 0
  const averageEndY = lastAverage
    ? chartHeight - padding - ((lastAverage.value - minValue) / range) * (chartHeight - padding * 2)
    : 0

  return (
    <svg width={width} height={height} className="w-full h-auto" viewBox={`0 0 ${width} ${height}`}>
      {/* Gradient definitions */}
      <defs>
        <linearGradient id={`gradient-${primaryColor.replace('#', '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={primaryColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={primaryColor} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      <line
        x1={padding}
        y1={chartHeight / 2}
        x2={width - padding}
        y2={chartHeight / 2}
        stroke="#e2e8f0"
        strokeWidth={1}
        strokeDasharray="4 4"
      />

      {/* Area fill under current line */}
      <path
        d={areaPath}
        fill={`url(#gradient-${primaryColor.replace('#', '')})`}
        className="transition-all duration-700"
      />

      {/* Average line (dashed) */}
      {averagePath && (
        <>
          <path
            d={averagePath}
            fill="none"
            stroke={secondaryColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="6 4"
            className="transition-all duration-500"
          />
          <circle
            cx={averageEndX}
            cy={averageEndY}
            r={4}
            fill="white"
            stroke={secondaryColor}
            strokeWidth={2}
            className="transition-all duration-500"
          />
        </>
      )}

      {/* Current line */}
      <path
        d={currentPath}
        fill="none"
        stroke={primaryColor}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-all duration-500"
      />

      {/* End point with glow effect */}
      <circle
        cx={currentEndX}
        cy={currentEndY}
        r={8}
        fill={primaryColor}
        opacity={0.2}
        className="transition-all duration-500"
      />
      <circle
        cx={currentEndX}
        cy={currentEndY}
        r={5}
        fill="white"
        stroke={primaryColor}
        strokeWidth={3}
        className="transition-all duration-500"
      />

      {/* X-axis labels */}
      <text x={padding} y={height - 2} fontSize={10} fill="#94a3b8" fontWeight="500">
        Start
      </text>
      <text x={width - padding} y={height - 2} fontSize={10} fill="#94a3b8" textAnchor="end" fontWeight="500">
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
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="p-1.5 rounded-lg"
            style={{ backgroundColor: `${primaryColor}15` }}
          >
            <Icon className="h-4 w-4" style={{ color: primaryColor }} />
          </div>
          <h3 className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: primaryColor }}>
            {title}
          </h3>
        </div>
        {showChevron && <ChevronRight className="h-4 w-4 text-slate-400" />}
      </div>

      {/* Insight text */}
      <p className="text-sm text-slate-600 mb-4 leading-relaxed">{insight}</p>

      {/* Value comparison - Apple Health style */}
      <div className="flex items-end gap-5 mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <div
              className="w-2.5 h-2.5 rounded-full shadow-sm"
              style={{ backgroundColor: primaryColor }}
            />
            <span className="text-xs font-medium text-slate-500">{currentLabel}</span>
          </div>
          <div
            className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums"
            style={{ color: primaryColor }}
          >
            {formattedCurrent}
          </div>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <div
              className="w-2.5 h-2.5 rounded-full opacity-60"
              style={{ backgroundColor: secondaryColor }}
            />
            <span className="text-xs font-medium text-slate-500">{averageLabel}</span>
          </div>
          <div
            className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums"
            style={{ color: secondaryColor }}
          >
            {formattedAverage}
          </div>
        </div>

        {/* Trend indicator - more prominent */}
        <div
          className={cn(
            "flex items-center gap-1 px-2.5 py-1.5 rounded-full",
            trend === "up" && "bg-red-50",
            trend === "down" && "bg-green-50",
            trend === "flat" && "bg-slate-50"
          )}
        >
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
              "text-sm font-bold tabular-nums",
              trend === "up" && "text-red-500",
              trend === "down" && "text-green-500",
              trend === "flat" && "text-slate-400"
            )}
          >
            {Math.abs(percentChange).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Chart - with more height for visibility */}
      {trendData && trendData.length > 1 && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <LineChart
            currentData={trendData}
            averageData={averageTrendData}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            height={90}
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
