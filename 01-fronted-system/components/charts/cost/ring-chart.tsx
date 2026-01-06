"use client"

/**
 * Cost Ring Chart
 *
 * Donut/ring chart for cost breakdown with:
 * - Center value display
 * - Category/provider breakdown list
 * - Click-to-drill-down
 * - Automatic context integration
 */

import React, { useMemo } from "react"
import { cn, sanitizeDisplayText } from "@/lib/utils"
import { ChevronRight } from "lucide-react"
import { useCostData } from "@/contexts/cost-data-context"
import { useChartConfig, getCategoryColor } from "../provider/chart-provider"
import { BasePieChart, type PieDataItem } from "../base/pie-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// ============================================
// Types
// ============================================

export interface RingSegment {
  key: string
  name: string
  value: number
  color?: string
  icon?: React.ReactNode
}

export interface CostRingChartProps {
  /** Card title */
  title: string
  /** Manual segments (bypasses context) */
  segments?: RingSegment[]
  /** Auto-load from category breakdown */
  useCategories?: boolean
  /** Center value display */
  centerValue?: string | number
  /** Center label */
  centerLabel?: string
  /** Ring size */
  size?: number
  /** Ring thickness */
  thickness?: number
  /** Title color (for center) */
  titleColor?: string
  /** Show breakdown list below chart */
  showBreakdown?: boolean
  /** Insight text */
  insight?: string
  /** Show chevron (clickable indicator) */
  showChevron?: boolean
  /** Click handler */
  onClick?: () => void
  /** Segment click handler */
  onSegmentClick?: (segment: RingSegment) => void
  /** Compact mode */
  compact?: boolean
  /** Loading state */
  loading?: boolean
  /** Additional class names */
  className?: string
}

// ============================================
// Component
// ============================================

export function CostRingChart({
  title,
  segments: propSegments,
  useCategories = false,
  centerValue,
  centerLabel,
  size = 160,
  thickness = 16,
  titleColor,
  showBreakdown = true,
  insight,
  showChevron = false,
  onClick,
  onSegmentClick,
  compact = false,
  loading: propLoading,
  className,
}: CostRingChartProps) {
  const { formatValue, formatValueCompact, theme, isLoading: contextLoading } = useChartConfig()
  const { getFilteredCategoryBreakdown } = useCostData()

  // MEMO-001 FIX: Memoize category display name mapping to prevent object recreation
  const categoryNames = useMemo<Record<string, string>>(() => ({
    genai: "GenAI",
    cloud: "Cloud",
    subscription: "Subscriptions",
  }), [])

  // Get segments from context if useCategories (uses time-filtered data)
  const segments = useMemo<RingSegment[]>(() => {
    if (propSegments) return propSegments

    if (useCategories) {
      // Use time-filtered category breakdown from context
      const breakdown = getFilteredCategoryBreakdown()
      return breakdown.map((item) => ({
        key: item.category,
        name: categoryNames[item.category] || item.category,
        value: item.total_cost,
        color: getCategoryColor(item.category as "genai" | "cloud" | "subscription", theme),
      })).filter((s) => s.value > 0)
    }

    return []
  }, [propSegments, useCategories, getFilteredCategoryBreakdown, theme, categoryNames])

  // Calculate total
  const total = useMemo(
    () => segments.reduce((sum, s) => sum + s.value, 0),
    [segments]
  )

  // Format center value
  const displayCenterValue = useMemo(() => {
    if (centerValue !== undefined) {
      return typeof centerValue === "number"
        ? (compact ? formatValueCompact(centerValue) : formatValue(centerValue))
        : centerValue
    }
    return compact ? formatValueCompact(total) : formatValue(total)
  }, [centerValue, total, compact, formatValue, formatValueCompact])

  // Convert to pie data
  const pieData: PieDataItem[] = useMemo(
    () => segments.map((s) => ({
      key: s.key,
      name: s.name,
      value: s.value,
      color: s.color,
    })),
    [segments]
  )

  // Loading state
  const isLoading = propLoading ?? contextLoading

  // Handle card click
  const handleClick = () => {
    if (onClick) onClick()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault()
      onClick()
    }
  }

  // Calculate inner/outer radius
  const outerRadius = size / 2 - 8
  const innerRadius = outerRadius - thickness

  return (
    <Card
      className={cn(
        "overflow-hidden transition-all duration-300",
        "hover:shadow-[var(--shadow-premium-md)] hover:-translate-y-0.5",
        "hover:border-[rgba(144,252,166,0.2)]",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick ? handleClick : undefined}
      onKeyDown={onClick ? handleKeyDown : undefined}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? "button" : undefined}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle
            className="text-[15px] sm:text-[17px] font-bold"
            style={{ color: titleColor || theme.text }}
          >
            {title}
          </CardTitle>
          {showChevron && (
            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400" />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn(
          "flex gap-4 sm:gap-6",
          // Mobile: stack vertically, center the chart
          // Desktop: horizontal layout with chart on left
          "flex-col items-center sm:flex-row sm:items-center"
        )}>
          {/* Ring chart - responsive size */}
          <div
            className="relative flex-shrink-0"
            style={{
              width: `min(${size}px, 50vw)`,
              height: `min(${size}px, 50vw)`,
              maxWidth: size,
              maxHeight: size,
            }}
          >
            <BasePieChart
              data={pieData}
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={3}
              size={size}
              showLegend={false}
              loading={isLoading}
              onSegmentClick={onSegmentClick ? (data) => {
                const segment = segments.find((s) => s.key === data.key)
                if (segment) onSegmentClick(segment)
              } : undefined}
            />

            {/* Center content - responsive text sizes */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-lg sm:text-xl font-bold text-slate-900">
                {displayCenterValue}
              </span>
              {centerLabel && (
                <span className="text-[10px] sm:text-xs text-slate-500">{centerLabel}</span>
              )}
            </div>
          </div>

          {/* Breakdown list - responsive layout */}
          {showBreakdown && (
            <div className="flex-1 space-y-2 sm:space-y-2.5 min-w-0 w-full sm:w-auto">
              {segments.map((segment) => {
                const percent = total > 0 ? (segment.value / total) * 100 : 0
                const isClickable = !!onSegmentClick

                return (
                  <div
                    key={segment.key}
                    className={cn(
                      "flex items-center justify-between text-xs sm:text-sm",
                      isClickable && "cursor-pointer hover:bg-slate-50 -mx-2 px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#90FCA6]"
                    )}
                    onClick={isClickable ? (e) => {
                      e.stopPropagation()
                      onSegmentClick(segment)
                    } : undefined}
                    // A11Y-001 FIX: Add keyboard accessibility for clickable segments
                    onKeyDown={isClickable ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        e.stopPropagation()
                        onSegmentClick(segment)
                      }
                    } : undefined}
                    role={isClickable ? "button" : undefined}
                    tabIndex={isClickable ? 0 : undefined}
                    aria-label={isClickable ? `${segment.name}: ${formatValue(segment.value)} (${percent.toFixed(0)}%)` : undefined}
                  >
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                      <div
                        className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: segment.color }}
                      />
                      {/* SEC-001 FIX: Sanitize segment name for defense-in-depth */}
                      <span className="text-slate-600 truncate">{sanitizeDisplayText(segment.name)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      <span className="font-medium text-slate-900 tabular-nums">
                        {compact ? formatValueCompact(segment.value) : formatValue(segment.value)}
                      </span>
                      <span className="text-slate-400 text-[10px] sm:text-xs tabular-nums w-8 sm:w-10 text-right">
                        {percent.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Insight text - responsive */}
        {insight && (
          <p className="mt-2 sm:mt-3 text-[10px] sm:text-xs text-slate-500 text-center">
            {insight}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================
// Presets
// ============================================

/**
 * Category breakdown ring (GenAI / Cloud / Subscription)
 */
export function CategoryRingChart(
  props: Omit<CostRingChartProps, "title" | "useCategories">
) {
  return (
    <CostRingChart
      title="Cost Breakdown"
      useCategories={true}
      centerLabel="Total"
      {...props}
    />
  )
}

/**
 * Compact category ring for dashboard
 */
export function CompactCategoryRing(
  props: Omit<CostRingChartProps, "title" | "useCategories" | "compact" | "size" | "thickness">
) {
  return (
    <CostRingChart
      title="Total Spend"
      useCategories={true}
      compact={true}
      size={96}
      thickness={12}
      centerLabel="MTD"
      {...props}
    />
  )
}
