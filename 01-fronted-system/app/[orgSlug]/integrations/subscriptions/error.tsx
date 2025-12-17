"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"
import Link from "next/link"

export default function SubscriptionsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error for debugging (in production, send to error tracking service)
    if (process.env.NODE_ENV === "development") {
      console.error("[Subscriptions] Error:", error)
    }
    // In production, you would send this to your error tracking service (e.g., Sentry)
    // Example: captureException(error)
  }, [error])

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <Card className="border-[#FF6E50]/30">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[#FF6E50]/10 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-[#FF6E50]" />
          </div>
          <CardTitle className="text-xl">Something went wrong</CardTitle>
          <CardDescription>
            We encountered an error while loading your subscriptions. This could be a temporary issue.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          {error.digest && (
            <div className="rounded-lg bg-[#F5F5F7] p-4 text-sm text-[#8E8E93]">
              <p className="font-medium text-black mb-1">Error Reference ID:</p>
              <p className="font-mono text-xs">{error.digest}</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-center gap-4">
          <Button onClick={reset} className="bg-[#007A78] hover:bg-[#005F5D] text-white">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Link>
          </Button>
        </CardFooter>
      </Card>
      <p className="text-center text-sm text-[#8E8E93] mt-6">
        If this problem persists, please contact{" "}
        <a
          href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@cloudact.ai"}`}
          className="text-[#007A78] hover:text-[#005F5D] hover:underline font-medium"
        >
          support
        </a>
      </p>
    </div>
  )
}
