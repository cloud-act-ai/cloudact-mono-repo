# E2E Browser Automation Tests

End-to-end browser automation tests using Playwright for CloudAct frontend.

## Test Coverage Summary

**Total Test Suites**: 9 comprehensive suites
**Total Test Cases**: 105+ tests
**Coverage Areas**: Authentication, Billing, User Journey, Team Management, Hierarchy, Integrations, Deletions

| Suite | Tests | Status |
|-------|-------|--------|
| Authentication & Onboarding | 30+ | ✅ Complete |
| Billing & Stripe | 20+ | ✅ Complete |
| Complete User Journey | 15+ | ✅ Complete |
| Team & Hierarchy | 40+ | ✅ Complete |
| Organization Deletion | 17 | ✅ Complete |
| Integrations (GCP, GenAI, SaaS) | Various | ✅ Complete |

## Test Files

### Comprehensive User Flow Tests (NEW)

| Test File | Test Suites | Description |
|-----------|-------------|-------------|
| **`auth-onboarding.spec.ts`** | 7 suites, 30+ tests | Complete authentication and onboarding flows |
| **`billing-stripe.spec.ts`** | 8 suites, 20+ tests | Stripe billing, checkout, and subscription management |
| **`complete-user-journey.spec.ts`** | 9 suites, 15+ tests | End-to-end user lifecycle from signup to deletion |
| **`team-hierarchy.spec.ts`** | 9 suites, 40+ tests | Team management and organizational hierarchy |

### Integration & Feature Tests

| Test File | Description |
|-----------|-------------|
| `org-account-deletion.spec.ts` | Organization and account deletion with multi-system validation |
| `gcp-integration.spec.ts` | GCP cloud provider integration tests |
| `genai-integration.spec.ts` | GenAI provider integration tests |
| `subscription-integration.spec.ts` | SaaS subscription integration tests |
| `filter-verification.spec.ts` | Cost dashboard filter verification |

## Prerequisites

1. **Frontend running**: Start the development server
   ```bash
   cd 01-fronted-system
   npm run dev
   ```
   Frontend should be accessible at `http://localhost:3000`

2. **Backend services running**: Ensure API and Pipeline services are running
   ```bash
   # Terminal 1: API Service (port 8000)
   cd 02-api-service
   python3 -m uvicorn src.app.main:app --port 8000 --reload

   # Terminal 2: Pipeline Service (port 8001)
   cd 03-data-pipeline-service
   python3 -m uvicorn src.app.main:app --port 8001 --reload
   ```

3. **Test user created**: Ensure test user exists in Supabase
   - Email: `demo@cloudact.ai`
   - Password: `demo1234`
   - Organization: `Acme Inc` (slug: `acme_inc_01062026`)

## Running Tests

### Run all E2E tests
```bash
cd 01-fronted-system
npx playwright test tests/e2e/
```

### Run specific test file
```bash
# Authentication & Onboarding tests
npx playwright test tests/e2e/auth-onboarding.spec.ts

# Billing & Stripe tests
npx playwright test tests/e2e/billing-stripe.spec.ts

# Complete user journey tests
npx playwright test tests/e2e/complete-user-journey.spec.ts

# Team & Hierarchy tests
npx playwright test tests/e2e/team-hierarchy.spec.ts

# Organization deletion tests
npx playwright test tests/e2e/org-account-deletion.spec.ts

# GCP integration tests
npx playwright test tests/e2e/gcp-integration.spec.ts

# GenAI integration tests
npx playwright test tests/e2e/genai-integration.spec.ts
```

### Run tests in headed mode (watch browser)
```bash
npx playwright test tests/e2e/org-account-deletion.spec.ts --headed
```

### Run tests in debug mode
```bash
npx playwright test tests/e2e/org-account-deletion.spec.ts --debug
```

### Run specific test by name
```bash
npx playwright test tests/e2e/org-account-deletion.spec.ts -g "should successfully delete organization"
```

### Run tests with UI (Playwright Inspector)
```bash
npx playwright test tests/e2e/ --ui
```

## Organization Deletion Tests

The `org-account-deletion.spec.ts` file contains comprehensive tests for:

### Test Suites

1. **Organization Deletion Flow**
   - Successfully delete organization through UI
   - Show confirmation dialog when deleting
   - Require exact organization name to confirm
   - Prevent account deletion while organization exists

2. **Account Deletion Flow**
   - Enable account deletion after all organizations deleted
   - Automatic logout after org deletion

3. **Organization Settings Navigation**
   - Navigate to organization settings
   - Display all tabs correctly

4. **Error Handling**
   - Handle login failures gracefully
   - Show loading state during deletion
   - Validate confirmation input

5. **Complete Cleanup Flow**
   - Full end-to-end organization and account deletion
   - Session clearing verification
   - Protected route access verification

### Test Flow Example

```typescript
// 1. Login
await login(page, 'demo@cloudact.ai', 'demo1234');

// 2. Navigate to Danger Zone
await navigateToDangerZone(page);

// 3. Delete organization
await deleteOrganization(page, 'Acme Inc');

// 4. Verify cleanup
expect(page).toHaveURL('http://localhost:3000');
```

## Authentication & Onboarding Tests (NEW)

The `auth-onboarding.spec.ts` file contains comprehensive tests for the complete authentication flow:

### Test Suites (7 suites, 30+ tests)

1. **Signup Flow - Step 1 (Account Creation)**
   - Display signup form with all required fields
   - Validate email format
   - Validate password requirements
   - Show field-level validation errors
   - Prevent submission with invalid data
   - Handle duplicate email addresses

2. **Signup Flow - Step 2 (Organization Creation)**
   - Display organization creation form
   - Validate organization name
   - Show industry and size selectors
   - Navigate between steps
   - Complete signup and redirect to billing

3. **Login Flow**
   - Display login form
   - Successfully login with valid credentials
   - Show error for invalid credentials
   - Show error for non-existent user
   - Redirect to dashboard after login
   - Remember user session

4. **Logout Flow**
   - Successfully logout from application
   - Clear session on logout
   - Redirect to home page after logout
   - Prevent access to protected routes after logout

5. **Session Management**
   - Maintain session across page reloads
   - Automatically redirect authenticated users
   - Protect routes requiring authentication
   - Handle session expiration

6. **Form Validation**
   - Email validation (format, length)
   - Password validation (minimum 8 characters, complexity)
   - Required field validation
   - Real-time validation feedback

7. **Error Handling**
   - Display server errors gracefully
   - Handle network failures
   - Show loading states during submission
   - Provide clear error messages

### Key Features

- **2-Step Signup**: Account creation → Organization creation
- **Email Validation**: Format and uniqueness checks
- **Password Requirements**: Minimum 8 characters
- **Session Persistence**: Maintains login across reloads
- **Protected Routes**: Automatic redirect for unauthenticated users

### Test Flow Example

```typescript
// Complete signup flow
await completeSignup(page, {
  email: 'test@example.com',
  password: 'secure123',
  firstName: 'John',
  lastName: 'Doe',
  orgName: 'Test Company',
});

// Should redirect to billing page
await expect(page).toHaveURL(/\/onboarding\/billing/);
```

## Billing & Stripe Tests (NEW)

The `billing-stripe.spec.ts` file tests Stripe integration and billing workflows:

### Test Suites (8 suites, 20+ tests)

1. **Pricing Page Display**
   - Display all three plans (Starter, Professional, Scale)
   - Show correct pricing for each plan
   - Display plan features
   - Highlight recommended plan
   - Show trial information

2. **Stripe Checkout Flow**
   - Initiate checkout from pricing page
   - Load Stripe checkout session
   - Display payment form
   - Support test card numbers
   - Handle successful payment
   - Handle payment failures

3. **Payment Processing**
   - Process test card successfully (4242 4242 4242 4242)
   - Handle declined cards (4000 0000 0000 0002)
   - Handle insufficient funds (4000 0000 0000 9995)
   - Show processing indicators
   - Redirect after successful payment

4. **Subscription Status**
   - Display current subscription status
   - Show active subscriptions
   - Display trial period
   - Show subscription expiration
   - Update status after payment

5. **Plan Changes**
   - Upgrade to higher plan
   - Downgrade to lower plan
   - Calculate prorated charges
   - Show preview of charges
   - Confirm plan changes

6. **Billing Portal**
   - Access Stripe billing portal
   - View payment history
   - Update payment method
   - Download invoices
   - Manage subscription

7. **Trial Period Management**
   - Display trial status
   - Show days remaining
   - Notify before trial ends
   - Handle trial expiration
   - Convert trial to paid

8. **Error Handling**
   - Handle Stripe errors gracefully
   - Show user-friendly messages
   - Retry failed operations
   - Provide support contact
   - Log errors for debugging

### Key Features

- **Test Mode**: Uses Stripe TEST keys for safe testing
- **Test Cards**: Supports all Stripe test card numbers
- **Checkout Session**: Creates unique session for each checkout
- **Webhooks**: Tests webhook handling (checkout.session.completed, etc.)
- **Billing Portal**: Integrates Stripe customer portal

### Test Flow Example

```typescript
// Select and purchase plan
await navigateToPricingPage(page);
await selectPlan(page, 'Professional');

// Complete Stripe checkout
await fillStripeCheckout(page, {
  cardNumber: '4242424242424242',
  expiry: '12/34',
  cvc: '123',
  zip: '12345',
});

// Verify subscription activated
await expect(page).toHaveURL(/\/dashboard/);
await verifySubscriptionActive(page, orgSlug);
```

## Complete User Journey Tests (NEW)

The `complete-user-journey.spec.ts` file tests the entire user lifecycle:

### Test Suites (9 suites, 15+ tests)

1. **Complete User Journey (9-Phase Flow)**
   - **Phase 1**: Signup (account + organization)
   - **Phase 2**: Navigate to dashboard
   - **Phase 3**: Explore navigation (analytics, pipelines, settings)
   - **Phase 4**: View integrations (GenAI, Cloud, Subscriptions)
   - **Phase 5**: Manage team members
   - **Phase 6**: Configure hierarchy
   - **Phase 7**: Access billing
   - **Phase 8**: Update profile
   - **Phase 9**: Logout

2. **Integration Setup Workflow**
   - Navigate to integrations page
   - View available providers
   - Setup GenAI provider (OpenAI, Anthropic, Gemini)
   - Setup cloud provider (GCP, AWS, Azure)
   - Verify integration status
   - Test connection

3. **Pipeline Execution Workflow**
   - Navigate to pipelines page
   - View available pipelines
   - Configure pipeline parameters
   - Execute pipeline run
   - Monitor pipeline status
   - View pipeline results

4. **Cost Analytics Workflow**
   - Navigate to cost analytics
   - View cost overview
   - Filter by date range
   - Filter by provider
   - Filter by hierarchy
   - Export cost data

5. **Organization Settings Workflow**
   - Access organization settings
   - Update organization details
   - Configure preferences
   - Manage API keys
   - View usage quotas

6. **User Experience Flow**
   - Smooth transitions between pages
   - Loading states during operations
   - Error recovery mechanisms
   - Responsive feedback

7. **Error Recovery**
   - Handle API failures gracefully
   - Retry failed operations
   - Show meaningful error messages
   - Provide recovery options

8. **Performance Metrics**
   - Page load times < 3 seconds
   - API response times < 2 seconds
   - Smooth animations
   - No UI blocking

9. **Navigation & Accessibility**
   - Breadcrumbs on all pages
   - Keyboard navigation support
   - Screen reader compatibility
   - Focus management

### Key Features

- **End-to-End Coverage**: Tests complete user lifecycle
- **Multi-Phase Journey**: 9 distinct phases from signup to logout
- **Integration Testing**: Tests all major features
- **Performance Validation**: Measures page load times
- **Accessibility**: Validates keyboard navigation and ARIA labels

### Test Flow Example

```typescript
// Complete journey from signup to dashboard
const testData = generateUserJourneyData();

// Phase 1: Signup
await completeSignup(page, testData);

// Phase 2: Dashboard
const orgSlug = await skipBillingToDashboard(page);

// Phase 3-9: Navigate through all major features
await exploreNavigation(page, orgSlug);
await viewIntegrations(page, orgSlug);
await manageTeam(page, orgSlug);
// ... continue through all phases
```

## Team & Hierarchy Tests (NEW)

The `team-hierarchy.spec.ts` file tests team management and organizational hierarchy:

### Test Suites (9 suites, 40+ tests)

1. **Team Member Management**
   - Display team members page
   - Invite new team members
   - Validate email addresses
   - Prevent duplicate invitations
   - Display pending invites
   - Resend invitations
   - Cancel pending invites

2. **Role Management**
   - Display member roles (owner, admin, collaborator, read-only)
   - Update member roles
   - Prevent owner from removing themselves
   - Show role permissions
   - Validate role changes

3. **Hierarchy Management**
   - Display hierarchy page
   - Show hierarchy levels (Department, Project, Team)
   - Create department
   - Create project under department
   - Create team under project
   - Display hierarchy tree view
   - Edit hierarchy entities
   - Prevent deleting entities with children
   - Display entity count stats

4. **CSV Import/Export**
   - Show export button
   - Export hierarchy to CSV
   - Show import button
   - Import hierarchy from CSV
   - Validate CSV format
   - Handle import errors

5. **Hierarchy Integration with Costs**
   - Display hierarchy selector in subscription form
   - Assign subscription to hierarchy node
   - Verify cost allocation
   - Filter costs by hierarchy

6. **Error Handling & Validation**
   - Handle seat limit reached
   - Validate entity ID format
   - Handle duplicate entity IDs
   - Show loading states

7. **Navigation & UX**
   - Navigate between team and hierarchy pages
   - Show breadcrumbs
   - Display help/documentation links
   - Handle empty states gracefully

8. **Performance & Accessibility**
   - Load pages within 5 seconds
   - Proper heading hierarchy
   - Accessible form labels
   - Keyboard navigation support

9. **Multi-System Validation**
   - Verify team members in Supabase
   - Verify hierarchy in BigQuery
   - Check API endpoints
   - Validate data consistency

### Key Features

- **Team Collaboration**: Invite and manage team members
- **Role-Based Access**: Owner, Admin, Collaborator, Read-Only roles
- **3-Level Hierarchy**: Department → Project → Team
- **CSV Support**: Bulk import/export for hierarchy
- **Cost Allocation**: Assign costs to hierarchy nodes
- **Validation**: Prevents deletion of entities with children

### Test Flow Example

```typescript
// Invite team member
await navigateToTeamMembers(page, orgSlug);
await inviteMember(page, 'sarah@example.com', 'collaborator');

// Create hierarchy
await navigateToHierarchy(page, orgSlug);
await createHierarchyEntity(page, 'department', {
  entity_id: 'DEPT-001',
  entity_name: 'Engineering',
});

await createHierarchyEntity(page, 'project', {
  entity_id: 'PROJ-001',
  entity_name: 'Platform',
  parent_id: 'DEPT-001',
});

await createHierarchyEntity(page, 'team', {
  entity_id: 'TEAM-001',
  entity_name: 'Backend',
  parent_id: 'PROJ-001',
});
```

## Helper Functions

All test files include reusable helper functions for common operations:

### Authentication Helpers
- `login(page, email, password)` - Login to application
- `logout(page)` - Logout from application
- `completeSignup(page, data)` - Complete 2-step signup flow
- `fillSignupStep1(page, email, password, firstName, lastName)` - Fill step 1 of signup
- `fillSignupStep2(page, orgName)` - Fill step 2 of signup
- `isAuthenticated(page)` - Check if user is logged in

### Navigation Helpers
- `navigateToDashboard(page, orgSlug)` - Navigate to dashboard
- `navigateToPricingPage(page)` - Navigate to pricing page
- `navigateToDangerZone(page)` - Navigate to Org Settings → Danger Zone
- `navigateToTeamMembers(page, orgSlug)` - Navigate to team members page
- `navigateToHierarchy(page, orgSlug)` - Navigate to hierarchy page
- `skipBillingToDashboard(page)` - Skip billing and go to dashboard

### Team Management Helpers
- `inviteMember(page, email, role)` - Invite team member
- `removeMember(page, email)` - Remove team member
- `updateMemberRole(page, email, newRole)` - Update member role

### Hierarchy Management Helpers
- `createHierarchyEntity(page, type, data)` - Create hierarchy entity
- `deleteHierarchyEntity(page, entityId)` - Delete hierarchy entity
- `editHierarchyEntity(page, entityId, updates)` - Edit hierarchy entity

### Billing Helpers
- `selectPlan(page, planName)` - Select subscription plan
- `fillStripeCheckout(page, cardInfo)` - Fill Stripe checkout form
- `verifySubscriptionActive(page, orgSlug)` - Verify active subscription

### Organization Helpers
- `deleteOrganization(page, orgName)` - Delete organization with confirmation

### Data Generation Helpers
- `generateUserJourneyData()` - Generate test data for user journey
- `generateUniqueEmail()` - Generate unique email for testing

## Test Configuration

Configure test settings in `playwright.config.ts`:

```typescript
export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 2,
  workers: 1, // Run tests sequentially
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
```

## Debugging Tests

### View test reports
```bash
npx playwright show-report
```

### Generate trace files
```bash
npx playwright test --trace on
```

### View trace files
```bash
npx playwright show-trace trace.zip
```

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Cleanup**: Always clean up test data after tests
3. **Waits**: Use `waitForLoadState()` and `waitForURL()` instead of arbitrary timeouts
4. **Assertions**: Use Playwright's built-in assertions (`expect()`)
5. **Selectors**: Prefer role-based selectors over CSS selectors
6. **Screenshots**: Automatically captured on test failure

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright browsers
        run: npx playwright install --with-deps
      - name: Run E2E tests
        run: npx playwright test
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Troubleshooting

### Test Fails: "Cannot find role textbox"
**Solution**: Wait for page to fully load
```typescript
await page.waitForLoadState('networkidle');
```

### Test Fails: "Timeout waiting for URL"
**Solution**: Increase timeout or check if backend is running
```typescript
await page.waitForURL('**/dashboard', { timeout: 15000 });
```

### Browser not launching
**Solution**: Install Playwright browsers
```bash
npx playwright install
```

### Tests passing locally but failing in CI
**Solution**: Use headless mode and ensure all dependencies are installed
```bash
npx playwright test --headed=false
```

## Environment-Specific Configuration

### Local Development
```bash
BASE_URL=http://localhost:3000 npx playwright test
```

### Staging Environment
```bash
BASE_URL=https://cloudact-stage.vercel.app npx playwright test
```

### Production (use with caution!)
```bash
BASE_URL=https://cloudact.ai npx playwright test
```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Tests](https://playwright.dev/docs/debug)
- [CI/CD Integration](https://playwright.dev/docs/ci)
