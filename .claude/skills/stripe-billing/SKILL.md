---
name: stripe-billing
description: |
  Stripe billing management for CloudAct. Products, prices, subscriptions, webhooks, checkout, and plan management.
  Use when: managing Stripe products/prices, debugging webhooks, checking subscriptions, verifying billing status,
  testing checkout flows, or managing plan upgrades/downgrades.
---

# /stripe-billing - Stripe Billing Management

Manage Stripe products, prices, subscriptions, webhooks, and billing pipelines for CloudAct.

## Trigger

Use when: managing billing, debugging Stripe webhooks, checking subscription status, verifying plan pricing, or testing checkout flows.

```
/stripe-billing products                 # List all Stripe products
/stripe-billing prices                   # List all Stripe prices
/stripe-billing subscriptions            # List active subscriptions
/stripe-billing webhooks <env>           # Check webhook config for environment
/stripe-billing account                  # Get Stripe account info
/stripe-billing balance                  # Get current balance
/stripe-billing status <org>             # Check org billing status
```

## Architecture

```
Signup → Plan Selection → Stripe Checkout → Payment
                                              ↓
                                    Stripe Webhook Events
                                              ↓
                            checkout.session.completed
                            customer.subscription.updated
                            invoice.payment_failed
                            customer.subscription.deleted
                                              ↓
                                    Supabase (Source of Truth)
                                    ├─ organizations.billing_status
                                    ├─ organizations.stripe_price_id
                                    ├─ organizations.stripe_subscription_id
                                    └─ plan_change_audit (history)
                                              ↓
                                    API Service reads limits
                                    from Supabase → enforces quotas
```

**No BigQuery billing sync** — all subscription data lives in Supabase.

## Subscription Lifecycle

| Stripe Status | Supabase billing_status | Pipelines Allowed | Frontend Behavior |
|---------------|-------------------------|-------------------|-------------------|
| trialing | trialing | Yes | Normal access |
| active | active | Yes | Normal access |
| past_due | past_due | No | Redirect to billing |
| canceled | canceled | No | Redirect to billing |
| incomplete | incomplete | No | Redirect to billing |
| unpaid | unpaid | No | Redirect to billing |

## Plans (Production)

| Plan | Price ID | Monthly | Trial | Seats | Providers |
|------|----------|---------|-------|-------|-----------|
| Starter | `price_1SWJMfDoxINmrJKY7tOoJUIs` | $19 | 14 days | 2 | 3 |
| Professional | `price_1SWJOYDoxINmrJKY8jEZwVuU` | $69 | 14 days | 6 | 6 |
| Scale | `price_1SWJP8DoxINmrJKYfg0jmeLv` | $199 | 14 days | 11 | 10 |

## Webhook Events

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create org in Supabase, set plan limits, trigger backend onboarding |
| `customer.subscription.updated` | Update billing_status in Supabase |
| `invoice.payment_failed` | Set billing_status to past_due |
| `customer.subscription.deleted` | Set billing_status to canceled |

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/actions/stripe.ts` | Billing server actions |
| `01-fronted-system/app/api/webhooks/stripe/route.ts` | Webhook handler |
| `01-fronted-system/lib/stripe.ts` | Stripe client config |
| `01-fronted-system/app/[orgSlug]/settings/billing/` | Billing settings UI |
| `01-fronted-system/app/[orgSlug]/settings/billing/plans/` | Plan selection UI |
| `01-fronted-system/app/onboarding/billing/` | Checkout onboarding |

## Environment Config

| Env | Stripe Keys | Supabase |
|-----|-------------|----------|
| local/test/stage | TEST (`pk_test_*`, `sk_test_*`) | kwroaccbrxppfiysqlzs |
| prod | LIVE (`pk_live_*`, `sk_live_*`) | ovfxswhkkshouhsryzaf |

## Source Specifications

Requirements consolidated from:
- `01_BILLING_STRIPE.md` (v2.3, 2026-02-08)
- `01_ORGANIZATION_ONBOARDING.md` (v1.8) - Plan limits section

## Related Skills

- `/account-setup` - E2E testing of billing pages (display only, no actual checkout)
- `/quota-mgmt` - Quota enforcement based on plan limits

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Webhook not receiving | Wrong URL | Check Stripe dashboard webhook endpoints |
| Wrong key type | TEST vs LIVE | stage=TEST, prod=LIVE, never mixed |
| Plans not loading | Missing price IDs | Verify NEXT_PUBLIC_STRIPE_*_PRICE_ID in env |
| Billing page empty | Missing STRIPE_SECRET_KEY | Check .env.local or GCP Secret Manager |
| Subscription stuck | Webhook failed | Check frontend logs for webhook errors |
