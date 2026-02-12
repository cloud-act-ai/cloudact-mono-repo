# Account Setup - Test Plan

## Test File
`01-fronted-system/tests/e2e/account-flows.spec.ts`

## Playwright Project
`account-noauth` - Depends on `setup` project for cached auth files:
- **No-auth tests** (Login, Forgot Password, Reset Password, Signup, Invite Page, Onboarding): Fresh browser, no storageState
- **Auth tests** (Billing, Team Invite, Profile, Account Deletion, Settings Nav, Console Audit): Use `test.use({ storageState: 'tests/e2e/.auth/user.json' })` per describe block
- **Org slug**: Read from cached `.auth/org-slug.json` via `getCachedOrgSlug()` - zero additional logins

## Test Matrix

### Login Flow (4 tests)

| # | Test | Type | Auth | Expected |
|---|------|------|------|----------|
| 1 | Display login page correctly | UI | None | h1="Welcome back", email/password fields, forgot link, signup link |
| 2 | Login with valid credentials | E2E | Fresh login | Redirect to `/{orgSlug}/dashboard` |
| 3 | Show error for invalid credentials | E2E | None | Error message visible, stays on `/login` |
| 4 | Handle session expired redirect | UI | None | `?reason=session_expired` shows expired message |

### Forgot Password Flow (3 tests)

| # | Test | Type | Auth | Expected |
|---|------|------|------|----------|
| 5 | Display forgot password page | UI | None | h1="Forgot password?", email field, submit button |
| 6 | Navigate from login to forgot password | Nav | None | Click link → `/forgot-password` |
| 7 | Submit and show success | E2E | None | "Check your email" or rate limit error |

### Reset Password Flow (2 tests)

| # | Test | Type | Auth | Expected |
|---|------|------|------|----------|
| 8 | Show expired state without token | UI | None | "Verifying Link" → "Link Expired" |
| 9 | Show request new link button | UI | None | `/forgot-password` link visible |

### Signup Flow (3 tests)

| # | Test | Type | Auth | Expected |
|---|------|------|------|----------|
| 10 | Display signup page | UI | None | h1 visible, email field |
| 11 | Password field with requirements | UI | None | minLength attribute present |
| 12 | Link to login page | UI | None | `/login` link visible |

### Billing & Stripe (3 tests)

| # | Test | Type | Auth | Expected |
|---|------|------|------|----------|
| 13 | Display billing settings page | UI | storageState | Billing heading visible |
| 14 | Display current plan info | UI | storageState | Plan name (starter/professional/scale) |
| 15 | Display plans selection page | UI | storageState | Price elements ($19/$69/$199) |

### Team Invite (4 tests)

| # | Test | Type | Auth | Expected |
|---|------|------|------|----------|
| 16 | Display team page with members | UI | storageState | Heading, owner badge |
| 17 | Show invite button and dialog | E2E | storageState | Email input in dialog |
| 18 | Invite surasani.rama@gmail.com | E2E | storageState | Success or "already pending" |
| 19 | Show seat usage | UI | storageState | Seat count indicator |

### Profile Settings (2 tests)

| # | Test | Type | Auth | Expected |
|---|------|------|------|----------|
| 20 | Display profile with email | UI | storageState | Heading + `demo@cloudact.ai` |
| 21 | Password change option | UI | storageState | Password text visible |

### Account Deletion (3 tests)

| # | Test | Type | Auth | Expected |
|---|------|------|------|----------|
| 22 | Display organization settings | UI | storageState | Organization heading |
| 23 | Danger zone with delete option | E2E | storageState | Delete option in danger zone |
| 24 | Require confirmation for deletion | E2E | storageState | Dialog on delete click |

### Settings Navigation (1 test)

| # | Test | Type | Auth | Expected |
|---|------|------|------|----------|
| 25 | All settings pages without 404 | Nav | storageState | 6 pages load successfully |

### Invite Page (2 tests)

| # | Test | Type | Auth | Expected |
|---|------|------|------|----------|
| 26 | Error for invalid token | UI | None | Error message for short token |
| 27 | Error for non-existent token | UI | None | Error for 64-char fake token |

### Onboarding (1 test)

| # | Test | Type | Auth | Expected |
|---|------|------|------|----------|
| 28 | Handle billing page | Nav | None | Redirect to login or show plans |

### Console Error Audit (1 test)

| # | Test | Type | Auth | Expected |
|---|------|------|------|----------|
| 29 | No critical console errors | Audit | storageState | 0 errors across 8 pages |

**Total: 29 tests**

## Run Commands

```bash
cd 01-fronted-system

# Full suite
npx playwright test tests/e2e/account-flows.spec.ts --project=account-noauth --reporter=list

# Single test group
npx playwright test tests/e2e/account-flows.spec.ts --project=account-noauth -g "Login Flow"
npx playwright test tests/e2e/account-flows.spec.ts --project=account-noauth -g "Team Invite"

# Headed mode
npx playwright test tests/e2e/account-flows.spec.ts --project=account-noauth --headed

# With traces
npx playwright test tests/e2e/account-flows.spec.ts --project=account-noauth --trace on
```

## Pass Criteria

| Criteria | Target |
|----------|--------|
| Tests passing | 29/29 (100%) |
| Console errors | 0 |
| Rate limiting failures | 0 (with sufficient cooldown) |
| Screenshots on failure | Available in `test-results/` |
| Test execution time | < 20 min total |

## Known Limitations

1. **Rate limiting**: Only affects `setup` project (1 login) and the Login Flow test (1 login). Auth'd tests use storageState (zero logins). Safe to re-run within 5 min unless lockout triggered by external logins.
2. **Invite idempotency**: Re-running invite test shows "already pending" (acceptable)
3. **Reset password**: Cannot test full reset flow without email access (tests the UI states only)
4. **Stripe checkout**: Cannot complete actual checkout in tests (tests plan display only)
5. **Account deletion**: Tests UI only, does not actually delete the demo account

## Edge Cases Tested

- Invalid credentials → error message
- Session expired → redirect with reason
- Missing/expired reset token → "Link Expired" state
- Invalid invite token (short) → error
- Valid-format but non-existent invite token → error
- Rate limited forgot password → appropriate error
- Already-member invite → "already pending" message
- Unauthenticated onboarding → redirect to login
