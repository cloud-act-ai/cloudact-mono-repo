"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

interface PremiumCardProps {
  children: React.ReactNode
  className?: string
  accentBar?: boolean
  accentColor?: "mint" | "coral" | "amber" | "blue"
  hover?: boolean
  onClick?: () => void
  header?: {
    icon?: LucideIcon
    title: string
    subtitle?: string
    action?: React.ReactNode
  }
  footer?: React.ReactNode
  padding?: "none" | "sm" | "md" | "lg"
}

const accentColorClasses = {
  mint: "border-l-[var(--cloudact-mint)]",
  coral: "border-l-[var(--cloudact-coral)]",
  amber: "border-l-amber-400",
  blue: "border-l-blue-500",
}

const paddingClasses = {
  none: "",
  sm: "p-3 sm:p-4",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-6",
}

export function PremiumCard({
  children,
  className,
  accentBar = false,
  accentColor = "mint",
  hover = true,
  onClick,
  header,
  footer,
  padding = "md",
}: PremiumCardProps) {
  const HeaderIcon = header?.icon

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white rounded-2xl border border-[var(--border-subtle)] shadow-sm overflow-hidden",
        hover && "transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
        hover && "hover:border-[var(--cloudact-mint)]/30",
        accentBar && "border-l-4",
        accentBar && accentColorClasses[accentColor],
        onClick && "cursor-pointer",
        className
      )}
    >
      {header && (
        <div className="px-4 sm:px-6 py-4 border-b border-[#E5E5EA]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {HeaderIcon && (
                <HeaderIcon className="h-[18px] w-[18px] text-[#1a7a3a] flex-shrink-0" />
              )}
              <div className="min-w-0">
                <span className="text-[15px] font-semibold text-[var(--text-primary)] truncate block">
                  {header.title}
                </span>
                {header.subtitle && (
                  <span className="text-[12px] text-[var(--text-tertiary)] truncate block mt-0.5">
                    {header.subtitle}
                  </span>
                )}
              </div>
            </div>
            {header.action && <div className="flex-shrink-0">{header.action}</div>}
          </div>
        </div>
      )}

      <div className={cn(padding !== "none" && !header && paddingClasses[padding])}>
        {children}
      </div>

      {footer && (
        <div className="px-4 sm:px-6 py-3 border-t border-[#E5E5EA] bg-[var(--surface-secondary)]/50">
          {footer}
        </div>
      )}
    </div>
  )
}

// Metric card variant (Apple Health style)
interface MetricCardProps {
  icon: LucideIcon
  title: string
  value: string | number
  subtitle?: string
  trend?: {
    value: number
    isPositive?: boolean
    label?: string
  }
  color?: "mint" | "coral" | "amber" | "blue" | "slate"
  onClick?: () => void
  className?: string
}

const metricColorClasses = {
  mint: {
    bg: "bg-[var(--cloudact-mint)]/10",
    icon: "text-[var(--cloudact-mint-dark)]",
    glow: "group-hover:shadow-[0_0_40px_rgba(144,252,166,0.25)]",
  },
  coral: {
    bg: "bg-rose-100",
    icon: "text-rose-500",
    glow: "group-hover:shadow-[0_0_40px_rgba(255,108,94,0.15)]",
  },
  amber: {
    bg: "bg-amber-100",
    icon: "text-amber-600",
    glow: "group-hover:shadow-[0_0_40px_rgba(245,158,11,0.15)]",
  },
  blue: {
    bg: "bg-blue-100",
    icon: "text-blue-600",
    glow: "group-hover:shadow-[0_0_40px_rgba(59,130,246,0.15)]",
  },
  slate: {
    bg: "bg-[var(--surface-secondary)]",
    icon: "text-[var(--text-secondary)]",
    glow: "",
  },
}

export function MetricCard({
  icon: Icon,
  title,
  value,
  subtitle,
  trend,
  color = "mint",
  onClick,
  className,
}: MetricCardProps) {
  const colors = metricColorClasses[color]

  return (
    <div
      onClick={onClick}
      className={cn(
        "group bg-white rounded-xl sm:rounded-2xl border border-[var(--border-subtle)]",
        "p-3 sm:p-5 shadow-sm transition-all duration-200",
        "hover:shadow-md hover:-translate-y-0.5 hover:border-[var(--cloudact-mint)]/30",
        colors.glow,
        onClick && "cursor-pointer",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", colors.bg)}>
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

      <p className="text-[12px] sm:text-[13px] text-[var(--text-tertiary)] font-medium mt-3">{title}</p>
      <p className="text-[22px] sm:text-[28px] font-bold text-[var(--text-primary)] leading-none mt-1">
        {value}
      </p>
      {subtitle && (
        <p className="text-[11px] sm:text-[12px] text-[var(--text-muted)] mt-1">{subtitle}</p>
      )}
      {trend?.label && (
        <p className="text-[11px] text-[var(--text-tertiary)] mt-2">{trend.label}</p>
      )}
    </div>
  )
}

// Section header with optional action
interface SectionHeaderProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
  icon?: LucideIcon
  className?: string
}

export function SectionHeader({
  title,
  subtitle,
  action,
  icon: Icon,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3", className)}>
      <div className="flex items-center gap-2">
        {Icon && (
          <div className="h-8 w-8 rounded-lg bg-[var(--cloudact-mint)]/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-[var(--cloudact-mint-dark)]" />
          </div>
        )}
        <div>
          <h2 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wide">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}
