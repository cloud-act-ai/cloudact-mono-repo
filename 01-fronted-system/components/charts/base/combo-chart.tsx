"use client"

/**
 * Base Combo Chart
 *
 * Composite chart combining bars and lines.
 * Ideal for showing costs with rolling averages or budget comparisons.
 */

import React, { useMemo, useState, useCallback } from "react"
import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from "recharts"
import { cn } from "@/lib/utils"
import { useChartConfig, getPaletteColor, getGradientId } from "../provider/chart-provider"
import { ChartTooltip } from "../shared/tooltip"
import { ChartLegend, CompactLegend, type LegendItem } from "../shared/legend"
import { ChartSkeleton } from "../shared/skeleton"
import { ChartEmptyState } from "../shared/empty-state"

// ============================================
// Types
// ============================================

export interface BarSeriesConfig {
  type: "bar"
  dataKey: string
  name: string
  color?: string
  stackId?: string
  radius?: number | [number, number, number, number]
  maxBarSize?: number
}

export interface LineSeriesConfig {
  type: "line"
  dataKey: string
  name: string
  color?: string
  strokeWidth?: number
  strokeDasharray?: string
  dot?: boolean
  showArea?: boolean
  areaOpacity?: number
}

export type SeriesConfig = BarSeriesConfig | LineSeriesConfig

export interface BaseComboChartProps<T extends Record<string, unknown>> {
  /** Chart data */
  data: T[]
  /** Key for X-axis */
  xAxisKey: keyof T
  /** Series configurations (bars and lines) */
  series: SeriesConfig[]
  /** Chart height */
  height?: number
  /** Show grid */
  showGrid?: boolean
  /** Show legend */
  showLegend?: boolean
  /** Use compact legend (inline with title) */
  compactLegend?: boolean
  /** X-axis formatter */
  xAxisFormatter?: (value: unknown) => string
  /** Y-axis formatter */
  yAxisFormatter?: (value: number) => string
  /** Y-axis domain */
  yAxisDomain?: [number | "auto" | "dataMin" | "dataMax", number | "auto" | "dataMin" | "dataMax"]
  /** Reference line value */
  referenceLine?: number
  /** Reference line label */
  referenceLineLabel?: string
  /** Reference line color */
  referenceLineColor?: string
  /** Enable zoom/brush */
  enableZoom?: boolean
  /** Zoom brush height */
  brushHeight?: number
  /** Initial zoom range */
  initialZoomRange?: [number, number]
  /** Zoom change callback */
  onZoomChange?: (startIndex: number, endIndex: number) => void
  /** Bar click handler */
  onBarClick?: (data: T, index: number) => void
  /** Point click handler */
  onPointClick?: (data: T, index: number) => void
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

export function BaseComboChart<T extends Record<string, unknown>>({
  data,
  xAxisKey,
  series,
  height = 280,
  showGrid = true,
  showLegend = true,
  compactLegend = false,
  xAxisFormatter,
  yAxisFormatter,
  yAxisDomain,
  referenceLine,
  referenceLineLabel,
  referenceLineColor,
  enableZoom = false,
  brushHeight = 40,
  initialZoomRange,
  onZoomChange,
  onBarClick,
  onPointClick,
  animate = true,
  loading = false,
  emptyMessage,
  className,
}: BaseComboChartProps<T>) {
  const { formatValueCompact, theme, setTimeRange } = useChartConfig()

  // Zoom state
  const [brushRange, setBrushRange] = useState<{ startIndex?: number; endIndex?: number }>({
    startIndex: initialZoomRange?.[0],
    endIndex: initialZoomRange?.[1],
  })

  // Assign colors
  const processedSeries = useMemo(() => {
    let barIndex = 0

    return series.map((s) => {
      if (s.type === "bar") {
        const color = s.color || getPaletteColor(barIndex++, theme)
        return { ...s, color }
      } else {
        const color = s.color || theme.accent
        return { ...s, color }
      }
    })
  }, [series, theme])

  const bars = processedSeries.filter((s): s is BarSeriesConfig & { color: string } => s.type === "bar")
  const lines = processedSeries.filter((s): s is LineSeriesConfig & { color: string } => s.type === "line")

  // Default Y-axis formatter
  const defaultYAxisFormatter = yAxisFormatter || formatValueCompact

  // Calculate Y-axis domain with padding
  const calculatedDomain = useMemo(() => {
    if (yAxisDomain) return yAxisDomain

    const allValues = data.flatMap((d) =>
      processedSeries.map((s) => Number(d[s.dataKey]) || 0)
    )
    if (allValues.length === 0) return [0, 100]

    const maxVal = Math.max(...allValues)
    const minVal = Math.min(...allValues, 0)
    const padding = (maxVal - minVal) * 0.15 || maxVal * 0.15

    return [Math.max(0, minVal - padding), maxVal + padding]
  }, [data, processedSeries, yAxisDomain])

  // Legend items
  const legendItems: LegendItem[] = useMemo(() =>
    processedSeries.map((s) => ({
      key: s.dataKey,
      name: s.name,
      color: s.color,
      active: true,
    })),
    [processedSeries]
  )

  // Compact legend items
  const compactLegendItems = useMemo(() =>
    processedSeries.map((s) => ({
      name: s.name,
      color: s.color,
    })),
    [processedSeries]
  )

  // Brush change handler - syncs with global time range
  const handleBrushChange = useCallback((range: { startIndex?: number; endIndex?: number }) => {
    setBrushRange(range)

    if (onZoomChange && range.startIndex !== undefined && range.endIndex !== undefined) {
      onZoomChange(range.startIndex, range.endIndex)
    }

    // Sync with global time range if data has date info
    if (range.startIndex !== undefined && range.endIndex !== undefined) {
      const startData = data[range.startIndex] as { date?: string }
      const endData = data[range.endIndex] as { date?: string }

      if (startData?.date && endData?.date) {
        setTimeRange("custom", {
          startDate: startData.date,
          endDate: endData.date,
        })
      }
    }
  }, [data, onZoomChange, setTimeRange])

  // Gradient definitions
  const gradientDefs = useMemo(() =>
    lines
      .filter((line) => line.showArea)
      .map((line) => ({
        id: getGradientId(line.color, line.dataKey),
        color: line.color,
      })),
    [lines]
  )

  // Loading state
  if (loading) {
    return <ChartSkeleton height={height} variant="bar" showLegend={showLegend} className={className} />
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

  // Adjust height for brush
  const chartHeight = enableZoom ? height + brushHeight + 20 : height

  return (
    <div className={cn("w-full", className)}>
      {/* Compact legend (inline) */}
      {showLegend && compactLegend && (
        <CompactLegend items={compactLegendItems} className="mb-2" />
      )}

      <ResponsiveContainer width="100%" height={chartHeight}>
        <ComposedChart
          data={data}
          margin={{ top: 5, right: 20, left: 10, bottom: enableZoom ? 5 : 5 }}
        >
          {/* Gradients */}
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
                <stop offset="0%" stopColor={grad.color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={grad.color} stopOpacity={0} />
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
            domain={calculatedDomain}
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
            cursor={{ fill: "rgba(0, 0, 0, 0.04)" }}
          />

          {/* Area fills (behind everything) */}
          {lines
            .filter((line) => line.showArea)
            .map((line) => (
              <Area
                key={`area-${line.dataKey}`}
                type="monotone"
                dataKey={line.dataKey}
                stroke="none"
                fill={`url(#${getGradientId(line.color, line.dataKey)})`}
                fillOpacity={line.areaOpacity || 1}
                animationDuration={animate ? 700 : 0}
              />
            ))}

          {/* Bars */}
          {bars.map((bar) => (
            <Bar
              key={bar.dataKey}
              dataKey={bar.dataKey}
              name={bar.name}
              fill={bar.color}
              stackId={bar.stackId}
              radius={bar.radius || [4, 4, 0, 0]}
              maxBarSize={bar.maxBarSize || 50}
              animationDuration={animate ? 700 : 0}
              onClick={(data, index) => {
                if (onBarClick) {
                  onBarClick(data as unknown as T, index)
                }
              }}
              cursor={onBarClick ? "pointer" : undefined}
            />
          ))}

          {/* Lines */}
          {lines.map((line) => (
            <Line
              key={line.dataKey}
              type="monotone"
              dataKey={line.dataKey}
              name={line.name}
              stroke={line.color}
              strokeWidth={line.strokeWidth || 2}
              strokeDasharray={line.strokeDasharray}
              dot={line.dot ? { r: 3, fill: line.color, strokeWidth: 0 } : false}
              activeDot={{
                r: 5,
                fill: line.color,
                strokeWidth: 2,
                stroke: "#fff",
                onClick: (event: unknown) => {
                  if (onPointClick && event) {
                    const dotEvent = event as { payload?: T; index?: number }
                    if (dotEvent.payload) {
                      onPointClick(dotEvent.payload, dotEvent.index || 0)
                    }
                  }
                },
                cursor: onPointClick ? "pointer" : undefined,
              }}
              animationDuration={animate ? 700 : 0}
            />
          ))}

          {/* Zoom/Brush - shows mini preview chart */}
          {enableZoom && (
            <Brush
              dataKey={xAxisKey as string}
              height={brushHeight}
              stroke={theme.primary}
              fill={theme.background}
              travellerWidth={10}
              startIndex={brushRange.startIndex}
              endIndex={brushRange.endIndex}
              onChange={handleBrushChange}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Full legend (bottom) */}
      {showLegend && !compactLegend && (
        <ChartLegend items={legendItems} className="mt-3" />
      )}
    </div>
  )
}
