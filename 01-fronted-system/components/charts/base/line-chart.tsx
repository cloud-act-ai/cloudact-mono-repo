"use client"

/**
 * Base Line Chart
 *
 * Configurable line chart supporting:
 * - Multiple lines
 * - Area fill
 * - Custom curve types
 * - Zoom/brush integration
 * - Currency formatting from context
 *
 * ENT-001: Wrapped with ChartErrorBoundary for resilience
 * DATA-001: Safe number handling for edge cases
 */

import React, { useMemo, useId } from "react"
import {
  LineChart as RechartsLineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import { cn } from "@/lib/utils"
import { useChartConfig, getPaletteColor, getGradientId } from "../provider/chart-provider"
import { ChartTooltip } from "../shared/tooltip"
import { ChartLegend, type LegendItem } from "../shared/legend"
import { ChartSkeleton } from "../shared/skeleton"
import { ChartEmptyState } from "../shared/empty-state"
import { ChartErrorBoundary } from "../chart-error-boundary"

// ============================================
// Types
// ============================================

export interface LineConfig {
  /** Data key to access value */
  dataKey: string
  /** Display name */
  name: string
  /** Line color (defaults to palette) */
  color?: string
  /** Stroke width */
  strokeWidth?: number
  /** Dash pattern (e.g., "5 5" for dashed) */
  strokeDasharray?: string
  /** Show dots on data points */
  dot?: boolean
  /** Dot size */
  dotSize?: number
  /** Show area fill under line */
  showArea?: boolean
  /** Area fill opacity */
  areaOpacity?: number
}

export interface BaseLineChartProps<T extends Record<string, unknown>> {
  /** Chart data */
  data: T[]
  /** Key for X-axis */
  xAxisKey: keyof T
  /** Line configurations */
  lines: LineConfig[]
  /** Chart height */
  height?: number
  /** Show grid lines */
  showGrid?: boolean
  /** Show legend */
  showLegend?: boolean
  /** Line curve type */
  curveType?: "linear" | "monotone" | "step" | "natural"
  /** Custom X-axis formatter */
  xAxisFormatter?: (value: unknown) => string
  /** Custom Y-axis formatter */
  yAxisFormatter?: (value: number) => string
  /** Y-axis domain */
  yAxisDomain?: [number | "auto", number | "auto"]
  /** Reference line value (e.g., budget) */
  referenceLine?: number
  /** Reference line label */
  referenceLineLabel?: string
  /** Reference line color */
  referenceLineColor?: string
  /** Click handler for points */
  onPointClick?: (data: T, lineKey: string, index: number) => void
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
// Helpers
// ============================================

/**
 * DATA-001: Safe number extraction that handles NaN/Infinity/null/undefined
 */
function safeNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return value
}

// ============================================
// Component
// ============================================

function BaseLineChartInner<T extends Record<string, unknown>>({
  data,
  xAxisKey,
  lines,
  height = 280,
  showGrid = true,
  showLegend = false,
  curveType = "monotone",
  xAxisFormatter,
  yAxisFormatter,
  yAxisDomain,
  referenceLine,
  referenceLineLabel,
  referenceLineColor,
  onPointClick,
  animate = true,
  loading = false,
  emptyMessage,
  className,
}: BaseLineChartProps<T>) {
  const { formatValueCompact, theme } = useChartConfig()
  const chartId = useId() // A11Y-001: Unique ID for ARIA relationships

  // CHART-001 FIX: Assign colors with fallback to prevent null/undefined in SVG gradients
  const linesWithColors = useMemo(() =>
    lines.map((line, index) => ({
      ...line,
      // Use provided color, or palette color, or fallback to safe default
      color: line.color || getPaletteColor(index, theme) || "#94a3b8",
    })),
    [lines, theme]
  )

  // Default Y-axis formatter
  const defaultYAxisFormatter = yAxisFormatter || formatValueCompact

  // Legend items
  const legendItems: LegendItem[] = useMemo(() =>
    linesWithColors.map((line) => ({
      key: line.dataKey,
      name: line.name,
      color: line.color!,
      active: true,
    })),
    [linesWithColors]
  )

  // Generate unique gradient IDs
  const gradientDefs = useMemo(() =>
    linesWithColors
      .filter((line) => line.showArea)
      .map((line) => ({
        id: getGradientId(line.color!, line.dataKey),
        color: line.color!,
      })),
    [linesWithColors]
  )

  // Loading state
  if (loading) {
    return <ChartSkeleton height={height} variant="line" className={className} />
  }

  // Empty state
  if (!data || data.length === 0) {
    return (
      <ChartEmptyState
        height={height}
        variant="line"
        message={emptyMessage}
        className={className}
      />
    )
  }

  // A11Y-001: Screen reader summary
  const a11ySummary = `Line chart with ${linesWithColors.length} series and ${data.length} data points`

  return (
    <div
      className={cn("w-full min-w-0", className)}
      role="img"
      aria-label={a11ySummary}
      id={chartId}
    >
      {/* FIX BUG-002: Add minWidth to prevent Recharts -1 dimension warning */}
      <ResponsiveContainer width="100%" height={height} minWidth={100}>
        <RechartsLineChart
          data={data}
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          {/* Gradient definitions for area fills */}
          <defs>
            {gradientDefs.map((grad) => (
              <linearGradient
                key={grad.id}
                id={grad.id}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={grad.color}
                  stopOpacity={0.3}
                />
                <stop
                  offset="100%"
                  stopColor={grad.color}
                  stopOpacity={0}
                />
              </linearGradient>
            ))}
          </defs>

          {/* Grid */}
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={theme.grid}
              vertical={false}
            />
          )}

          {/* Axes */}
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

          {/* Reference line */}
          {referenceLine !== undefined && (
            <ReferenceLine
              y={referenceLine}
              stroke={referenceLineColor || theme.accent}
              strokeDasharray="5 5"
              strokeWidth={1.5}
              label={
                referenceLineLabel
                  ? {
                      value: referenceLineLabel,
                      position: "right",
                      fill: theme.mutedText,
                      fontSize: 11,
                    }
                  : undefined
              }
            />
          )}

          {/* Tooltip */}
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
          />

          {/* Area fills (rendered first, behind lines) */}
          {linesWithColors
            .filter((line) => line.showArea)
            .map((line) => (
              <Area
                key={`area-${line.dataKey}`}
                type={curveType}
                dataKey={line.dataKey}
                stroke="none"
                fill={`url(#${getGradientId(line.color!, line.dataKey)})`}
                fillOpacity={line.areaOpacity || 1}
                animationDuration={animate ? 700 : 0}
              />
            ))}

          {/* Lines */}
          {linesWithColors.map((line) => (
            <Line
              key={line.dataKey}
              type={curveType}
              dataKey={line.dataKey}
              name={line.name}
              stroke={line.color}
              strokeWidth={line.strokeWidth || 2}
              strokeDasharray={line.strokeDasharray}
              dot={
                line.dot
                  ? {
                      r: line.dotSize || 4,
                      fill: line.color,
                      strokeWidth: 2,
                      stroke: "#fff",
                    }
                  : false
              }
              activeDot={{
                r: 6,
                fill: line.color,
                strokeWidth: 2,
                stroke: "#fff",
                onClick: (event: unknown) => {
                  if (onPointClick && event) {
                    const dotEvent = event as { payload?: T; index?: number }
                    if (dotEvent.payload) {
                      onPointClick(
                        dotEvent.payload,
                        line.dataKey,
                        dotEvent.index || 0
                      )
                    }
                  }
                },
                cursor: onPointClick ? "pointer" : undefined,
              }}
              animationDuration={animate ? 700 : 0}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>

      {/* Legend */}
      {showLegend && <ChartLegend items={legendItems} className="mt-3" />}
    </div>
  )
}

/**
 * ENT-001: Wrapped component with error boundary for resilience
 * Prevents chart crashes from affecting the entire dashboard
 */
export function BaseLineChart<T extends Record<string, unknown>>(
  props: BaseLineChartProps<T>
) {
  return (
    <ChartErrorBoundary chartTitle="Line Chart" minHeight={props.height ?? 280}>
      <BaseLineChartInner {...props} />
    </ChartErrorBoundary>
  )
}

// ============================================
// Area Chart (alias with area fill enabled)
// ============================================

export function BaseAreaChart<T extends Record<string, unknown>>(
  props: BaseLineChartProps<T>
) {
  const linesWithArea = props.lines.map((line) => ({
    ...line,
    showArea: true,
  }))

  return <BaseLineChart {...props} lines={linesWithArea} />
}
