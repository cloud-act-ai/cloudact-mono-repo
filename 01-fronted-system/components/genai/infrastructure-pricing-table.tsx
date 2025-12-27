"use client"

import { useState, useMemo } from "react"
import { Server } from "lucide-react"
import { PricingTableBase, PricingColumn, PricingRow } from "./pricing-table-base"
import { GenAIInfrastructurePricing } from "@/lib/data/genai/genai-infrastructure-pricing"
import { AddModelDialog } from "./add-model-dialog"

interface InfrastructurePricingTableProps {
  provider: string
  providerLabel: string
  defaultPricing: GenAIInfrastructurePricing[]
  customPricing?: PricingRow[]
  isConnected: boolean
  onSaveCustom?: (model: Partial<GenAIInfrastructurePricing>) => void
  onUpdatePricing?: (modelId: string, updates: Record<string, any>) => void
  onDeleteCustom?: (modelId: string) => void
  onResetPricing?: (modelId: string) => void
}

const INFRASTRUCTURE_COLUMNS: PricingColumn[] = [
  // Main table columns
  { key: "instance_type", label: "Instance", type: "text", width: "140px", editable: true },
  { key: "gpu_type", label: "GPU/TPU", type: "text", width: "90px", editable: true },
  { key: "gpu_count", label: "GPUs", type: "number", align: "center", width: "50px", editable: true },
  { key: "hourly_rate", label: "$/Hour", type: "currency", align: "right", editable: true },
  { key: "spot_discount_pct", label: "Spot %", type: "percentage", align: "center", editable: true },
  // Expanded row details
  { key: "gpu_memory_gb", label: "VRAM (GB)", type: "number", align: "right", editable: true, format: (v) => v ? `${v}GB` : "—", expandedOnly: true },
  { key: "reserved_1yr_discount_pct", label: "1yr Reserved", type: "percentage", align: "center", editable: true, expandedOnly: true },
  { key: "reserved_3yr_discount_pct", label: "3yr Reserved", type: "percentage", align: "center", editable: true, expandedOnly: true },
  { key: "region", label: "Region", type: "text", width: "90px", editable: true, expandedOnly: true },
  { key: "cloud_provider", label: "Cloud Provider", type: "text", width: "80px", editable: true, expandedOnly: true },
]

export function InfrastructurePricingTable({
  provider,
  providerLabel,
  defaultPricing,
  customPricing = [],
  isConnected,
  onSaveCustom,
  onUpdatePricing,
  onDeleteCustom,
  onResetPricing,
}: InfrastructurePricingTableProps) {
  const [isEditMode, setIsEditMode] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, Record<string, any>>>({})

  // Combine default pricing with custom and apply overrides
  const tableData: PricingRow[] = useMemo(() => {
    const defaultRows: PricingRow[] = defaultPricing.map((p) => {
      const key = `${p.instance_type}-${p.gpu_type}-${p.region}`
      const modelOverrides = overrides[key] || {}
      const hasOverride = Object.keys(modelOverrides).length > 0

      return {
        id: `${p.provider}-${p.instance_type}-${p.region}`,
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
        const key = `${row.instance_type}-${row.gpu_type}-${row.region}`
        setOverrides((prev) => ({
          ...prev,
          [key]: {
            ...(prev[key] || {}),
            ...updates,
          },
        }))
        onUpdatePricing?.(rowId, updates)
      }
    } catch (error) {
      console.error("Error updating Infrastructure pricing row:", error)
    }
  }

  const handleResetRow = (rowId: string) => {
    try {
      const row = tableData.find((r) => r.id === rowId)
      if (!row) return

      const key = `${row.instance_type}-${row.gpu_type}-${row.region}`
      setOverrides((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      onResetPricing?.(rowId)
    } catch (error) {
      console.error("Error resetting Infrastructure pricing row:", error)
    }
  }

  const handleDeleteRow = (rowId: string) => {
    try {
      onDeleteCustom?.(rowId)
    } catch (error) {
      console.error("Error deleting Infrastructure pricing row:", error)
    }
  }

  const handleAddModel = (model: Record<string, any>) => {
    try {
      // Default discount percentages based on common industry standards
      // These can be overridden by form input
      const DEFAULT_SPOT_DISCOUNT = 70;
      const DEFAULT_RESERVED_1YR_DISCOUNT = 30;
      const DEFAULT_RESERVED_3YR_DISCOUNT = 50;

      onSaveCustom?.({
        provider,
        resource_type: model.resource_type || "gpu",
        instance_type: model.instance_type,
        gpu_type: model.gpu_type,
        gpu_count: model.gpu_count || 1,
        gpu_memory_gb: model.gpu_memory_gb || 24,
        hourly_rate: model.hourly_rate || 0,
        spot_discount_pct: model.spot_discount_pct ?? DEFAULT_SPOT_DISCOUNT,
        reserved_1yr_discount_pct: model.reserved_1yr_discount_pct ?? DEFAULT_RESERVED_1YR_DISCOUNT,
        reserved_3yr_discount_pct: model.reserved_3yr_discount_pct ?? DEFAULT_RESERVED_3YR_DISCOUNT,
        region: model.region || "us-central1",
        cloud_provider: provider,
        status: "active",
        last_updated: new Date().toISOString().split("T")[0],
      })
      setShowAddDialog(false)
    } catch (error) {
      console.error("Error adding Infrastructure instance:", error)
    }
  }

  return (
    <>
      <PricingTableBase
        hideHeader
        title="Infrastructure Pricing"
        description={`GPU/TPU instance pricing for ${providerLabel}`}
        icon={<Server />}
        columns={INFRASTRUCTURE_COLUMNS}
        data={tableData}
        isConnected={isConnected}
        isEditMode={isEditMode}
        onToggleEditMode={setIsEditMode}
        onUpdateRow={handleUpdateRow}
        onDeleteRow={handleDeleteRow}
        onResetRow={handleResetRow}
        onAddCustom={() => setShowAddDialog(true)}
        addButtonLabel="Add Custom Instance"
        emptyMessage={`No infrastructure pricing data for ${providerLabel}`}
        accentColor="#FF6C5E"
      />

      <AddModelDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSave={handleAddModel}
        type="infrastructure"
        providerLabel={providerLabel}
      />
    </>
  )
}
