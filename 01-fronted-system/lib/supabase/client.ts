import { createBrowserClient } from "@supabase/ssr"

/**
 * Browser client for Supabase
 *
 * IMPORTANT: autoRefreshToken is set to false because token refresh
 * is handled by the middleware (proxy.ts -> updateSession).
 * Having both browser and middleware refresh tokens causes race conditions
 * resulting in "Invalid Refresh Token: Already Used" errors.
 *
 * @see https://github.com/supabase/supabase/issues/18981
 * @see https://github.com/supabase/ssr/issues/68
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Middleware handles token refresh - disable browser auto-refresh
      // to prevent race conditions with simultaneous refresh attempts
      autoRefreshToken: false,
      // Keep session persistence enabled for cookie-based auth
      persistSession: true,
      // Detect session from URL (for OAuth callbacks)
      detectSessionInUrl: true,
    },
  })
}
