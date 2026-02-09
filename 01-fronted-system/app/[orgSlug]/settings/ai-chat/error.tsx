"use client"

import { AlertTriangle } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-4">
      <AlertTriangle className="h-8 w-8 text-red-400" />
      <p className="text-sm text-slate-400">Failed to load AI Chat settings</p>
      <button
        onClick={reset}
        className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
      >
        Try again
      </button>
    </div>
  )
}
