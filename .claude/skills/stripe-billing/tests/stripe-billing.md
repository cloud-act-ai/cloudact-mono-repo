# Stripe Billing - Test Plan

## UI Tests (via /account-setup skill)

Billing UI validation is handled by the `/account-setup` skill (3 tests in `account-flows.spec.ts`):

| # | Test | Expected |
|---|------|----------|
| 1 | Display billing settings page | Billing heading visible |
| 2 | Display current plan info | Plan name (starter/professional/scale) |
| 3 | Display plans selection page | Price elements ($19/$69/$199) |

## Manual Verification Checklist

| Check | Command | Expected |
|-------|---------|----------|
| Webhook endpoint exists | `curl -s -u "$SK:" https://api.stripe.com/v1/webhook_endpoints` | Endpoints listed |
| Products exist | `/stripe-billing products` | 3 products (Starter, Professional, Scale) |
| Prices match | `/stripe-billing prices` | $19, $69, $199 monthly |
| Webhook secret set | `gcloud secrets versions access latest --secret=stripe-webhook-secret-prod` | `whsec_*` value |

## Integration Tests

Full checkout flow cannot be automated (Stripe hosted checkout page). Manual testing required:
1. Sign up new account
2. Select plan
3. Complete Stripe checkout (test card: `4242 4242 4242 4242`)
4. Verify webhook received → org created in Supabase
5. Verify billing_status = "trialing"
