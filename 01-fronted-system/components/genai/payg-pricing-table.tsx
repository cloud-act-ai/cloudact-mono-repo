"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { Zap, AlertCircle, Loader2 } from "lucide-react"
import { PricingTableBase, PricingColumn, PricingRow, VersionConflict, PricingFieldValue } from "./pricing-table-base"
import { GenAIPAYGPricing } from "@/lib/data/genai/genai-payg-pricing"
import { AddModelDialog } from "./add-model-dialog"

// ============================================================================
// CONSTANTS
// ============================================================================

/** Debounce delay in milliseconds for rapid pricing edits */
const DEBOUNCE_DELAY_MS = 300

/** Maximum pending updates before forcing flush */
const MAX_PENDING_UPDATES = 10

/** Extended pricing with version tracking for optimistic locking */
export interface VersionedPricingRow extends PricingRow {
  version?: number
  lastUpdatedAt?: string
  lastUpdatedBy?: string
}

/** Validation error for pricing field updates */
interface PricingFieldValidationError {
  field: string
  message: string
}

/**
 * Validates a pricing field update value.
 * Returns null if valid, or an error object if invalid.
 */
function validatePricingFieldUpdate(
  fieldKey: string,
  value: unknown
): PricingFieldValidationError | null {
  // Currency fields (pricing per 1M tokens)
  const currencyFields = [
    'input_per_1m', 'output_per_1m', 'cached_input_per_1m',
    'cached_write_per_1m', 'batch_input_per_1m', 'batch_output_per_1m'
  ]

  // Percentage fields (0-100)
  const percentageFields = [
    'cached_discount_pct', 'batch_discount_pct', 'volume_discount_pct', 'sla_uptime_pct'
  ]

  // Number fields (non-negative integers)
  const integerFields = [
    'context_window', 'max_output_tokens', 'rate_limit_rpm', 'rate_limit_tpm',
    'free_tier_input_tokens', 'free_tier_output_tokens'
  ]

  // Text fields with validation
  const textFields = ['model', 'model_family', 'region']

  if (currencyFields.includes(fieldKey)) {
    const numValue = typeof value === 'number' ? value : parseFloat(String(value))
    if (isNaN(numValue)) {
      return { field: fieldKey, message: 'Must be a valid number' }
    }
    if (numValue < 0) {
      return { field: fieldKey, message: 'Price cannot be negative' }
    }
    if (numValue > 100000) {
      return { field: fieldKey, message: 'Price cannot exceed $100,000' }
    }
  }

  if (percentageFields.includes(fieldKey)) {
    const numValue = typeof value === 'number' ? value : parseFloat(String(value))
    if (isNaN(numValue)) {
      return { field: fieldKey, message: 'Must be a valid number' }
    }
    if (numValue < 0 || numValue > 100) {
      return { field: fieldKey, message: 'Percentage must be between 0 and 100' }
    }
  }

  if (integerFields.includes(fieldKey)) {
    const numValue = typeof value === 'number' ? value : parseFloat(String(value))
    if (isNaN(numValue)) {
      return { field: fieldKey, message: 'Must be a valid number' }
    }
    if (numValue < 0) {
      return { field: fieldKey, message: 'Value cannot be negative' }
    }
    if (!Number.isInteger(numValue) && numValue !== Math.floor(numValue)) {
      return { field: fieldKey, message: 'Must be a whole number' }
    }
  }

  if (textFields.includes(fieldKey)) {
    const strValue = String(value || '').trim()
    if (fieldKey === 'model' && strValue.length === 0) {
      return { field: fieldKey, message: 'Model name is required' }
    }
    if (strValue.length > 200) {
      return { field: fieldKey, message: 'Value cannot exceed 200 characters' }
    }
    // Validate model ID pattern
    if (fieldKey === 'model' && !/^[a-zA-Z0-9\-_.]*$/.test(strValue)) {
      return { field: fieldKey, message: 'Contains invalid characters' }
    }
  }

  return null
}

interface PAYGPricingTableProps {
  provider: string
  providerLabel: string
  defaultPricing: GenAIPAYGPricing[]
  customPricing?: VersionedPricingRow[]
  isConnected: boolean
  onSaveCustom?: (model: Partial<GenAIPAYGPricing>) => void
  /**
   * Updated to support version-aware updates.
   * Security: Validated at runtime to ensure only safe field values are passed.
   * @param modelId - The row ID
   * @param updates - Field updates
   * @param version - Optional version for optimistic locking validation
   * @returns Promise that may resolve with conflict info or void
   */
  onUpdatePricing?: (
    modelId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updates: Record<string, any>,
    version?: number
  ) => Promise<void | { conflict?: VersionConflict }>
  onDeleteCustom?: (modelId: string) => void
  onResetPricing?: (modelId: string) => void
  /**
   * Optional callback to check current version of a row from the server.
   * Used for pre-save conflict detection.
   */
  onCheckVersion?: (rowId: string) => Promise<{ version: number; updatedBy?: string; updatedAt?: string } | null>
}

const PAYG_COLUMNS: PricingColumn[] = [
  // Main table columns (always visible)
  { key: "model", label: "Model", type: "text", width: "180px", editable: true },
  { key: "model_family", label: "Family", type: "text", width: "90px", editable: true },
  { key: "input_per_1m", label: "Input/1M", type: "currency", align: "right", editable: true },
  { key: "output_per_1m", label: "Output/1M", type: "currency", align: "right", editable: true },
  { key: "context_window", label: "Context", type: "number", align: "right", editable: true, format: (v) => v ? `${(Number(v) / 1000).toFixed(0)}K` : "—" },
  // Expanded row details (shown when row is expanded)
  { key: "region", label: "Region", type: "text", width: "80px", editable: true, expandedOnly: true },
  { key: "cached_input_per_1m", label: "Cached/1M", type: "currency", align: "right", editable: true, expandedOnly: true },
  { key: "cached_discount_pct", label: "Cache Discount", type: "percentage", align: "center", editable: true, expandedOnly: true },
  { key: "batch_discount_pct", label: "Batch Discount", type: "percentage", align: "center", editable: true, expandedOnly: true },
  { key: "rate_limit_rpm", label: "RPM Limit", type: "number", align: "right", editable: true, expandedOnly: true },
  { key: "rate_limit_tpm", label: "TPM Limit", type: "number", align: "right", editable: true, format: (v) => v ? `${(Number(v) / 1000).toFixed(0)}K` : "—", expandedOnly: true },
  { key: "max_output_tokens", label: "Max Output", type: "number", align: "right", editable: true, format: (v) => v ? `${(Number(v) / 1000).toFixed(0)}K` : "—", expandedOnly: true },
]

export function PAYGPricingTable({
  provider,
  providerLabel,
  defaultPricing,
  customPricing = [],
  isConnected,
  onSaveCustom,
  onUpdatePricing,
  onDeleteCustom,
  onResetPricing,
  onCheckVersion,
}: PAYGPricingTableProps) {
  const [isEditMode, setIsEditMode] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  // Track local overrides with version info for optimistic locking
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [overrides, setOverrides] = useState<Record<string, Record<string, any> & { _version?: number; _lastUpdatedAt?: string }>>({})
  // Loading state for async operations
  const [isUpdating, setIsUpdating] = useState(false)
  // Validation error state
  const [validationError, setValidationError] = useState<string | null>(null)

  // Debouncing refs for race condition prevention
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingUpdatesRef = useRef<Map<string, { updates: Record<string, any>; version?: number; timeoutId: ReturnType<typeof setTimeout> }>>(new Map())
  const isMountedRef = useRef(true)

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      // Clear all pending timeouts
      pendingUpdatesRef.current.forEach(({ timeoutId }) => clearTimeout(timeoutId))
      pendingUpdatesRef.current.clear()
    }
  }, [])

  // Combine default pricing with custom and apply overrides, including version tracking
  const tableData: VersionedPricingRow[] = useMemo(() => {
    const defaultRows: VersionedPricingRow[] = defaultPricing.map((p) => {
      const modelOverrides = overrides[p.model] || {}
      const hasOverride = Object.keys(modelOverrides).filter(k => !k.startsWith('_')).length > 0

      return {
        id: `${p.provider}-${p.model}-${p.region}`,
        ...p,
        ...modelOverrides,
        isCustom: false,
        isOverridden: hasOverride,
        originalValues: hasOverride ? { ...p } : undefined,
        // Use the stored version from overrides, or initialize from pricing data
        version: modelOverrides._version ?? (p as any).version ?? 1,
        lastUpdatedAt: modelOverrides._lastUpdatedAt ?? (p as any).lastUpdatedAt,
        lastUpdatedBy: modelOverrides._lastUpdatedBy ?? (p as any).lastUpdatedBy,
      }
    })

    const customRows: VersionedPricingRow[] = customPricing.map((c) => ({
      ...c,
      isCustom: true,
      // Ensure custom rows have version info
      version: c.version ?? 1,
      lastUpdatedAt: c.lastUpdatedAt,
      lastUpdatedBy: c.lastUpdatedBy,
    }))

    return [...defaultRows, ...customRows]
  }, [defaultPricing, customPricing, overrides])

  /**
   * Flush a pending update immediately.
   * Security: Validates updates before sending to prevent invalid data.
   */
  const flushPendingUpdate = useCallback(async (
    rowId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updates: Record<string, any>,
    version?: number,
    forceOverwrite = false
  ): Promise<void | { conflict?: VersionConflict }> => {
    if (!isMountedRef.current) return

    const row = tableData.find((r) => r.id === rowId)
    if (!row) return

    // Validate each field in the update
    for (const [fieldKey, value] of Object.entries(updates)) {
      const validationResult = validatePricingFieldUpdate(fieldKey, value)
      if (validationResult) {
        const errorMessage = `${validationResult.field}: ${validationResult.message}`
        if (isMountedRef.current) setValidationError(errorMessage)
        // Log to structured logger in production
        if (process.env.NODE_ENV !== 'production') {
          console.error("Validation error:", errorMessage)
        }
        return
      }
    }

    if (isMountedRef.current) setIsUpdating(true)

    try {
      if (row.isCustom) {
        const result = await onUpdatePricing?.(rowId, updates, version)
        if (result?.conflict) return result
      } else {
        if (onUpdatePricing) {
          const result = await onUpdatePricing(rowId, updates, version)
          if (result?.conflict && !forceOverwrite) return result
        }

        const newVersion = forceOverwrite
          ? ((version ?? (typeof row.version === 'number' ? row.version : 1)) + 1)
          : ((typeof row.version === 'number' ? row.version : 1) + 1)

        if (isMountedRef.current) {
          const modelKey = typeof row.model === 'string' ? row.model : String(row.model)
          setOverrides((prev) => ({
            ...prev,
            [modelKey]: {
              ...(prev[modelKey] || {}),
              ...updates,
              _version: newVersion,
              _lastUpdatedAt: new Date().toISOString(),
            },
          }))
        }
      }
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'conflict' in error) {
        throw error
      }
      // Log to structured logger in production
      if (process.env.NODE_ENV !== 'production') {
        console.error("Error updating PAYG pricing row:", error)
      }
    } finally {
      if (isMountedRef.current) setIsUpdating(false)
    }
  }, [tableData, onUpdatePricing])

  /**
   * Handle row updates with version tracking and debouncing for optimistic locking.
   * Security: Debouncing prevents race conditions from rapid edits.
   * Returns a promise to support async conflict detection.
   */
  const handleUpdateRow = useCallback(async (
    rowId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updates: Record<string, any>,
    version?: number
  ): Promise<void | { conflict?: VersionConflict }> => {
    // Clear previous validation errors
    setValidationError(null)

    // Extract force overwrite flag if present
    const forceOverwrite = updates._forceOverwrite === true
    const cleanUpdates = { ...updates }
    delete cleanUpdates._forceOverwrite

    // Check if there's already a pending update for this row
    const existing = pendingUpdatesRef.current.get(rowId)
    if (existing) {
      // Clear the existing timeout
      clearTimeout(existing.timeoutId)
      // Merge updates
      Object.assign(existing.updates, cleanUpdates)
    }

    // Check if we have too many pending updates (force flush)
    if (pendingUpdatesRef.current.size >= MAX_PENDING_UPDATES) {
      // Flush all pending updates
      const entries = Array.from(pendingUpdatesRef.current.entries())
      pendingUpdatesRef.current.clear()
      for (const [id, { updates: pendingUpdates, version: pendingVersion }] of entries) {
        await flushPendingUpdate(id, pendingUpdates, pendingVersion, forceOverwrite)
      }
    }

    // Create new debounced update
    return new Promise((resolve) => {
      const timeoutId = setTimeout(async () => {
        pendingUpdatesRef.current.delete(rowId)
        const result = await flushPendingUpdate(rowId, cleanUpdates, version, forceOverwrite)
        resolve(result)
      }, DEBOUNCE_DELAY_MS)

      pendingUpdatesRef.current.set(rowId, {
        updates: existing ? existing.updates : cleanUpdates,
        version,
        timeoutId,
      })
    })
  }, [flushPendingUpdate])

  const handleResetRow = (rowId: string) => {
    try {
      const row = tableData.find((r) => r.id === rowId)
      if (!row) return

      setOverrides((prev) => {
        const next = { ...prev }
        delete next[row.model]
        return next
      })
      onResetPricing?.(rowId)
    } catch (error) {
      console.error("Error resetting PAYG pricing row:", error)
    }
  }

  const handleDeleteRow = (rowId: string) => {
    try {
      onDeleteCustom?.(rowId)
    } catch (error) {
      console.error("Error deleting PAYG pricing row:", error)
    }
  }

  // State for tracking add model operation
  const [isAddingModel, setIsAddingModel] = useState(false)

  const handleAddModel = async (model: Record<string, any>) => {
    // Validate model data before submission
    const modelId = model.model_id?.trim()
    if (!modelId) {
      setValidationError("Model ID is required")
      return
    }

    // Validate pricing values
    if (model.input_per_1m !== undefined && model.input_per_1m !== null) {
      if (typeof model.input_per_1m !== 'number' || model.input_per_1m < 0) {
        setValidationError("Input price must be a non-negative number")
        return
      }
    }

    if (model.output_per_1m !== undefined && model.output_per_1m !== null) {
      if (typeof model.output_per_1m !== 'number' || model.output_per_1m < 0) {
        setValidationError("Output price must be a non-negative number")
        return
      }
    }

    setIsAddingModel(true)
    setValidationError(null)

    try {
      await onSaveCustom?.({
        provider,
        model: modelId,
        model_family: model.model_family || "custom",
        model_version: model.model_version || "custom",
        region: model.region || "global",
        input_per_1m: model.input_per_1m || 0,
        output_per_1m: model.output_per_1m || 0,
        cached_input_per_1m: model.cached_input_per_1m || null,
        cached_write_per_1m: null,
        batch_input_per_1m: null,
        batch_output_per_1m: null,
        cached_discount_pct: model.cached_discount_pct || 0,
        batch_discount_pct: model.batch_discount_pct || 0,
        volume_tier: model.volume_tier || "standard",
        volume_discount_pct: model.volume_discount_pct || 0,
        free_tier_input_tokens: model.free_tier_input_tokens || 0,
        free_tier_output_tokens: model.free_tier_output_tokens || 0,
        rate_limit_rpm: model.rate_limit_rpm || 100,
        rate_limit_tpm: model.rate_limit_tpm || 10000,
        context_window: model.context_window || 4096,
        max_output_tokens: model.max_output_tokens || 4096,
        supports_vision: model.supports_vision || false,
        supports_streaming: true,
        supports_tools: model.supports_tools || false,
        sla_uptime_pct: 99.9,
        effective_from: new Date().toISOString().split("T")[0],
        effective_to: null,
        status: "active",
        last_updated: new Date().toISOString().split("T")[0],
        notes: "Custom model",
      })
      setShowAddDialog(false)
    } catch (error) {
      console.error("Error adding PAYG model:", error)
      setValidationError("Failed to add model. Please try again.")
    } finally {
      setIsAddingModel(false)
    }
  }

  // Compute loading state for UI feedback
  const isLoading = isUpdating || isAddingModel

  return (
    <div className="relative">
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center rounded-xl">
          <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-md border border-[var(--border-subtle)]">
            <Loader2 className="h-4 w-4 animate-spin text-[#90FCA6]" />
            <span className="text-sm text-[var(--text-secondary)]">
              {isAddingModel ? "Adding model..." : "Updating..."}
            </span>
          </div>
        </div>
      )}

      {/* Validation error banner */}
      {validationError && (
        <div className="mb-3 px-4 py-3 bg-[#FF6C5E]/10 border border-[#FF6C5E]/30 rounded-xl flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-[#FF6C5E] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-[#FF6C5E]">Validation Error</p>
            <p className="text-sm text-[var(--text-secondary)]">{validationError}</p>
          </div>
          <button
            onClick={() => setValidationError(null)}
            className="text-[#FF6C5E] hover:text-[#FF6C5E]/80 p-1"
            aria-label="Dismiss error"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      )}

      <PricingTableBase
        hideHeader
        title="Pay-As-You-Go Pricing"
        description={`Token-based pricing for ${providerLabel} models`}
        icon={<Zap />}
        columns={PAYG_COLUMNS}
        data={tableData}
        isConnected={isConnected}
        isEditMode={isEditMode}
        onToggleEditMode={setIsEditMode}
        onUpdateRow={handleUpdateRow}
        onDeleteRow={handleDeleteRow}
        onResetRow={handleResetRow}
        onAddCustom={() => setShowAddDialog(true)}
        onCheckVersion={onCheckVersion}
        addButtonLabel="Add Custom Model"
        emptyMessage={`No PAYG pricing data for ${providerLabel}`}
        accentColor="#90FCA6"
      />

      <AddModelDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSave={handleAddModel}
        type="payg"
        providerLabel={providerLabel}
      />
    </div>
  )
}
