"use client"

import * as React from "react"
import { format, parse, isValid, addDays, addWeeks, addMonths, startOfMonth, endOfMonth } from "date-fns"
import { CalendarIcon, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  date?: Date
  onSelect: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  minDate?: Date
  maxDate?: Date
  className?: string
  showPresets?: boolean
}

// Quick date presets
const getPresets = () => [
  { label: "Today", getValue: () => new Date() },
  { label: "Tomorrow", getValue: () => addDays(new Date(), 1) },
  { label: "Next Week", getValue: () => addWeeks(new Date(), 1) },
  { label: "Next Month", getValue: () => addMonths(new Date(), 1) },
  { label: "Start of Month", getValue: () => startOfMonth(addMonths(new Date(), 1)) },
]

export function DatePicker({
  date,
  onSelect,
  placeholder = "Select date",
  disabled = false,
  minDate,
  maxDate,
  className,
  showPresets = true,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")
  const [inputError, setInputError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Sync input value with date prop
  React.useEffect(() => {
    if (date) {
      setInputValue(format(date, "MM/dd/yyyy"))
      setInputError(null)
    } else {
      setInputValue("")
    }
  }, [date])

  const handleCalendarSelect = (selectedDate: Date | undefined) => {
    onSelect(selectedDate)
    setOpen(false)
    setInputError(null)
  }

  const handlePresetClick = (getValue: () => Date) => {
    const newDate = getValue()
    // Check bounds
    if (minDate && newDate < minDate) {
      setInputError("Date is before minimum allowed")
      return
    }
    if (maxDate && newDate > maxDate) {
      setInputError("Date is after maximum allowed")
      return
    }
    onSelect(newDate)
    setOpen(false)
    setInputError(null)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)
    setInputError(null)

    // Allow empty input
    if (!value.trim()) {
      return
    }

    // Try to parse various formats
    const formats = [
      "MM/dd/yyyy",
      "MM-dd-yyyy",
      "yyyy-MM-dd",
      "M/d/yyyy",
      "M-d-yyyy",
      "MM/dd/yy",
      "M/d/yy",
    ]

    for (const fmt of formats) {
      const parsed = parse(value, fmt, new Date())
      if (isValid(parsed) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100) {
        // Check bounds
        if (minDate && parsed < minDate) {
          setInputError("Date is before minimum allowed")
          return
        }
        if (maxDate && parsed > maxDate) {
          setInputError("Date is after maximum allowed")
          return
        }
        onSelect(parsed)
        return
      }
    }
  }

  const handleInputBlur = () => {
    // On blur, if value doesn't parse, show error
    if (inputValue.trim() && !date) {
      setInputError("Invalid date format. Use MM/DD/YYYY")
    } else if (inputValue.trim() && date) {
      // Reset to formatted date
      setInputValue(format(date, "MM/dd/yyyy"))
      setInputError(null)
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(undefined)
    setInputValue("")
    setInputError(null)
  }

  // Disable dates outside the allowed range
  const disabledDates = (day: Date) => {
    if (minDate && day < minDate) return true
    if (maxDate && day > maxDate) return true
    return false
  }

  const presets = getPresets()

  return (
    <div className={cn("relative", className)} onClick={(e) => e.stopPropagation()}>
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <div className="flex gap-2">
          {/* Manual input field */}
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              placeholder="MM/DD/YYYY"
              disabled={disabled}
              className={cn(
                "pr-16",
                inputError && "border-[var(--cloudact-coral)] focus-visible:ring-[var(--cloudact-coral)]"
              )}
            />
            {/* Clear button */}
            {date && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-10 top-1/2 -translate-y-1/2 text-[#8E8E93] hover:text-[var(--cloudact-coral)] transition-colors p-1"
                aria-label="Clear date"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {/* Calendar trigger inside input */}
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2 text-[#8E8E93] hover:text-[#1a7a3a] transition-colors p-1 rounded",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
                aria-label="Open calendar"
              >
                <CalendarIcon className="h-4 w-4" />
              </button>
            </PopoverTrigger>
          </div>
        </div>

        <PopoverContent
          className="w-auto p-0 z-[9999]"
          align="start"
          side="bottom"
          sideOffset={8}
          avoidCollisions={true}
          collisionPadding={16}
          onPointerDownOutside={(e) => {
            // Prevent sheet from closing when clicking inside popover
            // Check if the click is on a calendar navigation button or day
            const target = e.target as HTMLElement
            if (target.closest('[data-slot="calendar"]') ||
                target.closest('.rdp') ||
                target.closest('[data-radix-popper-content-wrapper]')) {
              e.preventDefault()
            }
          }}
          onInteractOutside={(e) => {
            // Prevent closing when interacting with calendar elements
            const target = e.target as HTMLElement
            if (target.closest('[data-slot="calendar"]') ||
                target.closest('.rdp') ||
                target.closest('[data-radix-popper-content-wrapper]')) {
              e.preventDefault()
            }
          }}
          onFocusOutside={(e) => {
            // Prevent focus outside from closing the popover while inside calendar
            const target = e.target as HTMLElement
            if (target.closest('[data-slot="calendar"]') ||
                target.closest('.rdp') ||
                target.closest('[data-radix-popper-content-wrapper]')) {
              e.preventDefault()
            }
          }}
        >
          <div
            className="flex"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Presets sidebar */}
            {showPresets && (
              <div className="border-r border-[#E5E5EA] p-3 space-y-1 min-w-[120px]">
                <p className="text-xs font-medium text-[#8E8E93] mb-2 px-2">Quick Select</p>
                {presets.map((preset) => (
                  <Button
                    key={preset.label}
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="w-full justify-start text-left h-8 px-2 text-sm font-normal hover:bg-[#90FCA6]/10 hover:text-[#1a7a3a]"
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      handlePresetClick(preset.getValue)
                    }}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            )}
            {/* Calendar */}
            <div className="p-0">
              <Calendar
                mode="single"
                selected={date}
                onSelect={handleCalendarSelect}
                disabled={disabledDates}
                initialFocus
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Error message */}
      {inputError && (
        <p className="text-xs text-[var(--cloudact-coral)] mt-1">{inputError}</p>
      )}

      {/* Selected date display */}
      {date && !inputError && (
        <p className="text-xs text-[#8E8E93] mt-1">
          Selected: <span className="font-medium text-[#1a7a3a]">{format(date, "EEEE, MMMM d, yyyy")}</span>
        </p>
      )}
    </div>
  )
}
