---
description: SaaS Subscription E2E Browser Tests (antigravity)
---

# SaaS Subscription E2E Tests

Browser automation tests for SaaS subscription management using `browser_subagent`.

---

## CRITICAL: Execution Rules

**MANDATORY - READ FIRST:**

1. **NEVER STOP ON FAILURE** - Mark as `FAILED`, continue to next test
2. **COMPLETE 100%** - Execute ALL tests even with failures
3. **RESTART ON CRASH** - Run `@[/clean_restart]`, resume from crashed test, mark as `FAILED - CRASH`
4. **SKIP BLOCKERS** - Mark as `SKIPPED - BLOCKED BY [test]`, continue with independent tests
5. **TRACK RESULTS** - Update: `PASSED: X | FAILED: Y | SKIPPED: Z | REMAINING: N`
6. **DELETE OLD ARTIFACTS** - Delete old artifacts if exists and Create only here: `.agent/artifacts/SUBSCRIPTION_TEST_REPORT_COMPREHENSIVE.md`

## CRITICAL: Follow best practices for test execution

- No over-engineering - Simple, direct fixes
- Multi-tenancy support - Proper `org_slug` isolation
- Enterprise-grade for 10k customers - Must scale
- BigQuery best practices - Clustering, partitioning, timeouts
- Supabase best practices - RLS, connection pooling, tight integration
- ZERO mock tests - All tests must hit real services
- Don't break existing functionality - Run all tests before/after

---

## STEP 0: Pre-Test Review (MANDATORY FIRST)

**Before running ANY tests, the agent MUST complete these checks:**

### 0.1 Code Gap Analysis
```
Review and fix code gaps in:
1. FRONTEND (01-fronted-system):
   - actions/subscription-providers.ts - All CRUD operations
   - app/[orgSlug]/integrations/subscriptions/* - All subscription pages
   - Check setSubmitting/setSaving state resets in error paths
   - Check fetchWithTimeout usage (no bare fetch calls)
   - Verify onFocus handlers for input selection

2. BACKEND (02-api-service):
   - /api/v1/subscriptions endpoints
   - Duplicate detection logic
   - Version history on edits
   - Soft delete on end

3. PIPELINE (03-data-pipeline-service):
   - SaaS cost calculation pipeline
   - Provider enable/disable logic
```

### 0.2 URL & Link Validation
```
Verify all URLs/routes exist and are accessible:
- [ ] /{orgSlug}/integrations/subscriptions - Provider list
- [ ] /{orgSlug}/integrations/subscriptions/{provider} - Provider detail
- [ ] /{orgSlug}/integrations/subscriptions/{provider}/add - Add from template
- [ ] /{orgSlug}/integrations/subscriptions/{provider}/add/custom - Custom add
- [ ] /{orgSlug}/integrations/subscriptions/{provider}/{id}/edit - Edit plan
- [ ] /{orgSlug}/integrations/subscriptions/{provider}/{id}/end - End plan
- [ ] /{orgSlug}/integrations/subscriptions/{provider}/success - Success page

Fix any broken routes before proceeding.
```

### 0.3 Schema Validation
```
Verify database schemas match expected structure:
- [ ] Supabase: subscriptions table
- [ ] BigQuery: subscriptions table with all columns
- [ ] BigQuery: Audit fields (source_currency, exchange_rate_used)
- [ ] CSV: data/seed/exchange-rates.csv exists
- [ ] CSV: data/seed/saas-subscription-templates.csv exists

Run migrations if needed.
```

### 0.4 Pre-Test Report
```
Create: .agent/artifacts/SUBSCRIPTION_PRETEST_REVIEW.md
Include:
- Code gaps found and fixed
- Broken URLs found and fixed
- Schema issues found and fixed
- Ready for testing: YES/NO
```

**Only proceed to tests after Step 0 is complete!**

---

## Prerequisites

```bash
# Verify services are running
curl -s http://localhost:3000 > /dev/null && echo "Frontend: OK" || echo "Frontend: DOWN"
curl -s http://localhost:8000/health | jq -r '.status' 2>/dev/null || echo "API: DOWN"
curl -s http://localhost:8001/health | jq -r '.status' 2>/dev/null || echo "Pipeline: DOWN"
```

**URL:** `http://localhost:3000/dashboard/integrations/saas`

---

## Test Tracking

```markdown
| #   | Test                                          | Status  | Notes |
| --- | --------------------------------------------- | ------- | ----- |
| 1   | Login & Navigate to SaaS                      | PENDING |       |
| 2   | Enable Provider (Canva)                       | PENDING |       |
| 3   | Add Plan - ChatGPT PLUS ($20, 1 user)         | PENDING |       |
| 4   | Add Plan - ChatGPT TEAM ($25, 10 users)       | PENDING |       |
| 5   | Add Plan - Claude PRO ($20, 1 user)           | PENDING |       |
| 6   | Add Plan - Claude TEAM ($30, 5 users)         | PENDING |       |
| 7   | Add Plan - Copilot BUSINESS ($19, 15 users)   | PENDING |       |
| 8   | Add Plan - Teams BUSINESS ($12.50, 20 users)  | PENDING |       |
| 9   | Add Plan - Canva TEAMS ($10, 8 users)         | PENDING |       |
| 10  | Add Plan - Slack PRO ($8.75, 25 users)        | PENDING |       |
| 11  | Add Plan - Slack BUSINESS ($15, 50 users)     | PENDING |       |
| 12  | Add Plan - ChatGPT ENTERPRISE ($0, 100 users) | PENDING |       |
| 13  | Edit Plan (Version History)                   | PENDING |       |
| 14  | End Subscription (Soft Delete)                | PENDING |       |
| 15  | Verify Cost Calculations                      | PENDING |       |
| 16  | Disable Provider                              | PENDING |       |
| 17  | Edge: $0 price allowed                        | PENDING |       |
| 18  | Edge: 0 users rejected                        | PENDING |       |
| 19  | Edge: negative price rejected                 | PENDING |       |
| 20  | Edge: duplicate plan name allowed             | PENDING |       |

**TOTAL: 0/20 PASSED | 0 FAILED | 0 SKIPPED**
```

---

## Test Flows

### 1. Login & Navigate

1. Go to `http://localhost:3000/login`
2. Login with valid credentials
3. Navigate to Integrations → SaaS Subscriptions
4. Verify provider list loads

### 2. Enable Provider

1. Find disabled provider (Canva)
2. Click "Enable"
3. Verify success toast

### 3-12. Add 10 Subscription Plans

| #   | Provider     | Plan       | Type       | Price  | Users |
| --- | ------------ | ---------- | ---------- | ------ | ----- |
| 3   | ChatGPT Plus | PLUS       | individual | $20.00 | 1     |
| 4   | ChatGPT Plus | TEAM       | team       | $25.00 | 10    |
| 5   | Claude Pro   | PRO        | individual | $20.00 | 1     |
| 6   | Claude Pro   | TEAM       | team       | $30.00 | 5     |
| 7   | Copilot      | BUSINESS   | team       | $19.00 | 15    |
| 8   | Teams        | BUSINESS   | team       | $12.50 | 20    |
| 9   | Canva        | TEAMS      | team       | $10.00 | 8     |
| 10  | Slack        | PRO        | team       | $8.75  | 25    |
| 11  | Slack        | BUSINESS   | team       | $15.00 | 50    |
| 12  | ChatGPT Plus | ENTERPRISE | enterprise | $0.00  | 100   |

**For each:** Click provider → Add Plan → Fill form → Save → **Verify values match input**

### 13. Edit Plan (Version History)

1. Select existing plan → Edit
2. Change users count
3. Set new effective date
4. Save → Verify new version created

### 14. End Subscription

1. Select plan → End Subscription
2. Set end date → Confirm
3. Verify status = "cancelled"

### 15. Verify Cost Calculations

1. Go to Dashboard
2. Check SaaS Costs widget
3. Verify: total = sum(price × users) for active plans

### 16. Disable Provider

1. Click Disable on enabled provider
2. Confirm → Verify all plans get end_date

### 17-20. Edge Cases

- **17:** Add plan with $0 price → Should allow
- **18:** Add plan with 0 users → Should reject
- **19:** Add plan with negative price → Should reject
- **20:** Add duplicate plan name → Should allow

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

Delete old artifacts if exists and Create only here: `.agent/artifacts/SUBSCRIPTION_TEST_REPORT_COMPREHENSIVE.md`

Include:

- Final test results table
- All failures with URL + screenshot + error
- Pass rate: X/20 tests passed
