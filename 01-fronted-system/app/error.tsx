"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"
import Link from "next/link"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Guard against SSR - window is not available during server-side rendering
    if (typeof window === "undefined") return

    // Check if it's an auth error and redirect to login
    const isAuthError =
      error.message?.includes("Refresh Token") ||
      error.message?.includes("refresh_token") ||
      error.message?.includes("not authenticated") ||
      error.message?.includes("Invalid Refresh Token") ||
      error.message?.includes("JWT")

    if (isAuthError) {
      window.location.href = "/login?reason=session_expired"
      return
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error.digest])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-coral/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-coral" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Something went wrong</h1>
          <p className="text-muted-foreground">
            An unexpected error occurred. Our team has been notified.
          </p>
        </div>

        {process.env.NODE_ENV === "development" && error.message && (
          <div className="p-4 bg-muted rounded-lg text-left">
            <p className="text-sm font-mono text-muted-foreground break-all">
              {error.message}
            </p>
            {error.digest && (
              <p className="text-xs text-muted-foreground mt-2">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset} className="bg-mint hover:bg-mint-dark text-black">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <Home className="h-4 w-4 mr-2" />
              Go home
            </Link>
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          If this problem persists, please contact{" "}
          <a
            href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@cloudact.ai"}`}
            className="text-ca-blue hover:underline font-medium"
          >
            support
          </a>
        </p>
      </div>
    </div>
  )
}
