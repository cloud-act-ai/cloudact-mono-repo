/**
 * Onboarding Progress Indicator
 *
 * FIX GAP-006: Real-time progress indicator for 10-30 second backend onboarding
 * Shows multi-stage progress with status updates
 *
 * Usage:
 *   <OnboardingProgress stages={stages} />
 */

import { CheckCircle, Loader2, AlertTriangle, Circle } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ProgressStage {
  label: string
  status: "pending" | "in_progress" | "completed" | "error"
  timestamp?: Date
  errorMessage?: string
}

interface OnboardingProgressProps {
  stages: ProgressStage[]
  className?: string
}

export function OnboardingProgress({ stages, className }: OnboardingProgressProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {stages.map((stage, idx) => (
        <div key={idx} className="flex items-start gap-3">
          {/* Status Icon */}
          <div className="flex-shrink-0 mt-0.5">
            {stage.status === "completed" && (
              <CheckCircle className="h-5 w-5 text-[#6EE890]" />
            )}
            {stage.status === "in_progress" && (
              <Loader2 className="h-5 w-5 animate-spin text-[#6EE890]" />
            )}
            {stage.status === "pending" && (
              <Circle className="h-5 w-5 text-gray-300" />
            )}
            {stage.status === "error" && (
              <AlertTriangle className="h-5 w-5 text-[#FF6C5E]" />
            )}
          </div>

          {/* Stage Label and Details */}
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "text-sm font-medium transition-colors",
                stage.status === "completed" && "text-gray-400 line-through",
                stage.status === "in_progress" && "text-gray-900",
                stage.status === "pending" && "text-gray-500",
                stage.status === "error" && "text-[#FF6C5E]"
              )}
            >
              {stage.label}
            </p>

            {/* Timestamp for completed stages */}
            {stage.status === "completed" && stage.timestamp && (
              <p className="text-xs text-gray-400 mt-0.5">
                Completed {formatTimestamp(stage.timestamp)}
              </p>
            )}

            {/* Error message for failed stages */}
            {stage.status === "error" && stage.errorMessage && (
              <p className="text-xs text-[#FF6C5E] mt-1">
                {stage.errorMessage}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Format timestamp relative to now
 */
function formatTimestamp(timestamp: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - timestamp.getTime()
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 1) return "just now"
  if (diffSec < 60) return `${diffSec}s ago`

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHour = Math.floor(diffMin / 60)
  return `${diffHour}h ago`
}

/**
 * Helper to create initial stage configuration
 */
export function createOnboardingStages(): ProgressStage[] {
  return [
    {
      label: "Verifying payment",
      status: "pending",
    },
    {
      label: "Creating organization",
      status: "pending",
    },
    {
      label: "Setting up workspace (dataset + data tables)",
      status: "pending",
    },
    {
      label: "Generating API key",
      status: "pending",
    },
    {
      label: "Finalizing setup",
      status: "pending",
    },
  ]
}

/**
 * Helper to update stage status
 */
export function updateStageStatus(
  stages: ProgressStage[],
  index: number,
  status: ProgressStage["status"],
  errorMessage?: string
): ProgressStage[] {
  return stages.map((stage, idx) => {
    if (idx === index) {
      return {
        ...stage,
        status,
        timestamp: status === "completed" ? new Date() : stage.timestamp,
        errorMessage: status === "error" ? errorMessage : undefined,
      }
    }
    return stage
  })
}

/**
 * Helper to get current stage index
 */
export function getCurrentStageIndex(stages: ProgressStage[]): number {
  return stages.findIndex(stage => stage.status === "in_progress")
}

/**
 * Helper to mark stage as completed and move to next
 */
export function completeStageAndMoveNext(
  stages: ProgressStage[],
  currentIndex: number
): ProgressStage[] {
  let updated = updateStageStatus(stages, currentIndex, "completed")

  // Mark next stage as in_progress
  if (currentIndex + 1 < stages.length) {
    updated = updateStageStatus(updated, currentIndex + 1, "in_progress")
  }

  return updated
}
