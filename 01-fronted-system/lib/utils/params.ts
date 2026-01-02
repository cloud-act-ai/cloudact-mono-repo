/**
 * Parameter Utilities
 *
 * Helpers for handling Next.js route parameters consistently.
 */

/**
 * Extract orgSlug from params, handling both string and string[] cases.
 * Next.js route params can be string or string[] for catch-all routes.
 *
 * @param params - Route params containing orgSlug
 * @returns Normalized orgSlug string
 */
export function getOrgSlug(params: { orgSlug?: string | string[] }): string {
  if (Array.isArray(params.orgSlug)) {
    return params.orgSlug[0] || ""
  }
  return params.orgSlug ?? ""
}

/**
 * Validate orgSlug format
 * Valid: 2-100 chars, alphanumeric, underscore, hyphen
 */
export function isValidOrgSlug(slug: string): boolean {
  return /^[a-zA-Z0-9_-]{2,100}$/.test(slug)
}
