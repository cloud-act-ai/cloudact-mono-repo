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
 * Valid: 3-50 chars, lowercase alphanumeric + underscore only
 * MUST match backend pattern: ^[a-z0-9_]{3,50}$ — enforced at EVERY layer
 *
 * Re-exported from @/lib/utils/validation for convenience.
 */
export { isValidOrgSlug } from "@/lib/utils/validation"
