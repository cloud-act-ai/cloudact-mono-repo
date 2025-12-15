---
description: Stripe Billing & Quota Enforcement E2E Tests
---

# Stripe Billing & Quota Enforcement Tests

Comprehensive tests for Stripe billing integration, subscription quota sync, and pipeline/integration limits enforcement.

---

## CRITICAL: Execution Rules

**MANDATORY - READ FIRST:**

1. **NEVER STOP ON FAILURE** - Mark as `FAILED`, continue to next test
2. **COMPLETE 100%** - Execute ALL tests even with failures
3. **RESTART ON CRASH** - Run `@[/clean_restart]`, resume from crashed test, mark as `FAILED - CRASH`
4. **SKIP BLOCKERS** - Mark as `SKIPPED - BLOCKED BY [test]`, continue with independent tests
5. **TRACK RESULTS** - Update: `PASSED: X | FAILED: Y | SKIPPED: Z | REMAINING: N`
6. **DELETE OLD ARTIFACTS** - Delete old artifacts if exists and Create only here: `.agent/artifacts/STRIPE_QUOTA_TEST_REPORT.md`

## CRITICAL: Follow best practices for test execution

- ✅ **No over-engineering** - Simple, direct fixes
- ✅ **Multi-tenancy support** - Proper `org_slug` isolation
- ✅ **Enterprise-grade for 10k customers** - Must scale
- ✅ **BigQuery best practices** - Clustering, partitioning, timeouts
- ✅ **Supabase best practices** - RLS, connection pooling, tight integration
- ✅ **Reusability and repeatability** - Patterns that work everywhere
- ✅ **ZERO mock tests** - All tests must hit real services
- ✅ **Parallel test execution** - Use `pytest-xdist`
- ✅ **LRU in-memory cache** - NO Redis at all
- ✅ **Check clustering/partitioning** - Add clustering/partitioning
- ✅ **Don't break existing functionality** - Run all tests before/after
- ✅ **Update docs with learnings** - Document fixes in `CLAUDE.md`

---

## Prerequisites

```bash
# Verify services are running
curl -s http://localhost:3000 > /dev/null && echo "Frontend: OK" || echo "Frontend: DOWN"
curl -s http://localhost:8000/health | jq -r '.status' 2>/dev/null || echo "API: DOWN"
curl -s http://localhost:8001/health | jq -r '.status' 2>/dev/null || echo "Pipeline: DOWN"

# Required environment variables
echo "CA_ROOT_API_KEY: ${CA_ROOT_API_KEY:+SET}"
echo "STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:+SET}"
echo "STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET:+SET}"
```

---

## Test Tracking

```markdown
| #   | Test                                          | Status  | Notes |
| --- | --------------------------------------------- | ------- | ----- |
| --- | **STRIPE CHECKOUT FLOW**                      | ------- | ----- |
| 1   | Create Onboarding Checkout Session            | PENDING |       |
| 2   | Validate Session ID Format (cs_ prefix)       | PENDING |       |
| 3   | Trial Days Applied Correctly                  | PENDING |       |
| 4   | Invalid Price ID Rejected                     | PENDING |       |
| 5   | Rate Limiting (30s cooldown)                  | PENDING |       |
| --- | **WEBHOOK SYNC**                              | ------- | ----- |
| 6   | checkout.session.completed → Supabase Update  | PENDING |       |
| 7   | checkout.session.completed → BigQuery Sync    | PENDING |       |
| 8   | customer.subscription.updated → Quota Update  | PENDING |       |
| 9   | customer.subscription.deleted → Status Cancel | PENDING |       |
| 10  | Webhook Idempotency (no duplicate processing) | PENDING |       |
| --- | **QUOTA LIMITS (BigQuery org_subscriptions)** | ------- | ----- |
| 11  | seat_limit Correctly Set                      | PENDING |       |
| 12  | providers_limit Correctly Set                 | PENDING |       |
| 13  | daily_limit Correctly Set                     | PENDING |       |
| 14  | monthly_limit Correctly Set                   | PENDING |       |
| 15  | concurrent_limit Correctly Set                | PENDING |       |
| --- | **INTEGRATION LIMITS ENFORCEMENT**            | ------- | ----- |
| 16  | STARTER: Max 3 Integrations Enforced          | PENDING |       |
| 17  | PROFESSIONAL: Max 10 Integrations Enforced    | PENDING |       |
| 18  | ENTERPRISE: Unlimited Integrations            | PENDING |       |
| 19  | 429 Error on Limit Exceeded                   | PENDING |       |
| --- | **PIPELINE QUOTA ENFORCEMENT**                | ------- | ----- |
| 20  | Daily Quota Increments Per Run                | PENDING |       |
| 21  | Daily Limit Enforced (STARTER=6)              | PENDING |       |
| 22  | Monthly Limit Enforced (STARTER=180)          | PENDING |       |
| 23  | Concurrent Limit Enforced                     | PENDING |       |
| 24  | 429 Error on Quota Exceeded                   | PENDING |       |
| --- | **SUBSCRIPTION STATUS ENFORCEMENT**           | ------- | ----- |
| 25  | ACTIVE Status Allows Pipelines                | PENDING |       |
| 26  | TRIAL Status Allows Pipelines                 | PENDING |       |
| 27  | SUSPENDED Status Blocks Pipelines             | PENDING |       |
| 28  | CANCELLED Status Blocks Pipelines             | PENDING |       |
| --- | **BILLING PORTAL**                            | ------- | ----- |
| 29  | Create Billing Portal Session                 | PENDING |       |
| 30  | Owner-Only Access Enforced                    | PENDING |       |
| --- | **PLAN CHANGE**                               | ------- | ----- |
| 31  | Upgrade STARTER → PROFESSIONAL                | PENDING |       |
| 32  | Downgrade PROFESSIONAL → STARTER              | PENDING |       |
| 33  | Limits Updated After Plan Change              | PENDING |       |
| --- | **EDGE CASES**                                | ------- | ----- |
| 34  | NULL Limits Fallback to SUBSCRIPTION_LIMITS   | PENDING |       |
| 35  | Invalid API Key Returns 401                   | PENDING |       |
| 36  | Cross-Org Access Denied                       | PENDING |       |

**TOTAL: 0/36 PASSED | 0 FAILED | 0 SKIPPED**
```

---

## Test Flows

### SECTION A: Stripe Checkout Flow

#### 1. Create Onboarding Checkout Session

```bash
# Frontend creates checkout session
POST /api/webhooks/stripe/checkout
{
  "priceId": "price_starter_monthly",
  "companyName": "Test Company",
  "currency": "USD",
  "timezone": "America/New_York"
}
# Expected: { "sessionId": "cs_test_..." }
```

#### 2-5. Checkout Validation

| Test | Input | Expected |
|------|-------|----------|
| Valid Session | `price_starter_monthly` | `cs_test_...` session ID |
| Invalid Price | `invalid_price` | 400 Bad Request |
| Rate Limit | 2 requests < 30s | 429 Too Many Requests |
| Trial Days | New user checkout | 14 days trial |

### SECTION B: Webhook Sync (Stripe → Supabase → BigQuery)

#### 6-7. checkout.session.completed

```bash
# Webhook payload (from Stripe)
{
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "customer": "cus_xxx",
      "subscription": "sub_xxx",
      "metadata": {
        "org_slug": "test_org",
        "plan_id": "starter"
      }
    }
  }
}

# Verify Supabase updated:
SELECT billing_status, plan, stripe_customer_id
FROM organizations WHERE org_slug = 'test_org';
# Expected: billing_status='active', plan='starter'

# Verify BigQuery synced:
SELECT plan_name, status, daily_limit, monthly_limit, seat_limit, providers_limit
FROM `organizations.org_subscriptions` WHERE org_slug = 'test_org';
# Expected: All limits populated
```

#### 8-10. Subscription Updates & Deletions

| Event | Supabase Update | BigQuery Sync |
|-------|-----------------|---------------|
| `subscription.updated` | `billing_status`, `plan` | `org_subscriptions` |
| `subscription.deleted` | `billing_status='canceled'` | `status='CANCELLED'` |
| Duplicate Event | Idempotency check | No duplicate rows |

### SECTION C: Quota Limits Verification

#### 11-15. Verify Limits Set Correctly

```bash
# After onboarding with STARTER plan:
curl -X GET "http://localhost:8000/api/v1/organizations/test_org/quota" \
  -H "X-API-Key: $ORG_API_KEY"

# Expected Response:
{
  "org_slug": "test_org",
  "pipelinesRunToday": 0,
  "dailyLimit": 6,
  "pipelinesRunMonth": 0,
  "monthlyLimit": 180,
  "concurrentRunning": 0,
  "concurrentLimit": 2,
  "dailyUsagePercent": 0.0,
  "monthlyUsagePercent": 0.0
}
```

**Plan Limits Reference:**

| Plan | Daily | Monthly | Concurrent | Seats | Providers |
|------|-------|---------|------------|-------|-----------|
| STARTER | 6 | 180 | 2 | 2 | 3 |
| PROFESSIONAL | 50 | 1500 | 5 | 10 | 10 |
| SCALE | 200 | 6000 | 10 | 50 | 50 |
| ENTERPRISE | 999999 | 999999 | 999999 | 999999 | 999999 |

### SECTION D: Integration Limits Enforcement

#### 16-19. Test Provider Limits

```bash
# Setup org with STARTER plan (3 providers limit)
# Add 3 integrations (should succeed)
for provider in openai anthropic gemini; do
  curl -X POST "http://localhost:8000/api/v1/integrations/test_org/$provider/setup" \
    -H "X-API-Key: $ORG_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"credential": "test-key"}'
done

# 4th integration should fail
curl -X POST "http://localhost:8000/api/v1/integrations/test_org/gcp/setup" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"credential": "{...}"}'
# Expected: 429 "Integration limit reached. Your plan allows 3 integrations."
```

### SECTION E: Pipeline Quota Enforcement

#### 20-24. Pipeline Run Limits

```bash
# Run pipelines until daily limit (6 for STARTER)
for i in {1..6}; do
  curl -X POST "http://localhost:8001/api/v1/pipelines/run/test_org/gcp/cost/billing" \
    -H "X-API-Key: $ORG_API_KEY" \
    -d '{"date": "2025-12-01"}'
  echo "Run $i completed"
done

# 7th run should fail
curl -X POST "http://localhost:8001/api/v1/pipelines/run/test_org/gcp/cost/billing" \
  -H "X-API-Key: $ORG_API_KEY" \
  -d '{"date": "2025-12-01"}'
# Expected: 429 "Daily pipeline limit exceeded"
```

### SECTION F: Subscription Status Enforcement

#### 25-28. Status-Based Access Control

| Status | Pipeline Execution | Expected |
|--------|-------------------|----------|
| ACTIVE | Allowed | 200 OK |
| TRIAL | Allowed | 200 OK |
| SUSPENDED | Blocked | 403 Forbidden |
| CANCELLED | Blocked | 403 Forbidden |

### SECTION G: Billing Portal & Plan Changes

#### 29-33. Portal & Upgrades

```bash
# Create billing portal session (owner only)
curl -X POST "http://localhost:3000/api/billing/portal" \
  -H "Cookie: ..."
# Expected: { "url": "https://billing.stripe.com/..." }

# Plan change (STARTER → PROFESSIONAL)
# Verify new limits applied immediately
```

### SECTION H: Edge Cases

#### 34-36. Error Handling

| Scenario | Expected |
|----------|----------|
| NULL limits in BigQuery | Fallback to `SUBSCRIPTION_LIMITS` constants |
| Invalid API key | 401 Unauthorized |
| Cross-org access | 403 Forbidden |

---

## Test Commands

### Backend API Tests (pytest)

```bash
cd 02-api-service

# Run all quota tests
python -m pytest tests/test_05_quota.py -v --run-integration

# Run specific quota test
python -m pytest tests/test_05_quota.py::test_get_quota_success -v --run-integration
```

### Frontend Tests (vitest)

```bash
cd 01-fronted-system

# Run all Stripe billing tests
npx vitest tests/stripe_billing/ --run

# Run checkout tests
npx vitest tests/stripe_billing/checkout.test.ts --run

# Run quota enforcement tests
npx vitest tests/07-pipeline-quota-enforcement.test.ts --run
npx vitest tests/08-openai-quota-enforcement.test.ts --run
```

---

## On Failure/Crash

```
ON ERROR:
  → Screenshot + Log URL + Mark FAILED → Continue next test

ON CRASH:
  → Run @[/clean_restart]
  → Wait for healthy services
  → Resume from crashed test
  → Mark as FAILED - CRASH
```

---

## Report

Delete old artifacts if exists and Create only here: `.agent/artifacts/STRIPE_QUOTA_TEST_REPORT.md`

Include:

- Final test results table
- All failures with URL + screenshot + error
- Pass rate: X/36 tests passed
- BigQuery quota verification queries
- Stripe webhook event IDs tested
