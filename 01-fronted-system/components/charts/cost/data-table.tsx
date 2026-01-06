"use client"

/**
 * Cost Data Table
 *
 * TanStack Table for cost data with ChartProvider integration.
 * Automatically formats currency using the same context as charts.
 */

import React, { useMemo, useState } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"
import { useChartConfig } from "../provider/chart-provider"
import { useCostData } from "@/contexts/cost-data-context"
import { DataTable, SortableHeader } from "../shared/data-table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

// ============================================
// Types
// ============================================

export interface CostTableRow {
  /** Unique key/id */
  key?: string
  id?: string
  /** Provider/item name */
  name: string
  /** Display name (optional, falls back to name) */
  displayName?: string
  /** Single cost value (for simple tables) */
  value?: number
  /** Daily cost */
  dailyCost?: number
  /** Monthly cost */
  monthlyCost?: number
  /** Annual cost */
  annualCost?: number
  /** Previous period value (for comparison) */
  previousValue?: number
  /** Record count */
  count?: number
  /** Category */
  category?: "genai" | "cloud" | "subscription"
  /** Type/subcategory label */
  type?: string
  /** Color for indicator */
  color?: string
  /** Icon */
  icon?: React.ReactNode
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

export interface CostDataTableProps {
  /** Card title */
  title: string
  /** Card subtitle */
  subtitle?: string
  /** Manual rows (bypasses context) */
  rows?: CostTableRow[]
  /** Auto-load from provider breakdown */
  useProviders?: boolean
  /** Filter to category */
  category?: "genai" | "cloud" | "subscription"
  /** Show count column */
  showCount?: boolean
  /** Count column label */
  countLabel?: string
  /** Show type column */
  showType?: boolean
  /** Type column label */
  typeLabel?: string
  /** Show trend/change column */
  showTrend?: boolean
  /** Show multi-column cost format (daily/monthly/annual) */
  showMultiCost?: boolean
  /** Max rows to display */
  maxRows?: number
  /** Enable search */
  searchable?: boolean
  /** Enable pagination */
  paginated?: boolean
  /** Compact mode */
  compact?: boolean
  /** Row click handler */
  onRowClick?: (row: CostTableRow) => void
  /** Loading state */
  loading?: boolean
  /** Empty message */
  emptyMessage?: string
  /** Additional class name */
  className?: string
}

// ============================================
// Trend Badge Component
// ============================================

function TrendBadge({ current, previous }: { current: number; previous?: number }) {
  // DIV-001 FIX: Handle undefined, zero, NaN, and very small values safely
  if (previous === undefined || !Number.isFinite(previous) || Math.abs(previous) < 0.001) {
    return <span className="text-slate-400">—</span>
  }

  const change = ((current - previous) / previous) * 100
  // DIV-001 FIX: Also guard against NaN/Infinity in result
  if (!Number.isFinite(change)) {
    return <span className="text-slate-400">—</span>
  }
  const isUp = change > 0
  const isDown = change < 0

  // VIS-003: Use branded design token colors for trends
  // Coral (#FF6C5E) for cost increase (bad), Green (#10A37F) for decrease (good)
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium text-xs gap-1 transition-colors",
        isUp && "text-[#FF6C5E] border-[#FF6C5E]/30 bg-[#FF6C5E]/10",
        isDown && "text-[#10A37F] border-[#10A37F]/30 bg-[#10A37F]/10",
        !isUp && !isDown && "text-slate-500 border-slate-200 bg-slate-50"
      )}
    >
      {isUp && <TrendingUp className="h-3 w-3" />}
      {isDown && <TrendingDown className="h-3 w-3" />}
      {!isUp && !isDown && <Minus className="h-3 w-3" />}
      {Math.abs(change).toFixed(1)}%
    </Badge>
  )
}

// ============================================
// Component
// ============================================

export function CostDataTable({
  title,
  subtitle,
  rows: propRows,
  useProviders = false,
  category,
  showCount = true,
  countLabel = "records",
  showType = false,
  typeLabel = "Type",
  showTrend = false,
  showMultiCost = false,
  maxRows = 10,
  searchable = false,
  paginated = false,
  compact = false,
  onRowClick,
  loading: propLoading,
  emptyMessage,
  className,
}: CostDataTableProps) {
  const { formatValue, isLoading: contextLoading } = useChartConfig()
  // MEMO-003 FIX: Destructure only needed values to prevent unnecessary re-renders
  const { providerBreakdown, getFilteredProviders } = useCostData()
  const [isExpanded, setIsExpanded] = useState(false)

  const loading = propLoading ?? contextLoading

  // Get data from context if useProviders is true
  const contextRows = useMemo(() => {
    if (!useProviders || propRows) return []

    // MEMO-003 FIX: Use destructured values instead of whole costData object
    const providers = category
      ? getFilteredProviders(category)
      : providerBreakdown

    return providers.map((p) => ({
      key: p.provider,
      name: p.provider,
      value: p.total_cost,
      count: p.record_count,
      category: category, // Use the category prop passed to the component
    }))
  }, [useProviders, propRows, category, providerBreakdown, getFilteredProviders])

  // Use prop rows or context rows
  const allRows = propRows ?? contextRows

  // Limit rows (unless expanded or pagination is enabled)
  const shouldLimit = maxRows > 0 && !isExpanded && !paginated
  const rows = shouldLimit ? allRows.slice(0, maxRows) : allRows
  const hasMoreRows = maxRows > 0 && allRows.length > maxRows

  // Build columns dynamically
  const columns = useMemo<ColumnDef<CostTableRow>[]>(() => {
    const cols: ColumnDef<CostTableRow>[] = [
      // Name column (always shown)
      {
        accessorKey: "name",
        header: ({ column }) => (
          <SortableHeader column={column}>Name</SortableHeader>
        ),
        cell: ({ row }) => {
          const displayName = row.original.displayName || row.original.name
          const color = row.original.color
          const icon = row.original.icon

          return (
            <div className="flex items-center gap-2">
              {color && (
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
              )}
              {icon}
              <span className="font-medium text-slate-900">{displayName}</span>
            </div>
          )
        },
      },
    ]

    // Type column (optional)
    if (showType) {
      cols.push({
        accessorKey: "type",
        header: typeLabel,
        cell: ({ row }) => (
          <span className="text-slate-500 text-sm">{row.original.type || "—"}</span>
        ),
      })
    }

    // Count column (optional)
    if (showCount) {
      cols.push({
        accessorKey: "count",
        header: ({ column }) => (
          <SortableHeader column={column}>
            <span className="capitalize">{countLabel}</span>
          </SortableHeader>
        ),
        cell: ({ row }) => {
          const count = row.original.count
          return (
            <span className="text-slate-600 tabular-nums">
              {count !== undefined ? count.toLocaleString() : "—"}
            </span>
          )
        },
      })
    }

    // Multi-cost columns (dailyCost, monthlyCost, annualCost) OR single value column
    if (showMultiCost) {
      // Daily cost column
      cols.push({
        accessorKey: "dailyCost",
        header: ({ column }) => (
          <div className="text-right">
            <SortableHeader column={column}>Daily</SortableHeader>
          </div>
        ),
        cell: ({ row }) => {
          const value = row.original.dailyCost
          return (
            <div className="text-right text-slate-600 tabular-nums text-sm">
              {value !== undefined ? formatValue(value) : "—"}
            </div>
          )
        },
      })

      // Monthly cost column
      cols.push({
        accessorKey: "monthlyCost",
        header: ({ column }) => (
          <div className="text-right">
            <SortableHeader column={column}>Monthly</SortableHeader>
          </div>
        ),
        cell: ({ row }) => {
          const value = row.original.monthlyCost
          return (
            <div className="text-right font-semibold text-slate-900 tabular-nums">
              {value !== undefined ? formatValue(value) : "—"}
            </div>
          )
        },
      })

      // Annual cost column
      cols.push({
        accessorKey: "annualCost",
        header: ({ column }) => (
          <div className="text-right">
            <SortableHeader column={column}>Annual</SortableHeader>
          </div>
        ),
        cell: ({ row }) => {
          const value = row.original.annualCost
          return (
            <div className="text-right text-slate-600 tabular-nums text-sm">
              {value !== undefined ? formatValue(value) : "—"}
            </div>
          )
        },
      })
    } else {
      // Single value column
      cols.push({
        accessorKey: "value",
        header: ({ column }) => (
          <div className="text-right">
            <SortableHeader column={column}>Amount</SortableHeader>
          </div>
        ),
        cell: ({ row }) => {
          // Use value, or fallback to monthlyCost for backward compatibility
          const value = row.original.value ?? row.original.monthlyCost ?? 0
          return (
            <div className="text-right font-semibold text-slate-900 tabular-nums">
              {formatValue(value)}
            </div>
          )
        },
      })
    }

    // Trend column (optional)
    if (showTrend) {
      cols.push({
        accessorKey: "trend",
        header: "Change",
        cell: ({ row }) => (
          <div className="text-right">
            <TrendBadge current={row.original.value ?? row.original.monthlyCost ?? 0} previous={row.original.previousValue} />
          </div>
        ),
      })
    }

    return cols
  }, [showCount, countLabel, showType, typeLabel, showTrend, showMultiCost, formatValue])

  return (
    <Card className={cn("border-slate-200", className)}>
      <CardHeader className={cn(compact ? "pb-2" : "pb-4")}>
        <CardTitle className="text-base font-semibold text-slate-900">{title}</CardTitle>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent className={cn(compact ? "pt-0" : "")}>
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          searchable={searchable}
          searchColumn="name"
          searchPlaceholder="Search..."
          paginated={paginated}
          pageSize={maxRows}
          compact={compact}
          hoverable
          onRowClick={onRowClick}
          emptyMessage={emptyMessage ?? `No ${title.toLowerCase()} data available.`}
        />

        {/* Show expand/collapse button if there are more rows */}
        {hasMoreRows && !paginated && (
          <div className="flex items-center justify-center gap-2 pt-3 border-t border-slate-100 mt-3">
            <span className="text-sm text-slate-500">
              Showing {isExpanded ? allRows.length : maxRows} of {allRows.length} items
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-sm text-slate-600 hover:text-slate-900 gap-1"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Show All
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================
// Presets
// ============================================

/** Provider cost table preset */
export function ProviderCostTable({
  title = "Provider Costs",
  category,
  ...props
}: Omit<CostDataTableProps, "useProviders">) {
  return (
    <CostDataTable
      title={title}
      useProviders
      category={category}
      showCount
      countLabel="services"
      {...props}
    />
  )
}

/** GenAI provider table preset */
export function GenAIProviderTable({
  title = "GenAI Provider Costs",
  countLabel = "API calls",
  ...props
}: Omit<CostDataTableProps, "useProviders" | "category">) {
  return (
    <ProviderCostTable
      {...props}
      title={title}
      category="genai"
      countLabel={countLabel}
    />
  )
}

/** Cloud provider table preset */
export function CloudProviderTable({
  title = "Cloud Provider Costs",
  countLabel = "resources",
  ...props
}: Omit<CostDataTableProps, "useProviders" | "category">) {
  return (
    <ProviderCostTable
      {...props}
      title={title}
      category="cloud"
      countLabel={countLabel}
    />
  )
}

/** Subscription table preset */
export function SubscriptionCostTable({
  title = "Subscription Costs",
  countLabel = "subscriptions",
  ...props
}: Omit<CostDataTableProps, "useProviders" | "category">) {
  return (
    <ProviderCostTable
      {...props}
      title={title}
      category="subscription"
      countLabel={countLabel}
    />
  )
}
