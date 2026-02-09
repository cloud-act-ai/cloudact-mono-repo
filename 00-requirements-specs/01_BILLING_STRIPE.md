# Billing & Stripe

**v2.3** | 2026-02-08

> Stripe subscriptions, checkout, webhooks

---

## Subscription Workflow

```
1. Select Plan → Stripe Checkout → Payment processed
2. Webhook: checkout.session.completed → Create org in Supabase (source of truth)
3. Webhook: customer.subscription.updated → Update status in Supabase
4. Webhook: invoice.payment_failed → Set SUSPENDED in Supabase, block pipelines
5. API Service reads limits from Supabase → Enforces quotas
```

**No BigQuery billing sync** — all subscription data lives in Supabase. Billing sync jobs removed.

---

## Lifecycle Mapping

| Stripe Status | Supabase `billing_status` | Pipelines Allowed | Frontend Behavior |
|---------------|---------------------------|-------------------|-------------------|
| trialing | trialing | Yes | Normal access |
| active | active | Yes | Normal access |
| past_due | past_due | No | Redirect to billing page |
| canceled | canceled | No | Redirect to billing page |
| incomplete | incomplete | No | Redirect to billing page |
| unpaid | unpaid | No | Redirect to billing page |
| incomplete_expired | incomplete_expired | No | Redirect to billing page |

**Inactive statuses enforced:** `canceled`, `past_due`, `incomplete`, `unpaid`, `incomplete_expired` all redirect to the billing page. Only `trialing` and `active` allow normal access.

---

## Plans (Production)

| Plan | Price ID | Monthly | Trial |
|------|----------|---------|-------|
| Starter | `price_1SWJMfDoxINmrJKY7tOoJUIs` | $19 | 14 days |
| Professional | `price_1SWJOYDoxINmrJKY8jEZwVuU` | $69 | 14 days |
| Scale | `price_1SWJP8DoxINmrJKYfg0jmeLv` | $199 | 14 days |

---

## Webhook Events

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create org in Supabase, set plan limits, trigger backend onboarding |
| `customer.subscription.updated` | Update `billing_status` in Supabase `organizations` table |
| `invoice.payment_failed` | Set `billing_status` to `past_due` in Supabase |
| `customer.subscription.deleted` | Set `billing_status` to `canceled` in Supabase |

**Supabase tables updated:** `organizations` (billing fields), `plan_change_audit` (history)

---

## Data Storage

**Billing data lives in Supabase ONLY** — no BigQuery sync.

| Data | Location | Purpose |
|------|----------|---------|
| Subscription state | `organizations` (Supabase) | billing_status, stripe_price_id, stripe_subscription_id |
| Plan change history | `plan_change_audit` (Supabase) | Audit trail for plan upgrades/downgrades |
| Quota limits | `organizations` (Supabase) | daily_pipeline_limit, monthly_pipeline_limit, etc. |
| Quota usage | `org_quotas` (Supabase) | Daily/monthly counters, concurrent tracking |

---

## Integration Standards

| Standard | Implementation |
|----------|----------------|
| Signature verification | Stripe webhook secret (`whsec_*`) validates all events |
| Idempotency | Webhook handler checks duplicate event IDs |
| Error handling | Failed webhooks retry with exponential backoff |
| Environment isolation | TEST keys for stage, LIVE keys for prod — never mixed |

---

## Environment Config

| Env | Stripe Keys | Supabase |
|-----|-------------|----------|
| local/test/stage | TEST (`pk_test_*`, `sk_test_*`) | kwroaccbrxppfiysqlzs |
| prod | LIVE (`pk_live_*`, `sk_live_*`) | ovfxswhkkshouhsryzaf |

---

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/actions/stripe.ts` | Billing server actions |
| `01-fronted-system/app/api/webhooks/stripe/route.ts` | Webhook handler |
| `01-fronted-system/lib/stripe.ts` | Stripe client config |
