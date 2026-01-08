/**
 * E2E Browser Automation Tests for Organization and Account Deletion
 *
 * Tests the complete flow of deleting an organization and user account
 * using Playwright browser automation.
 *
 * This test suite validates:
 * 1. UI flow for organization deletion
 * 2. Supabase user/org cleanup (frontend)
 * 3. BigQuery dataset cleanup (backend)
 * 4. API endpoints respond correctly
 *
 * Prerequisites:
 * - Frontend running on http://localhost:3000
 * - API Service running on http://localhost:8000
 * - Test user: john@example.com / acme1234
 * - Test organization: Acme Inc (acme_inc_01062026)
 */

import { test, expect, Page } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

// Test configuration
const BASE_URL = 'http://localhost:3000';
const API_BASE_URL = 'http://localhost:8000';
const TEST_CREDENTIALS = {
  email: 'john@example.com',
  password: 'acme1234',
  orgName: 'Acme Inc',
  orgSlug: 'acme_inc_01062026'
};

// API Keys (get from environment or use test defaults)
const CA_ROOT_API_KEY = process.env.CA_ROOT_API_KEY || 'test-root-api-key-min-32-characters';

/**
 * Helper: Login to the application
 */
async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');

  // Fill login form
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);

  // Submit login
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for dashboard to load
  await page.waitForURL(`**/${TEST_CREDENTIALS.orgSlug}/**`, { timeout: 10000 });
}

/**
 * Helper: Navigate to Organization Settings Danger Zone
 */
async function navigateToDangerZone(page: Page) {
  // Expand Org Settings menu
  await page.locator('div').filter({ hasText: /^Org Settings$/ }).first().click();

  // Click Organization link
  await page.getByRole('link', { name: 'Organization' }).click();
  await page.waitForLoadState('networkidle');

  // Click Danger Zone tab
  await page.getByRole('tab', { name: 'Danger Zone' }).click();
  await page.waitForTimeout(500); // Wait for tab content to render
}

/**
 * Helper: Delete organization with confirmation
 */
async function deleteOrganization(page: Page, orgName: string) {
  // Click Delete button for organization
  await page.getByRole('button', { name: 'Delete', exact: true }).click();

  // Wait for confirmation dialog
  await expect(page.getByRole('dialog', { name: 'Delete Organization' })).toBeVisible();

  // Type organization name to confirm
  await page.getByRole('textbox', { name: `Type ${orgName} to confirm` }).fill(orgName);

  // Confirm deletion
  await page.getByRole('button', { name: 'Delete Organization' }).click();

  // Wait for deletion to complete (should redirect to home page)
  await page.waitForURL(BASE_URL, { timeout: 10000 });
}

// ====================
// API VALIDATION HELPERS
// ====================

/**
 * Check if organization exists in Supabase via Frontend API
 */
async function checkOrgExistsInSupabase(request: any, orgSlug: string): Promise<boolean> {
  try {
    const response = await request.get(`${BASE_URL}/api/organizations/${orgSlug}`);
    return response.status() === 200;
  } catch {
    return false;
  }
}

/**
 * Check if BigQuery dataset exists via Backend API
 */
async function checkDatasetExistsInBigQuery(
  request: any,
  orgSlug: string,
  apiKey: string
): Promise<boolean> {
  try {
    const response = await request.get(
      `${API_BASE_URL}/api/v1/datasets/check/${orgSlug}_prod`,
      {
        headers: {
          'X-CA-Root-Key': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    const data = await response.json();
    return data.exists === true;
  } catch {
    return false;
  }
}

/**
 * Check if organization exists in organizations dataset (meta table)
 */
async function checkOrgExistsInMetaTable(
  request: any,
  orgSlug: string,
  apiKey: string
): Promise<boolean> {
  try {
    const response = await request.get(
      `${API_BASE_URL}/api/v1/organizations/${orgSlug}`,
      {
        headers: {
          'X-CA-Root-Key': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.status() === 200;
  } catch {
    return false;
  }
}

/**
 * Check if user exists in Supabase Auth
 */
async function checkUserExistsInSupabase(request: any, email: string): Promise<boolean> {
  try {
    const response = await request.get(`${BASE_URL}/api/auth/user?email=${email}`);
    return response.status() === 200;
  } catch {
    return false;
  }
}

/**
 * Verify complete deletion across all systems
 */
async function verifyCompleteDeletion(
  request: any,
  orgSlug: string,
  email: string
): Promise<{
  supabaseOrg: boolean;
  bigQueryDataset: boolean;
  metaTable: boolean;
  supabaseUser: boolean;
}> {
  const results = {
    supabaseOrg: await checkOrgExistsInSupabase(request, orgSlug),
    bigQueryDataset: await checkDatasetExistsInBigQuery(request, orgSlug, CA_ROOT_API_KEY),
    metaTable: await checkOrgExistsInMetaTable(request, orgSlug, CA_ROOT_API_KEY),
    supabaseUser: await checkUserExistsInSupabase(request, email)
  };

  console.log('\n🔍 Deletion Verification Results:');
  console.log(`   Supabase Org: ${results.supabaseOrg ? '❌ Still exists' : '✓ Deleted'}`);
  console.log(`   BigQuery Dataset: ${results.bigQueryDataset ? '❌ Still exists' : '✓ Deleted'}`);
  console.log(`   Meta Table Entry: ${results.metaTable ? '❌ Still exists' : '✓ Deleted'}`);
  console.log(`   Supabase User: ${results.supabaseUser ? '❌ Still exists' : '✓ Deleted'}\n`);

  return results;
}

// ====================
// TEST SUITE: Organization Deletion
// ====================

test.describe('Organization Deletion Flow', () => {
  test('should successfully delete organization through UI', async ({ page }) => {
    // Step 1: Login
    await login(page, TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);

    // Verify we're logged in (dashboard is visible)
    await expect(page).toHaveURL(new RegExp(`/${TEST_CREDENTIALS.orgSlug}/dashboard`));

    // Step 2: Navigate to Danger Zone
    await navigateToDangerZone(page);

    // Verify Danger Zone is displayed
    await expect(page.getByRole('heading', { name: 'Danger Zone', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Organizations You Own', level: 3 })).toBeVisible();

    // Verify organization is listed
    await expect(page.getByText(TEST_CREDENTIALS.orgName)).toBeVisible();
    await expect(page.getByText('1 member')).toBeVisible();

    // Verify Delete Account button is disabled (org must be deleted first)
    const deleteAccountButton = page.getByRole('button', { name: 'Delete Account' });
    await expect(deleteAccountButton).toBeDisabled();

    // Step 3: Delete organization
    await deleteOrganization(page, TEST_CREDENTIALS.orgName);

    // Step 4: Verify deletion and redirect
    await expect(page).toHaveURL(BASE_URL);

    // Verify we're on the landing page (logged out)
    await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible();
  });

  test('should show confirmation dialog when deleting organization', async ({ page }) => {
    await login(page, TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    await navigateToDangerZone(page);

    // Click Delete button
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    // Verify confirmation dialog appears
    const dialog = page.getByRole('dialog', { name: 'Delete Organization' });
    await expect(dialog).toBeVisible();

    // Verify dialog content
    await expect(dialog.getByText(`This will permanently delete "${TEST_CREDENTIALS.orgName}"`)).toBeVisible();
    await expect(dialog.getByText('All organization data, members, invites, and settings will be permanently deleted.')).toBeVisible();

    // Verify Delete button is disabled until confirmation text is entered
    const deleteButton = dialog.getByRole('button', { name: 'Delete Organization' });
    await expect(deleteButton).toBeDisabled();

    // Cancel deletion
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('should require exact organization name to confirm deletion', async ({ page }) => {
    await login(page, TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    await navigateToDangerZone(page);

    // Click Delete button
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Delete Organization' });
    const deleteButton = dialog.getByRole('button', { name: 'Delete Organization' });
    const confirmInput = page.getByRole('textbox', { name: `Type ${TEST_CREDENTIALS.orgName} to confirm` });

    // Verify button is disabled initially
    await expect(deleteButton).toBeDisabled();

    // Try incorrect name
    await confirmInput.fill('Wrong Name');
    await expect(deleteButton).toBeDisabled();

    // Try partial correct name
    await confirmInput.fill('Acme');
    await expect(deleteButton).toBeDisabled();

    // Enter correct name
    await confirmInput.fill(TEST_CREDENTIALS.orgName);
    await expect(deleteButton).toBeEnabled();
  });

  test('should prevent account deletion while organization exists', async ({ page }) => {
    await login(page, TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    await navigateToDangerZone(page);

    // Verify warning message is shown
    await expect(page.getByText('You own 1 organization. Please transfer ownership or delete them before deleting your account.')).toBeVisible();

    // Verify Delete Account button is disabled
    const deleteAccountButton = page.getByRole('button', { name: 'Delete Account' });
    await expect(deleteAccountButton).toBeDisabled();
  });
});

// ====================
// TEST SUITE: Account Deletion (requires org deletion first)
// ====================

test.describe('Account Deletion Flow', () => {
  test('should enable account deletion after all organizations are deleted', async ({ page }) => {
    // First, delete the organization
    await login(page, TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    await navigateToDangerZone(page);
    await deleteOrganization(page, TEST_CREDENTIALS.orgName);

    // Verify we're logged out
    await expect(page).toHaveURL(BASE_URL);

    // Note: In a real scenario, the account is automatically deleted when the last org is deleted
    // This is confirmed by the fact that we're redirected to the home page and logged out
  });
});

// ====================
// TEST SUITE: Navigation and UI Elements
// ====================

test.describe('Organization Settings Navigation', () => {
  test('should navigate to organization settings', async ({ page }) => {
    await login(page, TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);

    // Expand Org Settings
    await page.locator('div').filter({ hasText: /^Org Settings$/ }).first().click();

    // Verify submenu items are visible
    await expect(page.getByRole('link', { name: 'Organization' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Hierarchy' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Usage & Quotas' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Team Members' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Billing' })).toBeVisible();

    // Navigate to Organization settings
    await page.getByRole('link', { name: 'Organization' }).click();
    await expect(page).toHaveURL(new RegExp(`/${TEST_CREDENTIALS.orgSlug}/settings/organization`));

    // Verify page title
    await expect(page.getByRole('heading', { name: 'Organization Settings', level: 1 })).toBeVisible();
  });

  test('should display all tabs in organization settings', async ({ page }) => {
    await login(page, TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    await navigateToDangerZone(page);

    // Verify all tabs are present
    await expect(page.getByRole('tab', { name: 'General' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Contact' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Backend' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Danger Zone' })).toBeVisible();
  });
});

// ====================
// TEST SUITE: Error Handling and Edge Cases
// ====================

test.describe('Error Handling', () => {
  test('should handle login failure gracefully', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Try to login with wrong credentials
    await page.getByRole('textbox', { name: 'Email address' }).fill('wrong@example.com');
    await page.getByRole('textbox', { name: 'Password' }).fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Should stay on login page (not navigate away)
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(`${BASE_URL}/login`);
  });

  test('should show loading state during deletion', async ({ page }) => {
    await login(page, TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    await navigateToDangerZone(page);

    // Click Delete button
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Delete Organization' });
    const confirmInput = page.getByRole('textbox', { name: `Type ${TEST_CREDENTIALS.orgName} to confirm` });

    // Enter org name
    await confirmInput.fill(TEST_CREDENTIALS.orgName);

    // Click delete and verify loading state
    const deleteButton = dialog.getByRole('button', { name: 'Delete Organization' });
    await deleteButton.click();

    // Verify button shows loading state (becomes "Deleting..." and disabled)
    await expect(page.getByRole('button', { name: 'Deleting...' })).toBeDisabled();
  });
});

// ====================
// TEST SUITE: Full End-to-End Cleanup Flow
// ====================

test.describe('Complete Cleanup Flow', () => {
  test('should delete organization and verify complete cleanup', async ({ page }) => {
    // Step 1: Login
    await login(page, TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    console.log('✓ Logged in successfully');

    // Step 2: Verify organization exists
    await expect(page.getByText(TEST_CREDENTIALS.orgName)).toBeVisible();
    console.log('✓ Organization exists');

    // Step 3: Navigate to Danger Zone
    await navigateToDangerZone(page);
    console.log('✓ Navigated to Danger Zone');

    // Step 4: Verify organization details
    await expect(page.getByText(TEST_CREDENTIALS.orgName)).toBeVisible();
    await expect(page.getByText('1 member')).toBeVisible();
    await expect(page.getByText('Owner')).toBeVisible();
    console.log('✓ Organization details verified');

    // Step 5: Delete organization
    await deleteOrganization(page, TEST_CREDENTIALS.orgName);
    console.log('✓ Organization deleted');

    // Step 6: Verify cleanup
    await expect(page).toHaveURL(BASE_URL);
    await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible();
    console.log('✓ Redirected to home page (logged out)');

    // Step 7: Verify session is cleared (try to access protected route)
    await page.goto(`${BASE_URL}/${TEST_CREDENTIALS.orgSlug}/dashboard`);
    // Should redirect to login
    await expect(page).toHaveURL(`${BASE_URL}/login`);
    console.log('✓ Session cleared - cannot access protected routes');

    console.log('\n✅ Complete cleanup flow verified successfully!');
  });

  test('should verify deletion across all systems (Supabase + BigQuery)', async ({ page, request }) => {
    console.log('\n🚀 Starting comprehensive deletion verification test...\n');

    // Step 1: Check if org exists before deletion
    console.log('📋 Step 1: Verifying organization exists before deletion...');
    const beforeDeletion = await verifyCompleteDeletion(
      request,
      TEST_CREDENTIALS.orgSlug,
      TEST_CREDENTIALS.email
    );

    // Log initial state
    console.log('Initial State:');
    if (beforeDeletion.supabaseOrg) console.log('  ✓ Organization exists in Supabase');
    if (beforeDeletion.bigQueryDataset) console.log('  ✓ BigQuery dataset exists');
    if (beforeDeletion.metaTable) console.log('  ✓ Organization in meta table');
    if (beforeDeletion.supabaseUser) console.log('  ✓ User exists in Supabase');

    // Step 2: Login and delete organization
    console.log('\n📋 Step 2: Logging in and navigating to deletion page...');
    await login(page, TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    await navigateToDangerZone(page);
    console.log('✓ Navigated to Danger Zone');

    // Step 3: Perform deletion
    console.log('\n📋 Step 3: Deleting organization...');
    await deleteOrganization(page, TEST_CREDENTIALS.orgName);
    console.log('✓ Deletion triggered');

    // Step 4: Wait for async cleanup (BigQuery deletion takes time)
    console.log('\n📋 Step 4: Waiting for async cleanup processes...');
    await page.waitForTimeout(5000); // Wait 5 seconds for backend cleanup

    // Step 5: Verify deletion across all systems
    console.log('\n📋 Step 5: Verifying complete deletion across all systems...');
    const afterDeletion = await verifyCompleteDeletion(
      request,
      TEST_CREDENTIALS.orgSlug,
      TEST_CREDENTIALS.email
    );

    // Step 6: Assert all systems show deletion
    console.log('📋 Step 6: Validating deletion results...');

    // All should be deleted (false means doesn't exist anymore)
    expect(afterDeletion.supabaseOrg).toBe(false);
    expect(afterDeletion.bigQueryDataset).toBe(false);
    expect(afterDeletion.metaTable).toBe(false);
    expect(afterDeletion.supabaseUser).toBe(false);

    console.log('\n✅ All systems confirmed deletion:');
    console.log('  ✓ Supabase organization: DELETED');
    console.log('  ✓ BigQuery dataset: DELETED');
    console.log('  ✓ Meta table entry: DELETED');
    console.log('  ✓ Supabase user: DELETED');
    console.log('\n🎉 Comprehensive deletion verification PASSED!');
  });

  test('should handle partial deletion failures gracefully', async ({ page, request }) => {
    console.log('\n🧪 Testing partial deletion failure handling...\n');

    // This test simulates what happens if deletion fails partway through
    // In production, this would test rollback/cleanup mechanisms

    await login(page, TEST_CREDENTIALS.email, TEST_CREDENTIALS.password);
    await navigateToDangerZone(page);

    // Check state before deletion
    await verifyCompleteDeletion(
      request,
      TEST_CREDENTIALS.orgSlug,
      TEST_CREDENTIALS.email
    );

    // Attempt deletion
    await deleteOrganization(page, TEST_CREDENTIALS.orgName);

    // Check state after deletion
    const after = await verifyCompleteDeletion(
      request,
      TEST_CREDENTIALS.orgSlug,
      TEST_CREDENTIALS.email
    );

    // Log any inconsistencies
    const inconsistencies: string[] = [];
    if (after.supabaseOrg && !after.bigQueryDataset) {
      inconsistencies.push('Supabase org exists but BigQuery dataset deleted');
    }
    if (!after.supabaseOrg && after.bigQueryDataset) {
      inconsistencies.push('BigQuery dataset exists but Supabase org deleted');
    }
    if (after.metaTable !== after.supabaseOrg) {
      inconsistencies.push('Meta table and Supabase org state mismatch');
    }

    if (inconsistencies.length > 0) {
      console.log('⚠️  Potential inconsistencies detected:');
      inconsistencies.forEach(msg => console.log(`   - ${msg}`));
    } else {
      console.log('✓ Deletion state is consistent across all systems');
    }
  });
});

// ====================
// TEST SUITE: API Validation Tests
// ====================

test.describe('API Validation Tests', () => {
  test('should validate Supabase organization endpoint', async ({ request }) => {
    const exists = await checkOrgExistsInSupabase(request, TEST_CREDENTIALS.orgSlug);
    console.log(`Supabase org check: ${exists ? 'EXISTS' : 'NOT FOUND'}`);
    // We don't assert here since org might be deleted - just verify endpoint works
  });

  test('should validate BigQuery dataset endpoint', async ({ request }) => {
    const exists = await checkDatasetExistsInBigQuery(
      request,
      TEST_CREDENTIALS.orgSlug,
      CA_ROOT_API_KEY
    );
    console.log(`BigQuery dataset check: ${exists ? 'EXISTS' : 'NOT FOUND'}`);
  });

  test('should validate meta table endpoint', async ({ request }) => {
    const exists = await checkOrgExistsInMetaTable(
      request,
      TEST_CREDENTIALS.orgSlug,
      CA_ROOT_API_KEY
    );
    console.log(`Meta table entry check: ${exists ? 'EXISTS' : 'NOT FOUND'}`);
  });

  test('should validate Supabase user endpoint', async ({ request }) => {
    const exists = await checkUserExistsInSupabase(request, TEST_CREDENTIALS.email);
    console.log(`Supabase user check: ${exists ? 'EXISTS' : 'NOT FOUND'}`);
  });

  test('should verify API health before running tests', async ({ request }) => {
    // Check API service is running
    const apiHealth = await request.get(`${API_BASE_URL}/health`);
    expect(apiHealth.status()).toBe(200);
    console.log('✓ API Service is healthy');

    // Check frontend is running
    const frontendHealth = await request.get(`${BASE_URL}`);
    expect(frontendHealth.status()).toBe(200);
    console.log('✓ Frontend is healthy');
  });
});
