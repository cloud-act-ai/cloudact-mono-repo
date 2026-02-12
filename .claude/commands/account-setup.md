# /account-setup - End-to-End Account Flow Testing

Complete account lifecycle testing using Playwright. Tests all auth flows, Stripe onboarding, team management, and account deletion.

## Usage

```
/account-setup                        # Run all account flow tests
/account-setup login                  # Test login flow only
/account-setup forgot-password        # Test forgot password flow
/account-setup reset-password         # Test reset password flow
/account-setup signup                 # Test signup + Stripe onboarding
/account-setup invite <email>         # Test team invite (e.g., surasani.rama@gmail.com)
/account-setup billing                # Test Stripe billing pages
/account-setup deletion               # Test account deletion flow
/account-setup full                   # Full flow: signup → billing → invite → deletion
```

## Prerequisites

| Requirement | Check |
|-------------|-------|
| Frontend running | `curl -s http://localhost:3000 -o /dev/null -w "%{http_code}"` → 200 |
| API running | `curl -s http://localhost:8000/health` → OK |
| Playwright installed | `cd 01-fronted-system && npx playwright --version` |
| Demo account exists | Email: `demo@cloudact.ai` / Password: `Demo1234` |

## Dynamic Variables

| Variable | Source | Default |
|----------|--------|---------|
| `TEST_EMAIL` | `$1` or env | `demo@cloudact.ai` |
| `TEST_PASSWORD` | env | `Demo1234` |
| `INVITE_EMAIL` | `$2` or arg | `surasani.rama@gmail.com` |
| `ORG_SLUG` | Auto-detected from login | Dynamic |
| `BASE_URL` | env `TEST_BASE_URL` | `http://localhost:3000` |

## Instructions

### Step 0: Verify Prerequisites

```bash
# Check frontend
curl -s http://localhost:3000 -o /dev/null -w "Frontend: HTTP %{http_code}\n"

# Check Playwright
cd $REPO_ROOT/01-fronted-system && npx playwright --version

# Ensure browsers installed
npx playwright install chromium --with-deps 2>/dev/null || true
```

### Step 1: Run Account Flow Tests

Run the comprehensive E2E test suite:

```bash
cd $REPO_ROOT/01-fronted-system

# All account flows
npx playwright test tests/e2e/account-flows.spec.ts --reporter=list

# Specific test group
npx playwright test tests/e2e/account-flows.spec.ts -g "Login Flow" --reporter=list
npx playwright test tests/e2e/account-flows.spec.ts -g "Forgot Password" --reporter=list
npx playwright test tests/e2e/account-flows.spec.ts -g "Team Invite" --reporter=list
npx playwright test tests/e2e/account-flows.spec.ts -g "Billing" --reporter=list
npx playwright test tests/e2e/account-flows.spec.ts -g "Account Deletion" --reporter=list

# Headed mode (watch the browser)
npx playwright test tests/e2e/account-flows.spec.ts --headed --reporter=list

# With traces on failure
npx playwright test tests/e2e/account-flows.spec.ts --trace on --reporter=list
```

### Step 2: Check Console Errors

After running tests, check for console errors:

```bash
# Check test results
cat $REPO_ROOT/01-fronted-system/test-results/*/trace.zip 2>/dev/null && echo "Traces available" || echo "No traces (all passed)"

# Check frontend logs for errors
grep -i "error\|warn\|exception" $REPO_ROOT/logs/frontend.log | grep -v "node_modules" | tail -20

# Check API logs
grep -i "error\|exception" $REPO_ROOT/logs/api.log | tail -10
```

### Step 3: Team Invite Flow (Manual via Playwright)

If invite email specified, run the invite-specific test:

```bash
cd $REPO_ROOT/01-fronted-system

# Invite specific email
INVITE_EMAIL=surasani.rama@gmail.com npx playwright test tests/e2e/account-flows.spec.ts -g "should invite team member" --headed --reporter=list
```

### Step 4: Verify Clean Logs

```bash
echo "=== Console Error Check ==="

# Frontend build errors
cd $REPO_ROOT/01-fronted-system
grep -i "error" .next/trace 2>/dev/null | head -5 || echo "No build errors"

# Runtime errors from test run
grep -i "unhandled\|uncaught\|fatal\|CRITICAL" $REPO_ROOT/logs/frontend.log 2>/dev/null | tail -10 || echo "No runtime errors"

echo "=== All checks complete ==="
```

## Test Coverage Matrix

| Flow | Page | Actions Tested | Assertions |
|------|------|---------------|------------|
| **Login** | `/login` | Email/password submit, redirect | Dashboard redirect, session valid |
| **Login (invalid)** | `/login` | Wrong password | Error message shown |
| **Forgot Password** | `/forgot-password` | Email submit | Success message, "Check your email" |
| **Reset Password** | `/reset-password` | Session check, new password | Verifying link state, form display |
| **Signup Form** | `/signup` | Step 1: account, Step 2: org | Validation, step progression |
| **Stripe Billing** | `/onboarding/billing` | Plan display | 3 plans visible, prices correct |
| **Billing Settings** | `/{org}/settings/billing` | Current plan, invoices | Plan name, payment method |
| **Team Invite** | `/{org}/settings/invite` | Invite dialog, email submit | Invite created, link generated |
| **Team Members** | `/{org}/settings/invite` | Member list, roles | Owner shown, role badges |
| **Account Deletion** | `/{org}/settings/organization` | Danger zone, delete button | Confirmation required |
| **Profile Settings** | `/{org}/settings/personal` | Name, email display | Fields populated |
| **Password Change** | `/{org}/settings/personal` | Password section visible | Change option exists |

## Flows Diagram

```
Login Flow:
  /login → email+password → /{orgSlug}/dashboard ✓

Forgot Password Flow:
  /login → "Forgot password?" → /forgot-password → email → "Check your email" ✓

Reset Password Flow:
  /reset-password → Verifying Link → (with token) → New password form ✓
  /reset-password → (no token) → "Link Expired" → /forgot-password ✓

Signup + Stripe Flow:
  /signup → Step 1 (email, password, name, phone)
         → Step 2 (company name)
         → /onboarding/billing → Select plan → Stripe Checkout
         → /onboarding/success → /{orgSlug}/dashboard ✓

Team Invite Flow:
  /{org}/settings/invite → "Invite Member" → email + role
  → Invite created → Link generated → Email sent
  → /invite/{token} → Accept → Join org ✓

Account Deletion Flow:
  /{org}/settings/organization → Danger Zone tab
  → "Delete Account" → Confirmation dialog → Token email
  → /api/account/delete?token=xxx → Account deleted ✓
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Login fails | Check demo account exists: `demo@cloudact.ai` / `Demo1234` |
| Rate limited | Wait 5 minutes or clear `security_events` table |
| Invite fails | Check seat limit, verify owner role |
| Stripe pages empty | Check `STRIPE_SECRET_KEY` in `.env.local` |
| Reset password stuck | Check `NEXT_PUBLIC_APP_URL` is `http://localhost:3000` |
| Console errors | Check `$REPO_ROOT/logs/frontend.log` |
| Test timeout | Increase timeout in playwright.config.ts |

## Output Format

Report for each flow:
- Flow name and status (PASS/FAIL)
- Console errors captured (if any)
- Screenshots on failure (in `test-results/`)
- Total time and test count
- Invite link (if invite flow tested)
