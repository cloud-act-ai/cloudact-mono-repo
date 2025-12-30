"use server"

import { getOrgApiKeySecure } from "@/actions/backend-onboarding"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isValidOrgSlug as isValidOrgSlugHelper } from "@/lib/api/helpers"

// Re-export types from the types file (types can be re-exported from "use server" files)
export type {
  GenAIFlow,
  PAYGPricingRecord,
  CommitmentPricingRecord,
  InfrastructurePricingRecord,
  GenAIPricingResponse,
  PaginationParams,
  CustomPricingData,
  PricingOverrideData,
  FlowPricingRecord,
  AddCustomPricingResult,
  PricingValidationError,
} from "@/lib/types/genai-pricing"

// Import types for internal use
import type {
  GenAIFlow,
  GenAIPricingResponse,
  PaginationParams,
  CustomPricingData,
  PricingOverrideData,
  FlowPricingRecord,
  AddCustomPricingResult,
  PricingValidationError,
} from "@/lib/types/genai-pricing"

// Import constant
import { DEFAULT_PAGINATION_LIMIT } from "@/lib/types/genai-pricing"

// ============================================
// API URL Configuration
// ============================================

/**
 * Get the API service URL with validation.
 * Falls back to localhost in development but requires valid URL in production.
 */
function getApiServiceUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_SERVICE_URL

  // In development, allow fallback to localhost
  if (!url) {
    if (process.env.NODE_ENV === "development") {
      return "http://localhost:8000"
    }
    throw new Error(
      "NEXT_PUBLIC_API_SERVICE_URL environment variable is not set. " +
      "This is required in production."
    )
  }

  // Validate URL format (must be non-empty and valid)
  const trimmedUrl = url.trim()
  if (!trimmedUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_SERVICE_URL cannot be an empty string. " +
      "Please configure a valid URL."
    )
  }

  // Validate URL format
  try {
    new URL(trimmedUrl)
  } catch {
    throw new Error(
      `NEXT_PUBLIC_API_SERVICE_URL is not a valid URL: "${trimmedUrl}". ` +
      "Expected format: https://example.com or http://localhost:8000"
    )
  }

  return trimmedUrl
}

// Lazy initialization to avoid throwing during module load
let _apiServiceUrl: string | null = null
function getValidatedApiServiceUrl(): string {
  if (_apiServiceUrl === null) {
    _apiServiceUrl = getApiServiceUrl()
  }
  return _apiServiceUrl
}

// ============================================================================
// Input Sanitization - XSS Prevention
// ============================================================================

/**
 * Strip HTML tags from a string to prevent XSS attacks.
 * Security: Used on all user-provided text fields before storage.
 */
function stripHtmlTags(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
}

/**
 * Sanitize a notes field - removes HTML and limits length.
 */
function sanitizeNotes(notes: string | null | undefined): string | null {
  const stripped = stripHtmlTags(notes)
  if (!stripped) return null
  return stripped.slice(0, 1000)
}

/**
 * Sanitize a model/identifier field - removes special chars, limits length.
 */
function sanitizeIdentifier(id: string | null | undefined): string | null {
  if (!id) return null
  return id.replace(/[^a-zA-Z0-9\-_.]/g, '').slice(0, 200)
}

/**
 * Validate and sanitize a numeric field within bounds.
 */
function sanitizeNumericField(
  value: number | null | undefined,
  min: number = 0,
  max: number = 1e12
): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !isFinite(value)) return null
  if (value < min || value > max) return null
  return value
}

/**
 * Sanitize all fields in a pricing data object before API submission.
 * Security: Uses Object.hasOwn() instead of 'in' operator to prevent prototype pollution.
 */
function sanitizePricingData<T extends Record<string, unknown>>(data: T): T {
  const sanitized = { ...data } as T
  const stringFields = ['notes', 'region', 'status', 'volume_tier', 'commitment_type',
                        'cloud_provider', 'resource_type', 'gpu_type', 'model_group', 'unit_name']
  for (const field of stringFields) {
    // Security: Use Object.hasOwn() instead of 'in' to prevent prototype pollution
    if (Object.hasOwn(sanitized, field) && typeof sanitized[field] === 'string') {
      (sanitized as Record<string, unknown>)[field] = field === 'notes'
        ? sanitizeNotes(sanitized[field] as string)
        : stripHtmlTags(sanitized[field] as string)
    }
  }
  const identifierFields = ['model', 'model_family', 'model_version', 'instance_type']
  for (const field of identifierFields) {
    // Security: Use Object.hasOwn() instead of 'in' to prevent prototype pollution
    if (Object.hasOwn(sanitized, field) && typeof sanitized[field] === 'string') {
      (sanitized as Record<string, unknown>)[field] = sanitizeIdentifier(sanitized[field] as string)
    }
  }
  const numericFields: [string, number, number][] = [
    ['input_per_1m', 0, 100000], ['output_per_1m', 0, 100000],
    ['cached_input_per_1m', 0, 100000], ['hourly_rate', 0, 10000],
    ['ptu_hourly_rate', 0, 10000], ['ptu_monthly_rate', 0, 1000000],
  ]
  for (const [field, min, max] of numericFields) {
    // Security: Use Object.hasOwn() instead of 'in' to prevent prototype pollution
    if (Object.hasOwn(sanitized, field)) {
      (sanitized as Record<string, unknown>)[field] = sanitizeNumericField(sanitized[field] as number, min, max)
    }
  }
  const percentFields = ['cached_discount_pct', 'batch_discount_pct', 'volume_discount_pct',
                         'term_discount_pct', 'spot_discount_pct', 'sla_uptime_pct']
  for (const field of percentFields) {
    // Security: Use Object.hasOwn() instead of 'in' to prevent prototype pollution
    if (Object.hasOwn(sanitized, field)) {
      (sanitized as Record<string, unknown>)[field] = sanitizeNumericField(sanitized[field] as number, 0, 100)
    }
  }
  return sanitized
}

/**
 * Sanitize override data before sending to API.
 */
function sanitizeOverrideData(override: PricingOverrideData): PricingOverrideData {
  return {
    ...override,
    notes: sanitizeNotes(override.notes) ?? undefined,
    override_value: sanitizeNumericField(override.override_value, 0, 1e12) ?? override.override_value,
    override_field: override.override_field ? stripHtmlTags(override.override_field) ?? undefined : undefined,
  }
}

// ============================================================================
// Error Message Sanitization
// ============================================================================

/**
 * Sanitize an error message before returning to the client.
 * Security: Prevents internal details like status codes, backend paths,
 * database errors, or stack traces from leaking to the frontend.
 *
 * @param rawMessage - The raw error message from backend or exception
 * @param fallbackMessage - The safe fallback message to use
 * @returns A sanitized error message safe for display
 */
function sanitizeErrorMessage(rawMessage: string | null | undefined, fallbackMessage: string): string {
  if (!rawMessage) return fallbackMessage

  // Patterns that indicate internal/sensitive information
  const sensitivePatterns = [
    /\b\d{3}\b/g,                    // HTTP status codes (400, 500, etc.)
    /sql|query|database|bigquery/gi, // Database-related errors
    /traceback|stack|at\s+\w+\./gi,  // Stack traces
    /internal\s*server/gi,           // Internal server errors
    /\.py|\.ts|\.js|\.tsx/gi,        // File paths
    /api\/v\d+\//gi,                 // API paths
    /localhost|127\.0\.0\.1/gi,      // Local addresses
    /credential|secret|key|token/gi, // Credential-related
    /org_\w+|user_\w+/gi,           // Internal IDs
    /google\.com|googleapis/gi,      // Internal service URLs
  ]

  let sanitized = rawMessage

  // Check if message contains sensitive patterns
  for (const pattern of sensitivePatterns) {
    if (pattern.test(sanitized)) {
      // If any sensitive pattern is found, return the safe fallback
      return fallbackMessage
    }
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0
  }

  // Truncate very long messages (potential info leak)
  if (sanitized.length > 200) {
    return fallbackMessage
  }

  // Strip any HTML to prevent XSS through error messages
  sanitized = sanitized.replace(/<[^>]*>/g, '').trim()

  // If the sanitized message is too short or empty, use fallback
  if (sanitized.length < 5) {
    return fallbackMessage
  }

  return sanitized
}

/**
 * Extract a user-friendly message from API error response.
 * Security: Sanitizes the message to prevent information leakage.
 */
function getClientSafeErrorMessage(
  errorData: { detail?: string; message?: string; error?: string } | null,
  fallbackMessage: string
): string {
  if (!errorData) return fallbackMessage

  // Try to get a message from known fields
  const rawMessage = errorData.detail || errorData.message || errorData.error

  return sanitizeErrorMessage(rawMessage, fallbackMessage)
}

// ============================================================================
// Authorization
// ============================================================================

interface AuthResult {
  user: { id: string; user_metadata?: Record<string, unknown> }
  orgId: string
  role: string
}

function isValidOrgSlug(slug: string): boolean {
  return isValidOrgSlugHelper(slug)
}

/**
 * Validate that the current user is a member of the specified organization.
 * Security: Prevents unauthorized access to org pricing data.
 */
async function requireOrgMembership(orgSlug: string): Promise<AuthResult> {
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
    throw new Error("Database error")
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
    throw new Error("Database error")
  }

  if (!membership) {
    throw new Error("Not a member of this organization")
  }

  return { user, orgId: org.id, role: membership.role }
}

// Types are imported from @/lib/types/genai-pricing

// ============================================================================
// Helper Functions
// Note: These must be async because they're in a "use server" file
// ============================================================================

/**
 * Get the correct identifier field name based on flow type
 * Issue #13, #14: Fixed to match API router expectations:
 * - PAYG: uses 'model' as identifier
 * - Commitment: uses 'model' as identifier (NOT unit_name)
 * - Infrastructure: uses 'instance_type' as identifier
 */
export async function getIdentifierFieldForFlow(flow: GenAIFlow): Promise<string> {
  switch (flow) {
    case "payg":
      return "model"
    case "commitment":
      return "model"  // Fixed: API uses 'model', not 'unit_name'
    case "infrastructure":
      return "instance_type"
    default:
      return "id"
  }
}

/**
 * Extract the identifier value from a pricing record based on flow type
 * Issue #13, #14: Fixed to match API router expectations
 */
export async function extractIdentifierFromPricing(flow: GenAIFlow, pricing: Record<string, any>): Promise<string> {
  switch (flow) {
    case "payg":
      return pricing.model || pricing.id
    case "commitment":
      return pricing.model || pricing.id  // Fixed: API uses 'model' as identifier
    case "infrastructure":
      return pricing.instance_type || pricing.id
    default:
      return pricing.id
  }
}

// ============================================================================
// Get Pricing
// ============================================================================

export async function getGenAIPricing(
  orgSlug: string,
  provider?: string,
  pagination?: PaginationParams
): Promise<{ success: boolean; data?: GenAIPricingResponse; error?: string }> {
  try {
    // Security: Verify user is member of this org
    await requireOrgMembership(orgSlug)

    const apiKey = await getOrgApiKeySecure(orgSlug)
    if (!apiKey) {
      return { success: false, error: "No API key found for organization" }
    }

    const url = new URL(`${getValidatedApiServiceUrl()}/api/v1/genai/${orgSlug}/pricing`)
    if (provider) {
      url.searchParams.set("provider", provider)
    }

    // Add pagination parameters with defaults
    const limit = pagination?.limit ?? DEFAULT_PAGINATION_LIMIT
    const offset = pagination?.offset ?? 0
    url.searchParams.set("limit", String(limit))
    url.searchParams.set("offset", String(offset))

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return { success: false, error: getClientSafeErrorMessage(errorData, "Failed to get pricing data") }
    }

    // Defensive JSON parsing - even successful responses could have malformed JSON
    let data: GenAIPricingResponse
    try {
      data = await response.json()
    } catch {
      return { success: false, error: "Invalid response from pricing service" }
    }

    // Add pagination metadata to response
    const totalRecords = (data.payg?.length || 0) + (data.commitment?.length || 0) + (data.infrastructure?.length || 0)
    const enrichedData: GenAIPricingResponse = {
      ...data,
      limit,
      offset,
      has_more: totalRecords >= limit,
    }

    return { success: true, data: enrichedData }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error fetching GenAI pricing:", error)
    }
    return { success: false, error: "Failed to fetch pricing data" }
  }
}

export async function getGenAIPricingByFlow<T extends GenAIFlow>(
  orgSlug: string,
  flow: T,
  provider?: string,
  pagination?: PaginationParams
): Promise<{ success: boolean; data?: FlowPricingRecord<T>[]; total_count?: number; has_more?: boolean; error?: string }> {
  try {
    // Security: Verify user is member of this org
    await requireOrgMembership(orgSlug)

    const apiKey = await getOrgApiKeySecure(orgSlug)
    if (!apiKey) {
      return { success: false, error: "No API key found for organization" }
    }

    const url = new URL(`${getValidatedApiServiceUrl()}/api/v1/genai/${orgSlug}/pricing/${flow}`)
    if (provider) {
      url.searchParams.set("provider", provider)
    }

    // Add pagination parameters with defaults
    const limit = pagination?.limit ?? DEFAULT_PAGINATION_LIMIT
    const offset = pagination?.offset ?? 0
    url.searchParams.set("limit", String(limit))
    url.searchParams.set("offset", String(offset))

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return { success: false, error: getClientSafeErrorMessage(errorData, `Failed to get ${flow} pricing`) }
    }

    // Defensive JSON parsing
    let data: { data?: FlowPricingRecord<T>[]; total_count?: number }
    try {
      data = await response.json()
    } catch {
      return { success: false, error: `Invalid response from ${flow} pricing service` }
    }
    const records = data.data || []

    return {
      success: true,
      data: records,
      total_count: data.total_count || records.length,
      has_more: records.length >= limit,
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error(`Error fetching ${flow} pricing:`, error)
    }
    return { success: false, error: `Failed to fetch ${flow} pricing data` }
  }
}

// ============================================================================
// Add Custom Pricing
// ============================================================================

/**
 * Validate pricing data before API submission.
 * Returns array of validation errors, or empty array if valid.
 */
function validatePricingData(flow: GenAIFlow, pricing: CustomPricingData): PricingValidationError[] {
  const errors: PricingValidationError[] = []

  // Common validation
  if (!pricing.provider || typeof pricing.provider !== 'string' || pricing.provider.trim().length === 0) {
    errors.push({ field: 'provider', message: 'Provider is required' })
  }

  // Flow-specific validation
  switch (flow) {
    case 'payg':
      // Model is required for PAYG
      if (!pricing.model || typeof pricing.model !== 'string' || pricing.model.trim().length === 0) {
        errors.push({ field: 'model', message: 'Model name is required' })
      } else if (pricing.model.length > 200) {
        errors.push({ field: 'model', message: 'Model name cannot exceed 200 characters' })
      } else if (!/^[a-zA-Z0-9\-_.]+$/.test(pricing.model)) {
        errors.push({ field: 'model', message: 'Model name contains invalid characters' })
      }

      // Pricing values - must be non-negative
      if (pricing.input_per_1m !== null && pricing.input_per_1m !== undefined) {
        if (typeof pricing.input_per_1m !== 'number' || pricing.input_per_1m < 0) {
          errors.push({ field: 'input_per_1m', message: 'Input price must be a non-negative number' })
        } else if (pricing.input_per_1m > 100000) {
          errors.push({ field: 'input_per_1m', message: 'Input price cannot exceed $100,000' })
        }
      }

      if (pricing.output_per_1m !== null && pricing.output_per_1m !== undefined) {
        if (typeof pricing.output_per_1m !== 'number' || pricing.output_per_1m < 0) {
          errors.push({ field: 'output_per_1m', message: 'Output price must be a non-negative number' })
        } else if (pricing.output_per_1m > 100000) {
          errors.push({ field: 'output_per_1m', message: 'Output price cannot exceed $100,000' })
        }
      }

      if (pricing.cached_input_per_1m !== null && pricing.cached_input_per_1m !== undefined) {
        if (typeof pricing.cached_input_per_1m !== 'number' || pricing.cached_input_per_1m < 0) {
          errors.push({ field: 'cached_input_per_1m', message: 'Cached input price must be a non-negative number' })
        }
      }
      break

    case 'commitment':
      // Model is required for commitment
      if (!pricing.model || typeof pricing.model !== 'string' || pricing.model.trim().length === 0) {
        errors.push({ field: 'model', message: 'Model name is required' })
      }

      // Validate commitment pricing fields
      if (pricing.ptu_hourly_rate !== null && pricing.ptu_hourly_rate !== undefined) {
        if (typeof pricing.ptu_hourly_rate !== 'number' || pricing.ptu_hourly_rate < 0) {
          errors.push({ field: 'ptu_hourly_rate', message: 'Hourly rate must be a non-negative number' })
        } else if (pricing.ptu_hourly_rate > 10000) {
          errors.push({ field: 'ptu_hourly_rate', message: 'Hourly rate cannot exceed $10,000' })
        }
      }

      if (pricing.ptu_monthly_rate !== null && pricing.ptu_monthly_rate !== undefined) {
        if (typeof pricing.ptu_monthly_rate !== 'number' || pricing.ptu_monthly_rate < 0) {
          errors.push({ field: 'ptu_monthly_rate', message: 'Monthly rate must be a non-negative number' })
        } else if (pricing.ptu_monthly_rate > 1000000) {
          errors.push({ field: 'ptu_monthly_rate', message: 'Monthly rate cannot exceed $1,000,000' })
        }
      }
      break

    case 'infrastructure':
      // Instance type is required
      if (!pricing.instance_type || typeof pricing.instance_type !== 'string' || pricing.instance_type.trim().length === 0) {
        errors.push({ field: 'instance_type', message: 'Instance type is required' })
      }

      // Hourly rate validation
      if (pricing.hourly_rate !== null && pricing.hourly_rate !== undefined) {
        if (typeof pricing.hourly_rate !== 'number' || pricing.hourly_rate < 0) {
          errors.push({ field: 'hourly_rate', message: 'Hourly rate must be a non-negative number' })
        } else if (pricing.hourly_rate > 10000) {
          errors.push({ field: 'hourly_rate', message: 'Hourly rate cannot exceed $10,000' })
        }
      }
      break
  }

  // Validate percentage fields (0-100)
  const percentageFields: (keyof CustomPricingData)[] = [
    'cached_discount_pct', 'batch_discount_pct', 'volume_discount_pct',
    'term_discount_pct', 'spot_discount_pct', 'sla_uptime_pct'
  ]

  for (const field of percentageFields) {
    const value = pricing[field]
    if (value !== null && value !== undefined) {
      if (typeof value !== 'number' || value < 0 || value > 100) {
        errors.push({ field, message: `${field.replace(/_/g, ' ')} must be between 0 and 100` })
      }
    }
  }

  return errors
}

export async function addCustomPricing(
  orgSlug: string,
  flow: GenAIFlow,
  pricing: CustomPricingData
): Promise<AddCustomPricingResult> {
  try {
    // Validate pricing data before making API call
    const validationErrors = validatePricingData(flow, pricing)
    if (validationErrors.length > 0) {
      const errorMessages = validationErrors.map(e => `${e.field}: ${e.message}`).join(', ')
      return { success: false, error: `Validation failed: ${errorMessages}` }
    }

    // Security: Verify user is member of this org and has admin/owner role
    const { role } = await requireOrgMembership(orgSlug)
    if (role !== "admin" && role !== "owner") {
      return { success: false, error: "Only admins and owners can add custom pricing" }
    }

    const apiKey = await getOrgApiKeySecure(orgSlug)
    if (!apiKey) {
      return { success: false, error: "No API key found for organization" }
    }

    // Security: Sanitize all user-provided fields before sending to API
    const pricingRecord = pricing as unknown as Record<string, unknown>
    const sanitizedPricing = sanitizePricingData(pricingRecord) as unknown as CustomPricingData

    const response = await fetch(
      `${getValidatedApiServiceUrl()}/api/v1/genai/${orgSlug}/pricing/${flow}`,
      {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sanitizedPricing),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return { success: false, error: getClientSafeErrorMessage(errorData, `Failed to add custom ${flow} pricing`) }
    }

    // Defensive JSON parsing
    let data: { pricing_id?: string; id?: string; data?: { pricing_id?: string; id?: string } }
    try {
      data = await response.json()
    } catch {
      return { success: false, error: `Invalid response when adding ${flow} pricing` }
    }

    // Extract pricing_id from response - check multiple possible field names
    const pricingId = data.pricing_id || data.id || data.data?.pricing_id || data.data?.id

    // Validate that we received a pricing ID - this is required for subsequent operations
    if (!pricingId) {
      if (process.env.NODE_ENV === "development") {
        console.error(`No pricing ID returned from API for ${flow} pricing. Response:`, data)
      }
      return {
        success: false,
        error: `Pricing was created but no ID was returned. Please refresh and verify the pricing entry.`
      }
    }

    return {
      success: true,
      pricingId: String(pricingId),
      data: data.data || data
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error(`Error adding custom ${flow} pricing:`, error)
    }
    return { success: false, error: `Failed to add custom ${flow} pricing` }
  }
}

// ============================================================================
// Update Pricing Override
// ============================================================================

export async function setPricingOverride(
  orgSlug: string,
  flow: GenAIFlow,
  pricingId: string,
  override: PricingOverrideData
): Promise<{ success: boolean; error?: string }> {
  try {
    // Security: Verify user is member of this org and has admin/owner role
    const { role } = await requireOrgMembership(orgSlug)
    if (role !== "admin" && role !== "owner") {
      return { success: false, error: "Only admins and owners can modify pricing overrides" }
    }

    const apiKey = await getOrgApiKeySecure(orgSlug)
    if (!apiKey) {
      return { success: false, error: "No API key found for organization" }
    }

    // Security: Sanitize override data before sending to API
    const sanitizedOverride = sanitizeOverrideData(override)

    const response = await fetch(
      `${getValidatedApiServiceUrl()}/api/v1/genai/${orgSlug}/pricing/${flow}/${encodeURIComponent(pricingId)}/override`,
      {
        method: "PUT",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sanitizedOverride),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return { success: false, error: getClientSafeErrorMessage(errorData, "Failed to set pricing override") }
    }

    return { success: true }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error setting pricing override:", error)
    }
    return { success: false, error: "Failed to set pricing override" }
  }
}

// ============================================================================
// Delete Custom Pricing
// ============================================================================

export async function deleteCustomPricing(
  orgSlug: string,
  flow: GenAIFlow,
  pricingId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Security: Verify user is member of this org and has admin/owner role
    const { role } = await requireOrgMembership(orgSlug)
    if (role !== "admin" && role !== "owner") {
      return { success: false, error: "Only admins and owners can delete custom pricing" }
    }

    const apiKey = await getOrgApiKeySecure(orgSlug)
    if (!apiKey) {
      return { success: false, error: "No API key found for organization" }
    }

    const response = await fetch(
      `${getValidatedApiServiceUrl()}/api/v1/genai/${orgSlug}/pricing/${flow}/${encodeURIComponent(pricingId)}`,
      {
        method: "DELETE",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return { success: false, error: getClientSafeErrorMessage(errorData, "Failed to delete pricing") }
    }

    return { success: true }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error deleting pricing:", error)
    }
    return { success: false, error: "Failed to delete pricing" }
  }
}

// ============================================================================
// Reset Pricing Override
// ============================================================================

export async function resetPricingOverride(
  orgSlug: string,
  flow: GenAIFlow,
  pricingId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Security: Verify user is member of this org and has admin/owner role
    const { role } = await requireOrgMembership(orgSlug)
    if (role !== "admin" && role !== "owner") {
      return { success: false, error: "Only admins and owners can reset pricing overrides" }
    }

    const apiKey = await getOrgApiKeySecure(orgSlug)
    if (!apiKey) {
      return { success: false, error: "No API key found for organization" }
    }

    const response = await fetch(
      `${getValidatedApiServiceUrl()}/api/v1/genai/${orgSlug}/pricing/${flow}/${encodeURIComponent(pricingId)}/override`,
      {
        method: "DELETE",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return { success: false, error: getClientSafeErrorMessage(errorData, "Failed to reset pricing override") }
    }

    return { success: true }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error resetting pricing override:", error)
    }
    return { success: false, error: "Failed to reset pricing override" }
  }
}
