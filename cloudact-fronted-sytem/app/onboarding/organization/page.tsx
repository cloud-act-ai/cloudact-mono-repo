"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Command, Loader2, Check, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { createOrganization } from "@/actions/organization"
import { getStripePlans, type DynamicPlan } from "@/actions/stripe"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

const onboardingSchema = z.object({
  name: z.string().min(3, "Organization name must be at least 3 characters"),
  type: z.string().min(1, "Please select an organization type"),
  plan: z.string().min(1, "Please select a plan"),
})

type OnboardingFormValues = z.infer<typeof onboardingSchema>

const ORG_TYPES = [
  { value: "personal", label: "Personal" },
  { value: "startup", label: "Startup" },
  { value: "agency", label: "Agency" },
  { value: "company", label: "Company" },
  { value: "educational", label: "Educational" },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [plans, setPlans] = useState<DynamicPlan[]>([])

  const [isLoadingPlans, setIsLoadingPlans] = useState(true)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      plan: "",
      type: "company",
      name: "",
    },
  })

  const selectedPlan = watch("plan")

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          router.push("/signup")
          return
        }

        setIsCheckingAuth(false)
      } catch (err) {
        console.error("[v0] Auth check failed:", err)
        router.push("/signup")
      }
    }

    checkAuth()
  }, [router])

  // Fetch plans from Stripe (no fallback - Stripe is source of truth)
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

        // Sort by price and use Stripe data directly
        const sortedPlans = [...result.data].sort((a, b) => a.price - b.price)
        setPlans(sortedPlans)

        // Set default plan to first one
        if (sortedPlans.length > 0 && !watch("plan")) {
          setValue("plan", sortedPlans[0].id)
        }
      } catch (err) {
        console.error("[v0] Failed to fetch plans:", err)
        setError("Failed to load pricing. Please try again.")
      } finally {
        setIsLoadingPlans(false)
      }
    }

    fetchPlans()
  }, [])

  const onSubmit = async (data: OnboardingFormValues) => {
    setIsLoading(true)
    setError(null)

    try {
      // Find the selected plan from Stripe data
      const selectedPlanData = plans.find((p) => p.id === data.plan)

      if (!selectedPlanData) {
        throw new Error("Please select a valid plan")
      }

      // Set a timeout to prevent infinite loading (30 seconds max)
      const timeoutId = setTimeout(() => {
        console.warn("[v0] Organization creation timeout - forcing redirect")
        setIsLoading(false)
        toast.error("Setup is taking longer than expected", {
          description: "Redirecting to dashboard. If issues persist, contact support.",
        })
      }, 30000)

      try {
        // Use server action to create organization (bypasses RLS with service role)
        // All data comes from Stripe - no hardcoded values
        const result = await createOrganization({
          name: data.name,
          type: data.type,
          priceId: selectedPlanData.priceId,
          planId: selectedPlanData.id,
          limits: selectedPlanData.limits,
          trialDays: selectedPlanData.trialDays,
        })

        // Clear timeout since we got a response
        clearTimeout(timeoutId)

        if (!result.success) {
          throw new Error(result.error || "Failed to create organization")
        }

        // Check if backend onboarding failed - redirect to onboarding settings for recovery
        if (result.backendOnboardingFailed) {
          toast.warning("Backend Connection Issue", {
            description: "Organization created, but backend setup needs attention. Redirecting to settings...",
            duration: 5000,
            icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
          })
          // Redirect to onboarding settings where user can retry or enter API key manually
          console.log("[v0] Backend failed, redirecting to onboarding settings:", result.orgSlug)
          router.push(`/${result.orgSlug}/settings/onboarding`)
        } else if (result.backendApiKey) {
          toast.success("Organization Created", {
            description: "Your API key has been saved. Redirecting to dashboard...",
            duration: 3000,
          })
          // Success - redirect to dashboard
          console.log("[v0] Redirecting to dashboard:", result.orgSlug)
          router.push(`/${result.orgSlug}/dashboard`)
        } else {
          // Fallback - no backend key but also no explicit failure
          console.log("[v0] Redirecting to dashboard (no backend key):", result.orgSlug)
          router.push(`/${result.orgSlug}/dashboard`)
        }
      } catch (innerErr: any) {
        clearTimeout(timeoutId)
        throw innerErr
      }
    } catch (err: any) {
      console.error("[v0] Onboarding error:", err)
      setError(err.message || "Failed to create organization")
      setIsLoading(false)
    }
  }

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
          <p className="text-sm text-gray-600">Verifying authentication...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-white p-6 font-sans antialiased">
      <div className="w-full max-w-[800px] space-y-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#007A78] text-white shadow-sm">
            <Command className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Setup your Organization</h1>
            <p className="text-sm text-gray-600">Tell us about your team and choose a plan</p>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-700">Organization Name</Label>
                <Input id="name" placeholder="Acme Inc." {...register("name")} className="focus:border-[#007A78] focus:ring-[#007A78]" />
                {errors.name && <p className="text-xs text-[#FF6E50]">{errors.name.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="type" className="text-gray-700">Type</Label>
                <select
                  id="type"
                  className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#007A78] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  {...register("type")}
                >
                  {ORG_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {errors.type && <p className="text-xs text-[#FF6E50]">{errors.type.message}</p>}
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-gray-700">Select a Plan {plans[0]?.trialDays ? `(${plans[0].trialDays}-day Free Trial)` : ""}</Label>
              {isLoadingPlans ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
                  <span className="ml-2 text-sm text-gray-600">Loading plans...</span>
                </div>
              ) : plans.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-600">
                  No plans available. Please configure products in Stripe.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  {plans.map((plan) => (
                    <div
                      key={plan.id}
                      className={cn(
                        "cursor-pointer rounded-lg border p-4 transition-all hover:border-[#007A78] flex flex-col",
                        selectedPlan === plan.id ? "border-[#007A78] bg-[#F0FDFA] ring-1 ring-[#007A78]" : "bg-white",
                      )}
                      onClick={() => setValue("plan", plan.id)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                        {selectedPlan === plan.id && <Check className="h-4 w-4 text-[#007A78]" />}
                      </div>
                      <div className="text-2xl font-bold text-gray-900 mb-2">
                        ${plan.price}
                        <span className="text-sm font-normal text-gray-600">/mo</span>
                      </div>
                      <p className="text-xs text-gray-600 mb-4">{plan.description}</p>
                      <ul className="space-y-1 text-xs text-gray-600 mt-auto">
                        {plan.features.slice(0, 3).map((f, i) => (
                          <li key={i}>• {f}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              {errors.plan && <p className="text-xs text-[#FF6E50]">{errors.plan.message}</p>}
            </div>

            {error && (
              <Alert variant="destructive" className="py-2 bg-[#FFF5F3] border-[#FF6E50]">
                <AlertDescription className="text-[#FF6E50]">{error}</AlertDescription>
              </Alert>
            )}

            <button type="submit" className="cloudact-btn-primary w-full" disabled={isLoading || isLoadingPlans || plans.length === 0}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                "Start Free Trial"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
