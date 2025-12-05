"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import {
  Check,
  Loader2,
  AlertTriangle,
  CreditCard,
  Receipt,
  ExternalLink,
  Download,
  Settings,
  Calendar,
  Lock,
  Shield,
} from "lucide-react"
import {
  createCheckoutSession,
  createBillingPortalSession,
  getBillingInfo,
  getStripePlans,
  changeSubscriptionPlan,
  type BillingInfo,
  type DynamicPlan,
} from "@/actions/stripe"
import { logError } from "@/lib/utils"

export default function BillingPage() {
  const params = useParams<{ orgSlug: string }>()
  const searchParams = useSearchParams()
  const reason = searchParams.get("reason")

  const [isLoading, setIsLoading] = useState<string | null>(null) // Track which plan is loading
  const [isPortalLoading, setIsPortalLoading] = useState(false)
  const [currentPlan, setCurrentPlan] = useState<string | null>(null)
  const [billingStatus, setBillingStatus] = useState<string | null>(null)
  const [billingInfo, setBillingInfo] = useState<BillingInfo | null>(null)
  const [isLoadingBilling, setIsLoadingBilling] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [hasStripeSubscription, setHasStripeSubscription] = useState(false)
  const [plans, setPlans] = useState<DynamicPlan[]>([])
  const [plansError, setPlansError] = useState<string | null>(null)
  const [billingError, setBillingError] = useState<string | null>(null)
  const [planChangeLoading, setPlanChangeLoading] = useState<string | null>(null)
  const [planChangeSuccess, setPlanChangeSuccess] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    plan: DynamicPlan | null
    isUpgrade: boolean
  }>({ open: false, plan: null, isUpgrade: false })
  const [downgradeLimitError, setDowngradeLimitError] = useState<string | null>(null)
  const [currentMemberCount, setCurrentMemberCount] = useState<number>(0)

  const orgSlug = params.orgSlug

  useEffect(() => {
    document.title = "Billing & Subscription | CloudAct.ai"
  }, [])

  useEffect(() => {
    fetchBillingData()
    fetchPlans()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug])

  // Poll for subscription data after successful checkout
  useEffect(() => {
    if (searchParams.get("success") === "true" && !hasStripeSubscription && !isLoadingBilling) {
      let pollCount = 0
      const maxPolls = 10
      const pollInterval = 2000 // 2 seconds
      let timeoutId: ReturnType<typeof setTimeout> | null = null

      const pollForSubscription = async () => {
        pollCount++
        await fetchBillingData()

        if (pollCount < maxPolls && !hasStripeSubscription) {
          timeoutId = setTimeout(pollForSubscription, pollInterval)
        }
      }

      // Start polling after a short delay
      timeoutId = setTimeout(pollForSubscription, 1000)

      // Cleanup function to prevent memory leaks
      return () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
      }
    }
  }, [searchParams, hasStripeSubscription, isLoadingBilling, fetchBillingData])

  const fetchPlans = useCallback(async () => {
    try {
      const result = await getStripePlans()

      if (result.error) {
        logError("BillingPage:fetchPlans:StripeAPI", result.error)
        setPlansError(result.error)
        setPlans([])
        return
      }

      if (!result.data || result.data.length === 0) {
        logError("BillingPage:fetchPlans:NoPlans", "No plans returned from Stripe")
        setPlansError("No subscription plans are currently available. Please contact support.")
        setPlans([])
        return
      }

      // Sort plans by price (ascending)
      const sortedPlans = result.data.sort((a, b) => a.price - b.price)
      setPlans(sortedPlans)
      setPlansError(null)
    } catch (err: unknown) {
      const errorMessage = logError("BillingPage:fetchPlans", err)
      setPlansError(errorMessage || "Failed to load subscription plans. Please refresh the page or contact support.")
      setPlans([])
    }
  }, [])

  const fetchBillingData = useCallback(async () => {
    setIsLoadingBilling(true)
    try {
      const supabase = createClient()

      // Get current user first
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        console.error("[Billing] No authenticated user")
        return
      }

      // Fetch org basic info (include created_by for owner fallback check)
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("plan, billing_status, stripe_subscription_id, id, created_by")
        .eq("org_slug", orgSlug)
        .single()

      if (orgError) {
        console.error("[Billing] Error fetching org:", orgError.message)
        // If org query fails, we can't proceed
        return
      }

      if (orgData) {
        setCurrentPlan(orgData.plan)
        setBillingStatus(orgData.billing_status)
        setHasStripeSubscription(!!orgData.stripe_subscription_id)

        // Fetch member count for limit validation
        const { count: memberCount } = await supabase
          .from("organization_members")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgData.id)
          .eq("status", "active")

        setCurrentMemberCount(memberCount || 0)

        // Fetch current user's role using the orgData.id we already have
        const { data: membership, error: membershipError } = await supabase
          .from("organization_members")
          .select("role")
          .eq("org_id", orgData.id)
          .eq("user_id", user.id)
          .eq("status", "active")
          .single()

        if (membershipError) {
          console.error("[Billing] Error fetching membership:", membershipError.message)
        }

        // Set user role - if membership exists, use it
        // Fallback: if user is the org creator, they are the owner
        let role = membership?.role || null

        if (!role && orgData.created_by === user.id) {
          console.log("[Billing] Using creator fallback for owner role")
          role = "owner"
        }

        setUserRole(role)

        if (role) {
          console.log("[Billing] User role:", role)
        } else {
          console.warn("[Billing] No membership found for user in org")
        }
      }

      // Fetch detailed billing info from Stripe (source of truth)
      const result = await getBillingInfo(orgSlug)
      if (result.error) {
        logError("BillingPage:fetchBillingData:BillingInfo", result.error)
        setBillingError(result.error)
      } else if (result.data) {
        setBillingInfo(result.data)
        setBillingError(null)
        // If Stripe has subscription data, use it (in case webhook missed)
        if (result.data.subscription) {
          setHasStripeSubscription(true)
          setCurrentPlan(result.data.subscription.plan.id)
          setBillingStatus(result.data.subscription.status)
        }
      }
    } catch (err: unknown) {
      logError("BillingPage:fetchBillingData", err)
    } finally {
      setIsLoadingBilling(false)
    }
  }, [orgSlug])

  // Validate URL is from allowed domains to prevent open redirect
  const isValidRedirectUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url)
      const allowedHosts = ["checkout.stripe.com", "billing.stripe.com"]
      return allowedHosts.includes(parsed.hostname)
    } catch {
      return false
    }
  }

  // For NEW subscribers: Go to Stripe Checkout
  const handleSubscribe = async (priceId: string) => {
    setIsLoading(priceId)
    try {
      const { url, error } = await createCheckoutSession(priceId, orgSlug)
      if (error) throw new Error(error)

      if (url && isValidRedirectUrl(url)) {
        window.location.href = url
      } else if (url) {
        throw new Error("Invalid checkout URL")
      }
    } catch (err: unknown) {
      const errorMessage = logError("BillingPage:handleSubscribe", err)
      toast.error(`Failed to start checkout: ${errorMessage}`)
    } finally {
      setIsLoading(null)
    }
  }

  // For EXISTING subscribers: Go to Stripe Billing Portal
  const handleManageSubscription = async () => {
    setIsPortalLoading(true)
    try {
      const { url, error } = await createBillingPortalSession(orgSlug)
      if (error) throw new Error(error)

      if (url && isValidRedirectUrl(url)) {
        window.location.href = url
      } else if (url) {
        throw new Error("Invalid portal URL")
      }
    } catch (err: unknown) {
      const errorMessage = logError("BillingPage:handleManageSubscription", err)
      toast.error(`Failed to open billing portal: ${errorMessage}`)
    } finally {
      setIsPortalLoading(false)
    }
  }

  // Check if downgrade is allowed based on current resource usage
  const checkDowngradeLimits = async (newPlanLimits: { teamMembers: number; providers: number; pipelinesPerDay: number }) => {
    const supabase = createClient()

    // Check team member limit
    if (currentMemberCount > newPlanLimits.teamMembers) {
      return {
        canDowngrade: false,
        reason: `You have ${currentMemberCount} team members but the new plan only allows ${newPlanLimits.teamMembers}. Please remove ${currentMemberCount - newPlanLimits.teamMembers} member${currentMemberCount - newPlanLimits.teamMembers > 1 ? 's' : ''} before downgrading.`
      }
    }

    // Check provider/integration limit
    try {
      const { data: orgData } = await supabase
        .from("organizations")
        .select("integration_openai_status, integration_anthropic_status, integration_gcp_status")
        .eq("org_slug", orgSlug)
        .single()

      if (orgData) {
        // Count configured integrations (status = 'VALID')
        const configuredProviders = [
          orgData.integration_openai_status === 'VALID',
          orgData.integration_anthropic_status === 'VALID',
          orgData.integration_gcp_status === 'VALID',
        ].filter(Boolean).length

        if (configuredProviders > newPlanLimits.providers) {
          const providerNames = []
          if (orgData.integration_openai_status === 'VALID') providerNames.push('OpenAI')
          if (orgData.integration_anthropic_status === 'VALID') providerNames.push('Anthropic')
          if (orgData.integration_gcp_status === 'VALID') providerNames.push('GCP')

          return {
            canDowngrade: false,
            reason: `You have ${configuredProviders} integrations configured (${providerNames.join(', ')}) but the new plan only allows ${newPlanLimits.providers}. Please remove ${configuredProviders - newPlanLimits.providers} integration${configuredProviders - newPlanLimits.providers > 1 ? 's' : ''} before downgrading.`
          }
        }
      }
    } catch (err: unknown) {
      console.error("Error checking provider limits:", err)
      // Don't block downgrade on error - let backend validation catch it
    }

    return { canDowngrade: true, reason: null }
  }

  // Show confirmation dialog before plan change
  const showPlanChangeConfirmation = async (plan: DynamicPlan, isUpgrade: boolean) => {
    // Clear any previous downgrade errors
    setDowngradeLimitError(null)

    // If it's a downgrade, check limits first
    if (!isUpgrade) {
      const limitCheck = await checkDowngradeLimits(plan.limits)

      if (!limitCheck.canDowngrade) {
        setDowngradeLimitError(limitCheck.reason)
        // Don't show the confirmation dialog, just show the error
        return
      }
    }

    setConfirmDialog({ open: true, plan, isUpgrade })
  }

  // For EXISTING subscribers: Change plan directly (called after confirmation)
  const handleChangePlan = async (priceId: string, planName: string) => {
    setConfirmDialog({ open: false, plan: null, isUpgrade: false })
    setPlanChangeLoading(priceId)
    setPlanChangeSuccess(null)
    try {
      const result = await changeSubscriptionPlan(orgSlug, priceId)

      if (!result.success || result.error) {
        throw new Error(result.error || "Failed to change plan")
      }

      // Update local state immediately
      if (result.subscription) {
        setCurrentPlan(result.subscription.plan.id)
        setBillingStatus(result.subscription.status)

        // Update billing info
        setBillingInfo(prev => prev ? {
          ...prev,
          subscription: {
            ...prev.subscription!,
            id: result.subscription!.id,
            status: result.subscription!.status,
            plan: result.subscription!.plan,
            currentPeriodEnd: result.subscription!.currentPeriodEnd,
            currentPeriodStart: prev.subscription?.currentPeriodStart || new Date(),
            cancelAtPeriodEnd: false,
            canceledAt: null,
          }
        } : null)
      }

      // Check if there was a sync warning (backend sync failed but plan changed)
      if (result.syncWarning) {
        // Show success with warning
        const warningMessage = result.syncQueued
          ? `Plan changed to ${planName}. Backend sync is queued and will complete shortly.`
          : `Plan changed to ${planName}. Note: Pipeline limits may take a few minutes to update.`
        setPlanChangeSuccess(warningMessage)
        // Also show toast warning for visibility
        toast.warning("Plan changed, but backend sync delayed. Limits will update shortly.")
      } else {
        setPlanChangeSuccess(`Successfully switched to ${planName} plan!`)
      }

      // Clear success message after 5 seconds
      setTimeout(() => setPlanChangeSuccess(null), 5000)

      // Note: We do NOT call fetchBillingData() here because:
      // 1. Local state is already updated from changeSubscriptionPlan result
      // 2. Stripe API may return cached/stale data immediately after update
      // 3. User can refresh page manually if needed to see updated invoices
    } catch (err: unknown) {
      const errorMessage = logError("BillingPage:handleChangePlan", err)
      toast.error(`Failed to change plan: ${errorMessage}`)
    } finally {
      setPlanChangeLoading(null)
    }
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  const formatCurrency = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount)
  }

  const isOwner = userRole === "owner"
  const isCanceledButActive = billingInfo?.subscription?.cancelAtPeriodEnd

  // If user is not owner, show access denied
  if (!isLoadingBilling && userRole && userRole !== "owner") {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Access Denied
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="console-body">
              Only organization owners can access billing settings.
            </p>
            <Link href={`/${orgSlug}/dashboard`}>
              <button className="console-button-primary">Go to Dashboard</button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-6xl">
      {reason === "subscription_required" && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Subscription Required</AlertTitle>
          <AlertDescription>
            Your subscription is not active. Please activate a plan to access your organization dashboard.
          </AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="text-center">
        <h1 className="console-page-title">Billing & Plans</h1>
        <p className="console-subheading mt-2">Manage your subscription and billing information</p>
      </div>

      {/* Current Subscription Status Banner (for existing subscribers) */}
      {hasStripeSubscription && billingInfo?.subscription && (
        <Card className="bg-[#F0FDFA] border-[#007A78]/20">
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-[#007A78]/10 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-[#007A78]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{billingInfo.subscription.plan.name} Plan</span>
                    <span className={isCanceledButActive ? "console-badge console-badge-warning" : "console-badge console-badge-success"}>
                      {isCanceledButActive ? "Cancels at period end" : billingInfo.subscription.status}
                    </span>
                  </div>
                  <p className="console-subheading">
                    ${billingInfo.subscription.plan.price}/{billingInfo.subscription.plan.interval} ·
                    Renews {formatDate(billingInfo.subscription.currentPeriodEnd)}
                  </p>
                </div>
              </div>
              {isOwner && (
                <button onClick={handleManageSubscription} disabled={isPortalLoading} className="console-button-primary inline-flex items-center">
                  {isPortalLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Settings className="h-4 w-4 mr-2" />
                  )}
                  Manage Subscription
                </button>
              )}
            </div>
            {isCanceledButActive && (
              <Alert className="mt-4" variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="console-body">
                  Your subscription will end on <strong>{formatDate(billingInfo.subscription.currentPeriodEnd)}</strong>.
                  Click "Manage Subscription" to resume.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Past Due Payment Warning */}
      {billingStatus === "past_due" && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Payment Past Due</AlertTitle>
          <AlertDescription className="console-body">
            Your last payment failed. Please update your payment method to avoid service interruption.
            {isOwner && (
              <button
                className="console-button-coral ml-4 inline-flex items-center"
                onClick={handleManageSubscription}
                disabled={isPortalLoading}
              >
                Update Payment Method
              </button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Processing Subscription Alert (after checkout) */}
      {searchParams.get("success") === "true" && !hasStripeSubscription && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Processing your subscription...</AlertTitle>
          <AlertDescription>
            Please wait while we confirm your payment. This usually takes a few seconds.
          </AlertDescription>
        </Alert>
      )}

      {/* Trial Banner (for users without subscription) */}
      {!hasStripeSubscription && billingInfo?.trialEndsAt && (() => {
        const daysRemaining = Math.ceil((new Date(billingInfo.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        const isTrialExpired = daysRemaining <= 0
        const isUrgent = daysRemaining <= 7 && daysRemaining > 0
        const isWarning = daysRemaining <= 14 && daysRemaining > 7
        return (
          <Alert variant={isTrialExpired || isUrgent ? "destructive" : undefined} className={isWarning ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950" : ""}>
            <Calendar className="h-4 w-4" />
            <AlertTitle className={isWarning ? "text-yellow-800 dark:text-yellow-200" : ""}>
              {isTrialExpired ? "Trial Expired" : isUrgent ? "Trial Ending Soon!" : "Free Trial"}
              {!isTrialExpired && <span className={isUrgent ? "console-badge console-badge-coral ml-2" : isWarning ? "console-badge console-badge-warning ml-2" : "console-badge ml-2"}>{daysRemaining} days left</span>}
            </AlertTitle>
            <AlertDescription className={isWarning ? "text-yellow-700 dark:text-yellow-300" : ""}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <span>
                  {isTrialExpired ? (
                    <>
                      Your trial has expired. Subscribe now to continue using CloudAct.
                    </>
                  ) : (
                    <>
                      Your trial ends on <strong>{formatDate(billingInfo.trialEndsAt)}</strong>.
                      {isUrgent ? " Subscribe now to avoid losing access!" : " Subscribe to continue using CloudAct."}
                    </>
                  )}
                </span>
                {isOwner && (
                  <button
                    className={isTrialExpired || isUrgent ? "console-button-primary inline-flex items-center" : isWarning ? "console-button-secondary inline-flex items-center border-yellow-600 text-yellow-800 hover:bg-yellow-100 dark:border-yellow-400 dark:text-yellow-200 dark:hover:bg-yellow-900" : "console-button-secondary inline-flex items-center"}
                    onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Subscribe Now
                  </button>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )
      })()}

      {/* Plan Change Success Message */}
      {planChangeSuccess && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <Check className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800 dark:text-green-200">Plan Changed</AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-300">
            {planChangeSuccess}
          </AlertDescription>
        </Alert>
      )}

      {/* Downgrade Limit Error */}
      {downgradeLimitError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Cannot Downgrade</AlertTitle>
          <AlertDescription className="flex items-start justify-between gap-4">
            <span>{downgradeLimitError}</span>
            <button
              onClick={() => setDowngradeLimitError(null)}
              className="shrink-0 h-auto p-1 hover:bg-destructive/20 text-sm"
            >
              Dismiss
            </button>
          </AlertDescription>
        </Alert>
      )}

      {/* Pricing Cards */}
      <div id="pricing">
        <h2 className="console-heading mb-4">
          {hasStripeSubscription ? "Change Plan" : "Choose a Plan"}
        </h2>
        <p className="console-subheading mb-6">
          {hasStripeSubscription
            ? "Upgrade or downgrade your plan instantly. Charges are prorated automatically."
            : `Select a plan to get started.${plans[0]?.trialDays ? ` All plans include a ${plans[0].trialDays}-day free trial.` : ''}`
          }
        </p>
        {billingError && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error Loading Billing Info</AlertTitle>
            <AlertDescription>{billingError}</AlertDescription>
          </Alert>
        )}
        {plansError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error Loading Plans</AlertTitle>
            <AlertDescription>
              {plansError}
              <br />
              <button
                onClick={fetchPlans}
                className="text-sm underline mt-2 hover:no-underline"
              >
                Try again
              </button>
            </AlertDescription>
          </Alert>
        ) : plans.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((plan, index) => {
              // Only show "Current Plan" if user has an active Stripe subscription
              const isCurrentPlan = hasStripeSubscription && currentPlan === plan.id
              const currentPlanIndex = plans.findIndex(p => p.id === currentPlan)

              const isUpgrade = hasStripeSubscription && currentPlan && index > currentPlanIndex
              const isDowngrade = hasStripeSubscription && currentPlan && index < currentPlanIndex

              return (
                <Card
                  key={plan.priceId}
                  className={`flex flex-col console-stat-card ${isCurrentPlan ? "border-[#007A78] shadow-lg relative" : ""}`}
                >
                  {isCurrentPlan && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#007A78] text-white px-3 py-1 rounded-full text-xs font-medium">
                      Current Plan
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle className="console-card-title">{plan.name}</CardTitle>
                    <CardDescription className="console-small">{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="mb-4">
                      <span className="text-3xl font-bold text-[#FF6E50]">${plan.price}</span>
                      <span className="text-sm font-normal text-gray-500">/{plan.interval}</span>
                    </div>
                    {plan.trialDays && !hasStripeSubscription && (
                      <p className="console-small text-[#007A78] mb-4">
                        {plan.trialDays}-day free trial included
                      </p>
                    )}
                    {plan.features.length > 0 ? (
                      <ul className="space-y-2 text-sm">
                        {plan.features.map((feature, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-[#007A78] flex-shrink-0" />
                            <span className="text-gray-600">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="console-small">
                        Contact us for plan details
                      </p>
                    )}
                  </CardContent>
                  <CardFooter className="mt-auto">
                    {isCurrentPlan ? (
                      <button className="console-button-secondary w-full opacity-50 cursor-not-allowed" disabled>
                        Current Plan
                      </button>
                    ) : (
                      <button
                        className={`w-full ${isUpgrade ? "console-button-primary" : "console-button-secondary"}`}
                        onClick={
                          hasStripeSubscription
                            ? () => showPlanChangeConfirmation(plan, !!isUpgrade)
                            : () => handleSubscribe(plan.priceId)
                        }
                        disabled={
                          (hasStripeSubscription
                            ? planChangeLoading !== null
                            : isLoading !== null) || !isOwner
                        }
                      >
                        {(hasStripeSubscription
                          ? planChangeLoading === plan.priceId
                          : isLoading === plan.priceId) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isUpgrade ? (
                          "Upgrade"
                        ) : isDowngrade ? (
                          "Downgrade"
                        ) : (
                          "Get Started"
                        )}
                      </button>
                    )}
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        )}

        {/* Trust Badges */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 mt-8 console-small">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-[#007A78]" />
            <span>Secure payments via Stripe</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-[#007A78]" />
            <span>256-bit SSL encryption</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[#007A78]" />
            <span>GDPR compliant</span>
          </div>
        </div>

        {/* Enterprise pricing + Cancel link - directly below pricing cards */}
        <div className="text-center mt-6 space-y-1">
          <p className="console-small">
            Need enterprise pricing?{" "}
            <a
              href={`mailto:${process.env.NEXT_PUBLIC_MARKETING_EMAIL || "marketing@cloudact.ai"}`}
              className="text-[#007A78] hover:underline"
            >
              Contact {process.env.NEXT_PUBLIC_MARKETING_EMAIL || "marketing@cloudact.ai"}
            </a>
          </p>
          {isOwner && (
            <p className="console-small">
              {hasStripeSubscription && !isCanceledButActive ? (
                <>
                  Want to cancel?{" "}
                  <button
                    onClick={handleManageSubscription}
                    disabled={isPortalLoading}
                    className="text-[#FF6E50]/70 hover:text-[#FF6E50] hover:underline transition-colors"
                  >
                    Cancel via Stripe
                  </button>
                </>
              ) : !hasStripeSubscription ? (
                <>
                  Want to cancel trial?{" "}
                  <a
                    href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@cloudact.ai"}?subject=Cancel Trial Request`}
                    className="text-[#FF6E50]/70 hover:text-[#FF6E50] hover:underline transition-colors"
                  >
                    Contact support
                  </a>
                </>
              ) : null}
            </p>
          )}
        </div>

        {!isOwner && (
          <p className="console-small text-center mt-4">
            Only organization owners can manage billing.
          </p>
        )}
      </div>

      {/* Payment Method Card */}
      {hasStripeSubscription && billingInfo?.paymentMethod && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Method
            </CardTitle>
            <CardDescription>Your default payment method for this subscription</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-16 rounded bg-muted flex items-center justify-center">
                  <span className="text-xs font-semibold uppercase">{billingInfo.paymentMethod.brand}</span>
                </div>
                <div>
                  <p className="font-medium">
                    {billingInfo.paymentMethod.brand.charAt(0).toUpperCase() + billingInfo.paymentMethod.brand.slice(1)} ending in {billingInfo.paymentMethod.last4}
                  </p>
                  <p className="console-small">
                    Expires {billingInfo.paymentMethod.expMonth}/{billingInfo.paymentMethod.expYear}
                    {(() => {
                      // Check if card expires within the next month
                      const now = new Date()
                      const cardExpiry = new Date(billingInfo.paymentMethod.expYear, billingInfo.paymentMethod.expMonth - 1, 1)
                      const isExpiringSoon = cardExpiry <= new Date(now.getFullYear(), now.getMonth() + 1, 1)
                      return isExpiringSoon && (
                        <span className="console-badge console-badge-coral ml-2">Expiring Soon</span>
                      )
                    })()}
                  </p>
                </div>
              </div>
              {isOwner && (
                <button className="console-button-secondary" onClick={handleManageSubscription} disabled={isPortalLoading}>
                  Update
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Invoice History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Invoice History
          </CardTitle>
          <CardDescription>Download your past invoices and receipts</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingBilling ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : billingInfo?.invoices && billingInfo.invoices.length > 0 ? (
            <div className="overflow-x-auto -mx-6 px-6">
              <div className="min-w-[600px] space-y-2">
                <div className="grid grid-cols-5 gap-4 text-sm font-medium text-muted-foreground border-b pb-2 px-2">
                  <span>Invoice</span>
                  <span>Date</span>
                  <span>Amount</span>
                  <span>Status</span>
                  <span className="text-right">Actions</span>
                </div>
                {billingInfo.invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="grid grid-cols-5 gap-4 items-center text-sm py-3 px-2 hover:bg-muted/50 rounded-lg"
                  >
                  <span className="font-medium">{invoice.number || invoice.id.slice(-8)}</span>
                  <span className="text-muted-foreground">{formatDate(invoice.created)}</span>
                  <span>{formatCurrency(invoice.amountPaid, invoice.currency)}</span>
                  <span
                    className={
                      invoice.status === "paid" ? "console-badge console-badge-success" :
                      invoice.status === "open" ? "console-badge console-badge-warning" :
                      (invoice.status === "uncollectible" || invoice.status === "void") ? "console-badge console-badge-coral" :
                      invoice.amountDue > 0 && invoice.status !== "paid" ? "console-badge console-badge-warning" :
                      "console-badge"
                    }
                  >
                    {invoice.status}
                    {invoice.amountDue > 0 && invoice.status !== "paid" && " - " + formatCurrency(invoice.amountDue, invoice.currency) + " due"}
                  </span>
                  <div className="flex justify-end gap-2">
                    {invoice.hostedInvoiceUrl && (
                      <button
                        className="console-button-secondary p-2"
                        onClick={() => window.open(invoice.hostedInvoiceUrl!, "_blank")}
                        aria-label="View invoice"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    )}
                    {invoice.invoicePdf && (
                      <button
                        className="console-button-secondary p-2"
                        onClick={() => window.open(invoice.invoicePdf!, "_blank")}
                        aria-label="Download invoice PDF"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Receipt className="h-12 w-12 mx-auto text-gray-500 mb-2" />
              <p className="console-subheading">No invoices yet</p>
              <p className="console-small">Invoices will appear here once you subscribe</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan Change Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog.isUpgrade ? "Upgrade" : "Downgrade"} to {confirmDialog.plan?.name}?
            </DialogTitle>
            <DialogDescription>
              {confirmDialog.isUpgrade ? (
                <>
                  You're upgrading from <strong>{billingInfo?.subscription?.plan.name}</strong> (${billingInfo?.subscription?.plan.price}/{billingInfo?.subscription?.plan.interval}) to <strong>{confirmDialog.plan?.name}</strong> (${confirmDialog.plan?.price}/{confirmDialog.plan?.interval}).
                  <br /><br />
                  Your card will be charged the prorated difference immediately.
                </>
              ) : (
                <>
                  You're downgrading from <strong>{billingInfo?.subscription?.plan.name}</strong> (${billingInfo?.subscription?.plan.price}/{billingInfo?.subscription?.plan.interval}) to <strong>{confirmDialog.plan?.name}</strong> (${confirmDialog.plan?.price}/{confirmDialog.plan?.interval}).
                  <br /><br />
                  You'll receive a prorated credit on your next invoice.
                  <br /><br />
                  <span className="text-destructive font-medium">Note: Your plan limits will be reduced. Ensure you're within the new plan's limits before downgrading.</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              className="console-button-secondary"
              onClick={() => setConfirmDialog({ open: false, plan: null, isUpgrade: false })}
            >
              Cancel
            </button>
            <button
              className={confirmDialog.isUpgrade ? "console-button-primary" : "console-button-coral"}
              onClick={() => confirmDialog.plan && handleChangePlan(confirmDialog.plan.priceId, confirmDialog.plan.name)}
            >
              {confirmDialog.isUpgrade ? "Confirm Upgrade" : "Confirm Downgrade"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
