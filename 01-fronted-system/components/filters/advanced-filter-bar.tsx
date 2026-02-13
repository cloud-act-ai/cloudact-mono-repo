"use client"

/**
 * AdvancedFilterBar — Shared filter UI component for budgets, alerts, and cost pages.
 *
 * Configurable: each page specifies which filter controls to show.
 * All filters share the same AdvancedFilterState from useAdvancedFilters hook.
 *
 * Usage:
 *   const { filters, updateFilters, clearFilters, activeCount } = useAdvancedFilters()
 *   <AdvancedFilterBar filters={filters} onChange={updateFilters} activeCount={activeCount} ... />
 */

import React from "react"
import { Search, X, Filter } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AdvancedFilterState, FilterConfig } from "@/lib/hooks/use-advanced-filters"

// ============================================
// Types
// ============================================

export interface HierarchyOption {
  id: string
  name: string
  level_code: string
}

export interface AdvancedFilterBarProps {
  /** Current filter state */
  filters: AdvancedFilterState
  /** Callback to update filters (partial updates) */
  onChange: (partial: Partial<AdvancedFilterState>) => void
  /** Which filter controls to show */
  config?: FilterConfig
  /** Number of active filters (for clear button) */
  activeCount: number
  /** Reset all filters */
  onClear: () => void
  /** Hierarchy entities for entity filter dropdown */
  hierarchyNodes?: HierarchyOption[]
  /** Provider options for provider filter dropdown */
  providerOptions?: string[]
  /** Custom status options (defaults to over/under for budgets) */
  statusOptions?: { value: string; label: string }[]
  /** Custom category options (defaults to cloud/genai/subscription/total) */
  categoryOptions?: { value: string; label: string }[]
  /** Search placeholder text */
  searchPlaceholder?: string
  /** Optional class name */
  className?: string
}

// ============================================
// Default Options
// ============================================

const DEFAULT_CATEGORY_OPTIONS = [
  { value: "all", label: "All Categories" },
  { value: "cloud", label: "Cloud" },
  { value: "genai", label: "GenAI" },
  { value: "subscription", label: "Subscription" },
  { value: "total", label: "Total" },
]

const DEFAULT_PERIOD_OPTIONS = [
  { value: "all", label: "All Periods" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom" },
]

const DEFAULT_STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "over", label: "Over Budget" },
  { value: "under", label: "Under Budget" },
]

const DEFAULT_TIME_RANGE_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 365 days" },
  { value: "mtd", label: "Month to Date" },
  { value: "ytd", label: "Year to Date" },
]

// ============================================
// Component
// ============================================

export function AdvancedFilterBar({
  filters,
  onChange,
  config = {},
  activeCount,
  onClear,
  hierarchyNodes = [],
  providerOptions = [],
  statusOptions,
  categoryOptions,
  searchPlaceholder = "Search...",
  className,
}: AdvancedFilterBarProps) {
  const showSearch = config.search !== false
  const showCategory = config.category !== false
  const showPeriod = config.periodType === true
  const showStatus = config.status !== false
  const showHierarchy = config.hierarchyEntity !== false && hierarchyNodes.length > 0
  const showProvider = config.provider === true && providerOptions.length > 0
  const showTimeRange = config.timeRange === true

  const catOptions = categoryOptions || DEFAULT_CATEGORY_OPTIONS
  const statOptions = statusOptions || DEFAULT_STATUS_OPTIONS

  return (
    <div className={`space-y-3 ${className || ""}`}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Search input */}
        {showSearch && (
          <div className="relative flex-1 min-w-0 w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <Input
              placeholder={searchPlaceholder}
              value={filters.search}
              onChange={(e) => onChange({ search: e.target.value })}
              className="pl-9 h-9 text-sm"
            />
            {filters.search && (
              <button
                onClick={() => onChange({ search: "" })}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[var(--surface-secondary)]"
              >
                <X className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              </button>
            )}
          </div>
        )}

        {/* Filter dropdowns */}
        <div className="flex items-center gap-2 flex-wrap">
          {showCategory && (
            <Select
              value={filters.category}
              onValueChange={(v) => onChange({ category: v as AdvancedFilterState["category"] })}
            >
              <SelectTrigger className="h-9 w-[130px] text-sm">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {catOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {showPeriod && (
            <Select
              value={filters.periodType}
              onValueChange={(v) => onChange({ periodType: v as AdvancedFilterState["periodType"] })}
            >
              <SelectTrigger className="h-9 w-[130px] text-sm">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_PERIOD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {showTimeRange && (
            <Select
              value={filters.timeRange}
              onValueChange={(v) => onChange({ timeRange: v as AdvancedFilterState["timeRange"] })}
            >
              <SelectTrigger className="h-9 w-[140px] text-sm">
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_TIME_RANGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {showStatus && (
            <Select
              value={filters.status}
              onValueChange={(v) => onChange({ status: v as AdvancedFilterState["status"] })}
            >
              <SelectTrigger className="h-9 w-[130px] text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {statOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {showHierarchy && (
            <Select
              value={filters.hierarchyEntityId}
              onValueChange={(v) => onChange({ hierarchyEntityId: v })}
            >
              <SelectTrigger className="h-9 w-[160px] text-sm">
                <SelectValue placeholder="Entity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                {hierarchyNodes.map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    {node.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {showProvider && (
            <Select
              value={filters.provider}
              onValueChange={(v) => onChange({ provider: v })}
            >
              <SelectTrigger className="h-9 w-[140px] text-sm">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Providers</SelectItem>
                {providerOptions.map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="h-9 px-2 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear ({activeCount})
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// Empty state for filtered results
// ============================================

export function FilteredEmptyState({
  activeCount,
  onClear,
  message = "No results match your filters",
}: {
  activeCount: number
  onClear: () => void
  message?: string
}) {
  return (
    <div className="py-12 text-center">
      <Filter className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-3" />
      <p className="text-sm font-medium text-[var(--text-secondary)]">{message}</p>
      <p className="text-xs text-[var(--text-tertiary)] mt-1">Try adjusting your search or filter criteria</p>
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={onClear} className="mt-3">
          Clear Filters
        </Button>
      )}
    </div>
  )
}
