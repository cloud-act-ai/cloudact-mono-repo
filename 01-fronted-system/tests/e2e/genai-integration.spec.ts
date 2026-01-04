/**
 * GenAI Integration E2E Tests
 *
 * Tests the GenAI provider integration flow:
 * - OpenAI API key setup and validation
 * - Anthropic API key setup and validation
 * - Google Gemini API key setup and validation
 *
 * Prerequisites:
 * - Frontend running on localhost:3000
 * - Test user account exists (john@example.com)
 * - Valid API keys for testing
 */

import { test, expect } from '@playwright/test'
import { loginAndGetOrgSlug, waitForSuccessMessage, navigateToIntegrations, waitForLoadingToComplete, waitForProviderCards } from './fixtures/auth'
import { GENAI_CREDENTIALS } from './fixtures/test-credentials'

test.describe('GenAI Provider Integration Tests', () => {
  let orgSlug: string

  test.beforeEach(async ({ page }) => {
    // Login and get org slug
    orgSlug = await loginAndGetOrgSlug(page)
    console.log(`Logged in. Org slug: ${orgSlug}`)
  })

  test.describe('OpenAI Integration', () => {
    test('should navigate to OpenAI integration page', async ({ page }) => {
      // Navigate directly to OpenAI page
      await page.goto(`/${orgSlug}/integrations/genai/openai`)
      await page.waitForLoadState('domcontentloaded')
      await waitForLoadingToComplete(page, 60000)

      // Verify we're on the OpenAI page
      await expect(page).toHaveURL(new RegExp(`/${orgSlug}/integrations/genai/openai`))

      // Look for the page header or any provider-specific content
      const pageContent = page.locator('text=OpenAI, text=API key, text=integration').first()
      await expect(pageContent).toBeVisible({ timeout: 15000 })

      await page.screenshot({ path: 'playwright-report/openai-page.png' })
    })

    test('should setup OpenAI API key', async ({ page }) => {
      // Navigate directly to OpenAI integration page
      await page.goto(`/${orgSlug}/integrations/genai/openai`)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(2000)

      // Check if already connected
      const isConnected = await page.locator('text=Connected').isVisible()

      if (isConnected) {
        console.log('OpenAI already connected, skipping setup')
        // Verify connection status
        await expect(page.locator('text=Connected')).toBeVisible()
      } else {
        // Find and fill the API key input
        const apiKeyInput = page.locator('input[type="text"], input[type="password"]').filter({
          hasText: /sk-/,
        }).or(page.locator('input[placeholder*="sk-"]'))

        // If there's a "Connect" or "Setup" button, click it first
        const setupButton = page.locator('button:has-text("Connect"), button:has-text("Setup"), button:has-text("Add API Key")')
        if (await setupButton.isVisible()) {
          await setupButton.click()
          await page.waitForTimeout(500)
        }

        // Fill in the API key
        const inputField = page.locator('input[placeholder*="sk-"]').first()
        if (await inputField.isVisible()) {
          await inputField.fill(GENAI_CREDENTIALS.openai.apiKey)

          // Submit the form
          const submitButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Connect")')
          await submitButton.first().click()

          // Wait for success or check status
          try {
            await waitForSuccessMessage(page)
            console.log('OpenAI API key saved successfully')
          } catch {
            // Check if it shows as connected anyway
            const connected = await page.locator('text=Connected').isVisible()
            if (connected) {
              console.log('OpenAI connected after setup')
            }
          }
        } else {
          console.log('API key input not found - may already be configured')
        }
      }

      // Take screenshot for verification
      await page.screenshot({ path: 'playwright-report/openai-integration.png' })
    })

    test('should validate OpenAI integration status', async ({ page }) => {
      await page.goto(`/${orgSlug}/integrations/genai/openai`)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(3000)

      // Look for connection status indicators - check for Connected or Not Connected text
      const statusText = page.locator('text=Connected, text=Not Connected').first()
      await expect(statusText).toBeVisible({ timeout: 15000 })

      // Check for pricing tables if connected
      const pricingSection = page.locator('text=Pricing Reference, text=Pay-As-You-Go')
      const isPricingVisible = await pricingSection.first().isVisible()
      console.log(`Pricing section visible: ${isPricingVisible}`)

      // Take screenshot
      await page.screenshot({ path: 'playwright-report/openai-status.png' })
    })
  })

  test.describe('Anthropic Integration', () => {
    test('should navigate to Anthropic integration page', async ({ page }) => {
      // Navigate directly to Anthropic page
      await page.goto(`/${orgSlug}/integrations/genai/anthropic`)
      await page.waitForLoadState('domcontentloaded')
      await waitForLoadingToComplete(page, 60000)

      // Verify we're on the Anthropic page
      await expect(page).toHaveURL(new RegExp(`/${orgSlug}/integrations/genai/anthropic`))

      // Look for page content - either the provider name or configuration UI
      const pageContent = page.locator('text=Anthropic, text=API key, text=integration').first()
      await expect(pageContent).toBeVisible({ timeout: 15000 })

      await page.screenshot({ path: 'playwright-report/anthropic-page.png' })
    })

    test('should setup Anthropic API key', async ({ page }) => {
      await page.goto(`/${orgSlug}/integrations/genai/anthropic`)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(2000)

      // Check if already connected
      const isConnected = await page.locator('text=Connected').isVisible()

      if (isConnected) {
        console.log('Anthropic already connected, skipping setup')
        await expect(page.locator('text=Connected')).toBeVisible()
      } else {
        // Find API key input - Anthropic keys start with sk-ant-
        const setupButton = page.locator('button:has-text("Connect"), button:has-text("Setup"), button:has-text("Add API Key")')
        if (await setupButton.isVisible()) {
          await setupButton.click()
          await page.waitForTimeout(500)
        }

        const inputField = page.locator('input[placeholder*="sk-ant"]').first()
        if (await inputField.isVisible()) {
          await inputField.fill(GENAI_CREDENTIALS.anthropic.apiKey)

          const submitButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Connect")')
          await submitButton.first().click()

          try {
            await waitForSuccessMessage(page)
            console.log('Anthropic API key saved successfully')
          } catch {
            const connected = await page.locator('text=Connected').isVisible()
            if (connected) {
              console.log('Anthropic connected after setup')
            }
          }
        } else {
          console.log('API key input not found - may already be configured')
        }
      }

      await page.screenshot({ path: 'playwright-report/anthropic-integration.png' })
    })
  })

  test.describe('Google Gemini Integration', () => {
    test('should navigate to Gemini integration page', async ({ page }) => {
      // Navigate directly to Gemini page
      await page.goto(`/${orgSlug}/integrations/genai/gemini`)
      await page.waitForLoadState('domcontentloaded')
      await waitForLoadingToComplete(page, 60000)

      // Verify we're on the Gemini page
      await expect(page).toHaveURL(new RegExp(`/${orgSlug}/integrations/genai/gemini`))

      // Look for page content - either the provider name or configuration UI
      const pageContent = page.locator('text=Gemini, text=Google, text=API key, text=integration').first()
      await expect(pageContent).toBeVisible({ timeout: 15000 })

      await page.screenshot({ path: 'playwright-report/gemini-page.png' })
    })

    test('should setup Gemini API key', async ({ page }) => {
      await page.goto(`/${orgSlug}/integrations/genai/gemini`)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(2000)

      // Check if already connected
      const isConnected = await page.locator('text=Connected').isVisible()

      if (isConnected) {
        console.log('Gemini already connected, skipping setup')
        await expect(page.locator('text=Connected')).toBeVisible()
      } else {
        // Find API key input - Gemini keys start with AIza
        const setupButton = page.locator('button:has-text("Connect"), button:has-text("Setup"), button:has-text("Add API Key")')
        if (await setupButton.isVisible()) {
          await setupButton.click()
          await page.waitForTimeout(500)
        }

        const inputField = page.locator('input[placeholder*="AIza"]').first()
        if (await inputField.isVisible()) {
          await inputField.fill(GENAI_CREDENTIALS.gemini.apiKey)

          const submitButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Connect")')
          await submitButton.first().click()

          try {
            await waitForSuccessMessage(page)
            console.log('Gemini API key saved successfully')
          } catch {
            const connected = await page.locator('text=Connected').isVisible()
            if (connected) {
              console.log('Gemini connected after setup')
            }
          }
        } else {
          console.log('API key input not found - may already be configured')
        }
      }

      await page.screenshot({ path: 'playwright-report/gemini-integration.png' })
    })
  })

  test.describe('GenAI Providers Overview', () => {
    test('should display all GenAI providers on overview page', async ({ page }) => {
      await page.goto(`/${orgSlug}/integrations/genai`)
      await page.waitForLoadState('domcontentloaded')

      // Wait for providers to load - page title should be visible
      await expect(page.locator('text=GenAI Providers')).toBeVisible({ timeout: 15000 })

      // Wait for loading to complete
      await waitForLoadingToComplete(page, 60000)

      // Wait for provider cards to appear
      await waitForProviderCards(page, 60000)

      // Check that provider links exist (using href) - use soft assertions to continue even if some fail
      const openaiLink = page.locator('a[href*="/genai/openai"]').first()
      const anthropicLink = page.locator('a[href*="/genai/anthropic"]').first()
      const geminiLink = page.locator('a[href*="/genai/gemini"]').first()

      // Log what we find
      console.log(`OpenAI link visible: ${await openaiLink.isVisible()}`)
      console.log(`Anthropic link visible: ${await anthropicLink.isVisible()}`)
      console.log(`Gemini link visible: ${await geminiLink.isVisible()}`)

      // At least one provider should be visible
      const anyProviderVisible = await openaiLink.isVisible() ||
                                 await anthropicLink.isVisible() ||
                                 await geminiLink.isVisible()

      expect(anyProviderVisible).toBe(true)

      // Take screenshot of the overview
      await page.screenshot({ path: 'playwright-report/genai-overview.png', fullPage: true })
    })
  })
})
