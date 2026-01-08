/**
 * Centralized logout functionality
 */

import { createClient } from "@/lib/supabase/client"
import { ROUTES } from "@/lib/constants/routes"

/**
 * Logout user with proper error handling and cleanup
 *
 * @param options Configuration options
 * @param options.skipConfirmation Skip confirmation dialog
 * @param options.onError Error callback
 * @returns Promise<boolean> true if logout successful
 */
export async function logout(options?: {
  skipConfirmation?: boolean
  onError?: (error: Error) => void
}): Promise<boolean> {
  try {
    // Confirmation dialog (can be skipped)
    if (!options?.skipConfirmation) {
      const confirmed = window.confirm("Are you sure you want to sign out?")
      if (!confirmed) return false
    }

    const supabase = createClient()

    // Sign out from Supabase
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error("[Logout] Supabase signOut error:", error)
      options?.onError?.(error)
      return false
    }

    // Clear any cached data (if needed in future)
    // localStorage.clear()
    // sessionStorage.clear()

    // Hard redirect to login (clears all client state)
    // AUTH-004/005: Server-side auth cache has 5-second TTL, no client-side clearing needed
    window.location.href = ROUTES.LOGIN

    return true
  } catch (error) {
    console.error("[Logout] Unexpected error:", error)
    const err = error instanceof Error ? error : new Error(String(error))
    options?.onError?.(err)
    return false
  }
}

/**
 * Logout without confirmation (for automatic logouts)
 */
export async function forceLogout(): Promise<boolean> {
  return logout({ skipConfirmation: true })
}
