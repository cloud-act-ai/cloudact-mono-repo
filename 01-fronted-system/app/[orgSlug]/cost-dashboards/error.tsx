"use client"

import { useEffect } from "react"
import { AlertCircle, RefreshCw, Home } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function CostDashboardsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error for debugging
    console.error("[CostDashboards Error]", error)
    console.error("[CostDashboards Error] Stack:", error.stack)

    // Check if it's an auth error and redirect to login
    if (
      error.message?.includes("Refresh Token") ||
      error.message?.includes("refresh_token") ||
      error.message?.includes("not authenticated") ||
      error.message?.includes("JWT")
    ) {
      console.log("[CostDashboards Error] Auth error detected, redirecting to login")
      window.location.href = "/login?reason=session_expired"
    }
  }, [error])

  return (
    <div className="flex items-center justify-center p-4 min-h-[60vh]">
      <div className="metric-card max-w-md mx-auto px-6 py-10 text-center space-y-6">
        <AlertCircle className="h-14 w-14 text-[#FF6E50] mx-auto" />
        <div className="space-y-2">
          <h2 className="text-[22px] font-bold text-black">Something went wrong</h2>
          <p className="text-[15px] text-muted-foreground leading-relaxed">
            We encountered an error loading this page. Please try again.
          </p>
        </div>

        {process.env.NODE_ENV === "development" && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left">
            <p className="text-sm font-mono text-red-800 break-all">
              {error.message}
            </p>
            {error.digest && (
              <p className="text-xs text-red-600 mt-2">Digest: {error.digest}</p>
            )}
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <Button
            onClick={reset}
            className="cloudact-btn-primary"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.href = "/"}
          >
            <Home className="h-4 w-4 mr-2" />
            Go Home
          </Button>
        </div>
      </div>
    </div>
  )
}
