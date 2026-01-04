"use client"

/**
 * CostDashboardShell - Layout wrapper for cost dashboard pages
 *
 * Features:
 * - Consistent header with title, icon, and actions
 * - Bounded max-width (Apple Health pattern)
 * - Mint gradient background accent
 * - Clear Cache button with loading state (forces fresh data fetch)
 * - Breadcrumb navigation support
 */

import { LucideIcon, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"

// ============================================
// Types
// ============================================

export interface CostDashboardShellProps {
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
  /** Error action */
  errorAction?: {
    label: string
    href?: string
    onClick?: () => void
  }
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
  /** Clear cache handler (forces fresh data fetch) */
  onRefresh?: () => void
  /** Clearing cache state */
  isRefreshing?: boolean
  /** Additional header actions */
  headerActions?: React.ReactNode
  /** Custom class name */
  className?: string
}

// ============================================
// Error Alert
// ============================================

interface ErrorAlertProps {
  message: string
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
}

function ErrorAlert({ message, action }: ErrorAlertProps) {
  return (
    <div
      className="bg-red-50 border border-red-200 rounded-xl p-4 sm:p-6"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 h-5 w-5 text-red-500 mt-0.5" aria-hidden="true">
          <svg fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-800">Error loading data</h3>
          <p className="text-sm text-red-700 mt-1">{message}</p>
          {action && (
            <div className="mt-3">
              {action.href ? (
                <a
                  href={action.href}
                  className="text-sm font-medium text-red-700 hover:text-red-600 underline"
                >
                  {action.label}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={action.onClick}
                  className="text-sm font-medium text-red-700 hover:text-red-600 underline"
                >
                  {action.label}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// Main Component
// ============================================

export function CostDashboardShell({
  title,
  icon: Icon,
  subtitle,
  children,
  loading = false,
  loadingMessage = "Loading cost data...",
  error,
  errorAction,
  isEmpty = false,
  emptyState,
  onRefresh,
  isRefreshing = false,
  headerActions,
  className,
}: CostDashboardShellProps) {
  // Loading state
  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <LoadingState message={loadingMessage} />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn(
        "max-w-7xl mx-auto py-4 sm:py-6 lg:py-8 px-4 sm:px-6",
        className
      )}>
        <ErrorAlert message={error} action={errorAction} />
      </div>
    )
  }

  // Empty state
  if (isEmpty && emptyState) {
    return (
      <div className={cn(
        "max-w-7xl mx-auto py-4 sm:py-6 lg:py-8 px-4 sm:px-6",
        className
      )}>
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
    <main
      className={cn(
        "min-h-screen",
        // Mint gradient background accent (Apple Health pattern)
        "bg-gradient-to-b from-[#90FCA6]/5 via-white to-white",
        className
      )}
      role="main"
      aria-label={`${title} dashboard`}
    >
      <div className="max-w-7xl mx-auto py-6 sm:py-8 lg:py-10 px-4 sm:px-6">
        <div className="space-y-6 sm:space-y-8 lg:space-y-10">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-[#90FCA6]/20 flex items-center justify-center">
                <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-[#1a7a3a]" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {headerActions}
              {onRefresh && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className="gap-2"
                  aria-label={isRefreshing ? "Clearing cache..." : "Clear cache and reload data"}
                >
                  <RefreshCw
                    className={cn(
                      "h-4 w-4",
                      isRefreshing && "animate-spin"
                    )}
                    aria-hidden="true"
                  />
                  <span className="hidden sm:inline">
                    {isRefreshing ? "Clearing..." : "Clear Cache"}
                  </span>
                </Button>
              )}
            </div>
          </div>

          {/* Content */}
          {children}
        </div>
      </div>
    </main>
  )
}

// ============================================
// Section Components
// ============================================

export interface CostDashboardSectionProps {
  title?: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}

export function CostDashboardSection({
  title,
  subtitle,
  children,
  className,
}: CostDashboardSectionProps) {
  return (
    <section className={cn("space-y-4", className)}>
      {title && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
      )}
      {children}
    </section>
  )
}

// ============================================
// Grid Layouts
// ============================================

export interface CostDashboardGridProps {
  children: React.ReactNode
  columns?: 1 | 2 | 3
  className?: string
}

export function CostDashboardGrid({
  children,
  columns = 2,
  className,
}: CostDashboardGridProps) {
  const columnClasses = {
    1: "grid-cols-1",
    2: "grid-cols-1 lg:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  }

  return (
    <div className={cn("grid gap-4 sm:gap-6", columnClasses[columns], className)}>
      {children}
    </div>
  )
}
