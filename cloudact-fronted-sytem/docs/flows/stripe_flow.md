# Stripe Flow

This document describes the complete Stripe billing flow including checkout, plan changes, webhooks, and backend synchronization.

## Overview

```
User Action          Frontend              Stripe             Webhook             Backend
    │                   │                    │                   │                  │
    ├── Select Plan ────┼────────────────────┼───────────────────┼──────────────────┤
    │                   │                    │                   │                  │
    │                   ├── createOnboarding │                   │                  │
    │                   │    CheckoutSession ┤                   │                  │
    │                   │                    │                   │                  │
    │                   │◄── Session URL ────┤                   │                  │
    │◄── Redirect ──────┤                    │                   │                  │
    │                   │                    │                   │                  │
    │── Complete ───────┼────────────────────┤                   │                  │
    │   Payment         │                    │                   │                  │
    │                   │                    ├── checkout.       │                  │
    │                   │                    │   session.        │                  │
    │                   │                    │   completed ──────┤                  │
    │                   │                    │                   ├── Update Supabase │
    │                   │                    │                   │                  │
    │                   │                    │                   ├── syncSubscription│
    │                   │                    │                   │   ToBackend ──────┤
    │                   │                    │                   │                  ├── PUT /organizations
    │                   │                    │                   │                  │   /{org}/subscription
```

## Endpoints

### Frontend Server Actions (`actions/stripe.ts`)

| Function | Description | Auth |
|----------|-------------|------|
| `createOnboardingCheckoutSession(priceId)` | Create checkout for new user signup | User session |
| `createCheckoutSession(priceId, orgSlug)` | Create checkout for existing org | User session + Owner |
| `changeSubscriptionPlan(orgSlug, newPriceId)` | Upgrade/downgrade plan directly | User session + Owner |
| `getBillingInfo(orgSlug)` | Get subscription, invoices, payment method | User session + Member |
| `createBillingPortalSession(orgSlug)` | Get Stripe billing portal URL | User session + Owner |
| `getStripePlans()` | List all available plans from Stripe | Public |

### Webhook Handler (`app/api/webhooks/stripe/route.ts`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhooks/stripe` | POST | Stripe webhook receiver |

### Backend API (Port 8000)

| Endpoint | Method | Headers | Description |
|----------|--------|---------|-------------|
| `/api/v1/organizations/{org_slug}/subscription` | PUT | `X-CA-Root-Key` | Update subscription limits in BigQuery |

## Flows

### 1. New User Checkout (Onboarding)

**Trigger:** User selects plan on `/onboarding/billing`

**Flow:**
1. User clicks plan button
2. Frontend calls `createOnboardingCheckoutSession(priceId)`
3. Validates user authentication
4. Rate limit check (30s between attempts)
5. Gets company info from `user.user_metadata.pending_company_name`
6. Generates org slug: `{companyname}_{MMDDYYYY}`
7. Creates Stripe checkout session with metadata:
   - `is_onboarding: "true"`
   - `user_id`, `pending_company_name`, `pending_org_slug`
8. Returns checkout URL
9. User completes payment on Stripe
10. Stripe redirects to `/onboarding/success?session_id={id}`
11. Success page calls `completeOnboarding(sessionId)`
12. Org created in Supabase with Stripe data
13. Webhook `checkout.session.completed` fires (skipped for onboarding - org already created)

**Key Code:**
```typescript
// actions/stripe.ts:116-262
export async function createOnboardingCheckoutSession(priceId: string) {
  // Rate limit check
  if (!checkRateLimit(user.id)) {
    return { url: null, error: "Please wait before creating another checkout session" }
  }

  // Create session with onboarding metadata
  const session = await stripe.checkout.sessions.create({
    metadata: {
      is_onboarding: "true",
      pending_org_slug: orgSlug,
    },
    subscription_data: {
      trial_period_days: trialDays,
    },
  })
}
```

### 2. Existing Org Checkout

**Trigger:** Org without subscription clicks subscribe

**Flow:**
1. Frontend calls `createCheckoutSession(priceId, orgSlug)`
2. Validates user is org owner
3. Checks org doesn't already have subscription
4. Creates checkout session with `org_id` in metadata
5. User completes payment
6. Webhook `checkout.session.completed` updates org:
   - Sets `stripe_customer_id`, `stripe_subscription_id`
   - Sets `plan`, `billing_status`, `seat_limit`, etc.
   - Syncs to backend BigQuery

### 3. Plan Change (Upgrade/Downgrade)

**Trigger:** Owner clicks upgrade/downgrade on billing page

**Flow:**
1. Frontend calls `changeSubscriptionPlan(orgSlug, newPriceId)`
2. Validates user is owner
3. Gets current subscription from Stripe
4. Updates subscription with new price (prorated)
5. Updates Supabase immediately (doesn't wait for webhook)
6. **Direct backend sync** - calls `syncSubscriptionToBackend()`:
   - Maps frontend status to backend (e.g., `trialing` → `TRIAL`)
   - Calls `PUT /api/v1/organizations/{org}/subscription`
   - Updates BigQuery `org_subscriptions` and `org_usage_quotas`
7. Webhook `customer.subscription.updated` fires as backup

**Key Code:**
```typescript
// actions/stripe.ts:714-907
export async function changeSubscriptionPlan(orgSlug: string, newPriceId: string) {
  // Update Stripe subscription
  const updatedSubscription = await stripe.subscriptions.update(
    org.stripe_subscription_id,
    {
      items: [{ id: subscriptionItemId, price: newPriceId }],
      proration_behavior: "create_prorations",
    }
  )

  // Update Supabase immediately
  await adminClient.from("organizations").update({
    plan: planId,
    billing_status: updatedSubscription.status,
    ...limits,
  })

  // Direct backend sync (don't rely solely on webhooks)
  await syncSubscriptionToBackend({
    orgSlug,
    planName: planId,
    billingStatus: updatedSubscription.status,
    dailyLimit: limits.pipelines_per_day_limit,
    monthlyLimit: limits.pipelines_per_day_limit * 30,
  })
}
```

### 4. Webhook Processing

**Events Handled:**

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Skip if onboarding; otherwise update org with Stripe data |
| `customer.subscription.updated` | Update plan, status, limits; sync to backend |
| `customer.subscription.deleted` | Set `billing_status: "canceled"` |
| `invoice.payment_succeeded` | Restore `billing_status: "active"` if was `past_due` |
| `invoice.payment_failed` | Set `billing_status: "past_due"`; send email |
| `customer.subscription.trial_will_end` | Update `trial_ends_at`; send email |
| `customer.deleted` | Clear all Stripe references from org |

**Idempotency:**
- In-memory cache (1 hour TTL)
- Database-backed via `stripe_webhook_events` table
- Atomic claim with `INSERT ... ON CONFLICT`

**Key Code:**
```typescript
// app/api/webhooks/stripe/route.ts:362-537
case "customer.subscription.updated": {
  // Get plan details from Stripe (no hardcoded values)
  const planDetails = await getPlanDetailsFromStripe(priceId)

  // Update Supabase
  await supabase.from("organizations").update({
    plan: planDetails.planId,
    billing_status: billingStatus,
    ...planDetails.limits,
  })

  // Sync to backend
  await syncSubscriptionToBackend({
    orgSlug: orgForSync.org_slug,
    planName: planDetails.planId,
    billingStatus: billingStatus,
    dailyLimit: planDetails.limits.pipelines_per_day_limit,
  })
}
```

### 5. Backend Subscription Sync

**Purpose:** Ensure BigQuery has correct limits for pipeline quota enforcement

**Flow:**
1. Called from webhook OR direct plan change
2. Maps frontend status to backend:
   - `trialing` → `TRIAL`
   - `active` → `ACTIVE`
   - `past_due` → `SUSPENDED`
   - `canceled` → `CANCELLED`
3. Calls `PUT /api/v1/organizations/{org}/subscription` with `X-CA-Root-Key`
4. Backend updates `org_subscriptions` and `org_usage_quotas` tables

**Key Code:**
```typescript
// actions/backend-onboarding.ts:719-851
export async function syncSubscriptionToBackend(input: {
  orgSlug: string
  planName?: string
  billingStatus?: string
  dailyLimit?: number
  monthlyLimit?: number
}) {
  const backendStatus = mapBillingStatusToBackend(input.billingStatus)

  await fetch(`${backendUrl}/api/v1/organizations/${input.orgSlug}/subscription`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-CA-Root-Key": adminApiKey,
    },
    body: JSON.stringify({
      plan_name: backendPlanName,
      status: backendStatus,
      daily_limit: input.dailyLimit,
      monthly_limit: input.monthlyLimit,
    }),
  })
}
```

## Status Mapping

| Frontend (Supabase) | Backend (BigQuery) | Pipeline Access |
|--------------------|-------------------|-----------------|
| `trialing` | `TRIAL` | Allowed |
| `active` | `ACTIVE` | Allowed |
| `past_due` | `SUSPENDED` | Blocked |
| `canceled` | `CANCELLED` | Blocked |
| `incomplete` | `SUSPENDED` | Blocked |
| `paused` | `SUSPENDED` | Blocked |

## Stripe Product Metadata (Required)

Every Stripe product MUST have these metadata fields:

```
plan_id: "starter"           # Unique plan identifier
teamMembers: "2"             # Seat limit
providers: "3"               # Provider limit
pipelinesPerDay: "6"         # Daily pipeline limit
features: "Feature 1|Feature 2"  # Pipe-separated features
order: "1"                   # Sort order (lower = first)
```

## Security Measures

1. **Signature Verification**: `stripe.webhooks.constructEvent()` validates webhook signatures
2. **Rate Limiting**: 30 seconds between checkout attempts per user
3. **Input Validation**: Price ID and org slug validated before processing
4. **Idempotency**: Prevents duplicate event processing
5. **Owner-Only Operations**: Plan changes require owner role
6. **No Hardcoded Values**: All plan limits come from Stripe metadata

## Files

| File | Purpose |
|------|---------|
| `actions/stripe.ts` | Server actions for Stripe operations |
| `app/api/webhooks/stripe/route.ts` | Webhook handler |
| `actions/backend-onboarding.ts` | Backend sync functions |
| `lib/stripe.ts` | Stripe client initialization |
| `app/[orgSlug]/billing/page.tsx` | Billing page UI |
