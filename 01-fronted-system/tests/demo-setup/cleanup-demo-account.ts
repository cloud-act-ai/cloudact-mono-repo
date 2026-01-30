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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

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

function deleteBigQueryDataset(orgSlug: string, environment: string = 'local'): boolean {
    const datasetName = `${orgSlug}_${environment}`
    const gcpProjectId = process.env.GCP_PROJECT_ID

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
        console.log('\n[Step 2] Cleaning up Supabase...')

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

        // Delete organizations
        for (const slug of orgSlugs) {
            // First delete all members of this org
            const { error: memberError } = await supabase
                .from('organization_members')
                .delete()
                .eq('org_id', (await findOrgBySlug(supabase, slug))?.id || '')

            if (!memberError) {
                console.log(`  Deleted members for org: ${slug}`)
            }

            // Delete the organization
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

        // Delete auth user
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
            const deleted = deleteBigQueryDataset(slug)
            if (deleted) {
                result.bigqueryDeleted.dataset = true
                result.bigqueryDeleted.datasetName = `${slug}_local`
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
    console.log('Demo Account Cleanup')
    console.log('='.repeat(60))

    if (!config.email && !config.orgSlug) {
        console.log('\nUsage:')
        console.log('  npx ts-node tests/demo-setup/cleanup-demo-account.ts --email=demo@cloudact.ai')
        console.log('  npx ts-node tests/demo-setup/cleanup-demo-account.ts --org-slug=acme_inc')
        console.log('\nEnvironment variables required:')
        console.log('  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL')
        console.log('  SUPABASE_SERVICE_ROLE_KEY')
        console.log('  GCP_PROJECT_ID')
        process.exit(1)
    }

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
