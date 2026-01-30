/**
 * Add all users as members of the demo org
 *
 * This script adds all Supabase users as members of the demo organization
 * so they can access the demo dashboard and view cost data.
 *
 * Usage:
 *   npx ts-node tests/demo-setup/add-demo-org-members.ts
 *   npx ts-node tests/demo-setup/add-demo-org-members.ts --org-slug=custom_org
 *
 * Default credentials: demo@cloudact.ai / demo1234 / Acme Inc (org_slug: acme_inc)
 */

import { createClient } from '@supabase/supabase-js'
import { ENV_CONFIG, getDefaultOrgSlug } from './config'

// Environment configuration
const SUPABASE_URL = ENV_CONFIG.supabaseUrl
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

interface AddMembersConfig {
    orgSlug: string
}

interface AddMembersResult {
    success: boolean
    message: string
    addedCount: number
    totalMembers: number
    errors: string[]
}

function parseArgs(): AddMembersConfig {
    const args = process.argv.slice(2)

    // Default from shared config
    const config: AddMembersConfig = {
        orgSlug: getDefaultOrgSlug()  // "acme_inc"
    }

    for (const arg of args) {
        const [key, value] = arg.replace('--', '').split('=')
        if (key && value) {
            switch (key) {
                case 'org-slug':
                case 'orgSlug':
                    config.orgSlug = value
                    break
            }
        }
    }

    return config
}

async function addDemoOrgMembers(config: AddMembersConfig): Promise<AddMembersResult> {
    const result: AddMembersResult = {
        success: false,
        message: '',
        addedCount: 0,
        totalMembers: 0,
        errors: []
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
        result.message = 'Missing SUPABASE_SERVICE_ROLE_KEY environment variable'
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
        // Step 1: Get all users
        console.log('\n[Step 1] Fetching all users...')
        const { data: users, error: usersError } = await supabase.auth.admin.listUsers()

        if (usersError) {
            throw new Error(`Error listing users: ${usersError.message}`)
        }

        console.log(`  Found ${users.users.length} users`)

        // Step 2: Get the org ID
        console.log(`\n[Step 2] Getting org: ${config.orgSlug}...`)
        const { data: org, error: orgError } = await supabase
            .from('organizations')
            .select('id, org_slug, org_name, created_by')
            .eq('org_slug', config.orgSlug)
            .single()

        if (orgError || !org) {
            throw new Error(`Org ${config.orgSlug} not found: ${orgError?.message || 'not found'}`)
        }

        console.log(`  Found org: ${org.org_name} (${org.id})`)
        console.log(`  Owner: ${org.created_by}`)

        // Step 3: Get existing members
        console.log('\n[Step 3] Checking existing members...')
        const { data: existingMembers, error: membersError } = await supabase
            .from('organization_members')
            .select('user_id, role, status')
            .eq('org_id', org.id)

        if (membersError) {
            throw new Error(`Error fetching members: ${membersError.message}`)
        }

        const existingMemberIds = new Set(existingMembers?.map(m => m.user_id) || [])
        console.log(`  Existing members: ${existingMemberIds.size}`)

        // Step 4: Add missing users as collaborators
        console.log('\n[Step 4] Adding missing users as members...')

        for (const user of users.users) {
            if (existingMemberIds.has(user.id)) {
                console.log(`  Skipping ${user.email} (already a member)`)
                continue
            }

            // Determine role: owner if they created the org, collaborator otherwise
            const role = user.id === org.created_by ? 'owner' : 'collaborator'

            const { error: insertError } = await supabase
                .from('organization_members')
                .insert({
                    org_id: org.id,
                    user_id: user.id,
                    role: role,
                    status: 'active',
                    joined_at: new Date().toISOString(),
                    invite_accepted_at: new Date().toISOString()
                })

            if (insertError) {
                console.error(`  Error adding ${user.email}: ${insertError.message}`)
                result.errors.push(`Failed to add ${user.email}: ${insertError.message}`)
            } else {
                console.log(`  Added ${user.email} as ${role}`)
                result.addedCount++
            }
        }

        // Step 5: Verify
        console.log('\n[Step 5] Verifying members...')
        const { data: finalMembers } = await supabase
            .from('organization_members')
            .select('user_id, role, status')
            .eq('org_id', org.id)

        result.totalMembers = finalMembers?.length || 0
        console.log(`  Total members: ${result.totalMembers}`)

        finalMembers?.forEach(m => {
            const user = users.users.find(u => u.id === m.user_id)
            console.log(`    - ${user?.email || m.user_id}: ${m.role} (${m.status})`)
        })

        result.success = true
        result.message = `Added ${result.addedCount} new members to ${config.orgSlug}`

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
    console.log('Add Demo Org Members')
    console.log('='.repeat(60))
    console.log(`Org Slug: ${config.orgSlug}`)

    const result = await addDemoOrgMembers(config)

    console.log('\n' + '='.repeat(60))
    console.log('Result:', result.success ? 'SUCCESS' : 'FAILED')
    console.log('='.repeat(60))
    console.log(JSON.stringify(result, null, 2))

    process.exit(result.success ? 0 : 1)
}

main().catch(console.error)

export { addDemoOrgMembers }
export type { AddMembersConfig, AddMembersResult }
