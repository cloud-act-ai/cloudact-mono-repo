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
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        month_caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-semibold text-foreground",
        nav: "space-x-1 flex items-center",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 border-0 hover:bg-[#F0FDFA] hover:text-[#007A78] absolute left-1 transition-colors"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 border-0 hover:bg-[#F0FDFA] hover:text-[#007A78] absolute right-1 transition-colors"
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday:
          "text-muted-foreground rounded-md w-9 font-semibold text-[0.75rem] uppercase tracking-wide",
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
          "day-outside text-muted-foreground/40 aria-selected:bg-[#F0FDFA]/30 aria-selected:text-muted-foreground/40",
        disabled: "text-muted-foreground/30 opacity-50 cursor-not-allowed hover:bg-transparent",
        range_middle:
          "aria-selected:bg-[#F0FDFA] aria-selected:text-[#007A78]",
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
