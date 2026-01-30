"use client"

/**
 * Premium Data Table Component
 *
 * TanStack Table wrapper with premium styling:
 * - Glassmorphism headers
 * - Smooth row hover animations
 * - Animated loading skeletons
 * - Gradient accents
 * - Interactive sorting indicators
 */

import React from "react"
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useChartConfig } from "../provider/chart-provider"

// ============================================
// Types
// ============================================

export interface DataTableProps<TData, TValue> {
  /** Column definitions */
  columns: ColumnDef<TData, TValue>[]
  /** Table data */
  data: TData[]
  /** Loading state */
  loading?: boolean
  /** Enable search filter */
  searchable?: boolean
  /** Search placeholder */
  searchPlaceholder?: string
  /** Column to search */
  searchColumn?: string
  /** Enable pagination */
  paginated?: boolean
  /** Page size */
  pageSize?: number
  /** Enable column visibility toggle */
  columnToggle?: boolean
  /** Compact mode (less padding) */
  compact?: boolean
  /** Striped rows */
  striped?: boolean
  /** Hover effect on rows */
  hoverable?: boolean
  /** Premium styling variant */
  variant?: "default" | "premium" | "minimal"
  /** Row click handler */
  onRowClick?: (row: TData) => void
  /** Empty state message */
  emptyMessage?: string
  /** Additional class name */
  className?: string
}

// ============================================
// Animated Loading Skeleton
// ============================================

function TableSkeleton({ rows = 5, compact = false }: { rows?: number; compact?: boolean }) {
  return (
    <div className="space-y-1 animate-pulse">
      {/* Header skeleton */}
      <div className="h-12 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 rounded-t-xl" />
      {/* Row skeletons with stagger animation */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "bg-gradient-to-r from-slate-50 via-white to-slate-50",
            compact ? "h-10" : "h-12",
            i === rows - 1 && "rounded-b-xl"
          )}
          style={{
            animationDelay: `${i * 50}ms`,
            opacity: 1 - (i * 0.1),
          }}
        />
      ))}
    </div>
  )
}

// ============================================
// Component
// ============================================

export function DataTable<TData, TValue>({
  columns,
  data,
  loading = false,
  searchable = false,
  searchPlaceholder = "Search...",
  searchColumn,
  paginated = false,
  pageSize = 10,
  columnToggle = false,
  compact = false,
  striped = false,
  hoverable = true,
  variant = "default",
  onRowClick,
  emptyMessage = "No results found.",
  className,
}: DataTableProps<TData, TValue>) {
  const { theme } = useChartConfig()
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [hoveredRow, setHoveredRow] = React.useState<string | null>(null)

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    ...(paginated && {
      getPaginationRowModel: getPaginationRowModel(),
      initialState: { pagination: { pageSize } },
    }),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
  })

  // Loading skeleton
  if (loading) {
    return (
      <div className={className}>
        <TableSkeleton rows={5} compact={compact} />
      </div>
    )
  }

  // Premium variant styles
  const isPremium = variant === "premium"
  const isMinimal = variant === "minimal"

  return (
    <div className={cn("space-y-4", className)}>
      {/* Toolbar with premium styling */}
      {(searchable || columnToggle) && (
        <div className="flex items-center justify-between gap-4">
          {/* Premium Search */}
          {searchable && searchColumn && (
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder={searchPlaceholder}
                value={(table.getColumn(searchColumn)?.getFilterValue() as string) ?? ""}
                onChange={(event) =>
                  table.getColumn(searchColumn)?.setFilterValue(event.target.value)
                }
                className={cn(
                  "pl-9 h-9 transition-all duration-200",
                  isPremium && [
                    "bg-white/80 backdrop-blur-sm",
                    "border-slate-200/60",
                    "focus:border-[var(--cloudact-mint)]",
                    "focus:ring-2 focus:ring-[var(--cloudact-mint)]/20",
                  ],
                )}
                style={{
                  "--cloudact-mint": theme.primary,
                } as React.CSSProperties}
              />
            </div>
          )}

          {/* Column Toggle */}
          {columnToggle && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "ml-auto transition-all duration-200",
                    isPremium && "hover:border-slate-300 hover:shadow-sm"
                  )}
                >
                  Columns <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className={cn(
                  isPremium && "bg-white/95 backdrop-blur-xl border-slate-200/60 shadow-lg"
                )}
              >
                {table
                  .getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {/* Table with premium styling - mobile-first with horizontal scroll */}
      <div
        className={cn(
          "overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0", // Mobile: full-bleed scroll
          isMinimal
            ? "border-0"
            : isPremium
            ? "sm:rounded-2xl border-y sm:border border-slate-200/60 shadow-sm"
            : "sm:rounded-xl border-y sm:border border-slate-200",
        )}
        style={{
          boxShadow: isPremium ? theme.shadows.card : undefined,
        }}
      >
        <Table>
          {/* Premium Header */}
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className={cn(
                  "hover:bg-transparent",
                  isPremium
                    ? "bg-gradient-to-r from-slate-50/80 via-white/60 to-slate-50/80 backdrop-blur-sm"
                    : "bg-slate-50/50",
                )}
              >
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "font-semibold",
                      isPremium
                        ? "text-slate-700 border-b border-slate-100"
                        : "text-slate-600",
                      compact ? "py-2 px-3" : "py-3 px-4",
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          {/* Body with hover effects */}
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, index) => {
                const isHovered = hoveredRow === row.id
                // VIS-006: Enhanced row hover highlighting with branded colors
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className={cn(
                      "transition-all duration-200",
                      // Striped
                      striped && index % 2 === 1 && "bg-slate-50/30",
                      // VIS-006: Enhanced hover effects for all variants
                      hoverable && [
                        "hover:bg-[#90FCA6]/5",  // Light mint background on hover
                        isHovered && "bg-[#90FCA6]/8",
                      ],
                      // Clickable - VIS-002: Always show pointer for interactive rows
                      onRowClick && "cursor-pointer",
                      // Premium hover
                      isPremium && hoverable && [
                        "relative",
                        isHovered && "bg-gradient-to-r from-[#90FCA6]/5 via-[#90FCA6]/10 to-[#90FCA6]/5",
                      ],
                    )}
                    style={{
                      // VIS-006: Enhanced hover glow with mint accent
                      boxShadow: isHovered
                        ? isPremium
                          ? `inset 0 0 0 1px #90FCA640, 0 2px 8px #90FCA620`
                          : `inset 0 0 0 1px #90FCA630`
                        : undefined,
                      // Smooth transition for shadow
                      transition: "box-shadow 0.2s ease, background-color 0.2s ease",
                    }}
                    onClick={() => onRowClick?.(row.original)}
                    onMouseEnter={() => setHoveredRow(row.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "transition-colors duration-150",
                          compact ? "py-2 px-3" : "py-3 px-4",
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className={cn(
                    "h-24 text-center",
                    isPremium
                      ? "text-slate-400 italic"
                      : "text-slate-500",
                  )}
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Premium Pagination */}
      {paginated && table.getPageCount() > 1 && (
        <div className={cn(
          "flex items-center justify-between",
          isPremium && "pt-1",
        )}>
          <div className={cn(
            "text-sm",
            isPremium ? "text-slate-500 font-medium" : "text-slate-500",
          )}>
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className={cn(
                "transition-all duration-200",
                isPremium && [
                  "h-8 w-8 p-0",
                  "hover:bg-slate-100 hover:border-slate-300",
                  "disabled:opacity-40",
                ],
              )}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {/* Page number pills */}
            {isPremium && (
              <div className="flex items-center gap-1 px-2">
                {Array.from({ length: Math.min(table.getPageCount(), 5) }).map((_, i) => {
                  const pageIndex = table.getState().pagination.pageIndex
                  const page = i
                  const isActive = page === pageIndex
                  return (
                    <button
                      key={i}
                      onClick={() => table.setPageIndex(page)}
                      className={cn(
                        "h-7 min-w-7 px-2 rounded-md text-xs font-medium transition-all duration-200",
                        isActive
                          ? "bg-slate-900 text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-100",
                      )}
                    >
                      {page + 1}
                    </button>
                  )
                })}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className={cn(
                "transition-all duration-200",
                isPremium && [
                  "h-8 w-8 p-0",
                  "hover:bg-slate-100 hover:border-slate-300",
                  "disabled:opacity-40",
                ],
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// Helper: Sortable Header (Premium)
// ============================================

export function SortableHeader({
  column,
  children,
  className,
}: {
  column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | "asc" | "desc" }
  children: React.ReactNode
  className?: string
}) {
  const sortState = column.getIsSorted()

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "-ml-3 h-8 group transition-all duration-200",
        "data-[state=open]:bg-accent",
        "hover:bg-slate-100/80",
        className,
      )}
      onClick={() => column.toggleSorting(sortState === "asc")}
    >
      {children}
      <span className={cn(
        "ml-2 transition-all duration-200",
        sortState && "text-slate-900",
        !sortState && "text-slate-400 group-hover:text-slate-600",
      )}>
        {sortState === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : sortState === "desc" ? (
          <ArrowDown className="h-3.5 w-3.5" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5" />
        )}
      </span>
    </Button>
  )
}

// ============================================
// Premium Progress Cell (for value columns)
// ============================================

interface ProgressCellProps {
  value: number
  maxValue: number
  color?: string
  showValue?: boolean
  valueFormatter?: (value: number) => string
}

export function ProgressCell({
  value,
  maxValue,
  color = "#90FCA6",
  showValue = true,
  valueFormatter,
}: ProgressCellProps) {
  const percentage = Math.min((value / maxValue) * 100, 100)
  const formattedValue = valueFormatter ? valueFormatter(value) : value.toLocaleString()

  return (
    <div className="flex items-center gap-3 min-w-[120px]">
      {/* Progress bar */}
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${percentage}%`,
            background: `linear-gradient(90deg, ${color} 0%, ${color}CC 100%)`,
            boxShadow: `0 0 8px ${color}40`,
          }}
        />
      </div>
      {/* Value */}
      {showValue && (
        <span className="text-sm font-medium text-slate-700 tabular-nums min-w-[60px] text-right">
          {formattedValue}
        </span>
      )}
    </div>
  )
}

// ============================================
// Status Badge Cell
// ============================================

interface StatusBadgeCellProps {
  status: "success" | "warning" | "error" | "info" | "neutral"
  label: string
}

const statusColors = {
  success: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  warning: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  error: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  info: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  neutral: { bg: "bg-slate-50", text: "text-slate-700", dot: "bg-slate-400" },
}

export function StatusBadgeCell({ status, label }: StatusBadgeCellProps) {
  const colors = statusColors[status]

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
      colors.bg,
      colors.text,
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full", colors.dot)} />
      {label}
    </span>
  )
}

// Re-export types for convenience
export type { ColumnDef, SortingState, ColumnFiltersState }
