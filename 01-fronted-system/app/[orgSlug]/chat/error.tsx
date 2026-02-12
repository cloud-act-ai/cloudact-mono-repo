"use client"

import { useEffect } from "react"
import { AlertCircle, RotateCcw } from "lucide-react"

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Chat error:", error)
  }, [error])

  return (
    <div className="flex h-full items-center justify-center bg-white dark:bg-slate-950 px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="h-8 w-8 text-red-500 dark:text-red-400" />
        </div>
        <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">Something went wrong</h2>
        <p className="mb-6 text-sm text-gray-500 dark:text-slate-400">
          The chat encountered an unexpected error. This has been logged.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-[#90FCA6] px-6 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-[#7dec94]"
        >
          <RotateCcw className="h-4 w-4" />
          Try Again
        </button>
      </div>
    </div>
  )
}
