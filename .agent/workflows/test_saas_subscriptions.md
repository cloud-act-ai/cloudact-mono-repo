---
description: Run comprehensive 10-subscription E2E test with browser automation
---

# Test SaaS Subscriptions (Comprehensive)

This workflow runs the rigorous "Flow 16" test, which requires the agent to drive the browser to creating 10 distinct subscriptions and verify the detailed cost logic.

## 1. Ensure Environment & Frontend

// turbo
Make sure the frontend is running (port 3000) and API (8000).

## 2. Execute Test Definition

Run the test file to see the detailed scenarios and instructions.

```bash
cd 01-fronted-system && npx vitest tests/16-saas-subscription-comprehensive_e2e.test.ts
```

## 3. Browser Automation (Manual Step for Agent)

**ACTION REQUIRED**: Read the output/content of `tests/16-saas-subscription-comprehensive_e2e.test.ts`.
**Rule Check**: Verify compliance with `.agent/rules.md` before proceeding.

Use the `browser_subagent` to:

1.  **Signup/Login**
2.  **Add all 10 Plans**
    - _Critical_: Verify input data integrity (e.g., did "50" become "150"?).
3.  **Test the 8 Edge Cases**
4.  **Monitor Logs & URL**:
    - **IF FAILURE**: Log the **Exact URL** where it failed.
    - **Check Logs**: `logs/api.log`, `logs/frontend.log`, `logs/pipeline.log`.
    - **IF CRASH**: If logs show a crash/exit, run `@[/clean_restart]` and RESUME.

## 4. Generate Report

Create a new file `.agent/artifacts/SUBSCRIPTION_TEST_REPORT_COMPREHENSIVE.md`.

- Copy content from `01-fronted-system/tests/SUBSCRIPTION_TEST_REPORT_TEMPLATE.md`.
- **CRITICAL**: List at least 10 bugs/issues/observations.
- **Root Cause**: For every bug, note the URL and relevant Log snippet.
