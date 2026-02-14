"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { useParams } from "next/navigation"
import {
  DollarSign,
  Plus,
  Trash2,
  Edit3,
  Loader2,
  Target,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Network,
  BarChart3,
  Server,
  Cloud,
  Brain,
  Receipt,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  ArrowRight,
  ArrowLeft,
  Check,
  Equal,
} from "lucide-react"

import { StatRow } from "@/components/ui/stat-row"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PremiumCard, SectionHeader } from "@/components/ui/premium-card"
import { PageActionsMenu } from "@/components/ui/page-actions-menu"
import { AdvancedFilterBar, FilteredEmptyState } from "@/components/filters/advanced-filter-bar"
import { useAdvancedFilters, matchesSearch, matchesBudgetStatus, type AdvancedFilterState } from "@/lib/hooks/use-advanced-filters"

import {
  createBudget,
  createTopDownAllocation,
  updateBudget,
  deleteBudget,
  loadBudgetPageData,
  type Budget,
  type BudgetCreateRequest,
  type BudgetUpdateRequest,
  type BudgetSummaryResponse,
  type BudgetVarianceItem,
  type AllocationTreeResponse,
  type AllocationNode,
  type CategoryBreakdownResponse,
  type CategoryBreakdownItem,
  type ProviderBreakdownResponse,
  type ProviderBreakdownItem,
  type BudgetCategory,
  type BudgetType,
  type PeriodType,
  type BudgetListResponse,
  type TopDownAllocationRequest,
  type ChildAllocationItem,
} from "@/actions/budgets"

import { type HierarchyTreeNode } from "@/actions/hierarchy"

// ============================================
// Helpers
// ============================================

function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function getCategoryIcon(category: string) {
  switch (category) {
    case "cloud": return <Cloud className="h-4 w-4" />
    case "genai": return <Brain className="h-4 w-4" />
    case "subscription": return <Receipt className="h-4 w-4" />
    default: return <DollarSign className="h-4 w-4" />
  }
}

function getCategoryLabel(category: string) {
  switch (category) {
    case "cloud": return "Cloud"
    case "genai": return "GenAI"
    case "subscription": return "Subscription"
    case "total": return "Total"
    default: return category
  }
}

function getVarianceColor(isOver: boolean) {
  return isOver
    ? "text-rose-600 bg-rose-50"
    : "text-emerald-700 bg-emerald-50"
}

function getPeriodLabel(periodType: string) {
  switch (periodType) {
    case "monthly": return "Monthly"
    case "quarterly": return "Quarterly"
    case "yearly": return "Yearly"
    case "custom": return "Custom"
    default: return periodType
  }
}

// ============================================
// Create / Edit Budget Dialog (with Top-Down Allocation)
// ============================================

type DialogMode = "single" | "allocation"

interface AllocationRow {
  hierarchy_entity_id: string
  hierarchy_entity_name: string
  hierarchy_path: string
  hierarchy_level_code: string
  percentage: string
}

function BudgetFormDialog({
  open,
  onOpenChange,
  onSaved,
  orgSlug,
  hierarchyNodes,
  hierarchyTreeRoots,
  editBudget,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  orgSlug: string
  hierarchyNodes: { id: string; name: string; level_code: string; path: string }[]
  hierarchyTreeRoots: HierarchyTreeNode[]
  editBudget?: Budget | null
}) {
  const isEdit = !!editBudget
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Mode & step
  const [mode, setMode] = useState<DialogMode>("single")
  const [step, setStep] = useState(1)

  // Shared budget fields (Step 1)
  const [entityId, setEntityId] = useState("")
  const [category, setCategory] = useState<BudgetCategory>("total")
  const [budgetType, setBudgetType] = useState<BudgetType>("monetary")
  const [amount, setAmount] = useState("")
  const [periodType, setPeriodType] = useState<PeriodType>("monthly")
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [provider, setProvider] = useState("")
  const [notes, setNotes] = useState("")

  // Allocation rows (Step 2)
  const [allocRows, setAllocRows] = useState<AllocationRow[]>([])

  // Reset state when dialog opens/closes or edit budget changes
  useEffect(() => {
    if (editBudget) {
      setMode("single")
      setStep(1)
      setEntityId(editBudget.hierarchy_entity_id)
      setCategory(editBudget.category)
      setBudgetType(editBudget.budget_type)
      setAmount(String(editBudget.budget_amount))
      setPeriodType(editBudget.period_type)
      setPeriodStart(editBudget.period_start)
      setPeriodEnd(editBudget.period_end)
      setProvider(editBudget.provider || "")
      setNotes(editBudget.notes || "")
      setAllocRows([])
    } else {
      setMode("single")
      setStep(1)
      setEntityId("")
      setCategory("total")
      setBudgetType("monetary")
      setAmount("")
      setPeriodType("monthly")
      setPeriodStart("")
      setPeriodEnd("")
      setProvider("")
      setNotes("")
      setAllocRows([])
    }
    setError(null)
  }, [editBudget, open])

  const selectedNode = hierarchyNodes.find((n) => n.id === entityId)

  // Find children of the selected entity from the tree
  const childrenOfSelected = useMemo(() => {
    if (!entityId) return []
    function findNode(nodes: HierarchyTreeNode[]): HierarchyTreeNode | null {
      for (const n of nodes) {
        if (n.entity_id === entityId) return n
        if (n.children?.length) {
          const found = findNode(n.children)
          if (found) return found
        }
      }
      return null
    }
    const parent = findNode(hierarchyTreeRoots)
    return parent?.children || []
  }, [entityId, hierarchyTreeRoots])

  // Populate allocation rows when moving to step 2
  function initAllocRows() {
    if (childrenOfSelected.length === 0) return
    setAllocRows(
      childrenOfSelected.map((c) => ({
        hierarchy_entity_id: c.entity_id,
        hierarchy_entity_name: c.entity_name,
        hierarchy_path: c.path,
        hierarchy_level_code: c.level_code,
        percentage: "",
      }))
    )
  }

  function handleEqualSplit() {
    if (allocRows.length === 0) return
    const equalPct = Math.floor((100 / allocRows.length) * 100) / 100
    setAllocRows((rows) => rows.map((r) => ({ ...r, percentage: String(equalPct) })))
  }

  function updateAllocPercentage(idx: number, value: string) {
    setAllocRows((rows) => rows.map((r, i) => (i === idx ? { ...r, percentage: value } : r)))
  }

  const totalAllocPct = allocRows.reduce((sum, r) => sum + (parseFloat(r.percentage) || 0), 0)
  const totalAllocAmount = parseFloat(amount) ? Math.round(parseFloat(amount) * totalAllocPct) / 100 : 0
  const unallocPct = Math.round((100 - totalAllocPct) * 100) / 100
  const unallocAmount = parseFloat(amount) ? Math.round(parseFloat(amount) * unallocPct) / 100 : 0
  const parsedAmount = parseFloat(amount) || 0

  // Validate step 1 fields
  function validateStep1(): boolean {
    if (!entityId || !amount || !periodStart || !periodEnd) {
      setError("Please fill in all required fields")
      return false
    }
    if (parseFloat(amount) <= 0) {
      setError("Amount must be greater than 0")
      return false
    }
    if (new Date(periodEnd) <= new Date(periodStart)) {
      setError("End date must be after start date")
      return false
    }
    return true
  }

  // Handle single-budget submit (existing flow)
  async function handleSingleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!validateStep1()) return

    setLoading(true)

    if (isEdit && editBudget) {
      const request: BudgetUpdateRequest = {
        budget_amount: parseFloat(amount),
        period_type: periodType,
        period_start: periodStart,
        period_end: periodEnd,
        provider: provider || undefined,
        notes: notes || undefined,
      }
      const result = await updateBudget(orgSlug, editBudget.budget_id, request)
      setLoading(false)
      if (result.error) { setError(result.error); return }
    } else {
      const request: BudgetCreateRequest = {
        hierarchy_entity_id: entityId,
        hierarchy_entity_name: selectedNode?.name || entityId,
        hierarchy_path: selectedNode?.path,
        hierarchy_level_code: selectedNode?.level_code || "department",
        category,
        budget_type: budgetType,
        budget_amount: parseFloat(amount),
        period_type: periodType,
        period_start: periodStart,
        period_end: periodEnd,
        provider: provider || undefined,
        notes: notes || undefined,
      }
      const result = await createBudget(orgSlug, request)
      setLoading(false)
      if (result.error) { setError(result.error); return }
    }

    onOpenChange(false)
    onSaved()
  }

  // Handle allocation submit (step 3 → submit)
  async function handleAllocationSubmit() {
    setError(null)

    const validRows = allocRows.filter((r) => parseFloat(r.percentage) > 0)
    if (validRows.length === 0) {
      setError("At least one child must have a percentage > 0")
      return
    }
    if (totalAllocPct > 100) {
      setError("Total allocation exceeds 100%")
      return
    }

    setLoading(true)

    const request: TopDownAllocationRequest = {
      hierarchy_entity_id: entityId,
      hierarchy_entity_name: selectedNode?.name || entityId,
      hierarchy_path: selectedNode?.path,
      hierarchy_level_code: selectedNode?.level_code || "department",
      category,
      budget_type: budgetType,
      budget_amount: parsedAmount,
      period_type: periodType,
      period_start: periodStart,
      period_end: periodEnd,
      provider: provider || undefined,
      notes: notes || undefined,
      allocations: validRows.map((r) => ({
        hierarchy_entity_id: r.hierarchy_entity_id,
        hierarchy_entity_name: r.hierarchy_entity_name,
        hierarchy_path: r.hierarchy_path,
        hierarchy_level_code: r.hierarchy_level_code,
        percentage: parseFloat(r.percentage),
      })),
    }

    const result = await createTopDownAllocation(orgSlug, request)
    setLoading(false)
    if (result.error) { setError(result.error); return }

    onOpenChange(false)
    onSaved()
  }

  // Step navigation
  function goToStep2() {
    if (!validateStep1()) return
    if (childrenOfSelected.length === 0) {
      setError("Selected entity has no children to allocate to")
      return
    }
    setError(null)
    initAllocRows()
    setStep(2)
  }

  // ── Render ──

  const isSingleMode = mode === "single" || isEdit
  const dialogWidth = isSingleMode ? "sm:max-w-[500px]" : "sm:max-w-[640px]"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogWidth}>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Budget" : step === 1 ? "Create Budget" : step === 2 ? "Allocate to Children" : "Review Allocation"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update spending target details."
              : step === 1
                ? "Set a spending target for a hierarchy entity."
                : step === 2
                  ? "Distribute the budget across child entities."
                  : "Review and confirm the allocation."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            {error}
          </div>
        )}

        {/* Mode selector — only on step 1 in create mode */}
        {!isEdit && step === 1 && (
          <div className="flex gap-2 p-1 bg-[var(--surface-secondary)] rounded-lg">
            <button
              type="button"
              onClick={() => setMode("single")}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === "single"
                  ? "bg-white text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              }`}
            >
              Single Budget
            </button>
            <button
              type="button"
              onClick={() => setMode("allocation")}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === "allocation"
                  ? "bg-white text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              }`}
            >
              Top-Down Allocation
            </button>
          </div>
        )}

        {/* ─── STEP 1: Budget fields ─── */}
        {step === 1 && (
          <form onSubmit={isSingleMode ? handleSingleSubmit : (e) => { e.preventDefault(); goToStep2() }} className="space-y-4">
            <div className="space-y-2">
              <Label>Hierarchy Entity</Label>
              <Select value={entityId} onValueChange={setEntityId} disabled={isEdit}>
                <SelectTrigger><SelectValue placeholder="Select entity" /></SelectTrigger>
                <SelectContent>
                  {hierarchyNodes.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.name} ({node.level_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as BudgetCategory)} disabled={isEdit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="total">Total</SelectItem>
                    <SelectItem value="cloud">Cloud</SelectItem>
                    <SelectItem value="genai">GenAI</SelectItem>
                    <SelectItem value="subscription">Subscription</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Budget Type</Label>
                <Select value={budgetType} onValueChange={(v) => setBudgetType(v as BudgetType)} disabled={isEdit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monetary">Monetary ($)</SelectItem>
                    <SelectItem value="token">Tokens</SelectItem>
                    <SelectItem value="seat">Seats</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Amount{budgetType === "monetary" ? " ($)" : budgetType === "token" ? " (tokens)" : " (seats)"}</Label>
                <Input
                  type="number"
                  min="1"
                  step={budgetType === "monetary" ? "0.01" : "1"}
                  placeholder={budgetType === "monetary" ? "10000" : budgetType === "token" ? "1000000" : "10"}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Period</Label>
                <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Start</Label>
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>End</Label>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Provider (optional)</Label>
                <Input placeholder="e.g., gcp, openai" value={provider} onChange={(e) => setProvider(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Input placeholder="Budget notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              {isSingleMode ? (
                <Button type="submit" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {isEdit ? "Save Changes" : "Create Budget"}
                </Button>
              ) : (
                <Button type="submit">
                  Next: Allocate
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              )}
            </DialogFooter>
          </form>
        )}

        {/* ─── STEP 2: Allocate to Children ─── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--text-secondary)]">
                Total: <span className="font-semibold text-[var(--text-primary)]">{formatCurrency(parsedAmount)}</span>
              </p>
              <Button type="button" variant="outline" size="sm" onClick={handleEqualSplit}>
                <Equal className="h-3.5 w-3.5 mr-1.5" />
                Equal Split
              </Button>
            </div>

            <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_100px] gap-2 px-3 py-2 bg-[var(--surface-secondary)] text-xs font-medium text-[var(--text-tertiary)]">
                <span>Child</span>
                <span className="text-right">%</span>
                <span className="text-right">Amount</span>
              </div>
              {allocRows.map((row, idx) => {
                const pct = parseFloat(row.percentage) || 0
                const childAmount = Math.round(parsedAmount * pct) / 100
                return (
                  <div key={row.hierarchy_entity_id} className="grid grid-cols-[1fr_80px_100px] gap-2 items-center px-3 py-2 border-t border-[var(--border-subtle)]">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{row.hierarchy_entity_name}</p>
                      <p className="text-[10px] text-[var(--text-tertiary)]">{row.hierarchy_level_code}</p>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={row.percentage}
                      onChange={(e) => updateAllocPercentage(idx, e.target.value)}
                      className="h-8 text-right text-sm"
                    />
                    <p className="text-sm font-medium text-[var(--text-primary)] text-right">
                      {formatCurrency(childAmount)}
                    </p>
                  </div>
                )
              })}
              {/* Margin / Unallocated row */}
              <div className="grid grid-cols-[1fr_80px_100px] gap-2 items-center px-3 py-2 border-t border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50">
                <p className="text-sm text-[var(--text-tertiary)] italic">Unallocated (margin)</p>
                <p className={`text-sm text-right font-medium ${unallocPct < 0 ? "text-rose-600" : "text-[var(--text-tertiary)]"}`}>
                  {unallocPct.toFixed(1)}%
                </p>
                <p className={`text-sm text-right font-medium ${unallocAmount < 0 ? "text-rose-600" : "text-[var(--text-tertiary)]"}`}>
                  {formatCurrency(unallocAmount)}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs text-[var(--text-tertiary)] mb-1">
                <span>{totalAllocPct.toFixed(1)}% allocated</span>
                <span>{formatCurrency(totalAllocAmount)} of {formatCurrency(parsedAmount)}</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--surface-secondary)] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${totalAllocPct > 100 ? "bg-rose-500" : "bg-[var(--cloudact-mint)]"}`}
                  style={{ width: `${Math.min(totalAllocPct, 100)}%` }}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (totalAllocPct > 100) { setError("Total allocation exceeds 100%"); return }
                  if (allocRows.every((r) => !parseFloat(r.percentage))) { setError("At least one child must have a percentage > 0"); return }
                  setError(null)
                  setStep(3)
                }}
              >
                Next: Review
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ─── STEP 3: Review & Confirm ─── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-[var(--surface-secondary)] space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {selectedNode?.name || entityId}
                </p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {formatCurrency(parsedAmount)}
                </p>
              </div>
              <p className="text-xs text-[var(--text-tertiary)]">
                {getCategoryLabel(category)} &middot; {budgetType} &middot; {getPeriodLabel(periodType)} &middot; {periodStart} to {periodEnd}
              </p>

              <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
                {allocRows.filter((r) => parseFloat(r.percentage) > 0).map((row) => {
                  const pct = parseFloat(row.percentage) || 0
                  const childAmt = Math.round(parsedAmount * pct) / 100
                  return (
                    <div key={row.hierarchy_entity_id} className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">{row.hierarchy_entity_name}</span>
                      <span className="text-[var(--text-primary)] font-medium">
                        {pct.toFixed(1)}% &rarr; {formatCurrency(childAmt)}
                      </span>
                    </div>
                  )
                })}
                {unallocPct > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-tertiary)] italic">Unallocated (margin)</span>
                    <span className="text-[var(--text-tertiary)] font-medium">
                      {unallocPct.toFixed(1)}% &rarr; {formatCurrency(unallocAmount)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back
              </Button>
              <Button type="button" onClick={handleAllocationSubmit} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-1.5" />}
                Create Allocation
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ============================================
// Delete Confirmation Dialog
// ============================================

function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  budgetName,
  loading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  budgetName: string
  loading: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Delete Budget</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the budget for <strong>{budgetName}</strong>? This action can be undone by an admin.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================
// Variance Item Row (with actions)
// ============================================

function VarianceRow({
  item,
  onEdit,
  onDelete,
}: {
  item: BudgetVarianceItem
  onEdit: (budgetId: string) => void
  onDelete: (budgetId: string, name: string) => void
}) {
  const pct = item.variance_percent
  return (
    <div className="p-4 border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--surface-hover)]/50 transition-colors">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="h-9 w-9 rounded-lg bg-[var(--surface-secondary)] flex items-center justify-center flex-shrink-0">
            {getCategoryIcon(item.category)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">{item.hierarchy_entity_name}</p>
            <p className="text-xs text-[var(--text-tertiary)]">
              {getCategoryLabel(item.category)} &middot; {getPeriodLabel(item.period_type)} &middot; {item.period_start} - {item.period_end}
              {item.provider && <> &middot; {item.provider}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{formatCurrency(item.budget_amount)}</p>
            <p className="text-xs text-[var(--text-tertiary)]">Budget</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{formatCurrency(item.actual_amount)}</p>
            <p className="text-xs text-[var(--text-tertiary)]">Actual</p>
          </div>
          <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getVarianceColor(item.is_over_budget)}`}>
            {item.is_over_budget ? "+" : ""}{Math.abs(pct).toFixed(1)}%
            {item.is_over_budget ? " over" : " under"}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(item.budget_id)}>
                <Edit3 className="h-3.5 w-3.5 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(item.budget_id, item.hierarchy_entity_name)}
                className="text-rose-600 focus:text-rose-600"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* Progress bar */}
      <div className="mt-3 h-2 rounded-full bg-[var(--surface-secondary)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${item.is_over_budget ? "bg-rose-500" : "bg-[var(--cloudact-mint)]"}`}
          style={{ width: `${Math.min((item.actual_amount / Math.max(item.budget_amount, 1)) * 100, 100)}%` }}
        />
      </div>
    </div>
  )
}

// ============================================
// Allocation Tree Node
// ============================================

function AllocationTreeNode({ node, depth = 0 }: { node: AllocationNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1)
  const utilizationPct = node.budget_amount > 0 ? (node.actual_amount / node.budget_amount) * 100 : 0
  const isOver = node.actual_amount > node.budget_amount

  return (
    <div style={{ marginLeft: depth * 24 }}>
      <div
        className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--surface-hover)]/50 transition-colors cursor-pointer"
        onClick={() => node.children.length > 0 && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {node.children.length > 0 ? (
            expanded ? <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)] flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)] flex-shrink-0" />
          ) : (
            <span className="w-3.5" />
          )}
          <div className="h-7 w-7 rounded-md bg-[var(--surface-secondary)] flex items-center justify-center flex-shrink-0">
            <Network className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">{node.hierarchy_entity_name}</p>
            <p className="text-xs text-[var(--text-tertiary)]">{node.hierarchy_level_code} &middot; {getCategoryLabel(node.category)}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-[var(--text-primary)]">{formatCurrency(node.budget_amount)}</p>
            <p className="text-[10px] text-[var(--text-tertiary)]">Budget</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-[var(--text-primary)]">{formatCurrency(node.actual_amount)}</p>
            <p className="text-[10px] text-[var(--text-tertiary)]">Actual</p>
          </div>
          {node.unallocated !== 0 && (
            <div className="text-right hidden md:block">
              <p className={`text-xs font-semibold ${node.unallocated < 0 ? "text-rose-600" : "text-[var(--text-secondary)]"}`}>
                {formatCurrency(node.unallocated)}
              </p>
              <p className="text-[10px] text-[var(--text-tertiary)]">Unallocated</p>
            </div>
          )}
          <div className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${getVarianceColor(isOver)}`}>
            {utilizationPct.toFixed(0)}%
          </div>
        </div>
      </div>
      {expanded && node.children.map((child) => (
        <AllocationTreeNode key={child.budget_id} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

// ============================================
// Category Breakdown Row
// ============================================

function CategoryRow({ item }: { item: CategoryBreakdownItem }) {
  const pctUsed = item.budget_amount > 0 ? (item.actual_amount / item.budget_amount) * 100 : 0
  return (
    <div className="p-4 border-b border-[var(--border-subtle)] last:border-b-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-[var(--surface-secondary)] flex items-center justify-center">
            {getCategoryIcon(item.category)}
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">{getCategoryLabel(item.category)}</p>
            <p className="text-xs text-[var(--text-tertiary)]">{item.budget_count} budget{item.budget_count !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold">{formatCurrency(item.budget_amount)}</p>
            <p className="text-xs text-[var(--text-tertiary)]">Budget</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold">{formatCurrency(item.actual_amount)}</p>
            <p className="text-xs text-[var(--text-tertiary)]">Actual</p>
          </div>
          <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getVarianceColor(item.is_over_budget)}`}>
            {item.is_over_budget ? "+" : ""}{Math.abs(item.variance_percent).toFixed(1)}%
          </div>
        </div>
      </div>
      {/* Progress bar */}
      <div className="mt-3 h-1.5 rounded-full bg-[var(--surface-secondary)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${item.is_over_budget ? "bg-rose-500" : "bg-[var(--cloudact-mint)]"}`}
          style={{ width: `${Math.min(pctUsed, 100)}%` }}
        />
      </div>
    </div>
  )
}

// ============================================
// Provider Breakdown Row
// ============================================

function ProviderRow({ item }: { item: ProviderBreakdownItem }) {
  const pctUsed = item.budget_amount > 0 ? (item.actual_amount / item.budget_amount) * 100 : 0
  return (
    <div className="p-4 border-b border-[var(--border-subtle)] last:border-b-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-[var(--surface-secondary)] flex items-center justify-center">
            <Server className="h-4 w-4 text-[var(--text-secondary)]" />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)] capitalize">{item.provider}</p>
            <p className="text-xs text-[var(--text-tertiary)]">{getCategoryLabel(item.category)}</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold">{formatCurrency(item.budget_amount)}</p>
            <p className="text-xs text-[var(--text-tertiary)]">Budget</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold">{formatCurrency(item.actual_amount)}</p>
            <p className="text-xs text-[var(--text-tertiary)]">Actual</p>
          </div>
          <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getVarianceColor(item.is_over_budget)}`}>
            {item.is_over_budget ? "+" : ""}{Math.abs(item.variance_percent).toFixed(1)}%
          </div>
        </div>
      </div>
      {/* Progress bar */}
      <div className="mt-3 h-1.5 rounded-full bg-[var(--surface-secondary)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${item.is_over_budget ? "bg-rose-500" : "bg-[var(--cloudact-mint)]"}`}
          style={{ width: `${Math.min(pctUsed, 100)}%` }}
        />
      </div>
    </div>
  )
}

// ============================================
// Budget List Row (for raw budget list in Overview)
// ============================================

function BudgetListRow({
  budget,
  onEdit,
  onDelete,
}: {
  budget: Budget
  onEdit: (budget: Budget) => void
  onDelete: (budgetId: string, name: string) => void
}) {
  return (
    <div className="flex items-center justify-between p-3 border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--surface-hover)]/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="h-8 w-8 rounded-lg bg-[var(--surface-secondary)] flex items-center justify-center flex-shrink-0">
          {getCategoryIcon(budget.category)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{budget.hierarchy_entity_name}</p>
          <p className="text-xs text-[var(--text-tertiary)]">
            {getCategoryLabel(budget.category)} &middot; {getPeriodLabel(budget.period_type)} &middot; {formatCurrency(budget.budget_amount)}
            {budget.provider && <> &middot; {budget.provider}</>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--text-primary)] hidden sm:inline">
          {formatCurrency(budget.budget_amount)}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(budget)}>
              <Edit3 className="h-3.5 w-3.5 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(budget.budget_id, budget.hierarchy_entity_name)}
              className="text-rose-600 focus:text-rose-600"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

// ============================================
// Main Page
// ============================================

export default function BudgetsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  // Shared advanced filters (search, category, period, status, hierarchy)
  const {
    filters,
    updateFilters,
    clearFilters,
    activeCount: activeFiltersCount,
    serverParams,
    clientParams,
    serverFilterKey,
  } = useAdvancedFilters({
    search: true,
    category: true,
    periodType: true,
    status: true,
    hierarchyEntity: true,
  })

  // Data state
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<BudgetSummaryResponse | null>(null)
  const [budgetList, setBudgetList] = useState<BudgetListResponse | null>(null)
  const [allocationTree, setAllocationTree] = useState<AllocationTreeResponse | null>(null)
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryBreakdownResponse | null>(null)
  const [providerBreakdown, setProviderBreakdown] = useState<ProviderBreakdownResponse | null>(null)
  const [hierarchyNodes, setHierarchyNodes] = useState<{ id: string; name: string; level_code: string; path: string }[]>([])
  const [hierarchyTreeRoots, setHierarchyTreeRoots] = useState<HierarchyTreeNode[]>([])

  // UI state
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [editBudget, setEditBudget] = useState<Budget | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingBudget, setDeletingBudget] = useState<{ id: string; name: string } | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Flatten hierarchy tree into a list for dialogs and filters
  function flattenTree(nodes: HierarchyTreeNode[], acc: { id: string; name: string; level_code: string; path: string }[] = []) {
    for (const node of nodes) {
      acc.push({
        id: node.entity_id,
        name: node.entity_name,
        level_code: node.level_code,
        path: node.path,
      })
      if (node.children?.length) flattenTree(node.children, acc)
    }
    return acc
  }

  // Load data — single server action for parallel fetching (~6s vs ~30s)
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await loadBudgetPageData(orgSlug, {
        category: serverParams.category,
        hierarchyEntityId: serverParams.hierarchyEntityId,
        periodType: serverParams.periodType,
      })

      setSummary(result.summary)
      setBudgetList(result.budgetList)
      setAllocationTree(result.allocationTree)
      setCategoryBreakdown(result.categoryBreakdown)
      setProviderBreakdown(result.providerBreakdown)

      if (result.hierarchyTree?.roots) {
        setHierarchyNodes(flattenTree(result.hierarchyTree.roots))
        setHierarchyTreeRoots(result.hierarchyTree.roots)
      }

      if (result.error) {
        setMessage({ type: "error", text: result.error })
      }
    } catch {
      setMessage({ type: "error", text: "Failed to load budget data. Please refresh." })
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, serverFilterKey])

  useEffect(() => { loadData() }, [loadData])

  // Clear message after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [message])

  // Client-side filtering using shared helpers
  const filteredVarianceItems = useMemo(() => {
    if (!summary?.items) return []
    return summary.items.filter((i) => {
      if (!matchesSearch(i, ["hierarchy_entity_name", "category"], clientParams.search)) return false
      if (!matchesBudgetStatus(i.is_over_budget, clientParams.status)) return false
      return true
    })
  }, [summary, clientParams.search, clientParams.status])

  const filteredBudgets = useMemo(() => {
    if (!budgetList?.budgets) return []
    let budgets = budgetList.budgets

    // Search (client-side)
    if (clientParams.search) {
      budgets = budgets.filter((b) =>
        matchesSearch(b, ["hierarchy_entity_name", "category"], clientParams.search) ||
        (b.provider || "").toLowerCase().includes(clientParams.search)
      )
    }

    // Status (client-side — cross-reference with variance items)
    if (clientParams.status === "over" || clientParams.status === "under") {
      const overBudgetIds = new Set(
        (summary?.items || []).filter((i) => i.is_over_budget).map((i) => i.budget_id)
      )
      budgets = budgets.filter((b) =>
        matchesBudgetStatus(overBudgetIds.has(b.budget_id), clientParams.status)
      )
    }

    return budgets
  }, [budgetList, clientParams.search, clientParams.status, summary])

  // Actions
  function handleEditFromVariance(budgetId: string) {
    const budget = budgetList?.budgets.find((b) => b.budget_id === budgetId)
    if (budget) {
      setEditBudget(budget)
      setFormDialogOpen(true)
    }
  }

  function handleEditBudget(budget: Budget) {
    setEditBudget(budget)
    setFormDialogOpen(true)
  }

  function handleDeletePrompt(budgetId: string, name: string) {
    setDeletingBudget({ id: budgetId, name })
    setDeleteDialogOpen(true)
  }

  async function handleConfirmDelete() {
    if (!deletingBudget) return
    setDeleteLoading(true)
    const result = await deleteBudget(orgSlug, deletingBudget.id)
    setDeleteLoading(false)
    setDeleteDialogOpen(false)

    if (result.error) {
      setMessage({ type: "error", text: result.error })
    } else {
      setMessage({ type: "success", text: "Budget deleted" })
      loadData()
    }
    setDeletingBudget(null)
  }

  function handleSaved() {
    setMessage({ type: "success", text: editBudget ? "Budget updated" : "Budget created" })
    setEditBudget(null)
    loadData()
  }

  if (loading) {
    return <LoadingState message="Loading budgets..." />
  }

  const hasBudgets = summary && summary.budgets_total > 0

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[20px] sm:text-[24px] lg:text-[28px] font-bold text-[var(--text-primary)] tracking-tight leading-tight">
            Budget Planning
          </h1>
          <p className="text-[12px] sm:text-[13px] text-[var(--text-tertiary)] mt-1 sm:mt-2 max-w-lg">
            Set spending targets and track budget vs actual across your hierarchy
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => { setEditBudget(null); setFormDialogOpen(true) }} size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Create Budget
          </Button>
          <PageActionsMenu onClearCache={loadData} />
        </div>
      </div>

      {/* Message Banner */}
      {message && (
        <div className={`p-3 rounded-lg text-sm font-medium ${
          message.type === "success"
            ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
            : "bg-rose-50 border border-rose-200 text-rose-700"
        }`}>
          {message.text}
        </div>
      )}

      {/* Stats Row */}
      {hasBudgets && summary && (
        <PremiumCard>
          <StatRow
            stats={[
              { icon: Target, value: formatCurrency(summary.total_budget), label: "Total Budget", color: "mint" },
              { icon: DollarSign, value: formatCurrency(summary.total_actual), label: "Total Actual", color: "blue" },
              {
                icon: summary.total_variance >= 0 ? TrendingDown : TrendingUp,
                value: `${summary.total_variance_percent >= 0 ? "" : "+"}${Math.abs(summary.total_variance_percent).toFixed(1)}%`,
                label: summary.total_variance >= 0 ? "Under Budget" : "Over Budget",
                color: summary.total_variance >= 0 ? "mint" : "coral",
              },
              { icon: AlertTriangle, value: summary.budgets_over, label: "Over Budget", color: summary.budgets_over > 0 ? "coral" : "slate" },
            ]}
          />
        </PremiumCard>
      )}

      {/* Shared Advanced Filter Bar */}
      {hasBudgets && (
        <AdvancedFilterBar
          filters={filters}
          onChange={updateFilters}
          config={{ search: true, category: true, periodType: true, status: true, hierarchyEntity: true }}
          activeCount={activeFiltersCount}
          onClear={clearFilters}
          hierarchyNodes={hierarchyNodes}
          searchPlaceholder="Search budgets..."
        />
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-auto overflow-x-auto mb-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="budgets">Budgets ({filteredBudgets.length})</TabsTrigger>
          <TabsTrigger value="allocation">Allocation</TabsTrigger>
          <TabsTrigger value="by-category">By Category</TabsTrigger>
          <TabsTrigger value="by-provider">By Provider</TabsTrigger>
        </TabsList>

        {/* Overview Tab — Variance View */}
        <TabsContent value="overview">
          {!hasBudgets ? (
            <EmptyState
              icon={Target}
              title="No budgets yet"
              description="Create your first budget to start tracking spending targets across your organization."
              action={{
                label: "Create Budget",
                onClick: () => { setEditBudget(null); setFormDialogOpen(true) },
                icon: Plus,
              }}
            />
          ) : filteredVarianceItems.length === 0 ? (
            <PremiumCard>
              <FilteredEmptyState
                activeCount={activeFiltersCount}
                onClear={clearFilters}
                message="No budgets match your filters"
              />
            </PremiumCard>
          ) : (
            <PremiumCard>
              <SectionHeader
                title="Budget vs Actual"
                subtitle={`${filteredVarianceItems.length} budget${filteredVarianceItems.length !== 1 ? "s" : ""} — variance tracking`}
              />
              <div className="mt-4 divide-y divide-[var(--border-subtle)]">
                {filteredVarianceItems.map((item) => (
                  <VarianceRow
                    key={item.budget_id}
                    item={item}
                    onEdit={handleEditFromVariance}
                    onDelete={handleDeletePrompt}
                  />
                ))}
              </div>
            </PremiumCard>
          )}
        </TabsContent>

        {/* Budgets Tab — Raw Budget List */}
        <TabsContent value="budgets">
          {filteredBudgets.length === 0 ? (
            <PremiumCard>
              <div className="py-12 text-center">
                <Target className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-3" />
                <p className="text-sm font-medium text-[var(--text-secondary)]">
                  {!hasBudgets ? "No budgets yet" : "No budgets match your filters"}
                </p>
                {!hasBudgets && (
                  <Button size="sm" className="mt-3" onClick={() => { setEditBudget(null); setFormDialogOpen(true) }}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    Create Budget
                  </Button>
                )}
              </div>
            </PremiumCard>
          ) : (
            <PremiumCard>
              <SectionHeader
                title="All Budgets"
                subtitle={`${filteredBudgets.length} budget${filteredBudgets.length !== 1 ? "s" : ""}`}
              />
              <div className="mt-4">
                {filteredBudgets.map((budget) => (
                  <BudgetListRow
                    key={budget.budget_id}
                    budget={budget}
                    onEdit={handleEditBudget}
                    onDelete={handleDeletePrompt}
                  />
                ))}
              </div>
            </PremiumCard>
          )}
        </TabsContent>

        {/* Allocation Tab */}
        <TabsContent value="allocation">
          {!allocationTree || allocationTree.roots.length === 0 ? (
            <EmptyState
              icon={Network}
              title="No allocation tree"
              description="Create budgets at multiple hierarchy levels to see the allocation tree."
            />
          ) : (
            <PremiumCard>
              <SectionHeader title="Budget Allocation Tree" subtitle="Top-down budget allocation across hierarchy" />
              <div className="mt-4">
                {allocationTree.roots.map((root) => (
                  <AllocationTreeNode key={root.budget_id} node={root} />
                ))}
              </div>
            </PremiumCard>
          )}
        </TabsContent>

        {/* By Category Tab */}
        <TabsContent value="by-category">
          {!categoryBreakdown || categoryBreakdown.items.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No category data"
              description="Create budgets to see the breakdown by cost category."
            />
          ) : (
            <PremiumCard>
              <SectionHeader title="By Category" subtitle="Budget vs actual per cost category" />
              <div className="mt-4">
                {categoryBreakdown.items.map((item) => (
                  <CategoryRow key={item.category} item={item} />
                ))}
              </div>
            </PremiumCard>
          )}
        </TabsContent>

        {/* By Provider Tab */}
        <TabsContent value="by-provider">
          {!providerBreakdown || providerBreakdown.items.length === 0 ? (
            <EmptyState
              icon={Server}
              title="No provider data"
              description="Create provider-specific budgets to see the breakdown by provider."
            />
          ) : (
            <PremiumCard>
              <SectionHeader title="By Provider" subtitle="Budget vs actual per provider" />
              <div className="mt-4">
                {providerBreakdown.items.map((item) => (
                  <ProviderRow key={`${item.provider}-${item.category}`} item={item} />
                ))}
              </div>
            </PremiumCard>
          )}
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <BudgetFormDialog
        open={formDialogOpen}
        onOpenChange={(open) => {
          setFormDialogOpen(open)
          if (!open) setEditBudget(null)
        }}
        onSaved={handleSaved}
        orgSlug={orgSlug}
        hierarchyNodes={hierarchyNodes}
        hierarchyTreeRoots={hierarchyTreeRoots}
        editBudget={editBudget}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        budgetName={deletingBudget?.name || ""}
        loading={deleteLoading}
      />
    </div>
  )
}
