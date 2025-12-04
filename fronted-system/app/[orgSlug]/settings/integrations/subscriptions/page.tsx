"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2, Check, CreditCard, Plus, ChevronRight, ChevronDown, ChevronUp, Brain, Palette, FileText, MessageSquare, Code, Cloud, Wallet } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
  getAllProviders,
  enableProvider,
  disableProvider,
  type ProviderInfo,
} from "@/actions/subscription-providers"
import { createSaaSSubscription } from "@/actions/saas-subscriptions"

const INITIAL_PROVIDERS_COUNT = 20

function SubscriptionProviderCard({
  provider,
  orgSlug,
  onToggle,
  isToggling,
}: {
  provider: ProviderInfo
  orgSlug: string
  onToggle: (provider: string, enabled: boolean) => void
  isToggling: boolean
}) {
  const router = useRouter()

  const categoryIcons: Record<string, React.ReactNode> = {
    ai: <Brain className="h-5 w-5" />,
    design: <Palette className="h-5 w-5" />,
    productivity: <FileText className="h-5 w-5" />,
    communication: <MessageSquare className="h-5 w-5" />,
    development: <Code className="h-5 w-5" />,
    cloud: <Cloud className="h-5 w-5" />,
    other: <CreditCard className="h-5 w-5" />,
  }

  const icon = categoryIcons[provider.category] || categoryIcons.other

  return (
    <Card
      className={`console-stat-card transition-all hover:shadow-md cursor-pointer ${!provider.is_enabled ? 'opacity-60' : ''}`}
      onClick={() => {
        if (provider.is_enabled) {
          router.push(`/${orgSlug}/subscriptions/${provider.provider}`)
        }
      }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${provider.is_enabled ? 'bg-[#F0FDFA] text-[#007A78]' : 'bg-gray-100 text-gray-400'}`}>
              {icon}
            </div>
            <div>
              <CardTitle className="console-card-title">{provider.display_name}</CardTitle>
              <CardDescription className="console-small capitalize">{provider.category}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs text-gray-500">{provider.is_enabled ? 'Enabled' : 'Disabled'}</span>
            <Switch
              checked={provider.is_enabled}
              onCheckedChange={(checked) => onToggle(provider.provider, checked)}
              disabled={isToggling}
              className="data-[state=checked]:bg-[#007A78]"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="flex items-center justify-between">
          <div className="console-small text-gray-500">
            {provider.is_enabled && provider.plan_count > 0 && (
              <Badge variant="outline" className="bg-[#F0FDFA] text-[#007A78] border-[#007A78]/20">
                {provider.plan_count} plan{provider.plan_count !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {provider.is_enabled && (
              <Button variant="ghost" size="sm" className="h-8 hover:bg-[#F0FDFA]">
                <ChevronRight className="h-4 w-4 text-[#007A78]" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function SubscriptionProvidersPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [subscriptionProviders, setSubscriptionProviders] = useState<ProviderInfo[]>([])
  const [providersLoading, setProvidersLoading] = useState(true)
  const [togglingSubscriptionProvider, setTogglingSubscriptionProvider] = useState<string | null>(null)
  const [showAllProviders, setShowAllProviders] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Add Provider Dialog state
  const [customDialogOpen, setCustomDialogOpen] = useState(false)
  const [customProviderName, setCustomProviderName] = useState("")
  const [customProviderCategory, setCustomProviderCategory] = useState<string>("other")
  const [customCost, setCustomCost] = useState<number>(0)
  const [customSeats, setCustomSeats] = useState<number>(1)
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly")
  const [adding, setAdding] = useState<string | null>(null)

  const loadSubscriptionProviders = useCallback(async () => {
    setProvidersLoading(true)
    const result = await getAllProviders(orgSlug)
    if (result.success && result.providers) {
      setSubscriptionProviders(result.providers)
    }
    setProvidersLoading(false)
  }, [orgSlug])

  useEffect(() => {
    loadSubscriptionProviders()
  }, [loadSubscriptionProviders])

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  const handleSubscriptionProviderToggle = async (provider: string, enabled: boolean) => {
    setTogglingSubscriptionProvider(provider)
    setError(null)
    setSuccessMessage(null)

    const result = enabled
      ? await enableProvider(orgSlug, provider)
      : await disableProvider(orgSlug, provider)

    setTogglingSubscriptionProvider(null)

    if (result.success) {
      setSuccessMessage(
        enabled
          ? `${provider.replace(/_/g, ' ')} enabled${result.plans_seeded ? ` (${result.plans_seeded} plans seeded)` : ''}`
          : `${provider.replace(/_/g, ' ')} disabled`
      )
      await loadSubscriptionProviders()
    } else {
      setError(result.error || `Failed to ${enabled ? 'enable' : 'disable'} provider`)
    }
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
    setSuccessMessage(`${customProviderName.trim()} added successfully`)
    await loadSubscriptionProviders()
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

  const enabledCount = subscriptionProviders.filter(p => p.is_enabled).length

  if (providersLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="console-page-title">Subscription Providers</h1>
          <p className="console-subheading">
            Track fixed-cost SaaS subscriptions. Enable providers to manage plans.
          </p>
        </div>
        <Button onClick={openCustomDialog} className="console-button-primary">
          <Plus className="h-4 w-4 mr-2" />
          Add Provider
        </Button>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted console-small w-fit">
        <Check className="h-4 w-4 text-green-600" />
        <span className="text-gray-500">Enabled:</span>
        <span className="font-medium text-green-600">{enabledCount} / {subscriptionProviders.length}</span>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="border-green-500/20 bg-green-500/5">
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {subscriptionProviders.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <CreditCard className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <p className="console-body text-slate-500">
              No subscription providers available.
            </p>
            <Button onClick={openCustomDialog} className="mt-4 console-button-primary">
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Provider
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(showAllProviders ? subscriptionProviders : subscriptionProviders.slice(0, INITIAL_PROVIDERS_COUNT)).map((provider) => (
              <SubscriptionProviderCard
                key={provider.provider}
                provider={provider}
                orgSlug={orgSlug}
                onToggle={handleSubscriptionProviderToggle}
                isToggling={togglingSubscriptionProvider === provider.provider}
              />
            ))}
          </div>
          {subscriptionProviders.length > INITIAL_PROVIDERS_COUNT && !showAllProviders && (
            <div className="mt-4 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllProviders(true)}
                className="text-[#007A78] hover:bg-[#F0FDFA]"
              >
                Show {subscriptionProviders.length - INITIAL_PROVIDERS_COUNT} more providers
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
          {showAllProviders && subscriptionProviders.length > INITIAL_PROVIDERS_COUNT && (
            <div className="mt-4 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllProviders(false)}
                className="text-gray-500 hover:bg-gray-100"
              >
                Show less
                <ChevronUp className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}

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
