"use client"

/**
 * ConsolePageShell - Unified layout wrapper for all console pages
 *
 * Ensures consistent design across integrations, settings, pipelines,
 * notifications, budgets, and all other console pages.
 *
 * Features:
 * - Consistent max-w-7xl container with responsive padding
 * - Standardized header with icon, title, subtitle
 * - Unified loading/error/empty states
 * - Optional action buttons and filter rows
 * - Theme-aware (works in light and dark mode)
 */

import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"

export interface ConsolePageShellProps {
  /** Page title */
  title: string
  /** Title icon */
  icon: LucideIcon
  /** Optional subtitle */
  subtitle?: string
  /** Page children */
  children: React.ReactNode
  /** Loading state */
  loading?: boolean
  /** Loading message */
  loadingMessage?: string
  /** Error state */
  error?: string | null
  /** Empty state (when no data) */
  isEmpty?: boolean
  /** Empty state config */
  emptyState?: {
    icon?: LucideIcon
    title: string
    description: string
    action?: {
      label: string
      href?: string
      onClick?: () => void
    }
  }
  /** Header actions (right side of title row) */
  headerActions?: React.ReactNode
  /** Filter/action bar (below title, full width) */
  filterBar?: React.ReactNode
  /** Custom class name */
  className?: string
  /** Icon color variant */
  variant?: "mint" | "coral" | "neutral"
}

const iconVariants = {
  mint: {
    bg: "from-[var(--cloudact-mint)]/30 to-[var(--cloudact-mint)]/10",
    border: "border-[var(--cloudact-mint)]/20",
    text: "text-[var(--cloudact-mint-text)]",
  },
  coral: {
    bg: "from-[var(--cloudact-coral)]/30 to-[var(--cloudact-coral)]/10",
    border: "border-[var(--cloudact-coral)]/20",
    text: "text-[var(--cloudact-coral)]",
  },
  neutral: {
    bg: "from-[var(--surface-secondary)] to-[var(--surface-hover)]",
    border: "border-[var(--border-medium)]",
    text: "text-[var(--text-secondary)]",
  },
}

export function ConsolePageShell({
  title,
  icon: Icon,
  subtitle,
  children,
  loading = false,
  loadingMessage = "Loading...",
  error,
  isEmpty = false,
  emptyState,
  headerActions,
  filterBar,
  className,
  variant = "mint",
}: ConsolePageShellProps) {
  const iconStyle = iconVariants[variant]

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center" role="status">
        <LoadingState message={loadingMessage} />
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn("max-w-7xl mx-auto py-4 sm:py-6 lg:py-8 px-4 sm:px-6", className)}>
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 sm:p-6" role="alert">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 h-5 w-5 text-red-500 mt-0.5">
              <svg fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-medium text-red-800 dark:text-red-300">Error</h3>
              <p className="text-sm text-red-700 dark:text-red-400 mt-1">{error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isEmpty && emptyState) {
    return (
      <div className={cn("max-w-7xl mx-auto py-4 sm:py-6 lg:py-8 px-4 sm:px-6", className)}>
        <EmptyState
          icon={emptyState.icon || Icon}
          title={emptyState.title}
          description={emptyState.description}
          action={emptyState.action}
          variant="card"
          size="md"
        />
      </div>
    )
  }

  return (
    <div
      className={cn("max-w-7xl mx-auto py-4 sm:py-5 lg:py-6 px-4 sm:px-6", className)}
      role="region"
      aria-label={title}
    >
      <div className="space-y-4 sm:space-y-6 lg:space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className={cn(
                "h-11 w-11 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-gradient-to-br flex items-center justify-center flex-shrink-0 shadow-sm border",
                iconStyle.bg,
                iconStyle.border,
              )}>
                <Icon className={cn("h-5 w-5 sm:h-7 sm:w-7", iconStyle.text)} />
              </div>
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

            {headerActions && (
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                {headerActions}
              </div>
            )}
          </div>

          {/* Filter bar */}
          {filterBar && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                {filterBar}
              </div>
              <div className="h-px bg-gradient-to-r from-[var(--surface-secondary)] via-[var(--surface-secondary)]/60 to-transparent" />
            </>
          )}
        </div>

        {/* Content */}
        <div className="space-y-4 sm:space-y-6">
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * ConsoleSection - Group content within a page
 */
export function ConsoleSection({
  title,
  subtitle,
  children,
  className,
}: {
  title?: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("space-y-3 sm:space-y-4", className)}>
      {title && (
        <div>
          <h2 className="text-[12px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{subtitle}</p>
          )}
        </div>
      )}
      {children}
    </section>
  )
}

/**
 * ConsoleGrid - Responsive grid for cards
 */
export function ConsoleGrid({
  children,
  columns = 3,
  className,
}: {
  children: React.ReactNode
  columns?: 1 | 2 | 3 | 4
  className?: string
}) {
  const gridClass = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  }[columns]

  return (
    <div className={cn("grid gap-4 sm:gap-5 lg:gap-6", gridClass, className)}>
      {children}
    </div>
  )
}
