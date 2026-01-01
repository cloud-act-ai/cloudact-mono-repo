"use client"

/**
 * CostBreakdownChart - Horizontal bar chart for cost breakdowns
 *
 * Features:
 * - Category or provider breakdown visualization
 * - Animated progress bars
 * - Percentage and count display
 * - Customizable colors
 * - Click-to-filter support
 * - Empty state handling
 */

import { cn } from "@/lib/utils"
import { formatCost, formatCostCompact } from "@/lib/costs"

// ============================================
// Types
// ============================================

export interface BreakdownItem {
  /** Unique key */
  key: string
  /** Display name */
  name: string
  /** Total cost value */
  value: number
  /** Count (e.g., subscriptions, services) */
  count?: number
  /** Percentage of total (0-100) */
  percentage: number
  /** Bar color (Tailwind bg class or hex) */
  color?: string
  /** Optional icon component */
  icon?: React.ReactNode
}

export interface CostBreakdownChartProps {
  /** Section title */
  title: string
  /** Optional subtitle */
  subtitle?: string
  /** Breakdown items */
  items: BreakdownItem[]
  /** Currency code */
  currency?: string
  /** Max items to show (default: 5) */
  maxItems?: number
  /** Show "Others" for remaining items */
  showOthers?: boolean
  /** Count label (e.g., "subscriptions", "services") */
  countLabel?: string
  /** Loading state */
  loading?: boolean
  /** Empty state message */
  emptyMessage?: string
  /** Click handler for item */
  onItemClick?: (item: BreakdownItem) => void
  /** Custom class name */
  className?: string
  /** Use compact currency format */
  compact?: boolean
}

// ============================================
// Default Colors
// ============================================

const DEFAULT_COLORS = [
  "bg-[#90FCA6]", // Mint (primary)
  "bg-[#4285F4]", // Blue
  "bg-[#FF6C5E]", // Coral
  "bg-[#F24E1E]", // Orange
  "bg-[#4A154B]", // Purple
  "bg-[#34A853]", // Green
  "bg-[#FBBC04]", // Yellow
  "bg-[#EA4335]", // Red
]

function getDefaultColor(index: number): string {
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length]
}

// ============================================
// Loading Skeleton
// ============================================

function BreakdownSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6">
      <div className="h-5 w-32 bg-slate-200 rounded mb-4 animate-pulse" />
      <div className="space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-2 animate-pulse">
            <div className="flex justify-between">
              <div className="h-4 w-24 bg-slate-200 rounded" />
              <div className="h-4 w-16 bg-slate-200 rounded" />
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-slate-200 rounded-full"
                style={{ width: `${60 - i * 15}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================
// Empty State
// ============================================

function BreakdownEmpty({ message }: { message: string }) {
  return (
    <div className="py-8 text-center text-slate-500">
      <p className="text-sm">{message}</p>
    </div>
  )
}

// ============================================
// Single Bar Item
// ============================================

interface BarItemProps {
  item: BreakdownItem
  currency: string
  countLabel?: string
  compact?: boolean
  onClick?: () => void
  index: number
}

function BarItem({ item, currency, countLabel, compact, onClick, index }: BarItemProps) {
  const barColor = item.color || getDefaultColor(index)
  const formattedValue = compact ? formatCostCompact(item.value, currency) : formatCost(item.value, currency)

  // Handle hex colors vs Tailwind classes
  const isHexColor = barColor.startsWith("#") || barColor.startsWith("rgb")
  const hexColor = isHexColor ? barColor : undefined
  const bgClass = isHexColor ? "" : barColor

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault()
      onClick()
    }
  }

  // Pluralize count label properly
  const getCountText = () => {
    if (item.count === undefined || !countLabel) return null
    const singularLabel = countLabel.endsWith("s") ? countLabel.slice(0, -1) : countLabel
    return `${item.count} ${item.count === 1 ? singularLabel : countLabel}`
  }

  // Apple Health style - larger, more prominent bars
  return (
    <div
      className={cn(
        "space-y-2.5 p-3 rounded-xl transition-all duration-200",
        "hover:bg-slate-50/50",
        onClick && "cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#90FCA6] focus:ring-offset-2"
      )}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? "button" : "listitem"}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${item.name}: ${formattedValue}, ${item.percentage.toFixed(1)}% of total`}
    >
      {/* Header: Color dot + Name + Value */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* Color indicator dot */}
          <div
            className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm"
            style={{ backgroundColor: hexColor }}
          />
          {item.icon && (
            <span className="flex-shrink-0">{item.icon}</span>
          )}
          <span className="text-[15px] font-semibold text-slate-800 truncate">
            {item.name}
          </span>
        </div>
        <span className="text-[15px] font-bold text-slate-900 tabular-nums">
          {formattedValue}
        </span>
      </div>

      {/* Progress Bar - Apple Health style with rounded ends and gradient */}
      <div className="h-4 bg-slate-100/80 rounded-full overflow-hidden shadow-inner">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            "shadow-sm",
            bgClass
          )}
          style={{
            width: `${Math.max(item.percentage, 2)}%`,
            backgroundColor: hexColor,
            backgroundImage: hexColor
              ? `linear-gradient(90deg, ${hexColor} 0%, ${hexColor}dd 100%)`
              : undefined,
          }}
        />
      </div>

      {/* Footer: Count + Percentage */}
      <div className="flex justify-between text-xs text-slate-500 font-medium">
        {getCountText() && <span>{getCountText()}</span>}
        {!getCountText() && <span />}
        <span className="tabular-nums">
          {Number.isFinite(item.percentage) ? item.percentage.toFixed(1) : "0.0"}%
        </span>
      </div>
    </div>
  )
}

// ============================================
// Main Component
// ============================================

export function CostBreakdownChart({
  title,
  subtitle,
  items,
  currency = "USD",
  maxItems = 5,
  showOthers = true,
  countLabel,
  loading = false,
  emptyMessage = "No data available",
  onItemClick,
  className,
  compact = false,
}: CostBreakdownChartProps) {
  if (loading) {
    return <BreakdownSkeleton rows={Math.min(maxItems, 3)} />
  }

  // Process items
  let displayItems = [...items].sort((a, b) => b.value - a.value)
  let othersItem: BreakdownItem | null = null

  if (displayItems.length > maxItems && showOthers) {
    const visibleItems = displayItems.slice(0, maxItems - 1)
    const otherItems = displayItems.slice(maxItems - 1)

    const othersValue = otherItems.reduce((sum, item) => sum + item.value, 0)
    const othersCount = otherItems.reduce((sum, item) => sum + (item.count || 0), 0)
    const othersPercentage = otherItems.reduce((sum, item) => sum + item.percentage, 0)

    othersItem = {
      key: "others",
      name: `Others (${otherItems.length})`,
      value: othersValue,
      count: othersCount,
      percentage: othersPercentage,
      color: "#94a3b8",
    }

    displayItems = [...visibleItems, othersItem]
  } else {
    displayItems = displayItems.slice(0, maxItems)
  }

  // Calculate total for header
  const totalValue = items.reduce((sum, item) => sum + item.value, 0)

  return (
    <div className={cn(
      "bg-white rounded-xl sm:rounded-2xl border border-slate-200",
      "shadow-sm hover:shadow-md transition-shadow duration-200",
      className
    )}>
      {/* Header */}
      {title && (
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-slate-500">
              {title}
            </h3>
            {totalValue > 0 && (
              <span className="text-sm font-bold text-slate-900 tabular-nums">
                {compact ? formatCostCompact(totalValue, currency) : formatCost(totalValue, currency)}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          )}
        </div>
      )}

      {/* Content */}
      <div className="px-1 sm:px-2 pb-4 sm:pb-5">
        {displayItems.length === 0 ? (
          <div className="px-3 sm:px-4">
            <BreakdownEmpty message={emptyMessage} />
          </div>
        ) : (
          <div className="space-y-1" role="list" aria-label={title}>
            {displayItems.map((item, index) => (
              <BarItem
                key={item.key}
                item={item}
                currency={currency}
                countLabel={countLabel}
                compact={compact}
                index={index}
                onClick={onItemClick ? () => onItemClick(item) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// Preset Breakdown Charts
// ============================================

export interface PresetBreakdownProps {
  items: BreakdownItem[]
  currency?: string
  loading?: boolean
  onItemClick?: (item: BreakdownItem) => void
  className?: string
}

/** Provider breakdown (Cloud, LLM, etc.) */
export function ProviderBreakdownChart({
  items,
  currency,
  loading,
  onItemClick,
  className,
}: PresetBreakdownProps) {
  return (
    <CostBreakdownChart
      title="Cost by Provider"
      items={items}
      currency={currency}
      countLabel="services"
      loading={loading}
      onItemClick={onItemClick}
      emptyMessage="No provider data available"
      className={className}
    />
  )
}

/** Category breakdown (SaaS, Cloud, LLM) */
export function CategoryBreakdownChart({
  items,
  currency,
  loading,
  onItemClick,
  className,
}: PresetBreakdownProps) {
  return (
    <CostBreakdownChart
      title="Cost by Category"
      items={items}
      currency={currency}
      countLabel="items"
      loading={loading}
      onItemClick={onItemClick}
      emptyMessage="No category data available"
      className={className}
    />
  )
}

/** Subscription category breakdown */
export function SubscriptionCategoryChart({
  items,
  currency,
  loading,
  onItemClick,
  className,
}: PresetBreakdownProps) {
  return (
    <CostBreakdownChart
      title="Cost by Subscription Category"
      items={items}
      currency={currency}
      countLabel="subscriptions"
      loading={loading}
      onItemClick={onItemClick}
      emptyMessage="No subscription data available"
      className={className}
    />
  )
}
