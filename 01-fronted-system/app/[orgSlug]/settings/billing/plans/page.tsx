"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Check,
  Zap,
  TrendingUp,
  Building2,
  Loader2,
  AlertCircle,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { PremiumCard, SectionHeader } from "@/components/ui/premium-card"
import { LoadingState } from "@/components/ui/loading-state"
import { changeSubscriptionPlan, createCheckoutSession } from "@/actions/stripe"

interface OrgData {
  id: string
  plan: string
  billing_status: string
  stripe_subscription_id?: string
}

// Plan definitions matching Stripe product metadata
const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 19,
    priceId: process.env.NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID,
    color: "#007AFF",
    icon: <Zap className="h-5 w-5" />,
    features: [
      "2 team members",
      "3 providers",
      "6 pipelines/day",
      "180 pipelines/month",
      "Email support",
    ],
  },
  {
    id: "professional",
    name: "Professional",
    price: 69,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PROFESSIONAL_PRICE_ID,
    color: "#90FCA6",
    icon: <TrendingUp className="h-5 w-5" />,
    popular: true,
    features: [
      "6 team members",
      "6 providers",
      "25 pipelines/day",
      "750 pipelines/month",
      "Priority support",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    price: 199,
    priceId: process.env.NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID,
    color: "#8B5CF6",
    icon: <Building2 className="h-5 w-5" />,
    features: [
      "11 team members",
      "10 providers",
      "100 pipelines/day",
      "3000 pipelines/month",
      "Dedicated support",
    ],
  },
]

export default function PlansPage() {
  const params = useParams<{ orgSlug: string }>()
  const orgSlug = params.orgSlug
  const router = useRouter()

  const [isLoading, setIsLoading] = useState(true)
  const [orgData, setOrgData] = useState<OrgData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [changingPlan, setChangingPlan] = useState<string | null>(null)

  useEffect(() => {
    document.title = `Change Plan | ${orgSlug}`
  }, [orgSlug])

  const fetchOrgData = useCallback(async () => {
    try {
      setIsLoading(true)
      const supabase = createClient()

      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("id, plan, billing_status, stripe_subscription_id")
        .eq("org_slug", orgSlug)
        .single()

      if (orgError) throw orgError
      setOrgData(org)
    } catch (fetchError) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[PlansPage] Failed to fetch org data:", fetchError)
      }
      setError("Failed to load organization data")
    } finally {
      setIsLoading(false)
    }
  }, [orgSlug])

  useEffect(() => {
    void fetchOrgData()
  }, [fetchOrgData])

  const handleSelectPlan = async (planId: string, priceId: string | undefined) => {
    if (!priceId) {
      setError("Plan configuration error. Please contact support.")
      return
    }

    if (changingPlan) return
    setChangingPlan(planId)
    setError(null)

    try {
      // If user has an existing subscription, change the plan
      if (orgData?.stripe_subscription_id) {
        const result = await changeSubscriptionPlan(orgSlug, priceId)
        if (result.error) {
          setError(result.error)
          return
        }
        // Refresh the page to show new plan
        router.refresh()
        router.push(`/${orgSlug}/settings/billing`)
      } else {
        // No subscription - create checkout session
        const result = await createCheckoutSession(orgSlug, priceId)
        if (result.error) {
          setError(result.error)
          return
        }
        if (result.url) {
          router.push(result.url)
        }
      }
    } catch {
      setError("Failed to change plan. Please try again.")
    } finally {
      setChangingPlan(null)
    }
  }

  const currentPlan = orgData?.plan || "starter"
  const isTrialing = orgData?.billing_status === "trialing"

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href={`/${orgSlug}/settings/billing`}
            className="h-10 w-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Change Plan</h1>
            <p className="text-sm text-slate-500">Select a plan that fits your needs</p>
          </div>
        </div>
        <LoadingState message="Loading plans..." />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/${orgSlug}/settings/billing`}
          className="h-10 w-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Change Plan</h1>
          <p className="text-sm text-slate-500">
            {isTrialing
              ? "Your trial will convert to the selected plan"
              : "Select a plan that fits your needs"}
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
          <p className="text-sm font-medium text-rose-700">{error}</p>
        </div>
      )}

      {/* Plans Grid */}
      <div className="space-y-4">
        <SectionHeader title="Available Plans" icon={Zap} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.id
            const isUpgrade = PLANS.findIndex((p) => p.id === currentPlan) < PLANS.findIndex((p) => p.id === plan.id)
            const isDowngrade = PLANS.findIndex((p) => p.id === currentPlan) > PLANS.findIndex((p) => p.id === plan.id)

            return (
              <PremiumCard
                key={plan.id}
                hover={!isCurrent}
                className={`relative ${isCurrent ? "ring-2 ring-[#90FCA6]" : ""}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-[#90FCA6] text-slate-900 text-xs font-semibold px-3 py-1">
                      Most Popular
                    </Badge>
                  </div>
                )}

                <div className="pt-4">
                  {/* Plan Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center"
                      style={{
                        backgroundColor: plan.color,
                        color: plan.id === "professional" ? "#000" : "#fff",
                      }}
                    >
                      {plan.icon}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{plan.name}</h3>
                      {isCurrent && (
                        <Badge className="bg-slate-100 text-slate-600 text-xs">
                          Current Plan
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Price */}
                  <div className="mb-6">
                    <span className="text-xl font-bold text-slate-900">${plan.price}</span>
                    <span className="text-slate-500">/month</span>
                  </div>

                  {/* Features */}
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm text-slate-600">
                        <Check className="h-4 w-4 text-[#1a7a3a] flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {/* Action Button */}
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full h-11 rounded-xl bg-slate-100 text-slate-400 font-semibold text-sm cursor-not-allowed"
                    >
                      Current Plan
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSelectPlan(plan.id, plan.priceId)}
                      disabled={changingPlan !== null}
                      className={`w-full h-11 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                        isUpgrade
                          ? "bg-[#90FCA6] hover:bg-[#6EE890] text-slate-900"
                          : "bg-slate-900 hover:bg-slate-800 text-white"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {changingPlan === plan.id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : isUpgrade ? (
                        "Upgrade"
                      ) : isDowngrade ? (
                        "Downgrade"
                      ) : (
                        "Select"
                      )}
                    </button>
                  )}
                </div>
              </PremiumCard>
            )
          })}
        </div>
      </div>

      {/* Info Section */}
      <PremiumCard hover={false} className="bg-slate-50">
        <div className="text-center py-4">
          <p className="text-sm text-slate-600">
            {isTrialing ? (
              <>
                You&apos;re currently on a <strong>14-day free trial</strong>. Select a plan to
                continue after your trial ends.
              </>
            ) : (
              <>
                Plan changes take effect immediately. You&apos;ll be charged or credited the
                prorated difference.
              </>
            )}
          </p>
        </div>
      </PremiumCard>
    </div>
  )
}
