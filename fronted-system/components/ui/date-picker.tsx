"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
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
}

export function DatePicker({
  date,
  onSelect,
  placeholder = "Select date",
  disabled = false,
  minDate,
  maxDate,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  const handleSelect = (selectedDate: Date | undefined) => {
    onSelect(selectedDate)
    setOpen(false)
  }

  // Format date for native input
  const formatDateForInput = (d: Date | undefined) => {
    if (!d) return ""
    return format(d, "yyyy-MM-dd")
  }

  // Handle native input change
  const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value) {
      const [year, month, day] = value.split("-").map(Number)
      onSelect(new Date(year, month - 1, day))
    } else {
      onSelect(undefined)
    }
  }

  return (
    <div className={cn("relative", className)}>
      {/* Native date input - always works */}
      <div className="flex gap-2">
        <input
          type="date"
          value={formatDateForInput(date)}
          onChange={handleNativeChange}
          disabled={disabled}
          min={minDate ? formatDateForInput(minDate) : undefined}
          max={maxDate ? formatDateForInput(maxDate) : undefined}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {/* Show selected date in readable format */}
      {date && (
        <p className="text-xs text-muted-foreground mt-1">
          Selected: {format(date, "PPP")}
        </p>
      )}
    </div>
  )
}
