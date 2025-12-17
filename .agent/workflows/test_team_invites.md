---
description: Team Invites & Member Management E2E Browser Tests (antigravity)
---

# Team Invites & Member Management E2E Tests

Browser automation tests for team invitations, role management, and member access using `browser_subagent`.

---

## CRITICAL: Execution Rules

**MANDATORY - READ FIRST:**

1. **NEVER STOP ON FAILURE** - Mark as `FAILED`, continue to next test
2. **COMPLETE 100%** - Execute ALL tests even with failures
3. **RESTART ON CRASH** - Run `@[/clean_restart]`, resume from crashed test, mark as `FAILED - CRASH`
4. **SKIP BLOCKERS** - Mark as `SKIPPED - BLOCKED BY [test]`, continue with independent tests
5. **TRACK RESULTS** - Update: `PASSED: X | FAILED: Y | SKIPPED: Z | REMAINING: N`
6. **DELETE OLD ARTIFACTS** - Create only here: `.agent/artifacts/TEAM_INVITES_TEST_REPORT.md`

## CRITICAL: Best Practices

- No over-engineering - Simple, direct tests
- Multi-tenancy support - Test cross-org access blocking
- ZERO mock tests - Real invites, real acceptance
- Role matrix verification - All 3 roles tested

---

## STEP 0: Pre-Test Review (MANDATORY FIRST)

**Before running ANY tests, the agent MUST complete these checks:**

### 0.1 Code Gap Analysis
```
Review and fix code gaps in:
1. FRONTEND (01-fronted-system):
   - actions/members.ts - Invite send/accept logic
   - app/[orgSlug]/settings/members - Member list UI
   - app/[orgSlug]/settings/invite - Invite form
   - app/invite/[token] - Invite acceptance page
   - Verify rate limiting implementation

2. BACKEND (02-api-service):
   - Member role validation
   - Seat limit enforcement
   - Token expiry handling

3. MIDDLEWARE:
   - Role-based access control
   - Org membership verification
```

### 0.2 URL & Link Validation
```
Verify all URLs/routes exist and are accessible:
- [ ] /{orgSlug}/settings/members - Member list page
- [ ] /{orgSlug}/settings/invite - Invite form page
- [ ] /invite/[token] - Invite acceptance page
- [ ] /{orgSlug}/settings/danger - Account deletion page
- [ ] /unauthorized - Unauthorized redirect page

Fix any broken routes before proceeding.
```

### 0.3 Schema Validation
```
Verify database schemas match expected structure:
- [ ] Supabase: organization_members table
- [ ] Supabase: invites table with token, expires_at columns
- [ ] Supabase: profiles table with role column
- [ ] RLS policies for member access

Run migrations if needed: cd scripts/supabase_db && ./migrate.sh
```

### 0.4 Pre-Test Report
```
Create: .agent/artifacts/TEAM_INVITES_PRETEST_REVIEW.md
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
# Verify services
curl -s http://localhost:3000 > /dev/null && echo "Frontend: OK" || echo "Frontend: DOWN"
```

**Test Setup:**
- Owner account with active subscription
- 2+ test email addresses for invites

---

## Test Tracking

```markdown
| #   | Test                                    | Status  | Notes |
| --- | --------------------------------------- | ------- | ----- |
| 1   | Member List - Display All               | PENDING |       |
| 2   | Member List - Pagination                | PENDING |       |
| 3   | Invite - Valid Email + Role             | PENDING |       |
| 4   | Invite - Invalid Email Rejected         | PENDING |       |
| 5   | Invite - Rate Limit (10/hour)           | PENDING |       |
| 6   | Invite - Seat Limit Enforced            | PENDING |       |
| 7   | Invite - Duplicate Email Warning        | PENDING |       |
| 8   | Invite Accept - New User                | PENDING |       |
| 9   | Invite Accept - Existing User           | PENDING |       |
| 10  | Invite Accept - Token Expired           | PENDING |       |
| 11  | Invite Accept - Invalid Token           | PENDING |       |
| 12  | Role - Collaborator Permissions         | PENDING |       |
| 13  | Role - Read-Only Permissions            | PENDING |       |
| 14  | Role Change - Collaborator to ReadOnly  | PENDING |       |
| 15  | Role Change - ReadOnly to Collaborator  | PENDING |       |
| 16  | Role Change - Non-Owner Blocked         | PENDING |       |
| 17  | Member Remove - Owner Removes Member    | PENDING |       |
| 18  | Member Remove - Access Revoked          | PENDING |       |
| 19  | Account Delete - Session Cleared        | PENDING |       |
| 20  | Account Delete - Org Transfer           | PENDING |       |

**TOTAL: 0/20 PASSED | 0 FAILED | 0 SKIPPED**
```

---

## Test Flows

### 1-2. Member List Tests

**Route:** `/{orgSlug}/settings/members`

| # | Test | Action | Expected |
|---|------|--------|----------|
| 1 | Display All | Visit members page | All members listed with roles |
| 2 | Pagination | Add 100+ members | Pagination controls work |

### 3-7. Invite Send Tests

**Route:** `/{orgSlug}/settings/invite`

| # | Test | Input | Expected |
|---|------|-------|----------|
| 3 | Valid Invite | `test@example.com`, collaborator | Success, token generated |
| 4 | Invalid Email | `notanemail` | Error: "Invalid email format" |
| 5 | Rate Limit | Send 11 invites in 1 hour | 11th blocked: "Rate limit exceeded" |
| 6 | Seat Limit | Invite when at max seats | Error: "Seat limit reached" |
| 7 | Duplicate | Same email twice | Warning: "Already invited" |

### 8-11. Invite Accept Tests

**Route:** `/invite/[token]`

| # | Test | Scenario | Expected |
|---|------|----------|----------|
| 8 | New User | New email clicks link | Signup -> Accept -> Dashboard |
| 9 | Existing User | Logged in user clicks | Direct accept -> Dashboard |
| 10 | Expired | Token > 48 hours | Error: "Invite expired" |
| 11 | Invalid | Random token | Error: "Invalid invite" |

### 12-16. Role Permission Tests

**Permission Matrix:**

| Feature | Owner | Collaborator | Read-Only |
|---------|-------|--------------|-----------|
| View Dashboard | Yes | Yes | Yes |
| View Analytics | Yes | Yes | Yes |
| Edit Integrations | Yes | Yes | No |
| Run Pipelines | Yes | Yes | No |
| Invite Members | Yes | No | No |
| Change Roles | Yes | No | No |
| Access Billing | Yes | No | No |

| # | Test | Role | Action | Expected |
|---|------|------|--------|----------|
| 12 | Collaborator Perms | collaborator | Run pipeline | Allowed |
| 13 | Read-Only Perms | read_only | Run pipeline | Blocked |
| 14 | Change to ReadOnly | owner | Change collaborator | Success |
| 15 | Change to Collaborator | owner | Change read_only | Success |
| 16 | Non-Owner Change | collaborator | Try change role | Blocked |

### 17-18. Member Removal Tests

| # | Test | Action | Expected |
|---|------|--------|----------|
| 17 | Owner Removes | Click remove on member | Member removed |
| 18 | Access Revoked | Removed user tries access | Redirected to /unauthorized |

### 19-20. Account Deletion Tests

**Route:** `/{orgSlug}/settings/danger`

| # | Test | Scenario | Expected |
|---|------|----------|----------|
| 19 | Session Cleared | Delete account | Logged out, redirect /login |
| 20 | Org Transfer | Owner deletes, has members | Ownership transfers to senior member |

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

Create: `.agent/artifacts/TEAM_INVITES_TEST_REPORT.md`

Include:
- Final test results table
- All failures with URL + screenshot + error
- Role permission matrix verification
- Pass rate: X/20 tests passed
