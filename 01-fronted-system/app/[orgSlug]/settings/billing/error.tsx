"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, RefreshCw, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"

export default function BillingError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const params = useParams<{ orgSlug: string }>()

  useEffect(() => {
    // Log error for monitoring
    console.error("[BillingError]", error)
  }, [error])

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <Card className="border-coral/30">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-coral/10 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-coral" />
          </div>
          <CardTitle className="text-lg">Unable to load billing information</CardTitle>
          <CardDescription>
            We encountered an error while loading your billing details. This could be a temporary issue.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Error loading billing</p>
            <p>{error.message || "Please try again or contact support if the problem persists."}</p>
            {error.digest && (
              <p className="mt-2 text-xs">Reference ID: {error.digest}</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-center gap-4">
          <Button onClick={reset} className="bg-mint hover:bg-mint-dark text-black">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/${params.orgSlug}/settings`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Settings
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
