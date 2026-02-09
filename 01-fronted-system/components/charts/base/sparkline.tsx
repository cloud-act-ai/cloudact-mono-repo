"use client"

/**
 * Sparkline Chart
 *
 * Minimal line chart for inline use in metric cards.
 * Uses Recharts for consistent rendering.
 *
 * DATA-001: Safe number handling for edge cases
 */

import React, { useMemo } from "react"
import {
  LineChart,
  Line,
  Area,
  ResponsiveContainer,
  YAxis,
} from "recharts"
import { cn } from "@/lib/utils"
import { useChartConfig } from "../provider/chart-provider"

// ============================================
// Types
// ============================================

export interface SparklineChartProps {
  /** Data points (array of numbers) */
  data: number[]
  /** Line color */
  color?: string
  /** Width */
  width?: number
  /** Height */
  height?: number
  /** Show area fill under line */
  showArea?: boolean
  /** Area fill opacity */
  areaOpacity?: number
  /** Curve type */
  curveType?: "linear" | "monotone"
  /** Show dot at the end */
  showEndDot?: boolean
  /** End dot size */
  endDotSize?: number
  /** Animate on mount */
  animate?: boolean
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

export function SparklineChart({
  data,
  color,
  width = 120,
  height = 40,
  showArea = true,
  areaOpacity = 0.2,
  curveType = "monotone",
  showEndDot = true,
  endDotSize = 4,
  animate = true,
  className,
}: SparklineChartProps) {
  const { theme } = useChartConfig()
  const lineColor = color || theme.categories.genai

  // Transform data to chart format
  // DATA-001: Apply safeNumber to all values
  const chartData = useMemo(() =>
    data.map((value, index) => ({
      index,
      value: safeNumber(value),
    })),
    [data]
  )

  // Calculate domain with padding
  // DATA-001: Use safe values
  const [min, max] = useMemo(() => {
    const safeData = data.map(safeNumber)
    if (safeData.length === 0) return [0, 100]
    const minVal = Math.min(...safeData)
    const maxVal = Math.max(...safeData)
    const padding = (maxVal - minVal) * 0.1 || 10
    return [minVal - padding, maxVal + padding]
  }, [data])

  // Gradient ID
  const gradientId = `sparkline-gradient-${lineColor.replace("#", "")}`

  if (data.length === 0) {
    return (
      <div
        className={cn("flex items-center justify-center", className)}
        style={{ width, height }}
      >
        <div className="h-px w-full bg-slate-200" />
      </div>
    )
  }

  return (
    <div className={cn("overflow-hidden", className)} style={{ width, height }}>
      {/* FIX BUG-002: Add minWidth to prevent Recharts -1 dimension warning */}
      <ResponsiveContainer width="100%" height="100%" minWidth={50}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: showEndDot ? 8 : 2, bottom: 5, left: 2 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={lineColor}
                stopOpacity={areaOpacity}
              />
              <stop
                offset="100%"
                stopColor={lineColor}
                stopOpacity={0}
              />
            </linearGradient>
          </defs>

          <YAxis
            hide
            domain={[min, max]}
          />

          {/* Area fill */}
          {showArea && (
            <Area
              type={curveType}
              dataKey="value"
              stroke="none"
              fill={`url(#${gradientId})`}
              animationDuration={animate ? 500 : 0}
            />
          )}

          {/* Line */}
          <Line
            type={curveType}
            dataKey="value"
            stroke={lineColor}
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
            animationDuration={animate ? 500 : 0}
          />

          {/* End dot */}
          {showEndDot && chartData.length > 0 && (
            <Line
              type={curveType}
              dataKey="value"
              stroke="none"
              dot={(props) => {
                const { cx, cy, index } = props
                // Only show dot for the last point
                if (index !== chartData.length - 1) return null

                return (
                  <g>
                    {/* Glow effect */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={endDotSize + 4}
                      fill={lineColor}
                      opacity={0.2}
                    />
                    {/* White ring */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={endDotSize + 1}
                      fill="#fff"
                    />
                    {/* Colored dot */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={endDotSize}
                      fill={lineColor}
                    />
                  </g>
                )
              }}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ============================================
// Trend Sparkline (with direction indicator)
// ============================================

export interface TrendSparklineProps extends Omit<SparklineChartProps, "color"> {
  /** Override automatic trend detection */
  trend?: "up" | "down" | "flat"
  /** Invert colors (down = bad, up = good) - for metrics where higher is better */
  invertColors?: boolean
}

export function TrendSparkline({
  data,
  trend: overrideTrend,
  invertColors = false,
  ...props
}: TrendSparklineProps) {
  const { theme } = useChartConfig()

  // Determine trend from data
  // DATA-001: Use safe values for trend calculation
  const trend = useMemo(() => {
    if (overrideTrend) return overrideTrend
    if (data.length < 2) return "flat"

    const first = safeNumber(data[0])
    const last = safeNumber(data[data.length - 1])

    // Guard against division by zero
    if (first === 0) return last > 0 ? "up" : "flat"

    const change = ((last - first) / first) * 100

    // Guard against NaN/Infinity
    if (!Number.isFinite(change)) return "flat"

    if (change > 5) return "up"
    if (change < -5) return "down"
    return "flat"
  }, [data, overrideTrend])

  // Color based on trend
  // Default: up = red (bad for costs), down = green (good for costs)
  // Inverted: up = green (good), down = red (bad)
  const color = useMemo(() => {
    switch (trend) {
      case "up":
        return invertColors ? "#10B981" : "#EF4444"
      case "down":
        return invertColors ? "#EF4444" : "#10B981"
      default:
        return theme.mutedText
    }
  }, [trend, theme, invertColors])

  return <SparklineChart data={data} color={color} {...props} />
}

// ============================================
// Mini Bar Sparkline
// ============================================

export interface MiniBarSparklineProps {
  /** Data points */
  data: number[]
  /** Bar color */
  color?: string
  /** Width */
  width?: number
  /** Height */
  height?: number
  /** Gap between bars */
  gap?: number
  /** Additional class names */
  className?: string
}

export function MiniBarSparkline({
  data,
  color,
  width = 60,
  height = 24,
  gap = 2,
  className,
}: MiniBarSparklineProps) {
  const { theme } = useChartConfig()
  const barColor = color || theme.categories.genai

  // DATA-001: Use safe values
  const safeData = useMemo(() => data.map(safeNumber), [data])
  const max = Math.max(...safeData, 1)
  const barWidth = (width - gap * (data.length - 1)) / data.length

  return (
    <div
      className={cn("flex items-end", className)}
      style={{ width, height, gap }}
      role="img"
      aria-label={`Mini bar chart with ${data.length} bars`}
    >
      {safeData.map((value, index) => (
        <div
          key={index}
          className="rounded-t"
          style={{
            width: barWidth,
            height: `${(value / max) * 100}%`,
            backgroundColor: barColor,
            opacity: 0.7 + (index / data.length) * 0.3,
          }}
        />
      ))}
    </div>
  )
}
