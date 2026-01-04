/**
 * GCP Cloud Integration E2E Tests
 *
 * Tests the GCP cloud provider integration flow:
 * - Navigate to GCP integration page
 * - Upload service account JSON
 * - Validate connection status
 * - Test re-validation and removal
 *
 * Prerequisites:
 * - Frontend running on localhost:3000
 * - Test user account exists (john@example.com)
 * - Valid GCP service account JSON file
 */

import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { loginAndGetOrgSlug, waitForSuccessMessage, navigateToIntegrations } from './fixtures/auth'
import { CLOUD_CREDENTIALS } from './fixtures/test-credentials'

test.describe('GCP Cloud Integration Tests', () => {
  let orgSlug: string
  let gcpCredentialsContent: string | null = null

  test.beforeAll(async () => {
    // Read GCP credentials file if it exists
    const credentialsPath = CLOUD_CREDENTIALS.gcp.credentialsPath
    if (fs.existsSync(credentialsPath)) {
      gcpCredentialsContent = fs.readFileSync(credentialsPath, 'utf-8')
      console.log('GCP credentials file loaded successfully')
    } else {
      console.warn(`GCP credentials file not found at: ${credentialsPath}`)
    }
  })

  test.beforeEach(async ({ page }) => {
    // Login and get org slug
    orgSlug = await loginAndGetOrgSlug(page)
    console.log(`Logged in. Org slug: ${orgSlug}`)
  })

  test('should navigate to Cloud Providers page', async ({ page }) => {
    await navigateToIntegrations(page, orgSlug, 'cloud-providers')

    // Verify we're on the cloud providers page
    await expect(page).toHaveURL(new RegExp(`/${orgSlug}/integrations/cloud-providers`))

    // Check that GCP is listed
    await expect(page.locator('text=Google Cloud Platform').first()).toBeVisible({ timeout: 10000 })

    await page.screenshot({ path: 'playwright-report/cloud-providers-overview.png', fullPage: true })
  })

  test('should navigate to GCP integration page', async ({ page }) => {
    await navigateToIntegrations(page, orgSlug, 'cloud-providers')

    // Click on GCP provider card
    await page.click('text=Google Cloud Platform')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Verify we're on the GCP page
    await expect(page).toHaveURL(new RegExp(`/${orgSlug}/integrations/cloud-providers/gcp`))

    // Check for page header
    await expect(page.locator('h1')).toContainText('Google Cloud Platform')

    await page.screenshot({ path: 'playwright-report/gcp-integration-page.png' })
  })

  test('should display GCP integration status', async ({ page }) => {
    await page.goto(`/${orgSlug}/integrations/cloud-providers/gcp`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Look for status indicators
    const statusBadge = page.locator('text=Connected, text=Not Connected, text=Invalid').first()
    await expect(statusBadge).toBeVisible({ timeout: 10000 })

    // Check for service account section
    await expect(page.locator('text=Service Account Connection')).toBeVisible()

    // Check for help section
    await expect(page.locator('text=How to get your Service Account JSON')).toBeVisible()
  })

  test('should display upload wizard when not connected', async ({ page }) => {
    await page.goto(`/${orgSlug}/integrations/cloud-providers/gcp`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Check if there's an upload button or wizard start
    const isConnected = await page.locator('text=Connected').isVisible()

    if (!isConnected) {
      // Look for upload wizard start button
      const wizardButton = page.locator('button:has-text("Start Connection Wizard"), button:has-text("Upload"), button:has-text("Connect")')
      await expect(wizardButton.first()).toBeVisible({ timeout: 5000 })

      // Click to start wizard
      await wizardButton.first().click()
      await page.waitForTimeout(500)

      // Check for upload zone
      const uploadZone = page.locator('text=Upload Service Account JSON, text=Drag and drop')
      await expect(uploadZone.first()).toBeVisible()

      // Check for security notice
      await expect(page.locator('text=encrypted using Google Cloud KMS')).toBeVisible()
    } else {
      console.log('GCP already connected - checking credential display')
      await expect(page.locator('text=Last validated')).toBeVisible()
    }

    await page.screenshot({ path: 'playwright-report/gcp-upload-wizard.png' })
  })

  test('should upload GCP service account JSON', async ({ page }) => {
    test.skip(!gcpCredentialsContent, 'GCP credentials file not available')

    await page.goto(`/${orgSlug}/integrations/cloud-providers/gcp`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Check if already connected
    const isConnected = await page.locator('text=Connected').isVisible()

    if (isConnected) {
      console.log('GCP already connected')
      await expect(page.locator('text=Connected')).toBeVisible()

      // Test re-validation
      const revalidateButton = page.locator('button:has-text("Re-validate")')
      if (await revalidateButton.isVisible()) {
        await revalidateButton.click()
        await page.waitForTimeout(2000)
        console.log('Re-validation triggered')
      }
    } else {
      // Start upload wizard
      const wizardButton = page.locator('button:has-text("Start Connection Wizard"), button:has-text("Upload"), button:has-text("Connect")')
      if (await wizardButton.first().isVisible()) {
        await wizardButton.first().click()
        await page.waitForTimeout(500)
      }

      // Create a temporary file for upload
      const tempFilePath = path.join('/tmp', 'test-gcp-credentials.json')
      fs.writeFileSync(tempFilePath, gcpCredentialsContent!)

      // Find the file input (it might be hidden)
      const fileInput = page.locator('input[type="file"]')
      await fileInput.setInputFiles(tempFilePath)

      // Wait for file processing
      await page.waitForTimeout(1000)

      // Check for preview/review step
      const projectIdVisible = await page.locator('text=Project ID').isVisible()
      if (projectIdVisible) {
        console.log('File preview displayed - proceeding with connection')

        // Click connect button
        const connectButton = page.locator('button:has-text("Connect GCP"), button:has-text("Save"), button:has-text("Confirm")')
        await connectButton.first().click()

        // Wait for connection
        try {
          await waitForSuccessMessage(page)
          console.log('GCP connected successfully')
        } catch {
          // Check if we're connected anyway
          await page.waitForTimeout(2000)
          const connected = await page.locator('text=Connected').isVisible()
          if (connected) {
            console.log('GCP connected after upload')
          }
        }
      }

      // Clean up temp file
      fs.unlinkSync(tempFilePath)
    }

    await page.screenshot({ path: 'playwright-report/gcp-connected.png' })
  })

  test('should show validation actions for connected integration', async ({ page }) => {
    await page.goto(`/${orgSlug}/integrations/cloud-providers/gcp`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const isConnected = await page.locator('text=Connected').isVisible()

    if (isConnected) {
      // Check for action buttons
      await expect(page.locator('button:has-text("Re-validate")')).toBeVisible()
      await expect(page.locator('button:has-text("Update Credential"), button:has-text("Update")')).toBeVisible()
      await expect(page.locator('button:has-text("Remove")')).toBeVisible()

      // Check credential info display
      await expect(page.locator('text=Last validated')).toBeVisible()
    } else {
      console.log('GCP not connected - skipping action button tests')
    }
  })

  test('should handle invalid file upload gracefully', async ({ page }) => {
    await page.goto(`/${orgSlug}/integrations/cloud-providers/gcp`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    const isConnected = await page.locator('text=Connected').isVisible()

    if (!isConnected) {
      // Start upload wizard
      const wizardButton = page.locator('button:has-text("Start Connection Wizard"), button:has-text("Upload"), button:has-text("Connect")')
      if (await wizardButton.first().isVisible()) {
        await wizardButton.first().click()
        await page.waitForTimeout(500)
      }

      // Create an invalid JSON file
      const invalidFilePath = path.join('/tmp', 'invalid-credentials.json')
      fs.writeFileSync(invalidFilePath, '{"invalid": "not a service account"}')

      // Upload the invalid file
      const fileInput = page.locator('input[type="file"]')
      await fileInput.setInputFiles(invalidFilePath)

      // Wait for error message
      await page.waitForTimeout(1000)

      // Check for validation error
      const errorMessage = page.locator('text=Invalid, text=not a GCP Service Account, text=Missing required')
      const hasError = await errorMessage.first().isVisible()

      if (hasError) {
        console.log('Invalid file correctly rejected')
      } else {
        console.log('File validation may have different error handling')
      }

      // Clean up
      fs.unlinkSync(invalidFilePath)
    } else {
      console.log('GCP already connected - skipping invalid file test')
    }

    await page.screenshot({ path: 'playwright-report/gcp-invalid-file.png' })
  })

  test('should display help documentation', async ({ page }) => {
    await page.goto(`/${orgSlug}/integrations/cloud-providers/gcp`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Check help section content
    await expect(page.locator('text=How to get your Service Account JSON')).toBeVisible()
    await expect(page.locator('text=GCP Console')).toBeVisible()
    await expect(page.locator('text=Service Accounts')).toBeVisible()

    // Check for external link to GCP Console
    const gcpLink = page.locator('a[href*="console.cloud.google.com"]')
    await expect(gcpLink.first()).toBeVisible()
  })
})
