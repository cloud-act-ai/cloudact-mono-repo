# Stripe Billing - Requirements

## Overview

Stripe-powered subscription billing for CloudAct. Handles checkout, plan management, webhooks, billing status enforcement, and plan change auditing. All billing data lives in Supabase (no BigQuery billing sync).

## Source Specifications

- `01_BILLING_STRIPE.md` (v2.3, 2026-02-08)
- `01_ORGANIZATION_ONBOARDING.md` (v1.8) - Plan limits section

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Stripe Billing Flow                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Select Plan → Stripe Checkout → Payment processed            │
│  2. Webhook: checkout.session.completed                          │
│     → Create org in Supabase (source of truth)                   │
│  3. Webhook: customer.subscription.updated                       │
│     → Update status in Supabase                                  │
│  4. Webhook: invoice.payment_failed                              │
│     → Set SUSPENDED in Supabase, block pipelines                 │
│  5. API Service reads limits from Supabase → Enforces quotas     │
│                                                                  │
│  No BigQuery billing sync — all subscription data in Supabase.   │
│  Billing sync jobs removed.                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Functional Requirements

### FR-SB-001: Checkout Flow

- **FR-SB-001.1**: Plan selection page shows Starter ($19), Professional ($69), Scale ($199)
- **FR-SB-001.2**: Stripe Checkout session created with correct price ID
- **FR-SB-001.3**: Successful payment triggers `checkout.session.completed` webhook
- **FR-SB-001.4**: Webhook creates org in Supabase with billing fields populated
- **FR-SB-001.5**: 14-day free trial on all plans

### FR-SB-002: Subscription Management

- **FR-SB-002.1**: Billing settings page shows current plan name and status
- **FR-SB-002.2**: Plan upgrade/downgrade through Stripe billing portal
- **FR-SB-002.3**: Cancellation updates Supabase billing_status to "canceled"
- **FR-SB-002.4**: Plan change audit trail maintained in `plan_change_audit` table

### FR-SB-003: Webhook Processing

- **FR-SB-003.1**: All events signature-verified with webhook secret (`whsec_*`)
- **FR-SB-003.2**: Idempotent processing (duplicate event IDs rejected)
- **FR-SB-003.3**: Failed payment → billing_status = "past_due"
- **FR-SB-003.4**: Deleted subscription → billing_status = "canceled"
- **FR-SB-003.5**: Failed webhooks retry with exponential backoff

### FR-SB-004: Billing Status Enforcement

- **FR-SB-004.1**: Only "trialing" and "active" allow pipeline execution
- **FR-SB-004.2**: Inactive statuses redirect to billing page
- **FR-SB-004.3**: API service reads limits from Supabase (not BigQuery)

### FR-SB-005: Webhook Events

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create org in Supabase, set plan limits, trigger backend onboarding |
| `customer.subscription.updated` | Update `billing_status` in Supabase `organizations` table |
| `invoice.payment_failed` | Set `billing_status` to `past_due` in Supabase |
| `customer.subscription.deleted` | Set `billing_status` to `canceled` in Supabase |

**Supabase tables updated:** `organizations` (billing fields), `plan_change_audit` (history)

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

**Inactive statuses enforced:** `canceled`, `past_due`, `incomplete`, `unpaid`, `incomplete_expired` all redirect to the billing page.

---

## Plans (Production)

| Plan | Price ID | Monthly | Trial | Daily Pipelines | Monthly Pipelines | Concurrent | Providers | Seats |
|------|----------|---------|-------|-----------------|-------------------|------------|-----------|-------|
| Starter | `price_1SWJMfDoxINmrJKY7tOoJUIs` | $19 | 14 days | 6 | 180 | 20 | 3 | 2 |
| Professional | `price_1SWJOYDoxINmrJKY8jEZwVuU` | $69 | 14 days | 25 | 750 | 20 | 6 | 6 |
| Scale | `price_1SWJP8DoxINmrJKYfg0jmeLv` | $199 | 14 days | 100 | 3000 | 20 | 10 | 11 |

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

## Non-Functional Requirements

### NFR-SB-001: Integration Standards

| Standard | Implementation |
|----------|----------------|
| Signature verification | Stripe webhook secret (`whsec_*`) validates all events |
| Idempotency | Webhook handler checks duplicate event IDs |
| Error handling | Failed webhooks retry with exponential backoff |
| Environment isolation | TEST keys for stage, LIVE keys for prod — never mixed |

### NFR-SB-002: Security

- Webhook signature verification on all events
- Stripe secret keys in GCP Secret Manager, never in code
- No billing data exposed via client-side code

### NFR-SB-003: Environment Config

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
| `01-fronted-system/app/[orgSlug]/settings/billing/page.tsx` | Billing settings page |
| `01-fronted-system/app/[orgSlug]/settings/billing/plans/page.tsx` | Plan selection page |
| `01-fronted-system/app/onboarding/billing/page.tsx` | Stripe checkout onboarding |

---

## Test Coverage (via /account-setup skill)

Billing UI tests are part of the `/account-setup` skill (3 tests):
- Display billing settings page
- Display current plan info
- Display plans selection page

Full checkout flow cannot be automated (Stripe hosted page).

---

## SDLC

### Development Workflow

```
Update webhook handler / billing UI ──▶ npm run dev (localhost:3000)
         │                                      │
         ▼                                      ▼
  Start Stripe CLI listener              Test in browser
  stripe listen --forward-to             (billing page, plan display)
    localhost:3000/api/webhooks/stripe
         │                                      │
         ▼                                      ▼
  Trigger test events                    Verify Supabase updates
  stripe trigger checkout.session.completed    (billing_status, plan fields)
         │                                      │
         └──────────────┬───────────────────────┘
                        ▼
                  PR ──▶ Deploy stage ──▶ Verify with Stripe TEST keys
                              │
                              ▼
                        git tag v* ──▶ Prod (Stripe LIVE keys)
```

### Testing Approach

| Type | Tool | Coverage |
|------|------|----------|
| Webhook signature | Stripe CLI + manual | Verify `whsec_*` signature validation on all events |
| Billing status transitions | Stripe CLI triggers | checkout.completed, subscription.updated, payment_failed, deleted |
| Plan display | Playwright (via /account-setup) | Billing settings page, current plan, plan selection ($19/$69/$199) |
| Idempotency | Duplicate event replay | Same event ID processed only once |
| Environment isolation | Manual verification | TEST keys on stage, LIVE keys on prod — never mixed |
| Webhook retry | Stripe dashboard | Failed webhooks retry with exponential backoff |

**Note:** Full Stripe Checkout flow cannot be fully automated (Stripe hosted page). Billing UI tests are covered by the `/account-setup` skill.

### Deployment / CI/CD

- **Local dev**: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` for webhook testing
- **Stage**: Uses Stripe TEST keys (`sk_test_*`, `pk_test_*`). Auto-deployed on merge to main.
- **Production**: Uses Stripe LIVE keys (`sk_live_*`, `pk_live_*`). Deployed via `git tag v*`.
- **Secrets**: Stripe keys stored in GCP Secret Manager (`stripe-secret-key-{env}`, `stripe-webhook-secret-{env}`)
- **Verification**: After deploy, confirm webhook endpoint is registered in Stripe dashboard for the correct environment.

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/account-setup` | Tests billing UI flows (settings, plan display). |
| `/bootstrap-onboard` | Backend onboarding triggered by checkout webhook. |
| `/quota-mgmt` | Plan limits enforced by quota system. |
