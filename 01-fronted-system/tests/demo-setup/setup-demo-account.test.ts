/**
 * Demo Account Setup Test
 *
 * Creates a demo account via browser automation.
 * Run with: npx vitest run tests/demo-setup/setup-demo-account.test.ts
 *
 * Environment:
 *   DEMO_EMAIL - Account email (default: acme_demo@example.com)
 *   DEMO_COMPANY - Company name (default: Acme Inc)
 *   DEMO_PLAN - Plan to select (default: starter)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { chromium, Browser, Page } from 'playwright'

// Demo account configuration
const config = {
    email: process.env.DEMO_EMAIL || 'demo@acme-inc.com',
    password: process.env.DEMO_PASSWORD || 'acme1234',
    phone: '5551234567',
    countryCode: '+1',
    companyName: process.env.DEMO_COMPANY || 'Acme Inc',
    companyType: 'Company',
    currency: '$ USD',
    timezone: 'PST/PDT - Los Angeles, USA',
    plan: (process.env.DEMO_PLAN || 'starter') as 'starter' | 'professional' | 'scale',
}

const testConfig = {
    baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
    headless: process.env.TEST_HEADLESS !== 'false',
    timeout: 60000,
}

describe('Demo Account Setup', () => {
    let browser: Browser
    let page: Page

    beforeAll(async () => {
        browser = await chromium.launch({
            headless: testConfig.headless,
        })
        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
        })
        page = await context.newPage()

        // Listen to console messages
        page.on('console', msg => console.log(`BROWSER: ${msg.text()}`))
        page.on('pageerror', err => console.error(`PAGE ERROR: ${err.message}`))
    }, testConfig.timeout)

    afterAll(async () => {
        if (browser) {
            await browser.close()
        }
    })

    it('should create demo account via signup flow', async () => {
        console.log('\n📧 Creating demo account:')
        console.log(`   Email: ${config.email}`)
        console.log(`   Company: ${config.companyName}`)
        console.log(`   Plan: ${config.plan}`)

        // Step 1: Navigate to signup
        console.log('\n[1/5] Navigating to signup page...')
        await page.goto(`${testConfig.baseUrl}/signup`)
        await page.waitForSelector('input[placeholder="you@company.com"]', { timeout: 10000 })
        expect(page.url()).toContain('/signup')

        // Step 2: Fill account details
        console.log('[2/5] Filling account details...')
        await page.fill('input[placeholder="you@company.com"]', config.email)
        await page.fill('input[placeholder="Min 8 characters"]', config.password)
        await page.fill('input[id="phone"]', config.phone)

        // Wait a bit for any validation
        await page.waitForTimeout(1000)

        // Check for any error messages before clicking
        const errorText = await page.textContent('body')
        if (errorText?.includes('already') || errorText?.includes('exists')) {
            console.log('⚠️  User may already exist, continuing anyway...')
        }

        // Click continue and wait for navigation
        try {
            await page.click('button:has-text("Continue")')
            await page.waitForSelector('text=Set up organization', { timeout: 15000 })
        } catch (error) {
            // Take screenshot on failure
            await page.screenshot({ path: 'tests/demo-setup/error-screenshot-' + Date.now() + '.png' })
            const html = await page.content()
            console.log('Current page HTML length:', html.length)
            throw error
        }

        // Step 3: Fill organization details
        console.log('[3/5] Filling organization details...')
        await page.fill('input[placeholder="Acme Inc."]', config.companyName)
        await page.selectOption('select:near(:text("Company type"))', config.companyType)
        await page.selectOption('select:near(:text("Currency"))', config.currency)
        await page.selectOption('select:near(:text("Timezone"))', config.timezone)
        await page.click('button:has-text("Create account")')

        // Wait for billing page
        console.log('[4/5] Waiting for billing page...')
        await page.waitForURL('**/onboarding/billing', { timeout: 30000 })
        expect(page.url()).toContain('/onboarding/billing')

        // Step 4: Select plan
        console.log(`[5/5] Selecting ${config.plan} plan...`)
        await page.waitForSelector('text=Choose your plan', { timeout: 10000 })

        const planButtons = await page.$$('button:has-text("Select Plan")')
        const planIndex = config.plan === 'starter' ? 0 : config.plan === 'professional' ? 1 : 2

        if (planButtons[planIndex]) {
            await planButtons[planIndex].click()
        }

        // Wait for Continue button
        await page.waitForSelector('button:has-text("Continue to Checkout")', { timeout: 5000 })
        await page.click('button:has-text("Continue to Checkout")')

        // Wait for redirect
        await page.waitForTimeout(3000)

        const finalUrl = page.url()
        console.log(`\n✅ Demo account created!`)
        console.log(`   Final URL: ${finalUrl}`)

        if (finalUrl.includes('checkout.stripe.com')) {
            console.log('   Status: Awaiting Stripe checkout')
            console.log('   Test Card: 4242 4242 4242 4242')
        } else if (finalUrl.includes('/dashboard')) {
            console.log('   Status: Onboarding complete!')
        }

        // Success if we made it this far
        expect(true).toBe(true)
    }, testConfig.timeout)
})
