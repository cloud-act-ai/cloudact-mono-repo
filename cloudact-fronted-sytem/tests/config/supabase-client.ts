/**
 * Supabase Test Client
 *
 * Creates Supabase clients for testing.
 * Uses service role for admin operations (create users, etc.)
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js"
import { testConfig } from "./test-config"

let _adminClient: SupabaseClient | null = null
let _anonClient: SupabaseClient | null = null

/**
 * Get admin Supabase client (service role - bypasses RLS)
 * Use for: Creating test users, cleaning up data, admin operations
 */
export function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      testConfig.supabase.url,
      testConfig.supabase.serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  }
  return _adminClient
}

/**
 * Get anon Supabase client (public - follows RLS)
 * Use for: Testing RLS policies, user-facing operations
 */
export function getAnonClient(): SupabaseClient {
  if (!_anonClient) {
    _anonClient = createClient(
      testConfig.supabase.url,
      testConfig.supabase.anonKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  }
  return _anonClient
}

/**
 * Create authenticated client for a specific user
 */
export async function getAuthenticatedClient(
  email: string,
  password: string
): Promise<SupabaseClient> {
  const client = createClient(
    testConfig.supabase.url,
    testConfig.supabase.anonKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw new Error(`Failed to sign in as ${email}: ${error.message}`)
  }

  return client
}
