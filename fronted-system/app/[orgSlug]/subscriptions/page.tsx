"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  Loader2,
  Wallet,
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  DollarSign,
  Calendar,
  Users,
  Settings,
  ArrowUpRight,
  Brain,
  Palette,
  FileText,
  MessageSquare,
  Code,
  Cloud,
  Sparkles,
  Check,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
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
  getSaaSSubscriptionSummary,
  SaaSSubscription,
  SaaSSubscriptionCreate,
} from "@/actions/saas-subscriptions"
import { COMMON_SAAS_PROVIDERS } from "@/lib/saas-providers"

// Popular providers to highlight (top 5 by category)
const POPULAR_PROVIDERS = [
  { id: "chatgpt_plus", defaultCost: 20 },
  { id: "claude_pro", defaultCost: 20 },
  { id: "copilot", defaultCost: 10 },
  { id: "canva", defaultCost: 12.99 },
  { id: "figma", defaultCost: 15 },
  { id: "cursor", defaultCost: 20 },
  { id: "notion", defaultCost: 10 },
  { id: "slack", defaultCost: 8.75 },
]

// Category icon mapping
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ai: Brain,
  design: Palette,
  productivity: FileText,
  communication: MessageSquare,
  development: Code,
  cloud: Cloud,
  other: Wallet,
}

// Category colors
const CATEGORY_COLORS: Record<string, string> = {
  ai: "bg-purple-100 text-purple-700 border-purple-200",
  design: "bg-pink-100 text-pink-700 border-pink-200",
  productivity: "bg-blue-100 text-blue-700 border-blue-200",
  communication: "bg-green-100 text-green-700 border-green-200",
  development: "bg-orange-100 text-orange-700 border-orange-200",
  cloud: "bg-cyan-100 text-cyan-700 border-cyan-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
}

export default function SubscriptionsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [subscriptions, setSubscriptions] = useState<SaaSSubscription[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [customCost, setCustomCost] = useState<number>(0)
  const [customSeats, setCustomSeats] = useState<number>(1)
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly")
  const [customProviderName, setCustomProviderName] = useState("")
  const [customProviderCategory, setCustomProviderCategory] = useState<string>("other")
  const [customDialogOpen, setCustomDialogOpen] = useState(false)
  const [summary, setSummary] = useState<{
    total_monthly_cost: number
    total_annual_cost: number
    count_by_category: Record<string, number>
    enabled_count: number
    total_count: number
  } | null>(null)

  // Get providers not yet added
  const addedProviderIds = new Set(subscriptions.map(s => s.provider_name))
  const availablePopular = POPULAR_PROVIDERS.filter(p => !addedProviderIds.has(p.id)).slice(0, 5)
  const allAvailableProviders = COMMON_SAAS_PROVIDERS.filter(p => !addedProviderIds.has(p.id) && p.id !== "custom")

  const loadData = useCallback(async () => {
    setIsLoading(true)
    const [subsResult, summaryResult] = await Promise.all([
      listSaaSSubscriptions(orgSlug),
      getSaaSSubscriptionSummary(orgSlug),
    ])

    if (subsResult.success && subsResult.subscriptions) {
      setSubscriptions(subsResult.subscriptions)
    }
    if (summaryResult.success && summaryResult.summary) {
      setSummary(summaryResult.summary)
    }
    setIsLoading(false)
  }, [orgSlug])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleToggle = async (sub: SaaSSubscription) => {
    setToggling(sub.id)
    await toggleSaaSSubscription(orgSlug, sub.id, !sub.is_enabled)
    setToggling(null)
    await loadData()
  }

  // Quick add a popular provider
  const handleQuickAdd = async (providerId: string) => {
    const provider = COMMON_SAAS_PROVIDERS.find(p => p.id === providerId)
    const popularInfo = POPULAR_PROVIDERS.find(p => p.id === providerId)
    if (!provider) return

    setAdding(providerId)
    await createSaaSSubscription(orgSlug, {
      provider_name: providerId,
      display_name: provider.name,
      billing_cycle: "monthly",
      cost_per_cycle: popularInfo?.defaultCost || 0,
      category: provider.category,
    })
    setAdding(null)
    await loadData()
  }

  // Add with custom pricing via dialog
  const handleAddWithDialog = async () => {
    if (!selectedProvider) return
    const provider = COMMON_SAAS_PROVIDERS.find(p => p.id === selectedProvider)
    if (!provider) return

    setAdding(selectedProvider)
    await createSaaSSubscription(orgSlug, {
      provider_name: selectedProvider,
      display_name: provider.name,
      billing_cycle: billingCycle,
      cost_per_cycle: customCost,
      category: provider.category,
      seats: customSeats,
    })
    setAdding(null)
    setAddDialogOpen(false)
    setSelectedProvider(null)
    setCustomCost(0)
    setCustomSeats(1)
    setBillingCycle("monthly")
    await loadData()
  }

  // Open dialog for a specific provider
  const openAddDialog = (providerId: string) => {
    const popularInfo = POPULAR_PROVIDERS.find(p => p.id === providerId)
    setSelectedProvider(providerId)
    setCustomCost(popularInfo?.defaultCost || 0)
    setAddDialogOpen(true)
  }

  // Add a completely custom provider
  const handleAddCustomProvider = async () => {
    if (!customProviderName.trim()) return

    const providerId = customProviderName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

    setAdding(providerId)
    await createSaaSSubscription(orgSlug, {
      provider_name: providerId,
      display_name: customProviderName.trim(),
      billing_cycle: billingCycle,
      cost_per_cycle: customCost,
      category: customProviderCategory,
      seats: customSeats,
    })
    setAdding(null)
    setCustomDialogOpen(false)
    setCustomProviderName("")
    setCustomProviderCategory("other")
    setCustomCost(0)
    setCustomSeats(1)
    setBillingCycle("monthly")
    await loadData()
  }

  // Open custom provider dialog
  const openCustomDialog = () => {
    setCustomProviderName("")
    setCustomProviderCategory("other")
    setCustomCost(0)
    setCustomSeats(1)
    setBillingCycle("monthly")
    setCustomDialogOpen(true)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount)
  }

  const formatBillingCycle = (cycle: string) => {
    return cycle.charAt(0).toUpperCase() + cycle.slice(1)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#007A78]/10 to-[#14B8A6]/10">
              <Wallet className="h-6 w-6 text-[#007A78]" />
            </div>
            <h1 className="console-page-title">Subscriptions</h1>
          </div>
          <p className="console-subheading ml-12">
            Track and manage your SaaS subscription costs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openCustomDialog} className="console-button-primary">
            <Plus className="h-4 w-4 mr-2" />
            Add Provider
          </Button>
          <Link href={`/${orgSlug}/settings/integrations`}>
            <Button variant="outline" className="console-button-secondary">
              <Settings className="h-4 w-4 mr-2" />
              Integrations
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="console-stat-card">
            <CardHeader className="pb-2">
              <CardDescription className="console-small">Monthly Cost</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-[#007A78]" />
                <span className="console-metric-teal">{formatCurrency(summary.total_monthly_cost)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="console-stat-card">
            <CardHeader className="pb-2">
              <CardDescription className="console-small">Annual Cost</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#FF6E50]" />
                <span className="console-metric-coral">{formatCurrency(summary.total_annual_cost)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="console-stat-card">
            <CardHeader className="pb-2">
              <CardDescription className="console-small">Active Subscriptions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                <span className="text-2xl font-bold text-gray-900">
                  {summary.enabled_count} / {summary.total_count}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="console-stat-card">
            <CardHeader className="pb-2">
              <CardDescription className="console-small">Categories</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {Object.entries(summary.count_by_category).map(([cat, count]) => (
                  <Badge
                    key={cat}
                    variant="outline"
                    className={`text-xs capitalize ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.other}`}
                  >
                    {cat}: {count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Subscriptions Table */}
      <Card className="console-table-card">
        <CardHeader>
          <CardTitle className="console-card-title">All Subscriptions</CardTitle>
          <CardDescription>
            View and manage all your SaaS subscriptions. Toggle to enable/disable cost tracking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscriptions.length === 0 ? (
            <div className="text-center py-12">
              <Wallet className="h-12 w-12 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No subscriptions yet</h3>
              <p className="text-slate-500 mb-4">
                Add subscriptions from the Integrations page to start tracking your SaaS costs.
              </p>
              <Link href={`/${orgSlug}/settings/integrations`}>
                <Button className="console-button-primary">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Subscription
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Active</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead className="text-right">Seats</TableHead>
                  <TableHead className="text-right">Monthly Equiv.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((sub) => {
                  const CategoryIcon = CATEGORY_ICONS[sub.category || "other"] || Wallet
                  const monthlyEquiv =
                    sub.billing_cycle === "annual"
                      ? sub.cost_per_cycle / 12
                      : sub.billing_cycle === "quarterly"
                      ? sub.cost_per_cycle / 3
                      : sub.cost_per_cycle

                  // Map SaaS provider to integration page (only for LLM providers with API integrations)
                  const providerMapping: Record<string, string> = {
                    chatgpt_plus: "openai",
                    claude_pro: "anthropic",
                    gemini_advanced: "gemini",
                    copilot: "openai", // GitHub Copilot uses OpenAI models
                  }
                  const integrationPath = providerMapping[sub.provider_name]

                  return (
                    <TableRow key={sub.id} className={!sub.is_enabled ? "opacity-50" : ""}>
                      <TableCell>
                        <Switch
                          checked={sub.is_enabled}
                          onCheckedChange={() => handleToggle(sub)}
                          disabled={toggling === sub.id}
                          className="data-[state=checked]:bg-[#007A78]"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-lg bg-[#F0FDFA]">
                            <CategoryIcon className="h-4 w-4 text-[#007A78]" />
                          </div>
                          <div>
                            {integrationPath ? (
                              <Link href={`/${orgSlug}/settings/integrations/${integrationPath}`}>
                                <div className="font-medium hover:text-[#007A78] hover:underline cursor-pointer flex items-center gap-1.5">
                                  {sub.display_name}
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                </div>
                              </Link>
                            ) : (
                              <div className="font-medium">{sub.display_name}</div>
                            )}
                            <div className="text-xs text-gray-500">{sub.provider_name}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`capitalize ${CATEGORY_COLORS[sub.category || "other"]}`}
                        >
                          {sub.category || "other"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(sub.cost_per_cycle)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {formatBillingCycle(sub.billing_cycle)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {sub.seats ? (
                          <div className="flex items-center justify-end gap-1">
                            <Users className="h-3.5 w-3.5 text-gray-400" />
                            <span>{sub.seats}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={sub.is_enabled ? "text-[#007A78] font-medium" : "text-gray-400"}>
                          {formatCurrency(monthlyEquiv)}/mo
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Quick Add Popular Providers */}
      {availablePopular.length > 0 && (
        <Card className="console-table-card">
          <CardHeader>
            <CardTitle className="console-card-title flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#007A78]" />
              Quick Add Popular Tools
            </CardTitle>
            <CardDescription>
              One-click add popular SaaS subscriptions. Click the name to customize pricing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {availablePopular.map((pop) => {
                const provider = COMMON_SAAS_PROVIDERS.find(p => p.id === pop.id)
                if (!provider) return null
                const CategoryIcon = CATEGORY_ICONS[provider.category] || Wallet
                return (
                  <div
                    key={pop.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <button
                      onClick={() => openAddDialog(pop.id)}
                      className="flex items-center gap-2 text-left flex-1 min-w-0"
                    >
                      <div className={`p-1.5 rounded-lg ${CATEGORY_COLORS[provider.category] || CATEGORY_COLORS.other}`}>
                        <CategoryIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{provider.name}</div>
                        <div className="text-xs text-muted-foreground">
                          ${pop.defaultCost}/mo
                        </div>
                      </div>
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-[#007A78] hover:bg-[#007A78]/10"
                      onClick={() => handleQuickAdd(pop.id)}
                      disabled={adding === pop.id}
                    >
                      {adding === pop.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add More Section */}
      <div className="rounded-lg border p-4 bg-muted/30">
        <h3 className="console-body font-medium mb-3 flex items-center gap-2">
          <ArrowUpRight className="h-4 w-4 text-[#007A78]" />
          Add More Subscriptions
        </h3>
        <div className="flex flex-wrap gap-2">
          <Select
            value=""
            onValueChange={(value) => openAddDialog(value)}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select a service to add..." />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(
                allAvailableProviders.reduce((acc, p) => {
                  const cat = p.category || "other"
                  if (!acc[cat]) acc[cat] = []
                  acc[cat].push(p)
                  return acc
                }, {} as Record<string, typeof allAvailableProviders>)
              ).map(([category, providers]) => (
                <div key={category}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase">
                    {category}
                  </div>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
          <Link href={`/${orgSlug}/settings/integrations`}>
            <Button variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Manage Integrations
            </Button>
          </Link>
        </div>
      </div>

      {/* Add Subscription Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Subscription</DialogTitle>
            <DialogDescription>
              {selectedProvider && COMMON_SAAS_PROVIDERS.find(p => p.id === selectedProvider)?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="cost" className="text-right">
                Cost
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  id="cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={customCost}
                  onChange={(e) => setCustomCost(parseFloat(e.target.value) || 0)}
                  className="flex-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="billing" className="text-right">
                Billing
              </Label>
              <Select
                value={billingCycle}
                onValueChange={(v) => setBillingCycle(v as "monthly" | "annual")}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="seats" className="text-right">
                Seats
              </Label>
              <Input
                id="seats"
                type="number"
                min="1"
                value={customSeats}
                onChange={(e) => setCustomSeats(parseInt(e.target.value) || 1)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddWithDialog}
              disabled={adding === selectedProvider}
              className="console-button-primary"
            >
              {adding === selectedProvider ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Add Subscription
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Custom Provider Dialog */}
      <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Provider</DialogTitle>
            <DialogDescription>
              Add any SaaS service not in our list (e.g., B&Q, internal tools)
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="providerName" className="text-right">
                Name
              </Label>
              <Input
                id="providerName"
                placeholder="e.g., B&Q, Jira, Custom Tool"
                value={customProviderName}
                onChange={(e) => setCustomProviderName(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="category" className="text-right">
                Category
              </Label>
              <Select
                value={customProviderCategory}
                onValueChange={setCustomProviderCategory}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ai">AI Tools</SelectItem>
                  <SelectItem value="design">Design</SelectItem>
                  <SelectItem value="productivity">Productivity</SelectItem>
                  <SelectItem value="communication">Communication</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="cloud">Cloud</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="customCost" className="text-right">
                Cost
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  id="customCost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={customCost}
                  onChange={(e) => setCustomCost(parseFloat(e.target.value) || 0)}
                  className="flex-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="customBilling" className="text-right">
                Billing
              </Label>
              <Select
                value={billingCycle}
                onValueChange={(v) => setBillingCycle(v as "monthly" | "annual")}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="customSeats" className="text-right">
                Seats
              </Label>
              <Input
                id="customSeats"
                type="number"
                min="1"
                value={customSeats}
                onChange={(e) => setCustomSeats(parseInt(e.target.value) || 1)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddCustomProvider}
              disabled={!customProviderName.trim() || adding !== null}
              className="console-button-primary"
            >
              {adding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Add Provider
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
