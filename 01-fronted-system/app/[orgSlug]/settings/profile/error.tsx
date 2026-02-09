"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, RefreshCw, Home } from "lucide-react"
import Link from "next/link"

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
  }, [error])

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <Card className="border-coral/30">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-coral/10 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-coral" />
          </div>
          <CardTitle className="text-lg">Something went wrong</CardTitle>
          <CardDescription>
            We encountered an error while loading your settings. This could be a temporary issue.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Unable to load settings</p>
            <p>Please try again or contact support if the problem persists.</p>
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
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Go to Dashboard
            </Link>
          </Button>
        </CardFooter>
      </Card>
      <p className="text-center text-sm text-muted-foreground mt-6">
        If this problem persists, please contact{" "}
        <a
          href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@cloudact.ai"}`}
          className="text-ca-blue hover:underline font-medium"
        >
          support
        </a>
      </p>
    </div>
  )
}
