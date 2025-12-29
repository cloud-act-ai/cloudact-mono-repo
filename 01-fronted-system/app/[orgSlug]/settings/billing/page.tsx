"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  CreditCard,
  Receipt,
  TrendingUp,
  Calendar,
  ExternalLink,
  Loader2,
  Check,
  AlertCircle,
  Sparkles,
  Zap,
  Building2,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"

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

// Plan features for display
const PLAN_FEATURES: Record<string, { name: string; color: string; icon: React.ReactNode; features: string[] }> = {
  free: {
    name: "Free",
    color: "#8B5CF6",
    icon: <Sparkles className="h-5 w-5" />,
    features: ["Up to 3 team members", "Basic cost analytics", "Community support"],
  },
  starter: {
    name: "Starter",
    color: "#007AFF",
    icon: <Zap className="h-5 w-5" />,
    features: ["Up to 10 team members", "Advanced analytics", "Email support", "API access"],
  },
  pro: {
    name: "Professional",
    color: "#90FCA6",
    icon: <TrendingUp className="h-5 w-5" />,
    features: ["Up to 50 team members", "Custom integrations", "Priority support", "SSO authentication"],
  },
  enterprise: {
    name: "Enterprise",
    color: "#FF6C5E",
    icon: <Building2 className="h-5 w-5" />,
    features: ["Unlimited team members", "Dedicated support", "Custom contracts", "SLA guarantee"],
  },
}

export default function BillingPage() {
  const params = useParams<{ orgSlug: string }>()
  const orgSlug = params.orgSlug

  const [isLoading, setIsLoading] = useState(true)
  const [orgData, setOrgData] = useState<OrgData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = `Billing | ${orgSlug}`
  }, [orgSlug])

  const fetchOrgData = useCallback(async () => {
    try {
      setIsLoading(true)
      const supabase = createClient()

      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("*")
        .eq("slug", orgSlug)
        .single()

      if (orgError) throw orgError

      setOrgData(org)
    } catch {
      setError("Failed to load billing data")
    } finally {
      setIsLoading(false)
    }
  }, [orgSlug])

  useEffect(() => {
    void fetchOrgData()
  }, [fetchOrgData])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center">
          <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
          <p className="text-[14px] text-slate-500 font-medium">Loading billing information...</p>
        </div>
      </div>
    )
  }

  const currentPlan = orgData?.plan || "free"
  const planInfo = PLAN_FEATURES[currentPlan] || PLAN_FEATURES.free
  const billingStatus = orgData?.billing_status || "active"

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#90FCA6] to-[#B8FDCA] flex items-center justify-center flex-shrink-0 shadow-sm">
              <CreditCard className="h-6 w-6 text-slate-900" />
            </div>
            <div>
              <h1 className="text-[32px] font-bold text-slate-900 tracking-tight leading-none">
                Billing & Subscription
              </h1>
              <p className="text-[15px] text-slate-500 mt-2 max-w-lg">
                Manage your subscription plan and payment methods
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
          <p className="text-[13px] font-medium text-rose-700">{error}</p>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <div className="metric-card">
          <div className="flex items-center gap-4">
            <div
              className="h-12 w-12 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${planInfo.color}15` }}
            >
              <div style={{ color: planInfo.color }}>{planInfo.icon}</div>
            </div>
            <div>
              <p className="text-[24px] font-bold text-slate-900 leading-none tracking-tight">{planInfo.name}</p>
              <p className="text-[13px] text-slate-500 font-medium mt-1">Current Plan</p>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-[#90FCA6]/15 flex items-center justify-center">
              <Check className="h-6 w-6 text-[#1a7a3a]" />
            </div>
            <div>
              <p className="text-[24px] font-bold text-slate-900 leading-none tracking-tight capitalize">{billingStatus}</p>
              <p className="text-[13px] text-slate-500 font-medium mt-1">Billing Status</p>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Calendar className="h-6 w-6 text-slate-600" />
            </div>
            <div>
              <p className="text-[24px] font-bold text-slate-900 leading-none tracking-tight">Monthly</p>
              <p className="text-[13px] text-slate-500 font-medium mt-1">Billing Cycle</p>
            </div>
          </div>
        </div>
      </div>

      {/* Current Plan Card */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide">
            Current Plan
          </h2>
        </div>

        <div className="metric-card shadow-sm hover:shadow-md transition-shadow duration-300">
          <div className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="flex items-start gap-4">
                <div
                  className="h-14 w-14 rounded-2xl flex items-center justify-center shadow-sm"
                  style={{ backgroundColor: planInfo.color, color: currentPlan === "pro" ? "#000" : "#fff" }}
                >
                  {planInfo.icon}
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-[17px] font-bold text-slate-900">{planInfo.name} Plan</h3>
                    <Badge
                      className="text-[11px] font-semibold px-3 py-1 rounded-lg border-0"
                      style={{ backgroundColor: `${planInfo.color}15`, color: currentPlan === "pro" ? "#1a7a3a" : planInfo.color }}
                    >
                      Current
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {planInfo.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[13px] text-slate-600">
                        <Check className="h-3.5 w-3.5 text-[#1a7a3a]" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link href={`/${orgSlug}/settings/billing/plans`}>
                  <button className="h-11 px-6 text-[13px] font-semibold bg-[#90FCA6] hover:bg-[#6EE890] text-slate-900 rounded-xl transition-all shadow-sm hover:shadow-md flex items-center gap-2 w-full sm:w-auto justify-center">
                    <TrendingUp className="h-4 w-4" />
                    Upgrade Plan
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Payment Method */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide">
            Payment Method
          </h2>
        </div>

        <div className="metric-card shadow-sm">
          <div className="group relative">
            <div className="absolute left-0 top-4 bottom-4 w-1 rounded-full bg-slate-300 opacity-60 group-hover:opacity-100 transition-opacity" />
            <div className="pl-5 py-5 pr-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className="h-11 w-11 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <CreditCard className="h-5 w-5 text-slate-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight">
                    No payment method on file
                  </h3>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    Add a payment method to upgrade your plan
                  </p>
                </div>
              </div>

              <button className="h-11 px-5 text-[13px] font-semibold rounded-xl border-2 border-slate-200 hover:bg-slate-50 hover:shadow-sm transition-all flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Add Payment Method
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Billing History */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wide">
            Billing History
          </h2>
        </div>

        <div className="metric-card shadow-sm">
          <div className="py-12 text-center">
            <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Receipt className="h-7 w-7 text-slate-400" />
            </div>
            <h3 className="text-[17px] font-semibold text-slate-900 mb-1">No invoices yet</h3>
            <p className="text-[13px] text-slate-500 max-w-xs mx-auto">
              Your billing history will appear here once you upgrade to a paid plan
            </p>
          </div>
        </div>
      </section>

      {/* Help Section */}
      <div className="metric-card shadow-sm bg-gradient-to-br from-[#90FCA6]/5 via-slate-50 to-white border-[#90FCA6]/10">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-white border border-[#90FCA6]/20 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Sparkles className="h-5 w-5 text-[#1a7a3a]" />
            </div>
            <div className="flex-1">
              <h3 className="text-[15px] font-semibold text-slate-900 mb-1">
                Need help with billing?
              </h3>
              <p className="text-[13px] text-slate-600 leading-relaxed mb-4">
                Contact our support team for questions about billing, invoices, or plan changes.
              </p>
              <a
                href={`mailto:${process.env.NEXT_PUBLIC_BILLING_EMAIL || "billing@cloudact.ai"}`}
                className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-900 hover:text-slate-600 transition-colors"
              >
                Contact Support
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
