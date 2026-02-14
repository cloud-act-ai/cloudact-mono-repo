/**
 * Demo Account Cleanup Script
 *
 * Deletes a demo account from both Supabase and BigQuery.
 *
 * Usage:
 *   npx ts-node tests/demo-setup/cleanup-demo-account.ts --email=demo@cloudact.ai
 *   npx ts-node tests/demo-setup/cleanup-demo-account.ts --org-slug=acme_inc
 *
 * Environment Variables:
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase service role key (for admin operations)
 *   GCP_PROJECT_ID - GCP project ID for BigQuery
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import { ENV_CONFIG, requireProdConfirmation } from './config'

/**
 * Resolve SUPABASE_SERVICE_ROLE_KEY: env var → GCP Secret Manager fallback.
 */
function resolveSupabaseServiceRoleKey(): string {
    const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    if (fromEnv && !fromEnv.includes('INJECTED_FROM') && !fromEnv.includes('_AT_BUILD_TIME')) {
        return fromEnv
    }
    if (ENV_CONFIG.environment !== 'local') {
        try {
            const secretName = `supabase-service-role-key-${ENV_CONFIG.environment}`
            return execSync(
                `gcloud secrets versions access latest --secret=${secretName} --project=${ENV_CONFIG.gcpProjectId}`,
                { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
            ).trim()
        } catch {
            return ''
        }
    }
    return fromEnv
}

const SUPABASE_SERVICE_ROLE_KEY = resolveSupabaseServiceRoleKey()

interface CleanupConfig {
    email?: string
    orgSlug?: string
}

interface CleanupResult {
    success: boolean
    message: string
    supabaseDeleted: {
        authUser: boolean
        profile: boolean
        orgMembers: number
        organizations: number
        invites: number
    }
    bigqueryDeleted: {
        dataset: boolean
        datasetName?: string
    }
    errors: string[]
}

function parseArgs(): CleanupConfig {
    const args = process.argv.slice(2)
    const config: CleanupConfig = {}

    for (const arg of args) {
        const [key, value] = arg.replace('--', '').split('=')
        if (key && value) {
            switch (key) {
                case 'email':
                    config.email = value
                    break
                case 'org-slug':
                case 'orgSlug':
                    config.orgSlug = value
                    break
            }
        }
    }

    return config
}

function getSupabaseClient(): SupabaseClient {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ENV_CONFIG.supabaseUrl
    const supabaseServiceKey = SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
    }

    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })
}

async function findUserByEmail(supabase: SupabaseClient, email: string): Promise<{ id: string; email: string } | null> {
    const { data, error } = await supabase.auth.admin.listUsers()
    if (error) {
        console.error('Error listing users:', error.message)
        return null
    }

    const user = data.users.find((u) => u.email === email)
    return user ? { id: user.id, email: user.email || '' } : null
}

async function findOrgBySlug(supabase: SupabaseClient, orgSlug: string): Promise<{ id: string; org_slug: string } | null> {
    const { data, error } = await supabase
        .from('organizations')
        .select('id, org_slug')
        .eq('org_slug', orgSlug)
        .single()

    if (error) {
        console.error('Error finding org:', error.message)
        return null
    }

    return data
}

async function findOrgsByUserId(supabase: SupabaseClient, userId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from('organization_members')
        .select('org_id')
        .eq('user_id', userId)

    if (error) {
        console.error('Error finding user orgs:', error.message)
        return []
    }

    const orgIds = data.map((m) => m.org_id)

    // Get org slugs
    const { data: orgs } = await supabase
        .from('organizations')
        .select('org_slug')
        .in('id', orgIds)

    return orgs?.map((o) => o.org_slug) || []
}

function deleteBigQueryDataset(orgSlug: string, environment: string = ENV_CONFIG.environment): boolean {
    const datasetName = `${orgSlug}_${environment}`
    const gcpProjectId = process.env.GCP_PROJECT_ID || ENV_CONFIG.gcpProjectId

    if (!gcpProjectId) {
        console.error('Missing GCP_PROJECT_ID environment variable')
        return false
    }

    try {
        console.log(`  Deleting BigQuery dataset: ${datasetName}...`)
        execSync(`bq rm -r -f -d ${gcpProjectId}:${datasetName}`, { stdio: 'pipe' })
        console.log(`  Dataset ${datasetName} deleted`)
        return true
    } catch (error) {
        // Dataset might not exist
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes('Not found')) {
            console.log(`  Dataset ${datasetName} not found (already deleted or never created)`)
            return true
        }
        console.error(`  Failed to delete dataset: ${errorMessage}`)
        return false
    }
}

async function cleanupDemoAccount(config: CleanupConfig): Promise<CleanupResult> {
    const result: CleanupResult = {
        success: false,
        message: '',
        supabaseDeleted: {
            authUser: false,
            profile: false,
            orgMembers: 0,
            organizations: 0,
            invites: 0,
        },
        bigqueryDeleted: {
            dataset: false,
        },
        errors: [],
    }

    if (!config.email && !config.orgSlug) {
        result.message = 'Must provide either --email or --org-slug'
        result.errors.push(result.message)
        return result
    }

    try {
        const supabase = getSupabaseClient()
        let userId: string | null = null
        let orgSlugs: string[] = []

        // Find user and orgs
        if (config.email) {
            console.log(`\n[Step 1] Finding user by email: ${config.email}`)
            const user = await findUserByEmail(supabase, config.email)
            if (user) {
                userId = user.id
                console.log(`  Found user: ${user.id}`)

                // Get orgs owned by this user
                orgSlugs = await findOrgsByUserId(supabase, userId)
                console.log(`  User belongs to orgs: ${orgSlugs.join(', ') || 'none'}`)
            } else {
                console.log('  User not found')
            }
        }

        if (config.orgSlug && !orgSlugs.includes(config.orgSlug)) {
            orgSlugs.push(config.orgSlug)
        }

        // Delete from Supabase
        // Order matters: org_api_keys_secure → org_members → invites → profile → auth user → organizations
        // The owner trigger on organizations blocks deletion while the owner user exists,
        // so we delete the auth user first (which cascades profile/members), then delete the org.
        console.log('\n[Step 2] Cleaning up Supabase...')

        // Delete org API keys from Supabase (frontend auth cache)
        for (const slug of orgSlugs) {
            const { error: keyError } = await supabase
                .from('org_api_keys_secure')
                .delete()
                .eq('org_slug', slug)

            if (!keyError) {
                console.log(`  Deleted org_api_keys_secure for: ${slug}`)
            }
        }

        // Delete org members
        if (userId) {
            const { count: memberCount } = await supabase
                .from('organization_members')
                .delete({ count: 'exact' })
                .eq('user_id', userId)

            result.supabaseDeleted.orgMembers = memberCount || 0
            console.log(`  Deleted ${result.supabaseDeleted.orgMembers} organization_members records`)
        }

        // Delete invites by email
        if (config.email) {
            const { count: inviteCount } = await supabase
                .from('invites')
                .delete({ count: 'exact' })
                .eq('email', config.email)

            result.supabaseDeleted.invites = inviteCount || 0
            console.log(`  Deleted ${result.supabaseDeleted.invites} invites records`)
        }

        // Delete org_quotas for this org's orgs
        for (const slug of orgSlugs) {
            const org = await findOrgBySlug(supabase, slug)
            if (org) {
                await supabase.from('org_quotas').delete().eq('org_id', org.id)
                console.log(`  Deleted org_quotas for: ${slug}`)
            }
        }

        // Delete profile
        if (userId) {
            const { error: profileError } = await supabase
                .from('profiles')
                .delete()
                .eq('id', userId)

            if (!profileError) {
                result.supabaseDeleted.profile = true
                console.log('  Deleted profile')
            }
        }

        // Use Management API raw SQL to bypass circular trigger dependency:
        // - Can't delete auth user (trigger: "user owns an org")
        // - Can't delete org (trigger: "owner still exists")
        // Solution: DELETE org via raw SQL (bypasses RLS/triggers), then delete auth user
        const supabaseProjectId = ENV_CONFIG.supabaseUrl.match(/https:\/\/([^.]+)/)?.[1]
        const supabaseAccessToken = process.env.SUPABASE_ACCESS_TOKEN

        if (supabaseProjectId && supabaseAccessToken && orgSlugs.length > 0) {
            console.log('  Using Management API to delete organizations (bypass owner trigger)...')
            for (const slug of orgSlugs) {
                try {
                    // Disable user-defined triggers (owner protection), delete, re-enable
                    const sqlStatements = [
                        `DO $$ BEGIN
                            ALTER TABLE public.organization_members DISABLE TRIGGER USER;
                            ALTER TABLE public.organizations DISABLE TRIGGER USER;
                            DELETE FROM public.organization_members WHERE org_id IN (SELECT id FROM public.organizations WHERE org_slug = '${slug}');
                            DELETE FROM public.organizations WHERE org_slug = '${slug}';
                            ALTER TABLE public.organization_members ENABLE TRIGGER USER;
                            ALTER TABLE public.organizations ENABLE TRIGGER USER;
                        END $$`,
                    ]
                    for (const sql of sqlStatements) {
                        const resp = await fetch(`https://api.supabase.com/v1/projects/${supabaseProjectId}/database/query`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${supabaseAccessToken}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ query: sql }),
                        })
                        if (!resp.ok) {
                            const body = await resp.text()
                            throw new Error(`SQL failed (${resp.status}): ${body}`)
                        }
                    }
                    result.supabaseDeleted.organizations++
                    console.log(`  Deleted organization: ${slug}`)
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    result.errors.push(`Failed to delete org ${slug} via SQL: ${msg}`)
                }
            }
        } else {
            // Fallback: try REST API (may fail due to triggers)
            for (const slug of orgSlugs) {
                const org = await findOrgBySlug(supabase, slug)
                if (org) {
                    await supabase.from('organization_members').delete().eq('org_id', org.id)
                }
                const { error: orgError } = await supabase
                    .from('organizations')
                    .delete()
                    .eq('org_slug', slug)

                if (!orgError) {
                    result.supabaseDeleted.organizations++
                    console.log(`  Deleted organization: ${slug}`)
                } else {
                    result.errors.push(`Failed to delete org ${slug}: ${orgError.message}`)
                }
            }
        }

        // Delete auth user (now safe - org is gone)
        if (userId) {
            const { error: authError } = await supabase.auth.admin.deleteUser(userId)
            if (!authError) {
                result.supabaseDeleted.authUser = true
                console.log('  Deleted auth user')
            } else {
                result.errors.push(`Failed to delete auth user: ${authError.message}`)
            }
        }

        // Delete BigQuery datasets
        console.log('\n[Step 3] Cleaning up BigQuery...')
        for (const slug of orgSlugs) {
            const deleted = deleteBigQueryDataset(slug, ENV_CONFIG.environment)
            if (deleted) {
                result.bigqueryDeleted.dataset = true
                result.bigqueryDeleted.datasetName = `${slug}_${ENV_CONFIG.environment}`
            }
        }

        result.success = result.errors.length === 0
        result.message = result.success
            ? `Successfully cleaned up demo account${config.email ? ` for ${config.email}` : ''}`
            : `Cleanup completed with ${result.errors.length} errors`

        return result
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        result.errors.push(errorMessage)
        result.message = `Cleanup failed: ${errorMessage}`
        return result
    }
}

// Main execution
async function main() {
    const config = parseArgs()

    console.log('='.repeat(60))
    console.log(`Demo Account Cleanup [${ENV_CONFIG.environment}]`)
    console.log('='.repeat(60))
    console.log(`Environment: ${ENV_CONFIG.environment}`)
    console.log(`GCP Project: ${ENV_CONFIG.gcpProjectId}`)
    console.log(`Supabase: ${ENV_CONFIG.supabaseUrl}`)

    if (!config.email && !config.orgSlug) {
        console.log('\nUsage:')
        console.log('  npx tsx tests/demo-setup/cleanup-demo-account.ts --email=demo@cloudact.ai')
        console.log('  npx tsx tests/demo-setup/cleanup-demo-account.ts --org-slug=acme_inc')
        console.log('  npx tsx tests/demo-setup/cleanup-demo-account.ts --email=demo@cloudact.ai --env=stage')
        console.log('\nEnvironment variables required:')
        console.log('  SUPABASE_SERVICE_ROLE_KEY')
        console.log('\nOptional (defaults from --env preset):')
        console.log('  NEXT_PUBLIC_SUPABASE_URL, GCP_PROJECT_ID')
        process.exit(1)
    }

    // Production safety check
    requireProdConfirmation(`Cleanup demo account: ${config.email || config.orgSlug}`)

    const result = await cleanupDemoAccount(config)

    console.log('\n' + '='.repeat(60))
    console.log('Result:', result.success ? 'SUCCESS' : 'FAILED')
    console.log('='.repeat(60))
    console.log(JSON.stringify(result, null, 2))

    process.exit(result.success ? 0 : 1)
}

main().catch(console.error)

export { cleanupDemoAccount }
export type { CleanupConfig, CleanupResult }
