"use client"

/**
 * Provider Detail Page
 *
 * Shows all subscriptions for a specific provider.
 * Uses Supabase data (saas_subscriptions table).
 */

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Plus,
  Loader2,
  CreditCard,
  Check,
  Trash2,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import {
  listSaaSSubscriptions,
  createSaaSSubscription,
  toggleSaaSSubscription,
  deleteSaaSSubscription,
  SaaSSubscription,
} from "@/actions/saas-subscriptions"

// Provider display names
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  chatgpt_plus: "ChatGPT Plus",
  claude_pro: "Claude Pro",
  gemini_advanced: "Gemini Advanced",
  copilot: "GitHub Copilot",
  cursor: "Cursor",
  windsurf: "Windsurf",
  replit: "Replit",
  v0: "v0",
  lovable: "Lovable",
  canva: "Canva",
  adobe_cc: "Adobe Creative Cloud",
  figma: "Figma",
  miro: "Miro",
  notion: "Notion",
  confluence: "Confluence",
  asana: "Asana",
  monday: "Monday.com",
  slack: "Slack",
  zoom: "Zoom",
  teams: "Microsoft Teams",
  github: "GitHub",
  gitlab: "GitLab",
  jira: "Jira",
  linear: "Linear",
  vercel: "Vercel",
  netlify: "Netlify",
  railway: "Railway",
  supabase: "Supabase",
}

function getProviderDisplayName(provider: string): string {
  return PROVIDER_DISPLAY_NAMES[provider] || provider.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

export default function ProviderDetailPage() {
  const params = useParams<{ orgSlug: string; provider: string }>()
  const { orgSlug, provider } = params

  // State
  const [subscriptions, setSubscriptions] = useState<SaaSSubscription[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState<{ open: boolean; sub: SaaSSubscription | null }>({
    open: false,
    sub: null,
  })
  const [adding, setAdding] = useState(false)

  // Add form state
  const [newSub, setNewSub] = useState({
    cost: 0,
    seats: 1,
    billing: "monthly" as "monthly" | "annual",
    notes: "",
  })

  // Load subscriptions for this provider
  const loadSubscriptions = useCallback(async () => {
    setLoading(true)
    const result = await listSaaSSubscriptions(orgSlug)
    if (result.success && result.subscriptions) {
      // Filter to only this provider
      const providerSubs = result.subscriptions.filter(
        s => s.provider_name.toLowerCase() === provider.toLowerCase()
      )
      setSubscriptions(providerSubs)
    }
    setLoading(false)
  }, [orgSlug, provider])

  useEffect(() => {
    loadSubscriptions()
  }, [loadSubscriptions])

  // Toggle subscription
  const handleToggle = async (sub: SaaSSubscription) => {
    setToggling(sub.id)
    await toggleSaaSSubscription(orgSlug, sub.id, !sub.is_enabled)
    setToggling(null)
    await loadSubscriptions()
  }

  // Delete subscription
  const handleDelete = async () => {
    if (!showDeleteDialog.sub) return
    setDeleting(showDeleteDialog.sub.id)
    await deleteSaaSSubscription(orgSlug, showDeleteDialog.sub.id)
    setDeleting(null)
    setShowDeleteDialog({ open: false, sub: null })
    await loadSubscriptions()
  }

  // Add subscription
  const handleAdd = async () => {
    setAdding(true)
    await createSaaSSubscription(orgSlug, {
      provider_name: provider,
      display_name: `${getProviderDisplayName(provider)} - ${newSub.billing === "annual" ? "Annual" : "Monthly"}`,
      billing_cycle: newSub.billing,
      cost_per_cycle: newSub.cost,
      seats: newSub.seats,
      notes: newSub.notes,
      category: "other",
    })
    setAdding(false)
    setShowAddDialog(false)
    setNewSub({ cost: 0, seats: 1, billing: "monthly", notes: "" })
    await loadSubscriptions()
  }

  const providerDisplayName = getProviderDisplayName(provider)
  const enabledSubs = subscriptions.filter(s => s.is_enabled)
  const totalMonthlyCost = enabledSubs.reduce((sum, sub) => {
    if (sub.billing_cycle === "annual") return sum + sub.cost_per_cycle / 12
    if (sub.billing_cycle === "quarterly") return sum + sub.cost_per_cycle / 3
    return sum + sub.cost_per_cycle
  }, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/${orgSlug}/settings/integrations/subscriptions`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#007A78]/10 to-[#14B8A6]/10">
            <CreditCard className="h-6 w-6 text-[#007A78]" />
          </div>
          <div>
            <h1 className="console-page-title">{providerDisplayName}</h1>
            <p className="console-subheading">
              Manage subscriptions for {providerDisplayName}
            </p>
          </div>
        </div>
        <Button onClick={() => setShowAddDialog(true)} className="console-button-primary">
          <Plus className="h-4 w-4 mr-2" />
          Add Subscription
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="console-stat-card">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-[#007A78]">
              {formatCurrency(totalMonthlyCost)}
            </div>
            <p className="text-sm text-muted-foreground">Monthly Cost</p>
          </CardContent>
        </Card>
        <Card className="console-stat-card">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{enabledSubs.length}</div>
            <p className="text-sm text-muted-foreground">Active Subscriptions</p>
          </CardContent>
        </Card>
        <Card className="console-stat-card">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{subscriptions.length}</div>
            <p className="text-sm text-muted-foreground">Total Subscriptions</p>
          </CardContent>
        </Card>
      </div>

      {/* Subscriptions Table */}
      <Card className="console-table-card">
        <CardHeader>
          <CardTitle className="console-card-title">{providerDisplayName} Subscriptions</CardTitle>
          <CardDescription>
            Toggle subscriptions on/off to include them in cost tracking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscriptions.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="h-12 w-12 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No subscriptions yet</h3>
              <p className="text-slate-500 mb-4">
                Add your first {providerDisplayName} subscription to start tracking costs.
              </p>
              <Button onClick={() => setShowAddDialog(true)} className="console-button-primary">
                <Plus className="h-4 w-4 mr-2" />
                Add Subscription
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Active</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead className="text-right">Seats</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell>
                      <Switch
                        checked={sub.is_enabled}
                        onCheckedChange={() => handleToggle(sub)}
                        disabled={toggling === sub.id}
                        className="data-[state=checked]:bg-[#007A78]"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{sub.display_name}</div>
                      {sub.notes && (
                        <div className="text-xs text-muted-foreground">{sub.notes}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(sub.cost_per_cycle)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {sub.billing_cycle}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {sub.seats || "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        onClick={() => setShowDeleteDialog({ open: true, sub })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Subscription Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {providerDisplayName} Subscription</DialogTitle>
            <DialogDescription>
              Add a new subscription to track costs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cost">Cost ($)</Label>
                <Input
                  id="cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newSub.cost}
                  onChange={(e) => setNewSub({ ...newSub, cost: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing">Billing Period</Label>
                <Select
                  value={newSub.billing}
                  onValueChange={(value) => setNewSub({ ...newSub, billing: value as "monthly" | "annual" })}
                >
                  <SelectTrigger id="billing">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="seats">Seats</Label>
              <Input
                id="seats"
                type="number"
                min="1"
                value={newSub.seats}
                onChange={(e) => setNewSub({ ...newSub, seats: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input
                id="notes"
                placeholder="e.g., Team subscription"
                value={newSub.notes}
                onChange={(e) => setNewSub({ ...newSub, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={adding} className="console-button-primary">
              {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Add Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={showDeleteDialog.open}
        onOpenChange={(open) => setShowDeleteDialog({ open, sub: open ? showDeleteDialog.sub : null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Subscription</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{showDeleteDialog.sub?.display_name}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog({ open: false, sub: null })}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting === showDeleteDialog.sub?.id}
            >
              {deleting === showDeleteDialog.sub?.id ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
