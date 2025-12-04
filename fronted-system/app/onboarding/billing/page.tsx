"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Cloud, Loader2, Check, Lock, Shield } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { getStripePlans, createOnboardingCheckoutSession, type DynamicPlan } from "@/actions/stripe"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import { DEFAULT_TRIAL_DAYS } from "@/lib/constants"

export default function BillingPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [plans, setPlans] = useState<DynamicPlan[]>([])
  const [isLoadingPlans, setIsLoadingPlans] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<string>("")
  const [user, setUser] = useState<any>(null)

  // Check auth and get user metadata (contains pending company info)
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push("/signup")
          return
        }

        // Check if user already has an organization
        const { data: memberships } = await supabase
          .from("organization_members")
          .select("org_id, organizations(org_slug)")
          .eq("user_id", user.id)
          .eq("status", "active")
          .limit(1)

        if (memberships && memberships.length > 0) {
          // User already has an org, redirect to dashboard
          const org = memberships[0].organizations as any
          if (org?.org_slug) {
            console.log("[v0] User already has org, redirecting to dashboard:", org.org_slug)
            router.push(`/${org.org_slug}/dashboard`)
            return
          }
        }

        // Check for pending company info from signup
        const pendingCompanyName = user.user_metadata?.pending_company_name
        if (!pendingCompanyName) {
          console.warn("[v0] No pending company name in user metadata, redirecting to signup")
          router.push("/signup")
          return
        }

        setUser(user)
        setIsCheckingAuth(false)
      } catch (err) {
        console.error("[v0] Auth check failed:", err)
        router.push("/signup")
      }
    }

    checkAuth()
  }, [router])

  // Fetch plans from Stripe
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const result = await getStripePlans()

        if (result.error) {
          setError(`Failed to load plans: ${result.error}`)
          return
        }

        if (!result.data || result.data.length === 0) {
          setError("No plans available. Please configure products in Stripe.")
          return
        }

        // Sort by price
        const sortedPlans = [...result.data].sort((a, b) => a.price - b.price)
        setPlans(sortedPlans)

        // Don't auto-select any plan - user must choose
        // Middle plan will be highlighted as "Most Popular"
      } catch (err) {
        console.error("[v0] Failed to fetch plans:", err)
        setError("Failed to load pricing. Please try again.")
      } finally {
        setIsLoadingPlans(false)
      }
    }

    fetchPlans()
  }, [])

  const handleSelectPlan = async (priceId: string) => {
    setSelectedPlan(priceId)
  }

  const handleContinue = async () => {
    if (!selectedPlan) {
      setError("Please select a plan")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const selectedPlanData = plans.find(p => p.priceId === selectedPlan)
      if (!selectedPlanData) {
        throw new Error("Please select a valid plan")
      }

      // Create checkout session with pending company info from user metadata
      const result = await createOnboardingCheckoutSession(selectedPlan)

      if (result.error) {
        throw new Error(result.error)
      }

      if (!result.url) {
        throw new Error("Failed to create checkout session")
      }

      // Redirect to Stripe Checkout
      window.location.href = result.url
    } catch (err: any) {
      console.error("[v0] Checkout error:", err)
      setError(err.message || "Failed to start checkout")
      setIsLoading(false)
    }
  }

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
          <p className="text-sm text-gray-600">Verifying your account...</p>
        </div>
      </div>
    )
  }

  const trialDays = plans[0]?.trialDays || DEFAULT_TRIAL_DAYS
  const companyName = user?.user_metadata?.pending_company_name || "Your Company"

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-white p-4">
      <div className="w-full max-w-[900px] space-y-4">
        {/* Header */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#007A78] text-white shadow-lg">
            <Cloud className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-gray-900">Choose your plan</h1>
            <p className="text-sm text-gray-600">
              Setting up <span className="font-medium text-gray-900">{companyName}</span> - Start with a {trialDays}-day free trial
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mx-auto max-w-md bg-[#FFF5F3] border-[#FF6E50]">
            <AlertDescription className="text-[#FF6E50]">{error}</AlertDescription>
          </Alert>
        )}

        {/* Plans */}
        {isLoadingPlans ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-gray-600" />
            <span className="ml-3 text-gray-600">Loading plans...</span>
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            No plans available. Please configure products in Stripe.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan, index) => {
              const isSelected = selectedPlan === plan.priceId
              // Middle plan (index 1) is always highlighted as "Most Popular"
              const isPopular = index === 1 || plan.metadata?.is_popular === "true"
              const hasSelection = selectedPlan !== ""

              return (
                <div
                  key={plan.priceId}
                  className={cn(
                    "relative cursor-pointer rounded-xl border bg-white p-4 shadow-md transition-all hover:shadow-lg flex flex-col",
                    isSelected && "border-[#007A78] opacity-60 scale-[0.98]",
                    !isSelected && "hover:border-[#007A78] hover:ring-2 hover:ring-[#007A78]/30 hover:scale-[1.02]",
                    isPopular && !isSelected && "border-[#007A78]/50 ring-1 ring-[#007A78]/20"
                  )}
                  onClick={() => handleSelectPlan(plan.priceId)}
                >
                  {isPopular && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-[#007A78] text-white text-xs font-medium rounded-full">
                      Most Popular
                    </div>
                  )}

                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                      <p className="text-xs text-gray-600">{plan.description || "Perfect for growing teams"}</p>
                    </div>
                    {isSelected && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#007A78]">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </div>

                  <div className="flex items-baseline mb-3">
                    <span className="text-3xl font-bold text-gray-900">${plan.price}</span>
                    <span className="text-xs text-gray-600 ml-1">/{plan.interval}</span>
                  </div>

                  <ul className="space-y-1.5 mb-4 flex-1">
                    {/* Show limits as features */}
                    <li className="flex items-start gap-1.5 text-xs">
                      <Check className="h-3.5 w-3.5 text-[#007A78] shrink-0 mt-0.5" />
                      <span className="text-gray-600">{plan.limits.teamMembers} team members</span>
                    </li>
                    <li className="flex items-start gap-1.5 text-xs">
                      <Check className="h-3.5 w-3.5 text-[#007A78] shrink-0 mt-0.5" />
                      <span className="text-gray-600">{plan.limits.providers} providers</span>
                    </li>
                    <li className="flex items-start gap-1.5 text-xs">
                      <Check className="h-3.5 w-3.5 text-[#007A78] shrink-0 mt-0.5" />
                      <span className="text-gray-600">{plan.limits.pipelinesPerDay} pipelines/day</span>
                    </li>
                    {plan.features.slice(0, 2).map((feature, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs">
                        <Check className="h-3.5 w-3.5 text-[#007A78] shrink-0 mt-0.5" />
                        <span className="text-gray-600">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    className={cn(
                      "w-full text-sm py-2 px-4 rounded-md font-medium transition-all",
                      isSelected ? "cloudact-btn-primary" : "cloudact-btn-secondary",
                      hasSelection && !isSelected && "opacity-60"
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSelectPlan(plan.priceId)
                    }}
                  >
                    {isSelected ? "Selected" : "Select Plan"}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Continue Button - Prominent when plan selected */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <button
            className={cn(
              "w-full max-w-md h-14 text-lg font-bold shadow-lg transition-all",
              selectedPlan ? "cloudact-btn-primary animate-pulse ring-4 ring-[#007A78]/30" : "cloudact-btn-primary opacity-50 cursor-not-allowed"
            )}
            disabled={isLoading || isLoadingPlans || plans.length === 0 || !selectedPlan}
            onClick={handleContinue}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Redirecting to checkout...
              </>
            ) : selectedPlan ? (
              <>
                Continue to Checkout
                <span className="ml-2">→</span>
              </>
            ) : (
              `Select a plan above`
            )}
          </button>

          <p className="text-center text-xs text-gray-600">
            {trialDays}-day free trial • No credit card required • Cancel anytime
          </p>
        </div>

        {/* Trust Badges - Compact */}
        <div className="flex items-center justify-center gap-4 text-xs text-gray-600">
          <div className="flex items-center gap-1">
            <Lock className="h-3 w-3" />
            <span>SSL encrypted</span>
          </div>
          <div className="flex items-center gap-1">
            <Shield className="h-3 w-3" />
            <span>Powered by Stripe</span>
          </div>
          <Link href="/signup" className="hover:underline ml-2 text-[#007A78] hover:text-[#005F5D]">
            ← Back to sign up
          </Link>
        </div>
      </div>
    </div>
  )
}
