"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, type NavProps } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

// Custom Nav component to handle navigation with proper event stopping
function CustomNav({ onPreviousClick, onNextClick, previousMonth, nextMonth }: NavProps) {
  return (
    <>
      <button
        type="button"
        disabled={!previousMonth}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          onPreviousClick?.()
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "h-8 w-8 bg-white p-0 border border-[#E5E5EA] hover:bg-[#F0FDFA] hover:text-[#007A78] hover:border-[#007A78] absolute left-1 top-0 transition-colors cursor-pointer z-10 flex items-center justify-center rounded-md shadow-sm",
          "active:scale-95 active:bg-[#007A78]/10",
          !previousMonth && "opacity-50 cursor-not-allowed"
        )}
        aria-label="Go to previous month"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        disabled={!nextMonth}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          onNextClick?.()
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "h-8 w-8 bg-white p-0 border border-[#E5E5EA] hover:bg-[#F0FDFA] hover:text-[#007A78] hover:border-[#007A78] absolute right-1 top-0 transition-colors cursor-pointer z-10 flex items-center justify-center rounded-md shadow-sm",
          "active:scale-95 active:bg-[#007A78]/10",
          !nextMonth && "opacity-50 cursor-not-allowed"
        )}
        aria-label="Go to next month"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </>
  )
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      data-slot="calendar"
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        month_caption: "flex justify-center pt-1 relative items-center h-10",
        caption_label: "text-sm font-semibold text-foreground",
        nav: "flex items-center gap-1",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "h-8 w-8 bg-white p-0 border border-[#E5E5EA] hover:bg-[#F0FDFA] hover:text-[#007A78] hover:border-[#007A78] absolute left-1 top-0 transition-colors cursor-pointer z-10 flex items-center justify-center rounded-md shadow-sm",
          "active:scale-95 active:bg-[#007A78]/10"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "h-8 w-8 bg-white p-0 border border-[#E5E5EA] hover:bg-[#F0FDFA] hover:text-[#007A78] hover:border-[#007A78] absolute right-1 top-0 transition-colors cursor-pointer z-10 flex items-center justify-center rounded-md shadow-sm",
          "active:scale-95 active:bg-[#007A78]/10"
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday:
          "text-[#8E8E93] rounded-md w-9 font-semibold text-[0.75rem] uppercase tracking-wide",
        week: "flex w-full mt-2",
        day: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-[#F0FDFA]/50 [&:has([aria-selected])]:bg-[#F0FDFA] first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-[#F0FDFA] hover:text-[#007A78] transition-colors rounded-md"
        ),
        range_end: "day-range-end",
        selected:
          "bg-[#007A78] text-white hover:bg-[#005F5D] hover:text-white focus:bg-[#007A78] focus:text-white font-semibold",
        today: "border-2 border-[#007A78] text-[#007A78] font-semibold bg-transparent",
        outside:
          "day-outside text-[#8E8E93]/40 aria-selected:bg-[#F0FDFA]/30 aria-selected:text-[#8E8E93]/40",
        disabled: "text-[#8E8E93]/30 opacity-50 cursor-not-allowed hover:bg-transparent",
        range_middle:
          "aria-selected:bg-[#F0FDFA] aria-selected:text-[#007A78]",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Nav: CustomNav,
        Chevron: ({ orientation }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight
          return <Icon className="h-4 w-4" />
        },
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
