/**
 * Stripe Webhook Handler
 *
 * SECURITY MEASURES IMPLEMENTED:
 * 1. Signature Verification: stripe.webhooks.constructEvent()
 * 2. Content-Type Validation: Blocks non-JSON/text requests
 * 3. Idempotency: In-memory + database deduplication
 * 4. Event Cache TTL: 1 hour cleanup for processed events
 * 5. Plan ID Validation: Explicit handling, no non-null assertions
 *
 * @see docs/SECURITY.md for full security documentation
 */

import { stripe } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { sendTrialEndingEmail, sendPaymentFailedEmail } from "@/lib/email";
import { syncSubscriptionToBackend } from "@/actions/backend-onboarding";
import type Stripe from "stripe";

// In-memory cache for idempotency (fast path for same-instance duplicates)
// Database-backed idempotency provides cross-instance protection (via stripe_webhook_last_event_id)
const processedEvents = new Map<string, number>();
const EVENT_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Clean old events periodically
function cleanOldEvents() {
  const now = Date.now();
  for (const [eventId, timestamp] of processedEvents.entries()) {
    if (now - timestamp > EVENT_CACHE_TTL) {
      processedEvents.delete(eventId);
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
  } catch {
    return null;
  }
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

// Fetch plan details from Stripe price/product metadata
// Returns plan ID and limits - all from Stripe (no hardcoded values)
async function getPlanDetailsFromStripe(priceId: string): Promise<{
  planId: string;
  limits: {
    seat_limit: number;
    providers_limit: number;
    pipelines_per_day_limit: number;
  };
} | null> {
  try {
    // Fetch the price with expanded product
    const price = await stripe.prices.retrieve(priceId, {
      expand: ["product"],
    });

    const product = price.product;

    if (!product || typeof product === "string") {
      console.error(`[Webhook] Could not expand product for price: ${priceId}`);
      return null;
    }

    // Get metadata from product
    const metadata = product.metadata || {};

    // Plan ID from metadata - REQUIRED, no fallback
    const planId = metadata.plan_id;
    if (!planId) {
      throw new Error(
        `[Stripe Webhook] CONFIGURATION ERROR: Product ${product.id} (${product.name}) is missing plan_id metadata. ` +
        `Add plan_id to Stripe product metadata. No fallback allowed.`,
      );
    }

    // Validate ALL required metadata exists - REQUIRED, no fallback
    if (!metadata.teamMembers || !metadata.providers || !metadata.pipelinesPerDay) {
      throw new Error(
        `[Stripe Webhook] CONFIGURATION ERROR: Product ${product.id} missing required metadata. ` +
        `teamMembers: ${metadata.teamMembers}, providers: ${metadata.providers}, pipelinesPerDay: ${metadata.pipelinesPerDay}. ` +
        `All fields are required in Stripe product metadata.`,
      );
    }

    // Parse and validate numeric values - must be valid integers
    const seatLimit = parseInt(metadata.teamMembers, 10);
    const providersLimit = parseInt(metadata.providers, 10);
    const pipelinesLimit = parseInt(metadata.pipelinesPerDay, 10);

    if (isNaN(seatLimit) || isNaN(providersLimit) || isNaN(pipelinesLimit)) {
      throw new Error(
        `[Stripe Webhook] CONFIGURATION ERROR: Product ${product.id} has invalid numeric metadata. ` +
        `teamMembers: "${metadata.teamMembers}" (parsed: ${seatLimit}), ` +
        `providers: "${metadata.providers}" (parsed: ${providersLimit}), ` +
        `pipelinesPerDay: "${metadata.pipelinesPerDay}" (parsed: ${pipelinesLimit}). ` +
        `All values must be valid integers.`,
      );
    }

    if (seatLimit <= 0 || providersLimit <= 0 || pipelinesLimit <= 0) {
      throw new Error(
        `[Stripe Webhook] CONFIGURATION ERROR: Product ${product.id} has non-positive limits. ` +
        `All limits must be positive integers. Got: seats=${seatLimit}, providers=${providersLimit}, pipelines=${pipelinesLimit}`,
      );
    }

    const limits = {
      seat_limit: seatLimit,
      providers_limit: providersLimit,
      pipelines_per_day_limit: pipelinesLimit,
    };

    console.log(`[Webhook] Fetched plan from Stripe: ${planId}`, limits);

    return { planId, limits };
  } catch (err) {
    console.error(`[Webhook] Failed to fetch plan details from Stripe:`, err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  // Security headers check - ensure request comes from expected source
  const contentType = request.headers.get("content-type");
  if (contentType && !contentType.includes("application/json") && !contentType.includes("text/")) {
    console.error("[Webhook] Unexpected content-type:", contentType);
    return NextResponse.json({ error: "Invalid content type" }, { status: 400 });
  }

  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    console.error("[Webhook] No signature provided");
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("[Webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency check - prevent duplicate processing
  // First check in-memory (fast path for same-instance duplicates)
  cleanOldEvents();
  if (processedEvents.has(event.id)) {
    console.log(
      `[Stripe Webhook] Event ${event.id} already processed (in-memory)`,
    );
    return NextResponse.json({ received: true, skipped: "duplicate" });
  }

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
      console.log(
        `[Stripe Webhook] Event ${event.id} already claimed by another instance`,
      );
      processedEvents.set(event.id, Date.now());
      return NextResponse.json({ received: true, skipped: "duplicate" });
    }
    // For other errors, log and fail fast (no fallback)
    console.error(`[Stripe Webhook] Failed to claim event ${event.id}:`, claimError);
    throw new Error(`Failed to claim webhook event: ${claimError.message}`);
  }

  // Successfully claimed - mark in memory too
  processedEvents.set(event.id, Date.now());

  try {
    console.log(`[Webhook] Processing event: ${event.type} (${event.id})`);

    switch (event.type) {
      // =============================================
      // CHECKOUT COMPLETED - Initial subscription
      // =============================================
      case "checkout.session.completed": {
        const session = event.data.object;
        const metadata = session.metadata;

        // Handle onboarding checkouts (org created on success page, not here)
        if (metadata?.is_onboarding === "true") {
          console.log(`[Webhook] Onboarding checkout completed for user: ${metadata.user_id}`);
          console.log(`[Webhook] Org will be created on success page redirect`);
          // Skip processing - org creation happens on /onboarding/success page
          // via completeOnboarding() which verifies the session and creates the org
          break;
        }

        // Regular checkout (org already exists)
        if (!metadata?.org_id) {
          console.error("[Webhook] No org_id in checkout metadata");
          throw new Error("Missing org_id in checkout session metadata");
        }

        // Validate subscription ID exists
        const subscriptionId = session.subscription as string;
        if (!subscriptionId) {
          console.error("[Webhook] No subscription ID in checkout session");
          throw new Error("Missing subscription ID in checkout session");
        }

        console.log(`[Webhook] Checkout completed for org: ${metadata.org_id}`);

        // Get subscription details
        const subscription =
          await stripe.subscriptions.retrieve(subscriptionId);

        // Validate subscription items exist
        const subscriptionItem = subscription.items?.data?.[0];
        if (!subscriptionItem?.price?.id) {
          console.error("[Webhook] No price ID found in subscription items");
          throw new Error("No price ID found in subscription items");
        }

        const priceId = subscriptionItem.price.id;

        // Fetch plan details from Stripe (no hardcoded values)
        const planDetails = await getPlanDetailsFromStripe(priceId);

        if (!planDetails) {
          console.error(
            `[Webhook] Could not get plan details for price: ${priceId}`,
          );
          throw new Error(`Failed to fetch plan details for price: ${priceId}`);
        }

        // Update organization with Stripe data (atomic operation - all fields updated together)
        // Note: In newer Stripe API, current_period_* moved to subscription items
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
            ...planDetails.limits,
          })
          .eq("id", metadata.org_id)
          .select();

        if (updateError) {
          console.error("[Webhook] Failed to update org:", updateError);
          throw new Error(`Database update failed: ${updateError.message}`);
        }

        if (!updatedOrg || updatedOrg.length === 0) {
          console.error(`[Webhook] Organization not found: ${metadata.org_id}`);
          throw new Error(`Organization not found: ${metadata.org_id}`);
        }

        console.log(
          `[Webhook] Organization ${metadata.org_id} activated with plan: ${planDetails.planId}`,
        );

        // Sync subscription limits to backend BigQuery
        if (updatedOrg[0]?.org_slug && updatedOrg[0]?.backend_onboarded) {
          try {
            // Determine billing status from subscription
            let checkoutBillingStatus = "active";
            if (subscription.status === "trialing") checkoutBillingStatus = "trialing";

            const syncResult = await syncSubscriptionToBackend({
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
            });
            if (syncResult.success) {
              console.log(
                `[Webhook] Backend subscription synced for org: ${updatedOrg[0].org_slug}`,
              );
            } else {
              console.warn(
                `[Webhook] Backend sync failed for org ${updatedOrg[0].org_slug}: ${syncResult.error}`,
              );
            }
          } catch (syncErr) {
            // Non-blocking - don't fail the webhook if backend sync fails
            console.error(
              `[Webhook] Backend sync error for org ${updatedOrg[0].org_slug}:`,
              syncErr,
            );
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
          console.error("[Webhook] No price ID found in subscription update");
          throw new Error("No price ID found in subscription update");
        }

        const priceId = subscriptionItem.price.id;

        // Fetch plan details from Stripe (no hardcoded values)
        const planDetails = await getPlanDetailsFromStripe(priceId);

        if (!planDetails) {
          console.error(
            `[Webhook] Could not get plan details for price: ${priceId}`,
          );
          throw new Error(`Failed to fetch plan details for price: ${priceId}`);
        }

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

        // Atomic update - all subscription fields updated together
        // Note: In newer Stripe API, current_period_* moved to subscription items
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
          ...planDetails.limits,
        };

        const { data: updatedOrg, error: updateError } = await supabase
          .from("organizations")
          .update(updatePayload)
          .eq("stripe_subscription_id", subscription.id)
          .select();

        if (updateError) {
          console.error(
            "[Webhook] Failed to update subscription by ID:",
            updateError,
          );

          // Try by customer ID as fallback
          const customerId = subscription.customer as string;
          if (customerId) {
            const { data: fallbackOrg, error: fallbackError } = await supabase
              .from("organizations")
              .update(updatePayload)
              .eq("stripe_customer_id", customerId)
              .select();

            if (fallbackError) {
              console.error(
                "[Webhook] Fallback update also failed:",
                fallbackError,
              );
              throw new Error(
                `Database update failed: ${fallbackError.message}`,
              );
            }

            if (!fallbackOrg || fallbackOrg.length === 0) {
              throw new Error(
                `Organization not found for customer: ${customerId}`,
              );
            }

            console.log(
              `[Webhook] Updated org via customer ID fallback: ${customerId}`,
            );

            // Sync backend for fallback path
            if (fallbackOrg[0]?.org_slug && fallbackOrg[0]?.backend_onboarded) {
              try {
                const syncResult = await syncSubscriptionToBackend({
                  orgSlug: fallbackOrg[0].org_slug,
                  planName: planDetails.planId,
                  billingStatus: billingStatus,
                  trialEndsAt: subscription.trial_end
                    ? new Date(subscription.trial_end * 1000).toISOString()
                    : undefined,
                  dailyLimit: planDetails.limits.pipelines_per_day_limit,
                  monthlyLimit: planDetails.limits.pipelines_per_day_limit * 30,
                  seatLimit: planDetails.limits.seat_limit,
                  providersLimit: planDetails.limits.providers_limit,
                });
                if (syncResult.success) {
                  console.log(
                    `[Webhook] Backend subscription synced (fallback) for org: ${fallbackOrg[0].org_slug}`,
                  );
                } else {
                  console.warn(
                    `[Webhook] Backend sync failed (fallback) for org ${fallbackOrg[0].org_slug}: ${syncResult.error}`,
                  );
                }
              } catch (syncErr) {
                console.error(
                  `[Webhook] Backend sync error (fallback) for org ${fallbackOrg[0].org_slug}:`,
                  syncErr,
                );
              }
            }
          } else {
            throw new Error(`Database update failed: ${updateError.message}`);
          }
        } else if (!updatedOrg || updatedOrg.length === 0) {
          console.error(
            `[Webhook] Organization not found for subscription: ${subscription.id}`,
          );
          throw new Error(
            `Organization not found for subscription: ${subscription.id}`,
          );
        }

        console.log(
          `[Webhook] Subscription updated: ${subscription.id}, plan: ${planDetails.planId}, status: ${billingStatus}`,
        );

        // Sync subscription limits to backend BigQuery
        // Get org slug from either updatedOrg or fallbackOrg (whichever succeeded)
        const orgForSync = updatedOrg?.[0] || null;
        if (orgForSync?.org_slug && orgForSync?.backend_onboarded) {
          try {
            const syncResult = await syncSubscriptionToBackend({
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
            });
            if (syncResult.success) {
              console.log(
                `[Webhook] Backend subscription synced for org: ${orgForSync.org_slug}`,
              );
            } else {
              console.warn(
                `[Webhook] Backend sync failed for org ${orgForSync.org_slug}: ${syncResult.error}`,
              );
            }
          } catch (syncErr) {
            // Non-blocking - don't fail the webhook if backend sync fails
            console.error(
              `[Webhook] Backend sync error for org ${orgForSync.org_slug}:`,
              syncErr,
            );
          }
        }
        break;
      }

      // =============================================
      // SUBSCRIPTION DELETED - Cancellation
      // =============================================
      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        // Atomic update - both cancellation fields updated together
        const cancelPayload = {
          billing_status: "canceled",
          subscription_ends_at: new Date().toISOString(),
          stripe_webhook_last_event_id: event.id,
        };

        const { data: updatedOrg, error: updateError } = await supabase
          .from("organizations")
          .update(cancelPayload)
          .eq("stripe_subscription_id", subscription.id)
          .select();

        if (updateError) {
          console.error(
            "[Webhook] Failed to update canceled subscription by ID:",
            updateError,
          );

          // Try by customer ID as fallback
          const customerId = subscription.customer as string;
          if (customerId) {
            const { data: fallbackOrg, error: fallbackError } = await supabase
              .from("organizations")
              .update(cancelPayload)
              .eq("stripe_customer_id", customerId)
              .select();

            if (fallbackError) {
              console.error(
                "[Webhook] Fallback cancel update also failed:",
                fallbackError,
              );
              throw new Error(
                `Database update failed: ${fallbackError.message}`,
              );
            }

            if (!fallbackOrg || fallbackOrg.length === 0) {
              throw new Error(
                `Organization not found for customer: ${customerId}`,
              );
            }

            console.log(
              `[Webhook] Canceled subscription via customer ID fallback: ${customerId}`,
            );
          } else {
            throw new Error(`Database update failed: ${updateError.message}`);
          }
        } else if (!updatedOrg || updatedOrg.length === 0) {
          console.error(
            `[Webhook] Organization not found for subscription: ${subscription.id}`,
          );
          throw new Error(
            `Organization not found for subscription: ${subscription.id}`,
          );
        }

        console.log(`[Webhook] Subscription canceled: ${subscription.id}`);
        break;
      }

      // =============================================
      // INVOICE EVENTS - Payment tracking
      // =============================================
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        console.log(
          `[Webhook] Payment succeeded: ${invoice.id}, amount: ${(invoice.amount_paid || 0) / 100}`,
        );

        // Update billing status to active if it was past_due
        const subscriptionId = getSubscriptionIdFromInvoice(invoice);
        if (subscriptionId) {
          const { error } = await supabase
            .from("organizations")
            .update({
              billing_status: "active",
              stripe_webhook_last_event_id: event.id,
            })
            .eq("stripe_subscription_id", subscriptionId)
            .eq("billing_status", "past_due");

          if (error) {
            console.error(
              "[Webhook] Failed to update payment succeeded status:",
              error,
            );
            // Don't throw - this is a non-critical update
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        console.log(`[Webhook] Payment failed: ${invoice.id}`);

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

          if (error) {
            console.error(
              "[Webhook] Failed to update payment failed status:",
              error,
            );
            // Don't throw - this is a non-critical update
          }

          // Send payment failed email to customer
          if (invoice.customer_email && org) {
            const appUrl =
              process.env.NEXT_PUBLIC_APP_URL!;
            const billingLink = `${appUrl}/${org.org_slug}/billing`;

            await sendPaymentFailedEmail({
              to: invoice.customer_email,
              orgName: org.org_name,
              billingLink,
            });
            console.log(
              `[Webhook] Payment failed email sent to ${invoice.customer_email}`,
            );
          }
        }
        break;
      }

      case "invoice.created": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`[Webhook] Invoice created: ${invoice.id}`);

        // Log trial-to-paid transitions and subscription cycles
        if (
          invoice.billing_reason === "subscription_cycle" ||
          invoice.billing_reason === "subscription_create"
        ) {
          const invoiceSubId = getSubscriptionIdFromInvoice(invoice);
          console.log(
            `[Webhook] Invoice for subscription ${invoiceSubId}, reason: ${invoice.billing_reason}`,
          );
        }
        break;
      }

      case "invoice.payment_action_required": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(
          `[Webhook] Payment action required for invoice: ${invoice.id}`,
        );

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

          if (error) {
            console.error(
              "[Webhook] Failed to update payment action required status:",
              error,
            );
            // Don't throw - this is a non-critical update
          }

          // Send notification email to customer about action required
          if (invoice.customer_email && org) {
            const appUrl =
              process.env.NEXT_PUBLIC_APP_URL!;
            const billingLink = `${appUrl}/${org.org_slug}/billing`;

            await sendPaymentFailedEmail({
              to: invoice.customer_email,
              orgName: org.org_name,
              billingLink,
            });
            console.log(
              `[Webhook] Payment action required email sent to ${invoice.customer_email}`,
            );
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

        console.log(
          `[Webhook] Trial ending soon for subscription: ${subscription.id}`,
        );

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

          if (error) {
            console.error("[Webhook] Failed to update trial end date:", error);
          }

          // Send trial ending email notification
          if (org) {
            // Get customer email from Stripe
            const customerId = subscription.customer as string;
            if (customerId) {
              try {
                const customer = await stripe.customers.retrieve(customerId);
                if (customer && !customer.deleted && customer.email) {
                  const appUrl =
                    process.env.NEXT_PUBLIC_APP_URL!;
                  const billingLink = `${appUrl}/${org.org_slug}/billing`;

                  await sendTrialEndingEmail({
                    to: customer.email,
                    orgName: org.org_name,
                    trialEndsAt: trialEndDate,
                    billingLink,
                  });
                  console.log(
                    `[Webhook] Trial ending email sent to ${customer.email}`,
                  );
                }
              } catch (custErr) {
                console.error(
                  "[Webhook] Failed to fetch customer for trial email:",
                  custErr,
                );
              }
            }
          }
        }

        console.log(`[Webhook] Trial ends at: ${trialEndDate?.toISOString()}`);
        break;
      }

      // =============================================
      // CUSTOMER EVENTS - Customer management
      // =============================================
      case "customer.created": {
        const customer = event.data.object;
        console.log(`[Webhook] Customer created: ${customer.id}`);
        // Customer is linked during checkout, no action needed
        break;
      }

      case "customer.deleted": {
        const customer = event.data.object;
        console.log(`[Webhook] Customer deleted: ${customer.id}`);

        // Atomic update - clear all Stripe references together (org remains, just unlinked from Stripe)
        const { data: updatedOrg, error } = await supabase
          .from("organizations")
          .update({
            stripe_customer_id: null,
            stripe_subscription_id: null,
            stripe_price_id: null,
            billing_status: "canceled",
            stripe_webhook_last_event_id: event.id,
          })
          .eq("stripe_customer_id", customer.id)
          .select();

        if (error) {
          console.error(
            "[Webhook] Failed to clear customer references:",
            error,
          );
          // Don't throw - the customer is already deleted in Stripe, this is cleanup
        } else if (!updatedOrg || updatedOrg.length === 0) {
          console.log(
            `[Webhook] No organization found for deleted customer: ${customer.id}`,
          );
        } else {
          console.log(
            `[Webhook] Cleared Stripe references for customer: ${customer.id}`,
          );
        }
        break;
      }

      // =============================================
      // CHARGE EVENTS - Refunds tracking
      // =============================================
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        console.log(
          `[Webhook] Charge refunded: ${charge.id}, amount: ${charge.amount_refunded}`,
        );

        // Log refund details for tracking
        // In the future, could update a credits table if you track credits
        if (charge.customer) {
          const { data: org } = await supabase
            .from("organizations")
            .select("org_name, org_slug")
            .eq("stripe_customer_id", charge.customer as string)
            .single();

          if (org) {
            console.log(
              `[Webhook] Refund issued to organization: ${org.org_name} (${org.org_slug})`,
            );
          }
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Stripe Webhook] Error processing event:", {
      eventId: event.id,
      eventType: event.type,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
