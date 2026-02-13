"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { LucideIcon, RefreshCw, Loader2 } from "lucide-react"

// ============================================================================
// PremiumPageHeader - Consistent page header with title, subtitle, actions
// ============================================================================

interface PremiumPageHeaderProps {
  title: string
  subtitle?: string
  icon?: LucideIcon
  children?: React.ReactNode
  className?: string
}

export function PremiumPageHeader({
  title,
  subtitle,
  icon: Icon,
  children,
  className,
}: PremiumPageHeaderProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4", className)}>
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] flex items-center justify-center flex-shrink-0 shadow-sm">
            <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-[#1a7a3a]" />
          </div>
        )}
        <div>
          <h1 className="text-[20px] sm:text-[24px] lg:text-[28px] font-bold text-[var(--text-primary)] tracking-tight leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[12px] sm:text-[13px] text-[var(--text-tertiary)] mt-1 sm:mt-2 max-w-lg">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  )
}

// ============================================================================
// PremiumPageHeaderAction - Action button for page header
// ============================================================================

interface PremiumPageHeaderActionProps {
  label: string
  icon?: LucideIcon
  onClick?: () => void
  href?: string
  variant?: "primary" | "secondary" | "ghost"
  loading?: boolean
  disabled?: boolean
  className?: string
}

export function PremiumPageHeaderAction({
  label,
  icon: Icon,
  onClick,
  variant = "primary",
  loading,
  disabled,
  className,
}: PremiumPageHeaderActionProps) {
  const baseStyles = cn(
    "inline-flex items-center justify-center gap-2 h-10 sm:h-11 px-4 sm:px-5",
    "text-[12px] sm:text-[13px] font-semibold rounded-xl",
    "transition-all duration-200 touch-manipulation",
    "disabled:opacity-50 disabled:cursor-not-allowed"
  )

  const variantStyles = {
    primary: cn(
      "bg-gradient-to-r from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)]",
      "text-[var(--text-primary)] shadow-sm",
      "hover:shadow-[0_4px_20px_rgba(144,252,166,0.35)] hover:scale-[1.02]",
      "active:scale-[0.98]"
    ),
    secondary: cn(
      "bg-white border border-[var(--border-subtle)] text-[var(--text-secondary)]",
      "hover:bg-[var(--surface-secondary)] hover:border-[var(--border-medium)]",
      "active:scale-[0.98]"
    ),
    ghost: cn(
      "bg-[var(--cloudact-mint)]/10 text-[#1a7a3a]",
      "hover:bg-[var(--cloudact-mint)]/20",
      "active:scale-[0.98]"
    ),
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(baseStyles, variantStyles[variant], className)}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        Icon && <Icon className="h-4 w-4" />
      )}
      <span>{label}</span>
    </button>
  )
}

// ============================================================================
// PremiumRefreshButton - Specialized refresh button
// ============================================================================

interface PremiumRefreshButtonProps {
  onClick: () => void
  loading?: boolean
  label?: string
  className?: string
}

export function PremiumRefreshButton({
  onClick,
  loading,
  label = "Refresh",
  className,
}: PremiumRefreshButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 h-9 px-4",
        "bg-[var(--cloudact-mint)]/10 text-[#1a7a3a]",
        "text-[12px] font-semibold rounded-lg",
        "hover:bg-[var(--cloudact-mint)]/20",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "transition-colors",
        className
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      <span>{label}</span>
    </button>
  )
}
