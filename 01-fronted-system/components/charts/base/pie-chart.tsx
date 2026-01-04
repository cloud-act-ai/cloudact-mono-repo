"use client"

/**
 * Base Pie Chart
 *
 * Configurable pie/donut chart supporting:
 * - Pie and donut (ring) variants
 * - Custom center content
 * - Animated segments
 * - Interactive click handling
 * - Currency formatting from context
 */

import React, { useMemo, useState } from "react"
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Sector,
} from "recharts"
import { cn } from "@/lib/utils"
import { useChartConfig, getPaletteColor } from "../provider/chart-provider"
import { ChartTooltip } from "../shared/tooltip"
import { ChartLegend, type LegendItem } from "../shared/legend"
import { ChartSkeleton } from "../shared/skeleton"
import { ChartEmptyState } from "../shared/empty-state"

// ============================================
// Types
// ============================================

export interface PieDataItem {
  /** Unique key */
  key: string
  /** Display name */
  name: string
  /** Value */
  value: number
  /** Color (defaults to palette) */
  color?: string
  /** Additional metadata */
  [key: string]: unknown
}

export interface BasePieChartProps {
  /** Chart data */
  data: PieDataItem[]
  /** Inner radius (0 = pie, >0 = donut) */
  innerRadius?: number | string
  /** Outer radius */
  outerRadius?: number | string
  /** Start angle (degrees, 90 = top) */
  startAngle?: number
  /** End angle (degrees) */
  endAngle?: number
  /** Gap between segments (degrees) */
  paddingAngle?: number
  /** Chart size (width = height) */
  size?: number
  /** Show legend */
  showLegend?: boolean
  /** Legend position */
  legendPosition?: "bottom" | "right"
  /** Show labels on segments */
  showLabels?: boolean
  /** Label type */
  labelType?: "percent" | "value" | "name"
  /** Center content (for donut) */
  centerContent?: React.ReactNode
  /** Show active segment highlight on hover */
  showActiveShape?: boolean
  /** Click handler */
  onSegmentClick?: (data: PieDataItem, index: number) => void
  /** Animation */
  animate?: boolean
  /** Loading state */
  loading?: boolean
  /** Empty message */
  emptyMessage?: string
  /** Additional class names */
  className?: string
}

// ============================================
// Component
// ============================================

export function BasePieChart({
  data,
  innerRadius = 0,
  outerRadius = "80%",
  startAngle = 90,
  endAngle = -270,
  paddingAngle = 2,
  size = 280,
  showLegend = true,
  legendPosition = "bottom",
  showLabels = false,
  labelType = "percent",
  centerContent,
  showActiveShape = true,
  onSegmentClick,
  animate = true,
  loading = false,
  emptyMessage,
  className,
}: BasePieChartProps) {
  const { formatValueCompact, theme } = useChartConfig()
  const [activeIndex, setActiveIndex] = useState<number | undefined>()

  // Filter out zero values and assign colors
  const processedData = useMemo(() => {
    const filtered = data.filter((item) => item.value > 0)
    return filtered.map((item, index) => ({
      ...item,
      color: item.color || getPaletteColor(index, theme),
    }))
  }, [data, theme])

  // Calculate total
  const total = useMemo(
    () => processedData.reduce((sum, item) => sum + item.value, 0),
    [processedData]
  )

  // Legend items
  const legendItems: LegendItem[] = useMemo(() =>
    processedData.map((item) => ({
      key: item.key,
      name: item.name,
      color: item.color!,
      value: formatValueCompact(item.value),
      active: true,
    })),
    [processedData, formatValueCompact]
  )

  // Label renderer
  const renderLabel = (rawProps: unknown) => {
    if (!showLabels) return null

    const props = rawProps as {
      cx?: number
      cy?: number
      midAngle?: number
      innerRadius?: number
      outerRadius?: number
      percent?: number
      name?: string
      value?: number
    }

    // Type guards for required properties
    if (
      typeof props.cx !== "number" ||
      typeof props.cy !== "number" ||
      typeof props.midAngle !== "number" ||
      typeof props.innerRadius !== "number" ||
      typeof props.outerRadius !== "number" ||
      typeof props.percent !== "number"
    ) {
      return null
    }

    const RADIAN = Math.PI / 180
    const radius = props.innerRadius + (props.outerRadius - props.innerRadius) * 0.5
    const x = props.cx + radius * Math.cos(-props.midAngle * RADIAN)
    const y = props.cy + radius * Math.sin(-props.midAngle * RADIAN)

    let labelText = ""
    switch (labelType) {
      case "percent":
        labelText = `${(props.percent * 100).toFixed(0)}%`
        break
      case "value":
        labelText = formatValueCompact(props.value || 0)
        break
      case "name":
        labelText = props.name || ""
        break
    }

    // Only show labels for segments > 5%
    if (props.percent < 0.05) return null

    return (
      <text
        x={x}
        y={y}
        fill="#fff"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={500}
      >
        {labelText}
      </text>
    )
  }

  // Active shape renderer (hover highlight)
  const renderActiveShape = (rawProps: unknown): React.ReactElement => {
    const props = rawProps as {
      cx?: number
      cy?: number
      innerRadius?: number
      outerRadius?: number
      startAngle?: number
      endAngle?: number
      fill?: string
    }

    // Type guards for required properties - return empty group if missing
    if (
      typeof props.cx !== "number" ||
      typeof props.cy !== "number" ||
      typeof props.innerRadius !== "number" ||
      typeof props.outerRadius !== "number" ||
      typeof props.startAngle !== "number" ||
      typeof props.endAngle !== "number" ||
      typeof props.fill !== "string"
    ) {
      return <g />
    }

    const {
      cx,
      cy,
      innerRadius: ir,
      outerRadius: or,
      startAngle: sa,
      endAngle: ea,
      fill,
    } = props

    return (
      <g>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={ir}
          outerRadius={or + 6}
          startAngle={sa}
          endAngle={ea}
          fill={fill}
          opacity={1}
        />
        <Sector
          cx={cx}
          cy={cy}
          startAngle={sa}
          endAngle={ea}
          innerRadius={or + 8}
          outerRadius={or + 10}
          fill={fill}
          opacity={0.3}
        />
      </g>
    )
  }

  // Loading state
  if (loading) {
    return <ChartSkeleton height={size} variant="pie" className={className} />
  }

  // Empty state
  if (!processedData || processedData.length === 0) {
    return (
      <ChartEmptyState
        height={size}
        variant="pie"
        message={emptyMessage}
        className={className}
      />
    )
  }

  const isVerticalLegend = legendPosition === "right"
  const chartSize = isVerticalLegend ? size : size

  return (
    <div
      className={cn(
        "w-full",
        isVerticalLegend && "flex items-center gap-6",
        className
      )}
    >
      {/* Chart */}
      <div className="relative" style={{ width: chartSize, height: chartSize }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPieChart>
            <Pie
              data={processedData}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              startAngle={startAngle}
              endAngle={endAngle}
              paddingAngle={paddingAngle}
              dataKey="value"
              nameKey="name"
              animationBegin={0}
              animationDuration={animate ? 700 : 0}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(undefined)}
              onClick={(data, index) => {
                if (onSegmentClick) {
                  onSegmentClick(data as PieDataItem, index)
                }
              }}
              cursor={onSegmentClick ? "pointer" : undefined}
              activeShape={showActiveShape && activeIndex !== undefined ? renderActiveShape : undefined}
              label={showLabels ? renderLabel : undefined}
              labelLine={false}
            >
              {processedData.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={entry.color}
                  stroke="none"
                />
              ))}
            </Pie>

            <Tooltip
              content={(props) => {
                if (!props.active || !props.payload?.length) return null
                const item = props.payload[0].payload as PieDataItem
                const percent = total > 0 ? (item.value / total) * 100 : 0

                return (
                  <ChartTooltip
                    active={true}
                    payload={[{
                      name: item.name,
                      value: item.value,
                      color: item.color,
                    }]}
                    footer={`${percent.toFixed(1)}% of total`}
                  />
                )
              }}
            />
          </RechartsPieChart>
        </ResponsiveContainer>

        {/* Center content */}
        {centerContent && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {centerContent}
          </div>
        )}
      </div>

      {/* Legend */}
      {showLegend && (
        <ChartLegend
          items={legendItems}
          layout={isVerticalLegend ? "vertical" : "horizontal"}
          showValues
          className={isVerticalLegend ? "" : "mt-4"}
        />
      )}
    </div>
  )
}

// ============================================
// Donut Chart (alias with inner radius)
// ============================================

export function BaseDonutChart(
  props: Omit<BasePieChartProps, "innerRadius">
) {
  return <BasePieChart {...props} innerRadius="60%" />
}

// ============================================
// Ring Chart (alias matching CostScoreRing style)
// ============================================

interface RingChartProps extends Omit<BasePieChartProps, "innerRadius" | "outerRadius"> {
  /** Ring thickness in pixels */
  thickness?: number
}

export function BaseRingChart({
  thickness = 12,
  size = 100,
  ...props
}: RingChartProps) {
  // Calculate inner/outer radius based on thickness
  const outerRadius = size / 2 - 5
  const innerRadius = outerRadius - thickness

  return (
    <BasePieChart
      {...props}
      size={size}
      innerRadius={innerRadius}
      outerRadius={outerRadius}
      paddingAngle={3}
      showLegend={false}
    />
  )
}
