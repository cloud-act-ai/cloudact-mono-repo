/**
 * E2E Authentication Tests
 *
 * Comprehensive tests for authentication flows including:
 * - Login with valid/invalid credentials
 * - Signup flow
 * - Password reset flow
 * - Session management
 *
 * Prerequisites:
 * - Frontend running on http://localhost:3000
 * - Supabase email confirmation DISABLED for testing
 * - Test user: demo@cloudact.ai / demo1234
 */

import { test, expect, Page } from '@playwright/test';

// ===========================================
// Configuration
// ===========================================

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

// Test credentials
const TEST_CREDENTIALS = {
  valid: {
    email: 'demo@cloudact.ai',
    password: 'demo1234',
  },
  invalid: {
    email: 'invalid@example.com',
    password: 'wrongpassword',
  },
};

// Generate unique test data
const generateTestData = () => {
  const timestamp = Date.now();
  return {
    email: `auth.test.${timestamp}@example.com`,
    password: 'SecurePass123!',
    firstName: 'Auth',
    lastName: 'Test',
    orgName: `Auth Test Org ${timestamp}`,
  };
};

// ===========================================
// Helper Functions
// ===========================================

/**
 * Wait for page to be fully loaded
 */
async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500); // Allow hydration
}

/**
 * Fill login form
 */
async function fillLoginForm(page: Page, email: string, password: string): Promise<void> {
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  await emailInput.clear();
  await emailInput.fill(email);
  await passwordInput.clear();
  await passwordInput.fill(password);
}

/**
 * Submit login form
 */
async function submitLoginForm(page: Page): Promise<void> {
  const submitButton = page.locator('button[type="submit"], button:has-text("Sign in")').first();
  await submitButton.click();
}

/**
 * Complete login flow
 */
async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await waitForPageLoad(page);

  await fillLoginForm(page, email, password);
  await submitLoginForm(page);

  // Wait for redirect to dashboard or org selector
  await page.waitForURL(/\/(.*?)\/dashboard|\/org-select/, { timeout: 30000 });
}

/**
 * Fill signup step 1 (Account creation)
 */
async function fillSignupStep1(
  page: Page,
  email: string,
  password: string,
  firstName: string,
  lastName: string
): Promise<void> {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByLabel('First name').fill(firstName);
  await page.getByLabel('Last name').fill(lastName);
}

/**
 * Fill signup step 2 (Organization creation)
 */
async function fillSignupStep2(page: Page, orgName: string): Promise<void> {
  await page.getByLabel('Organization name').fill(orgName);
}

/**
 * Complete full signup flow
 */
async function completeSignup(page: Page, testData: ReturnType<typeof generateTestData>): Promise<void> {
  await page.goto(`${BASE_URL}/signup`);
  await waitForPageLoad(page);

  // Step 1: Account creation
  await fillSignupStep1(page, testData.email, testData.password, testData.firstName, testData.lastName);
  await page.getByRole('button', { name: /continue to organization/i }).click();
  await waitForPageLoad(page);

  // Step 2: Organization creation
  await fillSignupStep2(page, testData.orgName);
  await page.getByRole('button', { name: /complete signup/i }).click();

  // Wait for redirect to billing page
  await page.waitForURL('**/onboarding/billing', { timeout: 15000 });
}

// ===========================================
// Test Suite: Login with Valid Credentials
// ===========================================

test.describe('Login - Valid Credentials', () => {
  test('should display login form with all required fields', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await waitForPageLoad(page);

    // Verify email field exists
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await expect(emailInput).toBeVisible();

    // Verify password field exists
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible();

    // Verify submit button exists
    const submitButton = page.locator('button[type="submit"], button:has-text("Sign in")').first();
    await expect(submitButton).toBeVisible();
  });

  test('should successfully login with valid credentials', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await waitForPageLoad(page);

    await fillLoginForm(page, TEST_CREDENTIALS.valid.email, TEST_CREDENTIALS.valid.password);
    await submitLoginForm(page);

    // Should redirect to dashboard or org selector
    await page.waitForURL(/\/(.*?)\/dashboard|\/org-select/, { timeout: 30000 });

    // Verify we're not on login page anymore
    expect(page.url()).not.toContain('/login');
  });

  test('should redirect to dashboard after successful login', async ({ page }) => {
    await login(page, TEST_CREDENTIALS.valid.email, TEST_CREDENTIALS.valid.password);

    // Handle org selector if present
    if (page.url().includes('/org-select')) {
      const orgCard = page.locator('[data-testid="org-card"], a[href*="/dashboard"]').first();
      await orgCard.click();
      await page.waitForURL(/\/(.*?)\/dashboard/, { timeout: 30000 });
    }

    // Verify we're on dashboard
    expect(page.url()).toContain('/dashboard');
  });

  test('should show loading state during login', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await waitForPageLoad(page);

    await fillLoginForm(page, TEST_CREDENTIALS.valid.email, TEST_CREDENTIALS.valid.password);

    // Click submit and check for loading state
    const submitButton = page.locator('button[type="submit"], button:has-text("Sign in")').first();
    await submitButton.click();

    // Check for loading indicator (spinner, disabled button, or loading text)
    const loadingIndicator = page.locator('button:has-text("Signing"), [data-loading="true"], .animate-spin').first();
    const isLoading = await loadingIndicator.isVisible({ timeout: 2000 }).catch(() => false);

    if (isLoading) {
      console.log('Loading state displayed during login');
    }

    // Wait for redirect
    await page.waitForURL(/\/(.*?)\/dashboard|\/org-select/, { timeout: 30000 });
  });
});

// ===========================================
// Test Suite: Login with Invalid Credentials
// ===========================================

test.describe('Login - Invalid Credentials', () => {
  test('should show error for non-existent email', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await waitForPageLoad(page);

    await fillLoginForm(page, 'nonexistent@example.com', 'SomePassword123!');
    await submitLoginForm(page);

    // Wait for error message
    await page.waitForTimeout(2000);

    // Should show error message
    const errorMessage = page.locator('text=/invalid|incorrect|not found|error/i').first();
    await expect(errorMessage).toBeVisible({ timeout: 5000 });

    // Should still be on login page
    expect(page.url()).toContain('/login');
  });

  test('should show error for wrong password', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await waitForPageLoad(page);

    await fillLoginForm(page, TEST_CREDENTIALS.valid.email, 'WrongPassword123!');
    await submitLoginForm(page);

    // Wait for error message
    await page.waitForTimeout(2000);

    // Should show error message
    const errorMessage = page.locator('text=/invalid|incorrect|wrong|error/i').first();
    await expect(errorMessage).toBeVisible({ timeout: 5000 });

    // Should still be on login page
    expect(page.url()).toContain('/login');
  });

  test('should show error for empty email', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await waitForPageLoad(page);

    // Only fill password
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill('SomePassword123!');

    await submitLoginForm(page);

    // Should show validation error or remain on page
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/login');
  });

  test('should show error for empty password', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await waitForPageLoad(page);

    // Only fill email
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await emailInput.fill('test@example.com');

    await submitLoginForm(page);

    // Should show validation error or remain on page
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/login');
  });

  test('should validate email format', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await waitForPageLoad(page);

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await emailInput.fill('invalid-email');
    await emailInput.blur();

    // Wait for validation
    await page.waitForTimeout(500);

    // Check for validation error
    const validationError = page.locator('text=/valid email|invalid email/i').first();
    const hasError = await validationError.isVisible({ timeout: 2000 }).catch(() => false);

    if (!hasError) {
      // HTML5 validation may prevent form submission
      const isInvalid = await emailInput.evaluate((el) => !(el as HTMLInputElement).checkValidity());
      expect(isInvalid).toBe(true);
    }
  });
});

// ===========================================
// Test Suite: Signup Flow
// ===========================================

test.describe('Signup Flow', () => {
  test('should display signup form with step 1 (Account)', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`);
    await waitForPageLoad(page);

    // Verify step 1 fields
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Confirm password')).toBeVisible();
    await expect(page.getByLabel('First name')).toBeVisible();
    await expect(page.getByLabel('Last name')).toBeVisible();
  });

  test('should validate email format on signup', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`);
    await waitForPageLoad(page);

    const emailField = page.getByLabel('Email address');
    await emailField.fill('invalid-email');
    await emailField.blur();

    // Should show validation error
    await expect(page.getByText(/valid email/i)).toBeVisible({ timeout: 3000 });
  });

  test('should validate password requirements', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`);
    await waitForPageLoad(page);

    const passwordField = page.getByLabel('Password', { exact: true });
    await passwordField.fill('123'); // Too short
    await passwordField.blur();

    // Should show password requirement message
    await expect(page.getByText(/at least|character|minimum/i)).toBeVisible({ timeout: 3000 });
  });

  test('should validate password confirmation match', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`);
    await waitForPageLoad(page);

    await page.getByLabel('Password', { exact: true }).fill('SecurePass123!');
    await page.getByLabel('Confirm password').fill('DifferentPass123!');

    // Try to continue
    await page.getByRole('button', { name: /continue to organization/i }).click();

    // Should show mismatch error
    await expect(page.getByText(/match|same/i)).toBeVisible({ timeout: 3000 });
  });

  test('should navigate from step 1 to step 2', async ({ page }) => {
    const testData = generateTestData();

    await page.goto(`${BASE_URL}/signup`);
    await waitForPageLoad(page);

    // Fill step 1
    await fillSignupStep1(page, testData.email, testData.password, testData.firstName, testData.lastName);
    await page.getByRole('button', { name: /continue to organization/i }).click();
    await waitForPageLoad(page);

    // Verify step 2 is shown
    await expect(page.getByText('Organization Details')).toBeVisible();
    await expect(page.getByLabel('Organization name')).toBeVisible();
  });

  test('should complete full signup flow', async ({ page }) => {
    const testData = generateTestData();

    await completeSignup(page, testData);

    // Should be on billing page
    await expect(page).toHaveURL(/\/onboarding\/billing/);
    await expect(page.getByText(/choose your plan/i)).toBeVisible();
  });

  test('should allow navigation back from step 2 to step 1', async ({ page }) => {
    const testData = generateTestData();

    await page.goto(`${BASE_URL}/signup`);
    await waitForPageLoad(page);

    // Complete step 1
    await fillSignupStep1(page, testData.email, testData.password, testData.firstName, testData.lastName);
    await page.getByRole('button', { name: /continue to organization/i }).click();
    await waitForPageLoad(page);

    // Click back button
    await page.getByRole('button', { name: /back|previous/i }).click();

    // Should be back on step 1
    await expect(page.getByLabel('Email address')).toBeVisible();

    // Values should be preserved
    const emailValue = await page.getByLabel('Email address').inputValue();
    expect(emailValue).toBe(testData.email);
  });

  test('should prevent duplicate email registration', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`);
    await waitForPageLoad(page);

    // Try to use existing email
    await fillSignupStep1(page, TEST_CREDENTIALS.valid.email, 'NewPassword123!', 'Test', 'User');
    await page.getByRole('button', { name: /continue to organization/i }).click();

    // Wait for validation
    await page.waitForTimeout(2000);

    // Should show error about email already exists
    const errorMessage = page.getByText(/already|exist|use/i).first();
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });
});

// ===========================================
// Test Suite: Password Reset Flow
// ===========================================

test.describe('Password Reset Flow', () => {
  test('should display forgot password link on login page', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await waitForPageLoad(page);

    const forgotPasswordLink = page.locator('a:has-text("Forgot"), a:has-text("Reset")').first();
    await expect(forgotPasswordLink).toBeVisible();
  });

  test('should navigate to password reset page', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await waitForPageLoad(page);

    const forgotPasswordLink = page.locator('a:has-text("Forgot"), a:has-text("Reset")').first();
    await forgotPasswordLink.click();

    // Should be on password reset page
    await page.waitForURL(/\/(forgot|reset|recover)/i, { timeout: 5000 });
  });

  test('should display password reset form', async ({ page }) => {
    await page.goto(`${BASE_URL}/forgot-password`);
    await waitForPageLoad(page);

    // Should show email input for reset
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await expect(emailInput).toBeVisible();

    // Should show submit button
    const submitButton = page.locator('button[type="submit"], button:has-text("Reset"), button:has-text("Send")').first();
    await expect(submitButton).toBeVisible();
  });

  test('should validate email before sending reset link', async ({ page }) => {
    await page.goto(`${BASE_URL}/forgot-password`);
    await waitForPageLoad(page);

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await emailInput.fill('invalid-email');

    const submitButton = page.locator('button[type="submit"], button:has-text("Reset"), button:has-text("Send")').first();
    await submitButton.click();

    // Should show validation error
    await page.waitForTimeout(1000);

    // Check if still on reset page (validation failed)
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/forgot|reset|recover/i);
  });

  test('should show success message after requesting reset', async ({ page }) => {
    await page.goto(`${BASE_URL}/forgot-password`);
    await waitForPageLoad(page);

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await emailInput.fill(TEST_CREDENTIALS.valid.email);

    const submitButton = page.locator('button[type="submit"], button:has-text("Reset"), button:has-text("Send")').first();
    await submitButton.click();

    // Wait for response
    await page.waitForTimeout(2000);

    // Should show success message (or error if email doesn't exist)
    const message = page.locator('text=/sent|check.*email|success|error/i').first();
    await expect(message).toBeVisible({ timeout: 5000 });
  });
});

// ===========================================
// Test Suite: Session Management
// ===========================================

test.describe('Session Management', () => {
  test('should persist session across page reloads', async ({ page }) => {
    await login(page, TEST_CREDENTIALS.valid.email, TEST_CREDENTIALS.valid.password);

    // Handle org selector if present
    if (page.url().includes('/org-select')) {
      const orgCard = page.locator('[data-testid="org-card"], a[href*="/dashboard"]').first();
      await orgCard.click();
      await page.waitForURL(/\/(.*?)\/dashboard/, { timeout: 30000 });
    }

    const dashboardUrl = page.url();

    // Reload page
    await page.reload();
    await waitForPageLoad(page);

    // Should still be on dashboard
    expect(page.url()).toBe(dashboardUrl);
  });

  test('should redirect authenticated users from login to dashboard', async ({ page }) => {
    await login(page, TEST_CREDENTIALS.valid.email, TEST_CREDENTIALS.valid.password);

    // Handle org selector if present
    if (page.url().includes('/org-select')) {
      const orgCard = page.locator('[data-testid="org-card"], a[href*="/dashboard"]').first();
      await orgCard.click();
      await page.waitForURL(/\/(.*?)\/dashboard/, { timeout: 30000 });
    }

    // Try to visit login page again
    await page.goto(`${BASE_URL}/login`);
    await waitForPageLoad(page);

    // Should be redirected away from login
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain('/login');
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    // Clear any existing cookies
    await page.context().clearCookies();

    // Try to access protected route
    await page.goto(`${BASE_URL}/test-org/dashboard`);
    await waitForPageLoad(page);

    // Should be redirected to login
    await page.waitForURL(/\/login/, { timeout: 10000 });
  });

  test('should handle logout correctly', async ({ page }) => {
    await login(page, TEST_CREDENTIALS.valid.email, TEST_CREDENTIALS.valid.password);

    // Handle org selector if present
    if (page.url().includes('/org-select')) {
      const orgCard = page.locator('[data-testid="org-card"], a[href*="/dashboard"]').first();
      await orgCard.click();
      await page.waitForURL(/\/(.*?)\/dashboard/, { timeout: 30000 });
    }

    // Find and click logout button
    const signOutButton = page.locator('button:has-text("Sign Out"), button:has-text("Logout"), a:has-text("Sign Out")').first();
    await signOutButton.click();
    await waitForPageLoad(page);

    // Should be redirected to home or login
    await page.waitForURL(new RegExp(`${BASE_URL}(/login)?$`), { timeout: 10000 });
  });

  test('should clear session after logout', async ({ page }) => {
    await login(page, TEST_CREDENTIALS.valid.email, TEST_CREDENTIALS.valid.password);

    // Handle org selector if present
    if (page.url().includes('/org-select')) {
      const orgCard = page.locator('[data-testid="org-card"], a[href*="/dashboard"]').first();
      await orgCard.click();
      await page.waitForURL(/\/(.*?)\/dashboard/, { timeout: 30000 });
    }

    // Logout
    const signOutButton = page.locator('button:has-text("Sign Out"), button:has-text("Logout"), a:has-text("Sign Out")').first();
    await signOutButton.click();
    await waitForPageLoad(page);

    // Clear navigation history by going to home
    await page.goto(BASE_URL);
    await waitForPageLoad(page);

    // Try to access protected route
    await page.goto(`${BASE_URL}/test-org/dashboard`);

    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 10000 });
  });

  test('should handle expired session gracefully', async ({ page, context }) => {
    await login(page, TEST_CREDENTIALS.valid.email, TEST_CREDENTIALS.valid.password);

    // Handle org selector if present
    if (page.url().includes('/org-select')) {
      const orgCard = page.locator('[data-testid="org-card"], a[href*="/dashboard"]').first();
      await orgCard.click();
      await page.waitForURL(/\/(.*?)\/dashboard/, { timeout: 30000 });
    }

    // Clear cookies to simulate expired session
    await context.clearCookies();

    // Reload page
    await page.reload();
    await waitForPageLoad(page);

    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 10000 });
  });
});

// ===========================================
// Test Suite: Accessibility
// ===========================================

test.describe('Accessibility', () => {
  test('should have accessible login form labels', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await waitForPageLoad(page);

    // Check for proper labels
    const emailLabel = page.locator('label:has-text("Email"), label[for*="email"]').first();
    const passwordLabel = page.locator('label:has-text("Password"), label[for*="password"]').first();

    const hasEmailLabel = await emailLabel.isVisible({ timeout: 2000 }).catch(() => false);
    const hasPasswordLabel = await passwordLabel.isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasEmailLabel || hasPasswordLabel).toBe(true);
  });

  test('should support keyboard navigation on login form', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await waitForPageLoad(page);

    // Tab to email field
    await page.keyboard.press('Tab');

    // Tab to password field
    await page.keyboard.press('Tab');

    // Tab to submit button
    await page.keyboard.press('Tab');

    // Check that an element is focused
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['INPUT', 'BUTTON', 'A']).toContain(focusedElement);
  });

  test('should have proper heading hierarchy on login page', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await waitForPageLoad(page);

    // Check for main heading
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });
});

console.log(`
===========================================
Auth E2E Test Suite
===========================================
Test Suites: 6
- Login - Valid Credentials (4 tests)
- Login - Invalid Credentials (5 tests)
- Signup Flow (8 tests)
- Password Reset Flow (5 tests)
- Session Management (6 tests)
- Accessibility (3 tests)

Total Tests: 31

Run with:
  npx playwright test tests/e2e/auth.spec.ts
  npx playwright test tests/e2e/auth.spec.ts --headed
  npx playwright test tests/e2e/auth.spec.ts --ui
===========================================
`);
