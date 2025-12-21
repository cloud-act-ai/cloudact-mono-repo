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
