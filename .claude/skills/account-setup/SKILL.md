---
name: account-setup
description: |
  End-to-end account lifecycle testing for CloudAct. Validates login, forgot password, reset password,
  signup, Stripe onboarding, team invite, and account deletion using Playwright.
  Use when: testing account flows, debugging auth issues, validating signup/login, testing team invites,
  verifying Stripe billing, checking account deletion, or running pre-release account audits.
---

# /account-setup - End-to-End Account Lifecycle Testing

Full lifecycle testing for all CloudAct account flows using Playwright. Validates login, forgot password, reset password, signup, Stripe onboarding, team invite, and account deletion - all with zero console errors.

## Trigger

Use when: testing account flows, debugging auth issues, validating signup/login, testing team invites, verifying Stripe billing, checking account deletion, or running pre-release account audits.

```
/account-setup                              # Run all account flow tests
/account-setup login                        # Test login flow only
/account-setup forgot-password              # Test forgot password flow
/account-setup reset-password               # Test reset password flow
/account-setup signup                       # Test signup form validation
/account-setup billing                      # Test Stripe billing pages
/account-setup invite <email>               # Test team invite (default: surasani.rama@gmail.com)
/account-setup deletion                     # Test account deletion UI
/account-setup console-audit                # Sweep all pages for console errors
/account-setup full                         # Full lifecycle: all flows + console audit
```

## Prerequisites

| Requirement | Check Command | Expected |
|-------------|---------------|----------|
| Frontend running | `curl -s http://localhost:3000 -o /dev/null -w "%{http_code}"` | `200` |
| API running | `curl -s http://localhost:8000/health` | `{"status":"ok"}` |
| Playwright installed | `cd 01-fronted-system && npx playwright --version` | Version number |
| Chromium installed | `npx playwright install chromium` | Installed |
| Demo account exists | Login with `demo@cloudact.ai` / `Demo1234` | Dashboard loads |

## Instructions

### Step 0: Verify Prerequisites

```bash
REPO_ROOT=/Users/openclaw/.openclaw/workspace/cloudact-mono-repo

# Check frontend
HTTP_CODE=$(curl -s http://localhost:3000 -o /dev/null -w "%{http_code}" 2>/dev/null)
if [ "$HTTP_CODE" != "200" ]; then
  echo "Frontend not running. Starting..."
  cd $REPO_ROOT/01-fronted-system && npx next dev --port 3000 > $REPO_ROOT/logs/frontend.log 2>&1 &
  sleep 15
fi

# Check Playwright
cd $REPO_ROOT/01-fronted-system
npx playwright install chromium --with-deps 2>/dev/null || true
```

### Step 1: Run Tests

```bash
cd $REPO_ROOT/01-fronted-system

# ============ ALL FLOWS ============
npx playwright test tests/e2e/account-flows.spec.ts \
  --project=account-noauth \
  --reporter=list \
  --timeout=120000

# ============ SPECIFIC FLOWS ============
# Login
npx playwright test tests/e2e/account-flows.spec.ts \
  -g "Login Flow" --project=account-noauth --reporter=list

# Forgot Password
npx playwright test tests/e2e/account-flows.spec.ts \
  -g "Forgot Password" --project=account-noauth --reporter=list

# Reset Password
npx playwright test tests/e2e/account-flows.spec.ts \
  -g "Reset Password" --project=account-noauth --reporter=list

# Signup
npx playwright test tests/e2e/account-flows.spec.ts \
  -g "Signup Flow" --project=account-noauth --reporter=list

# Billing
npx playwright test tests/e2e/account-flows.spec.ts \
  -g "Billing" --project=account-noauth --reporter=list

# Team Invite (with custom email)
INVITE_EMAIL=surasani.rama@gmail.com npx playwright test tests/e2e/account-flows.spec.ts \
  -g "Team Invite" --project=account-noauth --reporter=list

# Account Deletion
npx playwright test tests/e2e/account-flows.spec.ts \
  -g "Account Deletion" --project=account-noauth --reporter=list

# Console Error Audit
npx playwright test tests/e2e/account-flows.spec.ts \
  -g "Console Error Audit" --project=account-noauth --reporter=list

# Headed mode (watch browser)
npx playwright test tests/e2e/account-flows.spec.ts \
  --project=account-noauth --headed --reporter=list
```

### Step 2: Check Results

```bash
# View HTML report
npx playwright show-report playwright-report

# Check for console errors in logs
grep -i "error\|warn" $REPO_ROOT/logs/frontend.log | grep -v "node_modules" | tail -20
```

### Step 3: Fix Failures

For each failing test:
1. Read the error message and screenshot in `test-results/`
2. Identify the root cause (selector, timing, rate limiting, actual bug)
3. Fix the code (not the test) unless the test has wrong assumptions
4. Re-run just the failing test group

**Common fixes:**
- Rate limiting: Wait 5 min between runs, or clear `security_events` table
- Session issues: Clear `.auth/` directory
- Selector issues: Use more flexible selectors (text patterns, role attributes)
- Timing: Increase waitForTimeout values

### Step 4: Verify Clean Run

After fixes, run full suite and verify:
- All tests pass
- Zero console errors across all pages
- No rate limiting failures
- Screenshots on failure show expected states

## Architecture

### Test File
`01-fronted-system/tests/e2e/account-flows.spec.ts`

### Playwright Config
`01-fronted-system/playwright.config.ts` - Uses `account-noauth` project:
- Depends on `setup` project (populates `.auth/user.json` + `.auth/org-slug.json`)
- No-auth tests (login, signup, forgot password): fresh browser, no storageState
- Auth tests (billing, invite, profile, deletion): use `test.use({ storageState })` per describe block
- Zero additional logins needed for auth'd tests = no rate limiting

### Test Structure

```
account-flows.spec.ts
├── Login Flow (4 tests)
│   ├── Display login page correctly
│   ├── Login with valid credentials → dashboard
│   ├── Show error for invalid credentials
│   └── Handle session expired redirect
├── Forgot Password Flow (3 tests)
│   ├── Display forgot password page
│   ├── Navigate from login to forgot password
│   └── Submit and show success/rate-limit
├── Reset Password Flow (2 tests)
│   ├── Show expired state without token
│   └── Show request new link button
├── Signup Flow (3 tests)
│   ├── Display signup page
│   ├── Password field with requirements
│   └── Link to login page
├── Billing & Stripe (3 tests)
│   ├── Display billing settings
│   ├── Display current plan info
│   └── Display plans selection page
├── Team Invite (4 tests)
│   ├── Display team page with members
│   ├── Show invite button and dialog
│   ├── Invite surasani.rama@gmail.com
│   └── Show seat usage
├── Profile Settings (2 tests)
│   ├── Display profile with email
│   └── Password change option
├── Account Deletion (3 tests)
│   ├── Display organization settings
│   ├── Danger zone with delete option
│   └── Require confirmation for deletion
├── Settings Navigation (1 test)
│   └── All settings pages load without 404
├── Invite Page (2 tests)
│   ├── Error for invalid token
│   └── Error for non-existent token
├── Onboarding (1 test)
│   └── Handle billing page
└── Console Error Audit (1 test)
    └── Sweep all pages for console errors
```

### Flow Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │           Account Lifecycle                  │
                    └─────────────────────────────────────────────┘

  Signup Flow:
    /signup → Step 1 (email, password, name) → Step 2 (company)
           → /onboarding/billing → Stripe Checkout → /onboarding/success
           → /{orgSlug}/dashboard

  Login Flow:
    /login → email + password → /{orgSlug}/dashboard
    /login → wrong password → error shown → retry

  Forgot Password:
    /login → "Forgot password?" → /forgot-password → email
           → "Check your email" → reset link sent

  Reset Password:
    Email link → /reset-password#access_token=... → new password form
               → password updated → /{orgSlug}/dashboard

  Team Invite:
    /{org}/settings/invite → "Invite" → email + role
    → Invite created → Email sent with /invite/{token}
    → Invitee: /invite/{token} → Accept → Join org

  Account Deletion:
    /{org}/settings/organization → Danger Zone → "Delete"
    → Confirmation dialog → Token email → Account deleted
```

## Dynamic Variables

| Variable | Source | Default |
|----------|--------|---------|
| `TEST_USER.email` | `tests/e2e/fixtures/test-credentials.ts` | `demo@cloudact.ai` |
| `TEST_USER.password` | `tests/e2e/fixtures/test-credentials.ts` | `Demo1234` |
| `INVITE_EMAIL` | Environment variable | `surasani.rama@gmail.com` |
| `BASE_URL` | Environment variable `TEST_BASE_URL` | `http://localhost:3000` |
| `orgSlug` | Auto-detected from login redirect | Dynamic |

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Login fails in tests | Rate limited (5/5min) | Wait 5 min or clear `security_events` |
| Forgot password rate limited | 3 per 10 min | Wait or use different email |
| Invite "already pending" | Invite exists | Cancel pending invite first |
| Invite "seat limit" | Plan limit reached | Upgrade plan or remove member |
| Stripe pages empty | Missing `STRIPE_SECRET_KEY` | Check `.env.local` |
| Reset password stuck | Missing `NEXT_PUBLIC_APP_URL` | Set to `http://localhost:3000` |
| Console errors | Real bugs | Fix the code, not the test |
| Tests timeout | Slow network/server | Increase timeout in config |
| `webServer` fails | Port 3000 already in use | Use `reuseExistingServer: true` |

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/stripe-billing` | Full billing management (webhooks, products, prices). Account-setup tests billing UI only. |
| `/bootstrap-onboard` | Backend org onboarding (BigQuery datasets, API keys). Account-setup tests frontend flows. |
| `/user-mgmt` | User/role management operations. Account-setup tests the invite + profile UI. |
| `/security-audit` | Security audit across all services. Account-setup validates rate limiting + auth UI. |

## Source Specifications

Requirements consolidated from:
- `00-requirements-specs/01_ORGANIZATION_ONBOARDING.md` - Signup, org creation, API key
- `00-requirements-specs/01_USER_MANAGEMENT.md` - Login, roles, invite, settings
- `00-requirements-specs/01_BILLING_STRIPE.md` - Plans, checkout (see `/stripe-billing` for full billing)

## Output

Report includes:
- Pass/Fail status per test
- Console errors captured per page
- Screenshots on failure (in `test-results/`)
- Invite link if invite was sent
- Rate limit status
- Total time and test count
