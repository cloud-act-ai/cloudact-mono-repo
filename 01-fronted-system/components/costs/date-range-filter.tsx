"use client"

/**
 * DateRangeFilter - Date range selector for cost dashboards
 *
 * Features:
 * - Preset ranges (MTD, Last 30 days, Quarter, YTD)
 * - Custom date range picker
 * - Consistent styling with cost dashboard design
 */

import React, { useState, useCallback } from "react"
import { Calendar, ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

// ============================================
// Types
// ============================================

export type DateRangePreset =
  | "mtd"
  | "last_30_days"
  | "last_90_days"
  | "this_quarter"
  | "ytd"
  | "last_month"
  | "custom"

export interface DateRange {
  start: Date
  end: Date
  preset: DateRangePreset
  label: string
}

export interface DateRangeFilterProps {
  /** Current selected range */
  value: DateRange
  /** Callback when range changes */
  onChange: (range: DateRange) => void
  /** Optional class name */
  className?: string
  /** Disabled state */
  disabled?: boolean
}

// ============================================
// Preset Configurations
// ============================================

interface PresetConfig {
  id: DateRangePreset
  label: string
  shortLabel: string
  getRange: () => { start: Date; end: Date }
}

const PRESETS: PresetConfig[] = [
  {
    id: "mtd",
    label: "Month to Date",
    shortLabel: "MTD",
    getRange: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start, end: now }
    },
  },
  {
    id: "last_30_days",
    label: "Last 30 Days",
    shortLabel: "30D",
    getRange: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 30)
      return { start, end }
    },
  },
  {
    id: "last_90_days",
    label: "Last 90 Days",
    shortLabel: "90D",
    getRange: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 90)
      return { start, end }
    },
  },
  {
    id: "this_quarter",
    label: "This Quarter",
    shortLabel: "QTD",
    getRange: () => {
      const now = new Date()
      const quarter = Math.floor(now.getMonth() / 3)
      const start = new Date(now.getFullYear(), quarter * 3, 1)
      return { start, end: now }
    },
  },
  {
    id: "ytd",
    label: "Year to Date",
    shortLabel: "YTD",
    getRange: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), 0, 1)
      return { start, end: now }
    },
  },
  {
    id: "last_month",
    label: "Last Month",
    shortLabel: "Last Mo",
    getRange: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start, end }
    },
  },
]

// ============================================
// Helper Functions
// ============================================

/**
 * Get a DateRange for a preset
 */
export function getPresetRange(preset: DateRangePreset): DateRange {
  const config = PRESETS.find(p => p.id === preset)
  if (!config) {
    // Default to MTD
    const mtd = PRESETS[0]
    const range = mtd.getRange()
    return { ...range, preset: "mtd", label: mtd.label }
  }
  const range = config.getRange()
  return { ...range, preset, label: config.label }
}

/**
 * Get default date range (MTD)
 */
export function getDefaultDateRange(): DateRange {
  return getPresetRange("mtd")
}

/**
 * Format date range for display
 */
export function formatDateRangeDisplay(range: DateRange): string {
  const formatDate = (d: Date) => {
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined
    })
  }

  if (range.preset !== "custom") {
    const preset = PRESETS.find(p => p.id === range.preset)
    return preset?.shortLabel || range.label
  }

  return `${formatDate(range.start)} - ${formatDate(range.end)}`
}

/**
 * Convert DateRange to API parameters (YYYY-MM-DD format)
 */
export function dateRangeToApiParams(range: DateRange): { startDate: string; endDate: string } {
  const formatForApi = (d: Date) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  return {
    startDate: formatForApi(range.start),
    endDate: formatForApi(range.end),
  }
}

// ============================================
// Component
// ============================================

export function DateRangeFilter({
  value,
  onChange,
  className,
  disabled = false,
}: DateRangeFilterProps) {
  const [open, setOpen] = useState(false)

  const handlePresetSelect = useCallback((preset: DateRangePreset) => {
    const range = getPresetRange(preset)
    onChange(range)
    setOpen(false)
  }, [onChange])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            "gap-2 min-w-[120px] justify-between",
            "border-slate-200 hover:border-slate-300",
            "text-slate-700",
            className
          )}
          aria-label="Select date range"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <span className="text-sm font-medium">
              {formatDateRangeDisplay(value)}
            </span>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-slate-400 transition-transform",
              open && "rotate-180"
            )}
            aria-hidden="true"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-2"
        align="end"
        sideOffset={4}
      >
        <div className="space-y-1" role="listbox" aria-label="Date range options">
          {PRESETS.map((preset) => {
            const isSelected = value.preset === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handlePresetSelect(preset.id)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm",
                  "transition-colors",
                  isSelected
                    ? "bg-[#90FCA6]/20 text-[#1a7a3a] font-medium"
                    : "text-slate-700 hover:bg-slate-100"
                )}
              >
                <span>{preset.label}</span>
                {isSelected && (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            )
          })}
        </div>

        {/* Date range info */}
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="px-3 py-2 text-xs text-slate-500">
            <div className="flex justify-between">
              <span>From:</span>
              <span className="font-medium text-slate-700">
                {value.start.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric"
                })}
              </span>
            </div>
            <div className="flex justify-between mt-1">
              <span>To:</span>
              <span className="font-medium text-slate-700">
                {value.end.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric"
                })}
              </span>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
