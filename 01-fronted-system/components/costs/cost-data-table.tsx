"use client"

/**
 * CostDataTable - Table component for cost detail views
 *
 * Features:
 * - Responsive design (card view on mobile)
 * - Sortable columns
 * - Provider icons and colors
 * - Currency formatting
 * - Empty state handling
 */

import { useState } from "react"
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCost } from "@/lib/costs"

// ============================================
// Types
// ============================================

export interface CostTableRow {
  /** Unique identifier */
  id: string
  /** Provider/service name */
  name: string
  /** Display name */
  displayName?: string
  /** Type/category */
  type?: string
  /** Count (subscriptions, services, etc.) */
  count?: number
  /** Daily cost */
  dailyCost: number
  /** Monthly cost */
  monthlyCost: number
  /** Annual cost */
  annualCost: number
  /** Provider color */
  color?: string
  /** Provider icon */
  icon?: React.ReactNode
}

export type SortField = "name" | "dailyCost" | "monthlyCost" | "annualCost" | "count"
export type SortDirection = "asc" | "desc"

export interface CostDataTableProps {
  /** Table title */
  title: string
  /** Optional subtitle */
  subtitle?: string
  /** Table rows */
  rows: CostTableRow[]
  /** Currency code */
  currency?: string
  /** Type column label (e.g., "Category", "Provider") */
  typeLabel?: string
  /** Count column label (e.g., "Subscriptions", "Services") */
  countLabel?: string
  /** Show count column */
  showCount?: boolean
  /** Max rows to show */
  maxRows?: number
  /** Loading state */
  loading?: boolean
  /** Empty state message */
  emptyMessage?: string
  /** Custom class name */
  className?: string
  /** Row click handler */
  onRowClick?: (row: CostTableRow) => void
}

// ============================================
// Loading Skeleton
// ============================================

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-slate-200">
        <div className="h-5 w-40 bg-slate-200 rounded animate-pulse" />
      </div>
      <div className="p-4 sm:p-6">
        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 animate-pulse">
              <div className="h-4 w-32 bg-slate-200 rounded" />
              <div className="h-4 w-16 bg-slate-100 rounded" />
              <div className="flex-1" />
              <div className="h-4 w-20 bg-slate-200 rounded" />
              <div className="h-4 w-20 bg-slate-200 rounded" />
              <div className="h-4 w-20 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================
// Sort Header
// ============================================

interface SortableHeaderProps {
  label: string
  field: SortField
  currentSort: { field: SortField; direction: SortDirection } | null
  onSort: (field: SortField) => void
  align?: "left" | "right"
}

function SortableHeader({
  label,
  field,
  currentSort,
  onSort,
  align = "right",
}: SortableHeaderProps) {
  const isActive = currentSort?.field === field
  const direction = isActive ? currentSort.direction : null

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onSort(field)
    }
  }

  return (
    <TableHead
      className={cn(
        "cursor-pointer hover:bg-slate-50 transition-colors select-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#90FCA6]",
        align === "right" && "text-right"
      )}
      onClick={() => onSort(field)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="columnheader"
      aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}
      aria-label={`Sort by ${label}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          direction === "asc" ? (
            <ArrowUp className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ArrowDown className="h-3 w-3" aria-hidden="true" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-slate-300" aria-hidden="true" />
        )}
      </span>
    </TableHead>
  )
}

// ============================================
// Mobile Card Row
// ============================================

interface MobileCardProps {
  row: CostTableRow
  currency: string
  typeLabel?: string
  countLabel?: string
  showCount: boolean
  onClick?: () => void
}

function MobileCard({
  row,
  currency,
  typeLabel: _typeLabel,
  countLabel,
  showCount,
  onClick,
}: MobileCardProps) {
  return (
    <div
      className={cn(
        "bg-white border border-slate-200 rounded-xl p-4 space-y-3",
        onClick && "cursor-pointer hover:border-slate-300 transition-colors"
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {row.icon && <span>{row.icon}</span>}
          <span className="font-medium text-slate-900">
            {row.displayName || row.name}
          </span>
        </div>
        {row.type && (
          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
            {row.type}
          </span>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xs text-slate-500">Daily</p>
          <p className="font-mono font-bold text-sm">
            {formatCost(row.dailyCost, currency)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Monthly</p>
          <p className="font-mono font-bold text-sm">
            {formatCost(row.monthlyCost, currency)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Annual</p>
          <p className="font-mono font-bold text-sm">
            {formatCost(row.annualCost, currency)}
          </p>
        </div>
      </div>

      {/* Count */}
      {showCount && row.count !== undefined && (
        <p className="text-xs text-slate-500 text-center">
          {row.count} {countLabel}
        </p>
      )}
    </div>
  )
}

// ============================================
// Main Component
// ============================================

export function CostDataTable({
  title,
  subtitle,
  rows,
  currency = "USD",
  typeLabel = "Type",
  countLabel = "Items",
  showCount = false,
  maxRows = 10,
  loading = false,
  emptyMessage = "No data available",
  className,
  onRowClick,
}: CostDataTableProps) {
  const [sort, setSort] = useState<{ field: SortField; direction: SortDirection } | null>(
    null
  )

  if (loading) {
    return <TableSkeleton rows={Math.min(maxRows, 5)} />
  }

  // Sort rows
  const sortedRows = [...rows]
  if (sort) {
    sortedRows.sort((a, b) => {
      let aVal: string | number
      let bVal: string | number

      switch (sort.field) {
        case "name":
          aVal = a.displayName || a.name
          bVal = b.displayName || b.name
          break
        case "count":
          aVal = a.count || 0
          bVal = b.count || 0
          break
        default:
          aVal = a[sort.field]
          bVal = b[sort.field]
      }

      if (typeof aVal === "string") {
        return sort.direction === "asc"
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal)
      }

      return sort.direction === "asc" ? aVal - (bVal as number) : (bVal as number) - aVal
    })
  }

  // Limit rows
  const displayRows = sortedRows.slice(0, maxRows)

  const handleSort = (field: SortField) => {
    if (sort?.field === field) {
      setSort({
        field,
        direction: sort.direction === "asc" ? "desc" : "asc",
      })
    } else {
      setSort({ field, direction: "desc" })
    }
  }

  return (
    <div className={cn("bg-white rounded-xl sm:rounded-2xl border border-slate-200", className)}>
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-slate-200">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        )}
        {rows.length > 0 && (
          <p className="text-xs text-slate-400 mt-1">
            Showing {displayRows.length} of {rows.length} {(countLabel || "items").toLowerCase()}
          </p>
        )}
      </div>

      {/* Empty State */}
      {displayRows.length === 0 ? (
        <div className="p-8 text-center text-slate-500">
          <p className="text-sm">{emptyMessage}</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden sm:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader
                    label="Provider"
                    field="name"
                    currentSort={sort}
                    onSort={handleSort}
                    align="left"
                  />
                  <TableHead>{typeLabel}</TableHead>
                  {showCount && (
                    <SortableHeader
                      label={countLabel}
                      field="count"
                      currentSort={sort}
                      onSort={handleSort}
                    />
                  )}
                  <SortableHeader
                    label="Daily"
                    field="dailyCost"
                    currentSort={sort}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Monthly"
                    field="monthlyCost"
                    currentSort={sort}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Annual"
                    field="annualCost"
                    currentSort={sort}
                    onSort={handleSort}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      onRowClick && "cursor-pointer hover:bg-slate-50 transition-colors"
                    )}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {row.icon && <span>{row.icon}</span>}
                        <span className="font-medium">
                          {row.displayName || row.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {row.type || "—"}
                    </TableCell>
                    {showCount && (
                      <TableCell className="text-right text-slate-600">
                        {row.count ?? "—"}
                      </TableCell>
                    )}
                    <TableCell className="text-right font-mono font-medium">
                      {formatCost(row.dailyCost, currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatCost(row.monthlyCost, currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {formatCost(row.annualCost, currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Cards */}
          <div className="sm:hidden p-4 space-y-3">
            {displayRows.map((row) => (
              <MobileCard
                key={row.id}
                row={row}
                currency={currency}
                typeLabel={typeLabel}
                countLabel={countLabel}
                showCount={showCount}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
