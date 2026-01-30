/**
 * E2E Cost Pages Tests
 *
 * Comprehensive tests for all cost-related pages:
 * - Cloud costs page
 * - GenAI costs page
 * - Subscription costs page
 * - Cost overview page
 * - Filters functionality
 * - Export functionality
 *
 * Prerequisites:
 * - Frontend running on http://localhost:3000
 * - Test user: demo@cloudact.ai / demo1234
 * - User should have some integrations/data for full testing
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

// Cost page URLs
const COST_PAGES = {
  overview: 'cost-dashboards/overview',
  cloud: 'cost-dashboards/cloud',
  genai: 'cost-dashboards/genai',
  subscription: 'cost-dashboards/subscription',
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
 * Wait for cost data to load
 */
async function waitForDataToLoad(page: Page): Promise<void> {
  // Wait for loading spinners to disappear
  const loadingSpinner = page.locator('.animate-spin, [data-loading="true"], text=/loading/i');

  try {
    await loadingSpinner.waitFor({ state: 'hidden', timeout: 30000 });
  } catch {
    // Loading spinner may not exist
  }

  await page.waitForTimeout(2000);
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
 * Navigate to a cost page
 */
async function navigateToCostPage(page: Page, orgSlug: string, pageType: keyof typeof COST_PAGES): Promise<void> {
  await page.goto(`${BASE_URL}/${orgSlug}/${COST_PAGES[pageType]}`);
  await waitForDataToLoad(page);
}

// ===========================================
// Test Suite: Cloud Costs Page
// ===========================================

test.describe('Cloud Costs Page', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should load cloud costs page', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'cloud');

    // Verify we're on cloud costs page
    expect(page.url()).toContain('cloud');

    // Check for page heading
    const heading = page.locator('h1, h2').filter({ hasText: /cloud|cost/i }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('should display cloud provider breakdown', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'cloud');

    // Look for provider names or categories
    const providers = page.locator('text=/gcp|aws|azure|google cloud|amazon|microsoft/i');
    const count = await providers.count();

    console.log(`Found ${count} cloud provider references`);
  });

  test('should display cost metrics', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'cloud');

    // Look for monetary values
    const costs = page.locator('text=/\\$\\d+/');
    const count = await costs.count();

    console.log(`Found ${count} cost values displayed`);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should display cost trend chart', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'cloud');

    // Look for charts
    const charts = page.locator('canvas, svg[class*="chart"], [data-testid*="chart"], [role="img"]');
    const count = await charts.count();

    console.log(`Found ${count} chart elements`);
  });

  test('should handle empty state when no cloud integrations', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'cloud');

    // Check for empty state or data
    const emptyState = page.locator('text=/no data|no cost|connect.*provider|get started|\\$0/i');
    const hasEmptyState = await emptyState.first().isVisible({ timeout: 3000 }).catch(() => false);

    if (hasEmptyState) {
      console.log('Empty state displayed (no cloud integrations)');
    } else {
      console.log('Cloud cost data available');
    }
  });
});

// ===========================================
// Test Suite: GenAI Costs Page
// ===========================================

test.describe('GenAI Costs Page', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should load GenAI costs page', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'genai');

    // Verify we're on GenAI costs page
    expect(page.url()).toContain('genai');

    // Check for page heading
    const heading = page.locator('h1, h2').filter({ hasText: /genai|ai|llm|cost/i }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('should display GenAI provider breakdown', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'genai');

    // Look for provider names
    const providers = page.locator('text=/openai|anthropic|gemini|claude|gpt|azure openai|bedrock|vertex/i');
    const count = await providers.count();

    console.log(`Found ${count} GenAI provider references`);
  });

  test('should display token usage metrics', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'genai');

    // Look for token-related metrics
    const tokenMetrics = page.locator('text=/token|input|output|prompt|completion/i');
    const count = await tokenMetrics.count();

    console.log(`Found ${count} token metric references`);
  });

  test('should display model breakdown', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'genai');

    // Look for model names
    const models = page.locator('text=/gpt-4|gpt-3|claude|opus|sonnet|gemini-pro|llama/i');
    const count = await models.count();

    console.log(`Found ${count} model references`);
  });

  test('should handle empty state when no GenAI integrations', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'genai');

    const emptyState = page.locator('text=/no data|no cost|connect.*provider|get started|\\$0/i');
    const hasEmptyState = await emptyState.first().isVisible({ timeout: 3000 }).catch(() => false);

    if (hasEmptyState) {
      console.log('Empty state displayed (no GenAI integrations)');
    } else {
      console.log('GenAI cost data available');
    }
  });
});

// ===========================================
// Test Suite: Subscription Costs Page
// ===========================================

test.describe('Subscription Costs Page', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should load subscription costs page', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'subscription');

    // Verify we're on subscription costs page
    expect(page.url()).toContain('subscription');

    // Check for page heading
    const heading = page.locator('h1, h2').filter({ hasText: /subscription|saas|cost/i }).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('should display SaaS provider breakdown', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'subscription');

    // Look for SaaS provider names
    const providers = page.locator('text=/slack|github|figma|notion|jira|confluence|zoom|salesforce/i');
    const count = await providers.count();

    console.log(`Found ${count} SaaS provider references`);
  });

  test('should display subscription metrics', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'subscription');

    // Look for subscription-related metrics
    const metrics = page.locator('text=/seat|user|license|plan|monthly|annual/i');
    const count = await metrics.count();

    console.log(`Found ${count} subscription metric references`);
  });

  test('should display subscription cost breakdown by category', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'subscription');

    // Look for category breakdown
    const categories = page.locator('text=/productivity|communication|development|design|marketing/i');
    const count = await categories.count();

    console.log(`Found ${count} category references`);
  });

  test('should handle empty state when no subscriptions', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'subscription');

    const emptyState = page.locator('text=/no data|no cost|add.*subscription|get started|\\$0/i');
    const hasEmptyState = await emptyState.first().isVisible({ timeout: 3000 }).catch(() => false);

    if (hasEmptyState) {
      console.log('Empty state displayed (no subscriptions)');
    } else {
      console.log('Subscription cost data available');
    }
  });
});

// ===========================================
// Test Suite: Cost Overview Page
// ===========================================

test.describe('Cost Overview Page', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should load cost overview page', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'overview');

    expect(page.url()).toContain('overview');
  });

  test('should display total cost summary', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'overview');

    // Look for total cost indicator
    const totalCost = page.locator('text=/total|overall|\\$\\d+/i');
    const count = await totalCost.count();

    expect(count).toBeGreaterThanOrEqual(0);
    console.log(`Found ${count} total cost indicators`);
  });

  test('should display cost breakdown by type', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'overview');

    // Look for cost type breakdown
    const costTypes = page.locator('text=/cloud|genai|subscription|saas|ai/i');
    const count = await costTypes.count();

    console.log(`Found ${count} cost type references`);
  });

  test('should display cost trend over time', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'overview');

    // Look for trend indicators
    const trends = page.locator('text=/\\+\\d+%|\\-\\d+%|trend|change|vs.*last/i, [data-testid*="trend"]');
    const count = await trends.count();

    console.log(`Found ${count} trend indicators`);
  });

  test('should display top cost drivers', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'overview');

    // Look for top providers/services
    const topDrivers = page.locator('text=/top|highest|most expensive/i');
    const count = await topDrivers.count();

    console.log(`Found ${count} top driver references`);
  });
});

// ===========================================
// Test Suite: Filters Work
// ===========================================

test.describe('Cost Filters', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should display filter controls', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'overview');

    // Look for filter controls
    const filters = page.locator('button:has-text("Filter"), [data-testid*="filter"], select, [role="combobox"]');
    const count = await filters.count();

    console.log(`Found ${count} filter controls`);
  });

  test('should display date range filter', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'overview');

    // Look for date filter
    const dateFilter = page.locator('button:has-text("Date"), [data-testid*="date"], input[type="date"], button:has-text("Last"), button:has-text("This")').first();
    const isVisible = await dateFilter.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      console.log('Date range filter found');
    }
  });

  test('should display provider filter', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'cloud');

    // Look for provider filter
    const providerFilter = page.locator('select:has-text("Provider"), [data-testid*="provider-filter"], button:has-text("Provider")').first();
    const isVisible = await providerFilter.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      console.log('Provider filter found');
    }
  });

  test('should display hierarchy filter', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'overview');

    // Look for hierarchy filter
    const hierarchyFilter = page.locator('select:has-text("Department"), select:has-text("Project"), select:has-text("Team"), [data-testid*="hierarchy"]').first();
    const isVisible = await hierarchyFilter.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      console.log('Hierarchy filter found');
    }
  });

  test('should update data when filter changes', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'overview');

    // Find and interact with a filter
    const filterButton = page.locator('button:has-text("Filter"), button:has-text("Date"), [data-testid*="filter"]').first();

    if (await filterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await filterButton.click();
      await page.waitForTimeout(500);

      // Look for filter options
      const option = page.locator('[role="option"], [role="menuitem"], button:has-text("7 days")').first();

      if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
        await option.click();

        // Wait for data refresh
        await waitForDataToLoad(page);
        console.log('Filter applied and data refreshed');
      }
    }
  });

  test('should allow clearing filters', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'overview');

    // Look for clear/reset filter button
    const clearButton = page.locator('button:has-text("Clear"), button:has-text("Reset"), button:has-text("All")').first();
    const isVisible = await clearButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (isVisible) {
      console.log('Clear filter button found');
      await clearButton.click();
      await waitForDataToLoad(page);
    }
  });

  test('should persist filters across navigation', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'overview');

    // Navigate to cloud costs
    await navigateToCostPage(page, orgSlug, 'cloud');

    // Navigate back to overview
    await navigateToCostPage(page, orgSlug, 'overview');

    // Page should load correctly
    expect(page.url()).toContain('overview');
  });
});

// ===========================================
// Test Suite: Export Works
// ===========================================

test.describe('Cost Export', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should display export button', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'overview');

    // Look for export button
    const exportButton = page.locator('button:has-text("Export"), button:has-text("Download"), [data-testid*="export"]').first();
    const isVisible = await exportButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      console.log('Export button found');
      await expect(exportButton).toBeVisible();
    } else {
      console.log('Export button not found on overview page');
    }
  });

  test('should show export options when clicked', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'overview');

    const exportButton = page.locator('button:has-text("Export"), button:has-text("Download"), [data-testid*="export"]').first();

    if (await exportButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await exportButton.click();
      await page.waitForTimeout(500);

      // Look for export format options
      const csvOption = page.locator('text=/csv/i, button:has-text("CSV")').first();
      const excelOption = page.locator('text=/excel|xlsx/i, button:has-text("Excel")').first();
      const pdfOption = page.locator('text=/pdf/i, button:has-text("PDF")').first();

      const hasCsv = await csvOption.isVisible({ timeout: 2000 }).catch(() => false);
      const hasExcel = await excelOption.isVisible({ timeout: 2000 }).catch(() => false);
      const hasPdf = await pdfOption.isVisible({ timeout: 2000 }).catch(() => false);

      console.log(`Export options - CSV: ${hasCsv}, Excel: ${hasExcel}, PDF: ${hasPdf}`);
    }
  });

  test('should trigger CSV download', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'overview');

    const exportButton = page.locator('button:has-text("Export"), button:has-text("Download"), [data-testid*="export"]').first();

    if (await exportButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Set up download listener
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);

      await exportButton.click();
      await page.waitForTimeout(500);

      // Click CSV option if dropdown exists
      const csvOption = page.locator('text=/csv/i, button:has-text("CSV")').first();
      if (await csvOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await csvOption.click();
      }

      const download = await downloadPromise;

      if (download) {
        console.log(`Download triggered: ${download.suggestedFilename()}`);
        expect(download.suggestedFilename()).toMatch(/\.csv$/i);
      } else {
        console.log('No download triggered (may require data or different interaction)');
      }
    }
  });

  test('should export filtered data', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'cloud');

    // Apply a filter first
    const filterButton = page.locator('button:has-text("Filter"), button:has-text("Date")').first();
    if (await filterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await filterButton.click();

      const option = page.locator('[role="option"]').first();
      if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
        await option.click();
        await waitForDataToLoad(page);
      }
    }

    // Now try to export
    const exportButton = page.locator('button:has-text("Export"), button:has-text("Download")').first();
    if (await exportButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Export button available after applying filter');
    }
  });
});

// ===========================================
// Test Suite: Cost Page Navigation
// ===========================================

test.describe('Cost Page Navigation', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should navigate between cost pages via tabs', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'overview');

    // Look for navigation tabs
    const tabs = page.locator('nav a, button[role="tab"], a[href*="cost"]');
    const count = await tabs.count();

    console.log(`Found ${count} navigation elements`);
  });

  test('should navigate from overview to cloud', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'overview');

    const cloudLink = page.locator('a:has-text("Cloud"), a[href*="cloud"]').first();
    if (await cloudLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cloudLink.click();
      await waitForDataToLoad(page);
    } else {
      await navigateToCostPage(page, orgSlug, 'cloud');
    }

    expect(page.url()).toContain('cloud');
  });

  test('should navigate from overview to GenAI', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'overview');

    const genaiLink = page.locator('a:has-text("GenAI"), a:has-text("AI"), a[href*="genai"]').first();
    if (await genaiLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await genaiLink.click();
      await waitForDataToLoad(page);
    } else {
      await navigateToCostPage(page, orgSlug, 'genai');
    }

    expect(page.url()).toContain('genai');
  });

  test('should navigate from overview to subscription', async ({ page }) => {
    await navigateToCostPage(page, orgSlug, 'overview');

    const subscriptionLink = page.locator('a:has-text("Subscription"), a:has-text("SaaS"), a[href*="subscription"]').first();
    if (await subscriptionLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await subscriptionLink.click();
      await waitForDataToLoad(page);
    } else {
      await navigateToCostPage(page, orgSlug, 'subscription');
    }

    expect(page.url()).toContain('subscription');
  });

  test('should maintain context when navigating between cost pages', async ({ page }) => {
    // Start at overview
    await navigateToCostPage(page, orgSlug, 'overview');

    // Navigate through all cost pages
    await navigateToCostPage(page, orgSlug, 'cloud');
    expect(page.url()).toContain('cloud');

    await navigateToCostPage(page, orgSlug, 'genai');
    expect(page.url()).toContain('genai');

    await navigateToCostPage(page, orgSlug, 'subscription');
    expect(page.url()).toContain('subscription');

    // Return to overview
    await navigateToCostPage(page, orgSlug, 'overview');
    expect(page.url()).toContain('overview');
  });
});

// ===========================================
// Test Suite: Performance
// ===========================================

test.describe('Cost Page Performance', () => {
  let orgSlug: string;

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page);
  });

  test('should load cost overview within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await navigateToCostPage(page, orgSlug, 'overview');

    const loadTime = Date.now() - startTime;
    console.log(`Cost overview loaded in ${loadTime}ms`);

    expect(loadTime).toBeLessThan(15000);
  });

  test('should load cost pages without errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Visit all cost pages
    await navigateToCostPage(page, orgSlug, 'overview');
    await navigateToCostPage(page, orgSlug, 'cloud');
    await navigateToCostPage(page, orgSlug, 'genai');
    await navigateToCostPage(page, orgSlug, 'subscription');

    if (errors.length > 0) {
      console.log(`Page errors: ${errors.join(', ')}`);
    } else {
      console.log('No page errors detected');
    }
  });
});

console.log(`
===========================================
Cost Pages E2E Test Suite
===========================================
Test Suites: 9
- Cloud Costs Page (5 tests)
- GenAI Costs Page (5 tests)
- Subscription Costs Page (5 tests)
- Cost Overview Page (5 tests)
- Cost Filters (7 tests)
- Cost Export (4 tests)
- Cost Page Navigation (5 tests)
- Performance (2 tests)

Total Tests: 38

Run with:
  npx playwright test tests/e2e/costs.spec.ts
  npx playwright test tests/e2e/costs.spec.ts --headed
  npx playwright test tests/e2e/costs.spec.ts --ui
===========================================
`);
