"use client"

/**
 * DateRangeFilter - Date range selector for cost dashboards
 *
 * Features:
 * - Preset ranges (MTD, Last 30 days, Quarter, YTD)
 * - Custom date range picker with calendar
 * - Consistent styling with cost dashboard design
 */

import React, { useState, useCallback } from "react"
import { Calendar as CalendarIcon, ChevronDown, Check, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { DateRange as DayPickerDateRange } from "react-day-picker"

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
 * Get default date range (Last 30 Days for better demo experience)
 * Shows data from the previous month when MTD might be empty
 */
export function getDefaultDateRange(): DateRange {
  return getPresetRange("last_30_days")
}

/**
 * Format date range for display
 */
export function formatDateRangeDisplay(range: DateRange): string {
  const formatDate = (d: Date) => {
    return d.toLocaleDateString(undefined, {
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
  const [showCustom, setShowCustom] = useState(value.preset === "custom")
  const [customRange, setCustomRange] = useState<DayPickerDateRange | undefined>(
    value.preset === "custom" ? { from: value.start, to: value.end } : undefined
  )

  const handlePresetSelect = useCallback((preset: DateRangePreset) => {
    if (preset === "custom") {
      setShowCustom(true)
      return
    }
    const range = getPresetRange(preset)
    onChange(range)
    setShowCustom(false)
    setOpen(false)
  }, [onChange])

  const handleCustomRangeSelect = useCallback((range: DayPickerDateRange | undefined) => {
    setCustomRange(range)
  }, [])

  const applyCustomRange = useCallback(() => {
    if (customRange?.from && customRange?.to) {
      const formatDate = (d: Date) => d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined
      })
      onChange({
        start: customRange.from,
        end: customRange.to,
        preset: "custom",
        label: `${formatDate(customRange.from)} - ${formatDate(customRange.to)}`
      })
      setOpen(false)
    }
  }, [customRange, onChange])

  const handleBackToPresets = useCallback(() => {
    setShowCustom(false)
    setCustomRange(undefined)
  }, [])

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen)
      if (!isOpen) {
        setShowCustom(value.preset === "custom")
      }
    }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            "gap-2 min-w-[120px] justify-between",
            "border-[var(--border-subtle)] hover:border-[var(--border-medium)]",
            "text-[var(--text-secondary)]",
            className
          )}
          aria-label="Select date range"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />
            <span className="text-sm font-medium">
              {formatDateRangeDisplay(value)}
            </span>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-[var(--text-muted)] transition-transform",
              open && "rotate-180"
            )}
            aria-hidden="true"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("p-2", showCustom ? "w-auto" : "w-56")}
        align="end"
        sideOffset={4}
      >
        {!showCustom ? (
          <>
            {/* Preset Options */}
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
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
                    )}
                  >
                    <span>{preset.label}</span>
                    {isSelected && (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                )
              })}

              {/* Custom Range Option */}
              <button
                type="button"
                role="option"
                aria-selected={value.preset === "custom"}
                onClick={() => handlePresetSelect("custom")}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm",
                  "transition-colors",
                  value.preset === "custom"
                    ? "bg-[#90FCA6]/20 text-[#1a7a3a] font-medium"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
                )}
              >
                <span>Custom Range</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Date range info */}
            <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
              <div className="px-3 py-2 text-xs text-[var(--text-tertiary)]">
                <div className="flex justify-between">
                  <span>From:</span>
                  <span className="font-medium text-[var(--text-secondary)]">
                    {value.start.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric"
                    })}
                  </span>
                </div>
                <div className="flex justify-between mt-1">
                  <span>To:</span>
                  <span className="font-medium text-[var(--text-secondary)]">
                    {value.end.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric"
                    })}
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Custom Date Range Picker */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <button
                  type="button"
                  onClick={handleBackToPresets}
                  className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] flex items-center gap-1"
                >
                  ← Presets
                </button>
                <span className="text-sm font-medium text-[var(--text-secondary)]">Custom Range</span>
              </div>

              <Calendar
                mode="range"
                selected={customRange}
                onSelect={handleCustomRangeSelect}
                numberOfMonths={2}
                disabled={{ after: new Date() }}
                defaultMonth={customRange?.from || new Date()}
              />

              {/* Selected Range Display */}
              <div className="px-3 py-2 bg-[var(--surface-secondary)] rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <div className="text-[var(--text-secondary)]">
                    {customRange?.from ? (
                      customRange.from.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      })
                    ) : (
                      <span className="text-[var(--text-muted)]">Start date</span>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" />
                  <div className="text-[var(--text-secondary)]">
                    {customRange?.to ? (
                      customRange.to.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      })
                    ) : (
                      <span className="text-[var(--text-muted)]">End date</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Apply Button */}
              <Button
                onClick={applyCustomRange}
                disabled={!customRange?.from || !customRange?.to}
                className="w-full bg-[#90FCA6] hover:bg-[#6EE890] text-black font-medium"
              >
                Apply Range
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
