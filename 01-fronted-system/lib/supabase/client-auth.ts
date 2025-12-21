import { createClient } from "./client"

/**
 * Safe getUser wrapper for client components
 *
 * Handles auth errors gracefully by redirecting to login
 * instead of throwing an error that crashes the app.
 *
 * @param redirectPath - Path to redirect to after login (optional)
 * @returns User object or null if auth failed
 */
export async function getClientUser(redirectPath?: string) {
  try {
    const supabase = createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error) {
      console.error("[ClientAuth] Auth error:", error.message, error.code)

      // Check for refresh token errors or auth failures
      const isAuthError =
        error.message?.includes("Refresh Token") ||
        error.message?.includes("refresh_token") ||
        error.code === "refresh_token_not_found" ||
        error.status === 400 ||
        error.status === 401

      if (isAuthError) {
        // Clear local state and redirect to login
        const redirect = redirectPath
          ? `/login?redirectTo=${encodeURIComponent(redirectPath)}&reason=session_expired`
          : "/login?reason=session_expired"

        // Use window.location for a full page reload to clear any stale state
        if (typeof window !== "undefined") {
          window.location.href = redirect
        }
        return null
      }

      // For other errors, just return null without redirect
      return null
    }

    return user
  } catch (err) {
    console.error("[ClientAuth] Unexpected error:", err)

    // On unexpected errors, redirect to login
    if (typeof window !== "undefined" && redirectPath) {
      window.location.href = `/login?redirectTo=${encodeURIComponent(redirectPath)}&reason=auth_error`
    }

    return null
  }
}

/**
 * Check if an error is an auth-related error that should redirect to login
 */
export function isAuthError(error: unknown): boolean {
  if (!error) return false

  const errorMessage = error instanceof Error ? error.message : String(error)

  return (
    errorMessage.includes("Refresh Token") ||
    errorMessage.includes("refresh_token") ||
    errorMessage.includes("Invalid Refresh Token") ||
    errorMessage.includes("not authenticated") ||
    errorMessage.includes("JWT")
  )
}

/**
 * Handle auth error by redirecting to login
 */
export function handleAuthError(redirectPath?: string) {
  if (typeof window !== "undefined") {
    const redirect = redirectPath
      ? `/login?redirectTo=${encodeURIComponent(redirectPath)}&reason=session_expired`
      : "/login?reason=session_expired"
    window.location.href = redirect
  }
}
