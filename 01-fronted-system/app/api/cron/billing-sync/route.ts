/**
 * Billing Sync Cron Job
 *
 * This endpoint processes failed billing syncs and runs reconciliation.
 * Should be called by a cron job (e.g., every 5 minutes for retries, daily for reconciliation).
 *
 * Security:
 * - Requires CRON_SECRET header for authentication
 * - Only accessible via POST method
 *
 * Actions:
 * - action=retry: Process pending sync queue items
 * - action=reconcile: Full Stripe→BigQuery reconciliation (heavy, run daily)
 * - action=stats: Get queue statistics (for monitoring)
 */

import { NextRequest, NextResponse } from "next/server"
import { processPendingSyncs, getSyncQueueStats, syncSubscriptionToBackend } from "@/actions/backend-onboarding"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import type Stripe from "stripe"

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace("Bearer ", "")
  const expectedSecret = process.env.CRON_SECRET

  if (!expectedSecret) {
    return process.env.NODE_ENV === "development"
  }

  return cronSecret === expectedSecret
}

export async function POST(request: NextRequest) {
  // Verify authentication
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const action = body.action || "retry"

    switch (action) {
      case "retry":
        return handleRetry(body.limit)

      case "reconcile":
        return handleReconciliation()

      case "stats":
        return handleStats()

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal error"
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * Process pending sync retries
 */
async function handleRetry(limit: number = 10) {
  const result = await processPendingSyncs(limit)

  return NextResponse.json({
    action: "retry",
    ...result,
    timestamp: new Date().toISOString(),
  })
}

/**
 * Full reconciliation: Compare Stripe subscriptions with Supabase and sync
 */
async function handleReconciliation() {
  const adminClient = createServiceRoleClient()
  const results = {
    checked: 0,
    synced: 0,
    errors: [] as string[],
    mismatches: [] as { orgSlug: string; field: string; stripe: unknown; supabase: unknown }[],
  }

  try {
    // Get all organizations with Stripe subscriptions
    const { data: orgs, error: orgsError } = await adminClient
      .from("organizations")
      .select("id, org_slug, stripe_subscription_id, billing_status, plan, seat_limit, providers_limit, pipelines_per_day_limit")
      .not("stripe_subscription_id", "is", null)
      .limit(100)

    if (orgsError) {
      throw new Error(`Failed to fetch organizations: ${orgsError.message}`)
    }

    if (!orgs || orgs.length === 0) {
      return NextResponse.json({
        action: "reconcile",
        message: "No organizations with subscriptions found",
        timestamp: new Date().toISOString(),
      })
    }

    // Process each org
    for (const org of orgs) {
      results.checked++

      try {
        // Fetch subscription from Stripe
        const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id!, {
          expand: ["items.data.price.product"],
        })

        // Get plan details
        const priceItem = subscription.items.data[0]?.price
        const product = priceItem?.product

        if (typeof product !== "object" || !product || ("deleted" in product && product.deleted)) {
          results.errors.push(`${org.org_slug}: Invalid product data`)
          continue
        }

        const metadata = (product as Stripe.Product).metadata || {}
        const stripePlanId = metadata.plan_id || (product as Stripe.Product).name.toLowerCase().replace(/\s+/g, "_")
        const stripeStatus = subscription.status

        // Check for mismatches
        const statusMapping: Record<string, string> = {
          trialing: "trialing",
          active: "active",
          past_due: "past_due",
          canceled: "canceled",
          incomplete: "incomplete",
          incomplete_expired: "incomplete",
          paused: "paused",
          unpaid: "past_due",
        }
        const expectedStatus = statusMapping[stripeStatus] || stripeStatus

        // Check plan mismatch
        if (org.plan !== stripePlanId) {
          results.mismatches.push({
            orgSlug: org.org_slug,
            field: "plan",
            stripe: stripePlanId,
            supabase: org.plan,
          })
        }

        // Check status mismatch
        if (org.billing_status !== expectedStatus) {
          results.mismatches.push({
            orgSlug: org.org_slug,
            field: "billing_status",
            stripe: expectedStatus,
            supabase: org.billing_status,
          })
        }

        // Check limit mismatches
        const stripeLimits = {
          seat_limit: parseInt(metadata.teamMembers || "2"),
          providers_limit: parseInt(metadata.providers || "3"),
          pipelines_per_day_limit: parseInt(metadata.pipelinesPerDay || "6"),
          concurrent_pipelines_limit: parseInt(metadata.concurrentPipelines || "2"), // Default to 2 if not set
        }

        if (org.seat_limit !== stripeLimits.seat_limit ||
          org.providers_limit !== stripeLimits.providers_limit ||
          org.pipelines_per_day_limit !== stripeLimits.pipelines_per_day_limit) {
          results.mismatches.push({
            orgSlug: org.org_slug,
            field: "limits",
            stripe: stripeLimits,
            supabase: {
              seat_limit: org.seat_limit,
              providers_limit: org.providers_limit,
              pipelines_per_day_limit: org.pipelines_per_day_limit,
            },
          })
        }

        // If any mismatch found, sync
        const hasMismatch = results.mismatches.some(m => m.orgSlug === org.org_slug)
        if (hasMismatch) {
          // Update Supabase
          const { error: updateError } = await adminClient
            .from("organizations")
            .update({
              plan: stripePlanId,
              billing_status: expectedStatus,
              ...stripeLimits,
            })
            .eq("id", org.id)

          if (updateError) {
            results.errors.push(`${org.org_slug}: Failed to update Supabase: ${updateError.message}`)
          } else {
            // Also sync to backend BigQuery
            const syncResult = await syncSubscriptionToBackend({
              orgSlug: org.org_slug,
              orgId: org.id,
              planName: stripePlanId,
              billingStatus: expectedStatus,
              dailyLimit: stripeLimits.pipelines_per_day_limit,
              monthlyLimit: stripeLimits.pipelines_per_day_limit * 30,
              seatLimit: stripeLimits.seat_limit,
              providersLimit: stripeLimits.providers_limit,
              trialEndsAt: subscription.trial_end
                ? new Date(subscription.trial_end * 1000).toISOString()
                : undefined,
              syncType: 'reconciliation',
            })

            if (syncResult.success) {
              results.synced++
            } else {
              results.errors.push(`${org.org_slug}: Backend sync failed: ${syncResult.error}`)
            }
          }
        }
      } catch (orgErr: unknown) {
        const errMessage = orgErr instanceof Error ? orgErr.message : "Unknown error"
        results.errors.push(`${org.org_slug}: ${errMessage}`)
      }
    }

    return NextResponse.json({
      action: "reconcile",
      ...results,
      timestamp: new Date().toISOString(),
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { action: "reconcile", error: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * Get queue statistics for monitoring
 */
async function handleStats() {
  const stats = await getSyncQueueStats()

  if (!stats) {
    return NextResponse.json(
      { action: "stats", error: "Failed to get stats" },
      { status: 500 }
    )
  }

  return NextResponse.json({
    action: "stats",
    ...stats,
    timestamp: new Date().toISOString(),
  })
}

// Also support GET for simple health check
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const stats = await getSyncQueueStats()

  return NextResponse.json({
    status: "ok",
    queue: stats,
    timestamp: new Date().toISOString(),
  })
}
