"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

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
          "h-8 w-8 bg-white p-0 border border-[#E5E5EA] hover:bg-[#90FCA6]/10 hover:text-[#000000] hover:border-[#90FCA6] absolute left-1 top-0 transition-colors cursor-pointer z-10 flex items-center justify-center rounded-md shadow-sm",
          "active:scale-95 active:bg-[#90FCA6]/20"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "h-8 w-8 bg-white p-0 border border-[#E5E5EA] hover:bg-[#90FCA6]/10 hover:text-[#000000] hover:border-[#90FCA6] absolute right-1 top-0 transition-colors cursor-pointer z-10 flex items-center justify-center rounded-md shadow-sm",
          "active:scale-95 active:bg-[#90FCA6]/20"
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday:
          "text-[#8E8E93] rounded-md w-9 font-semibold text-[0.75rem] uppercase tracking-wide",
        week: "flex w-full mt-2",
        day: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-[#B8FDCA]/50 [&:has([aria-selected])]:bg-[#B8FDCA] first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-[#B8FDCA]/50 hover:text-[#000000] transition-colors rounded-md"
        ),
        range_end: "day-range-end",
        selected:
          "bg-[#90FCA6] text-[#000000] hover:bg-[#6EE890] hover:text-[#000000] focus:bg-[#90FCA6] focus:text-[#000000] font-semibold",
        today: "border-2 border-[#90FCA6] text-[#6EE890] font-semibold bg-transparent",
        outside:
          "day-outside text-[#8E8E93]/40 aria-selected:bg-[#B8FDCA]/30 aria-selected:text-[#8E8E93]/40",
        disabled: "text-[#8E8E93]/30 opacity-50 cursor-not-allowed hover:bg-transparent",
        range_middle:
          "aria-selected:bg-[#B8FDCA] aria-selected:text-[#000000]",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
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
