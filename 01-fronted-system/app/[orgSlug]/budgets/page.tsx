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
import { AdvancedFilterBar, FilteredEmptyState } from "@/components/filters/advanced-filter-bar"
import { useAdvancedFilters, matchesSearch, matchesBudgetStatus, type AdvancedFilterState } from "@/lib/hooks/use-advanced-filters"

import {
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgetSummary,
  getAllocationTree,
  getCategoryBreakdown,
  getProviderBreakdown,
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
} from "@/actions/budgets"

import { getHierarchyTree, type HierarchyTreeNode } from "@/actions/hierarchy"

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
// Create / Edit Budget Dialog
// ============================================

function BudgetFormDialog({
  open,
  onOpenChange,
  onSaved,
  orgSlug,
  hierarchyNodes,
  editBudget,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  orgSlug: string
  hierarchyNodes: { id: string; name: string; level_code: string; path: string }[]
  editBudget?: Budget | null
}) {
  const isEdit = !!editBudget
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [entityId, setEntityId] = useState("")
  const [category, setCategory] = useState<BudgetCategory>("total")
  const [budgetType, setBudgetType] = useState<BudgetType>("monetary")
  const [amount, setAmount] = useState("")
  const [periodType, setPeriodType] = useState<PeriodType>("monthly")
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [provider, setProvider] = useState("")
  const [notes, setNotes] = useState("")

  // Populate form when editing
  useEffect(() => {
    if (editBudget) {
      setEntityId(editBudget.hierarchy_entity_id)
      setCategory(editBudget.category)
      setBudgetType(editBudget.budget_type)
      setAmount(String(editBudget.budget_amount))
      setPeriodType(editBudget.period_type)
      setPeriodStart(editBudget.period_start)
      setPeriodEnd(editBudget.period_end)
      setProvider(editBudget.provider || "")
      setNotes(editBudget.notes || "")
    } else {
      setEntityId("")
      setCategory("total")
      setBudgetType("monetary")
      setAmount("")
      setPeriodType("monthly")
      setPeriodStart("")
      setPeriodEnd("")
      setProvider("")
      setNotes("")
    }
    setError(null)
  }, [editBudget, open])

  const selectedNode = hierarchyNodes.find((n) => n.id === entityId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!entityId || !amount || !periodStart || !periodEnd) {
      setError("Please fill in all required fields")
      return
    }

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
      if (result.error) {
        setError(result.error)
        return
      }
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
      if (result.error) {
        setError(result.error)
        return
      }
    }

    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Budget" : "Create Budget"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update spending target details." : "Set a spending target for a hierarchy entity."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              {error}
            </div>
          )}

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
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isEdit ? "Save Changes" : "Create Budget"}
            </Button>
          </DialogFooter>
        </form>
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

  // Load data — server-side filters dispatched to budget API endpoints
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [summaryRes, budgetListRes, treeRes, catRes, provRes, hierRes] = await Promise.all([
        getBudgetSummary(orgSlug, {
          category: serverParams.category,
          hierarchy_entity_id: serverParams.hierarchyEntityId,
        }),
        getBudgets(orgSlug, {
          category: serverParams.category as BudgetCategory | undefined,
          hierarchy_entity_id: serverParams.hierarchyEntityId,
          period_type: serverParams.periodType as PeriodType | undefined,
        }),
        getAllocationTree(orgSlug, { category: serverParams.category }),
        getCategoryBreakdown(orgSlug),
        getProviderBreakdown(orgSlug, { category: serverParams.category }),
        getHierarchyTree(orgSlug),
      ])

      if (summaryRes.data) setSummary(summaryRes.data)
      if (budgetListRes.data) setBudgetList(budgetListRes.data)
      if (treeRes.data) setAllocationTree(treeRes.data)
      if (catRes.data) setCategoryBreakdown(catRes.data)
      if (provRes.data) setProviderBreakdown(provRes.data)

      if (hierRes.success && hierRes.data?.roots) {
        setHierarchyNodes(flattenTree(hierRes.data.roots))
      }
    } catch {
      // Errors are handled in individual calls
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
        <Button onClick={() => { setEditBudget(null); setFormDialogOpen(true) }} size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Create Budget
        </Button>
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
