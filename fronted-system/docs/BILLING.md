# Billing & Subscription System

Complete documentation for CloudAct.ai's Stripe-powered billing system.

---

## Architecture: Stripe as Single Source of Truth

**All plan data comes from Stripe. No fallbacks, no hardcoded values.**

| Data | Source | Notes |
|------|--------|-------|
| Plan Names, Prices, Features | **Stripe Products** | Fetched via `getStripePlans()` |
| Plan Limits (seats, providers, pipelines) | **Stripe Product Metadata** | Set in Stripe Dashboard |
| Trial Days | **Stripe Price** | Set on recurring price |
| Subscription Status | **Stripe** → Database | Synced via webhooks |
| Current Limits (enforcement) | **Database** | `organizations` table (synced from Stripe) |

---

## User Flow: Trial-First

```
Signup (/signup)
    └─→ Create user in Supabase Auth
        └─→ Auto-create profile (trigger)

Onboarding (/onboarding/organization)
    └─→ Select plan from Stripe (fetched dynamically)
    └─→ Create organization with:
        • billing_status: "trialing"
        • trial_ends_at: NOW() + trial_days (from Stripe)
        • seat_limit, providers_limit, pipelines_per_day_limit (from Stripe metadata)
    └─→ Redirect to Dashboard (trial starts immediately)

Dashboard (/{orgSlug}/dashboard)
    └─→ User works during trial period
    └─→ Trial ending notification (webhook: trial_will_end)

Billing (/{orgSlug}/billing)
    └─→ Subscribe before trial ends
    └─→ createCheckoutSession() → Stripe Checkout
        └─→ Webhook: checkout.session.completed
            └─→ Update org: billing_status = "active"
            └─→ Sync limits from Stripe
```

---

## Environment Variables

```bash
# Stripe Keys
STRIPE_SECRET_KEY=sk_test_...              # Sandbox/Test mode
STRIPE_LIVE_SECRET_KEY=sk_live_...         # Production (optional, for scripts)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Webhook Secret (from Stripe CLI for local, Dashboard for production)
STRIPE_WEBHOOK_SECRET=whsec_...

# App URL (for redirect URLs)
NEXT_PUBLIC_APP_URL=http://localhost:3000  # or https://your-domain.com
```

**Note**: Price IDs are fetched dynamically from Stripe - not needed in env vars.

---

## Key Files

```
actions/
├── stripe.ts           # Server actions: getStripePlans, checkout, changeSubscriptionPlan, billing portal

app/
├── onboarding/organization/page.tsx  # Plan selection & org creation
├── [orgSlug]/billing/page.tsx        # Subscription management (upgrade/downgrade)
└── api/webhooks/stripe/route.ts      # Webhook handler (syncs all data from Stripe)

lib/
├── constants.ts        # DEFAULT_TRIAL_DAYS (fallback only), ROLE_PERMISSIONS, BILLING_STATUS
└── stripe.ts           # Stripe client initialization

middleware.ts           # Auth middleware (allows /api/* routes through)

scripts/stripe/
└── update_product_metadata.py    # Script to update Stripe product metadata (uses .env.local)
```

### Key Functions

| Function | File | Description |
|----------|------|-------------|
| `getStripePlans()` | actions/stripe.ts | Fetches plans dynamically from Stripe products |
| `createCheckoutSession()` | actions/stripe.ts | Creates Stripe Checkout for new subscribers |
| `changeSubscriptionPlan()` | actions/stripe.ts | Direct upgrade/downgrade via Stripe API (with proration) |
| `createBillingPortalSession()` | actions/stripe.ts | Opens Stripe portal for cancellations, payment updates |
| `getBillingInfo()` | actions/stripe.ts | Fetches current subscription, invoices, payment method |

---

## Subscription Flows

### New Subscription (No existing subscription)
```
User clicks "Subscribe" → createCheckoutSession() → Stripe Checkout →
Webhook: checkout.session.completed → Database updated with:
  - stripe_customer_id
  - stripe_subscription_id
  - stripe_price_id
  - plan, billing_status, limits
```

### Upgrade/Downgrade (Existing subscription)
```
User clicks "Upgrade/Downgrade" → changeSubscriptionPlan() →
Stripe API: subscriptions.update() with proration →
Database updated immediately (don't wait for webhook) →
Webhook: customer.subscription.updated → Confirms sync
```

### Cancellation
```
User clicks "Manage Subscription" → createBillingPortalSession() →
Stripe Billing Portal → User cancels →
Webhook: customer.subscription.updated (cancel_at set) →
Database updated: subscription_ends_at = cancel_at
```

### Renewal (Resume cancelled subscription)
```
User clicks "Manage Subscription" → Stripe Billing Portal →
User clicks "Resume" → Webhook: customer.subscription.updated →
Database updated: subscription_ends_at = null, billing_status = "active"
```

---

## Webhook Handler

### Location
`app/api/webhooks/stripe/route.ts`

### How It Works
The webhook fetches plan limits directly from Stripe when processing events:

```typescript
// Safe timestamp conversion (handles undefined/invalid values)
function safeTimestampToISO(timestamp: number | undefined | null): string | null {
  if (!timestamp || timestamp <= 0) return null
  try {
    return new Date(timestamp * 1000).toISOString()
  } catch {
    return null
  }
}

// Webhook fetches limits from Stripe product metadata
async function getPlanDetailsFromStripe(priceId: string) {
  const price = await stripe.prices.retrieve(priceId, { expand: ["product"] })
  const product = price.product
  const metadata = product.metadata || {}

  return {
    planId: metadata.plan_id || product.name.toLowerCase(),
    limits: {
      seat_limit: parseInt(metadata.teamMembers || "2", 10),
      providers_limit: parseInt(metadata.providers || "3", 10),
      pipelines_per_day_limit: parseInt(metadata.pipelinesPerDay || "6", 10),
    }
  }
}
```

### Events Handled

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Activate subscription, sync all limits |
| `customer.subscription.updated` | Update plan, status, limits, cancellation date |
| `customer.subscription.deleted` | Set billing_status = "canceled" |
| `customer.subscription.trial_will_end` | Update trial_ends_at |
| `invoice.payment_succeeded` | Set billing_status = "active" (if was past_due) |
| `invoice.payment_failed` | Set billing_status = "past_due" |

---

## Testing Locally (Required for Development)

> **Important**: Stripe Dashboard cannot send webhooks to localhost.
> Use the Stripe CLI for local development.

### 1. Install Stripe CLI
```bash
# macOS
brew install stripe/stripe-cli/stripe

# Windows (with scoop)
scoop install stripe

# Linux
# Download from https://github.com/stripe/stripe-cli/releases
```

### 2. Login to Stripe (Sandbox Account)
```bash
stripe login
# Select your SANDBOX account when prompted
```

### 3. Forward Webhooks to Localhost
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

**Output:**
```
Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx (^C to quit)
```

### 4. Add Webhook Secret to `.env.local`
```bash
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

### 5. Verify Correct Account
Make sure Stripe CLI and your app use the **same** Stripe account:
```bash
# Check CLI account
stripe config --list

# Verify app's STRIPE_SECRET_KEY starts with same account prefix
# e.g., sk_test_51STnd4... should match acct_1STnd4...
```

### 6. Test Webhook Events
```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_failed
```

---

## Stripe Dashboard Setup

### 1. Create Products with Metadata

Go to **Products** > **Add Product**:

**Starter Plan**
- Name: `Starter`
- Description: `Perfect for getting started`
- Price: $19/month (recurring)
- Metadata:
  - `plan_id`: `starter`
  - `features`: `Owner + 1 member (2 total)|Up to 3 providers|6 pipelines per day`
  - `teamMembers`: `2`
  - `providers`: `3`
  - `pipelinesPerDay`: `6`
  - `order`: `1`

**Professional Plan**
- Name: `Professional`
- Description: `For growing operations`
- Price: $69/month (recurring)
- Metadata:
  - `plan_id`: `professional`
  - `features`: `Owner + 5 members (6 total)|Up to 6 providers|25 pipelines per day`
  - `teamMembers`: `6`
  - `providers`: `6`
  - `pipelinesPerDay`: `25`
  - `order`: `2`
  - `is_popular`: `true`

**Scale Plan**
- Name: `Scale`
- Description: `For large-scale operations`
- Price: $199/month (recurring)
- Metadata:
  - `plan_id`: `scale`
  - `features`: `Owner + 10+ members (11+ total)|Up to 10 providers|100 pipelines per day`
  - `teamMembers`: `11`
  - `providers`: `10`
  - `pipelinesPerDay`: `100`
  - `order`: `3`

### 2. Set Trial Days on Price (Optional)
- Edit each Price > Recurring > Trial period: 14 days

### 3. Configure Webhook (Production)
Go to **Developers** > **Webhooks** > **Add Endpoint**:
- Endpoint URL: `https://your-domain.com/api/webhooks/stripe`
- Events:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `customer.subscription.trial_will_end`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`

### 4. Configure Billing Portal (Required for Cancellations)

Go to **Settings** > **Billing** > **Customer Portal**
Or visit: https://dashboard.stripe.com/settings/billing/portal

#### Subscriptions Section
- Enable **"Customers can update their subscriptions"**
- Under "Update subscriptions":
  - Enable **"Customers can switch plans"**
  - Set **Proration behavior**: "Always invoice immediately" (recommended)
- Enable **"Customers can cancel subscriptions"**

#### Products Section (for plan switching via portal)
Click **"Add product"** and add all subscription products:
1. **Starter** - Select the Starter product
2. **Professional** - Select the Professional product
3. **Scale** - Select the Scale product

#### Invoice History
- Enable **"Customers can view invoice history"**

#### Payment Methods
- Enable **"Customers can update payment methods"**

Click **Save** when done.

> **Note**: Our app uses direct API for plan upgrades/downgrades (`changeSubscriptionPlan`),
> but the Customer Portal is still needed for cancellations and payment method updates.

---

## Database Schema (Billing Columns)

```sql
-- Organizations table (billing-related columns)
plan TEXT,                              -- Plan ID from Stripe (e.g., "starter", "professional")
billing_status TEXT DEFAULT 'trialing', -- Synced from Stripe subscription status
stripe_customer_id TEXT,                -- Stripe customer ID
stripe_subscription_id TEXT,            -- Stripe subscription ID
stripe_price_id TEXT,                   -- Stripe price ID
trial_ends_at TIMESTAMPTZ,              -- Trial end date
current_period_start TIMESTAMPTZ,       -- Billing period start
current_period_end TIMESTAMPTZ,         -- Billing period end
subscription_ends_at TIMESTAMPTZ,       -- Cancellation date (if scheduled)
seat_limit INTEGER DEFAULT 2,           -- From Stripe metadata (teamMembers)
providers_limit INTEGER DEFAULT 3,      -- From Stripe metadata (providers)
pipelines_per_day_limit INTEGER DEFAULT 6 -- From Stripe metadata (pipelinesPerDay)
```

### Billing Status Values
- `trialing` - In free trial period
- `active` - Paid and current
- `past_due` - Payment failed, grace period
- `canceled` - Subscription canceled
- `incomplete` - Initial payment failed
- `incomplete_expired` - Initial payment expired
- `paused` - Subscription paused
- `unpaid` - Multiple payment failures

---

## Troubleshooting

### Webhooks Not Receiving Events

| Issue | Solution |
|-------|----------|
| No events in stripe listen | Verify `stripe listen` is running and connected to correct account |
| Events sent but 307 redirect | Add `/api/` to middleware bypass (check `middleware.ts`) |
| Signature verification failed | Update `STRIPE_WEBHOOK_SECRET` to match stripe listen output |
| Different Stripe accounts | Run `stripe config --list` and verify account matches `STRIPE_SECRET_KEY` |

### Plans Not Loading
- Check browser console for Stripe API errors
- Verify Stripe products are active
- Ensure product metadata is set correctly

### Limits Not Updating After Plan Change
- Verify webhook is receiving `customer.subscription.updated`
- Check product metadata has correct keys (`teamMembers`, `providers`, `pipelinesPerDay`)
- Review webhook logs for errors

### "Invalid plan selected" Error
- Ensure you're using the `priceId` from Stripe (format: `price_xxx`)
- Verify the price is active in Stripe

### Upgrade/Downgrade Not Working
- Check if org has `stripe_customer_id` and `stripe_subscription_id` set
- If null, complete a checkout first (webhook will populate these)
- Verify `changeSubscriptionPlan()` is being called (not `createCheckoutSession()`)

---

## Scripts

### Update Product Metadata

Update Stripe product metadata from `.env.local`:

```bash
# Install dependencies
pip install stripe python-dotenv

# Run for sandbox only
python scripts/stripe/update_product_metadata.py --sandbox-only

# Run for production only (requires STRIPE_LIVE_SECRET_KEY in .env.local)
python scripts/stripe/update_product_metadata.py --production-only

# Skip tax configuration
python scripts/stripe/update_product_metadata.py --skip-tax
```

---

## Security Notes

1. **Webhook Signature Verification**: Always enabled - prevents spoofed webhooks
2. **No Fallbacks**: If Stripe is unavailable, show error (no silent degradation)
3. **Owner-only Billing Access**: Only org owners can access billing portal
4. **Service Role for Webhooks**: Webhook handler uses service role to bypass RLS
5. **API Routes Bypass Auth**: `/api/*` routes skip session middleware (auth handled internally)

---

*Last updated: November 2024 | Stripe-First Architecture v2.1*
