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
    // Log error to console in development, could send to error tracking in production
    console.error("[GlobalError]", error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-[#FF6E50]/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-[#FF6E50]" />
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
          <Button onClick={reset} className="bg-[#007A78] hover:bg-[#005F5D] text-white">
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
            className="text-[#007A78] hover:text-[#005F5D] hover:underline font-medium"
          >
            support
          </a>
        </p>
      </div>
    </div>
  )
}
