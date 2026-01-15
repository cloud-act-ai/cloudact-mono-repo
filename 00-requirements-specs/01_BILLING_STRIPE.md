# Billing & Stripe

**v2.1** | 2026-01-15

> Stripe subscriptions, checkout, webhooks

---

## Lifecycle

| Stripe Status | BigQuery Status | Pipelines |
|---------------|-----------------|-----------|
| trialing | TRIAL | ✓ |
| active | ACTIVE | ✓ |
| past_due | SUSPENDED | ✗ |
| canceled | CANCELLED | ✗ |

---

## Plans (Production)

| Plan | Price ID | Monthly |
|------|----------|---------|
| Starter | `price_1SWJMfDoxINmrJKY7tOoJUIs` | $19 |
| Professional | `price_1SWJOYDoxINmrJKY8jEZwVuU` | $69 |
| Scale | `price_1SWJP8DoxINmrJKYfg0jmeLv` | $199 |

---

## Checkout Flow

```
Select Plan → Stripe Checkout → Webhook → Supabase + BigQuery sync
```

---

## Webhook Events

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create org, set limits |
| `customer.subscription.updated` | Update status |
| `invoice.payment_failed` | Set SUSPENDED |

---

## Environment

| Env | Stripe Keys | Supabase |
|-----|-------------|----------|
| local/test/stage | TEST (pk_test_*) | kwroaccbrxppfiysqlzs |
| prod | LIVE (pk_live_*) | ovfxswhkkshouhsryzaf |

---

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/actions/stripe.ts` | Billing actions |
| `01-fronted-system/app/api/webhooks/stripe/route.ts` | Webhook |
