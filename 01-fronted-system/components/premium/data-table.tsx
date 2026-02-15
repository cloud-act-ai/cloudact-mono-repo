"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Search,
  X,
  Filter,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  Loader2,
  LucideIcon,
} from "lucide-react"
import { LoadingState, TableSkeleton } from "@/components/ui/loading-state"
import { EmptyState, InlineEmptyState } from "@/components/ui/empty-state"

// ============================================================================
// Types
// ============================================================================

export interface ColumnDef<T> {
  id: string
  header: string
  accessorKey?: keyof T
  accessorFn?: (row: T) => React.ReactNode
  cell?: (row: T) => React.ReactNode
  sortable?: boolean
  filterable?: boolean
  filterOptions?: { label: string; value: string }[]
  width?: string
  minWidth?: string
  align?: "left" | "center" | "right"
  hideOnMobile?: boolean
  sortFn?: (a: T, b: T, direction: "asc" | "desc") => number
}

export interface FilterValue {
  columnId: string
  value: string | string[]
}

export interface PremiumDataTableProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  keyField: keyof T

  // Features
  searchable?: boolean
  searchPlaceholder?: string
  searchFields?: (keyof T)[]

  sortable?: boolean
  defaultSort?: { column: string; direction: "asc" | "desc" }

  filterable?: boolean
  filters?: FilterValue[]
  onFiltersChange?: (filters: FilterValue[]) => void

  paginated?: boolean
  pageSize?: number
  pageSizeOptions?: number[]

  expandable?: {
    renderExpanded: (row: T, details?: unknown) => React.ReactNode
    loadDetails?: (row: T) => Promise<unknown>
    isExpandable?: (row: T) => boolean
  }

  selectable?: boolean
  selectedRows?: T[]
  onSelectionChange?: (selected: T[]) => void

  // States
  loading?: boolean
  loadingMessage?: string
  emptyState?: {
    icon?: LucideIcon
    title: string
    description?: string
    action?: {
      label: string
      href?: string
      onClick?: () => void
    }
  }

  // Mobile
  mobileCard?: {
    render: (row: T, expanded: boolean, onToggle: () => void) => React.ReactNode
  }

  // Styling
  className?: string
  headerClassName?: string
  rowClassName?: string | ((row: T) => string)

  // Actions
  onRowClick?: (row: T) => void
  headerAction?: React.ReactNode

  // Card wrapper
  title?: string
  subtitle?: string
  titleIcon?: LucideIcon
}

// ============================================================================
// Helper Components
// ============================================================================

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

function SearchInput({ value, onChange, placeholder = "Search...", className }: SearchInputProps) {
  return (
    <div className={cn("relative group", className)}>
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[var(--cloudact-mint)]/20 to-[var(--cloudact-mint-light)]/20 blur-sm opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)] group-focus-within:text-[var(--cloudact-mint-dark)] transition-colors z-10" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "relative w-full h-11 pl-10 pr-10 text-[13px] rounded-xl border border-[var(--border-subtle)]",
          "bg-white/80 backdrop-blur-sm placeholder:text-[var(--text-muted)] text-[var(--text-primary)]",
          "focus:outline-none focus:ring-2 focus:ring-[var(--cloudact-mint)]/40 focus:border-[var(--cloudact-mint)]",
          "focus:bg-white focus:shadow-[0_0_20px_rgba(144,252,166,0.15)]",
          "transition-all duration-300 ease-out"
        )}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-[var(--surface-secondary)] hover:bg-[var(--cloudact-coral)]/10 hover:text-[var(--cloudact-coral)] flex items-center justify-center transition-all duration-200 z-10"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

interface FilterDropdownProps {
  column: ColumnDef<unknown>
  value: string | string[]
  onChange: (value: string | string[]) => void
}

function FilterDropdown({ column, value, onChange }: FilterDropdownProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const dropdownRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const hasValue = Array.isArray(value) ? value.length > 0 : !!value

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "inline-flex items-center gap-2 h-10 px-4 text-[12px] font-semibold rounded-xl border transition-all duration-200",
          hasValue
            ? "bg-gradient-to-r from-[var(--cloudact-mint)]/15 to-[var(--cloudact-mint-light)]/15 border-[var(--cloudact-mint)]/40 text-[#1a7a3a] shadow-sm"
            : "bg-white/80 backdrop-blur-sm border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--cloudact-mint)]/30 hover:bg-[var(--cloudact-mint)]/5"
        )}
      >
        <Filter className={cn("h-3.5 w-3.5", hasValue && "text-[var(--cloudact-mint-dark)]")} />
        {column.header}
        {hasValue && (
          <span className="ml-1 h-5 w-5 rounded-full bg-[var(--cloudact-mint)] text-[var(--text-primary)] text-[10px] font-bold flex items-center justify-center shadow-sm">
            {Array.isArray(value) ? value.length : 1}
          </span>
        )}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {isOpen && column.filterOptions && (
        <div className="absolute top-full left-0 mt-2 w-52 bg-white/95 backdrop-blur-lg rounded-2xl border border-[var(--border-subtle)] shadow-xl shadow-[var(--border-subtle)] z-50 py-2 overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-200">
          <button
            onClick={() => {
              onChange("")
              setIsOpen(false)
            }}
            className={cn(
              "w-full px-4 py-2.5 text-left text-[12px] font-medium transition-all duration-150",
              !hasValue
                ? "bg-gradient-to-r from-[var(--cloudact-mint)]/10 to-transparent text-[#1a7a3a] border-l-2 border-[var(--cloudact-mint)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            All
          </button>
          <div className="h-px bg-[var(--surface-secondary)] mx-3 my-1" />
          {column.filterOptions.map((option) => {
            // Handle both string and array values for comparison
            const isSelected = Array.isArray(value)
              ? value.includes(option.value)
              : value === option.value
            return (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                className={cn(
                  "w-full px-4 py-2.5 text-left text-[12px] font-medium transition-all duration-150",
                  isSelected
                    ? "bg-gradient-to-r from-[var(--cloudact-mint)]/10 to-transparent text-[#1a7a3a] border-l-2 border-[var(--cloudact-mint)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface PaginationProps {
  currentPage: number
  totalPages: number
  pageSize: number
  totalItems: number
  pageSizeOptions?: number[]
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

function Pagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  pageSizeOptions = [10, 25, 50, 100],
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 sm:px-6 py-4 border-t border-[var(--border-subtle)] bg-gradient-to-r from-[var(--surface-secondary)]/50 to-transparent">
      <div className="flex items-center gap-2.5 text-[12px] text-[var(--text-tertiary)]">
        <span className="font-medium">Show</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-white text-[var(--text-secondary)] text-[12px] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--cloudact-mint)]/30 focus:border-[var(--cloudact-mint)] transition-all cursor-pointer"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span className="font-medium">
          of <span className="text-[var(--text-primary)] font-semibold">{totalItems}</span> {totalItems === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="h-9 w-9 rounded-xl border border-[var(--border-subtle)] bg-white flex items-center justify-center hover:bg-[var(--cloudact-mint)]/10 hover:border-[var(--cloudact-mint)]/30 hover:text-[var(--cloudact-mint-dark)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-[var(--border-subtle)] transition-all duration-200"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="h-9 w-9 rounded-xl border border-[var(--border-subtle)] bg-white flex items-center justify-center hover:bg-[var(--cloudact-mint)]/10 hover:border-[var(--cloudact-mint)]/30 hover:text-[var(--cloudact-mint-dark)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-[var(--border-subtle)] transition-all duration-200"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center px-4 h-9 rounded-xl bg-[var(--cloudact-mint)]/10 border border-[var(--cloudact-mint)]/20">
          <span className="text-[12px] font-semibold text-[#1a7a3a]">
            {startItem}–{endItem}
          </span>
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="h-9 w-9 rounded-xl border border-[var(--border-subtle)] bg-white flex items-center justify-center hover:bg-[var(--cloudact-mint)]/10 hover:border-[var(--cloudact-mint)]/30 hover:text-[var(--cloudact-mint-dark)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-[var(--border-subtle)] transition-all duration-200"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="h-9 w-9 rounded-xl border border-[var(--border-subtle)] bg-white flex items-center justify-center hover:bg-[var(--cloudact-mint)]/10 hover:border-[var(--cloudact-mint)]/30 hover:text-[var(--cloudact-mint-dark)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-[var(--border-subtle)] transition-all duration-200"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function PremiumDataTable<T extends object>({
  data,
  columns,
  keyField,
  searchable = false,
  searchPlaceholder = "Search...",
  searchFields,
  sortable = true,
  defaultSort,
  filterable = false,
  filters: externalFilters,
  onFiltersChange,
  paginated = false,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  expandable,
  loading = false,
  loadingMessage = "Loading...",
  emptyState,
  mobileCard,
  className,
  headerClassName,
  rowClassName,
  onRowClick,
  headerAction,
  title,
  subtitle,
  titleIcon: TitleIcon,
}: PremiumDataTableProps<T>) {
  // State
  const [searchQuery, setSearchQuery] = React.useState("")
  const [sortColumn, setSortColumn] = React.useState<string | null>(defaultSort?.column ?? null)
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">(defaultSort?.direction ?? "asc")
  const [internalFilters, setInternalFilters] = React.useState<FilterValue[]>([])
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(initialPageSize)
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set())
  const [expandedDetails, setExpandedDetails] = React.useState<Record<string, unknown>>({})
  const [loadingDetails, setLoadingDetails] = React.useState<Set<string>>(new Set())

  const filters = externalFilters ?? internalFilters
  const setFilters = onFiltersChange ?? setInternalFilters

  // Get row key
  const getRowKey = (row: T): string => String(row[keyField])

  // Search filtering
  const searchFilteredData = React.useMemo(() => {
    if (!searchQuery || !searchable) return data

    const query = searchQuery.toLowerCase()
    const fieldsToSearch = searchFields || (columns.map((c) => c.accessorKey).filter(Boolean) as (keyof T)[])

    return data.filter((row) =>
      fieldsToSearch.some((field) => {
        const value = row[field]
        return value !== null && value !== undefined && String(value).toLowerCase().includes(query)
      })
    )
  }, [data, searchQuery, searchable, searchFields, columns])

  // Column filtering
  const filteredData = React.useMemo(() => {
    if (!filterable || filters.length === 0) return searchFilteredData

    return searchFilteredData.filter((row) =>
      filters.every((filter) => {
        const column = columns.find((c) => c.id === filter.columnId)
        if (!column || !column.accessorKey) return true

        const rawValue = row[column.accessorKey]
        const filterValue = filter.value

        // Handle null/undefined values - don't convert to string "null"/"undefined"
        if (rawValue === null || rawValue === undefined) {
          return !filterValue // Only match if no filter is set
        }

        // Normalize value for comparison (case-insensitive)
        const normalizedValue = String(rawValue).toUpperCase()

        if (Array.isArray(filterValue)) {
          // Empty array means no filter - show all
          if (filterValue.length === 0) return true
          // Check if any filter value matches (case-insensitive)
          return filterValue.some(fv => String(fv).toUpperCase() === normalizedValue)
        }

        // Single value filter - empty string means show all
        if (!filterValue) return true
        return String(filterValue).toUpperCase() === normalizedValue
      })
    )
  }, [searchFilteredData, filters, filterable, columns])

  // Sorting
  const sortedData = React.useMemo(() => {
    if (!sortable || !sortColumn) return filteredData

    const column = columns.find((c) => c.id === sortColumn)
    if (!column) return filteredData

    return [...filteredData].sort((a, b) => {
      if (column.sortFn) {
        return column.sortFn(a, b, sortDirection)
      }

      const aValue = column.accessorKey ? a[column.accessorKey] : column.accessorFn?.(a)
      const bValue = column.accessorKey ? b[column.accessorKey] : column.accessorFn?.(b)

      if (aValue === bValue) return 0
      if (aValue === null || aValue === undefined) return 1
      if (bValue === null || bValue === undefined) return -1

      const comparison = String(aValue).localeCompare(String(bValue), undefined, { numeric: true })
      return sortDirection === "asc" ? comparison : -comparison
    })
  }, [filteredData, sortColumn, sortDirection, sortable, columns])

  // Pagination
  const totalPages = Math.ceil(sortedData.length / pageSize)
  const paginatedData = React.useMemo(() => {
    if (!paginated) return sortedData
    const start = (currentPage - 1) * pageSize
    return sortedData.slice(start, start + pageSize)
  }, [sortedData, currentPage, pageSize, paginated])

  // Reset page and expanded state when filters/sort change
  React.useEffect(() => {
    setCurrentPage(1)
    setExpandedRows(new Set())
    setExpandedDetails({})
  }, [searchQuery, filters, sortColumn, sortDirection])

  // Handlers
  const handleSort = (columnId: string) => {
    if (sortColumn === columnId) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortColumn(columnId)
      setSortDirection("asc")
    }
  }

  const handleFilterChange = (columnId: string, value: string | string[]) => {
    const newFilters = filters.filter((f) => f.columnId !== columnId)
    if (value && (Array.isArray(value) ? value.length > 0 : true)) {
      newFilters.push({ columnId, value })
    }
    setFilters(newFilters)
  }

  const toggleExpanded = async (rowKey: string, row: T) => {
    const newExpanded = new Set(expandedRows)

    if (newExpanded.has(rowKey)) {
      newExpanded.delete(rowKey)
    } else {
      newExpanded.add(rowKey)

      // Load details if needed
      if (expandable?.loadDetails && !expandedDetails[rowKey]) {
        setLoadingDetails((prev) => new Set(prev).add(rowKey))
        try {
          const details = await expandable.loadDetails(row)
          setExpandedDetails((prev) => ({ ...prev, [rowKey]: details }))
        } catch (detailsError) {
          // Log error but keep row expanded (user will see empty/fallback content)
          if (process.env.NODE_ENV === "development") {
            console.warn("[PremiumDataTable] Failed to load row details:", detailsError)
          }
        } finally {
          setLoadingDetails((prev) => {
            const next = new Set(prev)
            next.delete(rowKey)
            return next
          })
        }
      }
    }

    setExpandedRows(newExpanded)
  }

  // Render cell content
  const renderCell = (row: T, column: ColumnDef<T>) => {
    if (column.cell) return column.cell(row)
    if (column.accessorFn) return column.accessorFn(row)
    if (column.accessorKey) return String(row[column.accessorKey] ?? "")
    return null
  }

  // Filter columns for filters
  const filterableColumns = columns.filter((c) => c.filterable && c.filterOptions)

  // Empty state check
  const isEmpty = !loading && paginatedData.length === 0

  return (
    <div
      className={cn(
        "bg-white/95 backdrop-blur-sm rounded-2xl border border-[var(--border-subtle)] overflow-hidden",
        "shadow-[0_4px_24px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.06)]",
        "transition-shadow duration-300",
        className
      )}
    >
      {/* Header */}
      {(title || searchable || filterable || headerAction) && (
        <div className={cn("px-4 sm:px-6 py-4 border-b border-[#E5E5EA]", headerClassName)}>
          {/* Title row */}
          {(title || headerAction) && (
            <div className="flex items-center justify-between gap-3 mb-4">
              {title && (
                <div className="flex items-center gap-2">
                  {TitleIcon && <TitleIcon className="h-[18px] w-[18px] text-[#1a7a3a]" />}
                  <div>
                    <span className="text-[14px] font-semibold text-[var(--text-primary)]">{title}</span>
                    {subtitle && (
                      <span className="text-[11px] text-[var(--text-tertiary)] ml-2">{subtitle}</span>
                    )}
                  </div>
                </div>
              )}
              {headerAction}
            </div>
          )}

          {/* Search and filters row */}
          {(searchable || filterable) && (
            <div className="flex flex-col sm:flex-row gap-3">
              {searchable && (
                <SearchInput
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder={searchPlaceholder}
                  className="flex-1 max-w-sm"
                />
              )}
              {filterable && filterableColumns.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                  {filterableColumns.map((column) => (
                    <FilterDropdown
                      key={column.id}
                      column={column as ColumnDef<unknown>}
                      value={filters.find((f) => f.columnId === column.id)?.value || ""}
                      onChange={(value) => handleFilterChange(column.id, value)}
                    />
                  ))}
                  {filters.length > 0 && (
                    <button
                      onClick={() => setFilters([])}
                      className="inline-flex items-center gap-1 h-9 px-3 text-[12px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <TableSkeleton rows={pageSize} columns={columns.length} />
      )}

      {/* Empty state */}
      {isEmpty && !loading && (
        <EmptyState
          icon={emptyState?.icon}
          title={emptyState?.title || "No data"}
          description={emptyState?.description}
          action={emptyState?.action}
          variant="card"
          size="md"
        />
      )}

      {/* Mobile card view */}
      {!loading && !isEmpty && mobileCard && (
        <div className="md:hidden divide-y divide-[#E5E5EA]">
          {paginatedData.map((row) => {
            const rowKey = getRowKey(row)
            const isExpanded = expandedRows.has(rowKey)
            return (
              <React.Fragment key={rowKey}>
                {mobileCard.render(row, isExpanded, () => toggleExpanded(rowKey, row))}
              </React.Fragment>
            )
          })}
        </div>
      )}

      {/* Desktop table view */}
      {!loading && !isEmpty && (
        <div className={cn("overflow-x-auto", mobileCard && "hidden md:block")}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E5EA] bg-gradient-to-r from-[var(--surface-secondary)]/80 to-transparent">
                {expandable && <th className="w-10 px-4 py-3.5" />}
                {columns.map((column) => (
                  <th
                    key={column.id}
                    className={cn(
                      "px-4 py-3.5 text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider whitespace-nowrap",
                      column.align === "center" && "text-center",
                      column.align === "right" && "text-right",
                      column.hideOnMobile && "hidden lg:table-cell",
                      column.sortable !== false && sortable && "cursor-pointer hover:text-[var(--cloudact-mint-dark)] transition-colors group"
                    )}
                    style={{ width: column.width, minWidth: column.minWidth }}
                    onClick={() => column.sortable !== false && sortable && handleSort(column.id)}
                  >
                    <div
                      className={cn(
                        "inline-flex items-center gap-1.5",
                        column.align === "center" && "justify-center",
                        column.align === "right" && "justify-end"
                      )}
                    >
                      {column.header}
                      {column.sortable !== false && sortable && (
                        <span className="text-[var(--text-muted)] group-hover:text-[var(--cloudact-mint-dark)] transition-colors">
                          {sortColumn === column.id ? (
                            sortDirection === "asc" ? (
                              <ChevronUp className="h-3.5 w-3.5 text-[var(--cloudact-mint-dark)]" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 text-[var(--cloudact-mint-dark)]" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((row) => {
                const rowKey = getRowKey(row)
                const isExpanded = expandedRows.has(rowKey)
                const isLoadingDetail = loadingDetails.has(rowKey)
                const canExpand = expandable && (expandable.isExpandable?.(row) ?? true)
                const rowClasses = typeof rowClassName === "function" ? rowClassName(row) : rowClassName

                return (
                  <React.Fragment key={rowKey}>
                    <tr
                      className={cn(
                        "border-b border-[#E5E5EA]/80 last:border-b-0 group/row",
                        "hover:bg-gradient-to-r hover:from-[var(--cloudact-mint)]/5 hover:to-transparent",
                        "transition-all duration-200",
                        (canExpand || onRowClick) && "cursor-pointer",
                        isExpanded && "bg-[var(--cloudact-mint)]/[0.03]",
                        rowClasses
                      )}
                      onClick={() => {
                        if (canExpand) {
                          toggleExpanded(rowKey, row)
                        } else if (onRowClick) {
                          onRowClick(row)
                        }
                      }}
                    >
                      {expandable && (
                        <td className="px-4 py-4">
                          {canExpand && (
                            <div className={cn(
                              "h-6 w-6 rounded-lg flex items-center justify-center transition-all duration-200",
                              isExpanded
                                ? "bg-[var(--cloudact-mint)]/20 text-[var(--cloudact-mint-dark)]"
                                : "bg-[var(--surface-secondary)] text-[var(--text-muted)] group-hover/row:bg-[var(--cloudact-mint)]/10 group-hover/row:text-[var(--cloudact-mint-dark)]"
                            )}>
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </div>
                          )}
                        </td>
                      )}
                      {columns.map((column) => (
                        <td
                          key={column.id}
                          className={cn(
                            "px-4 py-3 text-[13px] text-[var(--text-secondary)]",
                            column.align === "center" && "text-center",
                            column.align === "right" && "text-right",
                            column.hideOnMobile && "hidden lg:table-cell"
                          )}
                        >
                          {renderCell(row, column)}
                        </td>
                      ))}
                    </tr>

                    {/* Expanded row */}
                    {expandable && isExpanded && (
                      <tr className="bg-gradient-to-br from-[var(--cloudact-mint)]/[0.04] via-[var(--cloudact-mint)]/[0.02] to-transparent animate-in fade-in-0 slide-in-from-top-1 duration-200">
                        <td
                          colSpan={columns.length + 1}
                          className="px-4 sm:px-8 py-6"
                        >
                          <div className="relative">
                            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[var(--cloudact-mint)] to-transparent rounded-full" />
                            <div className="pl-4">
                              {isLoadingDetail ? (
                                <div className="flex items-center justify-center py-8">
                                  <div className="relative">
                                    <div className="absolute inset-0 rounded-full bg-[var(--cloudact-mint)]/20 animate-ping" />
                                    <Loader2 className="h-6 w-6 animate-spin text-[var(--cloudact-mint-dark)] relative z-10" />
                                  </div>
                                </div>
                              ) : (
                                expandable.renderExpanded(row, expandedDetails[rowKey])
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {paginated && !loading && !isEmpty && totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={sortedData.length}
          pageSizeOptions={pageSizeOptions}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setCurrentPage(1)
          }}
        />
      )}

      {/* Results count when no pagination */}
      {!paginated && !loading && !isEmpty && (
        <div className="px-4 sm:px-6 py-3 border-t border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50">
          <p className="text-[11px] text-[var(--text-tertiary)]">
            Showing {sortedData.length} {sortedData.length === 1 ? "result" : "results"}
            {searchQuery && ` for "${searchQuery}"`}
          </p>
        </div>
      )}
    </div>
  )
}

// Types are already exported above as interfaces:
// - ColumnDef (line 26)
// - FilterValue (line 42)
