/**
 * Demo Account Configuration
 *
 * Configuration for setting up demo accounts via browser automation
 */

export interface DemoAccountConfig {
    email: string
    password: string
    phone: string
    countryCode: string
    companyName: string
    companyType: 'Personal' | 'Startup' | 'Agency' | 'Company' | 'Educational'
    currency: string
    timezone: string
    plan: 'starter' | 'professional' | 'scale'
}

// Default demo account configuration
export const DEFAULT_DEMO_ACCOUNT: DemoAccountConfig = {
    email: 'john@example.com',
    password: 'acme1234',
    phone: '5551234567',
    countryCode: '+1',
    companyName: 'Acme Inc',
    companyType: 'Company',
    currency: '$ USD',
    timezone: 'PST/PDT - Los Angeles, USA',
    plan: 'starter',
}

// Test environment configuration
export const TEST_CONFIG = {
    baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
    apiServiceUrl: process.env.API_SERVICE_URL || 'http://localhost:8000',
    pipelineServiceUrl: process.env.PIPELINE_SERVICE_URL || 'http://localhost:8001',
    timeout: parseInt(process.env.TEST_TIMEOUT || '60000'),
    headless: process.env.TEST_HEADLESS !== 'false',
    slowMo: parseInt(process.env.TEST_SLOW_MO || '0'),
}

// Stripe test card for checkout (if needed)
export const STRIPE_TEST_CARD = {
    number: '4242424242424242',
    expiry: '12/30',
    cvc: '123',
    zip: '94086',
}

// Plan selectors for billing page
export const PLAN_SELECTORS = {
    starter: 'button:has-text("Select Plan"):first-of-type',
    professional: 'button:has-text("Select Plan"):nth-of-type(2)',
    scale: 'button:has-text("Select Plan"):last-of-type',
}
