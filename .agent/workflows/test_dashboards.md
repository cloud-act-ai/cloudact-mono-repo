---
description: Cost Dashboards & Analytics E2E Browser Tests (antigravity)
---

# Cost Dashboards & Analytics E2E Tests

Browser automation tests for cost dashboards, analytics, and activity logs using `browser_subagent`.

---

## CRITICAL: Execution Rules

**MANDATORY - READ FIRST:**

1. **NEVER STOP ON FAILURE** - Mark as `FAILED`, continue to next test
2. **COMPLETE 100%** - Execute ALL tests even with failures
3. **RESTART ON CRASH** - Run `@[/clean_restart]`, resume from crashed test, mark as `FAILED - CRASH`
4. **SKIP BLOCKERS** - Mark as `SKIPPED - BLOCKED BY [test]`, continue with independent tests
5. **TRACK RESULTS** - Update: `PASSED: X | FAILED: Y | SKIPPED: Z | REMAINING: N`
6. **DELETE OLD ARTIFACTS** - Create only here: `.agent/artifacts/DASHBOARDS_TEST_REPORT.md`

## CRITICAL: Best Practices

- No over-engineering - Simple, direct tests
- ZERO mock tests - Real data from pipelines
- Currency formatting verified per org locale
- Charts render with correct data

---

## STEP 0: Pre-Test Review (MANDATORY FIRST)

**Before running ANY tests, the agent MUST complete these checks:**

### 0.1 Code Gap Analysis
```
Review and fix code gaps in:
1. FRONTEND (01-fronted-system):
   - lib/dashboard-data.ts - Data fetching logic
   - components/charts/ - Chart components
   - app/[orgSlug]/dashboard - Main dashboard
   - app/[orgSlug]/cost-dashboards/* - Cost pages
   - lib/i18n/formatters.ts - Currency/date formatting

2. BACKEND (02-api-service):
   - Dashboard data endpoints
   - Cost aggregation queries

3. DATA:
   - Verify pipeline has generated test data
   - Verify SaaS subscriptions exist for cost display
```

### 0.2 URL & Link Validation
```
Verify all URLs/routes exist and are accessible:
- [ ] /{orgSlug}/dashboard - Main dashboard
- [ ] /{orgSlug}/cost-dashboards/cloud-costs - Cloud costs
- [ ] /{orgSlug}/cost-dashboards/subscription-costs - SaaS costs
- [ ] /{orgSlug}/cost-dashboards/genai-costs - GenAI costs
- [ ] /{orgSlug}/settings/activity - Activity logs

Fix any broken routes before proceeding.
```

### 0.3 Schema Validation
```
Verify database schemas match expected structure:
- [ ] BigQuery: Cost data tables populated
- [ ] Supabase: activity_logs table
- [ ] Supabase: organizations.locale_currency column

Run pipelines if data is missing.
```

### 0.4 Pre-Test Report
```
Create: .agent/artifacts/DASHBOARDS_PRETEST_REVIEW.md
Include:
- Code gaps found and fixed
- Broken URLs found and fixed
- Schema issues found and fixed
- Test data availability verified
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

**Test Setup:**
- Account with active subscription
- Some pipeline data (run GCP billing pipeline first)
- Some SaaS subscriptions for cost data

---

## Test Tracking

```markdown
| #   | Test                                    | Status  | Notes |
| --- | --------------------------------------- | ------- | ----- |
| 1   | Main Dashboard - Load                   | PENDING |       |
| 2   | Main Dashboard - Summary Cards          | PENDING |       |
| 3   | Main Dashboard - Cost Trend Chart       | PENDING |       |
| 4   | Main Dashboard - Period Selector (7d)   | PENDING |       |
| 5   | Main Dashboard - Period Selector (30d)  | PENDING |       |
| 6   | Cloud Costs - Load                      | PENDING |       |
| 7   | Cloud Costs - By Service                | PENDING |       |
| 8   | Cloud Costs - By Project                | PENDING |       |
| 9   | Cloud Costs - Date Range Filter         | PENDING |       |
| 10  | SaaS Costs - Total Display              | PENDING |       |
| 11  | SaaS Costs - By Provider                | PENDING |       |
| 12  | SaaS Costs - By Billing Cycle           | PENDING |       |
| 13  | SaaS Costs - Currency Formatting        | PENDING |       |
| 14  | GenAI Costs - Load (Future)             | PENDING |       |
| 15  | Activity Logs - Load                    | PENDING |       |
| 16  | Activity Logs - Filter by Action        | PENDING |       |
| 17  | Activity Logs - Pagination              | PENDING |       |
| 18  | Currency - USD Formatting               | PENDING |       |
| 19  | Currency - INR Formatting               | PENDING |       |
| 20  | Timezone - Dates in Org Timezone        | PENDING |       |

**TOTAL: 0/20 PASSED | 0 FAILED | 0 SKIPPED**
```

---

## Test Flows

### 1-5. Main Dashboard Tests

**Route:** `/{orgSlug}/dashboard`

| # | Test | Verify | Expected |
|---|------|--------|----------|
| 1 | Load | Page loads | No errors, content visible |
| 2 | Summary Cards | Total costs, trends | Values from real data |
| 3 | Cost Trend | Line chart | Chart renders with data points |
| 4 | 7-day Period | Select 7 days | Data updates to 7-day range |
| 5 | 30-day Period | Select 30 days | Data updates to 30-day range |

### 6-9. Cloud Costs Dashboard Tests

**Route:** `/{orgSlug}/cost-dashboards/cloud-costs`

| # | Test | Action | Expected |
|---|------|--------|----------|
| 6 | Load | Visit page | GCP costs displayed |
| 7 | By Service | View breakdown | Compute, Storage, etc. |
| 8 | By Project | View breakdown | Projects listed |
| 9 | Date Filter | Select date range | Data filtered correctly |

### 10-13. SaaS Costs Dashboard Tests

**Route:** `/{orgSlug}/cost-dashboards/subscription-costs`

| # | Test | Verify | Expected |
|---|------|--------|----------|
| 10 | Total | Sum of all active plans | Correct calculation |
| 11 | By Provider | Grouped view | Slack, Canva, etc. |
| 12 | By Cycle | Monthly, Annual | Correct grouping |
| 13 | Currency | org.locale_currency | Proper symbol + decimals |

**Cost Calculation:**
```
Monthly Total = SUM(price_per_unit * quantity) for all active plans
```

### 14. GenAI Costs Dashboard Test

**Route:** `/{orgSlug}/cost-dashboards/genai-costs`

| # | Test | Verify | Expected |
|---|------|--------|----------|
| 14 | Load | Page loads | Shows placeholder or data |

### 15-17. Activity Logs Tests

**Route:** `/{orgSlug}/settings/activity`

| # | Test | Action | Expected |
|---|------|--------|----------|
| 15 | Load | Visit page | Recent actions listed |
| 16 | Filter | Select action type | Filtered results |
| 17 | Pagination | Navigate pages | 10 items per page |

**Logged Actions:**
- Member invited
- Member role changed
- Integration added/removed
- Pipeline executed
- Subscription created/edited/ended

### 18-20. Locale Formatting Tests

| # | Test | Org Locale | Input | Expected |
|---|------|------------|-------|----------|
| 18 | USD | currency: USD | 1234.50 | $1,234.50 |
| 19 | INR | currency: INR | 1234.50 | ₹1,234.50 |
| 20 | Timezone | Asia/Kolkata | UTC timestamp | Converted to IST |

**Formatter Verification:**
```javascript
formatCurrency(1234.50, "USD") // "$1,234.50"
formatCurrency(1234.50, "INR") // "₹1,234.50"
formatDateTime(date, "Asia/Kolkata") // IST time
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

Create: `.agent/artifacts/DASHBOARDS_TEST_REPORT.md`

Include:
- Final test results table
- All failures with URL + screenshot + error
- Chart rendering issues noted
- Pass rate: X/20 tests passed
