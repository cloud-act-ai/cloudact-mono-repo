"use client"

/**
 * Cost Breakdown Chart
 *
 * Horizontal bar chart for cost breakdown by category/provider.
 * Replaces the old CostBreakdownChart with Recharts implementation.
 */

import React, { useMemo } from "react"
import { cn } from "@/lib/utils"
import { useCostData } from "@/contexts/cost-data-context"
import { useChartConfig, getPaletteColor } from "../provider/chart-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// ============================================
// Types
// ============================================

export interface BreakdownItem {
  key: string
  name: string
  value: number
  count?: number
  percentage?: number
  color?: string
  icon?: React.ReactNode
}

export interface CostBreakdownChartProps {
  /** Card title */
  title: string
  /** Manual items (bypasses context) */
  items?: BreakdownItem[]
  /** Auto-load provider breakdown from context */
  useProviders?: boolean
  /** Filter to specific category */
  category?: "genai" | "cloud" | "subscription"
  /** Maximum items to show */
  maxItems?: number
  /** Show "Others" for remaining items */
  showOthers?: boolean
  /** Count label (e.g., "services", "subscriptions") */
  countLabel?: string
  /** Click handler */
  onItemClick?: (item: BreakdownItem) => void
  /** Chart height */
  height?: number
  /** Compact mode */
  compact?: boolean
  /** Loading state */
  loading?: boolean
  /** Empty message */
  emptyMessage?: string
  /** Additional class names */
  className?: string
}

// ============================================
// Component
// ============================================

export function CostBreakdownChart({
  title,
  items: propItems,
  useProviders = false,
  category,
  maxItems = 5,
  showOthers = true,
  countLabel = "items",
  onItemClick,
  height: _height = 200,
  compact = false,
  loading: propLoading,
  emptyMessage,
  className,
}: CostBreakdownChartProps) {
  const { formatValue, formatValueCompact, theme, isLoading: contextLoading } = useChartConfig()
  // MEMO-002 FIX: Destructure only needed values to prevent unnecessary re-renders
  const { providerBreakdown, getFilteredProviders } = useCostData()

  // Get items from context if useProviders
  const rawItems = useMemo<BreakdownItem[]>(() => {
    if (propItems) return propItems

    if (useProviders) {
      // MEMO-002 FIX: Use destructured values instead of whole costData object
      let providers = providerBreakdown

      // Filter by category if specified
      if (category) {
        providers = getFilteredProviders(category)
      }

      return providers.map((p, index) => ({
        key: p.provider,
        name: p.provider,
        value: p.total_cost,
        color: getPaletteColor(index, theme),
      }))
    }

    return []
  }, [propItems, useProviders, category, providerBreakdown, getFilteredProviders, theme])

  // Calculate total
  const total = useMemo(
    () => rawItems.reduce((sum, item) => sum + item.value, 0),
    [rawItems]
  )

  // Sort and limit items
  const { displayItems, othersValue } = useMemo(() => {
    const sorted = [...rawItems].sort((a, b) => b.value - a.value)

    if (sorted.length <= maxItems) {
      return { displayItems: sorted, othersValue: 0 }
    }

    const top = sorted.slice(0, maxItems)
    const others = sorted.slice(maxItems)
    const othersTotal = others.reduce((sum, item) => sum + item.value, 0)

    return {
      displayItems: top,
      othersValue: othersTotal,
    }
  }, [rawItems, maxItems])

  // Add "Others" item if needed
  const finalItems = useMemo<BreakdownItem[]>(() => {
    if (showOthers && othersValue > 0) {
      return [
        ...displayItems,
        {
          key: "others",
          name: `Others (${rawItems.length - maxItems})`,
          value: othersValue,
          color: theme.mutedText,
        },
      ]
    }
    return displayItems
  }, [displayItems, showOthers, othersValue, rawItems.length, maxItems, theme])

  // Add percentages
  // EDGE-002 FIX: Guard against NaN in percentage calculation
  const itemsWithPercentages = useMemo(() =>
    finalItems.map((item, index) => {
      const safeValue = Number.isFinite(item.value) ? item.value : 0
      const rawPercentage = total > 0 ? (safeValue / total) * 100 : 0
      return {
        ...item,
        percentage: Number.isFinite(rawPercentage) ? rawPercentage : 0,
        color: item.color || getPaletteColor(index, theme),
      }
    }),
    [finalItems, total, theme]
  )

  // Loading state
  const isLoading = propLoading ?? contextLoading

  return (
    <Card className={cn(
      "overflow-hidden transition-all duration-300",
      "hover:shadow-[var(--shadow-premium-md)] hover:-translate-y-0.5",
      "hover:border-[rgba(144,252,166,0.2)]",
      className
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[15px] sm:text-[17px] font-bold text-slate-900">
            {title}
          </CardTitle>
          <span className="text-xs sm:text-sm font-medium text-slate-900 tabular-nums">
            {compact ? formatValueCompact(total) : formatValue(total)}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {/* Custom horizontal bar rendering for better control */}
        <div className="space-y-2.5 sm:space-y-3">
          {isLoading ? (
            // Loading skeleton - responsive
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="flex items-center justify-between mb-1">
                  <div className="h-2.5 sm:h-3 w-20 sm:w-24 bg-slate-200 rounded" />
                  <div className="h-2.5 sm:h-3 w-12 sm:w-16 bg-slate-200 rounded" />
                </div>
                <div className="h-1.5 sm:h-2 bg-slate-100 rounded-full">
                  <div
                    className="h-full bg-slate-200 rounded-full"
                    style={{ width: `${60 - i * 20}%` }}
                  />
                </div>
              </div>
            ))
          ) : itemsWithPercentages.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              {emptyMessage || "No data available"}
            </div>
          ) : (
            itemsWithPercentages.map((item) => (
              <div
                key={item.key}
                className={cn(
                  "group",
                  onItemClick && "cursor-pointer"
                )}
                onClick={() => onItemClick?.(item)}
              >
                {/* Label row - responsive */}
                <div className="flex items-center justify-between mb-1 sm:mb-1.5">
                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                    <div
                      className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-xs sm:text-sm text-slate-700 group-hover:text-slate-900 truncate">
                      {item.name}
                    </span>
                    {item.count !== undefined && (
                      <span className="hidden sm:inline text-xs text-slate-400">
                        {/* SING-001 FIX: Use proper pluralization instead of fragile slice() */}
                        {item.count} {item.count === 1
                          ? (countLabel.endsWith("s") ? countLabel.slice(0, -1) : countLabel)
                          : countLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <span className="text-xs sm:text-sm font-medium text-slate-900 tabular-nums">
                      {compact ? formatValueCompact(item.value) : formatValue(item.value)}
                    </span>
                    <span className="text-[10px] sm:text-xs text-slate-400 tabular-nums w-8 sm:w-10 text-right">
                      {item.percentage?.toFixed(0)}%
                    </span>
                  </div>
                </div>

                {/* Progress bar - slightly smaller on mobile */}
                <div className="h-1.5 sm:h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================
// Presets
// ============================================

/**
 * Provider breakdown chart
 */
export function ProviderBreakdown(
  props: Omit<CostBreakdownChartProps, "title" | "useProviders" | "countLabel">
) {
  return (
    <CostBreakdownChart
      title="Top Providers"
      useProviders={true}
      countLabel="services"
      {...props}
    />
  )
}

/**
 * Category breakdown chart
 */
export function CategoryBreakdown({
  items,
  ...props
}: Omit<CostBreakdownChartProps, "title" | "useProviders" | "maxItems">) {
  const costData = useCostData()
  const { theme } = useChartConfig()

  const categoryItems = useMemo<BreakdownItem[]>(() => {
    if (items) return items

    if (!costData.totalCosts) return []

    return [
      {
        key: "genai",
        name: "GenAI",
        value: costData.totalCosts.genai?.total_monthly_cost ?? 0,
        count: costData.totalCosts.genai?.providers?.length ?? 0,
        color: theme.categories.genai,
      },
      {
        key: "cloud",
        name: "Cloud",
        value: costData.totalCosts.cloud?.total_monthly_cost ?? 0,
        count: costData.totalCosts.cloud?.providers?.length ?? 0,
        color: theme.categories.cloud,
      },
      {
        key: "subscription",
        name: "Subscriptions",
        value: costData.totalCosts.subscription?.total_monthly_cost ?? 0,
        count: costData.totalCosts.subscription?.providers?.length ?? 0,
        color: theme.categories.subscription,
      },
    ].filter((c) => c.value > 0)
  }, [items, costData.totalCosts, theme])

  return (
    <CostBreakdownChart
      title="Spend by Category"
      items={categoryItems}
      maxItems={3}
      showOthers={false}
      countLabel="providers"
      {...props}
    />
  )
}
