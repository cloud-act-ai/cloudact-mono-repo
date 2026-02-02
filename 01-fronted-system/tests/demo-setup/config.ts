/**
 * Demo Account Configuration
 *
 * Configuration for setting up demo accounts via browser automation
 *
 * ALWAYS use:
 *   - Email: demo@cloudact.ai
 *   - Password: demo1234
 *   - Company: Acme Inc
 */

export interface DemoAccountConfig {
    firstName: string
    lastName: string
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

/**
 * Get timestamp suffix in base36 format
 * Example: "ml01ua8p" for a specific timestamp
 * NOTE: This is for reference only - actual org_slug is generated at signup time
 */
export function getTimestampSuffix(): string {
    return Date.now().toString(36)
}

/**
 * Get org slug pattern (base name without timestamp)
 * NOTE: Full org_slug includes timestamp suffix added at signup
 * Example: "acme_inc" → "acme_inc_ml01ua8p" (at signup time)
 *
 * IMPORTANT: Don't use this to predict org_slug - capture it from the URL after signup
 */
export function getOrgSlugBase(): string {
    return 'acme_inc'
}

/**
 * @deprecated Use getOrgSlugBase() instead. Org slug format changed from date to timestamp.
 */
export function getExpectedOrgSlug(): string {
    // Return base - actual slug captured from URL after signup
    console.warn('[Demo Config] getExpectedOrgSlug() is deprecated. Capture org_slug from URL after signup.')
    return 'acme_inc'
}

// Default demo account configuration - ALWAYS use these credentials
// NOTE: Company name is "Acme Inc" - system adds timestamp suffix to org_slug at signup
// Format: acme_inc_{timestamp} where timestamp is base36 (e.g., ml01ua8p)
export const DEFAULT_DEMO_ACCOUNT: DemoAccountConfig = {
    firstName: 'Demo',
    lastName: 'User',
    email: 'demo@cloudact.ai',
    password: 'Demo1234',  // Must have uppercase letter for Supabase validation
    phone: '5551234567',
    countryCode: '+1',
    companyName: 'Acme Inc',  // System creates org_slug as acme_inc_{timestamp}
    companyType: 'Company',
    currency: '$ USD',
    timezone: 'PST/PDT - Los Angeles, USA',
    plan: 'scale',  // Scale plan - Start trial, no credit card required
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

/**
 * Generate org slug from company name
 * Format: company_name_lowercase (spaces → underscores)
 * Example: "Acme Inc" → "acme_inc"
 */
export function generateOrgSlug(companyName: string): string {
    return companyName
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Remove special chars
        .replace(/\s+/g, '_')         // Spaces to underscores
        .replace(/_+/g, '_')          // Multiple underscores to single
        .replace(/^_|_$/g, '')        // Trim underscores
}

/**
 * Get the default org slug for demo account
 * Returns: "acme_inc"
 */
export function getDefaultOrgSlug(): string {
    return generateOrgSlug(DEFAULT_DEMO_ACCOUNT.companyName)
}

// Environment configuration
export const ENV_CONFIG = {
    gcpProjectId: process.env.GCP_PROJECT_ID || 'cloudact-testing-1',
    environment: process.env.ENVIRONMENT || 'local',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kwroaccbrxppfiysqlzs.supabase.co',
    caRootApiKey: process.env.CA_ROOT_API_KEY || 'test-ca-root-key-dev-32chars',
}

/**
 * Get the BigQuery dataset name for an org
 * Format: {org_slug}_{environment}
 * Example: "acme_inc_local"
 */
export function getDatasetName(orgSlug: string): string {
    return `${orgSlug}_${ENV_CONFIG.environment}`
}
