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
  AlertCircle,
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
import { formatCurrency as formatCurrencyI18n, DEFAULT_CURRENCY } from "@/lib/i18n"

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
  const [orgCurrency, setOrgCurrency] = useState<string>(DEFAULT_CURRENCY)

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
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center max-w-md">
          <div className="h-16 w-16 rounded-2xl bg-rose-100 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-8 w-8 text-rose-500" />
          </div>
          <h2 className="text-[24px] font-bold text-slate-900 mb-3">Access Denied</h2>
          <p className="text-[15px] text-slate-500 mb-6 leading-relaxed">
            Only organization owners can access billing settings.
          </p>
          <Link href={`/${orgSlug}/dashboard`}>
            <button className="console-button-primary">
              <ArrowRight className="h-4 w-4 mr-2" />
              Go to Dashboard
            </button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {reason === "subscription_required" && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
          <p className="text-[13px] font-medium text-rose-700">
            Your subscription is not active. Please activate a plan to access your organization dashboard.
          </p>
        </div>
      )}

      {/* Header Section */}
      <div className="mb-10">
        <h1 className="text-[32px] font-bold text-slate-900 tracking-tight leading-none">
          Billing & Subscription
        </h1>
        <p className="text-[15px] text-slate-500 mt-2 max-w-lg">
          Manage your subscription plan and billing details
        </p>
      </div>

      {/* Current Subscription Banner */}
      {hasStripeSubscription && billingInfo?.subscription && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-[#007A78]/10 flex items-center justify-center flex-shrink-0">
                  <CreditCard className="h-6 w-6 text-[#007A78]" />
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-[20px] font-bold text-slate-900">{billingInfo.subscription.plan.name} Plan</h2>
                    <span className={isCanceledButActive
                      ? "flex-shrink-0 bg-rose-50 text-rose-600 text-[11px] font-bold px-2.5 py-1 rounded-md border border-rose-200"
                      : "flex-shrink-0 bg-[#007A78]/5 text-[#007A78] text-[11px] font-bold px-2.5 py-1 rounded-md border border-[#007A78]/20"}>
                      {isCanceledButActive ? "Cancels at period end" : billingInfo.subscription.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[13px] text-slate-500">
                    <span className="font-semibold text-slate-900">
                      {formatCurrency(billingInfo.subscription.plan.price, billingInfo.subscription.plan.currency)}
                    </span>
                    <span>/ {billingInfo.subscription.plan.interval}</span>
                    <span className="text-slate-300">•</span>
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Renews {formatDate(billingInfo.subscription.currentPeriodEnd)}</span>
                  </div>
                </div>
              </div>
              {isOwner && (
                <button
                  onClick={handleManageSubscription}
                  disabled={isPortalLoading}
                  className="console-button-secondary whitespace-nowrap"
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
              <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-center gap-3">
                <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
                <p className="text-[13px] font-medium text-rose-700">
                  Your subscription will end on <strong>{formatDate(billingInfo.subscription.currentPeriodEnd)}</strong>.
                  Click "Manage Subscription" to resume.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats Row - Only show for active subscribers */}
      {hasStripeSubscription && billingInfo?.subscription && (
        <div className="flex items-center gap-6 mb-8">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#007A78]/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-[#007A78]" />
            </div>
            <div>
              <p className="text-[24px] font-bold text-slate-900 leading-none">
                {currentMemberCount}
                <span className="text-[16px] text-slate-400 ml-1">
                  / {billingInfo.subscription.plan.metadata?.team_members || '∞'}
                </span>
              </p>
              <p className="text-[12px] text-slate-500 font-medium mt-0.5">Team Members</p>
            </div>
          </div>
          <div className="h-8 w-px bg-slate-200"></div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Zap className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-[24px] font-bold text-slate-900 leading-none">
                {billingInfo.subscription.plan.metadata?.providers || '∞'}
              </p>
              <p className="text-[12px] text-slate-500 font-medium mt-0.5">Integrations</p>
            </div>
          </div>
          <div className="h-8 w-px bg-slate-200"></div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-[24px] font-bold text-slate-900 leading-none capitalize">
                {billingInfo.subscription.plan.interval}
              </p>
              <p className="text-[12px] text-slate-500 font-medium mt-0.5">Billing Cycle</p>
            </div>
          </div>
        </div>
      )}

      {/* Alerts */}
      {billingStatus === "past_due" && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-rose-900 mb-1">Payment Past Due</p>
              <p className="text-[13px] text-rose-700 mb-3">
                Your last payment failed. Please update your payment method to avoid service interruption.
              </p>
              {isOwner && (
                <button
                  className="inline-flex items-center h-9 px-4 bg-rose-600 text-white hover:bg-rose-700 rounded-lg text-[13px] font-medium transition-colors"
                  onClick={handleManageSubscription}
                  disabled={isPortalLoading}
                >
                  Update Payment Method
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {searchParams.get("success") === "true" && !hasStripeSubscription && (
        <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500 flex-shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-blue-900 mb-0.5">Processing your subscription...</p>
            <p className="text-[13px] text-blue-700">
              Please wait while we confirm your payment. This usually takes a few seconds.
            </p>
          </div>
        </div>
      )}

      {!hasStripeSubscription && billingInfo?.trialEndsAt && (() => {
        const daysRemaining = Math.ceil((new Date(billingInfo.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        const isTrialExpired = daysRemaining <= 0
        const isUrgent = daysRemaining <= 7 && daysRemaining > 0
        const isWarning = daysRemaining <= 14 && daysRemaining > 7

        const bgColor = (isTrialExpired || isUrgent) ? "bg-rose-50" : isWarning ? "bg-amber-50" : "bg-blue-50"
        const borderColor = (isTrialExpired || isUrgent) ? "border-rose-200" : isWarning ? "border-amber-200" : "border-blue-200"
        const iconColor = (isTrialExpired || isUrgent) ? "text-rose-500" : isWarning ? "text-amber-500" : "text-blue-500"
        const titleColor = (isTrialExpired || isUrgent) ? "text-rose-900" : isWarning ? "text-amber-900" : "text-blue-900"
        const textColor = (isTrialExpired || isUrgent) ? "text-rose-700" : isWarning ? "text-amber-700" : "text-blue-700"

        return (
          <div className={`mb-6 p-4 rounded-xl ${bgColor} border ${borderColor}`}>
            <div className="flex items-start gap-3">
              <Calendar className={`h-4 w-4 ${iconColor} flex-shrink-0 mt-0.5`} />
              <div className="flex-1">
                <p className={`text-[13px] font-semibold ${titleColor} mb-1`}>
                  {isTrialExpired ? "Trial Expired" : isUrgent ? "Trial Ending Soon!" : "Free Trial"}
                  {!isTrialExpired && <span className="ml-2 text-[11px] px-2 py-0.5 rounded-md bg-white/60">{daysRemaining} days left</span>}
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p className={`text-[13px] ${textColor}`}>
                    {isTrialExpired ? (
                      <>Your trial has expired. Subscribe now to continue using CloudAct.</>
                    ) : (
                      <>
                        Your trial ends on <strong>{formatDate(billingInfo.trialEndsAt)}</strong>.
                        {isUrgent ? " Subscribe now to avoid losing access!" : " Subscribe to continue using CloudAct."}
                      </>
                    )}
                  </p>
                  {isOwner && (
                    <button
                      className="console-button-primary h-9 px-4 text-[13px] whitespace-nowrap"
                      onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                    >
                      <CreditCard className="h-3.5 w-3.5 mr-2" />
                      Subscribe Now
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {planChangeSuccess && (
        <div className="mb-6 p-4 rounded-xl bg-[#007A78]/5 border border-[#007A78]/20 flex items-center gap-3">
          <Check className="h-4 w-4 text-[#007A78] flex-shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-[#005F5D] mb-0.5">Plan Changed Successfully</p>
            <p className="text-[13px] text-[#007A78]">{planChangeSuccess}</p>
          </div>
        </div>
      )}

      {downgradeLimitError && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-rose-900 mb-1">Cannot Downgrade</p>
                <p className="text-[13px] text-rose-700">{downgradeLimitError}</p>
              </div>
            </div>
            <button
              onClick={() => setDowngradeLimitError(null)}
              className="shrink-0 h-auto p-2 hover:bg-rose-100 text-[13px] text-rose-600 hover:text-rose-700 rounded-lg transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Pricing Cards */}
      <div id="pricing" className="space-y-6">
        <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide mb-4">
          {hasStripeSubscription ? "Change Your Plan" : "Choose Your Plan"}
        </h2>
        <p className="text-[15px] text-slate-500 mb-6 max-w-2xl">
          {hasStripeSubscription
            ? "Upgrade or downgrade your plan instantly. All charges are prorated automatically."
            : `Select the perfect plan for your needs.${plans[0]?.trialDays ? ` All plans include a ${plans[0].trialDays}-day free trial.` : ''}`
          }
        </p>

        {billingError && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3">
            <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
            <div>
              <p className="text-[13px] font-semibold text-rose-900 mb-0.5">Error Loading Billing Info</p>
              <p className="text-[13px] text-rose-700">{billingError}</p>
            </div>
          </div>
        )}

        {plansError ? (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-rose-900 mb-1">Error Loading Plans</p>
                <p className="text-[13px] text-rose-700 mb-3">{plansError}</p>
                <button
                  onClick={fetchPlans}
                  className="text-[13px] font-medium text-rose-600 hover:text-rose-700 underline hover:no-underline"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        ) : plans.length === 0 ? (
          <div className="flex items-center justify-center min-h-[500px]">
            <div className="text-center">
              <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
              <p className="text-[14px] text-slate-500 font-medium">Loading plans...</p>
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
                  className={`relative flex flex-col rounded-2xl bg-white border shadow-sm transition-all duration-300 group ${
                    isCurrentPlan
                      ? "border-[#007A78]/20 ring-2 ring-[#007A78]/10"
                      : isPopular
                      ? "border-slate-300 ring-2 ring-slate-100"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {/* Popular Badge */}
                  {isPopular && !isCurrentPlan && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      <div className="bg-[#007A78] text-white px-3 py-1 rounded-md text-[11px] font-bold shadow-sm">
                        MOST POPULAR
                      </div>
                    </div>
                  )}

                  {/* Current Plan Badge */}
                  {isCurrentPlan && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      <div className="bg-[#007A78] text-white px-3 py-1 rounded-md text-[11px] font-bold shadow-sm flex items-center gap-1.5">
                        <Check className="h-3 w-3" />
                        CURRENT PLAN
                      </div>
                    </div>
                  )}

                  <div className="p-6 flex-1 flex flex-col">
                    {/* Plan Header */}
                    <div className="space-y-2 mb-6">
                      <h3 className="text-[20px] font-bold text-slate-900">{plan.name}</h3>
                      <p className="text-[13px] text-slate-500 leading-relaxed">{plan.description}</p>
                    </div>

                    {/* Pricing */}
                    <div className="mb-6">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[36px] font-bold text-slate-900">
                          {formatCurrency(plan.price, orgCurrency)}
                        </span>
                        <span className="text-[14px] font-medium text-slate-500">
                          / {plan.interval}
                        </span>
                      </div>
                      {plan.trialDays && !hasStripeSubscription && (
                        <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 border border-blue-200">
                          <Zap className="h-3 w-3 text-blue-600" />
                          <span className="text-[12px] font-semibold text-blue-700">
                            {plan.trialDays}-day free trial
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Features */}
                    <div className="flex-1 mb-6">
                      {plan.features.length > 0 ? (
                        <ul className="space-y-2.5">
                          {plan.features.map((feature, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-[13px]">
                              <div className="h-4 w-4 rounded-full bg-[#007A78]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <Check className="h-3 w-3 text-[#007A78]" />
                              </div>
                              <span className="text-slate-600 leading-relaxed">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[13px] text-slate-500 italic">
                          Contact us for plan details
                        </p>
                      )}
                    </div>

                    {/* CTA Button */}
                    <div>
                      {isCurrentPlan ? (
                        <button
                          className="h-11 px-6 w-full text-[#007A78] bg-[#007A78]/5 rounded-xl text-[14px] font-semibold border border-[#007A78]/20 cursor-not-allowed"
                          disabled
                        >
                          <Check className="h-4 w-4 mr-2 inline-block" />
                          Current Plan
                        </button>
                      ) : (
                        <button
                          className={`h-11 px-6 w-full rounded-xl text-[14px] font-semibold transition-all duration-200 ${
                            isUpgrade || isPopular
                              ? "console-button-primary"
                              : "console-button-secondary"
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
                            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
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
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mt-8 pt-8 border-t border-slate-200">
          <div className="flex items-center gap-2.5 text-[13px] text-slate-500">
            <CreditCard className="h-4 w-4 text-slate-400" />
            <span className="font-medium">Secure payments via Stripe</span>
          </div>
          <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>
          <div className="flex items-center gap-2.5 text-[13px] text-slate-500">
            <Lock className="h-4 w-4 text-slate-400" />
            <span className="font-medium">256-bit SSL encryption</span>
          </div>
          <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>
          <div className="flex items-center gap-2.5 text-[13px] text-slate-500">
            <Shield className="h-4 w-4 text-slate-400" />
            <span className="font-medium">GDPR compliant</span>
          </div>
        </div>

        {/* Contact & Cancel Links */}
        <div className="text-center space-y-2 pt-4">
          <p className="text-[13px] text-slate-500">
            Need enterprise pricing?{" "}
            <a
              href={`mailto:${process.env.NEXT_PUBLIC_MARKETING_EMAIL || "marketing@cloudact.ai"}`}
              className="text-slate-900 font-semibold hover:text-slate-700 underline transition-colors"
            >
              Contact {process.env.NEXT_PUBLIC_MARKETING_EMAIL || "marketing@cloudact.ai"}
            </a>
          </p>
          {isOwner && (
            <p className="text-[13px] text-slate-500">
              {hasStripeSubscription && !isCanceledButActive ? (
                <>
                  Want to cancel?{" "}
                  <button
                    onClick={handleManageSubscription}
                    disabled={isPortalLoading}
                    className="text-slate-600 hover:text-slate-900 font-medium hover:underline transition-colors"
                  >
                    Cancel via Stripe
                  </button>
                </>
              ) : !hasStripeSubscription ? (
                <>
                  Want to cancel trial?{" "}
                  <a
                    href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@cloudact.ai"}?subject=Cancel Trial Request`}
                    className="text-slate-600 hover:text-slate-900 font-medium hover:underline transition-colors"
                  >
                    Contact support
                  </a>
                </>
              ) : null}
            </p>
          )}
        </div>

        {!isOwner && (
          <p className="text-[13px] text-center text-slate-500 pt-4 italic">
            Only organization owners can manage billing.
          </p>
        )}
      </div>

      {/* Payment Method Card */}
      {hasStripeSubscription && billingInfo?.paymentMethod && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-slate-900">Payment Method</h3>
                <p className="text-[13px] text-slate-500">Your default payment method for this subscription</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-16 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200">
                  <span className="text-[11px] font-bold uppercase text-slate-700">{billingInfo.paymentMethod.brand}</span>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-[14px] text-slate-900">
                    {billingInfo.paymentMethod.brand.charAt(0).toUpperCase() + billingInfo.paymentMethod.brand.slice(1)} ending in {billingInfo.paymentMethod.last4}
                  </p>
                  <p className="text-[13px] text-slate-500 flex items-center gap-2">
                    Expires {billingInfo.paymentMethod.expMonth}/{billingInfo.paymentMethod.expYear}
                    {(() => {
                      const now = new Date()
                      const cardExpiry = new Date(billingInfo.paymentMethod.expYear, billingInfo.paymentMethod.expMonth - 1, 1)
                      const isExpiringSoon = cardExpiry <= new Date(now.getFullYear(), now.getMonth() + 1, 1)
                      return isExpiringSoon && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-semibold border border-amber-200">
                          Expiring Soon
                        </span>
                      )
                    })()}
                  </p>
                </div>
              </div>
              {isOwner && (
                <button
                  className="h-10 px-5 text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-[13px] font-semibold transition-colors"
                  onClick={handleManageSubscription}
                  disabled={isPortalLoading}
                >
                  Update
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invoice History */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide mb-1">Invoice History</h2>
          <p className="text-[13px] text-slate-500">Download your past invoices and receipts</p>
        </div>
        <div className="p-6">
          {isLoadingBilling ? (
            <div className="flex items-center justify-center min-h-[300px]">
              <div className="text-center">
                <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
                <p className="text-[14px] text-slate-500 font-medium">Loading invoices...</p>
              </div>
            </div>
          ) : billingInfo?.invoices && billingInfo.invoices.length > 0 ? (
            <div className="overflow-x-auto -mx-6">
              <div className="min-w-[700px] px-6">
                <div className="grid grid-cols-5 gap-4 pb-3 text-[12px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                  <span>Invoice</span>
                  <span>Date</span>
                  <span>Amount</span>
                  <span>Status</span>
                  <span className="text-right">Actions</span>
                </div>
                <div className="space-y-1">
                  {billingInfo.invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="grid grid-cols-5 gap-4 items-center py-4 rounded-lg hover:bg-slate-50 transition-colors group"
                    >
                      <span className="font-semibold text-[13px] text-slate-900">{invoice.number || invoice.id.slice(-8)}</span>
                      <span className="text-[13px] text-slate-500">{formatDate(invoice.created)}</span>
                      <span className="text-[13px] font-semibold text-slate-900">{formatCurrency(invoice.amountPaid, invoice.currency)}</span>
                      <span
                        className={
                          invoice.status === "paid"
                            ? "bg-[#007A78]/5 text-[#007A78] text-[11px] font-bold px-2.5 py-1 rounded-md inline-flex items-center gap-1 border border-[#007A78]/20 w-fit"
                            : invoice.status === "open"
                            ? "bg-amber-50 text-amber-700 text-[11px] font-bold px-2.5 py-1 rounded-md inline-flex items-center gap-1 border border-amber-200 w-fit"
                            : (invoice.status === "uncollectible" || invoice.status === "void")
                            ? "bg-rose-50 text-rose-700 text-[11px] font-bold px-2.5 py-1 rounded-md inline-flex items-center gap-1 border border-rose-200 w-fit"
                            : invoice.amountDue > 0 && invoice.status !== "paid"
                            ? "bg-rose-50 text-rose-700 text-[11px] font-bold px-2.5 py-1 rounded-md inline-flex items-center gap-1 border border-rose-200 w-fit"
                            : "bg-slate-100 text-slate-600 text-[11px] font-semibold px-2.5 py-1 rounded-md inline-flex items-center gap-1 w-fit"
                        }
                      >
                        {invoice.status === "paid" && <Check className="h-3 w-3" />}
                        {invoice.status}
                        {invoice.amountDue > 0 && invoice.status !== "paid" && " - " + formatCurrency(invoice.amountDue, invoice.currency) + " due"}
                      </span>
                      <div className="flex justify-end gap-2">
                        {invoice.hostedInvoiceUrl && (
                          <button
                            className="h-9 w-9 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 inline-flex items-center justify-center transition-colors"
                            onClick={() => window.open(invoice.hostedInvoiceUrl!, "_blank")}
                            aria-label="View invoice"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                        )}
                        {invoice.invoicePdf && (
                          <button
                            className="h-9 w-9 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 inline-flex items-center justify-center transition-colors"
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
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Receipt className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-[16px] font-bold text-slate-900 mb-2">No invoices yet</h3>
              <p className="text-[13px] text-slate-500">Invoices will appear here once you subscribe to a plan</p>
            </div>
          )}
        </div>
      </div>

      {/* Plan Change Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-[20px] font-bold text-slate-900">
              {confirmDialog.isUpgrade ? "Upgrade" : "Downgrade"} to {confirmDialog.plan?.name}?
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed space-y-3 pt-2 text-slate-600">
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
                  <div className="rounded-lg bg-amber-50 p-3 border border-amber-200">
                    <p className="text-amber-800 font-medium text-[13px]">
                      Note: Your plan limits will be reduced. Ensure you're within the new plan's limits before downgrading.
                    </p>
                  </div>
                  {confirmDialog.plan?.limits && (
                    <div className="space-y-2 text-[13px]">
                      <p className="font-medium text-slate-900">Current usage vs. new plan limits:</p>
                      <ul className="space-y-1">
                        <li className="flex items-center justify-between p-2 rounded bg-slate-50">
                          <span className="text-slate-600">Team Members:</span>
                          <span className={`font-semibold ${
                            currentMemberCount > (confirmDialog.plan?.limits?.teamMembers ?? 0)
                              ? "text-rose-600"
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
              className="console-button-secondary h-10 px-5 text-[13px]"
              onClick={() => setConfirmDialog({ open: false, plan: null, isUpgrade: false })}
            >
              Cancel
            </button>
            <button
              className="console-button-primary h-10 px-5 text-[13px]"
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
