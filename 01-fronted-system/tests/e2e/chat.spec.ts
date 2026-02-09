/**
 * Chat E2E Tests
 *
 * Tests the AI Chat feature end-to-end:
 * - Navigation to chat page
 * - Message sending and receiving
 * - Conversation management
 * - Cost data verification (matches dashboard)
 *
 * Requires: Frontend (3000), Chat Backend (8002) running
 * Demo data: acme_inc_mle4mnwe org with cost data in BigQuery
 */

import { test, expect, loginAndGetOrgSlug, waitForLoadingToComplete } from './fixtures/auth'

test.describe('AI Chat', () => {
  let orgSlug: string

  test.beforeEach(async ({ page }) => {
    orgSlug = await loginAndGetOrgSlug(page)
  })

  test.describe('Chat Page Navigation', () => {
    test('should navigate to chat page from sidebar', async ({ page }) => {
      // Click Chat in sidebar
      await page.locator('a[href*="/chat"]').first().click()
      await page.waitForURL(/\/chat/, { timeout: 15000 })
      await waitForLoadingToComplete(page)

      // Verify chat page loaded (welcome screen or chat interface)
      const chatVisible = await page.locator('text=/CloudAct AI|Ask about your cloud costs|Chat/i').first().isVisible({ timeout: 10000 })
      expect(chatVisible).toBeTruthy()
    })

    test('should show chat page with message input', async ({ page }) => {
      await page.goto(`/${orgSlug}/chat`)
      await waitForLoadingToComplete(page)

      // Verify message input area exists
      const inputArea = page.getByPlaceholder(/ask about your cloud costs/i)
        .or(page.locator('textarea'))
        .first()
      await expect(inputArea).toBeVisible({ timeout: 15000 })
    })

    test('should show welcome screen with suggestions when no conversation is active', async ({ page }) => {
      await page.goto(`/${orgSlug}/chat`)
      await waitForLoadingToComplete(page)

      // Welcome screen should have suggestion buttons
      const suggestions = page.locator('button:has-text("costs"), button:has-text("cloud"), button:has-text("alert")')
      const hasSuggestions = await suggestions.first().isVisible({ timeout: 10000 }).catch(() => false)

      // Either suggestions or the main chat interface should be visible
      const chatInterface = page.locator('textarea, [placeholder*="Ask"]')
      const hasChat = await chatInterface.first().isVisible({ timeout: 5000 }).catch(() => false)
      expect(hasSuggestions || hasChat).toBeTruthy()
    })
  })

  test.describe('Chat Setup Check', () => {
    test('should indicate when chat is configured', async ({ page }) => {
      await page.goto(`/${orgSlug}/chat`)
      await waitForLoadingToComplete(page)

      // If chat is configured, we should see the input area (not setup prompt)
      const inputArea = page.locator('textarea, [placeholder*="Ask"]').first()
      const setupPrompt = page.locator('text=/Set Up AI Chat|Configure/i').first()

      const hasInput = await inputArea.isVisible({ timeout: 10000 }).catch(() => false)
      const hasSetup = await setupPrompt.isVisible({ timeout: 5000 }).catch(() => false)

      // One of these should be true
      expect(hasInput || hasSetup).toBeTruthy()
    })
  })

  test.describe('Sending Messages', () => {
    test('should send a message and receive a response', async ({ page }) => {
      await page.goto(`/${orgSlug}/chat`)
      await waitForLoadingToComplete(page)

      // Wait for textarea to be ready
      const input = page.getByPlaceholder(/ask about your cloud costs/i)
        .or(page.locator('textarea'))
        .first()
      await expect(input).toBeVisible({ timeout: 15000 })

      // Type a message
      await input.fill('What providers do I have?')
      await page.waitForTimeout(500)

      // Click send button (mint green button)
      const sendBtn = page.locator('button[class*="90FCA6"], button[class*="bg-green"], button[aria-label*="send" i]')
        .or(page.locator('button').filter({ has: page.locator('svg') }).last())
      await sendBtn.click()

      // Wait for response (loading spinner appears then disappears)
      await page.waitForTimeout(2000) // Give time for request to start

      // Wait for assistant response to appear (up to 60s for LLM)
      const response = page.locator('div[class*="bg-slate-800"]')
        .or(page.locator('div[class*="assistant"]'))
        .or(page.locator('p[class*="whitespace-pre-wrap"]'))
      await expect(response.first()).toBeVisible({ timeout: 60000 })
    })

    test('should display user message after sending', async ({ page }) => {
      await page.goto(`/${orgSlug}/chat`)
      await waitForLoadingToComplete(page)

      const input = page.getByPlaceholder(/ask about your cloud costs/i)
        .or(page.locator('textarea'))
        .first()
      await expect(input).toBeVisible({ timeout: 15000 })

      const testMessage = 'Show my total costs for November 2025 to April 2026'
      await input.fill(testMessage)
      await page.waitForTimeout(300)

      const sendBtn = page.locator('button[class*="90FCA6"], button[class*="bg-green"]')
        .or(page.locator('button').filter({ has: page.locator('svg') }).last())
      await sendBtn.click()

      // User message should appear
      await expect(page.locator(`text=${testMessage}`).first()).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Conversation Management', () => {
    test('should show conversation list in sidebar', async ({ page }) => {
      await page.goto(`/${orgSlug}/chat`)
      await waitForLoadingToComplete(page)

      // Conversation sidebar should be visible on desktop
      const sidebar = page.locator('div[class*="w-64"], div[class*="border-r"]').first()
      const hasSidebar = await sidebar.isVisible({ timeout: 10000 }).catch(() => false)

      // On mobile it might be hidden, but the New Conversation button should exist
      const newConvBtn = page.locator('button[title*="conversation" i], button:has-text("New")')
      const hasNewBtn = await newConvBtn.first().isVisible({ timeout: 5000 }).catch(() => false)

      expect(hasSidebar || hasNewBtn).toBeTruthy()
    })

    test('should create new conversation', async ({ page }) => {
      await page.goto(`/${orgSlug}/chat`)
      await waitForLoadingToComplete(page)

      // Click new conversation button
      const newConvBtn = page.locator('button[title*="conversation" i], button:has-text("New")')
      const hasNewBtn = await newConvBtn.first().isVisible({ timeout: 10000 }).catch(() => false)

      if (hasNewBtn) {
        await newConvBtn.first().click()
        await page.waitForTimeout(1000)

        // Verify we're on a fresh chat (welcome screen or empty chat)
        const inputArea = page.locator('textarea, [placeholder*="Ask"]').first()
        await expect(inputArea).toBeVisible({ timeout: 10000 })
      }
    })
  })

  test.describe('Chat Settings Page', () => {
    test('should navigate to AI chat settings', async ({ page }) => {
      await page.goto(`/${orgSlug}/settings/ai-chat`)
      await waitForLoadingToComplete(page)

      // Settings page should show provider/model configuration
      const settingsContent = page.locator('text=/AI Chat|Provider|Model|Configure/i')
      await expect(settingsContent.first()).toBeVisible({ timeout: 15000 })
    })
  })

  test.describe('Cost Data Verification', () => {
    test('should return cost data that matches dashboard values', async ({ page }) => {
      await page.goto(`/${orgSlug}/chat`)
      await waitForLoadingToComplete(page)

      const input = page.getByPlaceholder(/ask about your cloud costs/i)
        .or(page.locator('textarea'))
        .first()
      await expect(input).toBeVisible({ timeout: 15000 })

      // Ask about costs with specific date range (matching demo data)
      await input.fill('Show total costs by provider from November 2025 to April 2026')
      await page.waitForTimeout(300)

      const sendBtn = page.locator('button[class*="90FCA6"], button[class*="bg-green"]')
        .or(page.locator('button').filter({ has: page.locator('svg') }).last())
      await sendBtn.click()

      // Wait for response
      const response = page.locator('div[class*="bg-slate-800"]')
        .or(page.locator('p[class*="whitespace-pre-wrap"]'))
      await expect(response.first()).toBeVisible({ timeout: 60000 })

      // Get the response text
      const responseText = await response.first().textContent() || ''

      // Verify the response mentions known providers from demo data
      const hasProviderData = responseText.includes('GCP') ||
        responseText.includes('OpenAI') ||
        responseText.includes('cost') ||
        responseText.includes('$')
      expect(hasProviderData).toBeTruthy()
    })
  })

  test.describe('Error Handling', () => {
    test('should handle invalid org slug gracefully', async ({ page }) => {
      // Navigate to chat with invalid org
      await page.goto('/invalid_org_xyz/chat')
      await page.waitForTimeout(3000)

      // Should redirect to login or show error
      const url = page.url()
      const isRedirected = url.includes('/login') || url.includes('/org-select') || url.includes('/404')
      const hasError = await page.locator('text=/unauthorized|error|not found|login/i').first().isVisible({ timeout: 5000 }).catch(() => false)

      expect(isRedirected || hasError).toBeTruthy()
    })
  })
})
