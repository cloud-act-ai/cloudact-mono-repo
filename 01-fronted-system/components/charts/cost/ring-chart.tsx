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
import { cn } from "@/lib/utils"
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
  const costData = useCostData()

  // Get segments from context if useCategories
  const segments = useMemo<RingSegment[]>(() => {
    if (propSegments) return propSegments

    if (useCategories && costData.totalCosts) {
      return [
        {
          key: "genai",
          name: "GenAI",
          value: costData.totalCosts.genai?.total_monthly_cost ?? 0,
          color: getCategoryColor("genai", theme),
        },
        {
          key: "cloud",
          name: "Cloud",
          value: costData.totalCosts.cloud?.total_monthly_cost ?? 0,
          color: getCategoryColor("cloud", theme),
        },
        {
          key: "subscription",
          name: "Subscriptions",
          value: costData.totalCosts.subscription?.total_monthly_cost ?? 0,
          color: getCategoryColor("subscription", theme),
        },
      ].filter((s) => s.value > 0)
    }

    return []
  }, [propSegments, useCategories, costData.totalCosts, theme])

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
            className="text-[17px] font-bold"
            style={{ color: titleColor || theme.text }}
          >
            {title}
          </CardTitle>
          {showChevron && (
            <ChevronRight className="h-5 w-5 text-slate-400" />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn(
          "flex items-center gap-6",
          compact ? "flex-row" : "flex-row"
        )}>
          {/* Ring chart - larger, takes 50% */}
          <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
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

            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-bold text-slate-900">
                {displayCenterValue}
              </span>
              {centerLabel && (
                <span className="text-xs text-slate-500">{centerLabel}</span>
              )}
            </div>
          </div>

          {/* Breakdown list - takes remaining 50% on right */}
          {showBreakdown && (
            <div className="flex-1 space-y-2.5 min-w-0">
              {segments.map((segment) => {
                const percent = total > 0 ? (segment.value / total) * 100 : 0

                return (
                  <div
                    key={segment.key}
                    className={cn(
                      "flex items-center justify-between text-sm",
                      onSegmentClick && "cursor-pointer hover:bg-slate-50 -mx-2 px-2 py-1 rounded"
                    )}
                    onClick={onSegmentClick ? (e) => {
                      e.stopPropagation()
                      onSegmentClick(segment)
                    } : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: segment.color }}
                      />
                      <span className="text-slate-600">{segment.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 tabular-nums">
                        {compact ? formatValueCompact(segment.value) : formatValue(segment.value)}
                      </span>
                      <span className="text-slate-400 text-xs tabular-nums w-10 text-right">
                        {percent.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Insight text */}
        {insight && (
          <p className="mt-3 text-xs text-slate-500 text-center">
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
