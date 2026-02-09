"use client"

/**
 * PremiumPageShell - Ultra-premium layout wrapper for console pages
 *
 * Design Philosophy: Apple Health / Fitness+ Premium Pattern
 * - Bounded max-width (1280px) - content doesn't stretch infinitely
 * - Subtle mint gradient glow at top
 * - Premium typography with tight tracking
 * - Consistent spacing using 8px grid
 * - Smooth entrance animations
 *
 * Usage:
 * <PremiumPageShell
 *   title="Page Title"
 *   subtitle="Brief description"
 *   icon={IconComponent}
 * >
 *   {content}
 * </PremiumPageShell>
 */

import * as React from "react"
import { LucideIcon, RefreshCw, ChevronRight, Clock } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"

// ============================================
// Types
// ============================================

export interface Breadcrumb {
  label: string
  href?: string
}

export interface PremiumPageShellProps {
  /** Page title */
  title: string
  /** Page icon */
  icon?: LucideIcon
  /** Accent color for icon background */
  iconColor?: "mint" | "coral" | "blue" | "slate"
  /** Optional subtitle */
  subtitle?: string
  /** Breadcrumb trail */
  breadcrumbs?: Breadcrumb[]
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
  /** Empty state config */
  isEmpty?: boolean
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
  /** Refresh handler */
  onRefresh?: () => void
  /** Refreshing state */
  isRefreshing?: boolean
  /** Header actions (right side) */
  headerActions?: React.ReactNode
  /** Whether to show the gradient background */
  showGradient?: boolean
  /** Custom max-width */
  maxWidth?: "7xl" | "6xl" | "5xl" | "4xl" | "3xl"
  /** Custom class name */
  className?: string
  /** Content class name */
  contentClassName?: string
  /** Data freshness timestamp (ISO string) - shows when data was last updated */
  lastUpdated?: string | Date
  /** Custom label for last updated timestamp */
  lastUpdatedLabel?: string
}

// ============================================
// Data Freshness Indicator
// ============================================

interface DataFreshnessProps {
  timestamp: string | Date
  label?: string
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()

  if (diffMs < 0) return "just now"

  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return "yesterday"
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function DataFreshnessIndicator({ timestamp, label = "Last updated" }: DataFreshnessProps) {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp
  const isValid = !isNaN(date.getTime())

  if (!isValid) return null

  return (
    <div
      className="flex items-center gap-1.5 text-[11px] sm:text-[11px] text-slate-400"
      title={date.toLocaleString()}
    >
      <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
      <span>
        {label}: <span className="tabular-nums">{formatRelativeTime(date)}</span>
      </span>
    </div>
  )
}

// ============================================
// Accent Color Classes
// ============================================

const iconColorClasses = {
  mint: {
    bg: "bg-gradient-to-br from-[#90FCA6] to-[#6EE890]",
    icon: "text-[#1a7a3a]",
    shadow: "shadow-[0_4px_12px_rgba(144,252,166,0.3)]",
  },
  coral: {
    bg: "bg-gradient-to-br from-[#FF6C5E] to-[#e85a4d]",
    icon: "text-white",
    shadow: "shadow-[0_4px_12px_rgba(255,108,94,0.25)]",
  },
  blue: {
    bg: "bg-gradient-to-br from-[#007AFF] to-[#0062CC]",
    icon: "text-white",
    shadow: "shadow-[0_4px_12px_rgba(0,122,255,0.25)]",
  },
  slate: {
    bg: "bg-gradient-to-br from-slate-500 to-slate-600",
    icon: "text-white",
    shadow: "shadow-[0_4px_12px_rgba(100,116,139,0.25)]",
  },
}

const maxWidthClasses = {
  "7xl": "max-w-7xl",
  "6xl": "max-w-6xl",
  "5xl": "max-w-5xl",
  "4xl": "max-w-4xl",
  "3xl": "max-w-3xl",
}

// ============================================
// Error Alert Component
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
      className="relative overflow-hidden bg-gradient-to-r from-red-50 to-red-50/50 border border-red-200 rounded-2xl p-5 sm:p-6"
      role="alert"
      aria-live="assertive"
    >
      {/* Accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />

      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center">
          <svg className="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-semibold text-red-800">
            Error loading data
          </h3>
          <p className="text-[12px] text-red-700 mt-1">{message}</p>
          {action && (
            <div className="mt-3">
              {action.href ? (
                <Link
                  href={action.href}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-red-700 hover:text-red-600 transition-colors"
                >
                  {action.label}
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={action.onClick}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-red-700 hover:text-red-600 transition-colors"
                >
                  {action.label}
                  <ChevronRight className="h-4 w-4" />
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
// Breadcrumb Component
// ============================================

interface BreadcrumbNavProps {
  items: Breadcrumb[]
}

function BreadcrumbNav({ items }: BreadcrumbNavProps) {
  if (items.length === 0) return null

  return (
    <nav className="flex items-center gap-1.5 text-[11px] sm:text-[12px] text-slate-500 mb-3 sm:mb-4">
      {items.map((item, index) => (
        <React.Fragment key={item.label}>
          {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-slate-900 transition-colors font-medium"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-slate-900 font-semibold">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  )
}

// ============================================
// Main Component
// ============================================

export function PremiumPageShell({
  title,
  icon: Icon,
  iconColor = "mint",
  subtitle,
  breadcrumbs = [],
  children,
  loading = false,
  loadingMessage = "Loading...",
  error,
  errorAction,
  isEmpty = false,
  emptyState,
  onRefresh,
  isRefreshing = false,
  headerActions,
  showGradient = true,
  maxWidth = "7xl",
  className,
  contentClassName,
  lastUpdated,
  lastUpdatedLabel,
}: PremiumPageShellProps) {
  const colors = iconColorClasses[iconColor]

  // Loading state
  if (loading) {
    return (
      <div className={cn(
        "min-h-screen",
        showGradient && "bg-gradient-to-b from-[#90FCA6]/[0.03] via-white to-white"
      )}>
        <div className={cn(maxWidthClasses[maxWidth], "mx-auto px-4 sm:px-6 py-8")}>
          <div className="min-h-[400px] flex items-center justify-center">
            <LoadingState message={loadingMessage} />
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn(
        "min-h-screen",
        showGradient && "bg-gradient-to-b from-[#90FCA6]/[0.03] via-white to-white"
      )}>
        <div className={cn(maxWidthClasses[maxWidth], "mx-auto px-4 sm:px-6 py-6 sm:py-8")}>
          <ErrorAlert message={error} action={errorAction} />
        </div>
      </div>
    )
  }

  // Empty state
  if (isEmpty && emptyState) {
    return (
      <div className={cn(
        "min-h-screen",
        showGradient && "bg-gradient-to-b from-[#90FCA6]/[0.03] via-white to-white"
      )}>
        <div className={cn(maxWidthClasses[maxWidth], "mx-auto px-4 sm:px-6 py-6 sm:py-8")}>
          <EmptyState
            icon={emptyState.icon || Icon}
            title={emptyState.title}
            description={emptyState.description}
            action={emptyState.action}
            variant="card"
            size="md"
          />
        </div>
      </div>
    )
  }

  return (
    <main
      className={cn(
        "min-h-screen relative",
        showGradient && "bg-gradient-to-b from-[#90FCA6]/[0.03] via-white to-white",
        className
      )}
      role="main"
      aria-label={`${title} page`}
    >
      {/* Subtle top gradient glow - Apple Health pattern */}
      {showGradient && (
        <div
          className="absolute inset-x-0 top-0 h-80 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(144, 252, 166, 0.08), transparent 70%)"
          }}
        />
      )}

      <div className={cn(
        maxWidthClasses[maxWidth],
        "mx-auto px-4 sm:px-6 py-6 sm:py-8 lg:py-10 relative",
        contentClassName
      )}>
        <div className="space-y-6 sm:space-y-8 lg:space-y-10">
          {/* Breadcrumbs */}
          {breadcrumbs.length > 0 && (
            <BreadcrumbNav items={breadcrumbs} />
          )}

          {/* Header */}
          <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-up">
            <div className="flex items-start gap-3 sm:gap-4">
              {Icon && (
                <div className={cn(
                  "h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl flex items-center justify-center flex-shrink-0",
                  colors.bg,
                  colors.shadow,
                  "transition-transform duration-200 hover:scale-105"
                )}>
                  <Icon className={cn("h-5 w-5 sm:h-6 sm:w-6", colors.icon)} />
                </div>
              )}
              <div>
                <h1 className="text-[20px] sm:text-[24px] lg:text-[28px] font-bold text-slate-900 tracking-tight leading-tight">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-[12px] sm:text-[13px] text-slate-500 mt-1 sm:mt-2 max-w-lg">
                    {subtitle}
                  </p>
                )}
                {lastUpdated && (
                  <div className="mt-2">
                    <DataFreshnessIndicator timestamp={lastUpdated} label={lastUpdatedLabel} />
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 sm:gap-3">
              {headerActions}
              {onRefresh && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className="h-8 sm:h-9 px-3 gap-2"
                  aria-label={isRefreshing ? "Refreshing..." : "Refresh data"}
                >
                  <RefreshCw
                    className={cn(
                      "h-4 w-4",
                      isRefreshing && "animate-spin"
                    )}
                    aria-hidden="true"
                  />
                  <span className="hidden sm:inline">
                    {isRefreshing ? "Refreshing..." : "Refresh"}
                  </span>
                </Button>
              )}
            </div>
          </header>

          {/* Content with staggered animation */}
          <div className="animate-fade-up animation-delay-100">
            {children}
          </div>
        </div>
      </div>
    </main>
  )
}

// ============================================
// Section Components
// ============================================

export interface PremiumSectionProps {
  title?: string
  subtitle?: string
  icon?: LucideIcon
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** Animation delay (100, 200, 300, 400, 500) */
  delay?: 100 | 200 | 300 | 400 | 500
}

export function PremiumSection({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
  className,
  delay,
}: PremiumSectionProps) {
  return (
    <section
      className={cn(
        "space-y-4 sm:space-y-5",
        delay && `animate-fade-up animation-delay-${delay}`,
        className
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <div className="h-8 w-8 rounded-lg bg-[#90FCA6]/10 flex items-center justify-center">
                <Icon className="h-4 w-4 text-[#1a7a3a]" />
              </div>
            )}
            <div>
              <h2 className="text-[11px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {title}
              </h2>
              {subtitle && (
                <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

// ============================================
// Grid Layouts
// ============================================

export interface PremiumGridProps {
  children: React.ReactNode
  columns?: 1 | 2 | 3 | 4
  className?: string
}

export function PremiumGrid({
  children,
  columns = 2,
  className,
}: PremiumGridProps) {
  const columnClasses = {
    1: "grid-cols-1",
    2: "grid-cols-1 lg:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-2 lg:grid-cols-4",
  }

  return (
    <div className={cn(
      "grid gap-3 sm:gap-4 lg:gap-6",
      columnClasses[columns],
      className
    )}>
      {children}
    </div>
  )
}

// ============================================
// Feature Card (Clickable navigation cards)
// ============================================

export interface FeatureCardProps {
  title: string
  description: string
  icon: LucideIcon
  href: string
  iconColor?: "mint" | "coral" | "blue" | "slate"
  badge?: string
  disabled?: boolean
  className?: string
}

const featureIconColors = {
  mint: "bg-[#90FCA6]/10 text-[#1a7a3a] group-hover:bg-[#90FCA6]/20",
  coral: "bg-[#FF6C5E]/10 text-[#FF6C5E] group-hover:bg-[#FF6C5E]/15",
  blue: "bg-[#007AFF]/10 text-[#007AFF] group-hover:bg-[#007AFF]/15",
  slate: "bg-slate-100 text-slate-600 group-hover:bg-slate-200",
}

export function FeatureCard({
  title,
  description,
  icon: Icon,
  href,
  iconColor = "mint",
  badge,
  disabled = false,
  className,
}: FeatureCardProps) {
  const content = (
    <div className={cn(
      "group relative overflow-hidden",
      "bg-white rounded-xl sm:rounded-2xl border border-slate-200",
      "p-4 sm:p-5",
      "transition-all duration-300",
      !disabled && [
        "hover:shadow-lg hover:shadow-[#90FCA6]/10",
        "hover:border-[#90FCA6]/30",
        "hover:-translate-y-1",
        "cursor-pointer",
      ],
      disabled && "opacity-60 cursor-not-allowed",
      className
    )}>
      {/* Shine effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
          <div className={cn(
            "h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors duration-200",
            featureIconColors[iconColor]
          )}>
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] sm:text-[16px] font-bold text-slate-900 group-hover:text-[#1a7a3a] transition-colors truncate">
                {title}
              </h3>
              {badge && (
                <span className="px-2 py-0.5 rounded-full bg-[#90FCA6]/20 text-[#1a7a3a] text-[10px] font-semibold flex-shrink-0">
                  {badge}
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-[12px] text-slate-500 mt-1 line-clamp-2">
              {description}
            </p>
          </div>
        </div>

        <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-[#90FCA6] group-hover:translate-x-1 transition-all flex-shrink-0 mt-1" />
      </div>
    </div>
  )

  if (disabled) {
    return content
  }

  return <Link href={href}>{content}</Link>
}

// ============================================
// Stats Bar (for quick status indicators)
// ============================================

export interface StatItem {
  label: string
  value: string | number
  icon?: LucideIcon
  color?: "mint" | "coral" | "blue" | "slate"
}

export interface StatsBarProps {
  stats: StatItem[]
  className?: string
}

const statColorClasses = {
  mint: "bg-[#90FCA6]/10 text-[#1a7a3a]",
  coral: "bg-[#FF6C5E]/10 text-[#FF6C5E]",
  blue: "bg-[#007AFF]/10 text-[#007AFF]",
  slate: "bg-slate-100 text-slate-600",
}

export function StatsBar({ stats, className }: StatsBarProps) {
  return (
    <div className={cn(
      "relative overflow-hidden",
      "flex flex-wrap items-center gap-4 sm:gap-6",
      "py-4 sm:py-5 px-5 sm:px-6",
      "bg-white/[0.98] backdrop-blur-sm rounded-xl sm:rounded-2xl",
      "border border-slate-200/80",
      "shadow-[0_4px_20px_rgba(0,0,0,0.04)]",
      className
    )}>
      {/* Top gradient accent */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#90FCA6] via-[#90FCA6]/50 to-transparent" />

      {stats.map((stat, index) => (
        <React.Fragment key={stat.label}>
          {index > 0 && (
            <div className="h-6 w-px bg-gradient-to-b from-transparent via-slate-200 to-transparent hidden sm:block" />
          )}
          <div className="flex items-center gap-2.5">
            {stat.icon && (
              <div className={cn(
                "h-8 w-8 rounded-lg flex items-center justify-center",
                statColorClasses[stat.color || "mint"]
              )}>
                <stat.icon className="h-4 w-4" />
              </div>
            )}
            <span className="text-[12px] sm:text-[13px] text-slate-600">
              <span className="font-bold text-slate-900">{stat.value}</span>
              {" "}{stat.label}
            </span>
          </div>
        </React.Fragment>
      ))}
    </div>
  )
}

// ============================================
// Exports
// ============================================

export { DataFreshnessIndicator, formatRelativeTime }
export default PremiumPageShell
