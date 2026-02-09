"use client"

/**
 * Chart Empty State
 *
 * Displayed when a chart has no data to show.
 * Provides helpful messaging and optional call-to-action.
 */

import React from "react"
import { cn } from "@/lib/utils"
import { BarChart3, PieChart, TrendingUp, Database } from "lucide-react"

export interface ChartEmptyStateProps {
  /** Main message */
  message?: string
  /** Secondary description */
  description?: string
  /** Icon variant based on chart type */
  variant?: "bar" | "line" | "pie" | "generic"
  /** Custom icon */
  icon?: React.ReactNode
  /** Height of the empty state container */
  height?: number
  /** Optional action button */
  action?: {
    label: string
    onClick: () => void
  }
  /** Additional class names */
  className?: string
}

const defaultMessages: Record<string, { message: string; description: string }> = {
  bar: {
    message: "No data to display",
    description: "Run a pipeline to start tracking costs",
  },
  line: {
    message: "No trend data available",
    description: "Cost data will appear once pipelines have run",
  },
  pie: {
    message: "No breakdown data",
    description: "Connect providers to see cost distribution",
  },
  generic: {
    message: "No data available",
    description: "Data will appear here when available",
  },
}

const variantIcons: Record<string, React.ReactNode> = {
  bar: <BarChart3 className="h-10 w-10 text-slate-300" />,
  line: <TrendingUp className="h-10 w-10 text-slate-300" />,
  pie: <PieChart className="h-10 w-10 text-slate-300" />,
  generic: <Database className="h-10 w-10 text-slate-300" />,
}

export function ChartEmptyState({
  message,
  description,
  variant = "generic",
  icon,
  height = 280,
  action,
  className,
}: ChartEmptyStateProps) {
  const defaults = defaultMessages[variant]
  const displayIcon = icon || variantIcons[variant]

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg bg-slate-50/50 text-center",
        className
      )}
      style={{ height }}
    >
      {displayIcon && <div className="mb-3">{displayIcon}</div>}

      <p className="text-sm font-medium text-slate-900">
        {message || defaults.message}
      </p>

      <p className="mt-1 text-xs text-slate-500 max-w-[200px]">
        {description || defaults.description}
      </p>

      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 inline-flex items-center gap-2 h-9 px-4 bg-[#90FCA6] text-slate-900 text-[12px] font-semibold rounded-lg hover:bg-[#B8FDCA] transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
