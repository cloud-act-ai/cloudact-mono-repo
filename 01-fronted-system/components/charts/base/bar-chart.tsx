"use client"

/**
 * Base Bar Chart
 *
 * Premium configurable bar chart with:
 * - Gradient fills and hover glow effects
 * - Smooth hover animations
 * - Horizontal and vertical layouts
 * - Stacked and grouped bars
 * - Interactive click handling
 * - Currency formatting from context
 */

import React, { useMemo, useState, useCallback } from "react"
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
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

export interface BarConfig {
  /** Data key to access value */
  dataKey: string
  /** Display name */
  name: string
  /** Bar color (defaults to palette) */
  color?: string
  /** Stack ID for stacked bars */
  stackId?: string
  /** Bar radius */
  radius?: number | [number, number, number, number]
  /** Maximum bar width */
  maxBarSize?: number
  /** Use gradient fill */
  gradient?: boolean
}

export interface BaseBarChartProps<T extends Record<string, unknown>> {
  /** Chart data */
  data: T[]
  /** Key for X-axis (category axis) */
  xAxisKey: keyof T
  /** Bar configurations */
  bars: BarConfig[]
  /** Chart layout */
  layout?: "horizontal" | "vertical"
  /** Enable stacking (uses stackId from bar config) */
  stacked?: boolean
  /** Chart height */
  height?: number
  /** Show grid lines */
  showGrid?: boolean
  /** Show legend */
  showLegend?: boolean
  /** Legend position */
  legendPosition?: "top" | "bottom"
  /** Legend variant */
  legendVariant?: "default" | "pills" | "cards"
  /** Custom X-axis formatter */
  xAxisFormatter?: (value: unknown) => string
  /** Custom Y-axis formatter */
  yAxisFormatter?: (value: number) => string
  /** Y-axis domain [min, max] */
  yAxisDomain?: [number | "auto", number | "auto"]
  /** Click handler */
  onBarClick?: (data: T, barKey: string, index: number) => void
  /** Whether to animate on mount */
  animate?: boolean
  /** Enable hover effects */
  hoverEffects?: boolean
  /** Loading state */
  loading?: boolean
  /** Empty state message */
  emptyMessage?: string
  /** Additional class names */
  className?: string
}

// ============================================
// Gradient Definitions
// ============================================

interface GradientDefsProps {
  bars: Array<{ dataKey: string; color: string; gradient?: boolean }>
}

function GradientDefs({ bars }: GradientDefsProps) {
  return (
    <defs>
      {bars.filter(b => b.gradient !== false).map((bar) => (
        <linearGradient
          key={`gradient-${bar.dataKey}`}
          id={`barGradient-${bar.dataKey}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor={bar.color} stopOpacity={1} />
          <stop offset="100%" stopColor={bar.color} stopOpacity={0.7} />
        </linearGradient>
      ))}
      {/* Glow filter for hover effect */}
      <filter id="barGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  )
}

// ============================================
// Component
// ============================================

export function BaseBarChart<T extends Record<string, unknown>>({
  data,
  xAxisKey,
  bars,
  layout = "vertical",
  stacked = false,
  height = 280,
  showGrid = true,
  showLegend = false,
  legendPosition = "bottom",
  legendVariant = "default",
  xAxisFormatter,
  yAxisFormatter,
  yAxisDomain,
  onBarClick,
  animate = true,
  hoverEffects = true,
  loading = false,
  emptyMessage,
  className,
}: BaseBarChartProps<T>) {
  const { formatValueCompact, theme } = useChartConfig()
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [hoveredBar, setHoveredBar] = useState<string | null>(null)

  // Handle mouse events for hover effects
  const handleMouseEnter = useCallback((barKey: string, index: number) => {
    if (hoverEffects) {
      setHoveredIndex(index)
      setHoveredBar(barKey)
    }
  }, [hoverEffects])

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null)
    setHoveredBar(null)
  }, [])

  // Assign colors from palette if not specified
  const barsWithColors = useMemo(() =>
    bars.map((bar, index) => ({
      ...bar,
      color: bar.color || getPaletteColor(index, theme),
      stackId: stacked ? bar.stackId || "stack" : bar.stackId,
      gradient: bar.gradient !== false, // Default to true
    })),
    [bars, stacked, theme]
  )

  // Default Y-axis formatter uses currency
  const defaultYAxisFormatter = yAxisFormatter || formatValueCompact

  // Legend items
  const legendItems: LegendItem[] = useMemo(() =>
    barsWithColors.map((bar) => ({
      key: bar.dataKey,
      name: bar.name,
      color: bar.color!,
      active: true,
    })),
    [barsWithColors]
  )

  // Loading state
  if (loading) {
    return <ChartSkeleton height={height} variant="bar" className={className} />
  }

  // Empty state
  if (!data || data.length === 0) {
    return (
      <ChartEmptyState
        height={height}
        variant="bar"
        message={emptyMessage}
        className={className}
      />
    )
  }

  // Determine if horizontal (bars go sideways) or vertical (bars go up)
  const isHorizontal = layout === "horizontal"

  return (
    <div className={cn("w-full min-w-0", className)}>
      {/* Legend at top */}
      {showLegend && legendPosition === "top" && (
        <ChartLegend
          items={legendItems}
          variant={legendVariant}
          className="mb-3"
        />
      )}

      {/* FIX BUG-002: Add minWidth to prevent Recharts -1 dimension warning */}
      <ResponsiveContainer width="100%" height={height} minWidth={100}>
        <RechartsBarChart
          data={data}
          layout={isHorizontal ? "vertical" : "horizontal"}
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          onMouseLeave={handleMouseLeave}
        >
          {/* Gradient definitions */}
          <GradientDefs bars={barsWithColors} />

          {/* Grid with premium styling */}
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={theme.grid}
              strokeOpacity={0.6}
              vertical={!isHorizontal}
              horizontal={isHorizontal}
            />
          )}

          {/* Axes with smooth transitions */}
          {isHorizontal ? (
            <>
              <XAxis
                type="number"
                tickFormatter={defaultYAxisFormatter}
                axisLine={false}
                tickLine={false}
                tick={{ fill: theme.mutedText, fontSize: 11 }}
                domain={yAxisDomain}
              />
              <YAxis
                type="category"
                dataKey={xAxisKey as string}
                axisLine={false}
                tickLine={false}
                tick={{ fill: theme.mutedText, fontSize: 11 }}
                tickFormatter={xAxisFormatter}
                width={80}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={xAxisKey as string}
                axisLine={false}
                tickLine={false}
                tick={{ fill: theme.mutedText, fontSize: 11 }}
                tickFormatter={xAxisFormatter}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: theme.mutedText, fontSize: 11 }}
                tickFormatter={defaultYAxisFormatter}
                domain={yAxisDomain}
                width={60}
              />
            </>
          )}

          {/* Premium tooltip */}
          <Tooltip
            content={(props) => (
              <ChartTooltip
                active={props.active}
                payload={props.payload?.map((p) => ({
                  name: p.name as string,
                  value: p.value as number,
                  color: p.color,
                  dataKey: p.dataKey as string,
                  payload: p.payload,
                }))}
                label={props.label as string}
              />
            )}
            cursor={{
              fill: theme.primary,
              fillOpacity: 0.08,
              radius: 4,
            }}
          />

          {/* Bars with hover effects */}
          {barsWithColors.map((bar) => (
            <Bar
              key={bar.dataKey}
              dataKey={bar.dataKey}
              name={bar.name}
              fill={bar.gradient ? `url(#barGradient-${bar.dataKey})` : bar.color}
              stackId={bar.stackId}
              radius={bar.radius || [6, 6, 0, 0]}
              maxBarSize={bar.maxBarSize || 50}
              animationDuration={animate ? 600 : 0}
              animationEasing="ease-out"
              onClick={(data, index) => {
                if (onBarClick) {
                  onBarClick(data as unknown as T, bar.dataKey, index)
                }
              }}
              cursor={onBarClick ? "pointer" : undefined}
              onMouseEnter={(_, index) => handleMouseEnter(bar.dataKey, index)}
            >
              {/* Individual cell styling for hover effects */}
              {hoverEffects && data.map((_, index) => {
                const isHovered = hoveredIndex === index && hoveredBar === bar.dataKey
                return (
                  <Cell
                    key={`cell-${bar.dataKey}-${index}`}
                    fill={bar.gradient ? `url(#barGradient-${bar.dataKey})` : bar.color}
                    fillOpacity={isHovered ? 1 : (hoveredIndex !== null ? 0.6 : 0.9)}
                    style={{
                      transition: "fill-opacity 200ms ease-out, filter 200ms ease-out",
                      filter: isHovered ? `drop-shadow(0 4px 12px ${bar.color}40)` : undefined,
                    }}
                  />
                )
              })}
            </Bar>
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>

      {/* Legend at bottom */}
      {showLegend && legendPosition === "bottom" && (
        <ChartLegend
          items={legendItems}
          variant={legendVariant}
          className="mt-3"
        />
      )}
    </div>
  )
}

// ============================================
// Horizontal Bar Chart (alias)
// ============================================

export function HorizontalBarChart<T extends Record<string, unknown>>(
  props: Omit<BaseBarChartProps<T>, "layout">
) {
  return <BaseBarChart {...props} layout="horizontal" />
}

// ============================================
// Vertical Bar Chart (alias)
// ============================================

export function VerticalBarChart<T extends Record<string, unknown>>(
  props: Omit<BaseBarChartProps<T>, "layout">
) {
  return <BaseBarChart {...props} layout="vertical" />
}
