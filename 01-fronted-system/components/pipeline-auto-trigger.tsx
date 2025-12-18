"use client"

/**
 * Pipeline Auto-Trigger Component
 *
 * Silently checks and triggers daily pipelines on dashboard load.
 * Runs in background without blocking UI.
 *
 * Flow:
 * 1. On mount, checks if pipelines ran today via API service
 * 2. Triggers any pipelines that haven't run
 * 3. Calls optional callbacks for success/error handling
 *
 * Race Conditions:
 * Pipeline service handles concurrent triggers atomically.
 * If 10 users login simultaneously, only 1 pipeline execution happens.
 *
 * Multi-Tenancy:
 * - Each org's pipelines are checked/triggered independently
 * - orgSlug is validated server-side against authenticated user
 * - No cross-org data leakage possible
 *
 * Fixes applied:
 * - #4: Added onError and onTriggered callbacks
 * - #6: Reset hasChecked when orgSlug changes
 * - #15: Stabilized callback refs to prevent infinite re-renders
 */

import { useEffect, useRef, useCallback } from "react"
import { checkAndTriggerDailyPipelines, type DailyPipelineCheckResult } from "@/actions/pipeline-status"

interface PipelineAutoTriggerProps {
  orgSlug: string
  /** Enable debug logging to console */
  debug?: boolean
  /**
   * Callback when pipelines are triggered successfully.
   * IMPORTANT: Should be a stable reference (useCallback) to avoid re-renders.
   */
  onTriggered?: (pipelines: string[]) => void
  /**
   * Callback when errors occur.
   * IMPORTANT: Should be a stable reference (useCallback) to avoid re-renders.
   */
  onError?: (errors: string[]) => void
  /**
   * Callback when check completes (with full result).
   * IMPORTANT: Should be a stable reference (useCallback) to avoid re-renders.
   */
  onComplete?: (result: DailyPipelineCheckResult) => void
}

export function PipelineAutoTrigger({
  orgSlug,
  debug = false,
  onTriggered,
  onError,
  onComplete,
}: PipelineAutoTriggerProps) {
  // Track if we've already run the check for THIS org
  const hasChecked = useRef(false)
  // Track the last org we checked to detect org switches
  const lastOrgSlug = useRef<string | null>(null)

  // FIX #15: Store callbacks in refs to avoid dependency issues
  // This prevents infinite re-renders when callbacks are inline functions
  const onTriggeredRef = useRef(onTriggered)
  const onErrorRef = useRef(onError)
  const onCompleteRef = useRef(onComplete)

  // Update refs when callbacks change (but don't trigger effect)
  useEffect(() => {
    onTriggeredRef.current = onTriggered
    onErrorRef.current = onError
    onCompleteRef.current = onComplete
  })

  // Stable check function that reads from refs
  const runCheck = useCallback(async () => {
    try {
      if (debug) {
        console.log(`[PipelineAutoTrigger] Checking pipelines for ${orgSlug}`)
      }

      const result: DailyPipelineCheckResult = await checkAndTriggerDailyPipelines(orgSlug)

      if (debug || result.triggered.length > 0) {
        console.log(`[PipelineAutoTrigger] Result:`, {
          triggered: result.triggered,
          skipped: result.skipped,
          already_running: result.already_running,
          errors: result.errors,
        })
      }

      // FIX #4: Call callbacks via refs
      if (result.triggered.length > 0) {
        console.log(`[PipelineAutoTrigger] Auto-triggered pipelines: ${result.triggered.join(", ")}`)
        onTriggeredRef.current?.(result.triggered)
      }

      if (result.errors.length > 0) {
        console.warn(`[PipelineAutoTrigger] Pipeline errors:`, result.errors)
        onErrorRef.current?.(result.errors)
      }

      // Always call onComplete with full result
      onCompleteRef.current?.(result)

    } catch (error) {
      // Log error and call callback
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      console.warn(`[PipelineAutoTrigger] Background check failed:`, error)

      // FIX #4: Report error through callback
      onErrorRef.current?.([errorMessage])
    }
  }, [orgSlug, debug]) // Only depends on orgSlug and debug, not callbacks

  useEffect(() => {
    // FIX #6: Reset hasChecked when org changes
    if (lastOrgSlug.current !== orgSlug) {
      if (debug && lastOrgSlug.current !== null) {
        console.log(`[PipelineAutoTrigger] Org changed from ${lastOrgSlug.current} to ${orgSlug}, resetting check`)
      }
      hasChecked.current = false
      lastOrgSlug.current = orgSlug
    }

    // Only run once per org
    if (hasChecked.current) {
      return
    }
    hasChecked.current = true

    // Small delay to let page render first
    const timeoutId = setTimeout(runCheck, 1000)

    return () => clearTimeout(timeoutId)
  }, [orgSlug, debug, runCheck])

  // Render nothing - this is a silent background operation
  return null
}
