/**
 * Auth utility functions
 */

/**
 * Normalize email address for consistent storage and comparison
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Validate redirect URL to prevent open redirect attacks.
 * Only allows relative paths that don't escape to external sites.
 *
 * Security checks:
 * - Must start with / (relative path)
 * - Cannot start with // (protocol-relative URL)
 * - Cannot contain backslashes (Windows path traversal)
 * - Cannot contain @ (email-like URLs)
 * - Cannot contain control characters
 *
 * @param url - Redirect URL to validate
 * @returns true if URL is safe for redirect
 */
export function isValidRedirect(url: string | null): url is string {
  if (!url) return false
  if (!url.startsWith("/")) return false
  if (url.startsWith("//")) return false
  if (url.includes("\\")) return false
  if (url.includes("@")) return false
  // Block control characters (0x00-0x1f)
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(url)) return false
  return true
}

/**
 * Parse Supabase auth error and return user-friendly message
 */
export function getAuthErrorMessage(error: any): string {
  const message = error?.message || String(error)

  // Rate limiting
  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "Too many login attempts. Please wait a few minutes and try again."
  }

  // Invalid credentials
  if (message.includes("Invalid login credentials")) {
    return "Invalid email or password. Please check your credentials and try again."
  }

  // Email not confirmed
  if (message.includes("Email not confirmed")) {
    return "Please check your email and confirm your account before signing in."
  }

  // User not found
  if (message.includes("User not found")) {
    return "No account found with this email. Please sign up first."
  }

  // Weak password
  if (message.includes("Password should be at least")) {
    return "Password must be at least 8 characters long."
  }

  // Email already registered
  if (message.includes("User already registered")) {
    return "An account with this email already exists. Please sign in instead."
  }

  // Generic fallback
  return message || "An error occurred. Please try again."
}
