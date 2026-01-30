/**
 * Insert Demo Org API Key into Supabase
 *
 * This script creates/updates the demo organization and its API key in Supabase
 * so the frontend can fetch costs data from the backend.
 *
 * Usage:
 *   npx ts-node tests/demo-setup/insert-demo-api-key.ts
 *   npx ts-node tests/demo-setup/insert-demo-api-key.ts --org-slug=acme_inc --api-key=my_api_key
 *
 * Default credentials: demo@cloudact.ai / demo1234 / Acme Inc
 */

import { createClient } from '@supabase/supabase-js'
import {
    DEFAULT_DEMO_ACCOUNT,
    ENV_CONFIG,
    getDefaultOrgSlug
} from './config'

// Environment configuration
const SUPABASE_URL = ENV_CONFIG.supabaseUrl
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

interface InsertApiKeyConfig {
    orgSlug: string
    orgName: string
    apiKey: string
}

interface InsertApiKeyResult {
    success: boolean
    message: string
    orgCreated: boolean
    apiKeyInserted: boolean
    errors: string[]
}

function parseArgs(): InsertApiKeyConfig {
    const args = process.argv.slice(2)

    // Default values from shared config
    const config: InsertApiKeyConfig = {
        orgSlug: getDefaultOrgSlug(),  // "acme_inc"
        orgName: DEFAULT_DEMO_ACCOUNT.companyName,  // "Acme Inc"
        apiKey: ''  // Must be provided or fetched
    }

    for (const arg of args) {
        const [key, value] = arg.replace('--', '').split('=')
        if (key && value) {
            switch (key) {
                case 'org-slug':
                case 'orgSlug':
                    config.orgSlug = value
                    break
                case 'org-name':
                case 'orgName':
                    config.orgName = value
                    break
                case 'api-key':
                case 'apiKey':
                    config.apiKey = value
                    break
            }
        }
    }

    return config
}

async function insertDemoApiKey(config: InsertApiKeyConfig): Promise<InsertApiKeyResult> {
    const result: InsertApiKeyResult = {
        success: false,
        message: '',
        orgCreated: false,
        apiKeyInserted: false,
        errors: []
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
        result.message = 'Missing SUPABASE_SERVICE_ROLE_KEY environment variable'
        result.errors.push(result.message)
        return result
    }

    if (!config.apiKey) {
        result.message = 'Missing --api-key parameter. Get it from: curl -s "http://localhost:8000/api/v1/admin/dev/api-key/${ORG_SLUG}" -H "X-CA-Root-Key: $CA_ROOT_API_KEY"'
        result.errors.push(result.message)
        return result
    }

    console.log('Connecting to Supabase...')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })

    try {
        // Step 1: Get any existing user to use as created_by
        console.log('\n[Step 1] Looking for existing users...')
        const { data: users, error: usersError } = await supabase.auth.admin.listUsers()

        if (usersError) {
            throw new Error(`Error listing users: ${usersError.message}`)
        }

        if (!users || users.users.length === 0) {
            throw new Error('No users found in Supabase. Please create a user first via signup.')
        }

        // Find the demo user (demo@cloudact.ai) or use first user
        const demoUser = users.users.find(u => u.email === DEFAULT_DEMO_ACCOUNT.email) || users.users[0]
        console.log(`  Found user: ${demoUser.email} (${demoUser.id})`)

        // Step 2: Check if org already exists
        console.log(`\n[Step 2] Checking if org exists: ${config.orgSlug}...`)
        const { data: existingOrg } = await supabase
            .from('organizations')
            .select('org_slug, org_name')
            .eq('org_slug', config.orgSlug)
            .single()

        if (existingOrg) {
            console.log(`  Org already exists: ${existingOrg.org_name}`)
        } else {
            // Insert the org
            console.log('  Org not found, creating...')
            const { error: insertOrgError } = await supabase
                .from('organizations')
                .insert({
                    org_slug: config.orgSlug,
                    org_name: config.orgName,
                    org_type: 'company',
                    plan: 'professional',
                    billing_status: 'active',
                    seat_limit: 10,
                    providers_limit: 20,
                    pipelines_per_day_limit: 100,
                    created_by: demoUser.id
                })

            if (insertOrgError) {
                throw new Error(`Error creating org: ${insertOrgError.message}`)
            }
            console.log(`  Created org: ${config.orgSlug}`)
            result.orgCreated = true
        }

        // Step 3: Check if API key already exists
        console.log('\n[Step 3] Checking if API key exists...')
        const { data: existingKey } = await supabase
            .from('org_api_keys_secure')
            .select('org_slug')
            .eq('org_slug', config.orgSlug)
            .single()

        if (existingKey) {
            console.log(`  API key already exists for: ${existingKey.org_slug}`)
            // Update it
            const { error: updateError } = await supabase
                .from('org_api_keys_secure')
                .update({
                    api_key: config.apiKey,
                    updated_at: new Date().toISOString()
                })
                .eq('org_slug', config.orgSlug)

            if (updateError) {
                throw new Error(`Error updating API key: ${updateError.message}`)
            }
            console.log('  Updated API key.')
            result.apiKeyInserted = true
        } else {
            // Insert the API key
            console.log('  API key not found, inserting...')
            const { error: insertKeyError } = await supabase
                .from('org_api_keys_secure')
                .insert({
                    org_slug: config.orgSlug,
                    api_key: config.apiKey
                })

            if (insertKeyError) {
                throw new Error(`Error inserting API key: ${insertKeyError.message}`)
            }
            console.log(`  Inserted API key for: ${config.orgSlug}`)
            result.apiKeyInserted = true
        }

        // Step 4: Verify
        console.log('\n[Step 4] Verifying...')
        const { data: verifyKey, error: verifyError } = await supabase
            .from('org_api_keys_secure')
            .select('org_slug, api_key, created_at')
            .eq('org_slug', config.orgSlug)
            .single()

        if (verifyError) {
            throw new Error(`Verification failed: ${verifyError.message}`)
        }

        console.log(`  org_slug: ${verifyKey.org_slug}`)
        console.log(`  api_key: ${verifyKey.api_key.substring(0, 20)}...`)
        console.log(`  created_at: ${verifyKey.created_at}`)

        result.success = true
        result.message = `API key stored for ${config.orgSlug}`

        return result
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        result.errors.push(errorMessage)
        result.message = `Failed: ${errorMessage}`
        return result
    }
}

// Main execution
async function main() {
    const config = parseArgs()

    console.log('='.repeat(60))
    console.log('Insert Demo API Key')
    console.log('='.repeat(60))
    console.log(`Org Slug: ${config.orgSlug}`)
    console.log(`Org Name: ${config.orgName}`)
    console.log(`API Key: ${config.apiKey ? config.apiKey.substring(0, 20) + '...' : '(not provided)'}`)

    if (!config.apiKey) {
        console.log('\nUsage:')
        console.log('  npx ts-node tests/demo-setup/insert-demo-api-key.ts --api-key=YOUR_API_KEY')
        console.log('')
        console.log('Get API key:')
        console.log(`  curl -s "http://localhost:8000/api/v1/admin/dev/api-key/${config.orgSlug}" \\`)
        console.log('    -H "X-CA-Root-Key: $CA_ROOT_API_KEY" | jq -r \'.api_key\'')
        process.exit(1)
    }

    const result = await insertDemoApiKey(config)

    console.log('\n' + '='.repeat(60))
    console.log('Result:', result.success ? 'SUCCESS' : 'FAILED')
    console.log('='.repeat(60))
    console.log(JSON.stringify(result, null, 2))

    process.exit(result.success ? 0 : 1)
}

main().catch(console.error)

export { insertDemoApiKey }
export type { InsertApiKeyConfig, InsertApiKeyResult }
