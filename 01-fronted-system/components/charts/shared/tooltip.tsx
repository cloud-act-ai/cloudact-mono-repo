"use client"

/**
 * Chart Tooltip
 *
 * Premium tooltip component with:
 * - Smooth entrance animations
 * - Glassmorphism styling
 * - Smart positioning
 * - Currency formatting
 */

import React from "react"
import { cn } from "@/lib/utils"
import { useChartConfig } from "../provider/chart-provider"

// ============================================
// Types
// ============================================

export interface TooltipPayloadItem {
  name: string
  value: number
  color?: string
  dataKey?: string
  payload?: Record<string, unknown>
}

export interface ChartTooltipProps {
  /** Whether tooltip is active */
  active?: boolean
  /** Tooltip payload from Recharts */
  payload?: TooltipPayloadItem[]
  /** Label (usually X-axis value) */
  label?: string
  /** Hide the label */
  hideLabel?: boolean
  /** Custom label formatter */
  labelFormatter?: (label: string) => string
  /** Custom value formatter (overrides currency formatting) */
  valueFormatter?: (value: number, name: string) => string
  /** Show indicator dots */
  showIndicator?: boolean
  /** Indicator style */
  indicator?: "dot" | "line" | "dashed"
  /** Additional content */
  footer?: React.ReactNode
  /** Custom class name */
  className?: string
}

// ============================================
// Component
// ============================================

export function ChartTooltip({
  active,
  payload,
  label,
  hideLabel = false,
  labelFormatter,
  valueFormatter,
  showIndicator = true,
  indicator = "dot",
  footer,
  className,
}: ChartTooltipProps) {
  const { formatValue, theme } = useChartConfig()

  if (!active || !payload?.length) {
    return null
  }

  // Deduplicate payload by dataKey first, then name (Recharts can send duplicates for overlaid charts)
  const uniquePayload = payload.filter(
    (item, index, self) =>
      index === self.findIndex((t) =>
        (t.dataKey && item.dataKey) ? t.dataKey === item.dataKey : t.name === item.name
      )
  )

  const displayLabel = labelFormatter ? labelFormatter(label || "") : label

  return (
    <div
      className={cn(
        // Premium glassmorphism style
        "relative overflow-hidden",
        "rounded-xl border border-white/20",
        "bg-white/95 backdrop-blur-xl",
        "px-3.5 py-2.5",
        "min-w-[160px]",
        // Smooth entrance animation
        "animate-in fade-in-0 zoom-in-95 duration-200",
        className
      )}
      style={{
        boxShadow: theme.shadows.tooltip,
      }}
    >
      {/* Subtle gradient overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          background: `linear-gradient(135deg, ${theme.primary} 0%, transparent 50%)`,
        }}
      />

      {/* Label - show date from payload if available */}
      {!hideLabel && (
        <div className="relative mb-2 pb-2 border-b border-[var(--border-subtle)]">
          {/* Try to get full date from payload for better formatting */}
          {(() => {
            const firstPayload = uniquePayload[0]?.payload
            const dateValue = firstPayload?.date as string | undefined
            if (dateValue) {
              const date = new Date(dateValue)
              if (isNaN(date.getTime())) return null
              const formattedDate = date.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric"
              })
              return (
                <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                  {formattedDate}
                </span>
              )
            }
            return displayLabel ? (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                {displayLabel}
              </span>
            ) : null
          })()}
        </div>
      )}

      {/* Data items */}
      <div className="relative space-y-1.5">
        {uniquePayload.map((item, index) => (
          <TooltipItem
            key={`${item.dataKey || ''}-${item.name || ''}-${index}`}
            item={item}
            showIndicator={showIndicator}
            indicator={indicator}
            valueFormatter={valueFormatter}
            formatValue={formatValue}
          />
        ))}
      </div>

      {/* Footer */}
      {footer && (
        <div className="relative mt-2.5 pt-2 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-tertiary)]">
          {footer}
        </div>
      )}
    </div>
  )
}

// ============================================
// Tooltip Item
// ============================================

interface TooltipItemProps {
  item: TooltipPayloadItem
  showIndicator: boolean
  indicator: "dot" | "line" | "dashed"
  valueFormatter?: (value: number, name: string) => string
  formatValue: (value: number) => string
}

function TooltipItem({
  item,
  showIndicator,
  indicator,
  valueFormatter,
  formatValue,
}: TooltipItemProps) {
  const formattedValue = valueFormatter
    ? valueFormatter(item.value, item.name)
    : formatValue(item.value)

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {showIndicator && (
          <TooltipIndicator color={item.color} variant={indicator} />
        )}
        <span className="text-[var(--text-secondary)]">{item.name}</span>
      </div>
      <span className="font-medium text-[var(--text-primary)] tabular-nums">
        {formattedValue}
      </span>
    </div>
  )
}

// ============================================
// Indicator
// ============================================

interface TooltipIndicatorProps {
  color?: string
  variant: "dot" | "line" | "dashed"
}

function TooltipIndicator({ color, variant }: TooltipIndicatorProps) {
  const baseStyle = { backgroundColor: color }

  if (variant === "dot") {
    return (
      <div
        className="h-2.5 w-2.5 rounded-full shrink-0"
        style={baseStyle}
      />
    )
  }

  if (variant === "line") {
    return (
      <div
        className="h-3 w-1 rounded shrink-0"
        style={baseStyle}
      />
    )
  }

  if (variant === "dashed") {
    return (
      <div
        className="h-3 w-0 border-l-2 border-dashed shrink-0"
        style={{ borderColor: color }}
      />
    )
  }

  return null
}

// ============================================
// Simple Tooltip (for sparklines)
// ============================================

interface SimpleTooltipProps {
  value: number
  label?: string
  color?: string
  className?: string
}

export function SimpleTooltip({
  value,
  label,
  color: _color,
  className,
}: SimpleTooltipProps) {
  const { formatValue } = useChartConfig()

  return (
    <div
      className={cn(
        "rounded-md bg-[var(--text-primary)] px-2 py-1 text-xs text-white shadow-lg",
        className
      )}
    >
      {label && <div className="text-[var(--text-muted)] text-[10px]">{label}</div>}
      <div className="font-medium tabular-nums">{formatValue(value)}</div>
    </div>
  )
}
