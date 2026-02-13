"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

interface Stat {
  icon: LucideIcon
  value: string | number
  label: string
  color?: "mint" | "coral" | "amber" | "blue" | "slate"
  trend?: {
    value: number
    isPositive?: boolean
  }
}

interface StatRowProps {
  stats: Stat[]
  className?: string
  showDividers?: boolean
  size?: "sm" | "md" | "lg"
}

const colorClasses = {
  mint: {
    bg: "bg-[var(--cloudact-mint)]/10",
    icon: "text-[var(--cloudact-mint-dark)]",
  },
  coral: {
    bg: "bg-[var(--cloudact-coral)]/10",
    icon: "text-[var(--cloudact-coral)]",
  },
  amber: {
    bg: "bg-amber-100",
    icon: "text-amber-600",
  },
  blue: {
    bg: "bg-blue-100",
    icon: "text-blue-600",
  },
  slate: {
    bg: "bg-slate-100",
    icon: "text-slate-600",
  },
}

const sizeClasses = {
  sm: {
    container: "gap-3 sm:gap-4",
    iconBox: "h-7 w-7 sm:h-8 sm:w-8 rounded-lg",
    icon: "h-3.5 w-3.5 sm:h-4 sm:w-4",
    value: "text-[16px] sm:text-[20px]",
    label: "text-[11px] sm:text-xs",
    divider: "h-5 sm:h-6",
  },
  md: {
    container: "gap-4 sm:gap-6",
    iconBox: "h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl",
    icon: "h-4 w-4 sm:h-5 sm:w-5",
    value: "text-[18px] sm:text-[24px]",
    label: "text-xs sm:text-xs",
    divider: "h-6 sm:h-8",
  },
  lg: {
    container: "gap-5 sm:gap-8",
    iconBox: "h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl",
    icon: "h-5 w-5 sm:h-6 sm:w-6",
    value: "text-[22px] sm:text-[28px]",
    label: "text-xs sm:text-[13px]",
    divider: "h-8 sm:h-10",
  },
}

export function StatRow({
  stats,
  className,
  showDividers = true,
  size = "md",
}: StatRowProps) {
  const sizes = sizeClasses[size]

  return (
    <div
      className={cn(
        "flex items-center overflow-x-auto scrollbar-hide pb-2",
        sizes.container,
        className
      )}
    >
      {stats.map((stat, index) => {
        const colors = colorClasses[stat.color || "mint"]
        const Icon = stat.icon

        return (
          <React.Fragment key={index}>
            {showDividers && index > 0 && (
              <div className={cn("w-px bg-slate-200 flex-shrink-0", sizes.divider)} />
            )}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <div
                className={cn(
                  "flex items-center justify-center",
                  sizes.iconBox,
                  colors.bg
                )}
              >
                <Icon className={cn(sizes.icon, colors.icon)} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p
                    className={cn(
                      "font-bold text-slate-900 leading-none",
                      sizes.value
                    )}
                  >
                    {stat.value}
                  </p>
                  {stat.trend && (
                    <span
                      className={cn(
                        "text-[10px] font-medium",
                        stat.trend.isPositive !== false
                          ? "text-[#1a7a3a]"
                          : "text-rose-500"
                      )}
                    >
                      {stat.trend.isPositive !== false ? "+" : ""}
                      {stat.trend.value}%
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    "text-slate-500 font-medium mt-0.5",
                    sizes.label
                  )}
                >
                  {stat.label}
                </p>
              </div>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

// Compact stat card variant
interface StatCardProps {
  icon: LucideIcon
  value: string | number
  label: string
  color?: "mint" | "coral" | "amber" | "blue" | "slate"
  trend?: {
    value: number
    isPositive?: boolean
  }
  className?: string
}

export function StatCard({
  icon: Icon,
  value,
  label,
  color = "mint",
  trend,
  className,
}: StatCardProps) {
  const colors = colorClasses[color]

  return (
    <div
      className={cn(
        "bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-4",
        "shadow-sm hover:shadow-md transition-shadow",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center",
            colors.bg
          )}
        >
          <Icon className={cn("h-5 w-5", colors.icon)} />
        </div>
        {trend && (
          <span
            className={cn(
              "text-[11px] font-semibold px-2 py-0.5 rounded-full",
              trend.isPositive !== false
                ? "bg-[var(--cloudact-mint)]/10 text-[#1a7a3a]"
                : "bg-rose-100 text-rose-600"
            )}
          >
            {trend.isPositive !== false ? "+" : ""}
            {trend.value}%
          </span>
        )}
      </div>
      <p className="text-[24px] sm:text-[28px] font-bold text-slate-900 mt-3 leading-none">
        {value}
      </p>
      <p className="text-[12px] sm:text-[13px] text-slate-500 font-medium mt-1">
        {label}
      </p>
    </div>
  )
}
