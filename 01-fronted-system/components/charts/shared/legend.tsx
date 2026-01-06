"use client"

/**
 * Chart Legend
 *
 * Premium interactive legend component with:
 * - Smooth toggle animations
 * - Pill-style interactive items
 * - Gradient color indicators
 * - Hover glow effects
 */

import React from "react"
import { cn } from "@/lib/utils"
import { useChartConfig } from "../provider/chart-provider"

// ============================================
// Types
// ============================================

export interface LegendItem {
  /** Unique key */
  key: string
  /** Display name */
  name: string
  /** Color indicator */
  color: string
  /** Optional value */
  value?: number | string
  /** Whether item is active/visible */
  active?: boolean
  /** Optional icon */
  icon?: React.ReactNode
}

export interface ChartLegendProps {
  /** Legend items */
  items: LegendItem[]
  /** Layout direction */
  layout?: "horizontal" | "vertical"
  /** Alignment */
  align?: "left" | "center" | "right"
  /** Click handler for interactive legends */
  onClick?: (item: LegendItem) => void
  /** Whether legend is interactive */
  interactive?: boolean
  /** Show values alongside labels */
  showValues?: boolean
  /** Value formatter */
  valueFormatter?: (value: number | string) => string
  /** Visual style */
  variant?: "default" | "pills" | "cards"
  /** Size */
  size?: "sm" | "md" | "lg"
  /** Additional class name */
  className?: string
}

// ============================================
// Component
// ============================================

export function ChartLegend({
  items,
  layout = "horizontal",
  align = "center",
  onClick,
  interactive = false,
  showValues = false,
  valueFormatter,
  variant = "default",
  size = "md",
  className,
}: ChartLegendProps) {
  const alignmentClasses = {
    left: "justify-start",
    center: "justify-center",
    right: "justify-end",
  }

  const gapClasses = {
    sm: "gap-x-2 gap-y-1.5",
    md: "gap-x-3 gap-y-2",
    lg: "gap-x-4 gap-y-2.5",
  }

  return (
    <div
      className={cn(
        "flex flex-wrap",
        gapClasses[size],
        layout === "vertical" && "flex-col items-start",
        layout === "horizontal" && alignmentClasses[align],
        className
      )}
    >
      {items.map((item) => (
        <LegendItemComponent
          key={item.key}
          item={item}
          onClick={onClick}
          interactive={interactive}
          showValue={showValues}
          valueFormatter={valueFormatter}
          variant={variant}
          size={size}
        />
      ))}
    </div>
  )
}

// ============================================
// Legend Item
// ============================================

interface LegendItemComponentProps {
  item: LegendItem
  onClick?: (item: LegendItem) => void
  interactive: boolean
  showValue: boolean
  valueFormatter?: (value: number | string) => string
  variant: "default" | "pills" | "cards"
  size: "sm" | "md" | "lg"
}

function LegendItemComponent({
  item,
  onClick,
  interactive,
  showValue,
  valueFormatter,
  variant,
  size,
}: LegendItemComponentProps) {
  const { theme } = useChartConfig()
  const isActive = item.active !== false
  const formattedValue = item.value !== undefined && valueFormatter
    ? valueFormatter(item.value)
    : item.value

  const handleClick = () => {
    if (interactive && onClick) {
      onClick(item)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (interactive && onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault()
      onClick(item)
    }
  }

  const sizeClasses = {
    sm: "text-[10px]",
    md: "text-xs",
    lg: "text-sm",
  }

  const indicatorSizes = {
    sm: "h-2 w-2",
    md: "h-2.5 w-2.5",
    lg: "h-3 w-3",
  }

  // Pills variant styling
  if (variant === "pills") {
    return (
      <button
        type="button"
        className={cn(
          // Base styles
          "group relative flex items-center gap-1.5",
          "px-2.5 py-1 rounded-full",
          "border transition-all duration-200",
          sizeClasses[size],
          // Interactive states
          interactive && "cursor-pointer",
          !interactive && "cursor-default",
          // Active/inactive states
          isActive && [
            "bg-white/80 border-slate-200/80",
            "hover:bg-white hover:border-slate-300",
            "hover:shadow-sm",
          ],
          !isActive && [
            "bg-slate-50 border-slate-100",
            "opacity-50 hover:opacity-70",
          ],
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={interactive ? 0 : -1}
        aria-pressed={isActive}
      >
        {/* Color indicator with glow effect */}
        <div className="relative">
          {item.icon || (
            <div
              className={cn(
                indicatorSizes[size],
                "rounded-full shrink-0",
                "transition-transform duration-200",
                interactive && isActive && "group-hover:scale-110",
              )}
              style={{
                backgroundColor: item.color,
                boxShadow: isActive ? `0 0 8px ${item.color}40` : undefined,
              }}
            />
          )}
        </div>

        {/* Label */}
        <span className={cn(
          "transition-colors duration-150",
          isActive ? "text-slate-700" : "text-slate-400",
        )}>
          {item.name}
        </span>

        {/* Value badge */}
        {showValue && formattedValue !== undefined && (
          <span className={cn(
            "font-semibold tabular-nums ml-0.5",
            "px-1.5 py-0.5 rounded-md",
            isActive
              ? "text-slate-900 bg-slate-100/60"
              : "text-slate-400 bg-slate-50",
          )}>
            {formattedValue}
          </span>
        )}
      </button>
    )
  }

  // Cards variant styling
  if (variant === "cards") {
    return (
      <button
        type="button"
        className={cn(
          // Base styles
          "group relative flex items-center gap-2",
          "px-3 py-2 rounded-xl",
          "border transition-all duration-200",
          sizeClasses[size],
          // Interactive states
          interactive && "cursor-pointer",
          !interactive && "cursor-default",
          // Active/inactive states with premium styling
          isActive && [
            "bg-white border-slate-200/60",
            "shadow-sm",
            "hover:shadow-md hover:-translate-y-0.5",
            "hover:border-slate-300",
          ],
          !isActive && [
            "bg-slate-50/50 border-slate-100",
            "opacity-50 hover:opacity-70",
          ],
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={interactive ? 0 : -1}
        aria-pressed={isActive}
        style={{
          boxShadow: isActive
            ? `${theme.shadows.card}, 0 0 0 1px ${item.color}10`
            : undefined,
        }}
      >
        {/* Gradient color indicator */}
        <div className="relative">
          {item.icon || (
            <div
              className={cn(
                indicatorSizes[size],
                "rounded-md shrink-0",
                "transition-all duration-200",
                interactive && isActive && "group-hover:scale-110",
              )}
              style={{
                background: `linear-gradient(135deg, ${item.color} 0%, ${item.color}CC 100%)`,
                boxShadow: isActive ? `0 2px 8px ${item.color}30` : undefined,
              }}
            />
          )}
        </div>

        {/* Content */}
        <div className="flex flex-col items-start gap-0.5">
          <span className={cn(
            "font-medium transition-colors duration-150",
            isActive ? "text-slate-800" : "text-slate-400",
          )}>
            {item.name}
          </span>

          {/* Value */}
          {showValue && formattedValue !== undefined && (
            <span className={cn(
              "font-bold tabular-nums text-base",
              isActive ? "text-slate-900" : "text-slate-400",
            )}>
              {formattedValue}
            </span>
          )}
        </div>
      </button>
    )
  }

  // Default variant with enhanced styling
  return (
    <div
      className={cn(
        "group flex items-center gap-2",
        sizeClasses[size],
        // Transitions
        "transition-all duration-200",
        // Interactive states
        interactive && "cursor-pointer",
        interactive && isActive && "hover:bg-slate-50 hover:px-2 hover:-mx-2 hover:rounded-md",
        // Active/inactive states
        !isActive && "opacity-40 hover:opacity-60",
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? "button" : undefined}
      aria-pressed={interactive ? isActive : undefined}
    >
      {/* Color indicator with animation */}
      {item.icon || (
        <div
          className={cn(
            indicatorSizes[size],
            "rounded-sm shrink-0",
            "transition-all duration-200",
            interactive && isActive && "group-hover:scale-125 group-hover:rounded-md",
          )}
          style={{
            backgroundColor: item.color,
            boxShadow: isActive && interactive
              ? `0 0 0 2px ${item.color}20`
              : undefined,
          }}
        />
      )}

      {/* Label */}
      <span className={cn(
        "transition-colors duration-150",
        isActive ? "text-slate-600 group-hover:text-slate-900" : "text-slate-400",
      )}>
        {item.name}
      </span>

      {/* Value */}
      {showValue && formattedValue !== undefined && (
        <span className={cn(
          "font-medium tabular-nums",
          "transition-colors duration-150",
          isActive ? "text-slate-900" : "text-slate-400",
        )}>
          {formattedValue}
        </span>
      )}
    </div>
  )
}

// ============================================
// Compact Legend (inline with chart title)
// ============================================

interface CompactLegendProps {
  items: Array<{ name: string; color: string }>
  className?: string
}

export function CompactLegend({ items, className }: CompactLegendProps) {
  return (
    <div className={cn("flex items-center gap-3 text-xs", className)}>
      {items.map((item) => (
        <div
          key={item.name}
          className="group flex items-center gap-1.5 transition-opacity hover:opacity-80"
        >
          <div
            className="h-2 w-2 rounded-full transition-transform group-hover:scale-125"
            style={{
              backgroundColor: item.color,
              boxShadow: `0 0 6px ${item.color}30`,
            }}
          />
          <span className="text-slate-500 group-hover:text-slate-700 transition-colors">
            {item.name}
          </span>
        </div>
      ))}
    </div>
  )
}

// ============================================
// Animated Legend (with staggered entrance)
// ============================================

interface AnimatedLegendProps extends ChartLegendProps {
  /** Stagger delay between items (ms) */
  staggerDelay?: number
}

export function AnimatedLegend({
  staggerDelay: _staggerDelay = 50,
  className,
  ...props
}: AnimatedLegendProps) {
  return (
    <ChartLegend
      {...props}
      className={cn(
        // Container animation
        "animate-in fade-in-0 duration-300",
        className,
      )}
    />
  )
}
