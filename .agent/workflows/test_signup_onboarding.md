---
description: Signup, Login & Onboarding E2E Browser Tests (antigravity)
---

# Signup, Login & Onboarding E2E Tests

Browser automation tests for user authentication and onboarding flows using `browser_subagent`.

---

## CRITICAL: Execution Rules

**MANDATORY - READ FIRST:**

1. **NEVER STOP ON FAILURE** - Mark as `FAILED`, continue to next test
2. **COMPLETE 100%** - Execute ALL tests even with failures
3. **RESTART ON CRASH** - Run `@[/clean_restart]`, resume from crashed test, mark as `FAILED - CRASH`
4. **SKIP BLOCKERS** - Mark as `SKIPPED - BLOCKED BY [test]`, continue with independent tests
5. **TRACK RESULTS** - Update: `PASSED: X | FAILED: Y | SKIPPED: Z | REMAINING: N`
6. **DELETE OLD ARTIFACTS** - Create only here: `.agent/artifacts/SIGNUP_ONBOARDING_TEST_REPORT.md`

## CRITICAL: Best Practices

- No over-engineering - Simple, direct tests
- Multi-tenancy support - Proper `org_slug` isolation
- ZERO mock tests - All tests must hit real services
- Don't break existing functionality

---

## STEP 0: Pre-Test Review (MANDATORY FIRST)

**Before running ANY tests, the agent MUST complete these checks:**

### 0.1 Code Gap Analysis
```
Review and fix code gaps in:
1. FRONTEND (01-fronted-system):
   - Check components for missing error handling
   - Verify form validation logic
   - Check loading/submitting state management
   - Verify API client timeout handling

2. BACKEND (02-api-service):
   - Check endpoint error responses
   - Verify input validation
   - Check authentication middleware

3. PIPELINE (03-data-pipeline-service):
   - Check pipeline execution error handling
   - Verify quota enforcement logic
```

### 0.2 URL & Link Validation
```
Verify all URLs/routes exist and are accessible:
- [ ] /signup - Signup page loads
- [ ] /login - Login page loads
- [ ] /forgot-password - Password reset page loads
- [ ] /reset-password - Reset form loads (with valid token)
- [ ] /onboarding/billing - Billing selection loads
- [ ] /onboarding/success - Success handler works
- [ ] /{orgSlug}/dashboard - Dashboard loads after login

Fix any broken routes before proceeding.
```

### 0.3 Schema Validation
```
Verify database schemas match expected structure:
- [ ] Supabase: profiles table has required columns
- [ ] Supabase: organizations table has locale columns
- [ ] Supabase: organization_members table exists
- [ ] BigQuery: org_profiles schema matches

Run migrations if needed: cd scripts/supabase_db && ./migrate.sh
```

### 0.4 Pre-Test Report
```
Create: .agent/artifacts/SIGNUP_ONBOARDING_PRETEST_REVIEW.md
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
```

**Test User:** Create unique email with timestamp (e.g., `test_MMDDYYYY_HHMMSS@example.com`)

---

## Test Tracking

```markdown
| #   | Test                                    | Status  | Notes |
| --- | --------------------------------------- | ------- | ----- |
| 1   | Valid Signup - All Fields               | PENDING |       |
| 2   | Signup - Weak Password Rejected (<8)    | PENDING |       |
| 3   | Signup - Invalid Email Rejected         | PENDING |       |
| 4   | Signup - Duplicate Email Rejected       | PENDING |       |
| 5   | Signup - Currency Selection             | PENDING |       |
| 6   | Signup - Timezone Selection             | PENDING |       |
| 7   | Login - Valid Credentials               | PENDING |       |
| 8   | Login - Invalid Password                | PENDING |       |
| 9   | Login - Non-existent Email              | PENDING |       |
| 10  | Login - Redirect After Success          | PENDING |       |
| 11  | Forgot Password - Email Sent            | PENDING |       |
| 12  | Forgot Password - Invalid Email         | PENDING |       |
| 13  | Password Reset - Valid Token            | PENDING |       |
| 14  | Password Reset - Expired Token          | PENDING |       |
| 15  | Onboarding - Org Created                | PENDING |       |
| 16  | Onboarding - Locale Applied             | PENDING |       |
| 17  | Onboarding - API Key Generated          | PENDING |       |
| 18  | Session - Persists on Refresh           | PENDING |       |
| 19  | Logout - Session Cleared                | PENDING |       |
| 20  | Edge: XSS in Company Name               | PENDING |       |

**TOTAL: 0/20 PASSED | 0 FAILED | 0 SKIPPED**
```

---

## Test Flows

### 1-6. Signup Tests

**Route:** `http://localhost:3000/signup`

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Valid Signup | All valid fields | Account created, redirect to billing |
| 2 | Weak Password | password: `1234` | Error: "Password must be at least 8 characters" |
| 3 | Invalid Email | email: `notanemail` | Error: "Invalid email format" |
| 4 | Duplicate Email | Existing email | Error: "Email already registered" |
| 5 | Currency | Select INR | Currency stored in user_metadata |
| 6 | Timezone | Select Asia/Kolkata | Timezone stored in user_metadata |

**Valid Signup Form:**
```
Email: test_MMDDYYYY_HHMMSS@example.com
Password: TestPassword123!
Company Name: Test Corp
Company Type: Startup
Currency: USD (default)
Timezone: America/New_York (default)
```

### 7-10. Login Tests

**Route:** `http://localhost:3000/login`

| # | Test | Input | Expected |
|---|------|-------|----------|
| 7 | Valid Login | Correct credentials | Redirect to dashboard |
| 8 | Invalid Password | Wrong password | Error: "Invalid login credentials" |
| 9 | Non-existent Email | Unknown email | Error: "Invalid login credentials" |
| 10 | Redirect | Valid login | Redirect to `/{orgSlug}/dashboard` |

### 11-14. Password Reset Tests

**Routes:** `/forgot-password`, `/reset-password`

| # | Test | Action | Expected |
|---|------|--------|----------|
| 11 | Email Sent | Enter valid email | Success message, email sent |
| 12 | Invalid Email | Enter invalid format | Validation error |
| 13 | Valid Token | Click reset link | Password reset form shown |
| 14 | Expired Token | Use old link (>1hr) | Error: "Token expired" |

### 15-17. Onboarding Tests

**Route:** `/onboarding/success?session_id={id}`

| # | Test | Verify | Expected |
|---|------|--------|----------|
| 15 | Org Created | DB check | `organizations` row created |
| 16 | Locale Applied | DB check | `locale_currency`, `locale_timezone` set |
| 17 | API Key | Backend check | Org API key generated |

### 18-19. Session Tests

| # | Test | Action | Expected |
|---|------|--------|----------|
| 18 | Session Persists | Refresh page | Still logged in |
| 19 | Logout | Click logout | Redirect to `/login`, session cleared |

### 20. Edge Cases

| # | Test | Input | Expected |
|---|------|-------|----------|
| 20 | XSS Company Name | `<script>alert(1)</script>` | Tags stripped, safe storage |

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

Create: `.agent/artifacts/SIGNUP_ONBOARDING_TEST_REPORT.md`

Include:
- Final test results table
- All failures with URL + screenshot + error
- Pass rate: X/20 tests passed
