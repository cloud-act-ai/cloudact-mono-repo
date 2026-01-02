---
description: E2E Test Workflow Index - Execution Order & Overview
---

# E2E Test Workflow Index

Complete index of all E2E browser test workflows with recommended execution order.

---

## Execution Order

Tests should be run in this order due to dependencies:

```
1. test_signup_onboarding.md    -> Creates test user + org (required for all others)
2. test_billing_quota.md        -> Sets up billing (required for pipelines)
3. test_organization.md         -> Org settings + locale (affects other tests)
4. test_team_invites.md         -> Team management (independent)
5. test_integrations.md         -> LLM/Cloud setup (required for pipelines)
6. test_pipelines.md            -> Pipeline execution (requires integrations)
7. test_dashboards.md           -> Analytics (requires pipeline data)
8. test_subscriptions.md   -> SaaS costs (independent)
```

---

## Test Workflows Summary

| # | Workflow | Tests | Focus Area | Dependencies |
|---|----------|-------|------------|--------------|
| 1 | `test_signup_onboarding.md` | 20 | Auth, signup, login, password reset | None |
| 2 | `test_billing_quota.md` | 20 | Stripe, plans, quota enforcement | #1 |
| 3 | `test_organization.md` | 20 | Org settings, locale, multi-org | #1 |
| 4 | `test_team_invites.md` | 20 | Invites, roles, member management | #1, #2 |
| 5 | `test_integrations.md` | 20 | OpenAI, Anthropic, GCP setup | #1, #2 |
| 6 | `test_pipelines.md` | 20 | Pipeline execution, quota, history | #1, #2, #5 |
| 7 | `test_dashboards.md` | 20 | Cost dashboards, analytics, logs | #1, #6 |
| 8 | `test_subscriptions.md` | 20 | SaaS subscriptions, multi-currency | #1, #2 |

**Total: 160 tests across 8 workflows**

---

## Quick Reference

### Run All Tests (Sequential)
```bash
# Execute in order
@test_signup_onboarding.md
@test_billing_quota.md
@test_organization.md
@test_team_invites.md
@test_integrations.md
@test_pipelines.md
@test_dashboards.md
@test_subscriptions.md
```

### Run Independent Tests (Parallel OK)
```bash
# These can run in parallel after #1-2 complete
@test_team_invites.md      # Independent
@test_subscriptions.md # Independent
@test_organization.md       # Independent
```

### Run Integration Flow (Sequential)
```bash
# Must be sequential
@test_integrations.md -> @test_pipelines.md -> @test_dashboards.md
```

---

## Test Categories by Feature

### Authentication & Users
- `test_signup_onboarding.md` - Full auth flow

### Billing & Payments
- `test_billing_quota.md` - Stripe integration, quotas

### Organization Management
- `test_organization.md` - Settings, locale, multi-org
- `test_team_invites.md` - Members, invites, roles

### Integrations
- `test_integrations.md` - LLM + Cloud providers
- `test_subscriptions.md` - SaaS cost tracking

### Execution & Analytics
- `test_pipelines.md` - Pipeline runs
- `test_dashboards.md` - Cost analytics

---

## Report Artifacts

Each workflow generates a report in `.agent/artifacts/`:

| Workflow | Report File |
|----------|-------------|
| test_signup_onboarding | `SIGNUP_ONBOARDING_TEST_REPORT.md` |
| test_billing_quota | `BILLING_QUOTA_TEST_REPORT.md` |
| test_organization | `ORGANIZATION_TEST_REPORT.md` |
| test_team_invites | `TEAM_INVITES_TEST_REPORT.md` |
| test_integrations | `INTEGRATIONS_TEST_REPORT.md` |
| test_pipelines | `PIPELINES_TEST_REPORT.md` |
| test_dashboards | `DASHBOARDS_TEST_REPORT.md` |
| test_subscriptions | `SUBSCRIPTION_TEST_REPORT_COMPREHENSIVE.md` |

---

## Pre-Flight Checklist

Before running any tests:

```bash
# 1. Verify all services running
curl -s http://localhost:3000 > /dev/null && echo "Frontend: OK" || echo "Frontend: DOWN"
curl -s http://localhost:8000/health | jq -r '.status' 2>/dev/null || echo "API: DOWN"
curl -s http://localhost:8001/health | jq -r '.status' 2>/dev/null || echo "Pipeline: DOWN"

# 2. Clean restart if needed
@clean_restart.md

# 3. Verify Stripe test mode
echo "Ensure STRIPE_SECRET_KEY starts with sk_test_"
```

---

## Common Test Data

### Test User Template
```
Email: test_MMDDYYYY_HHMMSS@example.com
Password: TestPassword123!
Company: Test Corp
Currency: USD
Timezone: America/New_York
```

### Stripe Test Cards
```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
Exp: Any future date
CVC: Any 3 digits
```

### Plan Limits Reference
```
Starter:      2 seats,  3 providers,  6 pipelines/day
Professional: 6 seats, 10 providers, 20 pipelines/day
Scale:       11 seats, 20 providers, 50 pipelines/day
```

---

## Failure Recovery

If any workflow crashes:

1. Run `@clean_restart.md`
2. Wait for all services healthy
3. Resume from failed test (mark as FAILED - CRASH)
4. Continue remaining tests
5. Generate partial report

**Never stop on failure - complete all tests!**
