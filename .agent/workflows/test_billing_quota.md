---
description: Billing, Stripe & Quota E2E Browser Tests (antigravity)
---

# Billing, Stripe & Quota E2E Tests

Browser automation tests for Stripe billing, plan management, and quota enforcement using `browser_subagent`.

---

## CRITICAL: Execution Rules

**MANDATORY - READ FIRST:**

1. **NEVER STOP ON FAILURE** - Mark as `FAILED`, continue to next test
2. **COMPLETE 100%** - Execute ALL tests even with failures
3. **RESTART ON CRASH** - Run `@[/clean_restart]`, resume from crashed test, mark as `FAILED - CRASH`
4. **SKIP BLOCKERS** - Mark as `SKIPPED - BLOCKED BY [test]`, continue with independent tests
5. **TRACK RESULTS** - Update: `PASSED: X | FAILED: Y | SKIPPED: Z | REMAINING: N`
6. **DELETE OLD ARTIFACTS** - Create only here: `.agent/artifacts/BILLING_QUOTA_TEST_REPORT.md`

## CRITICAL: Best Practices

- No over-engineering - Simple, direct tests
- ZERO mock tests - All tests must hit real Stripe (test mode)
- Use Stripe test cards: `4242424242424242` (success), `4000000000000002` (decline)
- Quota checks must hit both Supabase AND BigQuery

---

## STEP 0: Pre-Test Review (MANDATORY FIRST)

**Before running ANY tests, the agent MUST complete these checks:**

### 0.1 Code Gap Analysis
```
Review and fix code gaps in:
1. FRONTEND (01-fronted-system):
   - actions/stripe.ts - Check checkout session creation
   - app/onboarding/billing - Plan selection UI
   - app/[orgSlug]/billing - Billing page components
   - Verify payment_method_collection setting

2. BACKEND (02-api-service):
   - Subscription sync endpoints
   - Quota enforcement middleware
   - Webhook signature verification

3. PIPELINE (03-data-pipeline-service):
   - Quota check before pipeline execution
   - Daily limit enforcement logic
```

### 0.2 URL & Link Validation
```
Verify all URLs/routes exist and are accessible:
- [ ] /onboarding/billing - Plan selection page
- [ ] /{orgSlug}/billing - Billing management page
- [ ] /api/webhooks/stripe - Webhook endpoint responds
- [ ] Stripe portal redirect works

Fix any broken routes before proceeding.
```

### 0.3 Schema Validation
```
Verify database schemas match expected structure:
- [ ] Supabase: organizations.subscription_status column
- [ ] Supabase: organizations.subscription_plan column
- [ ] Supabase: organizations.team_member_limit column
- [ ] BigQuery: org_subscriptions table exists
- [ ] Stripe: Products have required metadata (plan_id, teamMembers, etc.)

Run migrations if needed: cd scripts/supabase_db && ./migrate.sh
```

### 0.4 Pre-Test Report
```
Create: .agent/artifacts/BILLING_QUOTA_PRETEST_REVIEW.md
Include:
- Code gaps found and fixed
- Broken URLs found and fixed
- Schema issues found and fixed
- Stripe products verified
- Ready for testing: YES/NO
```

**Only proceed to tests after Step 0 is complete!**

---

## Prerequisites

```bash
# Verify services
curl -s http://localhost:3000 > /dev/null && echo "Frontend: OK" || echo "Frontend: DOWN"
curl -s http://localhost:8000/health | jq -r '.status' 2>/dev/null || echo "API: DOWN"
```

**Test User:** Must have completed onboarding with active subscription

---

## Test Tracking

```markdown
| #   | Test                                      | Status  | Notes |
| --- | ----------------------------------------- | ------- | ----- |
| 1   | Plan Selection - Load Stripe Plans        | PENDING |       |
| 2   | Plan Selection - Trial Info Display       | PENDING |       |
| 3   | Checkout - Trial (No Card Required)       | PENDING |       |
| 4   | Checkout - Card Payment Success           | PENDING |       |
| 5   | Checkout - Card Declined                  | PENDING |       |
| 6   | Billing Page - Current Plan Display       | PENDING |       |
| 7   | Billing Page - Plan Limits Shown          | PENDING |       |
| 8   | Upgrade - Starter to Professional         | PENDING |       |
| 9   | Downgrade - Professional to Starter       | PENDING |       |
| 10  | Downgrade Blocked - Too Many Members      | PENDING |       |
| 11  | Billing Portal - Access                   | PENDING |       |
| 12  | Subscription Status - Active              | PENDING |       |
| 13  | Subscription Status - Trialing            | PENDING |       |
| 14  | Subscription Status - Past Due (Blocked)  | PENDING |       |
| 15  | Quota - Pipeline Limit Starter (6/day)    | PENDING |       |
| 16  | Quota - Pipeline Limit Professional (20)  | PENDING |       |
| 17  | Quota - Exceeded Shows Error              | PENDING |       |
| 18  | Quota - Reset After Day Boundary          | PENDING |       |
| 19  | Seat Limit - Starter (2 seats)            | PENDING |       |
| 20  | Seat Limit - Upgrade Increases Limit      | PENDING |       |

**TOTAL: 0/20 PASSED | 0 FAILED | 0 SKIPPED**
```

---

## Test Flows

### 1-5. Checkout Tests

**Route:** `/onboarding/billing`

| # | Test | Action | Expected |
|---|------|--------|----------|
| 1 | Load Plans | Visit billing page | 3 plans loaded from Stripe |
| 2 | Trial Info | Check plan cards | "14-day free trial" shown |
| 3 | Trial Checkout | Select Starter, continue | No payment form (trial) |
| 4 | Card Success | Use `4242424242424242` | Subscription created |
| 5 | Card Declined | Use `4000000000000002` | Error: "Card declined" |

**Stripe Test Cards:**
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Exp: Any future date, CVC: Any 3 digits

### 6-11. Billing Page Tests

**Route:** `/{orgSlug}/billing`

| # | Test | Verify | Expected |
|---|------|--------|----------|
| 6 | Current Plan | Plan name + price | Matches Stripe subscription |
| 7 | Limits Shown | teamMembers, providers, pipelines | Values from plan metadata |
| 8 | Upgrade | Starter -> Professional | Prorated charge, new limits |
| 9 | Downgrade | Professional -> Starter | Allowed if under limits |
| 10 | Downgrade Blocked | 5 members, try Starter (2 max) | Error: "Remove members first" |
| 11 | Portal Access | Click "Manage Billing" | Redirect to Stripe portal |

### 12-14. Subscription Status Tests

| # | Status | Behavior | Pipeline Allowed |
|---|--------|----------|------------------|
| 12 | active | Full access | Yes |
| 13 | trialing | Full access (14 days) | Yes |
| 14 | past_due | Blocked | No - Error 402 |

### 15-18. Quota Enforcement Tests

**Plan Limits:**
- Starter: 6 pipelines/day, 2 seats, 3 providers
- Professional: 20 pipelines/day, 6 seats, 10 providers
- Scale: 50 pipelines/day, 11 seats, 20 providers

| # | Test | Action | Expected |
|---|------|--------|----------|
| 15 | Starter Limit | Run 6 pipelines | All succeed |
| 16 | Starter Exceeded | Run 7th pipeline | Error: "Daily limit reached" |
| 17 | Professional Limit | Run 20 pipelines | All succeed |
| 18 | Day Reset | Wait for midnight UTC | Counter resets |

### 19-20. Seat Limit Tests

| # | Test | Action | Expected |
|---|------|--------|----------|
| 19 | Starter Seats | Invite 3rd member (limit 2) | Error: "Seat limit reached" |
| 20 | Upgrade Seats | Upgrade to Professional | Can now invite up to 6 |

---

## Webhook Verification

**Route:** `app/api/webhooks/stripe/route.ts`

```markdown
| Event | Action | Verify |
|-------|--------|--------|
| checkout.session.completed | Subscription activated | status = active |
| customer.subscription.updated | Plan changed | new plan_id, limits |
| customer.subscription.deleted | Cancelled | status = canceled |
| invoice.payment_failed | Payment failed | status = past_due |
| invoice.payment_succeeded | Payment ok | status = active |
```

---

## On Failure/Crash

```
ON ERROR:
  -> Screenshot + Log URL + Mark FAILED -> Continue next test

ON CRASH:
  -> Run @[/clean_restart]
  -> Wait for healthy services
  -> Resume from crashed test
  -> Mark as FAILED - CRASH
```

---

## Report

Create: `.agent/artifacts/BILLING_QUOTA_TEST_REPORT.md`

Include:
- Final test results table
- All failures with URL + screenshot + error
- Stripe event logs if applicable
- Pass rate: X/20 tests passed
