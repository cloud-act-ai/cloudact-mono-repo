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
  TrendingUp,
  Users,
  Zap,
  Crown,
  ArrowRight,
  BarChart3,
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
import { formatCurrency as formatCurrencyI18n } from "@/lib/i18n"

export default function BillingPage() {
  const params = useParams<{ orgSlug: string }>()
  const searchParams = useSearchParams()
  const reason = searchParams.get("reason")

  const [isLoading, setIsLoading] = useState<string | null>(null)
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
  const [orgCurrency, setOrgCurrency] = useState<string>("USD")

  const orgSlug = params.orgSlug

  const fetchBillingData = useCallback(async () => {
    setIsLoadingBilling(true)
    try {
      const supabase = createClient()

      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError) {
        if (authError.message.includes("Refresh Token") || authError.status === 400) {
          window.location.href = `/login?redirectTo=/${orgSlug}/billing&reason=session_expired`
          return
        }
        setBillingError("Authentication error. Please try refreshing the page.")
        return
      }

      if (!user) {
        window.location.href = `/login?redirectTo=/${orgSlug}/billing`
        return
      }

      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("plan, billing_status, stripe_subscription_id, id, created_by, default_currency")
        .eq("org_slug", orgSlug)
        .single()

      if (orgError) {
        return
      }

      if (orgData) {
        setCurrentPlan(orgData.plan)
        setBillingStatus(orgData.billing_status)
        setHasStripeSubscription(!!orgData.stripe_subscription_id)
        if (orgData.default_currency) {
          setOrgCurrency(orgData.default_currency)
        }

        const { count: memberCount } = await supabase
          .from("organization_members")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgData.id)
          .eq("status", "active")

        setCurrentMemberCount(memberCount || 0)

        const { data: membership, error: membershipError } = await supabase
          .from("organization_members")
          .select("role")
          .eq("org_id", orgData.id)
          .eq("user_id", user.id)
          .eq("status", "active")
          .single()

        if (membershipError) {
          // Membership error handled silently
        }

        let role = membership?.role || null

        if (!role && orgData.created_by === user.id) {
          role = "owner"
        }

        setUserRole(role)
      }

      const result = await getBillingInfo(orgSlug)
      if (result.error) {
        logError("BillingPage:fetchBillingData:BillingInfo", result.error)
        setBillingError(result.error)
      } else if (result.data) {
        setBillingInfo(result.data)
        setBillingError(null)
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

      const sortedPlans = result.data.sort((a, b) => a.price - b.price)
      setPlans(sortedPlans)
      setPlansError(null)
    } catch (err: unknown) {
      const errorMessage = logError("BillingPage:fetchPlans", err)
      setPlansError(errorMessage || "Failed to load subscription plans. Please refresh the page or contact support.")
      setPlans([])
    }
  }, [])

  useEffect(() => {
    document.title = "Billing & Subscription | CloudAct.ai"
  }, [])

  useEffect(() => {
    fetchBillingData()
    fetchPlans()
  }, [orgSlug, fetchBillingData, fetchPlans])

  useEffect(() => {
    if (searchParams.get("success") === "true" && !hasStripeSubscription && !isLoadingBilling) {
      let pollCount = 0
      const maxPolls = 10
      const pollInterval = 2000
      let timeoutId: ReturnType<typeof setTimeout> | null = null

      const pollForSubscription = async () => {
        pollCount++
        await fetchBillingData()

        if (pollCount < maxPolls && !hasStripeSubscription) {
          timeoutId = setTimeout(pollForSubscription, pollInterval)
        }
      }

      timeoutId = setTimeout(pollForSubscription, 1000)

      return () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
      }
    }
  }, [searchParams, hasStripeSubscription, isLoadingBilling, fetchBillingData])

  const isValidRedirectUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url)
      const allowedHosts = ["checkout.stripe.com", "billing.stripe.com"]
      return allowedHosts.includes(parsed.hostname)
    } catch {
      return false
    }
  }

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

  const checkDowngradeLimits = async (newPlanLimits: { teamMembers: number; providers: number; pipelinesPerDay: number }) => {
    const supabase = createClient()

    if (currentMemberCount > newPlanLimits.teamMembers) {
      return {
        canDowngrade: false,
        reason: `You have ${currentMemberCount} team members but the new plan only allows ${newPlanLimits.teamMembers}. Please remove ${currentMemberCount - newPlanLimits.teamMembers} member${currentMemberCount - newPlanLimits.teamMembers > 1 ? 's' : ''} before downgrading.`
      }
    }

    try {
      const { data: orgData } = await supabase
        .from("organizations")
        .select("integration_openai_status, integration_anthropic_status, integration_gcp_status")
        .eq("org_slug", orgSlug)
        .single()

      if (orgData) {
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
    } catch {
      // Don't block downgrade on error
    }

    return { canDowngrade: true, reason: null }
  }

  const showPlanChangeConfirmation = async (plan: DynamicPlan, isUpgrade: boolean) => {
    setDowngradeLimitError(null)

    if (!isUpgrade) {
      const limitCheck = await checkDowngradeLimits(plan.limits)

      if (!limitCheck.canDowngrade) {
        setDowngradeLimitError(limitCheck.reason)
        return
      }
    }

    setConfirmDialog({ open: true, plan, isUpgrade })
  }

  const handleChangePlan = async (priceId: string, planName: string) => {
    setConfirmDialog({ open: false, plan: null, isUpgrade: false })
    setPlanChangeLoading(priceId)
    setPlanChangeSuccess(null)
    try {
      const result = await changeSubscriptionPlan(orgSlug, priceId)

      if (!result.success || result.error) {
        throw new Error(result.error || "Failed to change plan")
      }

      if (result.subscription) {
        setCurrentPlan(result.subscription.plan.id)
        setBillingStatus(result.subscription.status)

        setBillingInfo(prev => prev && prev.subscription && result.subscription ? {
          ...prev,
          subscription: {
            ...prev.subscription,
            id: result.subscription.id,
            status: result.subscription.status,
            plan: { ...result.subscription.plan, currency: orgCurrency },
            currentPeriodEnd: result.subscription.currentPeriodEnd,
            currentPeriodStart: prev.subscription.currentPeriodStart || new Date(),
            cancelAtPeriodEnd: false,
            canceledAt: null,
          }
        } : prev)
      }

      if (result.syncWarning) {
        const warningMessage = result.syncQueued
          ? `Plan changed to ${planName}. Backend sync is queued and will complete shortly.`
          : `Plan changed to ${planName}. Note: Pipeline limits may take a few minutes to update.`
        setPlanChangeSuccess(warningMessage)
        toast.warning("Plan changed, but backend sync delayed. Limits will update shortly.")
      } else {
        setPlanChangeSuccess(`Successfully switched to ${planName} plan!`)
      }

      setTimeout(() => setPlanChangeSuccess(null), 5000)
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

  const formatCurrency = (amount: number, currency?: string) => {
    return formatCurrencyI18n(amount, currency || orgCurrency)
  }

  const isOwner = userRole === "owner"
  const isCanceledButActive = billingInfo?.subscription?.cancelAtPeriodEnd

  if (!isLoadingBilling && userRole && userRole !== "owner") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md border-[#FF6E50]/20 shadow-lg hover:shadow-xl transition-shadow duration-300">
          <CardHeader className="text-center pb-3">
            <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-[#FF6E50]/20 to-[#FF6E50]/10 flex items-center justify-center mb-4">
              <AlertTriangle className="h-8 w-8 text-[#FF6E50]" />
            </div>
            <CardTitle className="text-2xl">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              Only organization owners can access billing settings.
            </p>
            <Link href={`/${orgSlug}/dashboard`}>
              <button className="console-button-primary w-full">
                <ArrowRight className="h-4 w-4 mr-2" />
                Go to Dashboard
              </button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {reason === "subscription_required" && (
        <Alert className="border-[#FF6E50]/30 bg-gradient-to-r from-[#FF6E50]/10 to-[#FF6E50]/5 shadow-md">
          <AlertTriangle className="h-5 w-5 text-[#FF6E50]" />
          <AlertTitle className="text-[#FF6E50] font-semibold text-[17px]">Subscription Required</AlertTitle>
          <AlertDescription className="text-[15px] text-[#1C1C1E] mt-1">
            Your subscription is not active. Please activate a plan to access your organization dashboard.
          </AlertDescription>
        </Alert>
      )}

      {/* Hero Header */}
      <div className="text-center space-y-3 pt-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#007A78]/10 to-[#FF6E50]/10 border border-[#007A78]/20">
          <Crown className="h-4 w-4 text-[#007A78]" />
          <span className="text-sm font-semibold text-[#007A78]">Billing & Subscription</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-[#007A78] to-[#005F5D] bg-clip-text text-transparent tracking-tight">
          Manage Your Plan
        </h1>
        <p className="text-[15px] sm:text-[17px] text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Upgrade, downgrade, or manage your subscription anytime. All changes are prorated automatically.
        </p>
      </div>

      {/* Current Subscription Banner */}
      {hasStripeSubscription && billingInfo?.subscription && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#007A78]/5 via-white to-[#FF6E50]/5 border border-[#007A78]/20 shadow-lg hover:shadow-xl transition-all duration-300 group">
          <div className="absolute inset-0 bg-gradient-to-r from-[#007A78]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="relative p-6 sm:p-8">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div className="flex items-start gap-5">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#007A78] to-[#005F5D] flex items-center justify-center flex-shrink-0 shadow-lg">
                  <CreditCard className="h-7 w-7 text-white" />
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-bold text-black">{billingInfo.subscription.plan.name} Plan</h2>
                    <span className={isCanceledButActive
                      ? "flex-shrink-0 bg-[#FF6E50]/15 text-[#FF6E50] text-xs font-bold px-3 py-1.5 rounded-full border border-[#FF6E50]/30"
                      : "flex-shrink-0 bg-gradient-to-r from-[#007A78]/15 to-[#007A78]/10 text-[#007A78] text-xs font-bold px-3 py-1.5 rounded-full border border-[#007A78]/30"}>
                      {isCanceledButActive ? "Cancels at period end" : billingInfo.subscription.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[15px] text-muted-foreground">
                    <span className="font-semibold text-[#007A78]">
                      {formatCurrency(billingInfo.subscription.plan.price, billingInfo.subscription.plan.currency)}
                    </span>
                    <span>/ {billingInfo.subscription.plan.interval}</span>
                    <span className="text-[#007A78]/40">•</span>
                    <Calendar className="h-4 w-4" />
                    <span>Renews {formatDate(billingInfo.subscription.currentPeriodEnd)}</span>
                  </div>
                </div>
              </div>
              {isOwner && (
                <button
                  onClick={handleManageSubscription}
                  disabled={isPortalLoading}
                  className="console-button-secondary whitespace-nowrap shadow-md hover:shadow-lg transition-all duration-300"
                >
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
              <Alert className="mt-6 border-[#FF6E50]/30 bg-[#FF6E50]/5">
                <AlertTriangle className="h-4 w-4 text-[#FF6E50]" />
                <AlertDescription className="text-[15px]">
                  Your subscription will end on <strong>{formatDate(billingInfo.subscription.currentPeriodEnd)}</strong>.
                  Click "Manage Subscription" to resume.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      )}

      {/* Usage Overview Cards - Only show for active subscribers */}
      {hasStripeSubscription && billingInfo?.subscription && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="relative overflow-hidden rounded-xl bg-white border border-[#007A78]/20 p-6 shadow-md hover:shadow-lg transition-all duration-300 group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#007A78]/10 to-transparent rounded-bl-full"></div>
            <div className="relative space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#007A78]/10 to-[#007A78]/5 flex items-center justify-center">
                  <Users className="h-6 w-6 text-[#007A78]" />
                </div>
                <TrendingUp className="h-5 w-5 text-[#007A78]/40 group-hover:text-[#007A78] transition-colors" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-medium">Team Members</p>
                <p className="text-3xl font-bold text-black mt-1">
                  {currentMemberCount}
                  <span className="text-lg text-muted-foreground ml-1">
                    / {billingInfo.subscription.plan.metadata?.team_members || '∞'}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl bg-white border border-[#FF6E50]/20 p-6 shadow-md hover:shadow-lg transition-all duration-300 group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#FF6E50]/10 to-transparent rounded-bl-full"></div>
            <div className="relative space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#FF6E50]/10 to-[#FF6E50]/5 flex items-center justify-center">
                  <Zap className="h-6 w-6 text-[#FF6E50]" />
                </div>
                <BarChart3 className="h-5 w-5 text-[#FF6E50]/40 group-hover:text-[#FF6E50] transition-colors" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-medium">Integrations</p>
                <p className="text-3xl font-bold text-black mt-1">
                  Active
                  <span className="text-lg text-muted-foreground ml-1">
                    / {billingInfo.subscription.plan.metadata?.providers || '∞'}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl bg-white border border-[#007A78]/20 p-6 shadow-md hover:shadow-lg transition-all duration-300 group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#007A78]/10 to-transparent rounded-bl-full"></div>
            <div className="relative space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#007A78]/10 to-[#007A78]/5 flex items-center justify-center">
                  <Calendar className="h-6 w-6 text-[#007A78]" />
                </div>
                <Shield className="h-5 w-5 text-[#007A78]/40 group-hover:text-[#007A78] transition-colors" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-medium">Billing Cycle</p>
                <p className="text-2xl font-bold text-black mt-1 capitalize">
                  {billingInfo.subscription.plan.interval}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alerts */}
      {billingStatus === "past_due" && (
        <Alert className="border-[#FF6E50]/30 bg-gradient-to-r from-[#FF6E50]/10 to-[#FF6E50]/5 shadow-md">
          <AlertTriangle className="h-5 w-5 text-[#FF6E50]" />
          <AlertTitle className="text-[#FF6E50] font-semibold text-[17px]">Payment Past Due</AlertTitle>
          <AlertDescription className="text-[#1C1C1E] mt-2 space-y-3">
            <p>Your last payment failed. Please update your payment method to avoid service interruption.</p>
            {isOwner && (
              <button
                className="inline-flex items-center h-11 px-6 bg-[#FF6E50] text-white hover:bg-[#E55A3C] rounded-xl text-[15px] font-semibold shadow-md hover:shadow-lg transition-all duration-300"
                onClick={handleManageSubscription}
                disabled={isPortalLoading}
              >
                Update Payment Method
              </button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {searchParams.get("success") === "true" && !hasStripeSubscription && (
        <Alert className="border-[#007A78]/30 bg-gradient-to-r from-[#007A78]/10 to-[#007A78]/5 shadow-md">
          <Loader2 className="h-5 w-5 animate-spin text-[#007A78]" />
          <AlertTitle className="text-[#007A78] font-semibold text-[17px]">Processing your subscription...</AlertTitle>
          <AlertDescription className="text-[15px] mt-1">
            Please wait while we confirm your payment. This usually takes a few seconds.
          </AlertDescription>
        </Alert>
      )}

      {!hasStripeSubscription && billingInfo?.trialEndsAt && (() => {
        const daysRemaining = Math.ceil((new Date(billingInfo.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        const isTrialExpired = daysRemaining <= 0
        const isUrgent = daysRemaining <= 7 && daysRemaining > 0
        const isWarning = daysRemaining <= 14 && daysRemaining > 7
        return (
          <Alert className={isTrialExpired || isUrgent ? "border-[#FF6E50]/30 bg-gradient-to-r from-[#FF6E50]/10 to-[#FF6E50]/5 shadow-md" : isWarning ? "border-[#FF6E50]/30 bg-gradient-to-r from-[#FF6E50]/10 to-[#FF6E50]/5 shadow-md" : "border-[#007A78]/30 bg-gradient-to-r from-[#007A78]/10 to-[#007A78]/5 shadow-md"}>
            <Calendar className="h-5 w-5" />
            <AlertTitle className={isWarning ? "text-[#FF6E50] font-semibold text-[17px]" : "font-semibold text-[17px]"}>
              {isTrialExpired ? "Trial Expired" : isUrgent ? "Trial Ending Soon!" : "Free Trial"}
              {!isTrialExpired && <span className={isUrgent ? "console-badge console-badge-coral ml-2" : isWarning ? "console-badge console-badge-coral ml-2" : "console-badge ml-2"}>{daysRemaining} days left</span>}
            </AlertTitle>
            <AlertDescription className={isWarning ? "text-[#FF6E50] mt-2" : "mt-2"}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <span className="text-[15px]">
                  {isTrialExpired ? (
                    <>Your trial has expired. Subscribe now to continue using CloudAct.</>
                  ) : (
                    <>
                      Your trial ends on <strong>{formatDate(billingInfo.trialEndsAt)}</strong>.
                      {isUrgent ? " Subscribe now to avoid losing access!" : " Subscribe to continue using CloudAct."}
                    </>
                  )}
                </span>
                {isOwner && (
                  <button
                    className={isTrialExpired || isUrgent ? "console-button-primary whitespace-nowrap shadow-md" : isWarning ? "inline-flex items-center h-11 px-6 text-[15px] font-semibold text-[#FF6E50] border-2 border-[#FF6E50] rounded-xl hover:bg-[#FF6E50]/10 shadow-md whitespace-nowrap" : "console-button-secondary whitespace-nowrap shadow-md"}
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

      {planChangeSuccess && (
        <Alert className="border-[#007A78]/30 bg-gradient-to-r from-[#007A78]/10 to-[#007A78]/5 shadow-md">
          <Check className="h-5 w-5 text-[#007A78]" />
          <AlertTitle className="text-[#007A78] font-semibold text-[17px]">Plan Changed Successfully</AlertTitle>
          <AlertDescription className="text-[#005F5D] text-[15px] mt-1">
            {planChangeSuccess}
          </AlertDescription>
        </Alert>
      )}

      {downgradeLimitError && (
        <Alert className="border-[#FF6E50]/30 bg-gradient-to-r from-[#FF6E50]/10 to-[#FF6E50]/5 shadow-md">
          <AlertTriangle className="h-5 w-5 text-[#FF6E50]" />
          <AlertTitle className="text-[#FF6E50] font-semibold text-[17px]">Cannot Downgrade</AlertTitle>
          <AlertDescription className="flex items-start justify-between gap-4 text-[15px] mt-2">
            <span>{downgradeLimitError}</span>
            <button
              onClick={() => setDowngradeLimitError(null)}
              className="shrink-0 h-auto p-2 hover:bg-[#FF6E50]/10 text-sm text-muted-foreground hover:text-[#FF6E50] rounded-lg transition-colors"
            >
              Dismiss
            </button>
          </AlertDescription>
        </Alert>
      )}

      {/* Pricing Cards */}
      <div id="pricing" className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-black">
            {hasStripeSubscription ? "Change Your Plan" : "Choose Your Plan"}
          </h2>
          <p className="text-[15px] text-muted-foreground max-w-2xl mx-auto">
            {hasStripeSubscription
              ? "Upgrade or downgrade your plan instantly. All charges are prorated automatically."
              : `Select the perfect plan for your needs.${plans[0]?.trialDays ? ` All plans include a ${plans[0].trialDays}-day free trial.` : ''}`
            }
          </p>
        </div>

        {billingError && (
          <Alert className="border-[#FF6E50]/30 bg-gradient-to-r from-[#FF6E50]/10 to-[#FF6E50]/5 shadow-md">
            <AlertTriangle className="h-5 w-5 text-[#FF6E50]" />
            <AlertTitle className="text-[#FF6E50] font-semibold text-[17px]">Error Loading Billing Info</AlertTitle>
            <AlertDescription className="text-[15px] mt-1">{billingError}</AlertDescription>
          </Alert>
        )}

        {plansError ? (
          <Alert className="border-[#FF6E50]/30 bg-gradient-to-r from-[#FF6E50]/10 to-[#FF6E50]/5 shadow-md">
            <AlertTriangle className="h-5 w-5 text-[#FF6E50]" />
            <AlertTitle className="text-[#FF6E50] font-semibold text-[17px]">Error Loading Plans</AlertTitle>
            <AlertDescription className="text-[15px] mt-2 space-y-3">
              <p>{plansError}</p>
              <button
                onClick={fetchPlans}
                className="text-sm font-semibold underline hover:no-underline text-[#FF6E50]"
              >
                Try again
              </button>
            </AlertDescription>
          </Alert>
        ) : plans.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-[#007A78] mx-auto" />
              <p className="text-muted-foreground">Loading plans...</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((plan, index) => {
              const isCurrentPlan = hasStripeSubscription && currentPlan === plan.id
              const currentPlanIndex = plans.findIndex(p => p.id === currentPlan)
              const isUpgrade = hasStripeSubscription && currentPlan && index > currentPlanIndex
              const isDowngrade = hasStripeSubscription && currentPlan && index < currentPlanIndex
              const isPopular = index === 1 // Middle plan is popular

              return (
                <div
                  key={plan.priceId}
                  className={`relative flex flex-col rounded-2xl bg-white border-2 shadow-lg hover:shadow-2xl transition-all duration-300 group ${
                    isCurrentPlan
                      ? "border-[#007A78] shadow-[#007A78]/20 scale-105"
                      : isPopular
                      ? "border-[#FF6E50] shadow-[#FF6E50]/20 scale-105"
                      : "border-[#007A78]/20 hover:border-[#007A78]/40"
                  }`}
                >
                  {/* Popular Badge */}
                  {isPopular && !isCurrentPlan && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                      <div className="bg-gradient-to-r from-[#FF6E50] to-[#E55A3C] text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-lg border-2 border-white">
                        MOST POPULAR
                      </div>
                    </div>
                  )}

                  {/* Current Plan Badge */}
                  {isCurrentPlan && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                      <div className="bg-gradient-to-r from-[#007A78] to-[#005F5D] text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-lg border-2 border-white flex items-center gap-1.5">
                        <Crown className="h-3.5 w-3.5" />
                        CURRENT PLAN
                      </div>
                    </div>
                  )}

                  <div className="p-8 flex-1 flex flex-col">
                    {/* Plan Header */}
                    <div className="space-y-4 mb-6">
                      <h3 className="text-2xl font-bold text-black">{plan.name}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{plan.description}</p>
                    </div>

                    {/* Pricing */}
                    <div className="mb-6">
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-[#FF6E50] to-[#E55A3C] bg-clip-text text-transparent">
                          {formatCurrency(plan.price, orgCurrency)}
                        </span>
                        <span className="text-[15px] font-medium text-muted-foreground">
                          / {plan.interval}
                        </span>
                      </div>
                      {plan.trialDays && !hasStripeSubscription && (
                        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FF6E50]/10 border border-[#FF6E50]/30">
                          <Zap className="h-3.5 w-3.5 text-[#FF6E50]" />
                          <span className="text-sm font-semibold text-[#FF6E50]">
                            {plan.trialDays}-day free trial
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Features */}
                    <div className="flex-1 mb-8">
                      {plan.features.length > 0 ? (
                        <ul className="space-y-3">
                          {plan.features.map((feature, i) => (
                            <li key={i} className="flex items-start gap-3 text-[15px] group/item">
                              <div className="h-5 w-5 rounded-full bg-gradient-to-br from-[#007A78]/20 to-[#007A78]/10 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover/item:from-[#007A78]/30 group-hover/item:to-[#007A78]/20 transition-all">
                                <Check className="h-3.5 w-3.5 text-[#007A78]" />
                              </div>
                              <span className="text-[#3C3C43] leading-relaxed">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          Contact us for plan details
                        </p>
                      )}
                    </div>

                    {/* CTA Button */}
                    <div>
                      {isCurrentPlan ? (
                        <button
                          className="h-12 px-6 w-full text-[#007A78] bg-[#007A78]/10 rounded-xl text-[15px] font-semibold border-2 border-[#007A78]/30 cursor-not-allowed"
                          disabled
                        >
                          <Crown className="h-4 w-4 mr-2 inline-block" />
                          Current Plan
                        </button>
                      ) : (
                        <button
                          className={`h-12 px-6 w-full rounded-xl text-[15px] font-semibold shadow-md hover:shadow-lg transition-all duration-300 ${
                            isUpgrade || isPopular
                              ? "bg-gradient-to-r from-[#FF6E50] to-[#E55A3C] text-white hover:from-[#E55A3C] hover:to-[#D54E32]"
                              : "bg-white text-[#007A78] border-2 border-[#007A78] hover:bg-[#007A78]/5"
                          }`}
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
                            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                          ) : (
                            <span className="flex items-center justify-center gap-2">
                              {isUpgrade ? (
                                <>Upgrade Now <ArrowRight className="h-4 w-4" /></>
                              ) : isDowngrade ? (
                                "Downgrade"
                              ) : (
                                <>Get Started <ArrowRight className="h-4 w-4" /></>
                              )}
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Trust Badges */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10 mt-10 pt-8 border-t border-border">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#007A78]/10 to-[#007A78]/5 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-[#007A78]" />
            </div>
            <span className="font-medium">Secure payments via Stripe</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#007A78]/10 to-[#007A78]/5 flex items-center justify-center">
              <Lock className="h-5 w-5 text-[#007A78]" />
            </div>
            <span className="font-medium">256-bit SSL encryption</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#007A78]/10 to-[#007A78]/5 flex items-center justify-center">
              <Shield className="h-5 w-5 text-[#007A78]" />
            </div>
            <span className="font-medium">GDPR compliant</span>
          </div>
        </div>

        {/* Contact & Cancel Links */}
        <div className="text-center space-y-2 pt-4">
          <p className="text-sm text-muted-foreground">
            Need enterprise pricing?{" "}
            <a
              href={`mailto:${process.env.NEXT_PUBLIC_MARKETING_EMAIL || "marketing@cloudact.ai"}`}
              className="text-[#FF6E50] hover:text-[#E55A3C] font-semibold hover:underline transition-colors"
            >
              Contact {process.env.NEXT_PUBLIC_MARKETING_EMAIL || "marketing@cloudact.ai"}
            </a>
          </p>
          {isOwner && (
            <p className="text-sm text-muted-foreground">
              {hasStripeSubscription && !isCanceledButActive ? (
                <>
                  Want to cancel?{" "}
                  <button
                    onClick={handleManageSubscription}
                    disabled={isPortalLoading}
                    className="text-[#FF6E50]/80 hover:text-[#FF6E50] font-medium hover:underline transition-colors"
                  >
                    Cancel via Stripe
                  </button>
                </>
              ) : !hasStripeSubscription ? (
                <>
                  Want to cancel trial?{" "}
                  <a
                    href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@cloudact.ai"}?subject=Cancel Trial Request`}
                    className="text-[#FF6E50]/80 hover:text-[#FF6E50] font-medium hover:underline transition-colors"
                  >
                    Contact support
                  </a>
                </>
              ) : null}
            </p>
          )}
        </div>

        {!isOwner && (
          <p className="text-sm text-center text-muted-foreground pt-4 italic">
            Only organization owners can manage billing.
          </p>
        )}
      </div>

      {/* Payment Method Card */}
      {hasStripeSubscription && billingInfo?.paymentMethod && (
        <Card className="border-2 border-[#007A78]/20 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#007A78]/5 to-transparent rounded-bl-full"></div>
          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-3 text-xl">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#007A78]/10 to-[#007A78]/5 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-[#007A78]" />
              </div>
              Payment Method
            </CardTitle>
            <CardDescription className="text-[15px]">Your default payment method for this subscription</CardDescription>
          </CardHeader>
          <CardContent className="relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-5">
                <div className="h-14 w-20 rounded-lg bg-gradient-to-br from-[#007A78]/10 to-[#007A78]/5 flex items-center justify-center border border-[#007A78]/20 shadow-sm">
                  <span className="text-sm font-bold uppercase text-[#007A78]">{billingInfo.paymentMethod.brand}</span>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-[15px] text-black">
                    {billingInfo.paymentMethod.brand.charAt(0).toUpperCase() + billingInfo.paymentMethod.brand.slice(1)} ending in {billingInfo.paymentMethod.last4}
                  </p>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    Expires {billingInfo.paymentMethod.expMonth}/{billingInfo.paymentMethod.expYear}
                    {(() => {
                      const now = new Date()
                      const cardExpiry = new Date(billingInfo.paymentMethod.expYear, billingInfo.paymentMethod.expMonth - 1, 1)
                      const isExpiringSoon = cardExpiry <= new Date(now.getFullYear(), now.getMonth() + 1, 1)
                      return isExpiringSoon && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF6E50]/10 text-[#FF6E50] text-xs font-semibold border border-[#FF6E50]/30">
                          Expiring Soon
                        </span>
                      )
                    })()}
                  </p>
                </div>
              </div>
              {isOwner && (
                <button
                  className="h-11 px-6 text-[#FF6E50] bg-white border-2 border-[#FF6E50] hover:bg-[#FF6E50]/5 rounded-xl text-[15px] font-semibold shadow-md hover:shadow-lg transition-all duration-300"
                  onClick={handleManageSubscription}
                  disabled={isPortalLoading}
                >
                  Update
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Separator className="my-8" />

      {/* Invoice History */}
      <div className="rounded-2xl bg-white border-2 border-[#007A78]/20 shadow-lg overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-border bg-gradient-to-r from-[#007A78]/5 to-transparent">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#007A78]/10 to-[#007A78]/5 flex items-center justify-center">
              <Receipt className="h-5 w-5 text-[#007A78]" />
            </div>
            <h3 className="text-xl font-bold text-black">Invoice History</h3>
          </div>
          <p className="text-sm text-muted-foreground ml-13">Download your past invoices and receipts</p>
        </div>
        <div className="p-6 sm:p-8">
          {isLoadingBilling ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-[#007A78] mx-auto" />
                <p className="text-sm text-muted-foreground">Loading invoices...</p>
              </div>
            </div>
          ) : billingInfo?.invoices && billingInfo.invoices.length > 0 ? (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="min-w-[700px] space-y-2">
                <div className="grid grid-cols-5 gap-4 px-4 py-3 text-sm font-semibold text-muted-foreground border-b-2 border-[#007A78]/10">
                  <span>Invoice</span>
                  <span>Date</span>
                  <span>Amount</span>
                  <span>Status</span>
                  <span className="text-right">Actions</span>
                </div>
                {billingInfo.invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="grid grid-cols-5 gap-4 items-center px-4 py-4 rounded-xl border border-transparent hover:border-[#007A78]/20 hover:bg-[#007A78]/5 transition-all duration-200 group"
                  >
                    <span className="font-semibold text-[15px] text-black">{invoice.number || invoice.id.slice(-8)}</span>
                    <span className="text-[15px] text-muted-foreground">{formatDate(invoice.created)}</span>
                    <span className="text-[15px] font-semibold text-black">{formatCurrency(invoice.amountPaid, invoice.currency)}</span>
                    <span
                      className={
                        invoice.status === "paid"
                          ? "bg-gradient-to-r from-[#007A78]/15 to-[#007A78]/10 text-[#007A78] text-xs font-bold px-3 py-1.5 rounded-full inline-flex items-center gap-1 border border-[#007A78]/20"
                          : invoice.status === "open"
                          ? "bg-gradient-to-r from-[#FF6E50]/15 to-[#FF6E50]/10 text-[#FF6E50] text-xs font-bold px-3 py-1.5 rounded-full inline-flex items-center gap-1 border border-[#FF6E50]/20"
                          : (invoice.status === "uncollectible" || invoice.status === "void")
                          ? "bg-gradient-to-r from-[#FF6E50]/15 to-[#FF6E50]/10 text-[#E55A3C] text-xs font-bold px-3 py-1.5 rounded-full inline-flex items-center gap-1 border border-[#FF6E50]/20"
                          : invoice.amountDue > 0 && invoice.status !== "paid"
                          ? "bg-gradient-to-r from-[#FF6E50]/15 to-[#FF6E50]/10 text-[#FF6E50] text-xs font-bold px-3 py-1.5 rounded-full inline-flex items-center gap-1 border border-[#FF6E50]/20"
                          : "bg-[#007A78]/10 text-muted-foreground text-xs font-semibold px-3 py-1.5 rounded-full inline-flex items-center gap-1"
                      }
                    >
                      {invoice.status === "paid" && <Check className="h-3 w-3" />}
                      {invoice.status}
                      {invoice.amountDue > 0 && invoice.status !== "paid" && " - " + formatCurrency(invoice.amountDue, invoice.currency) + " due"}
                    </span>
                    <div className="flex justify-end gap-2">
                      {invoice.hostedInvoiceUrl && (
                        <button
                          className="h-10 w-10 rounded-xl hover:bg-[#FF6E50]/10 text-[#FF6E50] inline-flex items-center justify-center transition-all duration-200 border border-transparent hover:border-[#FF6E50]/30"
                          onClick={() => window.open(invoice.hostedInvoiceUrl!, "_blank")}
                          aria-label="View invoice"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      )}
                      {invoice.invoicePdf && (
                        <button
                          className="h-10 w-10 rounded-xl hover:bg-[#FF6E50]/10 text-[#FF6E50] inline-flex items-center justify-center transition-all duration-200 border border-transparent hover:border-[#FF6E50]/30"
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
            <div className="text-center py-16">
              <div className="inline-flex p-6 rounded-2xl bg-gradient-to-br from-[#007A78]/10 to-[#007A78]/5 mb-6 border border-[#007A78]/20">
                <Receipt className="h-16 w-16 text-[#007A78]" />
              </div>
              <h3 className="text-xl font-bold text-black mb-2">No invoices yet</h3>
              <p className="text-[15px] text-muted-foreground">Invoices will appear here once you subscribe to a plan</p>
            </div>
          )}
        </div>
      </div>

      {/* Plan Change Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {confirmDialog.isUpgrade ? "Upgrade" : "Downgrade"} to {confirmDialog.plan?.name}?
            </DialogTitle>
            <DialogDescription className="text-[15px] leading-relaxed space-y-3 pt-2">
              {confirmDialog.isUpgrade ? (
                <>
                  <p>
                    You're upgrading from <strong>{billingInfo?.subscription?.plan.name}</strong> ({formatCurrency(billingInfo?.subscription?.plan.price ?? 0, billingInfo?.subscription?.plan.currency || "USD")}/{billingInfo?.subscription?.plan.interval}) to <strong>{confirmDialog.plan?.name}</strong> ({formatCurrency(confirmDialog.plan?.price ?? 0, confirmDialog.plan?.currency || "USD")}/{confirmDialog.plan?.interval}).
                  </p>
                  <p className="text-[#007A78] font-medium">
                    Your card will be charged the prorated difference immediately.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    You're downgrading from <strong>{billingInfo?.subscription?.plan.name}</strong> ({formatCurrency(billingInfo?.subscription?.plan.price ?? 0, billingInfo?.subscription?.plan.currency || "USD")}/{billingInfo?.subscription?.plan.interval}) to <strong>{confirmDialog.plan?.name}</strong> ({formatCurrency(confirmDialog.plan?.price ?? 0, confirmDialog.plan?.currency || "USD")}/{confirmDialog.plan?.interval}).
                  </p>
                  <p className="text-[#007A78] font-medium">
                    You'll receive a prorated credit on your next invoice.
                  </p>
                  <div className="rounded-lg bg-[#FF6E50]/10 p-4 border border-[#FF6E50]/30">
                    <p className="text-[#FF6E50] font-semibold text-sm">
                      Note: Your plan limits will be reduced. Ensure you're within the new plan's limits before downgrading.
                    </p>
                  </div>
                  {confirmDialog.plan?.limits && (
                    <div className="space-y-2 text-sm">
                      <p className="font-medium">Current usage vs. new plan limits:</p>
                      <ul className="space-y-1">
                        <li className="flex items-center justify-between p-2 rounded bg-muted/50">
                          <span className="text-muted-foreground">Team Members:</span>
                          <span className={`font-semibold ${
                            currentMemberCount > (confirmDialog.plan?.limits?.teamMembers ?? 0)
                              ? "text-[#FF6E50]"
                              : "text-[#007A78]"
                          }`}>
                            {currentMemberCount} / {confirmDialog.plan?.limits?.teamMembers ?? 0}
                          </span>
                        </li>
                      </ul>
                    </div>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-3 sm:gap-2">
            <button
              className="console-button-secondary"
              onClick={() => setConfirmDialog({ open: false, plan: null, isUpgrade: false })}
            >
              Cancel
            </button>
            <button
              className={confirmDialog.isUpgrade ? "console-button-primary" : "h-11 px-6 text-[15px] font-semibold text-white bg-[#FF6E50] hover:bg-[#E55A3C] rounded-xl shadow-md hover:shadow-lg transition-all duration-300"}
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
