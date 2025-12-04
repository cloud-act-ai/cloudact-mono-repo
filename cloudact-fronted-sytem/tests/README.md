# Test Suite - README

## Overview

Comprehensive test suite for CloudAct.ai platform with two types of tests:

1. **Integration Tests** (`scripts/tests/`) - Real API/database tests using TypeScript scripts
2. **Browser Tests** (`tests/`) - UI tests using Vitest + Playwright

---

## Integration Tests (REAL - No Mocks)

Located in `tests/integration/` folder.

### Prerequisites

1. Run health check first:
```bash
npx tsx tests/test_health_check.ts
```

2. Required services:
   - ✅ API Service (port 8000) - REQUIRED
   - ✅ Supabase - REQUIRED
   - ⚠️ Frontend (port 3000) - Optional for API tests
   - ⚠️ Pipeline Service (port 8001) - Optional

### Running Integration Tests

```bash
# Health check (verify services are up)
npx tsx tests/test_health_check.ts

# Run all integration tests
npx tsx tests/integration/run_all_tests.ts

# Run specific test
npx tsx tests/integration/test_organization_delete.ts
```

### Available Integration Tests

| Test | Description | Services Required |
|------|-------------|-------------------|
| `integration/test_organization_delete.ts` | Organization deletion flow (triggers, soft-delete, backend cleanup) | Supabase, API Service |

### Configuration

All tests use environment variables from `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY` - Admin access
- `API_SERVICE_URL` - API Service URL (default: http://localhost:8000)
- `PIPELINE_SERVICE_URL` - Pipeline Service URL (default: http://localhost:8001)
- `CA_ROOT_API_KEY` - Backend admin key

**NO hardcoded URLs** - all URLs come from environment variables.

---

## Browser Test Flows (Original)

Comprehensive browser-based test suite for CloudAct.ai platform using Vitest + Playwright. Tests are self-updating and scan for architecture/form changes before execution.

## Test Architecture

### Self-Updating Tests
Each test file includes:
1. **Architecture Scanner** - Scans codebase for form/component changes
2. **Form Detector** - Identifies input fields and their attributes
3. **Test Updater** - Updates test selectors if changes detected
4. **Validation** - Verifies test assumptions before execution

### Test Flows

#### Flow 1: Complete Signup Journey
**File:** `flows/01-signup-onboarding-billing-checkout-dashboard.test.ts`

**Steps:**
1. Signup new user
2. Complete organization onboarding
3. View billing page
4. Complete Stripe checkout (if applicable)
5. Access dashboard
6. Verify all features accessible

**Duration:** ~2-3 minutes

---

#### Flow 2: Login with Signup Fallback
**File:** `flows/02-login-with-signup-fallback.test.ts`

**Steps:**
1. Attempt login with existing user
2. If user doesn't exist, signup
3. Handle multi-org selection
4. Verify dashboard access

**Duration:** ~1 minute

---

#### Flow 3: Team Member Invite
**File:** `flows/03-team-member-invite.test.ts`

**Steps:**
1. Signup/login as admin
2. Navigate to team settings
3. Invite new member
4. **Logout**
5. **Login as invited member**
6. Accept invitation
7. Verify team access

**Duration:** ~3-4 minutes

---

#### Flow 4: Billing Upgrade/Downgrade
**File:** `flows/04-billing-upgrade-downgrade.test.ts`

**Steps:**
1. Login with existing org
2. Navigate to billing
3. Upgrade plan (Starter → Professional)
4. Verify upgrade success
5. Downgrade plan (Professional → Starter)
6. Verify downgrade success

**Duration:** ~2-3 minutes

---

#### Flow 5: Profile Update
**File:** `flows/05-profile-update.test.ts`

**Steps:**
1. Login
2. Navigate to profile
3. Update profile information
4. Save changes
5. Verify updates persisted

**Duration:** ~1 minute

---

#### Flow 6: Backend Onboarding Sync
**File:** `flows/06-backend-onboarding-sync.test.ts`

**Steps:**
1. Create organization
2. Verify backend onboarding triggered
3. Check API key generation
4. Verify BigQuery dataset creation
5. Test integration setup
6. Run test pipeline

**Duration:** ~3-4 minutes

---

## Running Tests

### Single Flow
```bash
npm test -- flows/01-signup-onboarding-billing-checkout-dashboard.test.ts
```

### All Flows Sequentially
```bash
npm test -- flows/
```

### All Flows in Parallel
```bash
npm test -- flows/ --maxWorkers=6
```

### With Architecture Scan
```bash
SCAN_ARCHITECTURE=true npm test -- flows/
```

---

## Test Data Management

### Test Users
Tests create unique users with timestamps:
- Pattern: `test_flow_{flowname}_{timestamp}@test.com`
- Password: `testpass123` (configurable via env)

### Test Organizations
- Pattern: `testorg_{flowname}_{timestamp}`
- Automatically cleaned up after test (optional)

### Isolation
- Each test uses unique email/org
- Multi-tenancy ensures no conflicts
- Parallel execution safe

---

## Architecture Scanner

### How It Works
1. **Pre-Test Scan:** Scans relevant files for changes
2. **Form Detection:** Identifies input fields, buttons, selectors
3. **Comparison:** Compares with cached selectors
4. **Update:** Updates test if changes detected
5. **Validation:** Runs quick validation before full test

### Scanned Files
- `app/signup/page.tsx`
- `app/signin/page.tsx`
- `app/onboarding/organization/page.tsx`
- `app/[orgSlug]/billing/page.tsx`
- `app/[orgSlug]/settings/team/page.tsx`
- `app/[orgSlug]/settings/profile/page.tsx`

### Cached Selectors
Stored in: `tests/flows/.cache/selectors.json`

---

## Test Utilities

### Browser Helpers
**File:** `tests/utils/browser-helpers.ts`

Functions:
- `waitForNavigation()` - Wait for page navigation
- `fillForm()` - Fill form with data
- `clickAndWait()` - Click element and wait
- `verifyElement()` - Verify element exists
- `takeScreenshot()` - Capture screenshot

### Test Data Generators
**File:** `tests/utils/test-data.ts`

Functions:
- `generateTestEmail()` - Unique email
- `generateOrgName()` - Unique org name
- `generateTestUser()` - Complete user data

### Cleanup Utilities
**File:** `tests/utils/cleanup.ts`

Functions:
- `cleanupTestUser()` - Delete test user
- `cleanupTestOrg()` - Delete test org
- `cleanupAll()` - Full cleanup

---

## Configuration

### Environment Variables
```bash
# Test Configuration
TEST_BASE_URL=http://localhost:3000
TEST_TIMEOUT=60000
TEST_HEADLESS=false

# Test Data
TEST_PASSWORD=testpass123
TEST_CLEANUP=true

# Architecture Scanner
SCAN_ARCHITECTURE=true
CACHE_SELECTORS=true
UPDATE_TESTS_AUTO=true

# Parallel Execution
MAX_WORKERS=6
TEST_RETRY=2
```

### Jest Configuration
**File:** `jest.config.js`

```javascript
module.exports = {
  testMatch: ['**/tests/flows/**/*.test.ts'],
  testTimeout: 60000,
  maxWorkers: process.env.MAX_WORKERS || 6,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
}
```

---

## Best Practices

### 1. Always Scan Before Running
```bash
SCAN_ARCHITECTURE=true npm test
```

### 2. Use Unique Test Data
```typescript
const email = generateTestEmail('signup-flow')
const orgName = generateOrgName('test-org')
```

### 3. Clean Up After Tests
```typescript
afterAll(async () => {
  await cleanupTestUser(email)
  await cleanupTestOrg(orgSlug)
})
```

### 4. Handle Async Operations
```typescript
await waitForNavigation('/dashboard')
await page.waitForSelector('[data-testid="dashboard"]')
```

### 5. Take Screenshots on Failure
```typescript
try {
  // test code
} catch (error) {
  await takeScreenshot('test-failure')
  throw error
}
```

---

## Troubleshooting

### Test Fails with "Element Not Found"
1. Run architecture scan: `SCAN_ARCHITECTURE=true npm test`
2. Check if selectors updated
3. Manually verify element exists in browser

### Test Hangs on Navigation
1. Check for infinite redirects
2. Verify authentication state
3. Increase timeout if needed

### Parallel Tests Conflict
1. Verify unique test data generation
2. Check database isolation
3. Review multi-tenancy setup

### Architecture Scanner Not Updating
1. Clear cache: `rm -rf tests/flows/.cache`
2. Force update: `UPDATE_TESTS_AUTO=true npm test`
3. Check file permissions

---

## CI/CD Integration

### GitHub Actions
```yaml
name: Browser Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node
        uses: actions/setup-node@v2
      - name: Install dependencies
        run: npm install
      - name: Run tests
        run: SCAN_ARCHITECTURE=true npm test -- flows/
        env:
          TEST_BASE_URL: http://localhost:3000
          TEST_HEADLESS: true
```

---

## Maintenance

### Weekly Tasks
- [ ] Review test failures
- [ ] Update test data
- [ ] Clean up old test users/orgs
- [ ] Review architecture changes

### Monthly Tasks
- [ ] Audit test coverage
- [ ] Update documentation
- [ ] Review performance
- [ ] Optimize slow tests

---

## Support

For issues or questions:
1. Check this README
2. Review test logs
3. Run architecture scanner
4. Contact dev team

---

## Version History

- **v1.0.0** (2025-11-28) - Initial release with 6 core flows
- Self-updating architecture scanner
- Parallel execution support
- Multi-tenancy isolation
