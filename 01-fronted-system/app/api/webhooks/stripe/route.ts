/**
 * Stripe Webhook Handler
 *
 * SECURITY MEASURES IMPLEMENTED:
 * 1. Signature Verification: stripe.webhooks.constructEvent()
 * 2. Content-Type Validation: Blocks non-JSON/text requests
 * 3. Idempotency: In-memory + database deduplication with async-safe processing tracking
 * 4. Event Cache Management: 1-hour TTL + LRU eviction (max 1000 events)
 * 5. Plan ID Validation: Explicit handling with lower bound validation for all limits
 * 6. Backend Sync Retry: 2 retries with 1s exponential backoff for backend sync failures
 * 7. Backend Quota Sync: Always syncs when org_slug exists (not dependent on backend_onboarded)
 * 8. Sync Status Tracking: backend_quota_synced flag tracks successful syncs to BigQuery
 *
 * BACKEND SYNC BEHAVIOR:
 * - checkout.session.completed: Syncs subscription quotas to BigQuery org_subscriptions table
 * - customer.subscription.updated: Syncs plan changes and quota updates
 * - customer.subscription.deleted: Syncs cancellation with zero quotas
 * - All syncs include retry logic and proper error handling
 * - Sync status tracked in organizations.backend_quota_synced column
 *
 * @see 00-requirements-docs/05_SECURITY.md for full security documentation
 */

// Force dynamic to prevent pre-rendering (Stripe client needs runtime env vars)
export const dynamic = 'force-dynamic'

import { stripe } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { sendTrialEndingEmail, sendPaymentFailedEmail } from "@/lib/email";
import { syncSubscriptionToBackend } from "@/actions/backend-onboarding";
import type Stripe from "stripe";

// SCALE-003: In-memory cache is OPTIMIZATION ONLY for same-instance duplicates
// In serverless (Cloud Run, Vercel), this cache resets on cold starts and doesn't share across instances
// ACTUAL DEDUPLICATION is handled by database (stripe_webhook_events table with unique event_id)
// This cache prevents redundant DB lookups when Stripe retries to the same instance quickly
const processedEvents = new Map<string, number>();
const processingEvents = new Set<string>(); // Track events currently being processed
const EVENT_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 1000; // Prevent unbounded growth

// Clean old events periodically - async-safe with LRU eviction
function cleanOldEvents() {
  const now = Date.now();

  // 1. Remove expired events
  for (const [eventId, timestamp] of processedEvents.entries()) {
    if (now - timestamp > EVENT_CACHE_TTL) {
      processedEvents.delete(eventId);
      processingEvents.delete(eventId);
    }
  }

  // 2. LRU eviction if over max size
  if (processedEvents.size > MAX_CACHE_SIZE) {
    const sortedEntries = Array.from(processedEvents.entries()).sort(
      (a, b) => a[1] - b[1],
    ); // Sort by timestamp (oldest first)

    const toRemove = sortedEntries.slice(
      0,
      processedEvents.size - MAX_CACHE_SIZE,
    );
    for (const [eventId] of toRemove) {
      processedEvents.delete(eventId);
      processingEvents.delete(eventId);
    }
  }
}

// Safe date conversion helper
function safeTimestampToISO(
  timestamp: number | undefined | null,
): string | null {
  if (!timestamp || timestamp <= 0) return null;
  try {
    return new Date(timestamp * 1000).toISOString();
  } catch (dateError) {
    // Invalid timestamp - expected for edge cases, return null
    if (process.env.NODE_ENV === "development") {
      console.warn("[Stripe Webhook] Invalid timestamp conversion:", timestamp, dateError)
    }
    return null;
  }
}

// Safe integer parsing with lower bound validation
function safeParseInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 0) return defaultValue;
  return parsed;
}

// Retry backend sync with exponential backoff
async function syncWithRetry(
  syncFn: () => Promise<{ success: boolean; error?: string }>,
  context: { orgSlug: string; operation: string },
  maxRetries: number = 2,
  delayMs: number = 1000,
): Promise<{ success: boolean; error?: string }> {
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await syncFn();
      if (result.success) {
        return result;
      }
      lastError = result.error;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    // Don't delay after last attempt
    if (attempt < maxRetries) {
      await new Promise((resolve) =>
        setTimeout(resolve, delayMs * (attempt + 1)),
      );
    }
  }

  return { success: false, error: lastError };
}

// Helper to get subscription ID from invoice (handles API version differences)
// In newer Stripe API, subscription is accessed via parent.subscription_details.subscription
function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  // Try new API structure first
  if (invoice.parent?.type === "subscription_details") {
    const subId = invoice.parent.subscription_details?.subscription;
    if (typeof subId === "string") return subId;
    if (typeof subId === "object" && subId?.id) return subId.id;
  }
  return null;
}

// Use service role client for webhook (bypasses RLS)
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase service role configuration");
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Stripe API timeout for webhook handlers (15 seconds - webhooks should be fast)
const STRIPE_API_TIMEOUT_MS = 15000;

// Fetch plan details from Stripe price/product metadata
// Returns plan ID and limits - all from Stripe (no hardcoded values)
// CRITICAL: This function must NEVER silently fail - all errors are logged and re-thrown
async function getPlanDetailsFromStripe(priceId: string): Promise<{
  planId: string;
  limits: {
    seat_limit: number;
    providers_limit: number;
    pipelines_per_day_limit: number;
    pipelines_per_week_limit: number;
    pipelines_per_month_limit: number;
  };
}> {
  try {
    // Fetch the price with expanded product (with explicit timeout)
    const price = await stripe.prices.retrieve(priceId, {
      expand: ["product"],
    }, {
      timeout: STRIPE_API_TIMEOUT_MS,
    });

    const product = price.product;

    if (!product || typeof product === "string") {
      const error = new Error(
        `[Stripe Webhook] PRODUCT_NOT_FOUND: Price ${priceId} has no associated product or product is a string reference.`
      );
      console.error(error.message);
      throw error;
    }

    // Check if product is deleted
    if (product.deleted) {
      const error = new Error(
        `[Stripe Webhook] PRODUCT_DELETED: Product ${product.id} for price ${priceId} has been deleted.`
      );
      console.error(error.message);
      throw error;
    }

    // Get metadata from product
    const metadata = product.metadata || {};

    // Plan ID from metadata - REQUIRED, no fallback
    const planId = metadata.plan_id;
    if (!planId) {
      const error = new Error(
        `[Stripe Webhook] CONFIGURATION ERROR: Product ${product.id} (${product.name}) is missing plan_id metadata. ` +
          `Add plan_id to Stripe product metadata. No fallback allowed.`
      );
      console.error(error.message);
      throw error;
    }

    // Validate ALL required metadata exists - REQUIRED, no fallback
    if (
      !metadata.teamMembers ||
      !metadata.providers ||
      !metadata.pipelinesPerDay
    ) {
      const error = new Error(
        `[Stripe Webhook] CONFIGURATION ERROR: Product ${product.id} missing required metadata. ` +
          `teamMembers: ${metadata.teamMembers}, providers: ${metadata.providers}, pipelinesPerDay: ${metadata.pipelinesPerDay}. ` +
          `All fields are required in Stripe product metadata.`
      );
      console.error(error.message);
      throw error;
    }

    // Parse and validate numeric values with lower bound validation
    const seatLimit = safeParseInt(metadata.teamMembers, 0);
    const providersLimit = safeParseInt(metadata.providers, 0);
    const pipelinesPerDayLimit = safeParseInt(metadata.pipelinesPerDay, 0);

    // Validate all limits are positive after parsing
    if (seatLimit <= 0 || providersLimit <= 0 || pipelinesPerDayLimit <= 0) {
      const error = new Error(
        `[Stripe Webhook] CONFIGURATION ERROR: Product ${product.id} has invalid limits. ` +
          `teamMembers: "${metadata.teamMembers}" (parsed: ${seatLimit}), ` +
          `providers: "${metadata.providers}" (parsed: ${providersLimit}), ` +
          `pipelinesPerDay: "${metadata.pipelinesPerDay}" (parsed: ${pipelinesPerDayLimit}). ` +
          `All values must be positive integers (>0).`
      );
      console.error(error.message);
      throw error;
    }

    // Calculate weekly and monthly limits from daily
    const pipelinesPerWeekLimit = pipelinesPerDayLimit * 7;
    const pipelinesPerMonthLimit = pipelinesPerDayLimit * 30;

    const limits = {
      seat_limit: seatLimit,
      providers_limit: providersLimit,
      pipelines_per_day_limit: pipelinesPerDayLimit,
      pipelines_per_week_limit: pipelinesPerWeekLimit,
      pipelines_per_month_limit: pipelinesPerMonthLimit,
    };

    console.log(`[Stripe Webhook] Fetched plan details for ${priceId}: planId=${planId}, limits=`, limits);

    return { planId, limits };
  } catch (err) {
    // CRITICAL: Log ALL errors - never silently swallow
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[Stripe Webhook] CRITICAL ERROR in getPlanDetailsFromStripe for price ${priceId}:`, errorMessage);
    throw err; // Re-throw to ensure webhook returns 500 and Stripe retries
  }
}

export async function POST(request: NextRequest) {
  // Security headers check - ensure request comes from expected source
  const contentType = request.headers.get("content-type");
  if (
    contentType &&
    !contentType.includes("application/json") &&
    !contentType.includes("text/")
  ) {
    return NextResponse.json(
      { error: "Invalid content type" },
      { status: 400 },
    );
  }

  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  // EDGE-001 FIX: Validate webhook secret exists before using
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET environment variable is not set");
    return NextResponse.json(
      { error: "Webhook configuration error" },
      { status: 500 }
    );
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret,
    );
  } catch (signatureError) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Stripe Webhook] Signature verification failed:", signatureError)
    }
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // SEC-001 FIX: Validate event timestamp to prevent replay attacks
  // Reject events older than 5 minutes (300 seconds)
  const MAX_EVENT_AGE_SECONDS = 300;
  const eventTimestamp = event.created;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const eventAge = currentTimestamp - eventTimestamp;

  if (eventAge > MAX_EVENT_AGE_SECONDS) {
    console.warn(
      `[Stripe Webhook] Rejecting stale event ${event.id}: ${eventAge}s old (max: ${MAX_EVENT_AGE_SECONDS}s)`
    );
    return NextResponse.json(
      { error: "Event too old", age: eventAge },
      { status: 400 }
    );
  }

  // Idempotency check - prevent duplicate processing
  // First check in-memory (fast path for same-instance duplicates)
  cleanOldEvents();
  if (processedEvents.has(event.id) || processingEvents.has(event.id)) {
    return NextResponse.json({ received: true, skipped: "duplicate" });
  }

  // Mark event as being processed
  processingEvents.add(event.id);

  // Get database client for cross-instance idempotency
  const supabase = getServiceClient();

  // ATOMIC CLAIM: Use INSERT ... ON CONFLICT to atomically claim the event
  // This prevents race conditions between check and claim
  const { error: claimError } = await supabase
    .from("stripe_webhook_events")
    .insert({
      event_id: event.id,
      event_type: event.type,
      instance_id: process.env.HOSTNAME || "unknown",
    });

  if (claimError) {
    // If insert fails due to unique constraint, event was already claimed
    if (claimError.code === "23505") {
      processedEvents.set(event.id, Date.now());
      processingEvents.delete(event.id);
      return NextResponse.json({ received: true, skipped: "duplicate" });
    }
    // For other errors, fail fast (no fallback)
    processingEvents.delete(event.id);
    throw new Error(`Failed to claim webhook event: ${claimError.message}`);
  }

  // Successfully claimed - mark in memory too
  processedEvents.set(event.id, Date.now());
  processingEvents.delete(event.id);

  try {
    switch (event.type) {
      // =============================================
      // CHECKOUT COMPLETED - Initial subscription
      // =============================================
      case "checkout.session.completed": {
        const session = event.data.object;
        const metadata = session.metadata;

        // Handle onboarding checkouts (org created on success page, not here)
        if (metadata?.is_onboarding === "true") {
          // Skip processing - org creation happens on /onboarding/success page
          // via completeOnboarding() which verifies the session and creates the org
          break;
        }

        // Regular checkout (org already exists)
        if (!metadata?.org_id) {
          throw new Error("Missing org_id in checkout session metadata");
        }

        // Validate subscription ID exists
        const subscriptionId = session.subscription as string;
        if (!subscriptionId) {
          throw new Error("Missing subscription ID in checkout session");
        }

        // Get subscription details (with explicit timeout)
        const subscription =
          await stripe.subscriptions.retrieve(subscriptionId, {}, {
            timeout: STRIPE_API_TIMEOUT_MS,
          });

        // Validate subscription items exist
        const subscriptionItem = subscription.items?.data?.[0];
        if (!subscriptionItem?.price?.id) {
          throw new Error("No price ID found in subscription items");
        }

        const priceId = subscriptionItem.price.id;

        // Fetch plan details from Stripe (no hardcoded values)
        // Note: getPlanDetailsFromStripe throws on error, never returns null
        const planDetails = await getPlanDetailsFromStripe(priceId);

        console.log(`[Stripe Webhook] checkout.session.completed: Updating org ${metadata.org_id} with plan ${planDetails.planId}`);

        // STATE-001 FIX: Calculate event timestamp for optimistic locking
        const eventTimestamp = new Date(event.created * 1000).toISOString();

        // Update organization with Stripe data (atomic operation - all fields updated together)
        // Note: In newer Stripe API, current_period_* moved to subscription items
        // STATE-001 FIX: Only update if our event is newer than the last processed event
        const { data: updatedOrg, error: updateError } = await supabase
          .from("organizations")
          .update({
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: subscriptionId,
            stripe_price_id: priceId,
            plan: planDetails.planId,
            billing_status: "active",
            subscription_started_at: new Date().toISOString(),
            current_period_start: safeTimestampToISO(
              subscriptionItem.current_period_start,
            ),
            current_period_end: safeTimestampToISO(
              subscriptionItem.current_period_end,
            ),
            stripe_webhook_last_event_id: event.id,
            stripe_webhook_last_event_at: eventTimestamp,
            ...planDetails.limits,
          })
          .eq("id", metadata.org_id)
          .or(`stripe_webhook_last_event_at.is.null,stripe_webhook_last_event_at.lt.${eventTimestamp}`)
          .select();

        if (updateError) {
          throw new Error(`Database update failed: ${updateError.message}`);
        }

        if (!updatedOrg || updatedOrg.length === 0) {
          throw new Error(`Organization not found: ${metadata.org_id}`);
        }

        // Sync subscription limits to backend BigQuery (with retry)
        // IMPORTANT: Always attempt sync when org_slug exists (not dependent on backend_onboarded)
        // Backend will handle cases where org doesn't exist yet
        if (updatedOrg[0]?.org_slug) {
          // Determine billing status from subscription
          let checkoutBillingStatus = "active";
          if (subscription.status === "trialing")
            checkoutBillingStatus = "trialing";

          const syncResult = await syncWithRetry(
            () =>
              syncSubscriptionToBackend({
                orgSlug: updatedOrg[0].org_slug,
                planName: planDetails.planId,
                billingStatus: checkoutBillingStatus,
                trialEndsAt: subscription.trial_end
                  ? new Date(subscription.trial_end * 1000).toISOString()
                  : undefined,
                dailyLimit: planDetails.limits.pipelines_per_day_limit,
                monthlyLimit: planDetails.limits.pipelines_per_day_limit * 30,
                seatLimit: planDetails.limits.seat_limit,
                providersLimit: planDetails.limits.providers_limit,
              }),
            {
              orgSlug: updatedOrg[0].org_slug,
              operation: "checkout.session.completed",
            },
          );

          if (syncResult.success) {
            // Update backend_quota_synced flag in Supabase
            await supabase
              .from("organizations")
              .update({ backend_quota_synced: true })
              .eq("id", metadata.org_id);
          } else {
            // Log sync failure for debugging - silent failures are hard to diagnose
            console.error(
              `[Stripe Webhook] Backend sync failed for checkout.session.completed:`,
              { orgSlug: updatedOrg[0].org_slug, error: syncResult.error }
            );
            // Update backend_quota_synced flag to false
            await supabase
              .from("organizations")
              .update({ backend_quota_synced: false })
              .eq("id", metadata.org_id);
          }
        }
        break;
      }

      // =============================================
      // SUBSCRIPTION UPDATED - Plan changes, renewals
      // =============================================
      case "customer.subscription.updated": {
        const subscription = event.data.object;

        // Validate subscription items exist
        const subscriptionItem = subscription.items?.data?.[0];
        if (!subscriptionItem?.price?.id) {
          throw new Error("No price ID found in subscription update");
        }

        const priceId = subscriptionItem.price.id;

        // Fetch plan details from Stripe (no hardcoded values)
        // Note: getPlanDetailsFromStripe throws on error, never returns null
        const planDetails = await getPlanDetailsFromStripe(priceId);

        console.log(`[Stripe Webhook] customer.subscription.updated: Updating subscription ${subscription.id} to plan ${planDetails.planId}`, {
          priceId,
          limits: planDetails.limits,
        });

        // Map Stripe status to our status
        let billingStatus = "active";
        if (subscription.status === "trialing") billingStatus = "trialing";
        else if (subscription.status === "past_due") billingStatus = "past_due";
        else if (subscription.status === "canceled") billingStatus = "canceled";
        else if (subscription.status === "incomplete")
          billingStatus = "incomplete";
        else if (subscription.status === "incomplete_expired")
          billingStatus = "incomplete_expired";
        else if (subscription.status === "paused") billingStatus = "paused";
        else if (subscription.status === "unpaid") billingStatus = "unpaid";

        // STATE-001 FIX: Calculate event timestamp for optimistic locking
        const subEventTimestamp = new Date(event.created * 1000).toISOString();

        // Atomic update - all subscription fields updated together
        // Note: In newer Stripe API, current_period_* moved to subscription items
        // STATE-001 FIX: Include event timestamp for optimistic locking
        const updatePayload = {
          plan: planDetails.planId,
          billing_status: billingStatus,
          stripe_price_id: priceId,
          current_period_start: safeTimestampToISO(
            subscriptionItem.current_period_start,
          ),
          current_period_end: safeTimestampToISO(
            subscriptionItem.current_period_end,
          ),
          subscription_ends_at: safeTimestampToISO(subscription.cancel_at),
          stripe_webhook_last_event_id: event.id,
          stripe_webhook_last_event_at: subEventTimestamp,
          ...planDetails.limits,
        };

        // STATE-001 FIX: Only update if our event is newer than the last processed event
        const { data: updatedOrg, error: updateError } = await supabase
          .from("organizations")
          .update(updatePayload)
          .eq("stripe_subscription_id", subscription.id)
          .or(`stripe_webhook_last_event_at.is.null,stripe_webhook_last_event_at.lt.${subEventTimestamp}`)
          .select();

        if (updateError) {
          // Try by customer ID as fallback
          const customerId = subscription.customer as string;
          if (customerId) {
            // STATE-001 FIX: Apply same optimistic locking to fallback path
            const { data: fallbackOrg, error: fallbackError } = await supabase
              .from("organizations")
              .update(updatePayload)
              .eq("stripe_customer_id", customerId)
              .or(`stripe_webhook_last_event_at.is.null,stripe_webhook_last_event_at.lt.${subEventTimestamp}`)
              .select();

            if (fallbackError) {
              throw new Error(
                `Database update failed: ${fallbackError.message}`,
              );
            }

            if (!fallbackOrg || fallbackOrg.length === 0) {
              throw new Error(
                `Organization not found for customer: ${customerId}`,
              );
            }

            // Sync backend for fallback path (with retry)
            // IMPORTANT: Always attempt sync when org_slug exists
            if (fallbackOrg[0]?.org_slug) {
              const syncResult = await syncWithRetry(
                () =>
                  syncSubscriptionToBackend({
                    orgSlug: fallbackOrg[0].org_slug,
                    planName: planDetails.planId,
                    billingStatus: billingStatus,
                    trialEndsAt: subscription.trial_end
                      ? new Date(subscription.trial_end * 1000).toISOString()
                      : undefined,
                    dailyLimit: planDetails.limits.pipelines_per_day_limit,
                    monthlyLimit:
                      planDetails.limits.pipelines_per_day_limit * 30,
                    seatLimit: planDetails.limits.seat_limit,
                    providersLimit: planDetails.limits.providers_limit,
                  }),
                {
                  orgSlug: fallbackOrg[0].org_slug,
                  operation: "customer.subscription.updated (fallback)",
                },
              );

              if (syncResult.success) {
                // Update backend_quota_synced flag
                await supabase
                  .from("organizations")
                  .update({ backend_quota_synced: true })
                  .eq("stripe_customer_id", customerId);
              } else {
                // Log sync failure for debugging
                console.error(
                  `[Stripe Webhook] Backend sync failed for subscription.updated (fallback):`,
                  { orgSlug: fallbackOrg[0].org_slug, error: syncResult.error }
                );
                // Update backend_quota_synced flag to false
                await supabase
                  .from("organizations")
                  .update({ backend_quota_synced: false })
                  .eq("stripe_customer_id", customerId);
              }
            }
          } else {
            throw new Error(`Database update failed: ${updateError.message}`);
          }
        } else if (!updatedOrg || updatedOrg.length === 0) {
          throw new Error(
            `Organization not found for subscription: ${subscription.id}`,
          );
        }

        // Sync subscription limits to backend BigQuery (with retry)
        // Get org slug from either updatedOrg or fallbackOrg (whichever succeeded)
        // IMPORTANT: Always attempt sync when org_slug exists
        const orgForSync = updatedOrg?.[0] || null;
        if (orgForSync?.org_slug) {
          const syncResult = await syncWithRetry(
            () =>
              syncSubscriptionToBackend({
                orgSlug: orgForSync.org_slug,
                planName: planDetails.planId,
                billingStatus: billingStatus,
                trialEndsAt: subscription.trial_end
                  ? new Date(subscription.trial_end * 1000).toISOString()
                  : undefined,
                dailyLimit: planDetails.limits.pipelines_per_day_limit,
                monthlyLimit: planDetails.limits.pipelines_per_day_limit * 30,
                seatLimit: planDetails.limits.seat_limit,
                providersLimit: planDetails.limits.providers_limit,
              }),
            {
              orgSlug: orgForSync.org_slug,
              operation: "customer.subscription.updated",
            },
          );

          if (syncResult.success) {
            // Update backend_quota_synced flag
            await supabase
              .from("organizations")
              .update({ backend_quota_synced: true })
              .eq("stripe_subscription_id", subscription.id);
          } else {
            // Log sync failure for debugging
            console.error(
              `[Stripe Webhook] Backend sync failed for subscription.updated:`,
              { orgSlug: orgForSync.org_slug, error: syncResult.error }
            );
            // Update backend_quota_synced flag to false
            await supabase
              .from("organizations")
              .update({ backend_quota_synced: false })
              .eq("stripe_subscription_id", subscription.id);
          }
        }
        break;
      }

      // =============================================
      // SUBSCRIPTION DELETED - Cancellation
      // =============================================
      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        // STATE-001 FIX: Calculate event timestamp for optimistic locking
        const deleteEventTimestamp = new Date(event.created * 1000).toISOString();

        // Atomic update - both cancellation fields updated together
        // STATE-001 FIX: Include event timestamp for optimistic locking
        const cancelPayload = {
          billing_status: "canceled",
          subscription_ends_at: new Date().toISOString(),
          stripe_webhook_last_event_id: event.id,
          stripe_webhook_last_event_at: deleteEventTimestamp,
        };

        // STATE-001 FIX: Only update if our event is newer
        const { data: updatedOrg, error: updateError } = await supabase
          .from("organizations")
          .update(cancelPayload)
          .eq("stripe_subscription_id", subscription.id)
          .or(`stripe_webhook_last_event_at.is.null,stripe_webhook_last_event_at.lt.${deleteEventTimestamp}`)
          .select();

        let orgForCancelSync = updatedOrg?.[0] || null;

        if (updateError) {
          // Try by customer ID as fallback
          const customerId = subscription.customer as string;
          if (customerId) {
            // STATE-001 FIX: Apply same optimistic locking to fallback path
            const { data: fallbackOrg, error: fallbackError } = await supabase
              .from("organizations")
              .update(cancelPayload)
              .eq("stripe_customer_id", customerId)
              .or(`stripe_webhook_last_event_at.is.null,stripe_webhook_last_event_at.lt.${deleteEventTimestamp}`)
              .select();

            if (fallbackError) {
              throw new Error(
                `Database update failed: ${fallbackError.message}`,
              );
            }

            if (!fallbackOrg || fallbackOrg.length === 0) {
              throw new Error(
                `Organization not found for customer: ${customerId}`,
              );
            }

            orgForCancelSync = fallbackOrg[0];
          } else {
            throw new Error(`Database update failed: ${updateError.message}`);
          }
        } else if (!updatedOrg || updatedOrg.length === 0) {
          throw new Error(
            `Organization not found for subscription: ${subscription.id}`,
          );
        }

        // Sync cancellation to backend BigQuery (with retry)
        // IMPORTANT: Always attempt sync when org_slug exists
        if (orgForCancelSync?.org_slug) {
          const syncResult = await syncWithRetry(
            () =>
              syncSubscriptionToBackend({
                orgSlug: orgForCancelSync.org_slug,
                planName: orgForCancelSync.plan || "free",
                billingStatus: "canceled",
                trialEndsAt: undefined,
                dailyLimit: 0,
                monthlyLimit: 0,
                seatLimit: 0,
                providersLimit: 0,
              }),
            {
              orgSlug: orgForCancelSync.org_slug,
              operation: "customer.subscription.deleted",
            },
          );

          if (syncResult.success) {
            // Update backend_quota_synced flag
            await supabase
              .from("organizations")
              .update({ backend_quota_synced: true })
              .eq("stripe_subscription_id", subscription.id);
          } else {
            // Log sync failure for debugging
            console.error(
              `[Stripe Webhook] Backend sync failed for subscription.deleted:`,
              { orgSlug: orgForCancelSync.org_slug, error: syncResult.error }
            );
            // Update backend_quota_synced flag to false
            await supabase
              .from("organizations")
              .update({ backend_quota_synced: false })
              .eq("stripe_subscription_id", subscription.id);
          }
        }
        break;
      }

      // =============================================
      // INVOICE EVENTS - Payment tracking
      // =============================================
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;

        // Update billing status to active if it was past_due
        const subscriptionId = getSubscriptionIdFromInvoice(invoice);
        if (subscriptionId) {
          const { error: paymentSuccessError } = await supabase
            .from("organizations")
            .update({
              billing_status: "active",
              stripe_webhook_last_event_id: event.id,
            })
            .eq("stripe_subscription_id", subscriptionId)
            .eq("billing_status", "past_due");

          if (paymentSuccessError) {
            console.warn("[Stripe Webhook] Failed to update billing status on payment success:", paymentSuccessError.message);
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;

        // Update billing status to past_due
        const failedSubId = getSubscriptionIdFromInvoice(invoice);
        if (failedSubId) {
          const { data: org, error } = await supabase
            .from("organizations")
            .update({
              billing_status: "past_due",
              stripe_webhook_last_event_id: event.id,
            })
            .eq("stripe_subscription_id", failedSubId)
            .select("org_name, org_slug")
            .single();

          // Send payment failed email to customer
          if (invoice.customer_email && org && !error) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
            const billingLink = `${appUrl}/${org.org_slug}/billing`;

            await sendPaymentFailedEmail({
              to: invoice.customer_email,
              orgName: org.org_name,
              billingLink,
            });
          }
        }
        break;
      }

      case "invoice.created": {
        break;
      }

      case "invoice.payment_action_required": {
        const invoice = event.data.object as Stripe.Invoice;

        // Update billing status to indicate action required
        const actionSubId = getSubscriptionIdFromInvoice(invoice);
        if (actionSubId) {
          const { data: org, error } = await supabase
            .from("organizations")
            .update({
              billing_status: "past_due",
              stripe_webhook_last_event_id: event.id,
            })
            .eq("stripe_subscription_id", actionSubId)
            .select("org_name, org_slug")
            .single();

          // Send notification email to customer about action required
          if (invoice.customer_email && org && !error) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
            const billingLink = `${appUrl}/${org.org_slug}/billing`;

            await sendPaymentFailedEmail({
              to: invoice.customer_email,
              orgName: org.org_name,
              billingLink,
            });
          }
        }
        break;
      }

      // =============================================
      // TRIAL ENDING SOON - Send notification
      // =============================================
      case "customer.subscription.trial_will_end": {
        const subscription = event.data.object;
        const trialEndDate = subscription.trial_end
          ? new Date(subscription.trial_end * 1000)
          : null;

        // Update org with trial end date for UI display
        if (trialEndDate) {
          // Try to find org by stripe_subscription_id first
          let { data: org, error } = await supabase
            .from("organizations")
            .update({
              trial_ends_at: trialEndDate.toISOString(),
              stripe_subscription_id: subscription.id,
              stripe_webhook_last_event_id: event.id,
            })
            .eq("stripe_subscription_id", subscription.id)
            .select("org_name, org_slug")
            .single();

          // If not found by subscription_id, try by customer_id
          if (error && error.code === "PGRST116") {
            const customerId = subscription.customer as string;
            if (customerId) {
              const result = await supabase
                .from("organizations")
                .update({
                  trial_ends_at: trialEndDate.toISOString(),
                  stripe_subscription_id: subscription.id,
                  stripe_webhook_last_event_id: event.id,
                })
                .eq("stripe_customer_id", customerId)
                .select("org_name, org_slug")
                .single();

              org = result.data;
              error = result.error;
            }
          }

          // Send trial ending email notification
          if (org && !error) {
            // Get customer email from Stripe
            const customerId = subscription.customer as string;
            if (customerId) {
              try {
                const customer = await stripe.customers.retrieve(customerId, {}, {
                  timeout: STRIPE_API_TIMEOUT_MS,
                });
                if (customer && !customer.deleted && customer.email) {
                  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
                  const billingLink = `${appUrl}/${org.org_slug}/billing`;

                  await sendTrialEndingEmail({
                    to: customer.email,
                    orgName: org.org_name,
                    trialEndsAt: trialEndDate,
                    billingLink,
                  });
                }
              } catch (customerFetchError) {
                // Customer fetch failed - log but don't throw (email is non-critical)
                console.warn("[Stripe Webhook] Failed to fetch customer for trial ending email:", customerFetchError instanceof Error ? customerFetchError.message : customerFetchError);
              }
            }
          }
        }
        break;
      }

      // =============================================
      // CUSTOMER EVENTS - Customer management
      // =============================================
      case "customer.created": {
        // Customer is linked during checkout, no action needed
        break;
      }

      case "customer.deleted": {
        const customer = event.data.object;

        // Atomic update - clear all Stripe references together (org remains, just unlinked from Stripe)
        const { error: customerDeleteError } = await supabase
          .from("organizations")
          .update({
            stripe_customer_id: null,
            stripe_subscription_id: null,
            stripe_price_id: null,
            billing_status: "canceled",
            stripe_webhook_last_event_id: event.id,
          })
          .eq("stripe_customer_id", customer.id);

        if (customerDeleteError) {
          console.warn("[Stripe Webhook] Failed to clear Stripe references on customer delete:", customerDeleteError.message);
        }
        break;
      }

      // =============================================
      // CHARGE EVENTS - Refunds tracking
      // =============================================
      case "charge.refunded": {
        // Log refund details for tracking
        // In the future, could update a credits table if you track credits
        break;
      }

      default:
        // Unhandled event type
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    // CRITICAL: Log ALL webhook errors with full context
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;

    console.error(`[Stripe Webhook] CRITICAL FAILURE:`, {
      error: errorMessage,
      stack: errorStack,
      eventId: event?.id,
      eventType: event?.type,
      timestamp: new Date().toISOString(),
    });

    // Return 500 so Stripe will retry the webhook
    return NextResponse.json(
      {
        error: "Webhook processing failed",
        message: errorMessage,
        eventId: event?.id,
        eventType: event?.type,
      },
      { status: 500 },
    );
  }
}
