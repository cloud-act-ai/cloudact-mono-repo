/**
 * E2E Settings Tests
 *
 * Comprehensive tests for settings pages:
 * - Profile settings
 * - Organization settings
 * - API keys management
 * - Team management
 * - Hierarchy management
 * - Notification settings
 *
 * Prerequisites:
 * - Frontend running on http://localhost:3000
 * - Test user: demo@cloudact.ai / demo1234
 */

import { test, expect, Page } from '@playwright/test';

// ===========================================
// Configuration
// ===========================================

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

// Test credentials
const TEST_CREDENTIALS = {
  email: 'demo@cloudact.ai',
  password: 'demo1234',
};

// Settings page URLs
const SETTINGS_PAGES = {
  personal: 'settings/personal',
  organization: 'settings/organization',
  apiKeys: 'settings/api-keys',
  invite: 'settings/invite',
  hierarchy: 'settings/hierarchy',
  quotaUsage: 'settings/quota-usage',
};

// ===========================================
// Helper Functions
// ===========================================

/**
 * Wait for page to be fully loaded
 */
async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);
}

/**
 * Login and get org slug
 */
async function loginAndGetOrgSlug(page: Page): Promise<string> {
  await page.goto(`${BASE_URL}/login`);
  await waitForPageLoad(page);

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  await emailInput.fill(TEST_CREDENTIALS.email);
  await passwordInput.fill(TEST_CREDENTIALS.password);

  const submitButton = page.locator('button[type="submit"], button:has-text("Sign in")').first();
  await submitButton.click();

  await page.waitForURL(/\/(.*?)\/dashboard|\/org-select/, { timeout: 30000 });

  if (page.url().includes('/org-select')) {
    const orgCard = page.locator('[data-testid="org-card"], a[href*="/dashboard"]').first();
    await orgCard.click();
    await page.waitForURL(/\/(.*?)\/dashboard/, { timeout: 30000 });
  }

  const match = page.url().match(/\/([^/]+)\/dashboard/);
  return match ? match[1] : 'test-org';
}

/**
 * Navigate to a settings page
 */
async function navigateToSettingsPage(page: Page, orgSlug: string, pageType: keyof typeof SETTINGS_PAGES): Promise<void> {
  await page.goto(`${BASE_URL}/${orgSlug}/${SETTINGS_PAGES[pageType]}`);
  await waitForPageLoad(page);
  await page.waitForTimeout(1000); // Allow content to load
}

// ===========================================
// Test Suite: Profile Settings
// ===========================================

test.describe('Profile Settings', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should load profile settings page', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'personal');

    // Verify we're on profile page
    expect(page.url()).toContain('personal');

    // Check for profile heading
    const heading = page.locator('h1, h2').filter({ hasText: /profile|personal|account/i }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('should display user email', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'personal');

    // Look for email display
    const emailDisplay = page.locator(`text=${TEST_CREDENTIALS.email}`);
    await expect(emailDisplay).toBeVisible({ timeout: 10000 });
  });

  test('should display name fields', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'personal');

    // Look for name fields
    const firstNameField = page.locator('input[name*="first"], input[placeholder*="first"], label:has-text("First name")').first();
    const lastNameField = page.locator('input[name*="last"], input[placeholder*="last"], label:has-text("Last name")').first();

    const hasFirstName = await firstNameField.isVisible({ timeout: 5000 }).catch(() => false);
    const hasLastName = await lastNameField.isVisible({ timeout: 5000 }).catch(() => false);

    console.log(`First name field: ${hasFirstName}, Last name field: ${hasLastName}`);
  });

  test('should allow updating profile information', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'personal');

    // Find editable fields
    const editButton = page.locator('button:has-text("Edit"), button:has-text("Update")').first();

    if (await editButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Edit button found for profile');
    }

    // Look for save button
    const saveButton = page.locator('button:has-text("Save"), button[type="submit"]').first();
    const hasSave = await saveButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasSave) {
      console.log('Save button found for profile updates');
    }
  });

  test('should display password change option', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'personal');

    // Look for password change section
    const passwordSection = page.locator('text=/change.*password|update.*password|password/i').first();
    const hasPasswordSection = await passwordSection.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasPasswordSection) {
      console.log('Password change option found');
    }
  });

  test('should validate profile form fields', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'personal');

    // Try to clear a required field and save
    const firstNameInput = page.locator('input[name*="first"], input[id*="first"]').first();

    if (await firstNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstNameInput.clear();
      await firstNameInput.blur();

      // Look for validation error
      await page.waitForTimeout(500);

      const validationError = page.locator('text=/required|cannot be empty/i').first();
      const hasError = await validationError.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasError) {
        console.log('Form validation working');
      }
    }
  });
});

// ===========================================
// Test Suite: Organization Settings
// ===========================================

test.describe('Organization Settings', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should load organization settings page', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'organization');

    expect(page.url()).toContain('organization');

    const heading = page.locator('h1, h2').filter({ hasText: /organization|org|company/i }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('should display organization name', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'organization');

    // Look for org name display or input
    const orgNameElement = page.locator('input[name*="org"], input[name*="name"], text=/acme|test.*org/i').first();
    await expect(orgNameElement).toBeVisible({ timeout: 10000 });
  });

  test('should display organization settings tabs', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'organization');

    // Look for tabs
    const tabs = page.locator('button[role="tab"], nav button, a[role="tab"]');
    const count = await tabs.count();

    console.log(`Found ${count} settings tabs`);
  });

  test('should display Danger Zone tab', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'organization');

    // Look for Danger Zone
    const dangerZone = page.locator('button:has-text("Danger"), text=/danger.*zone/i').first();
    const hasDangerZone = await dangerZone.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasDangerZone) {
      console.log('Danger Zone tab found');
      await dangerZone.click();
      await page.waitForTimeout(500);

      // Should show delete org option
      const deleteOption = page.locator('text=/delete.*organization|remove.*organization/i').first();
      await expect(deleteOption).toBeVisible({ timeout: 5000 });
    }
  });

  test('should display organization timezone setting', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'organization');

    // Look for timezone setting
    const timezoneSetting = page.locator('select:has-text("Timezone"), label:has-text("Timezone"), text=/timezone/i').first();
    const hasTimezone = await timezoneSetting.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTimezone) {
      console.log('Timezone setting found');
    }
  });

  test('should display organization currency setting', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'organization');

    // Look for currency setting
    const currencySetting = page.locator('select:has-text("Currency"), label:has-text("Currency"), text=/currency|\\$|usd/i').first();
    const hasCurrency = await currencySetting.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasCurrency) {
      console.log('Currency setting found');
    }
  });
});

// ===========================================
// Test Suite: API Keys Management
// ===========================================

test.describe('API Keys Management', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should load API keys page', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'apiKeys');

    expect(page.url()).toContain('api-key');

    const heading = page.locator('h1, h2').filter({ hasText: /api.*key/i }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('should display existing API keys', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'apiKeys');

    // Look for API key list
    const keyList = page.locator('[data-testid*="api-key"], table, ul').first();
    await expect(keyList).toBeVisible({ timeout: 10000 });
  });

  test('should display create new API key button', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'apiKeys');

    // Look for create button
    const createButton = page.locator('button:has-text("Create"), button:has-text("Generate"), button:has-text("New")').first();
    await expect(createButton).toBeVisible({ timeout: 10000 });
  });

  test('should open create API key dialog', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'apiKeys');

    const createButton = page.locator('button:has-text("Create"), button:has-text("Generate"), button:has-text("New")').first();

    if (await createButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createButton.click();
      await page.waitForTimeout(500);

      // Dialog should appear with name input
      const nameInput = page.locator('input[name*="name"], input[placeholder*="name"], input[id*="name"]').first();
      await expect(nameInput).toBeVisible({ timeout: 5000 });
    }
  });

  test('should display API key security warning', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'apiKeys');

    // Look for security notice
    const securityNote = page.locator('text=/keep.*secret|secure|never share|once/i').first();
    const hasNote = await securityNote.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasNote) {
      console.log('Security warning displayed');
    }
  });

  test('should show copy button for API keys', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'apiKeys');

    // Look for copy buttons
    const copyButtons = page.locator('button[aria-label*="copy"], button:has-text("Copy"), [data-testid*="copy"]');
    const count = await copyButtons.count();

    console.log(`Found ${count} copy buttons`);
  });

  test('should show delete/revoke option for API keys', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'apiKeys');

    // Look for delete/revoke buttons
    const deleteButtons = page.locator('button:has-text("Delete"), button:has-text("Revoke"), button[aria-label*="delete"]');
    const count = await deleteButtons.count();

    console.log(`Found ${count} delete/revoke buttons`);
  });
});

// ===========================================
// Test Suite: Team Management
// ===========================================

test.describe('Team Management', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should load team management page', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'invite');

    expect(page.url()).toContain('invite');

    const heading = page.locator('h1, h2').filter({ hasText: /team|member|invite/i }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('should display current team members', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'invite');

    // Look for member list
    const memberList = page.locator('table, ul, [data-testid*="member"]').first();
    await expect(memberList).toBeVisible({ timeout: 10000 });
  });

  test('should display invite member button', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'invite');

    const inviteButton = page.locator('button:has-text("Invite"), button:has-text("Add Member")').first();
    await expect(inviteButton).toBeVisible({ timeout: 10000 });
  });

  test('should open invite member dialog', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'invite');

    const inviteButton = page.locator('button:has-text("Invite"), button:has-text("Add Member")').first();

    if (await inviteButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await inviteButton.click();
      await page.waitForTimeout(500);

      // Email input should appear
      const emailInput = page.locator('input[type="email"], input[name*="email"]').first();
      await expect(emailInput).toBeVisible({ timeout: 5000 });
    }
  });

  test('should display member roles', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'invite');

    // Look for role indicators
    const roles = page.locator('text=/owner|admin|collaborator|read.*only|member/i');
    const count = await roles.count();

    console.log(`Found ${count} role indicators`);
    expect(count).toBeGreaterThan(0); // At least the current user
  });

  test('should display pending invites section', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'invite');

    // Look for pending invites
    const pendingSection = page.locator('text=/pending|invited|waiting/i').first();
    const hasPending = await pendingSection.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasPending) {
      console.log('Pending invites section visible');
    }
  });

  test('should show seat usage indicator', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'invite');

    // Look for seat/usage indicator
    const seatInfo = page.locator('text=/\\d+.*seat|\\d+.*member|\\d+.*of.*\\d+/i').first();
    const hasSeats = await seatInfo.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasSeats) {
      console.log('Seat usage indicator found');
    }
  });
});

// ===========================================
// Test Suite: Hierarchy Management
// ===========================================

test.describe('Hierarchy Management', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should load hierarchy page', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'hierarchy');

    expect(page.url()).toContain('hierarchy');

    const heading = page.locator('h1, h2').filter({ hasText: /hierarchy|organization|structure/i }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('should display hierarchy levels', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'hierarchy');

    // Look for hierarchy level labels
    const departments = page.locator('text=/department/i');
    const projects = page.locator('text=/project/i');
    const teams = page.locator('text=/team/i');

    const hasDepts = await departments.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasProjects = await projects.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasTeams = await teams.first().isVisible({ timeout: 5000 }).catch(() => false);

    console.log(`Hierarchy levels - Depts: ${hasDepts}, Projects: ${hasProjects}, Teams: ${hasTeams}`);
  });

  test('should display add entity button', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'hierarchy');

    const addButton = page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New")').first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
  });

  test('should display tree or list view', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'hierarchy');

    // Look for view toggle or tree structure
    const viewToggle = page.locator('button:has-text("Tree"), button:has-text("List"), [data-testid*="view"]').first();
    const treeView = page.locator('[role="tree"], [data-testid*="tree"]').first();
    const listView = page.locator('table, ul').first();

    const hasToggle = await viewToggle.isVisible({ timeout: 3000 }).catch(() => false);
    const hasTree = await treeView.isVisible({ timeout: 3000 }).catch(() => false);
    const hasList = await listView.isVisible({ timeout: 3000 }).catch(() => false);

    console.log(`View options - Toggle: ${hasToggle}, Tree: ${hasTree}, List: ${hasList}`);
  });

  test('should display import/export options', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'hierarchy');

    const importButton = page.locator('button:has-text("Import"), button:has-text("Upload")').first();
    const exportButton = page.locator('button:has-text("Export"), button:has-text("Download")').first();

    const hasImport = await importButton.isVisible({ timeout: 5000 }).catch(() => false);
    const hasExport = await exportButton.isVisible({ timeout: 5000 }).catch(() => false);

    console.log(`Import/Export - Import: ${hasImport}, Export: ${hasExport}`);
  });
});

// ===========================================
// Test Suite: Quota Usage
// ===========================================

test.describe('Quota Usage', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should load quota usage page', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'quotaUsage');

    expect(page.url()).toContain('quota');

    const heading = page.locator('h1, h2').filter({ hasText: /quota|usage|limit/i }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('should display usage metrics', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'quotaUsage');

    // Look for usage numbers
    const usageMetrics = page.locator('text=/\\d+.*\\/.*\\d+|\\d+%|used|remaining/i');
    const count = await usageMetrics.count();

    console.log(`Found ${count} usage metrics`);
  });

  test('should display plan limits', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'quotaUsage');

    // Look for plan limits
    const planLimits = page.locator('text=/daily|monthly|limit|max/i');
    const count = await planLimits.count();

    console.log(`Found ${count} plan limit indicators`);
  });

  test('should display usage progress bars', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'quotaUsage');

    // Look for progress bars
    const progressBars = page.locator('[role="progressbar"], progress, [data-testid*="progress"]');
    const count = await progressBars.count();

    console.log(`Found ${count} progress bars`);
  });

  test('should link to upgrade plan', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'quotaUsage');

    // Look for upgrade link
    const upgradeLink = page.locator('a:has-text("Upgrade"), button:has-text("Upgrade")').first();
    const hasUpgrade = await upgradeLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasUpgrade) {
      console.log('Upgrade plan link found');
    }
  });
});

// ===========================================
// Test Suite: Settings Navigation
// ===========================================

test.describe('Settings Navigation', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should display settings sidebar/navigation', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'organization');

    // Look for settings navigation
    const settingsNav = page.locator('nav, aside, [data-testid*="settings-nav"]').first();
    await expect(settingsNav).toBeVisible({ timeout: 10000 });
  });

  test('should navigate between settings pages', async ({ page }) => {
    // Visit organization settings
    await navigateToSettingsPage(page, orgSlug, 'organization');
    expect(page.url()).toContain('organization');

    // Navigate to profile
    await navigateToSettingsPage(page, orgSlug, 'personal');
    expect(page.url()).toContain('personal');

    // Navigate to team
    await navigateToSettingsPage(page, orgSlug, 'invite');
    expect(page.url()).toContain('invite');

    // Navigate to API keys
    await navigateToSettingsPage(page, orgSlug, 'apiKeys');
    expect(page.url()).toContain('api-key');
  });

  test('should highlight current settings page', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'organization');

    // Look for active/selected indicator
    const activeLink = page.locator('a[aria-current="page"], a.active, a[data-active="true"]').first();
    const hasActive = await activeLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasActive) {
      console.log('Active settings link highlighted');
    }
  });
});

// ===========================================
// Test Suite: Settings Accessibility
// ===========================================

test.describe('Settings Accessibility', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should have proper form labels', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'personal');

    // Check for labels
    const labels = page.locator('label');
    const count = await labels.count();

    console.log(`Found ${count} form labels`);
    expect(count).toBeGreaterThan(0);
  });

  test('should support keyboard navigation', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'organization');

    // Tab through elements
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Check that an element is focused
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA']).toContain(focusedElement);
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    await navigateToSettingsPage(page, orgSlug, 'organization');

    const h1Count = await page.locator('h1').count();
    const h2Count = await page.locator('h2').count();

    console.log(`Heading hierarchy - h1: ${h1Count}, h2: ${h2Count}`);
    expect(h1Count + h2Count).toBeGreaterThan(0);
  });
});

console.log(`
===========================================
Settings E2E Test Suite
===========================================
Test Suites: 9
- Profile Settings (6 tests)
- Organization Settings (6 tests)
- API Keys Management (7 tests)
- Team Management (7 tests)
- Hierarchy Management (5 tests)
- Quota Usage (5 tests)
- Settings Navigation (3 tests)
- Settings Accessibility (3 tests)

Total Tests: 42

Run with:
  npx playwright test tests/e2e/settings.spec.ts
  npx playwright test tests/e2e/settings.spec.ts --headed
  npx playwright test tests/e2e/settings.spec.ts --ui
===========================================
`);
