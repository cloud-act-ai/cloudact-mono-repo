"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, Check, CreditCard, Plus, ChevronRight, ChevronDown, ChevronUp, Brain, Palette, FileText, MessageSquare, Code, Cloud, AlertTriangle, Search, Power } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { Skeleton } from "@/components/ui/skeleton"
import {
  getAllProviders,
  enableProvider,
  disableProvider,
  createCustomPlan,
  type ProviderInfo,
} from "@/actions/subscription-providers"

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
          <div onClick={(e) => e.stopPropagation()}>
            {provider.is_enabled ? (
              <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">
                <Check className="h-3 w-3 mr-1" />
                Enabled
              </Badge>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs text-[#007A78] border-[#007A78]/30 hover:bg-[#F0FDFA]"
                onClick={() => onToggle(provider.provider, true)}
                disabled={isToggling}
              >
                {isToggling ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Enable'}
              </Button>
            )}
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
          <div className="flex items-center gap-1">
            {provider.is_enabled && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggle(provider.provider, false)
                  }}
                  disabled={isToggling}
                  title="Disable provider"
                >
                  {isToggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 hover:bg-[#F0FDFA]">
                  <ChevronRight className="h-4 w-4 text-[#007A78]" />
                </Button>
              </>
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
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  // Add Provider Dialog state
  const [customDialogOpen, setCustomDialogOpen] = useState(false)
  const [customProviderName, setCustomProviderName] = useState("")
  const [customProviderCategory, setCustomProviderCategory] = useState<string>("other")
  const [customCost, setCustomCost] = useState<number>(0)
  const [customSeats, setCustomSeats] = useState<number>(1)
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly")
  const [adding, setAdding] = useState<string | null>(null)

  const loadSubscriptionProviders = useCallback(async (isMounted?: () => boolean) => {
    if (!isMounted || isMounted()) setProvidersLoading(true)
    const result = await getAllProviders(orgSlug)
    // Check if component is still mounted before updating state
    if (isMounted && !isMounted()) return
    if (result.success && result.providers) {
      setSubscriptionProviders(result.providers)
    }
    setProvidersLoading(false)
  }, [orgSlug])

  useEffect(() => {
    let mounted = true
    loadSubscriptionProviders(() => mounted)
    return () => { mounted = false }
  }, [loadSubscriptionProviders])

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  useEffect(() => {
    if (warningMessage) {
      const timer = setTimeout(() => setWarningMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [warningMessage])

  const handleSubscriptionProviderToggle = async (provider: string, enabled: boolean) => {
    setTogglingSubscriptionProvider(provider)
    setError(null)
    setSuccessMessage(null)
    setWarningMessage(null)

    // Optimistic update: update local state immediately for instant feedback
    const previousProviders = [...subscriptionProviders]
    setSubscriptionProviders(prev =>
      prev.map(p => p.provider === provider ? { ...p, is_enabled: enabled } : p)
    )

    try {
      const displayName = provider.replace(/_/g, ' ')
      let success = false
      let errorMsg: string | undefined

      if (enabled) {
        // Enable provider
        const result = await enableProvider(orgSlug, provider)
        success = result.success

        if (result.success) {
          if (result.error) {
            // Partial failure on enable (enabled but failed to seed plans)
            setWarningMessage(
              `${displayName} enabled, but some issues occurred: ${result.error}`
            )
          } else {
            setSuccessMessage(
              `${displayName} enabled${result.plans_seeded ? ` (${result.plans_seeded} plans seeded)` : ''}`
            )
          }
        } else {
          errorMsg = result.error
        }
      } else {
        // Disable provider
        const result = await disableProvider(orgSlug, provider)
        success = result.success

        if (result.success) {
          if (result.partial_failure) {
            // Partial failure: some plans deleted, some failed
            setWarningMessage(
              `${displayName} disabled (${result.plans_deleted || 0} plans deleted). Warning: ${result.partial_failure}`
            )
          } else if (result.error) {
            // Complete failure or provider disabled but plans not deleted
            setWarningMessage(
              `${displayName} disabled${result.plans_deleted ? ` (${result.plans_deleted} plans deleted)` : ''}. Warning: ${result.error}`
            )
          } else {
            // Full success
            setSuccessMessage(
              `${displayName} disabled${result.plans_deleted ? ` (${result.plans_deleted} plans deleted)` : ''}`
            )
          }
        } else {
          errorMsg = result.error
        }
      }

      if (success) {
        // Reload to get accurate plan counts
        await loadSubscriptionProviders()
      } else {
        // Revert optimistic update on failure
        setSubscriptionProviders(previousProviders)
        setError(errorMsg || `Failed to ${enabled ? 'enable' : 'disable'} provider`)
      }
    } catch (error: unknown) {
      // Revert optimistic update on error
      setSubscriptionProviders(previousProviders)
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
      setError(errorMessage)
    } finally {
      setTogglingSubscriptionProvider(null) // Clear toggle state AFTER reload completes
    }
  }

  // Add a completely custom provider
  const handleAddCustomProvider = async () => {
    if (!customProviderName.trim()) return

    // Validate inputs
    if (customCost < 0) {
      setError("Cost cannot be negative")
      return
    }
    if (customSeats < 1) {
      setError("Seats must be at least 1")
      return
    }
    if (customSeats > 10000) {
      setError("Seats cannot exceed 10,000")
      return
    }

    const providerId = customProviderName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

    // Validate provider ID is not empty after sanitization
    if (!providerId || providerId.length < 2) {
      setError("Provider name must contain at least 2 alphanumeric characters")
      return
    }

    setAdding(providerId)
    setError(null)

    try {
      // First enable the provider in Supabase meta
      const enableResult = await enableProvider(orgSlug, providerId)
      if (!enableResult.success) {
        setError(enableResult.error || "Failed to enable custom provider")
        return
      }

      // Then create a custom plan in BigQuery via API service
      const planResult = await createCustomPlan(orgSlug, providerId, {
        plan_name: "custom",
        display_name: customProviderName.trim(),
        unit_price_usd: customCost,
        billing_cycle: billingCycle,
        seats: customSeats,
      })

      if (!planResult.success) {
        // Rollback: disable the provider if plan creation failed
        await disableProvider(orgSlug, providerId)
        setError(planResult.error || "Failed to create custom plan")
        return
      }

      setCustomDialogOpen(false)
      resetCustomForm()
      setSuccessMessage(`${customProviderName.trim()} added successfully`)
      await loadSubscriptionProviders()
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
      setError(errorMessage)
    } finally {
      setAdding(null)
    }
  }

  // Reset custom provider form
  const resetCustomForm = () => {
    setCustomProviderName("")
    setCustomProviderCategory("other")
    setCustomCost(0)
    setCustomSeats(1)
    setBillingCycle("monthly")
  }

  // Open custom provider dialog
  const openCustomDialog = () => {
    resetCustomForm()
    setError(null) // Clear any existing error
    setCustomDialogOpen(true)
  }

  // Handle dialog close - reset form state
  const handleDialogOpenChange = (open: boolean) => {
    setCustomDialogOpen(open)
    if (!open) {
      // Reset form when dialog is closed
      resetCustomForm()
      setError(null)
    }
  }

  const enabledCount = subscriptionProviders.filter(p => p.is_enabled).length

  // Filter providers based on search query
  const filteredProviders = subscriptionProviders.filter(provider =>
    provider.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    provider.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
    provider.category.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (providersLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted w-fit">
          <Skeleton className="h-4 w-32" />
        </div>

        {/* Provider Cards Skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Card key={i} className="console-stat-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div>
                      <Skeleton className="h-5 w-32 mb-2" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-6 w-10" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <Skeleton className="h-6 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href={`/${orgSlug}/settings`} className="hover:text-[#007A78]">Settings</Link>
        <ChevronRight className="h-4 w-4" />
        <Link href={`/${orgSlug}/settings/integrations`} className="hover:text-[#007A78]">Integrations</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-gray-900 font-medium">Subscriptions</span>
      </nav>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#007A78]/10 to-[#14B8A6]/10">
            <CreditCard className="h-6 w-6 text-[#007A78]" />
          </div>
          <h1 className="console-page-title">Subscription Providers</h1>
        </div>
        <p className="console-subheading ml-12">
          Track fixed-cost SaaS subscriptions. Enable providers to manage plans.
        </p>
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

      {warningMessage && (
        <Alert className="border-amber-500/20 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-900">{warningMessage}</AlertDescription>
        </Alert>
      )}

      {subscriptionProviders.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search providers by name or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 max-w-md border-[#007A78]/20 focus:border-[#007A78] focus:ring-[#007A78]/20"
          />
        </div>
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
            {(showAllProviders ? filteredProviders : filteredProviders.slice(0, INITIAL_PROVIDERS_COUNT)).map((provider) => (
              <SubscriptionProviderCard
                key={provider.provider}
                provider={provider}
                orgSlug={orgSlug}
                onToggle={handleSubscriptionProviderToggle}
                isToggling={togglingSubscriptionProvider === provider.provider}
              />
            ))}
          </div>

          {/* No results message */}
          {filteredProviders.length === 0 && searchQuery && (
            <div className="text-center py-8">
              <p className="console-body text-gray-500">
                No providers found matching &quot;{searchQuery}&quot;
              </p>
            </div>
          )}

          {/* Show more button - before custom provider message */}
          {filteredProviders.length > INITIAL_PROVIDERS_COUNT && !showAllProviders && (
            <div className="mt-4 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllProviders(true)}
                className="text-[#007A78] hover:bg-[#F0FDFA]"
              >
                Show {filteredProviders.length - INITIAL_PROVIDERS_COUNT} more providers
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}

          {/* Don't see your provider message - show after load more */}
          {!showAllProviders && (
            <div className="mt-4 text-center py-4 border border-dashed rounded-lg bg-slate-50/50">
              <p className="text-sm text-gray-500 mb-2">
                Don&apos;t see your provider?
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={openCustomDialog}
                className="text-[#007A78] border-[#007A78]/30 hover:bg-[#F0FDFA]"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Custom Provider
              </Button>
            </div>
          )}

          {showAllProviders && filteredProviders.length > INITIAL_PROVIDERS_COUNT && (
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
      <Dialog open={customDialogOpen} onOpenChange={handleDialogOpenChange}>
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
                disabled={adding !== null}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="category" className="text-right">
                Category
              </Label>
              <Select
                value={customProviderCategory}
                onValueChange={setCustomProviderCategory}
                disabled={adding !== null}
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
                  placeholder="0.00"
                  value={customCost === 0 ? "" : customCost}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const parsed = parseFloat(e.target.value)
                    setCustomCost(e.target.value === "" ? 0 : (isNaN(parsed) ? 0 : parsed))
                  }}
                  className="flex-1"
                  disabled={adding !== null}
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
                disabled={adding !== null}
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
                max={10000}
                placeholder="1"
                value={customSeats === 1 ? "" : customSeats}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10)
                  const bounded = Math.min(10000, Math.max(1, isNaN(parsed) ? 1 : parsed))
                  setCustomSeats(e.target.value === "" ? 1 : bounded)
                }}
                className="col-span-3"
                disabled={adding !== null}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)} disabled={adding !== null}>
              Cancel
            </Button>
            <Button
              type="button"
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
