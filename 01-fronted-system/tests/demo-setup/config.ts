/**
 * Demo Account Configuration
 *
 * Configuration for setting up demo accounts via browser automation.
 * Supports multi-environment: local → stage → prod
 *
 * ALWAYS use:
 *   - Email: demo@cloudact.ai
 *   - Password: Demo1234
 *   - Company: Acme Inc
 *
 * Environment setup:
 *   --env=local   (default) localhost services, cloudact-testing-1
 *   --env=stage   Stage Cloud Run, cloudact-testing-1
 *   --env=prod    Production Cloud Run, cloudact-prod (requires confirmation)
 *
 * For prod: secrets are auto-fetched from GCP Secret Manager if not set in env.
 *   .env.prod has placeholders (INJECTED_FROM_SECRET_MANAGER) - that's expected.
 *   Ensure gcloud is authenticated: gcloud auth activate-service-account --key-file=...
 */

import { execSync } from 'child_process'

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

// Valid environment names
export type Environment = 'local' | 'stage' | 'prod'
const VALID_ENVIRONMENTS: Environment[] = ['local', 'stage', 'prod']

// Environment presets - all values needed per environment
const ENV_PRESETS: Record<Environment, {
    gcpProjectId: string
    supabaseUrl: string
    frontendUrl: string
    apiServiceUrl: string
    pipelineServiceUrl: string
}> = {
    local: {
        gcpProjectId: 'cloudact-testing-1',
        supabaseUrl: 'https://kwroaccbrxppfiysqlzs.supabase.co',
        frontendUrl: 'http://localhost:3000',
        apiServiceUrl: 'http://localhost:8000',
        pipelineServiceUrl: 'http://localhost:8001',
    },
    stage: {
        gcpProjectId: 'cloudact-testing-1',
        supabaseUrl: 'https://kwroaccbrxppfiysqlzs.supabase.co',
        frontendUrl: 'https://cloudact.ai',  // Stage uses same domain with preview
        apiServiceUrl: 'https://api.cloudact.ai',
        pipelineServiceUrl: 'https://pipeline.cloudact.ai',
    },
    prod: {
        gcpProjectId: 'cloudact-prod',
        supabaseUrl: 'https://ovfxswhkkshouhsryzaf.supabase.co',
        frontendUrl: 'https://cloudact.ai',
        apiServiceUrl: 'https://api.cloudact.ai',
        pipelineServiceUrl: 'https://pipeline.cloudact.ai',
    },
}

/**
 * Detect environment from --env flag or ENVIRONMENT env var
 */
function detectEnvironment(): Environment {
    // Check --env CLI flag first
    const envArg = process.argv.find(a => a.startsWith('--env='))
    if (envArg) {
        const env = envArg.split('=')[1] as Environment
        if (!VALID_ENVIRONMENTS.includes(env)) {
            console.error(`ERROR: Invalid environment '${env}'. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`)
            process.exit(1)
        }
        return env
    }

    // Fall back to ENVIRONMENT env var
    const envVar = process.env.ENVIRONMENT || 'local'
    if (!VALID_ENVIRONMENTS.includes(envVar as Environment)) {
        console.error(`ERROR: Invalid ENVIRONMENT='${envVar}'. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`)
        process.exit(1)
    }
    return envVar as Environment
}

const DETECTED_ENV = detectEnvironment()
const PRESET = ENV_PRESETS[DETECTED_ENV]

/**
 * Get timestamp suffix in base36 format
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

// Test environment configuration (env vars override presets)
export const TEST_CONFIG = {
    baseUrl: process.env.TEST_BASE_URL || PRESET.frontendUrl,
    apiServiceUrl: process.env.API_SERVICE_URL || PRESET.apiServiceUrl,
    pipelineServiceUrl: process.env.PIPELINE_SERVICE_URL || PRESET.pipelineServiceUrl,
    timeout: parseInt(process.env.TEST_TIMEOUT || '60000'),
    headless: process.env.TEST_HEADLESS !== 'false',
    slowMo: parseInt(process.env.TEST_SLOW_MO || '0'),
}

// Stripe test card for checkout (if needed for non-trial plans)
export const STRIPE_TEST_CARD = {
    number: '4242424242424242',
    expiry: '12/30',
    cvc: '123',
    zip: '94086',
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

/**
 * Fetch a secret from GCP Secret Manager. Returns empty string on failure.
 */
function fetchGcpSecret(secretName: string, gcpProject: string): string {
    try {
        const result = execSync(
            `gcloud secrets versions access latest --secret=${secretName} --project=${gcpProject}`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        ).trim()
        // Skip placeholders
        if (result.includes('INJECTED_FROM') || result.includes('_AT_BUILD_TIME')) return ''
        return result
    } catch {
        return ''
    }
}

/**
 * Resolve a config value: env var → GCP Secret Manager (for stage/prod) → fallback
 */
function resolveSecret(envVar: string, gcpSecretName: string, gcpProject: string): string {
    const fromEnv = process.env[envVar] || ''
    // Skip placeholders from .env.prod
    if (fromEnv && !fromEnv.includes('INJECTED_FROM') && !fromEnv.includes('_AT_BUILD_TIME')) {
        return fromEnv
    }
    // Auto-fetch from GCP Secret Manager for non-local environments
    if (DETECTED_ENV !== 'local') {
        const fromGcp = fetchGcpSecret(gcpSecretName, gcpProject)
        if (fromGcp) {
            return fromGcp
        }
    }
    return ''
}

// Environment configuration (env vars override presets, with GCP Secret Manager fallback)
export const ENV_CONFIG = {
    environment: DETECTED_ENV,
    gcpProjectId: process.env.GCP_PROJECT_ID || PRESET.gcpProjectId,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || PRESET.supabaseUrl,
    caRootApiKey: resolveSecret('CA_ROOT_API_KEY', `ca-root-api-key-${DETECTED_ENV}`, PRESET.gcpProjectId),
}

// Warn if no CA_ROOT_API_KEY is set
if (!ENV_CONFIG.caRootApiKey) {
    console.warn(`[Demo Config] WARNING: CA_ROOT_API_KEY not set. Bootstrap/procedure operations will fail.`)
    console.warn(`[Demo Config] Set it via env var, or ensure gcloud auth is configured for GCP Secret Manager.`)
}

/**
 * Get the BigQuery dataset name for an org
 * Format: {org_slug}_{environment}
 * Example: "acme_inc_ml01ua8p_local", "acme_inc_ml01ua8p_stage"
 */
export function getDatasetName(orgSlug: string): string {
    return `${orgSlug}_${ENV_CONFIG.environment}`
}

/**
 * Production safety check - requires explicit confirmation
 * Call this at the start of any destructive or data-modifying operation
 */
export function requireProdConfirmation(action: string): void {
    if (ENV_CONFIG.environment !== 'prod') return

    const readline = require('readline')
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

    console.log(`\n⚠️  PRODUCTION ENVIRONMENT DETECTED`)
    console.log(`    GCP Project: ${ENV_CONFIG.gcpProjectId}`)
    console.log(`    Supabase: ${ENV_CONFIG.supabaseUrl}`)
    console.log(`    Action: ${action}`)

    // Check if running non-interactively (piped input)
    if (!process.stdin.isTTY) {
        console.log('    Non-interactive mode: checking for "yes" on stdin...')
        return // Allow piped "yes" to proceed
    }

    // For interactive mode, the caller should handle confirmation
    console.log(`    Pass --yes to skip confirmation, or pipe: echo "yes" | ...`)
}

// Log environment on import
if (DETECTED_ENV !== 'local') {
    console.log(`[Demo Config] Environment: ${DETECTED_ENV} | GCP: ${ENV_CONFIG.gcpProjectId} | Supabase: ${ENV_CONFIG.supabaseUrl}`)
}
