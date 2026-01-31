"use client"

import { cn } from "@/lib/utils"
// motion reserved for future animations
import { ScrollReveal } from "./scroll-reveal"

export function BentoGrid({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "grid md:auto-rows-[18rem] grid-cols-1 md:grid-cols-3 gap-4 max-w-7xl mx-auto",
        className
      )}
    >
      {children}
    </div>
  )
}

export function BentoGridItem({
  className,
  title,
  description,
  header,
  icon,
}: {
  className?: string
  title?: string | React.ReactNode
  description?: string | React.ReactNode
  header?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <ScrollReveal
      className={cn(
        "row-span-1 rounded-3xl group/bento hover:shadow-xl transition duration-200 shadow-input dark:shadow-none p-4 dark:bg-black dark:border-white/[0.2] bg-white border border-transparent justify-between flex flex-col space-y-4",
        "border-slate-200 shadow-sm hover:border-slate-300",
        className
      )}
      width="100%"
    >
      {header}
      <div className="group-hover/bento:translate-x-2 transition duration-200">
        {icon}
        <div className="font-sans font-bold text-slate-900 dark:text-slate-200 mb-2 mt-2">
          {title}
        </div>
        <div className="font-sans font-normal text-slate-600 dark:text-slate-300 text-xs text-balance">
          {description}
        </div>
      </div>
    </ScrollReveal>
  )
}
