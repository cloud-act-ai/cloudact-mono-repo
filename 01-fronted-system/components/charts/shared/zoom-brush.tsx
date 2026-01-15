"use client"

/**
 * Zoom Brush Component
 *
 * Standalone zoom/brush control that can be used with any time-series chart.
 * Syncs with global time range filter.
 */

import React, { useState, useCallback } from "react"
import {
  AreaChart,
  Area,
  Brush,
  ResponsiveContainer,
  XAxis,
} from "recharts"
import { cn } from "@/lib/utils"
import { useChartConfig } from "../provider/chart-provider"

// ============================================
// Types
// ============================================

export interface ZoomBrushProps<T extends Record<string, unknown>> {
  /** Data array */
  data: T[]
  /** Key for X-axis (usually date) */
  xAxisKey: keyof T
  /** Key for preview line value */
  valueKey: keyof T
  /** Height of brush area */
  height?: number
  /** Initial start index */
  startIndex?: number
  /** Initial end index */
  endIndex?: number
  /** Change callback */
  onChange?: (startIndex: number, endIndex: number) => void
  /** Sync with global time range */
  syncWithTimeRange?: boolean
  /** Preview line color */
  previewColor?: string
  /** Additional class names */
  className?: string
}

// ============================================
// Component
// ============================================

export function ZoomBrush<T extends Record<string, unknown>>({
  data,
  xAxisKey,
  valueKey,
  height = 60,
  startIndex: initialStart,
  endIndex: initialEnd,
  onChange,
  syncWithTimeRange = true,
  previewColor,
  className,
}: ZoomBrushProps<T>) {
  const { theme, setTimeRange } = useChartConfig()
  const lineColor = previewColor || theme.mutedText

  const [range, setRange] = useState<{ startIndex?: number; endIndex?: number }>({
    startIndex: initialStart,
    endIndex: initialEnd ?? (data.length > 0 ? data.length - 1 : undefined),
  })

  const handleBrushChange = useCallback((newRange: { startIndex?: number; endIndex?: number }) => {
    setRange(newRange)

    if (onChange && newRange.startIndex !== undefined && newRange.endIndex !== undefined) {
      onChange(newRange.startIndex, newRange.endIndex)
    }

    // Sync with global time range
    if (syncWithTimeRange && newRange.startIndex !== undefined && newRange.endIndex !== undefined) {
      const startData = data[newRange.startIndex] as { date?: string }
      const endData = data[newRange.endIndex] as { date?: string }

      if (startData?.date && endData?.date) {
        setTimeRange("custom", {
          startDate: startData.date,
          endDate: endData.date,
        })
      }
    }
  }, [data, onChange, setTimeRange, syncWithTimeRange])

  if (data.length === 0) {
    return null
  }

  return (
    <div className={cn("w-full min-w-0", className)}>
      {/* FIX BUG-002: Add minWidth to prevent Recharts -1 dimension warning */}
      <ResponsiveContainer width="100%" height={height} minWidth={100}>
        <AreaChart
          data={data}
          margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
        >
          <defs>
            <linearGradient id="zoom-brush-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.2} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey={xAxisKey as string}
            hide
          />

          <Area
            type="monotone"
            dataKey={valueKey as string}
            stroke={lineColor}
            strokeWidth={1}
            fill="url(#zoom-brush-gradient)"
          />

          <Brush
            dataKey={xAxisKey as string}
            height={height - 20}
            stroke={theme.primary}
            fill={theme.background}
            travellerWidth={8}
            startIndex={range.startIndex}
            endIndex={range.endIndex}
            onChange={handleBrushChange}
            tickFormatter={() => ""} // Hide tick labels on brush
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ============================================
// Simple Range Slider (alternative to brush)
// ============================================

export interface RangeSliderProps {
  /** Minimum value */
  min: number
  /** Maximum value */
  max: number
  /** Current range [start, end] */
  value: [number, number]
  /** Change handler */
  onChange: (value: [number, number]) => void
  /** Format value for display */
  formatValue?: (value: number) => string
  /** Additional class names */
  className?: string
}

export function RangeSlider({
  min,
  max,
  value,
  onChange,
  formatValue,
  className,
}: RangeSliderProps) {
  const { theme } = useChartConfig()

  const startPercent = ((value[0] - min) / (max - min)) * 100
  const endPercent = ((value[1] - min) / (max - min)) * 100

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = Math.min(Number(e.target.value), value[1] - 1)
    onChange([newStart, value[1]])
  }

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEnd = Math.max(Number(e.target.value), value[0] + 1)
    onChange([value[0], newEnd])
  }

  return (
    <div className={cn("relative w-full", className)}>
      {/* Track */}
      <div className="relative h-2 bg-slate-200 rounded-full">
        {/* Selected range */}
        <div
          className="absolute h-full rounded-full"
          style={{
            left: `${startPercent}%`,
            width: `${endPercent - startPercent}%`,
            backgroundColor: theme.primary,
          }}
        />
      </div>

      {/* Sliders */}
      <input
        type="range"
        min={min}
        max={max}
        value={value[0]}
        onChange={handleStartChange}
        className="absolute w-full h-2 top-0 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-slate-300 [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-grab"
      />
      <input
        type="range"
        min={min}
        max={max}
        value={value[1]}
        onChange={handleEndChange}
        className="absolute w-full h-2 top-0 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-slate-300 [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-grab"
      />

      {/* Labels */}
      {formatValue && (
        <div className="flex justify-between mt-2 text-xs text-slate-500">
          <span>{formatValue(value[0])}</span>
          <span>{formatValue(value[1])}</span>
        </div>
      )}
    </div>
  )
}
