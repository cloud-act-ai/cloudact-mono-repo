"use client"

/**
 * Pipeline Auto-Trigger Component
 *
 * Silently checks pipeline status and triggers if needed on dashboard load.
 * Runs in background without blocking UI.
 *
 * Flow:
 * 1. On mount, check pipeline status via API (getPipelineStatus)
 * 2. For each pipeline, check if:
 *    - NOT currently running (status !== "RUNNING" && status !== "PENDING")
 *    - NOT completed today (succeeded_today === false)
 * 3. Only trigger pipelines that meet both conditions
 * 4. Call callbacks for success/error handling
 *
 * Duplicate Prevention:
 * - Frontend: localStorage debounce (1 min) prevents rapid re-checks
 * - Backend: Pipeline service has atomic INSERT with duplicate check
 *   Even if 10 users trigger simultaneously, only 1 execution happens
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
 * - #20: Added localStorage debouncing to prevent rapid re-triggers
 * - #22: Explicit check-then-trigger flow with status validation
 */

import { useEffect, useRef, useCallback } from "react"
import {
  getPipelineStatus,
  triggerPipelineViaApi,
  type DailyPipelineCheckResult,
} from "@/actions/pipeline-status"
import { getMonthStartUTC, getTodayDateUTC } from "@/lib/api/helpers"

// ============================================
// Pipeline Configuration
// ============================================
const DAILY_PIPELINES = [
  {
    id: "saas_subscription_costs",
    path: "saas_subscription/costs/saas_cost",
    description: "SaaS subscription cost calculation",
  },
  // Future pipelines:
  // { id: "gcp_billing", path: "gcp/cost/billing", description: "GCP billing extraction" },
  // { id: "llm_costs", path: "llm/cost/usage", description: "LLM API usage costs" },
]

// ============================================
// Debounce Configuration
// ============================================
const DEBOUNCE_KEY_PREFIX = "pipeline-auto-trigger-"
const DEBOUNCE_MS = 60000 // 1 minute debounce between triggers for same org

/**
 * Check if we should debounce (skip) this trigger based on localStorage.
 * Returns true if we should skip (too soon since last trigger).
 */
function shouldDebounce(orgSlug: string): boolean {
  if (typeof window === "undefined") return false

  const key = `${DEBOUNCE_KEY_PREFIX}${orgSlug}`
  const lastCheck = localStorage.getItem(key)

  if (!lastCheck) return false

  const lastCheckTime = parseInt(lastCheck, 10)
  const now = Date.now()

  return now - lastCheckTime < DEBOUNCE_MS
}

/**
 * Record the current time as the last trigger time for this org.
 */
function recordCheck(orgSlug: string): void {
  if (typeof window === "undefined") return

  const key = `${DEBOUNCE_KEY_PREFIX}${orgSlug}`
  localStorage.setItem(key, String(Date.now()))
}

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
  }, [onTriggered, onError, onComplete])

  // Stable check-then-trigger function
  const runCheck = useCallback(async () => {
    const result: DailyPipelineCheckResult = {
      triggered: [],
      skipped: [],
      already_running: [],
      errors: [],
    }

    try {
      // ============================================
      // STEP 1: Check pipeline status via API
      // ============================================
      if (debug) {
        console.log(`[PipelineAutoTrigger] Step 1: Checking pipeline status for ${orgSlug}`)
      }

      const status = await getPipelineStatus(orgSlug)

      if (!status) {
        console.warn(`[PipelineAutoTrigger] Could not get pipeline status for ${orgSlug}`)
        result.errors.push("Failed to get pipeline status")
        onErrorRef.current?.(result.errors)
        onCompleteRef.current?.(result)
        return
      }

      if (debug) {
        console.log(`[PipelineAutoTrigger] Status received:`, status)
      }

      // ============================================
      // STEP 2: Check each pipeline and trigger if needed
      // ============================================
      for (const pipeline of DAILY_PIPELINES) {
        const pipelineStatus = status.pipelines?.[pipeline.id]

        if (debug) {
          console.log(`[PipelineAutoTrigger] Checking ${pipeline.id}:`, pipelineStatus)
        }

        // Check 1: Already completed today? → Skip
        if (pipelineStatus?.succeeded_today) {
          console.log(`[PipelineAutoTrigger] ${pipeline.id}: Already completed today, skipping`)
          result.skipped.push(pipeline.id)
          continue
        }

        // Check 2: Currently running or pending? → Skip
        if (pipelineStatus?.status === "RUNNING" || pipelineStatus?.status === "PENDING") {
          console.log(`[PipelineAutoTrigger] ${pipeline.id}: Currently ${pipelineStatus.status}, skipping`)
          result.already_running.push(pipeline.id)
          continue
        }

        // Check 3: Ran today but failed? → Log and retry
        if (pipelineStatus?.ran_today && !pipelineStatus?.succeeded_today) {
          console.log(`[PipelineAutoTrigger] ${pipeline.id}: Failed today, retrying`)
        }

        // ============================================
        // STEP 3: Trigger pipeline (not running, not completed)
        // ============================================
        console.log(`[PipelineAutoTrigger] ${pipeline.id}: Triggering pipeline...`)

        const triggerResult = await triggerPipelineViaApi(
          orgSlug,
          pipeline.path,
          getMonthStartUTC(),
          getTodayDateUTC()
        )

        if (triggerResult.success) {
          console.log(`[PipelineAutoTrigger] ${pipeline.id}: Triggered successfully`)
          result.triggered.push(pipeline.id)
        } else {
          // Check if error indicates already running (race condition)
          if (triggerResult.error?.includes("already running")) {
            console.log(`[PipelineAutoTrigger] ${pipeline.id}: Already running (race condition)`)
            result.already_running.push(pipeline.id)
          } else {
            console.warn(`[PipelineAutoTrigger] ${pipeline.id}: Trigger failed - ${triggerResult.error}`)
            result.errors.push(`${pipeline.id}: ${triggerResult.error}`)
          }
        }
      }

      // ============================================
      // STEP 4: Report results via callbacks
      // ============================================
      if (debug || result.triggered.length > 0) {
        console.log(`[PipelineAutoTrigger] Summary:`, {
          triggered: result.triggered,
          skipped: result.skipped,
          already_running: result.already_running,
          errors: result.errors,
        })
      }

      if (result.triggered.length > 0) {
        onTriggeredRef.current?.(result.triggered)
      }

      if (result.errors.length > 0) {
        onErrorRef.current?.(result.errors)
      }

      onCompleteRef.current?.(result)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      console.warn(`[PipelineAutoTrigger] Check failed:`, error)
      result.errors.push(errorMessage)
      onErrorRef.current?.(result.errors)
      onCompleteRef.current?.(result)
    }
  }, [orgSlug, debug])

  useEffect(() => {
    // FIX #6: Reset hasChecked when org changes
    if (lastOrgSlug.current !== orgSlug) {
      if (debug && lastOrgSlug.current !== null) {
        console.log(`[PipelineAutoTrigger] Org changed from ${lastOrgSlug.current} to ${orgSlug}, resetting check`)
      }
      hasChecked.current = false
      lastOrgSlug.current = orgSlug
    }

    // Only run once per org (in-memory check)
    if (hasChecked.current) {
      return
    }

    // FIX #20: localStorage debounce - prevent duplicate triggers on rapid login/refresh
    // This persists across page refreshes/re-mounts within the debounce window
    if (shouldDebounce(orgSlug)) {
      if (debug) {
        console.log(`[PipelineAutoTrigger] Debounced - checked recently for ${orgSlug}`)
      }
      hasChecked.current = true // Mark as checked to prevent retries in this session
      return
    }

    hasChecked.current = true

    // Record check time BEFORE running (prevents race conditions)
    recordCheck(orgSlug)

    // Small delay to let page render first
    const timeoutId = setTimeout(runCheck, 1000)

    return () => clearTimeout(timeoutId)
  }, [orgSlug, debug, runCheck])

  // Render nothing - this is a silent background operation
  return null
}
