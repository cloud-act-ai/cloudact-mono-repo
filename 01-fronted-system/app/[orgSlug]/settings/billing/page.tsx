"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  CreditCard,
  Receipt,
  TrendingUp,
  Calendar,
  ExternalLink,
  Check,
  AlertCircle,
  Sparkles,
  Zap,
  Building2,
  Loader2,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"

// Premium components - same as dashboard/pipeline pages
import { StatRow } from "@/components/ui/stat-row"
import { PremiumCard, SectionHeader } from "@/components/ui/premium-card"
import { LoadingState } from "@/components/ui/loading-state"

// STATE-001 FIX: Import billing actions to fetch actual payment method
import { getBillingInfo, createBillingPortalSession, type BillingInfo } from "@/actions/stripe"

interface OrgData {
  id: string
  name: string
  slug: string
  plan: string
  billing_status: string
  seat_limit: number
  stripe_customer_id?: string
  stripe_subscription_id?: string
}

// Plan features for display - matches Stripe product metadata plan_id values
const PLAN_FEATURES: Record<string, { name: string; color: string; icon: React.ReactNode; features: string[] }> = {
  starter: {
    name: "Starter",
    color: "#007AFF",
    icon: <Zap className="h-5 w-5" />,
    features: ["Up to 5 team members", "3 integrations", "10 pipeline runs/day", "Email support"],
  },
  professional: {
    name: "Professional",
    color: "#90FCA6",
    icon: <TrendingUp className="h-5 w-5" />,
    features: ["Up to 20 team members", "10 integrations", "50 pipeline runs/day", "Priority support"],
  },
  scale: {
    name: "Scale",
    color: "#8B5CF6",
    icon: <Building2 className="h-5 w-5" />,
    features: ["Up to 100 team members", "Unlimited integrations", "Unlimited pipelines", "Dedicated support"],
  },
}

// Fallback for unknown plans
const DEFAULT_PLAN = {
  name: "Unknown",
  color: "#64748B",
  icon: <Sparkles className="h-5 w-5" />,
  features: ["Contact support for plan details"],
}

export default function BillingPage() {
  const params = useParams<{ orgSlug: string }>()
  const orgSlug = params.orgSlug
  const router = useRouter()

  const [isLoading, setIsLoading] = useState(true)
  const [orgData, setOrgData] = useState<OrgData | null>(null)
  const [error, setError] = useState<string | null>(null)
  // STATE-001 FIX: Add state for billing info (payment method, invoices)
  const [billingInfo, setBillingInfo] = useState<BillingInfo | null>(null)
  // STATE-003 FIX: Add state for portal redirect loading
  const [isRedirectingToPortal, setIsRedirectingToPortal] = useState(false)

  useEffect(() => {
    document.title = `Billing | ${orgSlug}`
  }, [orgSlug])

  const fetchOrgData = useCallback(async () => {
    try {
      setIsLoading(true)
      const supabase = createClient()

      // STATE-002 FIX: Select only needed columns instead of "*"
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("id, org_name, org_slug, plan, billing_status, seat_limit, stripe_customer_id, stripe_subscription_id")
        .eq("org_slug", orgSlug)
        .single()

      if (orgError) throw orgError

      setOrgData({
        id: org.id,
        name: org.org_name,
        slug: org.org_slug,
        plan: org.plan,
        billing_status: org.billing_status,
        seat_limit: org.seat_limit,
        stripe_customer_id: org.stripe_customer_id,
        stripe_subscription_id: org.stripe_subscription_id,
      })

      // STATE-001 FIX: Fetch billing info from Stripe (payment method, invoices)
      const billingResult = await getBillingInfo(orgSlug)
      if (billingResult.data) {
        setBillingInfo(billingResult.data)
      }
    } catch (fetchError) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[BillingPage] Failed to fetch org data:", fetchError)
      }
      setError("Failed to load billing data")
    } finally {
      setIsLoading(false)
    }
  }, [orgSlug])

  useEffect(() => {
    void fetchOrgData()
  }, [fetchOrgData])

  // STATE-003 FIX: Handler for opening Stripe billing portal
  const handleOpenBillingPortal = async () => {
    if (isRedirectingToPortal) return
    setIsRedirectingToPortal(true)
    try {
      const result = await createBillingPortalSession(orgSlug)
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.url) {
        router.push(result.url)
      }
    } catch {
      setError("Failed to open billing portal")
    } finally {
      setIsRedirectingToPortal(false)
    }
  }

  // Stats for StatRow component - same pattern as dashboard/pipelines
  const currentPlan = orgData?.plan || "starter"
  const planInfo = PLAN_FEATURES[currentPlan] || DEFAULT_PLAN
  const billingStatus = orgData?.billing_status || "active"

  const stats = [
    { icon: CreditCard, value: planInfo.name, label: "Current Plan", color: "mint" as const },
    { icon: Check, value: billingStatus.charAt(0).toUpperCase() + billingStatus.slice(1), label: "Status", color: billingStatus === "active" ? "mint" as const : "coral" as const },
    { icon: Calendar, value: "Monthly", label: "Billing Cycle", color: "slate" as const },
  ]

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 lg:space-y-8">
        {/* Header - Same pattern as dashboard */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] flex items-center justify-center flex-shrink-0 shadow-sm">
              <CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-[#1a7a3a]" />
            </div>
            <div>
              <h1 className="text-[20px] sm:text-[24px] lg:text-[28px] font-bold text-[var(--text-primary)] tracking-tight leading-tight">
                Billing & Subscription
              </h1>
              <p className="text-[12px] sm:text-[13px] text-[var(--text-tertiary)] mt-1 sm:mt-2 max-w-lg">
                Manage your subscription plan and payment methods
              </p>
            </div>
          </div>
        </div>
        <LoadingState message="Loading billing information..." />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Header - Same pattern as dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] flex items-center justify-center flex-shrink-0 shadow-sm">
            <CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-[#1a7a3a]" />
          </div>
          <div>
            <h1 className="text-[20px] sm:text-[24px] lg:text-[28px] font-bold text-[var(--text-primary)] tracking-tight leading-tight">
              Billing & Subscription
            </h1>
            <p className="text-[12px] sm:text-[13px] text-[var(--text-tertiary)] mt-1 sm:mt-2 max-w-lg">
              Manage your subscription plan and payment methods
            </p>
          </div>
        </div>
      </div>

      {/* Stats Row - Using StatRow component like pipelines */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-[var(--border-subtle)] p-3 sm:p-5 shadow-sm">
        <StatRow stats={stats} size="md" />
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
          <p className="text-[12px] font-medium text-rose-700">{error}</p>
        </div>
      )}

      {/* Current Plan Card */}
      <div className="space-y-4 sm:space-y-6">
        <SectionHeader title="Current Plan" icon={CreditCard} />

        <PremiumCard hover={true}>
          <div>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="flex items-start gap-4">
                <div
                  className="h-14 w-14 rounded-2xl flex items-center justify-center shadow-sm"
                  style={{ backgroundColor: planInfo.color, color: currentPlan === "professional" ? "#000" : "#fff" }}
                >
                  {planInfo.icon}
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-[16px] font-bold text-[var(--text-primary)]">{planInfo.name} Plan</h3>
                    <Badge
                      className="text-[11px] font-semibold px-3 py-1 rounded-lg border-0"
                      style={{ backgroundColor: `${planInfo.color}15`, color: currentPlan === "professional" ? "#1a7a3a" : planInfo.color }}
                    >
                      Current
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {planInfo.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
                        <Check className="h-3.5 w-3.5 text-[#1a7a3a]" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link href={`/${orgSlug}/settings/billing/plans`}>
                  <button className="h-11 px-6 text-[12px] font-semibold bg-[#90FCA6] hover:bg-[#6EE890] text-[var(--text-primary)] rounded-xl transition-all shadow-sm hover:shadow-md flex items-center gap-2 w-full sm:w-auto justify-center">
                    <TrendingUp className="h-4 w-4" />
                    Upgrade Plan
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </PremiumCard>
      </div>

      {/* Payment Method - STATE-001 FIX: Show actual payment method from Stripe */}
      <div className="space-y-4 sm:space-y-6">
        <SectionHeader title="Payment Method" icon={CreditCard} />

        <PremiumCard hover={false}>
          <div className="group relative">
            <div className="absolute left-0 top-4 bottom-4 w-1 rounded-full bg-[var(--border-medium)] opacity-60 group-hover:opacity-100 transition-opacity" />
            <div className="pl-5 py-5 pr-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className="h-11 w-11 rounded-xl bg-[var(--surface-secondary)] flex items-center justify-center flex-shrink-0">
                  <CreditCard className="h-5 w-5 text-[var(--text-tertiary)]" />
                </div>
                <div className="min-w-0 flex-1">
                  {billingInfo?.paymentMethod ? (
                    <>
                      <h3 className="text-[14px] font-semibold text-[var(--text-primary)] tracking-tight">
                        {billingInfo.paymentMethod.brand.charAt(0).toUpperCase() + billingInfo.paymentMethod.brand.slice(1)} •••• {billingInfo.paymentMethod.last4}
                      </h3>
                      <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                        Expires {billingInfo.paymentMethod.expMonth.toString().padStart(2, "0")}/{billingInfo.paymentMethod.expYear}
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-[14px] font-semibold text-[var(--text-primary)] tracking-tight">
                        No payment method on file
                      </h3>
                      <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                        Add a payment method to upgrade your plan
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* STATE-003 FIX: Add onClick handler to open Stripe portal */}
              <button
                onClick={handleOpenBillingPortal}
                disabled={isRedirectingToPortal || !orgData?.stripe_customer_id}
                className="h-11 px-5 text-[12px] font-semibold rounded-xl border-2 border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] hover:shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRedirectingToPortal ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                {billingInfo?.paymentMethod ? "Manage Payment" : "Add Payment Method"}
              </button>
            </div>
          </div>
        </PremiumCard>
      </div>

      {/* Billing History - STATE-001 FIX: Show actual invoices from Stripe */}
      <div className="space-y-4 sm:space-y-6">
        <SectionHeader title="Billing History" icon={Receipt} />

        <PremiumCard hover={false}>
          {billingInfo?.invoices && billingInfo.invoices.length > 0 ? (
            <div className="divide-y divide-[var(--border-subtle)]">
              {billingInfo.invoices.map((invoice) => (
                <div key={invoice.id} className="py-4 px-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="h-10 w-10 rounded-xl bg-[var(--surface-secondary)] flex items-center justify-center flex-shrink-0">
                      <Receipt className="h-5 w-5 text-[var(--text-tertiary)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">
                        Invoice {invoice.number || invoice.id.slice(-8)}
                      </h4>
                      <p className="text-[11px] text-[var(--text-tertiary)]">
                        {new Date(invoice.created).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                      {invoice.currency} {invoice.amountPaid.toFixed(2)}
                    </span>
                    <Badge className={`text-[11px] px-2 py-0.5 ${invoice.status === "paid" ? "bg-green-100 text-green-700" : "bg-[var(--surface-secondary)] text-[var(--text-secondary)]"}`}>
                      {invoice.status}
                    </Badge>
                    {invoice.hostedInvoiceUrl && (
                      <a
                        href={invoice.hostedInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <div className="h-14 w-14 rounded-2xl bg-[var(--surface-secondary)] flex items-center justify-center mx-auto mb-4">
                <Receipt className="h-7 w-7 text-[var(--text-muted)]" />
              </div>
              <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-1">No invoices yet</h3>
              <p className="text-[12px] text-[var(--text-tertiary)] max-w-xs mx-auto">
                Your billing history will appear here once you upgrade to a paid plan
              </p>
            </div>
          )}
        </PremiumCard>
      </div>

      {/* Help Section */}
      <PremiumCard hover={false} className="bg-gradient-to-br from-[#90FCA6]/5 via-slate-50 to-white border-[#90FCA6]/10">
        <div>
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-white border border-[#90FCA6]/20 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Sparkles className="h-5 w-5 text-[#1a7a3a]" />
            </div>
            <div className="flex-1">
              <h3 className="text-[14px] font-semibold text-slate-900 mb-1">
                Need help with billing?
              </h3>
              <p className="text-[12px] text-slate-600 leading-relaxed mb-4">
                Contact our support team for questions about billing, invoices, or plan changes.
              </p>
              <a
                href={`mailto:${process.env.NEXT_PUBLIC_BILLING_EMAIL || "billing@cloudact.ai"}`}
                className="inline-flex items-center gap-2 text-[12px] font-semibold text-slate-900 hover:text-slate-600 transition-colors"
              >
                Contact Support
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      </PremiumCard>
    </div>
  )
}
