"use client"

import { AlertCircle } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <AlertCircle className="h-12 w-12 text-[#FF6E50]" />
      <h2 className="text-lg font-semibold text-[#1C1C1E]">Something went wrong</h2>
      <p className="text-sm text-muted-foreground max-w-md text-center">
        {error.message || "An unexpected error occurred. Please try again."}
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-[#007A78] text-white rounded-lg hover:bg-[#005F5D] transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
