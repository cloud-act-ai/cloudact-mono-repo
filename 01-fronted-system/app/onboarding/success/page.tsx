"use client"

import { useEffect, useState, Suspense, useRef, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Loader2, CheckCircle, AlertTriangle, RefreshCw, Copy, Check, AlertCircle } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { completeOnboarding } from "@/actions/organization"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { OnboardingProgress, createOnboardingStages, updateStageStatus, completeStageAndMoveNext, type ProgressStage } from "@/components/onboarding-progress"

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
  // BUG FIX: Track backend onboarding status and API key to show warnings
  const [backendFailed, setBackendFailed] = useState(false)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [apiKeyCopied, setApiKeyCopied] = useState(false)
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

      // BUG FIX: Track backend failure and API key for display
      if (result.backendOnboardingFailed) {
        setBackendFailed(true)
      }
      if (result.backendApiKey) {
        setApiKey(result.backendApiKey)
      }

      // Show success toast with appropriate message
      if (result.backendOnboardingFailed) {
        toast.warning("Organization created with warnings", {
          description: "Backend setup can be completed later from Settings.",
          duration: 5000,
        })
      } else {
        toast.success("Organization created!", {
          description: "Redirecting to your dashboard...",
          duration: 3000,
        })
      }

      // Redirect to dashboard after a short delay (longer if showing API key)
      // Note: This timeout doesn't need cleanup since it only runs after success
      // and the component will be unmounted by the redirect
      const redirectDelay = result.backendApiKey ? 10000 : 2000  // 10s if showing API key
      setTimeout(() => {
        router.push(`/${result.orgSlug}/dashboard?welcome=true`)
      }, redirectDelay)

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

  // Copy API key to clipboard
  const copyApiKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey)
      setApiKeyCopied(true)
      toast.success("API key copied to clipboard!")
      setTimeout(() => setApiKeyCopied(false), 2000)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center max-w-lg">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#F0FDFA]">
        <CheckCircle className="h-10 w-10 text-[#6EE890]" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">Welcome aboard!</h1>
        <p className="text-gray-600">
          Your organization has been created successfully.
          {!apiKey && " Redirecting you to your dashboard..."}
        </p>
      </div>

      {/* BUG FIX: Show API key if available (display once!) */}
      {apiKey && (
        <div className="w-full p-4 bg-[#F0FDFA] border border-[#6EE890] rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-[#1a7a3a] font-medium">
            <AlertCircle className="h-4 w-4" />
            <span>Important: Save your API key now!</span>
          </div>
          <p className="text-sm text-gray-600 text-left">
            This key is shown only once. Copy it now and store it securely.
            You{"'"}ll need it for integrations.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-3 bg-white border border-gray-200 rounded-lg font-mono text-xs text-left break-all">
              {apiKey}
            </code>
            <button
              onClick={copyApiKey}
              className="p-3 bg-[#6EE890] hover:bg-[#5dd87f] text-white rounded-lg transition-colors"
              title="Copy to clipboard"
            >
              {apiKeyCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* BUG FIX: Show warning if backend onboarding failed */}
      {backendFailed && (
        <Alert variant="default" className="w-full bg-amber-50 border-amber-200 text-left">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700">
            <strong>Note:</strong> Backend setup is pending. You can complete it from Settings {">"} Organization {">"} Onboarding & Quota.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col items-center gap-2">
        {apiKey ? (
          <button
            onClick={() => router.push(`/${orgSlug}/dashboard?welcome=true`)}
            className="cloudact-btn-primary"
          >
            Continue to Dashboard
          </button>
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-[#6EE890]" />
        )}
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
          <Image
            src="/logos/cloudact-logo-black.svg"
            alt="CloudAct"
            width={160}
            height={32}
            className="h-8 w-auto"
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
        <span>&copy; {new Date().getFullYear()} CloudAct Inc. All rights reserved.</span>
        <span className="mx-1 sm:mx-2">·</span>
        <Link href="/privacy" className="hover:text-gray-600 transition-colors">Privacy</Link>
        <span className="mx-1 sm:mx-2">·</span>
        <Link href="/terms" className="hover:text-gray-600 transition-colors">Terms</Link>
      </div>
    </div>
  )
}
