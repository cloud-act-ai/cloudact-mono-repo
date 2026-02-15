"use client"

/**
 * PipelineRunModal - Modal for running pipelines with date range selection
 *
 * Features:
 * - Preset date ranges (Last 7, 30, 60, 90 days)
 * - Custom date range picker with calendar
 * - Shows provider-specific limits (e.g., OpenAI 90-day max)
 * - Consistent styling with CloudAct design system
 */

import { useState, useCallback } from "react"
import {
  Calendar as CalendarIcon,
  X,
  Play,
  AlertCircle,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import type { DateRange as DayPickerDateRange } from "react-day-picker"

// ============================================
// Types
// ============================================

export interface PipelineRunModalProps {
  /** Whether the modal is open */
  open: boolean
  /** Callback when modal closes */
  onClose: () => void
  /** Callback when user confirms to run */
  onRun: (startDate: string, endDate: string) => Promise<void>
  /** Pipeline name for display */
  pipelineName: string
  /** Pipeline provider (e.g., "openai", "anthropic", "gcp") */
  provider: string
  /** Whether pipeline is currently running */
  isRunning?: boolean
}

type PresetId = "yesterday" | "last_7_days" | "last_30_days" | "last_60_days" | "last_90_days" | "custom"

interface PresetConfig {
  id: PresetId
  label: string
  getDays: () => number
  getRange: () => { start: Date; end: Date }
}

// ============================================
// Constants
// ============================================

// Provider-specific date range limits
const PROVIDER_LIMITS: Record<string, number> = {
  openai: 90,
  anthropic: 365,
  gemini: 90,
  deepseek: 90,
  azure_openai: 90,
  gcp: 365,
  aws: 365,
  azure: 365,
  default: 365,
}

const PRESETS: PresetConfig[] = [
  {
    id: "yesterday",
    label: "Yesterday",
    getDays: () => 1,
    getRange: () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      return { start: yesterday, end: yesterday }
    },
  },
  {
    id: "last_7_days",
    label: "Last 7 Days",
    getDays: () => 7,
    getRange: () => {
      const end = new Date()
      end.setDate(end.getDate() - 1)
      const start = new Date()
      start.setDate(start.getDate() - 7)
      return { start, end }
    },
  },
  {
    id: "last_30_days",
    label: "Last 30 Days",
    getDays: () => 30,
    getRange: () => {
      const end = new Date()
      end.setDate(end.getDate() - 1)
      const start = new Date()
      start.setDate(start.getDate() - 30)
      return { start, end }
    },
  },
  {
    id: "last_60_days",
    label: "Last 60 Days",
    getDays: () => 60,
    getRange: () => {
      const end = new Date()
      end.setDate(end.getDate() - 1)
      const start = new Date()
      start.setDate(start.getDate() - 60)
      return { start, end }
    },
  },
  {
    id: "last_90_days",
    label: "Last 90 Days",
    getDays: () => 90,
    getRange: () => {
      const end = new Date()
      end.setDate(end.getDate() - 1)
      const start = new Date()
      start.setDate(start.getDate() - 90)
      return { start, end }
    },
  },
]

// ============================================
// Helper Functions
// ============================================

function formatDateForApi(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function getDaysBetween(start: Date, end: Date): number {
  const diffTime = Math.abs(end.getTime() - start.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

// ============================================
// Component
// ============================================

export function PipelineRunModal({
  open,
  onClose,
  onRun,
  pipelineName,
  provider,
  isRunning = false,
}: PipelineRunModalProps) {
  const [selectedPreset, setSelectedPreset] = useState<PresetId>("yesterday")
  const [customRange, setCustomRange] = useState<DayPickerDateRange | undefined>()
  const [showCustom, setShowCustom] = useState(false)

  // Get provider limit
  const providerKey = provider.toLowerCase().replace(/[-\s]/g, "_")
  const maxDays = PROVIDER_LIMITS[providerKey] || PROVIDER_LIMITS.default

  // Calculate selected range
  const getSelectedRange = useCallback(() => {
    if (selectedPreset === "custom" && customRange?.from) {
      // If only start date selected, use it as both start and end (1 day)
      return {
        start: customRange.from,
        end: customRange.to || customRange.from
      }
    }
    const preset = PRESETS.find((p) => p.id === selectedPreset)
    return preset?.getRange() || PRESETS[0].getRange()
  }, [selectedPreset, customRange])

  // Check if a complete range is selected (for enabling the Run button)
  const hasCompleteRange = selectedPreset !== "custom" || (customRange?.from && customRange?.to)

  const selectedRange = getSelectedRange()
  const selectedDays = getDaysBetween(selectedRange.start, selectedRange.end) + 1
  const exceedsLimit = selectedDays > maxDays

  // Handle preset selection
  const handlePresetSelect = (presetId: PresetId) => {
    if (presetId === "custom") {
      // Initialize custom range with last 30 days as a sensible default
      const endDate = new Date()
      endDate.setDate(endDate.getDate() - 1) // Yesterday
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 30)
      setCustomRange({ from: startDate, to: endDate })
      setShowCustom(true)
      setSelectedPreset("custom")
    } else {
      setSelectedPreset(presetId)
      setShowCustom(false)
    }
  }

  // Handle custom range selection
  const handleCustomRangeSelect = (range: DayPickerDateRange | undefined) => {
    // When user clicks a date, react-day-picker handles the range selection:
    // - First click sets 'from' date
    // - Second click sets 'to' date
    // - If 'to' is before 'from', it swaps them automatically
    setCustomRange(range)
    // Always keep custom preset active when in custom mode
    setSelectedPreset("custom")
  }

  // Handle run
  const handleRun = async () => {
    if (exceedsLimit) return
    const range = getSelectedRange()
    await onRun(formatDateForApi(range.start), formatDateForApi(range.end))
  }

  // Reset state when modal closes
  const handleClose = () => {
    setSelectedPreset("yesterday")
    setCustomRange(undefined)
    setShowCustom(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-[var(--cloudact-mint-dark)]" />
            Run Pipeline
          </DialogTitle>
          <DialogDescription>
            Select a date range to fetch historical data for{" "}
            <span className="font-semibold text-[var(--text-primary)]">{pipelineName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Provider Limit Info */}
          {maxDays < 365 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-800">
                <span className="font-semibold">{provider}</span> API limits date
                range to <span className="font-semibold">{maxDays} days</span> maximum.
              </p>
            </div>
          )}

          {/* Preset Buttons */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--text-secondary)]">
              Quick Select
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.filter((p) => p.getDays() <= maxDays).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetSelect(preset.id)}
                  disabled={isRunning}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-lg border transition-all",
                    selectedPreset === preset.id && !showCustom
                      ? "bg-[var(--cloudact-mint)] border-[var(--cloudact-mint-dark)] text-[#1a7a3a] font-medium"
                      : "bg-white border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-medium)] hover:bg-[var(--surface-secondary)]"
                  )}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handlePresetSelect("custom")}
                disabled={isRunning}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-lg border transition-all",
                  showCustom
                    ? "bg-[var(--cloudact-mint)] border-[var(--cloudact-mint-dark)] text-[#1a7a3a] font-medium"
                    : "bg-white border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-medium)] hover:bg-[var(--surface-secondary)]"
                )}
              >
                Custom Range
              </button>
            </div>
          </div>

          {/* Custom Date Picker */}
          {showCustom && (
            <div className="border rounded-lg p-3 bg-[var(--surface-secondary)]">
              <div className="mb-2 text-xs text-[var(--text-tertiary)]">
                Click to select start date, then click again to select end date
              </div>
              <Calendar
                mode="range"
                selected={customRange}
                onSelect={handleCustomRangeSelect}
                numberOfMonths={2}
                disabled={{ after: new Date() }}
                defaultMonth={customRange?.from || new Date(new Date().setMonth(new Date().getMonth() - 1))}
                className="rounded-md"
              />
            </div>
          )}

          {/* Selected Range Display */}
          <div className="p-3 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide font-medium">
                  Selected Range
                </p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {formatDateDisplay(selectedRange.start)} →{" "}
                  {formatDateDisplay(selectedRange.end)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide font-medium">
                  Duration
                </p>
                <p
                  className={cn(
                    "text-sm font-semibold",
                    exceedsLimit ? "text-red-600" : "text-[var(--text-primary)]"
                  )}
                >
                  {selectedDays} day{selectedDays !== 1 ? "s" : ""}
                  {exceedsLimit && ` (max ${maxDays})`}
                </p>
              </div>
            </div>
          </div>

          {/* Exceeds Limit Warning */}
          {exceedsLimit && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <X className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-800">
                Selected range exceeds the {maxDays}-day limit for {provider}.
                Please select a shorter range.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isRunning}
              className="px-4"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRun}
              disabled={isRunning || exceedsLimit || !hasCompleteRange}
              className="px-4 bg-[var(--cloudact-mint)] hover:bg-[var(--cloudact-mint-dark)] text-[#1a7a3a] font-semibold"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run Pipeline
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
