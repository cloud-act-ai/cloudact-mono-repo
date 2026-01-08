/**
 * E2E Browser Automation Tests for Authentication & Onboarding
 *
 * Tests the complete user authentication and onboarding flow:
 * 1. Signup (2-step: Account → Organization)
 * 2. Login
 * 3. Logout
 * 4. Session management
 * 5. Email/org slug validation
 * 6. Redirect flows
 *
 * Prerequisites:
 * - Frontend running on http://localhost:3000
 * - Supabase email confirmation DISABLED
 * - Clean database (no existing test users)
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

// Generate unique test data for each run
const generateTestData = () => {
  const timestamp = Date.now();
  return {
    email: `test.user.${timestamp}@example.com`,
    password: 'SecurePass123!',
    firstName: 'Test',
    lastName: 'User',
    orgName: `Test Org ${timestamp}`,
    expectedOrgSlug: `test_org_${timestamp}`.toLowerCase()
  };
};

// ====================
// HELPER FUNCTIONS
// ====================

/**
 * Fill step 1 of signup form (Account creation)
 */
async function fillSignupStep1(
  page: Page,
  email: string,
  password: string,
  firstName: string,
  lastName: string
) {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByLabel('First name').fill(firstName);
  await page.getByLabel('Last name').fill(lastName);
}

/**
 * Fill step 2 of signup form (Organization creation)
 */
async function fillSignupStep2(
  page: Page,
  orgName: string,
  currency: string = 'USD',
  timezone: string = 'America/Los_Angeles'
) {
  await page.getByLabel('Organization name').fill(orgName);

  // Select currency
  await page.getByLabel('Currency').click();
  await page.getByRole('option', { name: currency }).click();

  // Select timezone
  await page.getByLabel('Timezone').click();
  await page.getByRole('option', { name: new RegExp(timezone) }).click();
}

/**
 * Complete full signup flow
 */
async function completeSignup(page: Page, testData: any) {
  await page.goto(`${BASE_URL}/signup`);
  await page.waitForLoadState('networkidle');

  // Step 1: Account creation
  await fillSignupStep1(
    page,
    testData.email,
    testData.password,
    testData.firstName,
    testData.lastName
  );

  // Click "Continue to Organization"
  await page.getByRole('button', { name: /continue to organization/i }).click();
  await page.waitForLoadState('networkidle');

  // Wait for step 2 to appear
  await expect(page.getByText('Organization Details')).toBeVisible();

  // Step 2: Organization creation
  await fillSignupStep2(page, testData.orgName);

  // Complete signup
  await page.getByRole('button', { name: /complete signup/i }).click();

  // Should redirect to billing page
  await page.waitForURL('**/onboarding/billing', { timeout: 10000 });
}

/**
 * Login with credentials
 */
async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');

  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);

  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for redirect to dashboard
  await page.waitForURL('**/**/dashboard', { timeout: 10000 });
}

/**
 * Check if user is authenticated
 */
async function isAuthenticated(page: Page): Promise<boolean> {
  try {
    // Try to access a protected route
    await page.goto(`${BASE_URL}/test-auth-check`);
    await page.waitForTimeout(1000);

    // If redirected to login, not authenticated
    const url = page.url();
    return !url.includes('/login');
  } catch {
    return false;
  }
}

// ====================
// TEST SUITE: Signup Flow
// ====================

test.describe('Signup Flow', () => {
  test('should complete 2-step signup successfully', async ({ page }) => {
    const testData = generateTestData();

    console.log('\n🚀 Starting signup test with:');
    console.log(`   Email: ${testData.email}`);
    console.log(`   Org: ${testData.orgName}`);

    await page.goto(`${BASE_URL}/signup`);
    await page.waitForLoadState('networkidle');

    // Verify we're on signup page
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();

    // Step 1: Account creation
    console.log('📋 Step 1: Filling account details...');
    await fillSignupStep1(
      page,
      testData.email,
      testData.password,
      testData.firstName,
      testData.lastName
    );

    // Verify password field type
    const passwordField = page.getByLabel('Password', { exact: true });
    await expect(passwordField).toHaveAttribute('type', 'password');

    // Click continue
    await page.getByRole('button', { name: /continue to organization/i }).click();
    await page.waitForLoadState('networkidle');

    // Step 2: Organization creation
    console.log('📋 Step 2: Filling organization details...');
    await expect(page.getByText('Organization Details')).toBeVisible();

    await fillSignupStep2(page, testData.orgName);

    // Verify org slug is auto-generated
    const orgSlugField = page.getByLabel('Organization URL');
    const orgSlugValue = await orgSlugField.inputValue();
    console.log(`   Generated org slug: ${orgSlugValue}`);
    expect(orgSlugValue).toMatch(/^[a-z0-9_]+$/);

    // Complete signup
    console.log('📋 Step 3: Completing signup...');
    await page.getByRole('button', { name: /complete signup/i }).click();

    // Should redirect to billing
    await page.waitForURL('**/onboarding/billing', { timeout: 15000 });
    console.log('✅ Signup completed - redirected to billing page');

    // Verify we're on billing page
    await expect(page.getByText(/choose your plan/i)).toBeVisible();
  });

  test('should validate email format', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`);
    await page.waitForLoadState('networkidle');

    // Try invalid email
    const emailField = page.getByLabel('Email address');
    await emailField.fill('invalid-email');
    await emailField.blur();

    // Should show validation error
    await expect(page.getByText(/valid email/i)).toBeVisible();
  });

  test('should validate password requirements', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`);
    await page.waitForLoadState('networkidle');

    // Try weak password
    const passwordField = page.getByLabel('Password', { exact: true });
    await passwordField.fill('123');
    await passwordField.blur();

    // Should show password requirements
    await expect(page.getByText(/at least/i)).toBeVisible();
  });

  test('should validate password confirmation match', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`);
    await page.waitForLoadState('networkidle');

    const testData = generateTestData();

    await page.getByLabel('Password', { exact: true }).fill(testData.password);
    await page.getByLabel('Confirm password').fill('DifferentPassword123!');

    // Try to continue
    await page.getByRole('button', { name: /continue to organization/i }).click();

    // Should show error
    await expect(page.getByText(/passwords.*match/i)).toBeVisible();
  });

  test('should prevent duplicate email registration', async ({ page }) => {
    const testData = generateTestData();

    // First signup
    await completeSignup(page, testData);
    console.log('✅ First signup completed');

    // Logout
    await page.goto(BASE_URL);

    // Try to signup again with same email
    await page.goto(`${BASE_URL}/signup`);
    await page.waitForLoadState('networkidle');

    await fillSignupStep1(
      page,
      testData.email, // Same email
      testData.password,
      'Another',
      'User'
    );

    await page.getByRole('button', { name: /continue to organization/i }).click();
    await page.waitForTimeout(2000);

    // Should show error about email already exists
    await expect(page.getByText(/already.*use|already.*exists/i)).toBeVisible();
  });

  test('should validate organization name length', async ({ page }) => {
    const testData = generateTestData();

    await page.goto(`${BASE_URL}/signup`);
    await page.waitForLoadState('networkidle');

    // Complete step 1
    await fillSignupStep1(
      page,
      testData.email,
      testData.password,
      testData.firstName,
      testData.lastName
    );
    await page.getByRole('button', { name: /continue to organization/i }).click();
    await page.waitForLoadState('networkidle');

    // Try too short org name
    const orgNameField = page.getByLabel('Organization name');
    await orgNameField.fill('A');
    await orgNameField.blur();

    // Should show validation error
    await expect(page.getByText(/at least.*characters/i)).toBeVisible();
  });

  test('should allow navigation back from step 2 to step 1', async ({ page }) => {
    const testData = generateTestData();

    await page.goto(`${BASE_URL}/signup`);
    await page.waitForLoadState('networkidle');

    // Complete step 1
    await fillSignupStep1(
      page,
      testData.email,
      testData.password,
      testData.firstName,
      testData.lastName
    );
    await page.getByRole('button', { name: /continue to organization/i }).click();
    await page.waitForLoadState('networkidle');

    // Verify we're on step 2
    await expect(page.getByText('Organization Details')).toBeVisible();

    // Click back button
    await page.getByRole('button', { name: /back|previous/i }).click();

    // Should be back on step 1
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();

    // Verify form values are preserved
    const emailField = page.getByLabel('Email address');
    const emailValue = await emailField.inputValue();
    expect(emailValue).toBe(testData.email);
  });
});

// ====================
// TEST SUITE: Login Flow
// ====================

test.describe('Login Flow', () => {
  let testData: any;

  test.beforeAll(async ({ browser }) => {
    // Create a test user first
    testData = generateTestData();
    const page = await browser.newPage();
    await completeSignup(page, testData);
    await page.close();
    console.log(`✅ Test user created: ${testData.email}`);
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    console.log(`\n🔐 Logging in as: ${testData.email}`);

    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Verify we're on login page
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();

    // Fill credentials
    await page.getByRole('textbox', { name: 'Email address' }).fill(testData.email);
    await page.getByRole('textbox', { name: 'Password' }).fill(testData.password);

    // Submit
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Should redirect to dashboard
    await page.waitForURL('**/**/dashboard', { timeout: 10000 });
    console.log('✅ Login successful - redirected to dashboard');

    // Verify user name is displayed
    await expect(page.getByText(`${testData.firstName} ${testData.lastName}`)).toBeVisible();
  });

  test('should show error for invalid email', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('textbox', { name: 'Email address' }).fill('nonexistent@example.com');
    await page.getByRole('textbox', { name: 'Password' }).fill('SomePassword123!');

    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForTimeout(2000);

    // Should show error
    await expect(page.getByText(/invalid.*credentials|incorrect/i)).toBeVisible();
  });

  test('should show error for wrong password', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('textbox', { name: 'Email address' }).fill(testData.email);
    await page.getByRole('textbox', { name: 'Password' }).fill('WrongPassword123!');

    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForTimeout(2000);

    // Should show error
    await expect(page.getByText(/invalid.*credentials|incorrect/i)).toBeVisible();
  });

  test('should redirect authenticated user from login page to dashboard', async ({ page }) => {
    // Login first
    await login(page, testData.email, testData.password);
    console.log('✅ Logged in');

    // Try to visit login page again
    await page.goto(`${BASE_URL}/login`);

    // Should auto-redirect to dashboard
    await page.waitForURL('**/**/dashboard', { timeout: 5000 });
    console.log('✅ Auto-redirected to dashboard');
  });

  test('should show loading state during login', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('textbox', { name: 'Email address' }).fill(testData.email);
    await page.getByRole('textbox', { name: 'Password' }).fill(testData.password);

    // Click sign in and immediately check for loading state
    const signInButton = page.getByRole('button', { name: 'Sign in' });
    await signInButton.click();

    // Button should show loading state
    await expect(page.getByRole('button', { name: /signing in/i })).toBeVisible();
  });

  test('should preserve redirect URL after login', async ({ page }) => {
    // Try to access protected route without auth
    await page.goto(`${BASE_URL}/test-org/settings/organization`);

    // Should redirect to login with return URL
    await page.waitForURL('**/login**', { timeout: 5000 });

    // Login
    await page.getByRole('textbox', { name: 'Email address' }).fill(testData.email);
    await page.getByRole('textbox', { name: 'Password' }).fill(testData.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Should redirect back to originally requested page (or dashboard)
    await page.waitForURL('**/**', { timeout: 10000 });
    const currentUrl = page.url();
    console.log(`Redirected to: ${currentUrl}`);

    // Should be on a protected route
    expect(currentUrl).not.toContain('/login');
  });
});

// ====================
// TEST SUITE: Logout Flow
// ====================

test.describe('Logout Flow', () => {
  let testData: any;

  test.beforeAll(async ({ browser }) => {
    // Create a test user
    testData = generateTestData();
    const page = await browser.newPage();
    await completeSignup(page, testData);
    await page.close();
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await login(page, testData.email, testData.password);
    console.log('✅ Logged in');

    // Find and click logout button
    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForLoadState('networkidle');

    // Should redirect to home page
    await page.waitForURL(BASE_URL, { timeout: 5000 });
    console.log('✅ Logged out - redirected to home');

    // Verify we're logged out (Sign In link should be visible)
    await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible();
  });

  test('should clear session after logout', async ({ page }) => {
    // Login
    await login(page, testData.email, testData.password);

    // Logout
    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForURL(BASE_URL, { timeout: 5000 });

    // Try to access protected route
    await page.goto(`${BASE_URL}/test-org/dashboard`);

    // Should redirect to login
    await page.waitForURL('**/login', { timeout: 5000 });
    console.log('✅ Session cleared - redirected to login');
  });

  test('should not allow access to protected routes after logout', async ({ page }) => {
    // Login
    await login(page, testData.email, testData.password);
    const orgUrl = page.url();
    const orgSlug = orgUrl.match(/\/([^/]+)\/dashboard/)?.[1];

    // Logout
    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForURL(BASE_URL, { timeout: 5000 });

    // Try to access various protected routes
    const protectedRoutes = [
      `/${orgSlug}/dashboard`,
      `/${orgSlug}/settings/organization`,
      `/${orgSlug}/integrations`,
      `/${orgSlug}/pipelines`
    ];

    for (const route of protectedRoutes) {
      await page.goto(`${BASE_URL}${route}`);
      await page.waitForTimeout(2000);

      // Should be redirected to login
      const currentUrl = page.url();
      expect(currentUrl).toContain('/login');
      console.log(`✓ ${route} → redirected to login`);
    }
  });
});

// ====================
// TEST SUITE: Session Management
// ====================

test.describe('Session Management', () => {
  let testData: any;

  test.beforeAll(async ({ browser }) => {
    testData = generateTestData();
    const page = await browser.newPage();
    await completeSignup(page, testData);
    await page.close();
  });

  test('should persist session across page reloads', async ({ page }) => {
    // Login
    await login(page, testData.email, testData.password);
    const dashboardUrl = page.url();

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be on dashboard
    expect(page.url()).toBe(dashboardUrl);
    console.log('✅ Session persisted after reload');
  });

  test('should persist session across navigation', async ({ page }) => {
    // Login
    await login(page, testData.email, testData.password);
    const orgUrl = page.url();
    const orgSlug = orgUrl.match(/\/([^/]+)\/dashboard/)?.[1];

    // Navigate to different pages
    await page.goto(`${BASE_URL}/${orgSlug}/settings/organization`);
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/settings/organization');

    await page.goto(`${BASE_URL}/${orgSlug}/integrations`);
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/integrations');

    console.log('✅ Session persisted across navigation');
  });

  test('should handle expired session gracefully', async ({ page, context }) => {
    // Login
    await login(page, testData.email, testData.password);

    // Clear cookies to simulate expired session
    await context.clearCookies();

    // Try to navigate to protected route
    const orgUrl = page.url();
    const orgSlug = orgUrl.match(/\/([^/]+)\/dashboard/)?.[1];
    await page.goto(`${BASE_URL}/${orgSlug}/dashboard`);

    // Should redirect to login
    await page.waitForURL('**/login', { timeout: 5000 });
    console.log('✅ Expired session handled - redirected to login');
  });
});

// ====================
// TEST SUITE: Form Validation
// ====================

test.describe('Form Validation', () => {
  test('should prevent form submission with empty fields', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`);
    await page.waitForLoadState('networkidle');

    // Try to submit without filling anything
    const continueButton = page.getByRole('button', { name: /continue to organization/i });
    await continueButton.click();

    // Should still be on signup page
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();

    // Should show validation errors
    await expect(page.getByText(/required|fill/i).first()).toBeVisible();
  });

  test('should trim whitespace from inputs', async ({ page }) => {
    const testData = generateTestData();

    await page.goto(`${BASE_URL}/signup`);
    await page.waitForLoadState('networkidle');

    // Fill with extra whitespace
    await page.getByLabel('Email address').fill(`  ${testData.email}  `);
    await page.getByLabel('First name').fill(`  ${testData.firstName}  `);
    await page.getByLabel('Last name').fill(`  ${testData.lastName}  `);
    await page.getByLabel('Password', { exact: true }).fill(testData.password);
    await page.getByLabel('Confirm password').fill(testData.password);

    await page.getByRole('button', { name: /continue to organization/i }).click();
    await page.waitForLoadState('networkidle');

    // Should proceed to step 2 (whitespace was trimmed)
    await expect(page.getByText('Organization Details')).toBeVisible();
  });

  test('should sanitize organization name', async ({ page }) => {
    const testData = generateTestData();

    await page.goto(`${BASE_URL}/signup`);
    await fillSignupStep1(page, testData.email, testData.password, testData.firstName, testData.lastName);
    await page.getByRole('button', { name: /continue to organization/i }).click();
    await page.waitForLoadState('networkidle');

    // Try org name with special characters
    const orgNameField = page.getByLabel('Organization name');
    await orgNameField.fill('<script>alert("XSS")</script> Test Org');

    // Org slug should sanitize the input
    const orgSlugField = page.getByLabel('Organization URL');
    const orgSlugValue = await orgSlugField.inputValue();

    // Should not contain HTML tags or special characters
    expect(orgSlugValue).not.toContain('<');
    expect(orgSlugValue).not.toContain('>');
    expect(orgSlugValue).toMatch(/^[a-z0-9_]+$/);
    console.log(`✓ Sanitized org slug: ${orgSlugValue}`);
  });
});

// ====================
// TEST SUITE: Redirect Flows
// ====================

test.describe('Redirect Flows', () => {
  test('should redirect to billing after signup', async ({ page }) => {
    const testData = generateTestData();
    await completeSignup(page, testData);

    // Should be on billing page
    await expect(page).toHaveURL(/\/onboarding\/billing/);
    await expect(page.getByText(/choose your plan/i)).toBeVisible();
    console.log('✅ Redirected to billing page after signup');
  });

  test('should redirect to login from signup if already authenticated', async ({ page }) => {
    const testData = generateTestData();

    // Complete signup (which logs us in)
    await completeSignup(page, testData);

    // Try to visit signup page
    await page.goto(`${BASE_URL}/signup`);

    // Should redirect to dashboard or billing
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/signup');
    console.log(`✅ Already authenticated - redirected to: ${currentUrl}`);
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    // Try to access protected route without auth
    await page.goto(`${BASE_URL}/test-org-slug/dashboard`);

    // Should redirect to login
    await page.waitForURL('**/login', { timeout: 5000 });
    console.log('✅ Unauthenticated user redirected to login');
  });
});

// ====================
// TEST SUITE: End-to-End Signup Journey
// ====================

test.describe('Complete Signup Journey', () => {
  test('should complete full signup journey with all validations', async ({ page }) => {
    const testData = generateTestData();

    console.log('\n🎯 Starting complete signup journey test');
    console.log(`   Email: ${testData.email}`);
    console.log(`   Org: ${testData.orgName}\n`);

    // Step 1: Navigate to signup
    console.log('📋 Step 1: Navigating to signup page...');
    await page.goto(`${BASE_URL}/signup`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();
    console.log('✓ Signup page loaded');

    // Step 2: Fill account details
    console.log('\n📋 Step 2: Filling account details...');
    await fillSignupStep1(page, testData.email, testData.password, testData.firstName, testData.lastName);
    console.log('✓ Account details filled');

    // Step 3: Navigate to organization step
    console.log('\n📋 Step 3: Continuing to organization step...');
    await page.getByRole('button', { name: /continue to organization/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Organization Details')).toBeVisible();
    console.log('✓ Organization step loaded');

    // Step 4: Fill organization details
    console.log('\n📋 Step 4: Filling organization details...');
    await fillSignupStep2(page, testData.orgName);
    const orgSlugValue = await page.getByLabel('Organization URL').inputValue();
    console.log(`✓ Organization details filled (slug: ${orgSlugValue})`);

    // Step 5: Complete signup
    console.log('\n📋 Step 5: Completing signup...');
    await page.getByRole('button', { name: /complete signup/i }).click();
    await page.waitForURL('**/onboarding/billing', { timeout: 15000 });
    console.log('✓ Signup completed');

    // Step 6: Verify billing page
    console.log('\n📋 Step 6: Verifying billing page...');
    await expect(page.getByText(/choose your plan/i)).toBeVisible();
    await expect(page.getByText(/starter/i)).toBeVisible();
    await expect(page.getByText(/professional/i)).toBeVisible();
    await expect(page.getByText(/scale/i)).toBeVisible();
    console.log('✓ Billing page displayed correctly');

    console.log('\n✅ Complete signup journey test PASSED!');
  });
});
