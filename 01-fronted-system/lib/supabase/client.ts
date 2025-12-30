import { createBrowserClient } from "@supabase/ssr"

/**
 * Browser client for Supabase
 *
 * Token refresh strategy:
 * - autoRefreshToken: true - Browser client refreshes tokens during SPA navigation
 * - Middleware (proxy.ts -> updateSession) also refreshes on server requests
 *
 * Both are needed because:
 * 1. Client-side navigation (Link, router.push) doesn't trigger middleware
 * 2. Full page loads/server requests use middleware refresh
 *
 * Modern Supabase SSR handles coordination via cookie-based storage,
 * preventing "Invalid Refresh Token: Already Used" errors.
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
      // Enable browser auto-refresh to prevent session expiry during SPA navigation
      // Middleware also refreshes on server requests, but client-side navigation
      // doesn't trigger middleware, so browser must handle its own refresh.
      // Modern Supabase SSR coordinates refresh tokens properly via cookies.
      autoRefreshToken: true,
      // Keep session persistence enabled for cookie-based auth
      persistSession: true,
      // Detect session from URL (for OAuth callbacks)
      detectSessionInUrl: true,
    },
  })
}
