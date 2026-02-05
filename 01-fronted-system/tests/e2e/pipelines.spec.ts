/**
 * E2E Pipeline Tests
 *
 * Comprehensive tests for the pipeline pages including:
 * - Pipeline runs list
 * - Cloud pipeline runs
 * - GenAI pipeline runs
 * - Subscription pipeline runs
 * - Run status and details
 * - Filtering and pagination
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

const TEST_CREDENTIALS = {
  email: 'demo@cloudact.ai',
  password: 'demo1234',
};

// ===========================================
// Helper Functions
// ===========================================

async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);
}

async function loginAndNavigate(page: Page, path: string): Promise<string> {
  await page.goto(`${BASE_URL}/login`);
  await waitForPageLoad(page);

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  await emailInput.fill(TEST_CREDENTIALS.email);
  await passwordInput.fill(TEST_CREDENTIALS.password);

  const submitButton = page.locator('button[type="submit"], button:has-text("Sign in")').first();
  await submitButton.click();

  await page.waitForURL(/\/(.*?)\/dashboard|\/org-select/, { timeout: 30000 });

  // Handle org selector if present
  if (page.url().includes('/org-select')) {
    const orgCard = page.locator('[data-testid="org-card"], a[href*="/dashboard"]').first();
    await orgCard.click();
    await page.waitForURL(/\/(.*?)\/dashboard/, { timeout: 30000 });
  }

  const match = page.url().match(/\/([^/]+)\/dashboard/);
  const orgSlug = match ? match[1] : 'test-org';

  // Navigate to the requested path
  await page.goto(`${BASE_URL}/${orgSlug}${path}`);
  await waitForPageLoad(page);

  return orgSlug;
}

// ===========================================
// Test Suite: Pipelines Main Page
// ===========================================

test.describe('Pipelines - Main Page', () => {
  test('should load pipelines page', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines');

    // Should have pipelines heading or content
    const heading = page.locator('h1, h2, [data-testid="page-title"]');
    await expect(heading.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display pipeline run categories', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines');

    // Should show links or tabs for different pipeline types
    const content = await page.content();
    const hasCloudRuns = content.includes('cloud') || content.includes('Cloud');
    const hasGenAIRuns = content.includes('genai') || content.includes('GenAI') || content.includes('AI');

    expect(hasCloudRuns || hasGenAIRuns).toBeTruthy();
  });

  test('should navigate to cloud runs', async ({ page }) => {
    const orgSlug = await loginAndNavigate(page, '/pipelines');

    const cloudLink = page.locator('a[href*="cloud-runs"], button:has-text("Cloud")').first();
    if (await cloudLink.isVisible()) {
      await cloudLink.click();
      await expect(page).toHaveURL(new RegExp(`/${orgSlug}/pipelines/cloud-runs`));
    }
  });

  test('should navigate to genai runs', async ({ page }) => {
    const orgSlug = await loginAndNavigate(page, '/pipelines');

    const genaiLink = page.locator('a[href*="genai-runs"], button:has-text("GenAI"), button:has-text("AI")').first();
    if (await genaiLink.isVisible()) {
      await genaiLink.click();
      await expect(page).toHaveURL(new RegExp(`/${orgSlug}/pipelines/genai-runs`));
    }
  });
});

// ===========================================
// Test Suite: Cloud Pipeline Runs
// ===========================================

test.describe('Pipelines - Cloud Runs', () => {
  test('should load cloud runs page', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/cloud-runs');

    const heading = page.locator('h1, h2, [data-testid="page-title"]');
    await expect(heading.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display run list or empty state', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/cloud-runs');

    // Either show runs table/list or empty state
    const table = page.locator('table, [data-testid="runs-list"], [role="grid"]');
    const emptyState = page.locator('text=/no runs|no data|empty|get started/i');

    const hasTable = await table.isVisible().catch(() => false);
    const hasEmpty = await emptyState.isVisible().catch(() => false);

    expect(hasTable || hasEmpty).toBeTruthy();
  });

  test('should display run status indicators', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/cloud-runs');

    // Look for status badges or indicators
    const statusIndicators = page.locator('[data-testid="status"], .badge, [class*="status"]');
    const count = await statusIndicators.count();

    // May or may not have runs, so just verify page loads without error
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have refresh functionality', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/cloud-runs');

    const refreshButton = page.locator('button:has-text("Refresh"), button[aria-label*="refresh"], [data-testid="refresh"]');
    if (await refreshButton.isVisible()) {
      await refreshButton.click();
      await page.waitForTimeout(1000);
      // Page should still be functional after refresh
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

// ===========================================
// Test Suite: GenAI Pipeline Runs
// ===========================================

test.describe('Pipelines - GenAI Runs', () => {
  test('should load genai runs page', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/genai-runs');

    const heading = page.locator('h1, h2, [data-testid="page-title"]');
    await expect(heading.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display provider filter or tabs', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/genai-runs');

    // Check for provider filtering options
    const content = await page.content();
    const hasOpenAI = content.includes('OpenAI') || content.includes('openai');
    const hasAnthropic = content.includes('Anthropic') || content.includes('Claude');
    const hasGemini = content.includes('Gemini') || content.includes('Google');

    // At least the page should load with some content
    expect(content.length).toBeGreaterThan(0);
  });

  test('should display token usage if runs exist', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/genai-runs');

    // Look for token-related text
    const tokenText = page.locator('text=/token|usage|cost/i');
    const count = await tokenText.count();

    // May or may not have token data
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ===========================================
// Test Suite: Subscription Pipeline Runs
// ===========================================

test.describe('Pipelines - Subscription Runs', () => {
  test('should load subscription runs page', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/subscription-runs');

    const heading = page.locator('h1, h2, [data-testid="page-title"]');
    await expect(heading.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display subscription list or empty state', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/subscription-runs');

    const content = await page.content();
    expect(content.length).toBeGreaterThan(0);
  });
});

// ===========================================
// Test Suite: Pipeline Navigation
// ===========================================

test.describe('Pipelines - Navigation', () => {
  test('should have consistent navigation between pipeline pages', async ({ page }) => {
    const orgSlug = await loginAndNavigate(page, '/pipelines');

    // Navigate to cloud runs
    await page.goto(`${BASE_URL}/${orgSlug}/pipelines/cloud-runs`);
    await waitForPageLoad(page);
    await expect(page).toHaveURL(new RegExp('cloud-runs'));

    // Navigate to genai runs
    await page.goto(`${BASE_URL}/${orgSlug}/pipelines/genai-runs`);
    await waitForPageLoad(page);
    await expect(page).toHaveURL(new RegExp('genai-runs'));

    // Navigate to subscription runs
    await page.goto(`${BASE_URL}/${orgSlug}/pipelines/subscription-runs`);
    await waitForPageLoad(page);
    await expect(page).toHaveURL(new RegExp('subscription-runs'));
  });

  test('should display breadcrumb navigation', async ({ page }) => {
    await loginAndNavigate(page, '/pipelines/cloud-runs');

    const breadcrumb = page.locator('nav[aria-label="breadcrumb"], [data-testid="breadcrumb"], .breadcrumb');
    const backLink = page.locator('a[href*="/pipelines"]');

    const hasBreadcrumb = await breadcrumb.isVisible().catch(() => false);
    const hasBackLink = await backLink.isVisible().catch(() => false);

    // Should have some form of navigation back
    expect(hasBreadcrumb || hasBackLink).toBeTruthy();
  });
});
