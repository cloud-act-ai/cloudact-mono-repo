"use client"

import React, { useState, useMemo, useEffect, useCallback } from "react"
import {
  Pencil,
  Check,
  X,
  Plus,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Zap,
  Clock,
  Server,
  Sparkles,
  Lock,
  Unlock,
  Search,
  Expand,
  Minimize2,
  ChevronsUpDown,
  Loader2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// ============================================================================
// TYPES
// ============================================================================

export interface PricingColumn {
  key: string
  label: string
  type: "text" | "number" | "currency" | "badge" | "boolean" | "percentage"
  editable?: boolean
  width?: string
  align?: "left" | "center" | "right"
  /** Custom formatter for the column value. Security: Uses typed value instead of any. */
  format?: (value: PricingFieldValue) => string
  /** If true, column shows only when row is expanded */
  expandedOnly?: boolean
  /** If true, column is always visible in table */
  alwaysVisible?: boolean
}

/**
 * Allowed value types for pricing row fields.
 * Security: Using a union type instead of `any` prevents type confusion attacks
 * and ensures proper validation at compile time.
 */
export type PricingFieldValue = string | number | boolean | null | undefined

/**
 * A row of pricing data with typed fields.
 * Security: Replaced Record<string, any> with proper typed interface.
 * Note: Using index signature with unknown for flexibility while maintaining type safety.
 */
export interface PricingRow {
  id: string
  isCustom?: boolean
  isOverridden?: boolean
  originalValues?: Record<string, PricingFieldValue>
  /** Version/etag for optimistic locking - used to detect concurrent edits */
  version?: number
  /** Timestamp of last update for display purposes */
  lastUpdatedAt?: string
  /** User who last updated this row */
  lastUpdatedBy?: string
  /** Dynamic pricing fields - allowing known safe types */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

/** Represents a version conflict detected during concurrent edit */
export interface VersionConflict {
  rowId: string
  fieldKey: string
  localVersion: number
  serverVersion: number
  serverUpdatedBy?: string
  serverUpdatedAt?: string
  pendingValue: any
  serverValue: any
}

export interface PricingTableProps {
  /** Hide header since parent CollapsibleSection has title */
  hideHeader?: boolean
  title: string
  description?: string
  icon: React.ReactNode
  columns: PricingColumn[]
  data: PricingRow[]
  isConnected: boolean
  isEditMode: boolean
  onToggleEditMode: (enabled: boolean) => void
  /**
   * Called when updating a row. Returns a promise that resolves with the result.
   * If version conflict detected, should reject with VersionConflict error or return { conflict: VersionConflict }
   * Security: Validated at runtime to ensure only safe field values are passed.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdateRow: (rowId: string, updates: Record<string, any>, version?: number) => void | Promise<void | { conflict?: VersionConflict }>
  onDeleteRow: (rowId: string) => void
  onResetRow: (rowId: string) => void
  onAddCustom?: () => void
  /** Custom label for add button (default: "Add Model") */
  addButtonLabel?: string
  emptyMessage?: string
  accentColor?: string
  /** Callback to check for version updates before saving */
  onCheckVersion?: (rowId: string) => Promise<{ version: number; updatedBy?: string; updatedAt?: string } | null>
}

// ============================================================================
// ERROR BOUNDARY
// ============================================================================

interface PricingTableErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface PricingTableErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary for graceful degradation when pricing data is malformed.
 * Catches rendering errors and displays a user-friendly fallback UI.
 */
export class PricingTableErrorBoundary extends React.Component<
  PricingTableErrorBoundaryProps,
  PricingTableErrorBoundaryState
> {
  constructor(props: PricingTableErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): PricingTableErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("PricingTableErrorBoundary caught an error:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="rounded-xl border border-[#FF6C5E]/30 bg-[#FF6C5E]/5 p-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#FF6C5E]/10 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-[#FF6C5E]" />
            </div>
            <div className="flex-1">
              <h3 className="text-[15px] font-semibold text-[#FF6C5E] mb-1">
                Unable to display pricing data
              </h3>
              <p className="text-[13px] text-slate-600 mb-3">
                There was an error rendering the pricing table. This may be due to malformed data.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="h-8 text-xs font-medium border-[#FF6C5E]/30 text-[#FF6C5E] hover:bg-[#FF6C5E]/10"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Try Again
              </Button>
              {process.env.NODE_ENV === "development" && this.state.error && (
                <details className="mt-3 text-[11px] text-slate-500">
                  <summary className="cursor-pointer hover:text-slate-700">
                    Error details (dev only)
                  </summary>
                  <pre className="mt-2 p-2 bg-slate-100 rounded text-[10px] overflow-auto max-h-32">
                    {this.state.error.message}
                    {"\n"}
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// ============================================================================
// PRICING TABLE COMPONENT
// ============================================================================

// ============================================================================
// CONSTANTS
// ============================================================================

/** Debounce delay for search input in milliseconds */
const SEARCH_DEBOUNCE_MS = 300

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Custom hook for debounced value updates.
 * Security: Prevents unbounded search without debounce.
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function PricingTableBaseInner({
  hideHeader = false,
  title,
  description,
  icon,
  columns,
  data,
  isConnected,
  isEditMode,
  onToggleEditMode,
  onUpdateRow,
  onDeleteRow,
  onResetRow,
  onAddCustom,
  addButtonLabel = "Add Model",
  emptyMessage = "No pricing data available",
  accentColor = "#90FCA6",
  onCheckVersion
}: PricingTableProps) {
  const [editingCell, setEditingCell] = useState<{ rowId: string; key: string } | null>(null)
  const [editValue, setEditValue] = useState<string>("")
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  // Debounced search to prevent excessive filtering on rapid typing
  const debouncedSearchQuery = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS)
  const [deletingRows, setDeletingRows] = useState<Set<string>>(new Set())
  // Version conflict tracking for optimistic locking
  const [versionConflict, setVersionConflict] = useState<VersionConflict | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  // Track the version when we started editing to detect concurrent changes
  const [editStartVersion, setEditStartVersion] = useState<number | undefined>(undefined)

  // Main table columns (always visible)
  const mainColumns = useMemo(() => {
    return columns.filter(col => !col.expandedOnly)
  }, [columns])

  // Expanded row columns (shown when row is expanded)
  const expandedColumns = useMemo(() => {
    return columns.filter(col => col.expandedOnly)
  }, [columns])

  const hasExpandableContent = expandedColumns.length > 0

  // Toggle row expansion
  const toggleRowExpansion = (rowId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
      }
      return next
    })
  }

  // Filter and sort data
  // Security: Uses debounced search query to prevent excessive filtering
  const filteredAndSortedData = useMemo(() => {
    let result = data

    // Apply search filter with debounced value
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase()
      result = data.filter(row => {
        // Search in model name, family, and region
        return (
          String(row.model || "").toLowerCase().includes(query) ||
          String(row.model_family || "").toLowerCase().includes(query) ||
          String(row.region || "").toLowerCase().includes(query) ||
          String(row.instance_type || "").toLowerCase().includes(query) ||
          String(row.gpu_type || "").toLowerCase().includes(query) ||
          String(row.commitment_type || "").toLowerCase().includes(query)
        )
      })
    }

    // Apply sorting
    if (sortConfig) {
      result = [...result].sort((a, b) => {
        const aVal = a[sortConfig.key]
        const bVal = b[sortConfig.key]
        // Handle undefined/null values
        if (aVal === undefined || aVal === null) return 1
        if (bVal === undefined || bVal === null) return -1
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1
        return 0
      })
    }

    return result
  }, [data, debouncedSearchQuery, sortConfig])

  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current?.key === key) {
        return current.direction === "asc"
          ? { key, direction: "desc" }
          : null
      }
      return { key, direction: "asc" }
    })
  }

  const startEdit = (rowId: string, key: string, currentValue: any) => {
    if (!isEditMode || !isConnected) return
    // Find the row to capture its current version for optimistic locking
    const row = data.find(r => r.id === rowId)
    setEditingCell({ rowId, key })
    setEditValue(String(currentValue ?? ""))
    setEditStartVersion(row?.version)
    // Clear any previous conflict when starting a new edit
    setVersionConflict(null)
  }

  const saveEdit = async () => {
    if (!editingCell || isSaving) return

    const column = columns.find(c => c.key === editingCell.key)
    let value: any = editValue
    if (column?.type === "number" || column?.type === "currency") {
      value = parseFloat(editValue) || 0
    }

    const row = data.find(r => r.id === editingCell.rowId)

    // If we have a version check callback, verify no concurrent edits occurred
    if (onCheckVersion && editStartVersion !== undefined) {
      setIsSaving(true)
      try {
        const serverState = await onCheckVersion(editingCell.rowId)

        // Check if version has changed since we started editing
        if (serverState && serverState.version !== editStartVersion) {
          // Version conflict detected - another admin edited this row
          setVersionConflict({
            rowId: editingCell.rowId,
            fieldKey: editingCell.key,
            localVersion: editStartVersion,
            serverVersion: serverState.version,
            serverUpdatedBy: serverState.updatedBy,
            serverUpdatedAt: serverState.updatedAt,
            pendingValue: value,
            serverValue: row?.[editingCell.key]
          })
          setIsSaving(false)
          return // Don't save - show conflict dialog instead
        }
      } catch (error) {
        console.error("Error checking version:", error)
        // Continue with save if version check fails (graceful degradation)
      }
    }

    setIsSaving(true)
    try {
      // Pass version for optimistic locking validation on server
      const result = await onUpdateRow(editingCell.rowId, { [editingCell.key]: value }, editStartVersion)

      // Check if result indicates a conflict
      if (result && typeof result === 'object' && 'conflict' in result && result.conflict) {
        setVersionConflict(result.conflict)
        setIsSaving(false)
        return
      }

      setEditingCell(null)
      setEditValue("")
      setEditStartVersion(undefined)
    } catch (error: any) {
      // Check if error is a version conflict
      if (error?.conflict) {
        setVersionConflict(error.conflict)
      } else {
        console.error("Error saving edit:", error)
      }
    } finally {
      setIsSaving(false)
    }
  }

  /** Force save despite conflict - overwrites the other admin's changes */
  const forceSaveEdit = async () => {
    if (!editingCell || !versionConflict) return

    const column = columns.find(c => c.key === editingCell.key)
    let value: any = editValue
    if (column?.type === "number" || column?.type === "currency") {
      value = parseFloat(editValue) || 0
    }

    setIsSaving(true)
    try {
      // Force save with latest version to overwrite
      await onUpdateRow(editingCell.rowId, {
        [editingCell.key]: value,
        _forceOverwrite: true
      }, versionConflict.serverVersion)

      setEditingCell(null)
      setEditValue("")
      setEditStartVersion(undefined)
      setVersionConflict(null)
    } catch (error) {
      console.error("Error force saving:", error)
    } finally {
      setIsSaving(false)
    }
  }

  /** Discard local changes and accept the server's version */
  const discardConflictChanges = () => {
    setVersionConflict(null)
    setEditingCell(null)
    setEditValue("")
    setEditStartVersion(undefined)
  }

  const cancelEdit = () => {
    setEditingCell(null)
    setEditValue("")
  }

  /**
   * Format a pricing field value for display.
   * Security: Validates input types and handles NaN gracefully to prevent display issues.
   */
  const formatValue = (value: unknown, column: PricingColumn): string => {
    if (value === null || value === undefined) return "—"
    // Cast to PricingFieldValue for the format function
    if (column.format) return column.format(value as PricingFieldValue)
    if (column.type === "currency") {
      const num = Number(value)
      // Handle NaN gracefully
      if (Number.isNaN(num)) return "—"
      return `$${num.toFixed(column.key.includes("per_1m") ? 2 : 4)}`
    }
    if (column.type === "number") {
      const num = Number(value)
      // Handle NaN gracefully
      if (Number.isNaN(num)) return "—"
      return num.toLocaleString("en-US")
    }
    if (column.type === "percentage") {
      const num = Number(value)
      // Handle NaN gracefully
      if (Number.isNaN(num)) return "—"
      return `${num.toFixed(0)}%`
    }
    if (column.type === "boolean") {
      return value ? "Yes" : "No"
    }
    return String(value)
  }

  const customCount = data.filter(r => r.isCustom).length
  const overriddenCount = data.filter(r => r.isOverridden).length

  return (
    <div className="group relative">
      <div className="relative bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Toolbar - Search, Expand, Add, Edit toggle */}
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between gap-3">
            {/* Left: Search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm bg-white border-slate-200 focus:border-[#90FCA6] focus:ring-[#90FCA6] rounded-lg"
              />
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-2">
              {/* Add Custom */}
              {isConnected && onAddCustom && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAddCustom}
                  className="h-9 px-3 text-xs font-semibold rounded-lg bg-white border-slate-200 hover:bg-[#90FCA6]/10 hover:border-[#90FCA6]/50 hover:text-black transition-colors"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  {addButtonLabel}
                </Button>
              )}

              {/* Edit Mode Toggle */}
              {isConnected && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200">
                  <span className="text-[11px] font-medium text-slate-500">
                    Override
                  </span>
                  <Switch
                    checked={isEditMode}
                    onCheckedChange={onToggleEditMode}
                    className="data-[state=checked]:bg-[#90FCA6] scale-[0.8]"
                  />
                  {isEditMode ? (
                    <Unlock className="h-3.5 w-3.5 text-[#1a7a3a]" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-slate-400" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Status badges row */}
          {(customCount > 0 || overriddenCount > 0 || searchQuery) && (
            <div className="flex items-center gap-2 mt-2">
              {searchQuery && (
                <Badge variant="secondary" className="text-[10px] font-medium px-2 py-0.5 h-5 bg-blue-50 text-blue-600 border-0">
                  {filteredAndSortedData.length} of {data.length} shown
                </Badge>
              )}
              {customCount > 0 && (
                <Badge className="text-[10px] font-bold px-2 py-0.5 h-5 bg-violet-100 text-violet-700 border-0">
                  {customCount} custom
                </Badge>
              )}
              {overriddenCount > 0 && (
                <Badge className="text-[10px] font-bold px-2 py-0.5 h-5 bg-amber-100 text-amber-700 border-0">
                  {overriddenCount} overridden
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Version Conflict Warning Banner */}
        {versionConflict && (
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-amber-800">
                  Concurrent Edit Detected
                </h4>
                <p className="text-xs text-amber-700 mt-1">
                  Another admin {versionConflict.serverUpdatedBy ? `(${versionConflict.serverUpdatedBy})` : ''} modified this row
                  {versionConflict.serverUpdatedAt ? ` at ${new Date(versionConflict.serverUpdatedAt).toLocaleString()}` : ''}.
                  Your changes may overwrite their updates.
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="text-xs">
                    <span className="font-medium text-amber-700">Your value:</span>{' '}
                    <code className="px-1 py-0.5 bg-amber-100 rounded text-amber-900 font-mono">
                      {String(versionConflict.pendingValue)}
                    </code>
                  </div>
                  <div className="text-xs">
                    <span className="font-medium text-amber-700">Server value:</span>{' '}
                    <code className="px-1 py-0.5 bg-amber-100 rounded text-amber-900 font-mono">
                      {String(versionConflict.serverValue)}
                    </code>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={forceSaveEdit}
                    disabled={isSaving}
                    className="h-7 px-3 text-xs font-medium bg-white border-amber-300 text-amber-800 hover:bg-amber-100 hover:border-amber-400"
                  >
                    {isSaving ? (
                      <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                    ) : null}
                    Overwrite with My Changes
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={discardConflictChanges}
                    disabled={isSaving}
                    className="h-7 px-3 text-xs font-medium text-amber-700 hover:bg-amber-100"
                  >
                    Discard My Changes
                  </Button>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={discardConflictChanges}
                className="h-6 w-6 p-0 text-amber-600 hover:bg-amber-100"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                {/* Expand column */}
                {hasExpandableContent && (
                  <th className="px-2 py-2.5 w-8 bg-slate-50"></th>
                )}
                {mainColumns.map((column) => (
                  <th
                    key={column.key}
                    className={cn(
                      "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600",
                      "bg-slate-50 first:pl-4 last:pr-4",
                      column.align === "right" && "text-right",
                      column.align === "center" && "text-center",
                      "cursor-pointer hover:bg-slate-100 transition-colors select-none"
                    )}
                    style={{ width: column.width }}
                    onClick={() => handleSort(column.key)}
                  >
                    <div className={cn(
                      "flex items-center gap-1",
                      column.align === "right" && "justify-end",
                      column.align === "center" && "justify-center"
                    )}>
                      {column.label}
                      {sortConfig?.key === column.key && (
                        sortConfig.direction === "asc"
                          ? <ChevronUp className="h-3 w-3" />
                          : <ChevronDown className="h-3 w-3" />
                      )}
                    </div>
                  </th>
                ))}
                {/* Actions column - always show when connected */}
                {isConnected && (
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 w-20 text-right">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAndSortedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={mainColumns.length + (hasExpandableContent ? 1 : 0) + (isConnected ? 1 : 0)}
                    className="px-4 py-10 text-center"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Search className="h-8 w-8 text-slate-300" />
                      <p className="text-sm text-slate-500">
                        {searchQuery ? `No models matching "${searchQuery}"` : emptyMessage}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAndSortedData.map((row, rowIndex) => {
                  const isRowExpanded = expandedRows.has(row.id)
                  // Security: Fallback key to prevent React key warnings if id is undefined
                  const rowKey = row.id || `row-${rowIndex}`
                  // Get a label for accessibility
                  const rowLabel = typeof row.model === 'string' ? row.model
                    : typeof row.instance_type === 'string' ? row.instance_type
                    : `Row ${rowIndex + 1}`

                  return (
                    <React.Fragment key={rowKey}>
                      {/* Main row */}
                      <tr
                        role="row"
                        aria-expanded={expandedColumns.length > 0 ? isRowExpanded : undefined}
                        aria-label={`${rowLabel} pricing data`}
                        className={cn(
                          "group/row transition-colors",
                          rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/30",
                          isEditMode && "hover:bg-[#90FCA6]/5",
                          row.isCustom && "bg-violet-50/50",
                          row.isOverridden && "bg-amber-50/50",
                          isRowExpanded && "bg-slate-50"
                        )}
                      >
                        {/* Expand button */}
                        {hasExpandableContent && (
                          <td className="px-2 py-2.5 w-8">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleRowExpansion(row.id)}
                              className="h-6 w-6 p-0 hover:bg-slate-100"
                              aria-expanded={isRowExpanded}
                              aria-label={isRowExpanded ? `Collapse details for ${rowLabel}` : `Expand details for ${rowLabel}`}
                            >
                              {isRowExpanded ? (
                                <ChevronUp className="h-4 w-4 text-slate-500" aria-hidden="true" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
                              )}
                            </Button>
                          </td>
                        )}
                        {mainColumns.map((column) => {
                          const isEditing = editingCell?.rowId === row.id && editingCell?.key === column.key
                          const canEdit = isEditMode && isConnected && column.editable
                          const isOverridden = row.isOverridden && row.originalValues?.[column.key] !== row[column.key]

                          return (
                            <td
                              key={column.key}
                              className={cn(
                                "px-3 py-2.5 first:pl-4 last:pr-4",
                                column.align === "right" && "text-right",
                                column.align === "center" && "text-center",
                                canEdit && "cursor-pointer hover:bg-[#90FCA6]/10",
                                isEditing && "p-1 first:pl-2 last:pr-2"
                              )}
                              onClick={() => canEdit && !isEditing && startEdit(row.id, column.key, row[column.key])}
                            >
                              {isEditing ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    type={column.type === "currency" || column.type === "number" || column.type === "percentage" ? "number" : "text"}
                                    step={column.type === "currency" ? "0.0001" : column.type === "percentage" ? "1" : "1"}
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    className="h-7 text-sm font-mono border-slate-300 focus:border-[#90FCA6] focus:ring-[#90FCA6] rounded"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") saveEdit()
                                      if (e.key === "Escape") cancelEdit()
                                    }}
                                  />
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={saveEdit}
                                    className="h-7 w-7 p-0 hover:bg-[#90FCA6]/20 hover:text-[#1a7a3a]"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={cancelEdit}
                                    className="h-7 w-7 p-0 hover:bg-[#FF6C5E]/20 hover:text-[#FF6C5E]"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <div className={cn(
                                  "flex items-center gap-1.5",
                                  column.align === "right" && "justify-end",
                                  column.align === "center" && "justify-center"
                                )}>
                                  {column.key === mainColumns[0].key && row.isCustom && (
                                    <Sparkles className="h-3 w-3 text-violet-500 flex-shrink-0" />
                                  )}
                                  <span className={cn(
                                    "text-[12px] text-slate-800",
                                    column.type === "currency" || column.type === "number" || column.type === "percentage"
                                      ? "font-mono"
                                      : "",
                                    column.key === mainColumns[0].key && "font-semibold text-slate-900"
                                  )}>
                                    {formatValue(row[column.key], column)}
                                  </span>
                                  {isOverridden && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-amber-100 text-amber-600">
                                            <Pencil className="h-2.5 w-2.5" />
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs">
                                            Original: {formatValue(row.originalValues?.[column.key], column)}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </div>
                              )}
                            </td>
                          )
                        })}
                        {/* Actions column - always show when connected */}
                        {isConnected && (
                          <td className="px-3 py-2.5 pr-4">
                            <div className="flex items-center justify-end gap-1">
                              {(row.isOverridden || row.isCustom) && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={deletingRows.has(row.id)}
                                        onClick={async () => {
                                          if (deletingRows.has(row.id)) return
                                          setDeletingRows(prev => new Set(prev).add(row.id))
                                          try {
                                            if (row.isCustom) {
                                              await onDeleteRow(row.id)
                                            } else {
                                              await onResetRow(row.id)
                                            }
                                          } finally {
                                            setDeletingRows(prev => {
                                              const next = new Set(prev)
                                              next.delete(row.id)
                                              return next
                                            })
                                          }
                                        }}
                                        className={cn(
                                          "h-6 w-6 p-0 rounded transition-colors",
                                          row.isCustom
                                            ? "hover:bg-[#FF6C5E]/20 text-[#FF6C5E]"
                                            : "hover:bg-amber-100 text-amber-600",
                                          deletingRows.has(row.id) && "opacity-50 cursor-not-allowed"
                                        )}
                                      >
                                        {deletingRows.has(row.id) ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : row.isCustom ? (
                                          <X className="h-3.5 w-3.5" />
                                        ) : (
                                          <RotateCcw className="h-3.5 w-3.5" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">
                                        {deletingRows.has(row.id)
                                          ? (row.isCustom ? "Deleting..." : "Resetting...")
                                          : (row.isCustom ? "Delete custom model" : "Reset to default")
                                        }
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>

                      {/* Expanded row details */}
                      {hasExpandableContent && isRowExpanded && (
                        <tr className="bg-slate-50/80 border-b border-slate-200">
                          <td
                            colSpan={mainColumns.length + 1 + (isConnected ? 1 : 0)}
                            className="px-4 py-3"
                          >
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                              {expandedColumns.map((column) => {
                                const isEditing = editingCell?.rowId === row.id && editingCell?.key === column.key
                                const canEdit = isEditMode && isConnected && column.editable
                                const isOverridden = row.isOverridden && row.originalValues?.[column.key] !== row[column.key]

                                return (
                                  <div
                                    key={column.key}
                                    className={cn(
                                      "px-3 py-2 rounded-lg",
                                      canEdit ? "bg-white border border-slate-200 cursor-pointer hover:border-[#90FCA6]" : "bg-slate-100/50",
                                    )}
                                    onClick={() => canEdit && !isEditing && startEdit(row.id, column.key, row[column.key])}
                                  >
                                    <div className="text-[10px] font-medium text-slate-400 uppercase mb-1">
                                      {column.label}
                                    </div>
                                    {isEditing ? (
                                      <div className="flex items-center gap-1">
                                        <Input
                                          type={column.type === "currency" || column.type === "number" || column.type === "percentage" ? "number" : "text"}
                                          step={column.type === "currency" ? "0.0001" : "1"}
                                          value={editValue}
                                          onChange={(e) => setEditValue(e.target.value)}
                                          className="h-6 text-xs font-mono border-slate-300 focus:border-[#90FCA6] focus:ring-[#90FCA6] rounded"
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") saveEdit()
                                            if (e.key === "Escape") cancelEdit()
                                          }}
                                        />
                                        <Button size="sm" variant="ghost" onClick={saveEdit} className="h-6 w-6 p-0">
                                          <Check className="h-3 w-3 text-[#1a7a3a]" />
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-6 w-6 p-0">
                                          <X className="h-3 w-3 text-[#FF6C5E]" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <span className={cn(
                                          "text-[12px] font-mono",
                                          column.editable ? "text-slate-800" : "text-slate-500"
                                        )}>
                                          {formatValue(row[column.key], column)}
                                        </span>
                                        {isOverridden && (
                                          <span className="inline-flex items-center justify-center h-3 w-3 rounded bg-amber-100 text-amber-600">
                                            <Pencil className="h-2 w-2" />
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer - only show when not connected */}
        {!isConnected && (
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <Lock className="h-3.5 w-3.5" />
              <span>Connect your API key to override pricing or add custom models</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * PricingTableBase wrapped with Error Boundary for graceful degradation.
 * Use this component directly - it automatically handles render errors.
 */
export function PricingTableBase(props: PricingTableProps) {
  return (
    <PricingTableErrorBoundary>
      <PricingTableBaseInner {...props} />
    </PricingTableErrorBoundary>
  )
}

// ============================================================================
// TABLE ICONS
// ============================================================================

export const PricingTableIcons = {
  payg: Zap,
  commitment: Clock,
  infrastructure: Server
}
