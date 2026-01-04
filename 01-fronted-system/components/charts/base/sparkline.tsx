"use client"

/**
 * Sparkline Chart
 *
 * Minimal line chart for inline use in metric cards.
 * Uses Recharts for consistent rendering.
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
  const lineColor = color || theme.primary

  // Transform data to chart format
  const chartData = useMemo(() =>
    data.map((value, index) => ({
      index,
      value,
    })),
    [data]
  )

  // Calculate domain with padding
  const [min, max] = useMemo(() => {
    if (data.length === 0) return [0, 100]
    const minVal = Math.min(...data)
    const maxVal = Math.max(...data)
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
      <ResponsiveContainer width="100%" height="100%">
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
  const trend = useMemo(() => {
    if (overrideTrend) return overrideTrend
    if (data.length < 2) return "flat"

    const first = data[0]
    const last = data[data.length - 1]
    const change = ((last - first) / first) * 100

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
  const barColor = color || theme.primary

  const max = Math.max(...data, 1)
  const barWidth = (width - gap * (data.length - 1)) / data.length

  return (
    <div
      className={cn("flex items-end", className)}
      style={{ width, height, gap }}
    >
      {data.map((value, index) => (
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
