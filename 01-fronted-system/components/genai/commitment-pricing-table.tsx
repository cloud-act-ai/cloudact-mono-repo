"use client"

import { useState, useMemo } from "react"
import { Clock } from "lucide-react"
import { PricingTableBase, PricingColumn, PricingRow } from "./pricing-table-base"
import { GenAICommitmentPricing } from "@/lib/data/genai/genai-commitment-pricing"
import { formatLocalDate } from "@/lib/i18n/formatters"
import { AddModelDialog } from "./add-model-dialog"

interface CommitmentPricingTableProps {
  provider: string
  providerLabel: string
  defaultPricing: GenAICommitmentPricing[]
  customPricing?: PricingRow[]
  isConnected: boolean
  onSaveCustom?: (model: Partial<GenAICommitmentPricing>) => void
  onUpdatePricing?: (modelId: string, updates: Record<string, any>) => void
  onDeleteCustom?: (modelId: string) => void
  onResetPricing?: (modelId: string) => void
}

// Issue #46: Updated column keys to match schema (min_units, max_units, tokens_per_unit_minute)
const COMMITMENT_COLUMNS: PricingColumn[] = [
  // Main table columns
  { key: "model", label: "Model", type: "text", width: "160px", editable: true },
  { key: "commitment_type", label: "Type", type: "text", width: "70px", editable: true },
  { key: "ptu_hourly_rate", label: "$/Hour", type: "currency", align: "right", editable: true },
  { key: "ptu_monthly_rate", label: "$/Month", type: "currency", align: "right", editable: true },
  { key: "commitment_term_months", label: "Term", type: "number", align: "center", editable: true, format: (v) => v ? `${v}mo` : "—" },
  // Expanded row details
  { key: "region", label: "Region", type: "text", width: "90px", editable: true, expandedOnly: true },
  { key: "min_units", label: "Min Units", type: "number", align: "right", editable: true, expandedOnly: true },
  { key: "max_units", label: "Max Units", type: "number", align: "right", editable: true, expandedOnly: true },
  { key: "tokens_per_unit_minute", label: "Tokens/Min/Unit", type: "number", align: "right", editable: true, format: (v) => v ? v.toLocaleString() : "—", expandedOnly: true },
  { key: "term_discount_pct", label: "Term Discount", type: "percentage", align: "center", editable: true, expandedOnly: true },
  { key: "volume_discount_pct", label: "Volume Discount", type: "percentage", align: "center", editable: true, expandedOnly: true },
  { key: "supports_overage", label: "Overage", type: "boolean", align: "center", editable: true, expandedOnly: true },
]

export function CommitmentPricingTable({
  provider,
  providerLabel,
  defaultPricing,
  customPricing = [],
  isConnected,
  onSaveCustom,
  onUpdatePricing,
  onDeleteCustom,
  onResetPricing,
}: CommitmentPricingTableProps) {
  const [isEditMode, setIsEditMode] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, Record<string, any>>>({})

  // Combine default pricing with custom and apply overrides
  const tableData: PricingRow[] = useMemo(() => {
    const defaultRows: PricingRow[] = defaultPricing.map((p) => {
      const modelOverrides = overrides[p.model] || {}
      const hasOverride = Object.keys(modelOverrides).length > 0

      return {
        id: `${p.provider}-${p.model}-${p.region}`,
        ...p,
        ...modelOverrides,
        isCustom: false,
        isOverridden: hasOverride,
        originalValues: hasOverride ? { ...p } : undefined,
      }
    })

    const customRows: PricingRow[] = customPricing.map((c) => ({
      ...c,
      isCustom: true,
    }))

    return [...defaultRows, ...customRows]
  }, [defaultPricing, customPricing, overrides])

  const handleUpdateRow = (rowId: string, updates: Record<string, any>) => {
    try {
      const row = tableData.find((r) => r.id === rowId)
      if (!row) return

      if (row.isCustom) {
        onUpdatePricing?.(rowId, updates)
      } else {
        setOverrides((prev) => ({
          ...prev,
          [row.model]: {
            ...(prev[row.model] || {}),
            ...updates,
          },
        }))
        onUpdatePricing?.(rowId, updates)
      }
    } catch (error) {
      console.error("Error updating Commitment pricing row:", error)
    }
  }

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
      console.error("Error resetting Commitment pricing row:", error)
    }
  }

  const handleDeleteRow = (rowId: string) => {
    try {
      onDeleteCustom?.(rowId)
    } catch (error) {
      console.error("Error deleting Commitment pricing row:", error)
    }
  }

  // Issue #46: Use standardized field names (min_units, max_units, tokens_per_unit_minute)
  const handleAddModel = (model: Record<string, any>) => {
    try {
      onSaveCustom?.({
        provider,
        commitment_type: model.commitment_type || "ptu",
        model: model.model_id,
        model_group: model.model_group || null,
        unit_name: model.unit_name || null,  // Issue #48: PTU type identifier
        region: model.region || "global",
        ptu_hourly_rate: model.ptu_hourly_rate || null,
        ptu_monthly_rate: model.ptu_monthly_rate || null,
        min_units: model.min_units || 1,           // Issue #46: Standardized
        max_units: model.max_units || 100,         // Issue #46: Standardized
        commitment_term_months: model.commitment_term_months || 1,
        tokens_per_unit_minute: model.tokens_per_unit_minute || null,  // Issue #46: Standardized
        term_discount_pct: model.term_discount_pct || 0,
        volume_discount_pct: model.volume_discount_pct || 0,
        min_commitment_months: model.min_commitment_months || 1,
        supports_overage: model.supports_overage || false,
        overage_rate_per_unit: model.overage_rate_per_unit || null,  // Issue #24
        status: "active",
        last_updated: formatLocalDate(new Date()),
      })
      setShowAddDialog(false)
    } catch (error) {
      console.error("Error adding Commitment plan:", error)
    }
  }

  return (
    <>
      <PricingTableBase
        hideHeader
        title="Commitment Pricing"
        description={`PTU / GSU pricing for ${providerLabel} provisioned throughput`}
        icon={<Clock />}
        columns={COMMITMENT_COLUMNS}
        data={tableData}
        isConnected={isConnected}
        isEditMode={isEditMode}
        onToggleEditMode={setIsEditMode}
        onUpdateRow={handleUpdateRow}
        onDeleteRow={handleDeleteRow}
        onResetRow={handleResetRow}
        onAddCustom={() => setShowAddDialog(true)}
        addButtonLabel="Add Custom Plan"
        emptyMessage={`No commitment pricing data for ${providerLabel}`}
        accentColor="#007AFF"
      />

      <AddModelDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSave={handleAddModel}
        type="commitment"
        providerLabel={providerLabel}
      />
    </>
  )
}
