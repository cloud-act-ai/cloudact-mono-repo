"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"
import Link from "next/link"

export default function PipelinesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error for debugging (in production, send to error tracking service)
    if (process.env.NODE_ENV === "development") {
      console.error("[Pipelines] Error:", error)
    }
    // In production, you would send this to your error tracking service (e.g., Sentry)
    // Example: captureException(error)
  }, [error])

  return (
    <div className="space-y-6 sm:space-y-8 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight">Pipelines Error</h1>
        <p className="text-[15px] text-muted-foreground mt-1">
          Something went wrong while loading your pipelines.
        </p>
      </div>

      {/* Error Card - Apple Health Style */}
      <div className="health-card bg-[#FF6E50]/10 border-[#FF6E50]/20">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[#FF6E50]/15 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-[#FF6E50]" />
          </div>
          <div className="flex-1 space-y-3">
            <h3 className="text-[17px] font-semibold text-black">An Error Occurred</h3>
            <p className="text-[15px] text-muted-foreground">
              We encountered an error while loading your pipelines. This could be a temporary issue.
              Please try refreshing the page or contact support if the problem persists.
            </p>
            {error.digest && (
              <div className="bg-[#007A78]/5 rounded-xl p-3 border border-[#E5E5EA]">
                <p className="text-[13px] font-semibold text-black mb-1">Error Reference ID:</p>
                <p className="text-[11px] font-mono text-muted-foreground">{error.digest}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center justify-center gap-2 h-[44px] px-6 bg-[#007A78] text-white text-[15px] font-semibold rounded-xl hover:bg-[#005F5D] transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
        <Link href="/">
          <button className="inline-flex items-center justify-center gap-2 h-[44px] px-6 bg-[#007A78]/5 text-muted-foreground text-[15px] font-semibold rounded-xl hover:bg-[#007A78]/10 transition-colors w-full sm:w-auto">
            <Home className="h-4 w-4" />
            Go Home
          </button>
        </Link>
      </div>

      {/* Support Contact */}
      <div className="text-center pt-4">
        <p className="text-[13px] text-muted-foreground">
          If this problem persists, please contact{" "}
          <a
            href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@cloudact.ai"}`}
            className="text-[#007A78] font-semibold hover:underline"
          >
            support
          </a>
        </p>
      </div>
    </div>
  )
}
