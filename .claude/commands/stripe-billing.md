# /stripe-billing - Stripe Billing Management

Manage Stripe products, prices, subscriptions, webhooks, and billing pipelines.

## Usage

```
/stripe-billing <action> [environment] [options]
```

## Actions

### Products & Prices
```
/stripe-billing products                 # List all Stripe products
/stripe-billing prices                   # List all Stripe prices
/stripe-billing subscriptions            # List active subscriptions
/stripe-billing customers                # List customers
```

### Webhooks
```
/stripe-billing webhooks test            # Check webhook config for test
/stripe-billing webhooks stage           # Check webhook config for stage
/stripe-billing webhooks prod            # Check webhook config for prod
```

### Account & Balance
```
/stripe-billing account                  # Get Stripe account info
/stripe-billing balance                  # Get current balance
```

---

## Instructions

### Action: products

Use Stripe MCP tool to list all products:
```
mcp__plugin_stripe_stripe__list_products with limit=100
```

### Action: prices

Use Stripe MCP tool to list all prices:
```
mcp__plugin_stripe_stripe__list_prices with limit=100
```

### Action: subscriptions

Use Stripe MCP tool to list subscriptions:
```
mcp__plugin_stripe_stripe__list_subscriptions with status="active"
```

### Action: customers

Use Stripe MCP tool to list customers:
```
mcp__plugin_stripe_stripe__list_customers with limit=100
```

### Action: account

Use Stripe MCP tool to get account info:
```
mcp__plugin_stripe_stripe__get_stripe_account_info
```

### Action: balance

Use Stripe MCP tool to get balance:
```
mcp__plugin_stripe_stripe__retrieve_balance
```

---

### Action: webhooks

Checks Stripe webhook configuration for an environment.

**Step 1: Get Stripe secret key**
```bash
ENV={env}
case $ENV in
  test)  PROJECT=cloudact-testing-1 ;;
  stage) PROJECT=cloudact-stage ;;
  prod)  PROJECT=cloudact-prod ;;
esac

STRIPE_SECRET=$(gcloud secrets versions access latest --secret=stripe-secret-key-${ENV} --project=$PROJECT)
```

**Step 2: List webhooks**
```bash
curl -s -u "$STRIPE_SECRET:" https://api.stripe.com/v1/webhook_endpoints | python3 -m json.tool
```

**Expected Webhook Events:**
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

**Webhook URLs:**
| Env | URL |
|-----|-----|
| test | `https://cloudact-frontend-test-*/api/stripe/webhook` |
| stage | `https://cloudact-stage.vercel.app/api/stripe/webhook` |
| prod | `https://cloudact.ai/api/stripe/webhook` |

---

## Configuration Reference

### Keys by Environment
| Env | Key Type | Example |
|-----|----------|---------|
| test/stage | TEST | `pk_test_*`, `sk_test_*` |
| prod | LIVE | `pk_live_*`, `sk_live_*` |

### Secrets in Google Secret Manager
| Secret | Project |
|--------|---------|
| `stripe-secret-key-test` | cloudact-testing-1 |
| `stripe-secret-key-stage` | cloudact-stage |
| `stripe-secret-key-prod` | cloudact-prod |
| `stripe-webhook-secret-test` | cloudact-testing-1 |
| `stripe-webhook-secret-stage` | cloudact-stage |
| `stripe-webhook-secret-prod` | cloudact-prod |

### Production Price IDs
| Plan | Price ID | Monthly |
|------|----------|---------|
| Starter | `price_1SWJMfDoxINmrJKY7tOoJUIs` | $19 |
| Professional | `price_1SWJOYDoxINmrJKY8jEZwVuU` | $69 |
| Scale | `price_1SWJP8DoxINmrJKYfg0jmeLv` | $199 |

---

## Troubleshooting

### Webhook not receiving events
1. Check webhook URL in Stripe dashboard
2. Verify webhook secret matches Secret Manager
3. Check frontend logs for errors

### Wrong key type
- Test/stage: Must use TEST keys (`pk_test_*`, `sk_test_*`)
- Prod: Must use LIVE keys (`pk_live_*`, `sk_live_*`)

---

## Quick Commands

```bash
/stripe-billing products         # List products
/stripe-billing prices           # List prices
/stripe-billing subscriptions    # List active subscriptions
/stripe-billing webhooks prod    # Check prod webhooks
/stripe-billing account          # Get account info
/stripe-billing balance          # Get balance
```

## Variables

- `$REPO_ROOT` = `/Users/gurukallam/prod-ready-apps/cloudact-mono-repo`

## Debug Account (for testing)

| Field | Value |
|-------|-------|
| Email | `john@example.com` |
| Password | `acme1234` |
| Org Slug | `acme_inc_01032026` |

**The debug account uses the Scale plan (14-day free trial).**

See `.claude/debug-config.md` for full debug configuration.
