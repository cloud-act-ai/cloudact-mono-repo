"use client"

import { useEffect, useState, Suspense, useRef, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { completeOnboarding } from "@/actions/organization"
import { sendWelcomeEmailAction } from "@/actions/email"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { OnboardingProgress, createOnboardingStages, updateStageStatus, completeStageAndMoveNext, type ProgressStage } from "@/components/onboarding-progress"
import { site } from "@/lib/site"

// Validate Stripe session ID format
function isValidSessionId(sessionId: string | null): sessionId is string {
  if (!sessionId) return false
  // Stripe checkout session IDs start with "cs_" followed by alphanumeric chars
  return /^cs_[a-zA-Z0-9_]+$/.test(sessionId)
}

function SuccessContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session_id")

  const [status, setStatus] = useState<"processing" | "success" | "error">("processing")
  const [error, setError] = useState<string | null>(null)
  const [orgSlug, setOrgSlug] = useState<string | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)
  // FIX GAP-006: Track progress stages for real-time feedback
  const [progressStages, setProgressStages] = useState<ProgressStage[]>(createOnboardingStages())

  // Prevent duplicate processing and back button issues
  const processingRef = useRef(false)
  const hasProcessedRef = useRef(false)

  const processCheckout = useCallback(async (isRetry = false) => {
    // Prevent duplicate processing
    if (processingRef.current && !isRetry) return
    processingRef.current = true

    // FIX GAP-006: Reset progress stages on retry
    if (isRetry) {
      setProgressStages(createOnboardingStages())
    }

    // Validate session ID format before making request
    if (!isValidSessionId(sessionId)) {
      setStatus("error")
      setError("Invalid checkout session. Please try again from the billing page.")
      processingRef.current = false
      return
    }

    try {
      // Prevent back button re-processing by replacing history state
      if (typeof window !== "undefined" && !hasProcessedRef.current) {
        window.history.replaceState({ processing: true }, "", window.location.href)
      }

      // FIX GAP-006: Stage 1 - Verifying payment
      setProgressStages(prev => updateStageStatus(prev, 0, "in_progress"))

      // Check if user is authenticated
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // CRITICAL FIX: Preserve session_id in login redirect
        const currentUrl = `/onboarding/success?session_id=${encodeURIComponent(sessionId)}`
        router.push(`/login?redirect=${encodeURIComponent(currentUrl)}`)
        processingRef.current = false
        return
      }

      // FIX GAP-006: Stage 1 complete, move to Stage 2 - Creating organization
      setProgressStages(prev => completeStageAndMoveNext(prev, 0))

      // Call server action to complete onboarding
      // This will verify the checkout session and create the organization
      const result = await completeOnboarding(sessionId)

      if (!result.success) {
        // FIX GAP-006: Mark current stage as error
        const currentStageIdx = progressStages.findIndex(s => s.status === "in_progress")
        if (currentStageIdx >= 0) {
          setProgressStages(prev => updateStageStatus(prev, currentStageIdx, "error", result.error))
        }
        setStatus("error")
        setError(result.error || "Failed to complete setup")
        processingRef.current = false
        return
      }

      // FIX GAP-006: Stage 2 complete (org created), move to Stage 3 - Setting up workspace
      setProgressStages(prev => completeStageAndMoveNext(prev, 1))

      // Small delay to show workspace setup stage
      await new Promise(resolve => setTimeout(resolve, 500))

      // FIX GAP-006: Stage 3 complete, move to Stage 4 - Generating API key
      setProgressStages(prev => completeStageAndMoveNext(prev, 2))

      // Small delay to show API key generation
      await new Promise(resolve => setTimeout(resolve, 300))

      // FIX GAP-006: Stage 4 complete, move to Stage 5 - Finalizing
      setProgressStages(prev => completeStageAndMoveNext(prev, 3))

      // Small delay to show finalizing stage
      await new Promise(resolve => setTimeout(resolve, 300))

      // FIX GAP-006: All stages complete
      setProgressStages(prev => updateStageStatus(prev, 4, "completed"))

      hasProcessedRef.current = true
      setOrgSlug(result.orgSlug || null)
      setStatus("success")

      // Send welcome email (non-blocking - don't fail if email fails)
      try {
        const userMetadata = user.user_metadata || {}
        const firstName = userMetadata.first_name || userMetadata.name || "there"
        const userName = userMetadata.last_name
          ? `${firstName} ${userMetadata.last_name}`
          : firstName

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
        const dashboardLink = `${appUrl}/${result.orgSlug}/integrations`

        // Get org name from user metadata (pending_company_name) or fallback
        const orgName = userMetadata.pending_company_name || result.orgSlug || "your organization"

        await sendWelcomeEmailAction({
          to: user.email!,
          name: userName,
          orgName: orgName,
          dashboardLink: dashboardLink,
        })
      } catch (emailError) {
        // Non-critical - don't fail onboarding if email fails
        console.warn("[Onboarding Success] Failed to send welcome email:", emailError)
      }

      // Show success toast
      toast.success("Organization created!", {
        description: "Let's set up your integrations...",
        duration: 2000,
      })

      // Redirect immediately to integrations page (skip "Welcome aboard" screen)
      router.push(`/${result.orgSlug}/integrations?welcome=true`)

    } catch (err: unknown) {
      setStatus("error")
      setError(err instanceof Error ? err.message : "Something went wrong. Please contact support.")
    } finally {
      processingRef.current = false
      setIsRetrying(false)
    }
  }, [sessionId, router])

  // Retry handler
  const handleRetry = useCallback(() => {
    setIsRetrying(true)
    setStatus("processing")
    setError(null)
    processCheckout(true)
  }, [processCheckout])

  useEffect(() => {
    // Check if we're coming back via back button after processing
    if (typeof window !== "undefined") {
      const state = window.history.state
      if (state?.processing && hasProcessedRef.current) {
        // Already processed, redirect to appropriate page
        if (orgSlug) {
          router.push(`/${orgSlug}/dashboard`)
        }
        return
      }
    }

    processCheckout()
  }, [processCheckout, orgSlug, router])

  if (status === "processing") {
    return (
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#F0FDFA]">
          <Loader2 className="h-10 w-10 animate-spin text-[#6EE890]" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Setting up your organization...</h1>
          <p className="text-gray-600">
            Please wait while we complete your setup. This may take a moment.
          </p>
        </div>
        {/* FIX GAP-006: Real-time progress indicator */}
        <div className="w-full mt-4">
          <OnboardingProgress stages={progressStages} />
        </div>
      </div>
    )
  }

  if (status === "error") {
    // Determine if error is retryable
    const isRetryable = error?.includes("network") ||
                        error?.includes("timeout") ||
                        error?.includes("temporarily") ||
                        error?.includes("Something went wrong")

    return (
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#FFF5F3]">
          <AlertTriangle className="h-10 w-10 text-[#FF6C5E]" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Setup Failed</h1>
          <Alert variant="destructive" className="bg-[#FFF5F3] border-[#FF6C5E]">
            <AlertDescription className="text-[#FF6C5E]">{error}</AlertDescription>
          </Alert>
        </div>
        <div className="flex gap-4">
          {isRetryable && isValidSessionId(sessionId) ? (
            <button
              className="cloudact-btn-secondary"
              onClick={handleRetry}
              disabled={isRetrying}
            >
              {isRetrying ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Try Again
                </>
              )}
            </button>
          ) : (
            <button className="cloudact-btn-secondary" onClick={() => router.push("/onboarding/billing")}>
              Back to Billing
            </button>
          )}
          <button className="cloudact-btn-primary" onClick={() => router.push("/contact")}>
            Contact Support
          </button>
        </div>
      </div>
    )
  }

  // Success state - just show brief redirect message (page redirects immediately)
  return (
    <div className="flex flex-col items-center gap-6 text-center max-w-lg">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#F0FDFA]">
        <Loader2 className="h-10 w-10 animate-spin text-[#6EE890]" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">Setup Complete!</h1>
        <p className="text-gray-600">
          Redirecting to integrations...
        </p>
      </div>
    </div>
  )
}

function SuccessFallback() {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#F0FDFA]">
        <Loader2 className="h-10 w-10 animate-spin text-[#1a7a3a]" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">Loading...</h1>
        <p className="text-gray-600">Please wait...</p>
      </div>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <div className="flex min-h-svh w-full flex-col bg-white">
      {/* Header with Logo */}
      <div className="p-6 md:p-8">
        <Link href="/" className="inline-flex items-center">
          {/* FIX BUG-001: Remove CSS height/width overrides */}
          <Image
            src="/logos/cloudact-logo-black.svg"
            alt="CloudAct.ai"
            width={160}
            height={32}
            priority
          />
        </Link>
      </div>

      {/* Main Content Centered */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 -mt-20">
        <Suspense fallback={<SuccessFallback />}>
          <SuccessContent />
        </Suspense>
      </div>

      {/* Footer */}
      <div className="p-4 sm:p-6 text-center text-xs sm:text-sm text-gray-400 border-t border-gray-100">
        <span>&copy; {new Date().getFullYear()} {site.company} All rights reserved.</span>
        <span className="mx-1 sm:mx-2">·</span>
        <Link href="/privacy" className="hover:text-gray-600 transition-colors">Privacy</Link>
        <span className="mx-1 sm:mx-2">·</span>
        <Link href="/terms" className="hover:text-gray-600 transition-colors">Terms</Link>
      </div>
    </div>
  )
}
