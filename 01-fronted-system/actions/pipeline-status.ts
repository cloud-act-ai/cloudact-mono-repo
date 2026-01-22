"use server"

/**
 * Pipeline Status Actions
 *
 * Centralized pipeline management:
 * - Check if pipelines ran today
 * - Auto-trigger on dashboard load (if not ran)
 * - Route all triggers through API service (8000)
 *
 * Race Condition Handling:
 * Pipeline service has atomic INSERT with duplicate check.
 * Even if 10 users trigger simultaneously, only 1 execution happens.
 *
 * Fixes applied:
 * - #1: Use UTC dates consistently (getMonthStartUTC, getTodayDateUTC)
 * - #9: Use shared helpers from lib/api/helpers.ts
 */

import { getCachedApiKey } from "@/lib/auth-cache"
import {
  getApiServiceUrl,
  fetchWithTimeout,
  getMonthStartUTC,
  getTodayDateUTC,
} from "@/lib/api/helpers"

// ============================================
// Types
// ============================================

interface PipelineRunStatus {
  pipeline_id: string
  last_run: string | null
  status: string | null
  ran_today: boolean
  succeeded_today: boolean
}

interface PipelineStatusResponse {
  org_slug: string
  check_date: string
  pipelines: Record<string, PipelineRunStatus>
  cached?: boolean
}

interface PipelineTriggerResult {
  success: boolean
  pipeline_logging_id?: string
  message?: string
  error?: string
}

export interface DailyPipelineCheckResult {
  triggered: string[]
  skipped: string[]
  errors: string[]
  already_running: string[]
}

// ============================================
// Pipeline Status Check
// ============================================

/**
 * Check which pipelines ran today for an organization.
 * Calls API service (8000) which queries org_meta_pipeline_runs.
 *
 * @param orgSlug - Organization slug
 * @returns Pipeline status for known pipeline types
 */
export async function getPipelineStatus(
  orgSlug: string
): Promise<PipelineStatusResponse | null> {
  try {
    const orgApiKey = await getCachedApiKey(orgSlug)
    if (!orgApiKey) {
      
      return null
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/pipelines/status/${orgSlug}`,
      {
        method: "GET",
        headers: {
          "X-API-Key": orgApiKey,
        },
      },
      30000 // 30 second timeout for status check (BigQuery can be slow on cold start)
    )

    if (!response.ok) {

      return null
    }

    // Defensive JSON parsing - even successful responses could have malformed JSON
    try {
      return await response.json()
    } catch {
      return null
    }
  } catch (pipelineError) {
    // Log pipeline status fetch errors for debugging
    if (process.env.NODE_ENV === "development") {
      console.warn("[getPipelineStatus] Failed to fetch status:", pipelineError)
    }
    return null
  }
}

// ============================================
// Pipeline Trigger (via API Service)
// ============================================

/**
 * Trigger a pipeline through API service (8000).
 * API service proxies to pipeline service (8001).
 *
 * @param orgSlug - Organization slug
 * @param pipelinePath - Pipeline path (e.g., "subscription/costs/subscription_cost")
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD), defaults to today (UTC)
 * @returns Trigger result
 */
export async function triggerPipelineViaApi(
  orgSlug: string,
  pipelinePath: string,
  startDate?: string,
  endDate?: string
): Promise<PipelineTriggerResult> {
  try {
    const orgApiKey = await getCachedApiKey(orgSlug)
    if (!orgApiKey) {
      return { success: false, error: "No API key for organization" }
    }

    const apiUrl = getApiServiceUrl()
    // FIX #1: Use UTC dates consistently
    const today = getTodayDateUTC()
    const actualStartDate = startDate || getMonthStartUTC()
    const actualEndDate = endDate || today

    

    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/pipelines/trigger/${orgSlug}/${pipelinePath}`,
      {
        method: "POST",
        headers: {
          "X-API-Key": orgApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          start_date: actualStartDate,
          end_date: actualEndDate,
        }),
      },
      60000 // 60 second timeout for pipeline triggers
    )

    if (!response.ok) {
      const errorText = await response.text()

      return {
        success: false,
        error: `Pipeline trigger failed: ${errorText}`,
      }
    }

    // Defensive JSON parsing
    let result: { pipeline_logging_id?: string; message?: string }
    try {
      result = await response.json()
    } catch {
      return {
        success: false,
        error: "Invalid response from pipeline service",
      }
    }

    return {
      success: true,
      pipeline_logging_id: result.pipeline_logging_id,
      message: result.message || "Pipeline triggered successfully",
    }
  } catch (error) {
    
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// ============================================
// Daily Pipeline Auto-Trigger
// ============================================

/**
 * Pipeline configuration for auto-trigger
 */
const DAILY_PIPELINES = [
  {
    id: "subscription_costs",
    path: "subscription/costs/subscription_cost",
    description: "Subscription cost calculation",
  },
  // Future pipelines:
  // { id: "gcp_billing", path: "gcp/cost/billing", description: "GCP billing extraction" },
  // { id: "llm_costs", path: "llm/cost/usage", description: "LLM API usage costs" },
]

/**
 * Check and trigger daily pipelines if they haven't run today.
 * Called on dashboard load to ensure cost data is fresh.
 *
 * Flow:
 * 1. GET /pipelines/status/{org} - Check which pipelines ran today
 * 2. For each pipeline not ran today:
 *    POST /pipelines/trigger/{org}/{path} - Trigger pipeline
 * 3. Return summary of triggered/skipped/errors
 *
 * Race Conditions:
 * Pipeline service handles concurrent triggers atomically.
 * If 10 users login simultaneously, only 1 pipeline execution happens.
 *
 * @param orgSlug - Organization slug
 * @returns Summary of triggered, skipped, and error pipelines
 */
export async function checkAndTriggerDailyPipelines(
  orgSlug: string
): Promise<DailyPipelineCheckResult> {
  const result: DailyPipelineCheckResult = {
    triggered: [],
    skipped: [],
    errors: [],
    already_running: [],
  }

  try {
    // 1. Check status first
    const status = await getPipelineStatus(orgSlug)

    // 2. Process each pipeline
    for (const pipeline of DAILY_PIPELINES) {
      const pipelineStatus = status?.pipelines?.[pipeline.id]

      // Skip if already succeeded today
      if (pipelineStatus?.succeeded_today) {
        
        result.skipped.push(pipeline.id)
        continue
      }

      // Skip if already running (status check returned ran_today but not succeeded)
      if (pipelineStatus?.ran_today && !pipelineStatus?.succeeded_today) {
        // Check if it's still running
        if (pipelineStatus?.status === "RUNNING" || pipelineStatus?.status === "PENDING") {
          
          result.already_running.push(pipeline.id)
          continue
        }
        // Otherwise it failed today - we should retry
        
      }

      // Trigger pipeline (using UTC dates)
      const triggerResult = await triggerPipelineViaApi(
        orgSlug,
        pipeline.path,
        getMonthStartUTC(), // Start from beginning of month
        getTodayDateUTC()   // End today
      )

      if (triggerResult.success) {
        result.triggered.push(pipeline.id)
      } else {
        // Check if error indicates already running
        if (triggerResult.error?.includes("already running")) {
          result.already_running.push(pipeline.id)
        } else {
          result.errors.push(`${pipeline.id}: ${triggerResult.error}`)
        }
      }
    }

    return result
  } catch (error) {
    
    result.errors.push(error instanceof Error ? error.message : "Unknown error")
    return result
  }
}

// ============================================
// Force Trigger (For Plan Changes)
// ============================================

/**
 * Force trigger SaaS cost pipeline after plan changes.
 * Called after create/update/delete of subscription plans.
 * Does NOT check if already ran today - always triggers.
 *
 * @param orgSlug - Organization slug
 * @param startDate - Start date for cost calculation (use plan start_date for backfill)
 * @returns Trigger result
 */
export async function forceTriggerSaaSCostPipeline(
  orgSlug: string,
  startDate?: string
): Promise<PipelineTriggerResult> {
  

  return triggerPipelineViaApi(
    orgSlug,
    "subscription/costs/subscription_cost",
    startDate || getMonthStartUTC(),
    getTodayDateUTC()
  )
}
