/**
 * Auth Cache Module
 *
 * Provides request-level caching for authentication and API key lookups.
 * This dramatically reduces Supabase queries when multiple server actions
 * run in parallel (e.g., dashboard loading 20+ data points).
 *
 * PERFORMANCE IMPACT:
 * Before: Each action = 4 Supabase queries (auth + org + member + key)
 * After:  First action = 4 queries, subsequent = 0 (cache hit)
 *
 * Cache TTL: 5 seconds (enough for parallel requests, expires quickly for security)
 */

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getOrgApiKeySecure } from "@/actions/backend-onboarding"

// ============================================
// Types
// ============================================

export interface AuthResult {
  user: { id: string; user_metadata?: Record<string, unknown> }
  orgId: string
  role: string
}

export interface CachedAuthContext {
  auth: AuthResult
  apiKey: string
}

interface CacheEntry {
  userId: string
  orgId: string
  role: string
  apiKey: string
  cachedAt: number
}

// ============================================
// Cache Configuration
// ============================================

// Short-lived cache (5 seconds) - enough for parallel requests, expires quickly for security
const AUTH_CACHE_TTL_MS = 5000
const authCache = new Map<string, CacheEntry>()
const MAX_CACHE_ENTRIES = 50

// In-flight request deduplication - prevents multiple parallel requests from all fetching
// fresh data simultaneously, which can cause connection pool exhaustion and timeouts
const inFlightRequests = new Map<string, Promise<CachedAuthContext | null>>()

// ============================================
// Validation
// ============================================

export function isValidOrgSlug(orgSlug: string): boolean {
  if (!orgSlug || typeof orgSlug !== "string") return false
  return /^[a-zA-Z0-9_]{3,50}$/.test(orgSlug)
}

// ============================================
// Internal Auth Check (uncached)
// ============================================

async function requireOrgMembershipInternal(orgSlug: string): Promise<AuthResult> {
  if (!isValidOrgSlug(orgSlug)) {
    throw new Error("Invalid organization slug")
  }

  const supabase = await createClient()
  const adminClient = createServiceRoleClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error("Not authenticated")
  }

  const { data: org, error: orgError } = await adminClient
    .from("organizations")
    .select("id")
    .eq("org_slug", orgSlug)
    .single()

  if (orgError) {
    if (orgError.code === "PGRST116") {
      throw new Error("Organization not found")
    }
    throw new Error(`Database error: ${orgError.message}`)
  }

  if (!org) {
    throw new Error("Organization not found")
  }

  const { data: membership, error: membershipError } = await adminClient
    .from("organization_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()

  if (membershipError && membershipError.code !== "PGRST116") {
    throw new Error(`Database error: ${membershipError.message}`)
  }

  if (!membership) {
    throw new Error("Not a member of this organization")
  }

  return { user, orgId: org.id, role: membership.role }
}

// ============================================
// Cached Auth Functions (PUBLIC API)
// ============================================

// AUTH-002 FIX: Reduced timeout from 60s to 15s - if auth takes longer, something is wrong
const AUTH_OPERATION_TIMEOUT_MS = 15000 // 15 seconds

/**
 * Get cached auth + API key in a single call.
 * PERFORMANCE: Use this instead of separate auth + getOrgApiKeySecure calls.
 *
 * Features:
 * - 5-second request-level cache
 * - Request deduplication for parallel requests (prevents connection pool exhaustion)
 * - 15-second timeout to fail fast on Supabase issues
 *
 * @param orgSlug - Organization slug
 * @returns Auth context with API key, or null if auth fails or times out
 */
export async function getAuthWithApiKey(orgSlug: string): Promise<CachedAuthContext | null> {
  const cacheKey = orgSlug
  const cached = authCache.get(cacheKey)
  const now = Date.now()

  // Return cached if still valid
  if (cached && (now - cached.cachedAt) < AUTH_CACHE_TTL_MS) {
    return {
      auth: { user: { id: cached.userId }, orgId: cached.orgId, role: cached.role },
      apiKey: cached.apiKey,
    }
  }

  // Check for in-flight request - prevents multiple parallel requests from all
  // trying to fetch fresh data simultaneously (request deduplication)
  const inFlight = inFlightRequests.get(cacheKey)
  if (inFlight) {
    if (process.env.NODE_ENV === "development") {
      console.log(`[getAuthWithApiKey] Waiting for in-flight request for org: ${orgSlug}`)
    }
    return inFlight
  }

  // Fetch fresh auth + API key with timeout
  const fetchPromise = (async (): Promise<CachedAuthContext | null> => {
    try {
      const fetchAuthPromise = async (): Promise<CachedAuthContext | null> => {
        const auth = await requireOrgMembershipInternal(orgSlug)
        const apiKey = await getOrgApiKeySecure(orgSlug)

        if (!apiKey) {
          return null
        }

        // Cache the result
        const cacheTime = Date.now()
        authCache.set(cacheKey, {
          userId: auth.user.id,
          orgId: auth.orgId,
          role: auth.role,
          apiKey,
          cachedAt: cacheTime,
        })

        // Cleanup old entries
        if (authCache.size > MAX_CACHE_ENTRIES) {
          const entries = Array.from(authCache.entries())
          for (const [key, value] of entries) {
            if (cacheTime - value.cachedAt > AUTH_CACHE_TTL_MS) {
              authCache.delete(key)
            }
          }
        }

        return { auth, apiKey }
      }

      // Race between auth fetch and timeout
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => {
          if (process.env.NODE_ENV === "development") {
            console.warn(`[getAuthWithApiKey] Auth timeout after ${AUTH_OPERATION_TIMEOUT_MS}ms for org: ${orgSlug}`)
          }
          resolve(null)
        }, AUTH_OPERATION_TIMEOUT_MS)
      })

      return await Promise.race([fetchAuthPromise(), timeoutPromise])
    } catch {
      return null
    } finally {
      // Always clean up the in-flight request
      inFlightRequests.delete(cacheKey)
    }
  })()

  // Register the in-flight request
  inFlightRequests.set(cacheKey, fetchPromise)

  return fetchPromise
}

/**
 * Cached version of requireOrgMembership.
 * Uses 5-second request-level cache to avoid redundant Supabase queries.
 *
 * @param orgSlug - Organization slug
 * @returns Auth result with user, orgId, and role
 * @throws Error if not authenticated or not a member
 */
export async function requireOrgMembership(orgSlug: string): Promise<AuthResult> {
  const cached = await getAuthWithApiKey(orgSlug)
  if (cached) {
    return cached.auth
  }
  // Fallback to direct call if caching fails (will throw on auth error)
  return requireOrgMembershipInternal(orgSlug)
}

/**
 * Get cached API key for an organization.
 * PERFORMANCE: Prefer getAuthWithApiKey() when you also need auth.
 *
 * @param orgSlug - Organization slug
 * @returns API key or null if not found
 */
export async function getCachedApiKey(orgSlug: string): Promise<string | null> {
  const cached = await getAuthWithApiKey(orgSlug)
  return cached?.apiKey ?? null
}

/**
 * Invalidate cache for an organization.
 * Call this after API key rotation or membership changes.
 *
 * @param orgSlug - Organization slug to invalidate
 */
export function invalidateAuthCache(orgSlug: string): void {
  authCache.delete(orgSlug)
}

/**
 * Clear entire auth cache.
 * Useful for testing or force-refresh scenarios.
 */
export function clearAuthCache(): void {
  authCache.clear()
}
