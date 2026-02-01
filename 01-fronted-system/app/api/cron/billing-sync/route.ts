/**
 * Billing Sync Cron Endpoint
 * ==========================
 * Process billing sync queue and reconciliation.
 *
 * Called by Cloud Run Jobs on a schedule:
 * - retry: Every 5 minutes (process pending queue items)
 * - reconcile: Daily at 02:00 UTC (full reconciliation)
 * - stats: Get queue statistics
 *
 * Authentication: x-cron-secret header or Cloud Scheduler OAuth
 */

import { NextRequest, NextResponse } from "next/server"
import { processPendingSyncs, getSyncQueueStats } from "@/actions/backend-onboarding"

// Verify request is from Cloud Scheduler or has valid cron secret
function isAuthorized(req: NextRequest): boolean {
  // Check cron secret header
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = req.headers.get("x-cron-secret")

  if (cronSecret && headerSecret === cronSecret) {
    return true
  }

  // Check Cloud Scheduler headers (Google Cloud Scheduler sends these)
  const cloudSchedulerHeader = req.headers.get("x-cloudscheduler")
  const cloudSchedulerJobName = req.headers.get("x-cloudscheduler-jobname")

  if (cloudSchedulerHeader === "true" || cloudSchedulerJobName) {
    return true
  }

  // In development, allow requests without auth
  if (process.env.NODE_ENV === "development") {
    return true
  }

  // Allow if running in Cloud Run Jobs context (no secret required for internal jobs)
  const userAgent = req.headers.get("user-agent") || ""
  if (userAgent.includes("python-httpx") || userAgent.includes("Google-Cloud-Scheduler")) {
    return true
  }

  return false
}

export async function POST(req: NextRequest) {
  // Verify authorization
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: "Unauthorized - missing or invalid cron secret" },
      { status: 401 }
    )
  }

  try {
    const body = await req.json().catch(() => ({}))
    const action = body.action || "retry"

    switch (action) {
      case "retry": {
        // Process pending sync queue items (default batch: 10)
        const limit = body.limit || 10
        const result = await processPendingSyncs(limit)

        return NextResponse.json({
          action: "retry",
          processed: result.processed,
          succeeded: result.succeeded,
          failed: result.failed,
          errors: result.errors.slice(0, 10), // Limit error messages
        })
      }

      case "reconcile": {
        // Full reconciliation - process a larger batch
        const limit = body.limit || 100
        const result = await processPendingSyncs(limit)

        return NextResponse.json({
          action: "reconcile",
          checked: result.processed,
          synced: result.succeeded,
          mismatches: result.errors,
          errors: result.errors.slice(0, 20),
        })
      }

      case "stats": {
        const stats = await getSyncQueueStats()

        if (!stats) {
          return NextResponse.json(
            { error: "Failed to get queue stats" },
            { status: 500 }
          )
        }

        return NextResponse.json({
          action: "stats",
          pending: stats.pending,
          processing: stats.processing,
          failed: stats.failed,
          completedToday: stats.completedToday,
          oldestPending: stats.oldestPending,
        })
      }

      default:
        return NextResponse.json(
          { error: `Invalid action: ${action}. Valid actions: retry, reconcile, stats` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error("[billing-sync] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

// Support GET for health checks
export async function GET() {
  const stats = await getSyncQueueStats()

  return NextResponse.json({
    status: "ok",
    endpoint: "/api/cron/billing-sync",
    actions: ["retry", "reconcile", "stats"],
    queue: stats || { pending: 0, processing: 0, failed: 0 },
  })
}
