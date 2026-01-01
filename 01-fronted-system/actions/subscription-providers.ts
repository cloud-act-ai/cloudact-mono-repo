"use server"

/**
 * Subscription Providers Server Actions
 *
 * Actions for managing SaaS subscription providers:
 * - Supabase: saas_subscription_providers_meta (which providers are enabled)
 * - API Service: BigQuery plans (seeded + custom plans)
 *
 * Fixes applied:
 * - #9: Use shared helpers from lib/api/helpers.ts
 *
 * STATE-004: Frontend State Management Notes
 * ------------------------------------------
 * This module does NOT use optimistic updates. All mutations wait for server
 * confirmation before updating UI state. If implementing optimistic updates:
 * 1. Use SWR's mutate() with optimisticData for immediate UI feedback
 * 2. Implement rollback on server error (revert to previous state)
 * 3. Consider race conditions with concurrent updates
 * 4. Backend cache invalidation (invalidate_all_subscription_caches) ensures
 *    subsequent fetches return fresh data.
 */

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { logError } from "@/lib/utils"
import { getOrgApiKeySecure } from "@/actions/backend-onboarding"
import {
  getApiServiceUrl,
  fetchWithTimeout,
  safeJsonParse,
  getMonthStartUTC,
  getTodayDateUTC,
  isDateInPastUTC,
  isValidOrgSlug as isValidOrgSlugHelper,
  isValidSubscriptionId as isValidSubscriptionIdHelper,
  extractErrorMessage,
} from "@/lib/api/helpers"

// REMOVED: Local helper functions - now imported from lib/api/helpers.ts
// - getApiServiceUrl
// - fetchWithTimeout
// - safeJsonParse
// - getMonthStart (now getMonthStartUTC)
// - isDateInPast (now isDateInPastUTC)

// ============================================
// Auth Helpers
// ============================================

// Use isValidOrgSlugHelper from shared helpers, aliased for backwards compatibility
const isValidOrgSlug = isValidOrgSlugHelper

/**
 * Validate provider name
 * - Must be 2-50 characters
 * - Only lowercase alphanumeric and underscores
 * - Cannot start or end with underscore
 * Note: Currently unused but available for validation if needed
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const isValidProviderName = (provider: string): boolean => {
  if (!provider || typeof provider !== "string") return false
  const normalized = provider.toLowerCase().trim()
  // Allow 2-50 chars, alphanumeric and underscore, no leading/trailing underscore
  return /^[a-z0-9][a-z0-9_]{0,48}[a-z0-9]$/.test(normalized) || /^[a-z0-9]{2}$/.test(normalized)
}

/**
 * Sanitize provider name - convert to safe format
 */
const sanitizeProviderName = (provider: string): string => {
  return provider
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "_")  // Replace invalid chars with underscore
    .replace(/^_+|_+$/g, "")       // Remove leading/trailing underscores
    .replace(/_+/g, "_")           // Collapse multiple underscores
    .slice(0, 50)                  // Limit length
}

// REMOVED: extractErrorMessage - now imported from lib/api/helpers.ts
// The shared version properly parses JSON error responses from FastAPI

/**
 * Escape display name for XSS prevention
 */
function escapeDisplayName(name: string): string {
  return name.replace(/[<>&"']/g, "")
}

// Reserved provider names
const RESERVED_PROVIDER_NAMES = ["system", "admin", "api", "internal", "test", "default"]


// Valid enum values for plan fields (must match backend validation)
// VAL-001: TypeScript type for billing cycle validation
export type BillingCycle = "monthly" | "annual" | "quarterly" | "semi-annual" | "weekly"
const VALID_BILLING_CYCLES = new Set<BillingCycle>(["monthly", "annual", "quarterly", "semi-annual", "weekly"])
const VALID_PRICING_MODELS = new Set(["PER_SEAT", "FLAT_FEE"])
const VALID_DISCOUNT_TYPES = new Set(["percent", "fixed"])
const VALID_STATUS_VALUES = new Set(["active", "cancelled", "expired", "pending"])

// VAL-002: Maximum notes length
const MAX_NOTES_LENGTH = 1000

// ============================================
// Auto-Backfill Helper
// ============================================

/**
 * Trigger SaaS subscription costs pipeline backfill for backdated plans.
 * This is called automatically when a plan is created with a start_date in the past.
 * Can also be called manually to backfill costs for any date range.
 *
 * NOW ROUTES THROUGH API SERVICE (8000) instead of pipeline service (8001) directly.
 *
 * @param orgSlug - Organization slug
 * @param orgApiKey - Organization API key (used for auth)
 * @param startDate - Start date for backfill (YYYY-MM-DD)
 * @param endDate - End date for backfill (YYYY-MM-DD), defaults to today
 * @returns Result of backfill trigger
 */
export async function triggerCostBackfill(
  orgSlug: string,
  orgApiKey: string,
  startDate: string,
  endDate?: string
): Promise<{
  success: boolean
  message?: string
  error?: string
}> {
  try {
    // Use API service (8000) instead of pipeline service (8001)
    const apiUrl = getApiServiceUrl()
    // FIX: Use UTC helper for consistent date handling across timezones
    const actualEndDate = endDate || getTodayDateUTC()

    

    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/pipelines/trigger/${orgSlug}/saas/costs/saas_cost`,
      {
        method: "POST",
        headers: {
          "X-API-Key": orgApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          start_date: startDate,
          end_date: actualEndDate,
        }),
      },
      60000 // 60 second timeout for backfill (can be slow for large date ranges)
    )

    if (!response.ok) {
      const errorText = await response.text()
      
      return {
        success: false,
        error: `Backfill pipeline failed: ${errorText}`,
      }
    }

    await safeJsonParse<{ status?: string; message?: string; pipeline_logging_id?: string }>(
      response,
      { status: "unknown" }
    )

    return {
      success: true,
      message: `Cost backfill triggered from ${startDate} to ${actualEndDate}`,
    }
  } catch (error) {
    
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error triggering backfill",
    }
  }
}

// Use shared helpers (UTC-based for consistency with backend)
const isDateInPast = isDateInPastUTC
const getMonthStart = getMonthStartUTC

/**
 * Manually trigger cost backfill for an organization.
 * Use this to backfill costs after creating backdated plans, or to recalculate costs.
 *
 * @param orgSlug - Organization slug
 * @param startDate - Start date for backfill (YYYY-MM-DD)
 * @param endDate - End date for backfill (YYYY-MM-DD), defaults to today
 */
export async function runCostBackfill(
  orgSlug: string,
  startDate: string,
  endDate?: string
): Promise<{
  success: boolean
  message?: string
  error?: string
}> {
  try {
    await requireRole(orgSlug, "admin")

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    return await triggerCostBackfill(orgSlug, orgApiKey, startDate, endDate)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Validate plan data before sending to API
 */
function validatePlanData(plan: PlanCreate | PlanUpdate): { valid: boolean; error?: string } {
  // Validate plan name length
  if ("plan_name" in plan && plan.plan_name && plan.plan_name.length > 50) {
    return { valid: false, error: `Plan name too long. Maximum 50 characters allowed.` }
  }

  // Validate negative prices
  if ("unit_price" in plan && plan.unit_price !== undefined && plan.unit_price < 0) {
    return { valid: false, error: `Unit price cannot be negative` }
  }
  if ("yearly_price" in plan && plan.yearly_price !== undefined && plan.yearly_price < 0) {
    return { valid: false, error: `Yearly price cannot be negative` }
  }

  // Validate negative seats
  if ("seats" in plan && plan.seats !== undefined && plan.seats < 0) {
    return { valid: false, error: `Seats cannot be negative` }
  }

  if ("billing_cycle" in plan && plan.billing_cycle && !VALID_BILLING_CYCLES.has(plan.billing_cycle)) {
    return { valid: false, error: `Invalid billing_cycle: ${plan.billing_cycle}. Must be: monthly, annual, or quarterly` }
  }
  if ("pricing_model" in plan && plan.pricing_model && !VALID_PRICING_MODELS.has(plan.pricing_model)) {
    return { valid: false, error: `Invalid pricing_model: ${plan.pricing_model}. Must be: PER_SEAT or FLAT_FEE` }
  }
  if ("discount_type" in plan && plan.discount_type && !VALID_DISCOUNT_TYPES.has(plan.discount_type)) {
    return { valid: false, error: `Invalid discount_type: ${plan.discount_type}. Must be: percent or fixed` }
  }
  if ("status" in plan && plan.status && !VALID_STATUS_VALUES.has(plan.status)) {
    return { valid: false, error: `Invalid status: ${plan.status}. Must be: active, cancelled, expired, or pending` }
  }

  // VAL-002: Validate notes max length
  if ("notes" in plan && plan.notes && plan.notes.length > MAX_NOTES_LENGTH) {
    return { valid: false, error: `Notes too long. Maximum ${MAX_NOTES_LENGTH} characters allowed.` }
  }

  return { valid: true }
}

// Use shared helper for subscription ID validation
const isValidSubscriptionId = isValidSubscriptionIdHelper

interface AuthResult {
  user: { id: string; user_metadata?: Record<string, unknown> }
  orgId: string
  role: string
}

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

async function requireRole(orgSlug: string, requiredRole: string): Promise<AuthResult> {
  const result = await requireOrgMembership(orgSlug)

  const roleHierarchy: Record<string, number> = {
    owner: 3,
    admin: 2,
    collaborator: 1,
    read_only: 0,
  }

  const userLevel = roleHierarchy[result.role] ?? 0
  const requiredLevel = roleHierarchy[requiredRole] ?? 0

  if (userLevel < requiredLevel) {
    throw new Error(`Requires ${requiredRole} role or higher`)
  }

  return result
}

// ============================================
// Types
// ============================================

export interface ProviderMeta {
  id: string
  org_id: string
  provider_name: string
  is_enabled: boolean
  enabled_at: string
  created_at: string
  updated_at: string
}

export interface ProviderInfo {
  provider: string
  display_name: string
  category: string
  is_enabled: boolean
  plan_count: number
}

export interface SubscriptionPlan {
  org_slug: string
  subscription_id: string
  provider: string
  plan_name: string
  display_name?: string
  description?: string
  category: string
  status: 'active' | 'cancelled' | 'expired' | 'pending'
  start_date?: string
  end_date?: string
  billing_cycle: BillingCycle
  currency: string
  seats: number
  pricing_model: 'PER_SEAT' | 'FLAT_FEE'
  unit_price: number
  yearly_price?: number
  discount_type?: 'percent' | 'fixed'
  discount_value?: number
  auto_renew: boolean
  payment_method?: string
  invoice_id_last?: string
  owner_email?: string
  department?: string
  renewal_date?: string
  contract_id?: string
  notes?: string
  updated_at?: string
  // Audit trail fields for currency conversion (v12.2)
  source_currency?: string      // Original currency of template (e.g., "USD")
  source_price?: number         // Original price before conversion
  exchange_rate_used?: number   // Exchange rate at time of creation
}

export interface PlanCreate {
  plan_name: string
  display_name?: string
  unit_price: number
  billing_cycle?: BillingCycle  // VAL-001: Strongly typed billing cycle
  currency?: string  // Currency code (USD, EUR, GBP)
  seats?: number
  pricing_model?: 'PER_SEAT' | 'FLAT_FEE'
  yearly_price?: number
  discount_type?: 'percent' | 'fixed'
  discount_value?: number
  auto_renew?: boolean
  payment_method?: string
  owner_email?: string
  department?: string
  start_date?: string  // YYYY-MM-DD format
  renewal_date?: string
  contract_id?: string
  notes?: string
  // Hierarchy fields for cost allocation (v13.0)
  hierarchy_dept_id?: string      // Reference to org_hierarchy department entity_id
  hierarchy_dept_name?: string    // Department name (denormalized)
  hierarchy_project_id?: string   // Reference to org_hierarchy project entity_id
  hierarchy_project_name?: string // Project name (denormalized)
  hierarchy_team_id?: string      // Reference to org_hierarchy team entity_id
  hierarchy_team_name?: string    // Team name (denormalized)
  // Audit trail fields for currency conversion (v12.2)
  source_currency?: string      // Original currency of template (e.g., "USD")
  source_price?: number         // Original price before conversion
  exchange_rate_used?: number   // Exchange rate at time of creation
}

export interface PlanUpdate {
  display_name?: string
  unit_price?: number
  status?: 'active' | 'cancelled' | 'expired' | 'pending'
  billing_cycle?: BillingCycle  // VAL-001: Strongly typed billing cycle
  currency?: string  // Currency code (USD, EUR, GBP)
  seats?: number
  pricing_model?: 'PER_SEAT' | 'FLAT_FEE'
  yearly_price?: number
  discount_type?: 'percent' | 'fixed'
  discount_value?: number
  auto_renew?: boolean
  payment_method?: string
  owner_email?: string
  department?: string
  renewal_date?: string
  contract_id?: string
  notes?: string
  end_date?: string
  // Hierarchy fields for cost allocation (v13.0)
  hierarchy_dept_id?: string      // Reference to org_hierarchy department entity_id
  hierarchy_dept_name?: string    // Department name (denormalized)
  hierarchy_project_id?: string   // Reference to org_hierarchy project entity_id
  hierarchy_project_name?: string // Project name (denormalized)
  hierarchy_team_id?: string      // Reference to org_hierarchy team entity_id
  hierarchy_team_name?: string    // Team name (denormalized)
}

// ============================================
// Provider Display Names & Categories
// ============================================

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  chatgpt_plus: "ChatGPT Plus",
  claude_pro: "Claude Pro",
  gemini_advanced: "Gemini Advanced",
  copilot: "GitHub Copilot",
  cursor: "Cursor",
  windsurf: "Windsurf",
  replit: "Replit",
  v0: "v0",
  lovable: "Lovable",
  canva: "Canva",
  adobe_cc: "Adobe Creative Cloud",
  figma: "Figma",
  miro: "Miro",
  notion: "Notion",
  confluence: "Confluence",
  asana: "Asana",
  monday: "Monday.com",
  slack: "Slack",
  zoom: "Zoom",
  teams: "Microsoft Teams",
  github: "GitHub",
  gitlab: "GitLab",
  jira: "Jira",
  linear: "Linear",
  vercel: "Vercel",
  netlify: "Netlify",
  railway: "Railway",
  supabase: "Supabase",
  loom: "Loom",
  zapier: "Zapier",
  custom: "Custom",
}

const PROVIDER_CATEGORIES: Record<string, string[]> = {
  ai: ["chatgpt_plus", "claude_pro", "gemini_advanced", "copilot", "cursor", "windsurf", "replit", "v0", "lovable"],
  design: ["canva", "adobe_cc", "figma", "miro"],
  productivity: ["notion", "confluence", "asana", "monday"],
  communication: ["slack", "zoom", "teams"],
  development: ["github", "gitlab", "jira", "linear", "vercel", "netlify", "railway", "supabase"],
  video: ["loom"],
  automation: ["zapier"],
}

function getProviderDisplayName(provider: string): string {
  return PROVIDER_DISPLAY_NAMES[provider] || provider.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
}

function getProviderCategory(provider: string): string {
  for (const [category, providers] of Object.entries(PROVIDER_CATEGORIES)) {
    if (providers.includes(provider)) {
      return category
    }
  }
  return "other"
}

// ============================================
// Supabase Actions (Meta Table)
// ============================================

/**
 * List all enabled providers for an org from Supabase meta table
 */
export async function listEnabledProviders(orgSlug: string): Promise<{
  success: boolean
  providers: ProviderMeta[]
  error?: string
}> {
  try {
    const { orgId } = await requireOrgMembership(orgSlug)
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("saas_subscription_providers_meta")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_enabled", true)
      .order("provider_name")

    if (error) {
      return { success: false, providers: [], error: error.message }
    }

    return { success: true, providers: data || [] }
  } catch (error) {
    return { success: false, providers: [], error: logError("listEnabledProviders", error) }
  }
}

/**
 * Get provider meta record
 */
export async function getProviderMeta(
  orgSlug: string,
  provider: string
): Promise<{
  success: boolean
  provider?: ProviderMeta
  error?: string
}> {
  try {
    const { orgId } = await requireOrgMembership(orgSlug)
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("saas_subscription_providers_meta")
      .select("*")
      .eq("org_id", orgId)
      .eq("provider_name", provider.toLowerCase())
      .single()

    if (error && error.code !== "PGRST116") { // PGRST116 = no rows returned
      return { success: false, error: error.message }
    }

    return { success: true, provider: data || undefined }
  } catch (error) {
    return { success: false, error: logError("getProviderMeta", error) }
  }
}

/**
 * Enable a provider - inserts to meta table only (no automatic seeding)
 * Users should use "Add from Template" or "Add Custom Subscription" to add plans
 */
export async function enableProvider(
  orgSlug: string,
  provider: string
): Promise<{
  success: boolean
  plans_seeded: number
  error?: string
}> {
  try {
    // Validate provider name
    const sanitizedProvider = sanitizeProviderName(provider)
    if (!sanitizedProvider || sanitizedProvider.length < 2) {
      return { success: false, plans_seeded: 0, error: "Invalid provider name" }
    }

    const { orgId } = await requireRole(orgSlug, "admin")
    const supabase = await createClient()

    // 1. Upsert to Supabase meta table
    const { error: metaError } = await supabase
      .from("saas_subscription_providers_meta")
      .upsert(
        {
          org_id: orgId,
          provider_name: sanitizedProvider,
          is_enabled: true,
          enabled_at: new Date().toISOString(),
        },
        { onConflict: "org_id,provider_name" }
      )

    if (metaError) {
      return { success: false, plans_seeded: 0, error: metaError.message }
    }

    // Provider enabled - no automatic seeding
    // Users will use "Add from Template" or "Add Custom Subscription" to add plans
    return {
      success: true,
      plans_seeded: 0,
    }
  } catch (error) {
    return { success: false, plans_seeded: 0, error: logError("enableProvider", error) }
  }
}

/**
 * Create a custom provider with its first plan
 * Used for adding SaaS providers not in the default list
 *
 * If the plan has a start_date in the past, automatically triggers a cost backfill
 * to generate daily cost rows from start_date to today.
 */
export async function createCustomProviderWithPlan(
  orgSlug: string,
  data: {
    provider: string
    display_name: string
    category: string
    plan: PlanCreate
  }
): Promise<{
  success: boolean
  backfillTriggered?: boolean
  backfillMessage?: string
  error?: string
}> {
  try {
    // Validate provider name
    const sanitizedProvider = sanitizeProviderName(data.provider)
    if (!sanitizedProvider || sanitizedProvider.length < 2) {
      return { success: false, error: "Invalid provider name" }
    }

    // Check reserved provider names
    if (RESERVED_PROVIDER_NAMES.includes(sanitizedProvider.toLowerCase())) {
      return { success: false, error: "This provider name is reserved" }
    }

    // Validate plan data
    const planValidation = validatePlanData(data.plan)
    if (!planValidation.valid) {
      return { success: false, error: planValidation.error }
    }

    const { orgId } = await requireRole(orgSlug, "admin")
    const supabase = await createClient()

    // 1. Enable the provider in Supabase meta table (with custom flag and display_name)
    const { error: metaError } = await supabase
      .from("saas_subscription_providers_meta")
      .upsert(
        {
          org_id: orgId,
          provider_name: sanitizedProvider,
          is_enabled: true,
          enabled_at: new Date().toISOString(),
          display_name: data.display_name,
          category: data.category,
          is_custom: true,  // Mark as custom provider
        },
        { onConflict: "org_id,provider_name" }
      )

    if (metaError) {
      return { success: false, error: `Failed to enable provider: ${metaError.message}` }
    }

    // 2. Validate currency matches org default
    const { getOrgLocale, validateLocaleSync, repairLocaleSync } = await import("./organization-locale")
    const localeResult = await getOrgLocale(orgSlug)
    if (localeResult.success && localeResult.locale) {
      const orgCurrency = localeResult.locale.default_currency || "USD"
      if (data.plan.currency && data.plan.currency !== orgCurrency) {
        return {
          success: false,
          error: `Plan currency '${data.plan.currency}' must match organization's default currency '${orgCurrency}'`
        }
      }

      // Check if Supabase and BigQuery are in sync, auto-repair if needed
      const syncCheck = await validateLocaleSync(orgSlug)
      if (!syncCheck.inSync && syncCheck.mismatch) {
        
        const repairResult = await repairLocaleSync(orgSlug)
        if (!repairResult.success) {
          return {
            success: false,
            error: `Locale sync failed: ${repairResult.error}`
          }
        }
      }
    }

    // 3. Create the first plan via API service
    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${sanitizedProvider}/plans`,
      {
        method: "POST",
        headers: {
          "X-API-Key": orgApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data.plan),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to create plan: ${extractErrorMessage(errorText)}` }
    }

    // 4. Always trigger cost pipeline to keep costs up-to-date
    let pipelineTriggered = false
    let pipelineMessage: string | undefined

    const startDateStr = data.plan.start_date || new Date().toISOString().split("T")[0]
    const pipelineStartDate = isDateInPast(startDateStr)
      ? startDateStr
      : getMonthStart()

    
    const pipelineResult = await triggerCostBackfill(orgSlug, orgApiKey, pipelineStartDate)
    pipelineTriggered = pipelineResult.success

    if (isDateInPast(startDateStr)) {
      pipelineMessage = pipelineResult.success
        ? `Historical costs calculated from ${startDateStr} to today`
        : `Plan created but cost calculation failed: ${pipelineResult.error}`
    } else {
      pipelineMessage = pipelineResult.success
        ? `Costs updated for current period`
        : `Plan created but cost calculation failed: ${pipelineResult.error}`
    }

    // Pipeline failure is logged via pipelineMessage, main operation still succeeded

    return {
      success: true,
      backfillTriggered: pipelineTriggered,
      backfillMessage: pipelineMessage,
    }
  } catch (error) {
    return { success: false, error: logError("createCustomProviderWithPlan", error) }
  }
}

/**
 * Disable a provider - updates meta table first, then deletes plans
 */
export async function disableProvider(
  orgSlug: string,
  provider: string
): Promise<{
  success: boolean
  plans_deleted?: number
  error?: string
  partial_failure?: string
}> {
  try {
    // Validate provider name
    const sanitizedProvider = sanitizeProviderName(provider)
    if (!sanitizedProvider || sanitizedProvider.length < 2) {
      return { success: false, error: "Invalid provider name" }
    }

    const { orgId } = await requireRole(orgSlug, "admin")
    const supabase = await createClient()

    // Step 1: Get API key FIRST (Issue 2: Race condition - check before Supabase update)
    const orgApiKey = await getOrgApiKeySecure(orgSlug)

    // Step 2: Disable provider in Supabase meta table
    const { error: metaError } = await supabase
      .from("saas_subscription_providers_meta")
      .update({ is_enabled: false })
      .eq("org_id", orgId)
      .eq("provider_name", sanitizedProvider)

    if (metaError) {
      return { success: false, error: `Failed to update provider status: ${metaError.message}` }
    }

    // Step 3: Delete all plans for this provider from BigQuery (only if Supabase succeeded)
    let plansDeleted = 0
    const failures: string[] = []

    if (orgApiKey) {
      try {
        const apiUrl = getApiServiceUrl()

        // Get all plans for this provider
        const plansResponse = await fetchWithTimeout(
          `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${sanitizedProvider}/plans`,
          {
            headers: { "X-API-Key": orgApiKey },
          },
          30000
        )

        if (plansResponse.ok) {
          const plansResult = await safeJsonParse<{ plans?: SubscriptionPlan[] }>(
            plansResponse,
            { plans: [] }
          )
          const plans = plansResult.plans || []

          // Delete each plan (Issue 1: Add null check for subscription_id)
          for (const plan of plans) {
            if (!plan.subscription_id) {
              
              continue
            }
            try {
              const deleteResponse = await fetchWithTimeout(
                `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${sanitizedProvider}/plans/${plan.subscription_id}`,
                {
                  method: "DELETE",
                  headers: { "X-API-Key": orgApiKey },
                },
                30000
              )
              if (deleteResponse.ok) {
                plansDeleted++
              } else {
                failures.push(plan.subscription_id)
              }
            } catch (deleteError) {
              if (process.env.NODE_ENV === "development") {
                console.warn(`[disableProvider] Failed to delete plan ${plan.subscription_id}:`, deleteError)
              }
              failures.push(plan.subscription_id)
            }
          }

          // Check for partial failures
          if (failures.length > 0 && failures.length < plans.length) {
            return {
              success: true,
              plans_deleted: plansDeleted,
              partial_failure: `${failures.length} of ${plans.length} plans failed to delete`
            }
          }

          // Check for complete failure
          if (failures.length === plans.length && plans.length > 0) {
            return {
              success: true, // Provider is still disabled in Supabase
              plans_deleted: 0,
              error: `Provider disabled but failed to delete all ${plans.length} plans`
            }
          }
        }
      } catch (apiError) {
        
        return {
          success: true, // Provider is still disabled in Supabase
          plans_deleted: 0,
          error: `Provider disabled but failed to delete plans: ${apiError instanceof Error ? apiError.message : String(apiError)}`
        }
      }
    }

    return {
      success: true,
      plans_deleted: plansDeleted,
    }
  } catch (error) {
    return { success: false, error: logError("disableProvider", error) }
  }
}

// ============================================
// API Service Actions (BigQuery Plans)
// ============================================

/**
 * Get all available providers with their enabled status and plan counts
 */
export async function getAllProviders(orgSlug: string): Promise<{
  success: boolean
  providers: ProviderInfo[]
  error?: string
}> {
  try {
    const { orgId } = await requireOrgMembership(orgSlug)
    const supabase = await createClient()

    // Get enabled providers from meta table
    const { data: metaData } = await supabase
      .from("saas_subscription_providers_meta")
      .select("provider_name, is_enabled")
      .eq("org_id", orgId)

    const enabledMap = new Map<string, boolean>()
    if (metaData) {
      metaData.forEach(m => enabledMap.set(m.provider_name, m.is_enabled))
    }

    // Get plan counts from API if available
    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    const planCounts = new Map<string, number>()

    if (orgApiKey) {
      try {
        const apiUrl = getApiServiceUrl()
        const response = await fetchWithTimeout(
          `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers`,
          {
            headers: { "X-API-Key": orgApiKey },
          }
        )

        if (response.ok) {
          const result = await safeJsonParse<{ providers?: ProviderInfo[] }>(response, { providers: [] })
          result.providers?.forEach((p: ProviderInfo) => {
            planCounts.set(p.provider, p.plan_count)
          })
        }
      } catch (apiError) {
        // Non-critical - we'll use in-memory defaults if API fails
        if (process.env.NODE_ENV === "development") {
          console.warn("[getAllProviders] Failed to fetch plan counts from API:", apiError)
        }
      }
    }

    // Build full provider list
    const allProviders = Object.keys(PROVIDER_DISPLAY_NAMES).filter(p => p !== "custom")
    const providers: ProviderInfo[] = allProviders.map(provider => ({
      provider,
      display_name: escapeDisplayName(getProviderDisplayName(provider)),
      category: getProviderCategory(provider),
      is_enabled: enabledMap.get(provider) ?? false,
      plan_count: planCounts.get(provider) ?? 0,
    }))

    // Sort by category, then by name
    providers.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category)
      return a.display_name.localeCompare(b.display_name)
    })

    return { success: true, providers }
  } catch (error) {
    return { success: false, providers: [], error: logError("getAllProviders", error) }
  }
}

/**
 * Get plans for a provider from BigQuery via API
 */
export async function getProviderPlans(
  orgSlug: string,
  provider: string
): Promise<{
  success: boolean
  plans: SubscriptionPlan[]
  total_monthly_cost: number
  active_subscriptions_count: number
  total_plans_count: number
  error?: string
}> {
  try {
    // Validate provider name
    const sanitizedProvider = sanitizeProviderName(provider)
    if (!sanitizedProvider || sanitizedProvider.length < 2) {
      return {
        success: false,
        plans: [],
        total_monthly_cost: 0,
        active_subscriptions_count: 0,
        total_plans_count: 0,
        error: "Invalid provider name"
      }
    }

    await requireOrgMembership(orgSlug)

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return {
        success: false,
        plans: [],
        total_monthly_cost: 0,
        active_subscriptions_count: 0,
        total_plans_count: 0,
        error: "Organization API key not found"
      }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${sanitizedProvider}/plans`,
      {
        headers: { "X-API-Key": orgApiKey },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        plans: [],
        total_monthly_cost: 0,
        active_subscriptions_count: 0,
        total_plans_count: 0,
        error: `Failed to get plans: ${extractErrorMessage(errorText)}`
      }
    }

    const result = await safeJsonParse<{ plans?: SubscriptionPlan[]; total_monthly_cost?: number }>(
      response,
      { plans: [], total_monthly_cost: 0 }
    )

    // Null check: Ensure plans array exists and is valid
    if (!result || typeof result !== 'object') {
      return {
        success: false,
        plans: [],
        total_monthly_cost: 0,
        active_subscriptions_count: 0,
        total_plans_count: 0,
        error: "Invalid response from backend"
      }
    }

    const plans = Array.isArray(result.plans) ? result.plans : []

    return {
      success: true,
      plans: plans,
      total_monthly_cost: result.total_monthly_cost || 0,
      active_subscriptions_count: plans.filter(p => p.status === 'active' && (p.seats ?? 0) > 0).length,
      total_plans_count: plans.length,
    }
  } catch (error) {
    return {
      success: false,
      plans: [],
      total_monthly_cost: 0,
      active_subscriptions_count: 0,
      total_plans_count: 0,
      error: logError("getProviderPlans", error)
    }
  }
}

/**
 * Get all plans across all enabled providers for the Costs dashboard
 * Uses single API call to /all-plans endpoint to avoid N+1 queries
 */
export async function getAllPlansForCostDashboard(orgSlug: string): Promise<{
  success: boolean
  plans: (SubscriptionPlan & { provider_name: string })[]
  summary: {
    total_monthly_cost: number
    total_annual_cost: number
    count_by_category: Record<string, number>
    enabled_count: number
    total_count: number
  }
  error?: string
}> {
  try {
    await requireOrgMembership(orgSlug)

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return {
        success: false,
        plans: [],
        summary: {
          total_monthly_cost: 0,
          total_annual_cost: 0,
          count_by_category: {},
          enabled_count: 0,
          total_count: 0,
        },
        error: "Organization API key not found. Please complete organization onboarding.",
      }
    }

    // Use the new all-plans endpoint for a single API call
    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/subscriptions/${orgSlug}/all-plans`,
      {
        headers: { "X-API-Key": orgApiKey },
      }
    )

    if (!response.ok) {
      // If 404 or table doesn't exist yet, return empty success
      if (response.status === 404) {
        return {
          success: true,
          plans: [],
          summary: {
            total_monthly_cost: 0,
            total_annual_cost: 0,
            count_by_category: {},
            enabled_count: 0,
            total_count: 0,
          },
        }
      }
      const errorText = await response.text()
      return {
        success: false,
        plans: [],
        summary: {
          total_monthly_cost: 0,
          total_annual_cost: 0,
          count_by_category: {},
          enabled_count: 0,
          total_count: 0,
        },
        error: `Failed to fetch plans: ${extractErrorMessage(errorText)}`,
      }
    }

    interface AllPlansResult {
      plans?: SubscriptionPlan[]
      summary?: {
        total_monthly_cost: number
        total_annual_cost: number
        count_by_category: Record<string, number>
        enabled_count: number
        total_count: number
      }
    }
    const result = await safeJsonParse<AllPlansResult>(response, { plans: [], summary: undefined })

    // Null check: Ensure result is valid
    if (!result || typeof result !== 'object') {
      return {
        success: false,
        plans: [],
        summary: {
          total_monthly_cost: 0,
          total_annual_cost: 0,
          count_by_category: {},
          enabled_count: 0,
          total_count: 0,
        },
        error: "Invalid response from backend",
      }
    }

    // Add provider_name to each plan (it's in the provider field)
    const plansWithProviderName = Array.isArray(result.plans)
      ? result.plans.map((plan: SubscriptionPlan) => ({
          ...plan,
          provider_name: plan.provider,
        }))
      : []

    return {
      success: true,
      plans: plansWithProviderName,
      summary: result.summary || {
        total_monthly_cost: 0,
        total_annual_cost: 0,
        count_by_category: {},
        enabled_count: 0,
        total_count: 0,
      },
    }
  } catch (error) {
    return {
      success: false,
      plans: [],
      summary: {
        total_monthly_cost: 0,
        total_annual_cost: 0,
        count_by_category: {},
        enabled_count: 0,
        total_count: 0,
      },
      error: logError("getAllPlansForCostDashboard", error),
    }
  }
}

// ============================================
// FOCUS 1.3 Cost Data (Polars API)
// ============================================

/**
 * SaaS Subscription Cost record from FOCUS 1.3 standard table
 * Source: cost_data_standard_1_3 (Polars API endpoint)
 */
export interface SaaSCostRecord {
  // Identity
  BillingAccountId: string | null
  BillingAccountName: string | null
  SubAccountId: string
  SubAccountName: string | null

  // Provider & Service (FOCUS 1.3)
  ServiceProviderName: string           // New in FOCUS 1.3 (replaces Provider)
  HostProviderName: string              // New in FOCUS 1.3
  InvoiceIssuerName: string             // New in FOCUS 1.3 (replaces InvoiceIssuer)
  ProviderName: string | null           // Deprecated in FOCUS 1.3, kept for backward compat
  PublisherName: string | null          // Deprecated in FOCUS 1.3, kept for backward compat
  ServiceCategory: string
  ServiceName: string
  ServiceSubcategory: string  // Plan name

  // Cost Columns
  BilledCost: number
  EffectiveCost: number
  ListCost: number | null
  ContractedCost: number | null
  BillingCurrency: string

  // Pricing
  UnitPrice: number | null
  ListUnitPrice: number | null
  PricingCategory: string | null
  PricingCurrency: string | null
  PricingQuantity: number | null
  PricingUnit: string | null

  // Usage
  ConsumedQuantity: number | null
  ConsumedUnit: string | null
  UsageType: string

  // Charge Details
  ChargeCategory: string
  ChargeClass: string
  ChargeDescription: string
  ChargeFrequency: string

  // Resource
  ResourceId: string | null
  ResourceName: string | null
  ResourceType: string | null
  SkuId: string | null

  // Region
  RegionId: string | null
  RegionName: string | null

  // Time Periods
  BillingPeriodStart: string
  BillingPeriodEnd: string
  ChargePeriodStart: string
  ChargePeriodEnd: string

  // Metadata (FOCUS 1.3 x_ prefix extension fields)
  x_source_system: string
  x_source_record_id: string
  x_updated_at: string
  x_amortization_class: string
  x_service_model: string
  x_exchange_rate_used: number | null
  x_original_currency: string | null
  x_original_cost: number | null
  x_created_at: string

  // Org-specific extension fields (FOCUS 1.3)
  x_org_slug: string
  x_org_name: string | null
  x_org_owner_email: string | null
  x_org_default_currency: string | null
  x_org_default_timezone: string | null
  x_org_default_country: string | null
  x_org_subscription_plan: string | null
  x_org_subscription_status: string | null
  x_pipeline_id: string | null
  x_pipeline_run_id: string | null
  x_data_quality_score: number | null

  // Calculated Run Rates
  MonthlyRunRate: number
  AnnualRunRate: number
}

/**
 * Summary from SaaS subscription costs API
 */
export interface SaaSCostSummary {
  total_daily_cost: number          // Current daily rate (latest day per resource)
  total_monthly_cost: number        // MTD actual costs (sum of BilledCost in current month)
  total_annual_cost: number         // YTD actual + forecast (YTD + daily_rate * remaining_days)
  total_billed_cost: number         // Sum of all days in date range
  ytd_cost: number                  // Year-to-date actual spent
  mtd_cost: number                  // Month-to-date actual spent
  forecast_monthly_cost: number     // Current daily rate × days in current month
  forecast_annual_cost: number      // YTD + (daily rate × remaining days in year)
  providers: string[]
  service_categories: string[]
  record_count: number
  date_range: {
    start: string
    end: string
  }
  // Backend-calculated breakdowns (use these instead of client-side aggregation)
  by_provider?: Array<{
    provider: string
    total_cost: number
    record_count: number
    percentage: number
  }>
  by_category?: Array<{
    category: string
    total_cost: number
    record_count: number
    percentage: number
  }>
}

/**
 * Filter parameters for SaaS subscription cost queries
 */
export interface SaaSCostFilterParams {
  /** Filter by providers (client-side filtering) */
  providers?: string[]
  /** Filter by categories (client-side filtering) */
  categories?: string[]
  /** Filter by department ID (future backend support) */
  departmentId?: string
  /** Filter by project ID (future backend support) */
  projectId?: string
  /** Filter by team ID (future backend support) */
  teamId?: string
}

/**
 * Get SaaS subscription costs from Polars API (cost_data_standard_1_3)
 *
 * This is the SOURCE OF TRUTH for actual calculated subscription costs.
 * Data comes from the pipeline that calculates daily amortized costs in FOCUS 1.3 format.
 *
 * Use this for:
 * - Monthly/Annual cost display
 * - Cost trends and analytics
 * - Accurate cost reporting
 *
 * Use getAllPlansForCostDashboard for:
 * - Plan details (seats, status)
 * - Subscription management
 */
export async function getSaaSSubscriptionCosts(
  orgSlug: string,
  startDate?: string,
  endDate?: string,
  providerOrFilters?: string | SaaSCostFilterParams  // Optional: filter by provider(s) (client-side)
): Promise<{
  success: boolean
  data: SaaSCostRecord[]
  summary: SaaSCostSummary | null
  cache_hit: boolean
  query_time_ms: number
  currency?: string
  error?: string
}> {
  try {
    await requireOrgMembership(orgSlug)

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return {
        success: false,
        data: [],
        summary: null,
        cache_hit: false,
        query_time_ms: 0,
        error: "Organization API key not found. Please complete organization onboarding.",
      }
    }

    const apiUrl = getApiServiceUrl()
    let url = `${apiUrl}/api/v1/costs/${orgSlug}/saas-subscriptions`

    // Add date parameters if provided
    const params = new URLSearchParams()
    if (startDate) params.append("start_date", startDate)
    if (endDate) params.append("end_date", endDate)
    if (params.toString()) url += `?${params.toString()}`

    const response = await fetchWithTimeout(url, {
      headers: { "X-API-Key": orgApiKey },
    })

    if (!response.ok) {
      if (response.status === 404) {
        // No cost data yet - return empty success
        return {
          success: true,
          data: [],
          summary: null,
          cache_hit: false,
          query_time_ms: 0,
        }
      }
      const errorText = await response.text()
      return {
        success: false,
        data: [],
        summary: null,
        cache_hit: false,
        query_time_ms: 0,
        error: `Failed to fetch subscription costs: ${extractErrorMessage(errorText)}`,
      }
    }

    interface CostApiResponse {
      success: boolean
      data: SaaSCostRecord[]
      summary: SaaSCostSummary | null
      cache_hit: boolean
      query_time_ms: number
      currency?: string
      error?: string
    }

    const result = await safeJsonParse<CostApiResponse>(response, {
      success: false,
      data: [],
      summary: null,
      cache_hit: false,
      query_time_ms: 0,
    })

    // Parse filter parameters (support both legacy string and new object format)
    let providerFilters: string[] = []
    let categoryFilters: string[] = []

    if (typeof providerOrFilters === "string") {
      // Legacy: single provider string
      providerFilters = [providerOrFilters.toLowerCase()]
    } else if (providerOrFilters && typeof providerOrFilters === "object") {
      // New: filter params object
      if (providerOrFilters.providers && providerOrFilters.providers.length > 0) {
        providerFilters = providerOrFilters.providers.map(p => p.toLowerCase())
      }
      if (providerOrFilters.categories && providerOrFilters.categories.length > 0) {
        categoryFilters = providerOrFilters.categories.map(c => c.toLowerCase())
      }
    }

    // Filter by provider(s) if specified (client-side filtering)
    let filteredData = result.data || []
    if (providerFilters.length > 0 && filteredData.length > 0) {
      // Issue 6: Fix Provider filter null coalescing
      // Use ServiceProviderName (FOCUS 1.3) or ProviderName (legacy)
      filteredData = filteredData.filter((record) => {
        const recordProvider = (record.ServiceProviderName ?? record.ProviderName ?? "").toLowerCase()
        return providerFilters.includes(recordProvider)
      })
    }

    // Filter by category if specified (client-side filtering)
    if (categoryFilters.length > 0 && filteredData.length > 0) {
      filteredData = filteredData.filter((record) => {
        const recordCategory = (record.ServiceCategory ?? "").toLowerCase()
        return categoryFilters.includes(recordCategory)
      })
    }

    // Recalculate summary for filtered data (client-side filtering)
    // Note: Backend already calculates YTD/MTD/forecast values, but when filtering by provider
    // client-side, we need to recalculate. However, YTD/MTD calculations require full date range
    // data which we don't have client-side, so we'll use simplified calculations.
    let summary = result.summary
    const hasFilters = providerFilters.length > 0 || categoryFilters.length > 0
    if (hasFilters && filteredData.length > 0) {
      // Get latest record per subscription for daily rate
      const latestBySubscription = new Map<string, typeof filteredData[0]>()
      filteredData.forEach(row => {
        const subId = row.ResourceId || row.ServiceName || 'unknown'
        const existing = latestBySubscription.get(subId)
        if (!existing || row.ChargePeriodStart > existing.ChargePeriodStart) {
          latestBySubscription.set(subId, row)
        }
      })

      const latestRecords = Array.from(latestBySubscription.values())
      const totalDaily = latestRecords.reduce((sum, r) => sum + (r.BilledCost || 0), 0)
      const totalBilledCost = filteredData.reduce((sum, r) => sum + (r.BilledCost || 0), 0)

      // For filtered data, we'll use simplified forecast calculations
      // (Backend calculates these more accurately with full date range awareness)
      const today = new Date()
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
      const daysInYear = (today.getFullYear() % 4 === 0 && (today.getFullYear() % 100 !== 0 || today.getFullYear() % 400 === 0)) ? 366 : 365
      const forecastMonthly = totalDaily * daysInMonth
      const forecastAnnual = totalDaily * daysInYear

      // Extract unique providers and categories from filtered data
      const filteredProviders = Array.from(
        new Set(
          filteredData
            .map(r => r.ServiceProviderName ?? r.ProviderName)
            .filter((p): p is string => Boolean(p))
        )
      )
      const filteredCategories = Array.from(
        new Set(filteredData.map(r => r.ServiceCategory).filter(Boolean))
      )

      summary = {
        total_daily_cost: Math.round(totalDaily * 100) / 100,
        total_monthly_cost: Math.round(totalBilledCost * 100) / 100,  // Use total billed as MTD approximation
        total_annual_cost: Math.round(forecastAnnual * 100) / 100,
        total_billed_cost: Math.round(totalBilledCost * 100) / 100,
        ytd_cost: Math.round(totalBilledCost * 100) / 100,  // Approximation
        mtd_cost: Math.round(totalBilledCost * 100) / 100,  // Approximation
        forecast_monthly_cost: Math.round(forecastMonthly * 100) / 100,
        forecast_annual_cost: Math.round(forecastAnnual * 100) / 100,
        providers: filteredProviders,
        service_categories: filteredCategories,
        record_count: filteredData.length,
        date_range: result.summary?.date_range || { start: "", end: "" },
      }
    } else if (hasFilters && filteredData.length === 0) {
      summary = null  // No costs for this provider
    }

    return {
      success: result.success,
      data: filteredData,
      summary: summary,
      cache_hit: result.cache_hit,
      query_time_ms: result.query_time_ms,
      currency: result.currency,
      error: result.error,
    }
  } catch (error) {
    return {
      success: false,
      data: [],
      summary: null,
      cache_hit: false,
      query_time_ms: 0,
      currency: undefined,
      error: logError("getSaaSSubscriptionCosts", error),
    }
  }
}

/**
 * Create a custom plan
 *
 * If the plan has a start_date in the past, automatically triggers a cost backfill
 * to generate daily cost rows from start_date to today.
 */
export async function createCustomPlan(
  orgSlug: string,
  provider: string,
  plan: PlanCreate
): Promise<{
  success: boolean
  plan?: SubscriptionPlan
  backfillTriggered?: boolean
  backfillMessage?: string
  error?: string
}> {
  try {
    // Validate provider name
    const sanitizedProvider = sanitizeProviderName(provider)
    if (!sanitizedProvider || sanitizedProvider.length < 2) {
      return { success: false, error: "Invalid provider name" }
    }

    // Validate plan data
    const planValidation = validatePlanData(plan)
    if (!planValidation.valid) {
      return { success: false, error: planValidation.error }
    }

    await requireRole(orgSlug, "admin")

    // Validate currency matches org default AND ensure Supabase/BigQuery are in sync
    const { getOrgLocale, validateLocaleSync, repairLocaleSync } = await import("./organization-locale")
    const localeResult = await getOrgLocale(orgSlug)
    if (localeResult.success && localeResult.locale) {
      const orgCurrency = localeResult.locale.default_currency || "USD"
      if (plan.currency && plan.currency !== orgCurrency) {
        return {
          success: false,
          error: `Plan currency '${plan.currency}' must match organization's default currency '${orgCurrency}'`
        }
      }

      // Check if Supabase and BigQuery are in sync, auto-repair if needed
      const syncCheck = await validateLocaleSync(orgSlug)
      if (!syncCheck.inSync && syncCheck.mismatch) {
        const repairResult = await repairLocaleSync(orgSlug)
        if (!repairResult.success) {
          return {
            success: false,
            error: `Locale sync failed: ${repairResult.error}. Please update your organization settings and try again.`
          }
        }
        
      }
    }

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${sanitizedProvider}/plans`,
      {
        method: "POST",
        headers: {
          "X-API-Key": orgApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(plan),
      },
      30000 // FIX: Add explicit 30 second timeout
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to create plan: ${extractErrorMessage(errorText)}` }
    }

    const result = await safeJsonParse<{ plan?: SubscriptionPlan }>(response, { plan: undefined })

    // FIX: Validate response contains plan
    if (!result.plan) {
      return { success: false, error: "Failed to create plan: Server returned invalid response" }
    }

    // Always trigger cost pipeline to keep costs up-to-date
    // Uses start_date for backdated plans, or current month start for new plans
    let pipelineTriggered = false
    let pipelineMessage: string | undefined

    // FIX: Use UTC helper for consistent date handling
    const startDateStr = plan.start_date || getTodayDateUTC()
    const pipelineStartDate = isDateInPast(startDateStr)
      ? startDateStr
      : getMonthStart() // Use month start for current/future plans

    
    const pipelineResult = await triggerCostBackfill(orgSlug, orgApiKey, pipelineStartDate)
    pipelineTriggered = pipelineResult.success

    if (isDateInPast(startDateStr)) {
      pipelineMessage = pipelineResult.success
        ? `Historical costs calculated from ${startDateStr} to today`
        : `Plan created but cost calculation failed: ${pipelineResult.error}`
    } else {
      pipelineMessage = pipelineResult.success
        ? `Costs updated for current period`
        : `Plan created but cost calculation failed: ${pipelineResult.error}`
    }

    // Pipeline failure is logged via pipelineMessage, main operation still succeeded

    return {
      success: true,
      plan: result.plan,
      backfillTriggered: pipelineTriggered,
      backfillMessage: pipelineMessage,
    }
  } catch (error) {
    return { success: false, error: logError("createCustomPlan", error) }
  }
}

/**
 * Update a plan
 */
export async function updatePlan(
  orgSlug: string,
  provider: string,
  subscriptionId: string,
  updates: PlanUpdate
): Promise<{
  success: boolean
  plan?: SubscriptionPlan
  error?: string
}> {
  try {
    // Validate provider name
    const sanitizedProvider = sanitizeProviderName(provider)
    if (!sanitizedProvider || sanitizedProvider.length < 2) {
      return { success: false, error: "Invalid provider name" }
    }

    // Validate subscription ID format
    if (!isValidSubscriptionId(subscriptionId)) {
      return { success: false, error: "Invalid subscription ID format" }
    }

    // Validate update data
    const updateValidation = validatePlanData(updates)
    if (!updateValidation.valid) {
      return { success: false, error: updateValidation.error }
    }

    await requireRole(orgSlug, "admin")

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${sanitizedProvider}/plans/${subscriptionId}`,
      {
        method: "PUT",
        headers: {
          "X-API-Key": orgApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      },
      30000 // FIX: Add explicit 30 second timeout
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to update plan: ${extractErrorMessage(errorText)}` }
    }

    const result = await safeJsonParse<{ plan?: SubscriptionPlan }>(response, { plan: undefined })

    // FIX: Validate response contains plan
    if (!result.plan) {
      return { success: false, error: "Failed to update plan: Server returned invalid response" }
    }

    return { success: true, plan: result.plan }
  } catch (error) {
    return { success: false, error: logError("updatePlan", error) }
  }
}

/**
 * Toggle plan active/cancelled
 */
export async function togglePlan(
  orgSlug: string,
  provider: string,
  subscriptionId: string,
  enabled: boolean
): Promise<{
  success: boolean
  error?: string
}> {
  const result = await updatePlan(orgSlug, provider, subscriptionId, { status: enabled ? 'active' : 'cancelled' })
  return { success: result.success, error: result.error }
}

/**
 * Delete a plan
 */
export async function deletePlan(
  orgSlug: string,
  provider: string,
  subscriptionId: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    // Validate provider name
    const sanitizedProvider = sanitizeProviderName(provider)
    if (!sanitizedProvider || sanitizedProvider.length < 2) {
      return { success: false, error: "Invalid provider name" }
    }

    // Validate subscription ID format
    if (!isValidSubscriptionId(subscriptionId)) {
      return { success: false, error: "Invalid subscription ID format" }
    }

    await requireRole(orgSlug, "admin")

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const apiUrl = getApiServiceUrl()
    // Issue 3: Add timeout to deletePlan()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${sanitizedProvider}/plans/${subscriptionId}`,
      {
        method: "DELETE",
        headers: { "X-API-Key": orgApiKey },
      },
      30000
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to delete plan: ${extractErrorMessage(errorText)}` }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: logError("deletePlan", error) }
  }
}

/**
 * Reset provider to default plans
 */
export async function resetProvider(
  orgSlug: string,
  provider: string
): Promise<{
  success: boolean
  plans_seeded: number
  error?: string
}> {
  try {
    // Validate provider name
    const sanitizedProvider = sanitizeProviderName(provider)
    if (!sanitizedProvider || sanitizedProvider.length < 2) {
      return { success: false, plans_seeded: 0, error: "Invalid provider name" }
    }

    await requireRole(orgSlug, "admin")

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return { success: false, plans_seeded: 0, error: "Organization API key not found" }
    }

    const apiUrl = getApiServiceUrl()
    // Issue 3: Add timeout to resetProvider()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${sanitizedProvider}/reset`,
      {
        method: "POST",
        headers: {
          "X-API-Key": orgApiKey,
          "Content-Type": "application/json",
        },
      },
      30000
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, plans_seeded: 0, error: `Failed to reset: ${extractErrorMessage(errorText)}` }
    }

    const result = await safeJsonParse<{ plans_seeded?: number }>(response, { plans_seeded: 0 })
    return { success: true, plans_seeded: result.plans_seeded || 0 }
  } catch (error) {
    return { success: false, plans_seeded: 0, error: logError("resetProvider", error) }
  }
}

/**
 * Edit a plan with version history
 * Creates a new row with the updated values, sets end_date on the old row
 *
 * @param orgSlug - Organization slug
 * @param provider - Provider name
 * @param subscriptionId - Current subscription ID to edit
 * @param effectiveDate - Date when the new version takes effect (YYYY-MM-DD)
 * @param updates - Fields to update in the new version
 */
export async function editPlanWithVersion(
  orgSlug: string,
  provider: string,
  subscriptionId: string,
  effectiveDate: string,
  updates: PlanUpdate
): Promise<{
  success: boolean
  newPlan?: SubscriptionPlan
  oldPlan?: SubscriptionPlan
  pipelineTriggered?: boolean
  pipelineMessage?: string
  error?: string
}> {
  try {
    // Validate provider name
    const sanitizedProvider = sanitizeProviderName(provider)
    if (!sanitizedProvider || sanitizedProvider.length < 2) {
      return { success: false, error: "Invalid provider name" }
    }

    // Validate subscription ID format
    if (!isValidSubscriptionId(subscriptionId)) {
      return { success: false, error: "Invalid subscription ID format" }
    }

    // Validate effective date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
      return { success: false, error: "Invalid date format. Use YYYY-MM-DD" }
    }

    // FIX: Validate effective_date is not in the past using UTC string comparison
    // This avoids timezone-related bugs where local Date parsing can shift dates
    const todayUTC = getTodayDateUTC()
    if (effectiveDate < todayUTC) {
      return { success: false, error: "Effective date cannot be in the past" }
    }

    // Validate update data
    const updateValidation = validatePlanData(updates)
    if (!updateValidation.valid) {
      return { success: false, error: updateValidation.error }
    }

    await requireRole(orgSlug, "admin")

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${sanitizedProvider}/plans/${subscriptionId}/edit-version`,
      {
        method: "POST",
        headers: {
          "X-API-Key": orgApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          effective_date: effectiveDate,
          ...updates,
        }),
      },
      30000 // FIX: Add explicit 30 second timeout
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to create plan version: ${extractErrorMessage(errorText)}` }
    }

    const result = await safeJsonParse<{ new_plan?: SubscriptionPlan; old_plan?: SubscriptionPlan }>(
      response,
      { new_plan: undefined, old_plan: undefined }
    )

    // FIX: Validate response contains plans
    if (!result.new_plan || !result.old_plan) {
      return { success: false, error: "Failed to create plan version: Server returned invalid response" }
    }

    // Trigger cost pipeline to recalculate costs with the new version
    // Start from the effective date if in past, or month start otherwise
    const pipelineStartDate = isDateInPast(effectiveDate) ? effectiveDate : getMonthStart()

    
    const pipelineResult = await triggerCostBackfill(orgSlug, orgApiKey, pipelineStartDate)

    const pipelineMessage = pipelineResult.success
      ? `Costs recalculated from ${pipelineStartDate}`
      : `Plan updated but cost recalculation failed: ${pipelineResult.error}`

    // Pipeline failure is logged via pipelineMessage, main operation still succeeded

    return {
      success: true,
      newPlan: result.new_plan,
      oldPlan: result.old_plan,
      pipelineTriggered: pipelineResult.success,
      pipelineMessage,
    }
  } catch (error) {
    return { success: false, error: logError("editPlanWithVersion", error) }
  }
}

/**
 * End a subscription (soft delete)
 * Sets end_date and status='cancelled' instead of hard deleting
 * Triggers cost pipeline to recalculate costs excluding future dates
 *
 * @param orgSlug - Organization slug
 * @param provider - Provider name
 * @param subscriptionId - Subscription ID to end
 * @param endDate - Date when the subscription ends (YYYY-MM-DD)
 */
export async function endSubscription(
  orgSlug: string,
  provider: string,
  subscriptionId: string,
  endDate: string
): Promise<{
  success: boolean
  plan?: SubscriptionPlan
  pipelineTriggered?: boolean
  pipelineMessage?: string
  error?: string
}> {
  try {
    // Validate provider name
    const sanitizedProvider = sanitizeProviderName(provider)
    if (!sanitizedProvider || sanitizedProvider.length < 2) {
      return { success: false, error: "Invalid provider name" }
    }

    // Validate subscription ID format
    if (!isValidSubscriptionId(subscriptionId)) {
      return { success: false, error: "Invalid subscription ID format" }
    }

    // Validate end date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return { success: false, error: "Invalid date format. Use YYYY-MM-DD" }
    }

    await requireRole(orgSlug, "admin")

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return { success: false, error: "Organization API key not found" }
    }

    // Use the existing update endpoint with end_date and status
    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${sanitizedProvider}/plans/${subscriptionId}`,
      {
        method: "PUT",
        headers: {
          "X-API-Key": orgApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          end_date: endDate,
          status: 'cancelled',
        }),
      },
      30000
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to end subscription: ${extractErrorMessage(errorText)}` }
    }

    const result = await safeJsonParse<{ plan?: SubscriptionPlan }>(response, { plan: undefined })

    // Trigger cost pipeline to recalculate costs (will exclude dates after end_date)
    const pipelineStartDate = getMonthStart()

    
    const pipelineResult = await triggerCostBackfill(orgSlug, orgApiKey, pipelineStartDate)

    const pipelineMessage = pipelineResult.success
      ? `Costs recalculated (subscription ended on ${endDate})`
      : `Subscription ended but cost recalculation failed: ${pipelineResult.error}`

    // Pipeline failure is logged via pipelineMessage, main operation still succeeded

    return {
      success: true,
      plan: result.plan,
      pipelineTriggered: pipelineResult.success,
      pipelineMessage,
    }
  } catch (error) {
    return { success: false, error: logError("endSubscription", error) }
  }
}

/**
 * Available plan template from CSV seed data
 */
export interface AvailablePlan {
  plan_name: string
  display_name: string
  billing_cycle: string
  pricing_model: 'PER_SEAT' | 'FLAT_FEE'
  unit_price: number
  yearly_price?: number
  notes?: string
  seats: number
  category: string
  discount_type?: 'percent' | 'fixed'
  discount_value?: number
}

/**
 * Get available predefined plans for a provider (from seed data)
 *
 * @param orgSlug - Organization slug
 * @param provider - Provider name
 */
export async function getAvailablePlans(
  orgSlug: string,
  provider: string
): Promise<{
  success: boolean
  plans: AvailablePlan[]
  error?: string
}> {
  try {
    // Validate provider name
    const sanitizedProvider = sanitizeProviderName(provider)
    if (!sanitizedProvider || sanitizedProvider.length < 2) {
      return { success: false, plans: [], error: "Invalid provider name" }
    }

    await requireOrgMembership(orgSlug)

    const orgApiKey = await getOrgApiKeySecure(orgSlug)
    if (!orgApiKey) {
      return {
        success: false,
        plans: [],
        error: "Organization API key not found"
      }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/subscriptions/${orgSlug}/providers/${sanitizedProvider}/available-plans`,
      {
        headers: { "X-API-Key": orgApiKey },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        plans: [],
        error: `Failed to get available plans: ${extractErrorMessage(errorText)}`
      }
    }

    const result = await safeJsonParse<{ success?: boolean; plans?: AvailablePlan[] }>(
      response,
      { success: false, plans: [] }
    )

    return {
      success: result.success || true,
      plans: result.plans || [],
    }
  } catch (error) {
    return {
      success: false,
      plans: [],
      error: logError("getAvailablePlans", error),
    }
  }
}
