/**
 * Input validation and sanitization utilities
 *
 * SECURITY MEASURES:
 * 1. Input Validation: isValidOrgName() - blocks script tags, XSS attempts
 * 2. Input Sanitization: sanitizeOrgName() - removes <, >, ", ', &, ;
 * 3. Length Limits: Max 100 characters for org names
 *
 * Used in:
 * - Signup form (app/signup/page.tsx)
 * - Organization actions (actions/organization.ts)
 *
 * @see 00-requirements-docs/05_SECURITY.md for full security documentation
 */

/**
 * Sanitize organization name to prevent XSS and SQL injection
 *
 * Removes HTML tags and potentially dangerous characters.
 *
 * @param name - Raw organization name input
 * @returns Sanitized organization name (max 100 chars)
 */
export function sanitizeOrgName(name: string): string {
  return (
    name
      .replace(/<[^>]*>/g, "") // Remove HTML tags
      .replace(/[<>"'&;]/g, "") // Remove potentially dangerous characters
      .trim()
      .slice(0, 100) // Limit length
  )
}

/**
 * Validate organization name
 *
 * Ensures name meets security and length requirements:
 * - 2-100 characters after trimming
 * - No script tags or XSS attempts
 *
 * @param name - Organization name to validate
 * @returns true if valid, false otherwise
 */
export function isValidOrgName(name: string): boolean {
  const trimmed = name.trim()
  return (
    trimmed.length >= 2 &&
    trimmed.length <= 100 &&
    !/<script|<\/script|javascript:|on\w+=/i.test(trimmed)
  )
}

/**
 * Org slug validation pattern (must match backend)
 *
 * Backend pattern (02-api-service): ^[a-zA-Z0-9_]{3,50}$
 * - 3-50 characters
 * - Alphanumeric and underscores only
 * - NO hyphens (backend doesn't allow them)
 *
 * IMPORTANT: This pattern MUST stay in sync with backend validation.
 * @see 02-api-service/src/app/routers/organizations.py
 */
export const ORG_SLUG_PATTERN = /^[a-zA-Z0-9_]{3,50}$/

/**
 * Validate organization slug format
 *
 * Uses the same pattern as the backend to ensure consistency.
 * Prevents validation failures when frontend creates slugs that
 * backend rejects.
 *
 * @param slug - Organization slug to validate
 * @returns true if valid, false otherwise
 */
export function isValidOrgSlug(slug: string): boolean {
  if (!slug || typeof slug !== "string") return false
  return ORG_SLUG_PATTERN.test(slug)
}

/**
 * Sanitize a string to be used as org slug
 *
 * Converts to lowercase, replaces spaces/hyphens with underscores,
 * removes invalid characters, and ensures length limits.
 *
 * @param input - Raw input to convert to slug
 * @returns Sanitized slug (may still need uniqueness check)
 */
export function sanitizeToOrgSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")  // Replace spaces and hyphens with underscores
    .replace(/[^a-z0-9_]/g, "")  // Remove invalid chars
    .slice(0, 50)  // Max length
}
