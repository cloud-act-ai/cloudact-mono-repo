"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

// ============================================================================
// PremiumSection - Consistent section wrapper with title
// ============================================================================

interface PremiumSectionProps {
  title?: string
  subtitle?: string
  icon?: LucideIcon
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
}

export function PremiumSection({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
  className,
  contentClassName,
}: PremiumSectionProps) {
  return (
    <section className={cn("space-y-3 sm:space-y-4", className)}>
      {(title || action) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            {Icon && (
              <div className="h-6 w-6 rounded-lg bg-[var(--cloudact-mint)]/10 flex items-center justify-center">
                <Icon className="h-3.5 w-3.5 text-[var(--cloudact-mint-dark)]" />
              </div>
            )}
            <div>
              {title && (
                <h2 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </section>
  )
}

// ============================================================================
// PremiumSectionCard - Section with card wrapper
// ============================================================================

interface PremiumSectionCardProps extends PremiumSectionProps {
  noPadding?: boolean
  divided?: boolean
}

export function PremiumSectionCard({
  title,
  subtitle,
  icon,
  action,
  children,
  className,
  noPadding,
  divided,
}: PremiumSectionCardProps) {
  return (
    <PremiumSection title={title} subtitle={subtitle} icon={icon} action={action} className={className}>
      <div
        className={cn(
          "bg-white rounded-2xl border border-[#E5E5EA]/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)]",
          "overflow-hidden",
          !noPadding && "p-4 sm:p-5 lg:p-6",
          divided && "[&>*]:border-b [&>*]:border-[#E5E5EA]/80 [&>*:last-child]:border-b-0"
        )}
      >
        {children}
      </div>
    </PremiumSection>
  )
}

// ============================================================================
// PremiumFormSection - Form group with consistent styling
// ============================================================================

interface PremiumFormSectionProps {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}

export function PremiumFormSection({
  title,
  description,
  children,
  className,
}: PremiumFormSectionProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="pb-2 border-b border-slate-100">
        <h3 className="text-[14px] sm:text-[14px] font-semibold text-slate-900">
          {title}
        </h3>
        {description && (
          <p className="text-[12px] text-slate-500 mt-1">{description}</p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

// ============================================================================
// PremiumDivider - Consistent divider
// ============================================================================

interface PremiumDividerProps {
  className?: string
  label?: string
}

export function PremiumDivider({ className, label }: PremiumDividerProps) {
  if (label) {
    return (
      <div className={cn("relative py-4", className)}>
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="px-3 bg-white text-[11px] text-slate-400 font-medium uppercase tracking-wide">
            {label}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent my-4 sm:my-6",
        className
      )}
    />
  )
}

// ============================================================================
// PremiumInfoBanner - Info/warning banners
// ============================================================================

interface PremiumInfoBannerProps {
  icon?: LucideIcon
  title?: string
  description: string
  variant?: "info" | "warning" | "error" | "success"
  action?: React.ReactNode
  className?: string
}

export function PremiumInfoBanner({
  icon: Icon,
  title,
  description,
  variant = "info",
  action,
  className,
}: PremiumInfoBannerProps) {
  const variantStyles = {
    info: {
      container: "bg-[var(--cloudact-mint)]/10 border-[var(--cloudact-mint)]/20",
      icon: "text-[var(--cloudact-mint-dark)]",
      title: "text-[#1a7a3a]",
      text: "text-slate-700",
    },
    warning: {
      container: "bg-amber-50 border-amber-200",
      icon: "text-amber-600",
      title: "text-amber-900",
      text: "text-amber-700",
    },
    error: {
      container: "bg-gradient-to-r from-rose-50 to-orange-50 border-rose-200",
      icon: "text-rose-500",
      title: "text-slate-900",
      text: "text-slate-600",
    },
    success: {
      container: "bg-[var(--cloudact-mint)]/15 border-[var(--cloudact-mint)]/30",
      icon: "text-[var(--cloudact-mint-dark)]",
      title: "text-[#1a7a3a]",
      text: "text-slate-700",
    },
  }

  const styles = variantStyles[variant]

  return (
    <div
      className={cn(
        "p-4 sm:p-5 rounded-xl border",
        styles.container,
        className
      )}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        {Icon && (
          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
            <Icon className={cn("h-4 w-4 sm:h-5 sm:w-5", styles.icon)} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {title && (
            <h3 className={cn("text-[13px] sm:text-[14px] font-semibold", styles.title)}>
              {title}
            </h3>
          )}
          <p className={cn("text-[11px] sm:text-[12px]", title && "mt-1", styles.text)}>
            {description}
          </p>
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// PremiumEmptySection - Empty state for sections
// ============================================================================

interface PremiumEmptySectionProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function PremiumEmptySection({
  icon: Icon,
  title,
  description,
  action,
  className,
}: PremiumEmptySectionProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 sm:py-16 text-center",
        className
      )}
    >
      {Icon && (
        <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Icon className="h-6 w-6 sm:h-7 sm:w-7 text-slate-400" />
        </div>
      )}
      <h3 className="text-[14px] sm:text-[16px] font-semibold text-slate-900">
        {title}
      </h3>
      {description && (
        <p className="text-[12px] text-slate-500 mt-1 max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
