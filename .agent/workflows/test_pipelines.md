---
description: Pipeline Execution & History E2E Browser Tests (antigravity)
---

# Pipeline Execution & History E2E Tests

Browser automation tests for pipeline execution, quota enforcement, and run history using `browser_subagent`.

---

## CRITICAL: Execution Rules

**MANDATORY - READ FIRST:**

1. **NEVER STOP ON FAILURE** - Mark as `FAILED`, continue to next test
2. **COMPLETE 100%** - Execute ALL tests even with failures
3. **RESTART ON CRASH** - Run `@[/clean_restart]`, resume from crashed test, mark as `FAILED - CRASH`
4. **SKIP BLOCKERS** - Mark as `SKIPPED - BLOCKED BY [test]`, continue with independent tests
5. **TRACK RESULTS** - Update: `PASSED: X | FAILED: Y | SKIPPED: Z | REMAINING: N`
6. **DELETE OLD ARTIFACTS** - Create only here: `.agent/artifacts/PIPELINES_TEST_REPORT.md`

## CRITICAL: Best Practices

- No over-engineering - Simple, direct tests
- ZERO mock tests - Real pipeline execution
- Quota checks must hit both Supabase AND BigQuery
- Status transitions verified in real-time

---

## STEP 0: Pre-Test Review (MANDATORY FIRST)

**Before running ANY tests, the agent MUST complete these checks:**

### 0.1 Code Gap Analysis
```
Review and fix code gaps in:
1. FRONTEND (01-fronted-system):
   - actions/pipelines.ts - Pipeline execution logic
   - app/[orgSlug]/pipelines - Pipeline list/history UI
   - Verify quota check before execution

2. BACKEND (02-api-service):
   - Pipeline trigger endpoints
   - Quota enforcement middleware
   - Status update logic

3. PIPELINE (03-data-pipeline-service):
   - /api/v1/pipelines/run endpoint
   - GCP billing pipeline processor
   - SaaS cost calculation pipeline
   - Error handling and status updates
   - Timeout handling (fetchWithTimeout)
```

### 0.2 URL & Link Validation
```
Verify all URLs/routes exist and are accessible:
- [ ] /{orgSlug}/pipelines - Pipeline list page
- [ ] /{orgSlug}/pipelines/cost-runs - Cost pipeline history
- [ ] Backend: POST /api/v1/pipelines/run/{org}/gcp/cost/billing
- [ ] Backend: GET /api/v1/pipelines/status/{org}/{runId}

Fix any broken routes before proceeding.
```

### 0.3 Schema Validation
```
Verify database schemas match expected structure:
- [ ] BigQuery: org_meta_pipeline_runs table
- [ ] BigQuery: org_meta_step_logs table
- [ ] BigQuery: org_usage_quotas table
- [ ] Supabase: organizations.pipelines_per_day_limit column

Run migrations if needed.
```

### 0.4 Pre-Test Report
```
Create: .agent/artifacts/PIPELINES_PRETEST_REVIEW.md
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
# Verify all services
curl -s http://localhost:3000 > /dev/null && echo "Frontend: OK" || echo "Frontend: DOWN"
curl -s http://localhost:8000/health | jq -r '.status' 2>/dev/null || echo "API: DOWN"
curl -s http://localhost:8001/health | jq -r '.status' 2>/dev/null || echo "Pipeline: DOWN"
```

**Test Setup:**
- Account with active subscription
- GCP integration configured (for billing pipeline)
- Valid org API key

---

## Test Tracking

```markdown
| #   | Test                                    | Status  | Notes |
| --- | --------------------------------------- | ------- | ----- |
| 1   | Pipeline List - Load History            | PENDING |       |
| 2   | Pipeline List - Pagination              | PENDING |       |
| 3   | Pipeline List - Filter by Status        | PENDING |       |
| 4   | GCP Billing - Valid Date                | PENDING |       |
| 5   | GCP Billing - Invalid Date Format       | PENDING |       |
| 6   | GCP Billing - Future Date Rejected      | PENDING |       |
| 7   | Pipeline Status - Pending               | PENDING |       |
| 8   | Pipeline Status - Running               | PENDING |       |
| 9   | Pipeline Status - Completed             | PENDING |       |
| 10  | Pipeline Status - Failed                | PENDING |       |
| 11  | Quota - Active Subscription Allowed     | PENDING |       |
| 12  | Quota - Trialing Subscription Allowed   | PENDING |       |
| 13  | Quota - Suspended Subscription Blocked  | PENDING |       |
| 14  | Quota - Daily Limit (Starter: 6)        | PENDING |       |
| 15  | Quota - Limit Exceeded Error            | PENDING |       |
| 16  | Quota - Upgrade Increases Limit         | PENDING |       |
| 17  | Pipeline Details - View Run Info        | PENDING |       |
| 18  | Pipeline Details - Records Processed    | PENDING |       |
| 19  | Pipeline Details - Error Message        | PENDING |       |
| 20  | SaaS Cost Pipeline - Trigger            | PENDING |       |

**TOTAL: 0/20 PASSED | 0 FAILED | 0 SKIPPED**
```

---

## Test Flows

### 1-3. Pipeline List Tests

**Route:** `/{orgSlug}/pipelines`

| # | Test | Action | Expected |
|---|------|--------|----------|
| 1 | Load History | Visit pipelines page | Recent runs displayed |
| 2 | Pagination | Navigate pages | 10 runs per page |
| 3 | Filter Status | Select "completed" | Only completed shown |

### 4-6. GCP Billing Pipeline Tests

**Endpoint:** `POST /api/v1/pipelines/run/{orgSlug}/gcp/cost/billing`

| # | Test | Input | Expected |
|---|------|-------|----------|
| 4 | Valid Date | `{"date": "2025-12-01"}` | Pipeline starts, run_id returned |
| 5 | Invalid Format | `{"date": "12/01/2025"}` | Error: "Invalid date format" |
| 6 | Future Date | Tomorrow's date | Error: "Future dates not allowed" |

### 7-10. Pipeline Status Tests

**Status Transitions:** pending -> running -> completed/failed

| # | Status | Verify | Expected |
|---|--------|--------|----------|
| 7 | pending | Immediately after trigger | Status = "pending" |
| 8 | running | During execution | Status = "running" |
| 9 | completed | After success | Status = "completed", records > 0 |
| 10 | failed | On error | Status = "failed", error_message set |

### 11-16. Quota Enforcement Tests

**Subscription Status -> Pipeline Access:**

| Status | BigQuery Status | Allowed |
|--------|-----------------|---------|
| active | ACTIVE | Yes |
| trialing | TRIAL | Yes |
| past_due | SUSPENDED | No |
| canceled | CANCELLED | No |

| # | Test | Setup | Expected |
|---|------|-------|----------|
| 11 | Active | status = active | Pipeline runs |
| 12 | Trialing | status = trialing | Pipeline runs |
| 13 | Suspended | status = past_due | Error 402: "Subscription suspended" |
| 14 | Daily Limit | Run 6 on Starter | All succeed |
| 15 | Limit Exceeded | Run 7th | Error: "Daily limit reached (6/6)" |
| 16 | Upgrade | Upgrade to Professional | Limit now 20/day |

**Plan Limits:**
- Starter: 6 pipelines/day
- Professional: 20 pipelines/day
- Scale: 50 pipelines/day

### 17-19. Pipeline Details Tests

**Route:** `/{orgSlug}/pipelines/{runId}`

| # | Test | Verify | Expected |
|---|------|--------|----------|
| 17 | View Info | Click on run | Details page loads |
| 18 | Records | completed run | Records processed count shown |
| 19 | Error | failed run | Error message displayed |

### 20. SaaS Cost Pipeline Test

**Endpoint:** `POST /api/v1/pipelines/run/{orgSlug}/saas/cost/calculate`

| # | Test | Action | Expected |
|---|------|--------|----------|
| 20 | Trigger | Run SaaS cost calculation | Cost data updated |

---

## API Verification

```bash
# Run pipeline via API
curl -X POST "http://localhost:8001/api/v1/pipelines/run/{orgSlug}/gcp/cost/billing" \
  -H "X-API-Key: {org_api_key}" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-12-01"}'

# Check pipeline status
curl "http://localhost:8001/api/v1/pipelines/status/{orgSlug}/{runId}" \
  -H "X-API-Key: {org_api_key}"
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

Create: `.agent/artifacts/PIPELINES_TEST_REPORT.md`

Include:
- Final test results table
- All failures with URL + screenshot + error
- Pipeline run IDs for failed tests
- Pass rate: X/20 tests passed
