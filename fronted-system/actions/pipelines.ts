"use server"

/**
 * Pipeline Management Server Actions
 *
 * Handles running data pipelines via the backend.
 * All pipeline runs require a valid org API key.
 *
 * SECURITY MEASURES:
 * 1. Authentication: All actions require authenticated user
 * 2. Authorization: User must be a member of the organization
 * 3. Input Validation: orgSlug and pipelineId validated
 * 4. API Key: Retrieved from secure server-side storage (not user metadata)
 */

import { createClient } from "@/lib/supabase/server"
import { BackendClient, PipelineConfig, PipelinesListResponse, PipelineRunsResponse, PipelineRunDetail } from "@/lib/api/backend"
import { getOrgApiKeySecure } from "@/actions/backend-onboarding"

// ============================================
// Types (internal only - not exported)
// ============================================

// PipelineConfig is imported from @/lib/api/backend

interface PipelineRunResult {
  success: boolean
  pipelineId?: string
  runId?: string
  status?: string
  message?: string
  error?: string
  result?: any
}

// ============================================
// Input Validation
// ============================================

/**
 * Validate org slug format.
 * Prevents path traversal and injection attacks.
 */
// Backend requires: alphanumeric with underscores only (no hyphens), 3-50 characters
function isValidOrgSlug(orgSlug: string): boolean {
  if (!orgSlug || typeof orgSlug !== "string") return false
  return /^[a-zA-Z0-9_]{3,50}$/.test(orgSlug)
}

/**
 * Validate pipeline ID format.
 */
function isValidPipelineId(pipelineId: string): boolean {
  if (!pipelineId || typeof pipelineId !== "string") return false
  return /^[a-zA-Z0-9_-]{1,50}$/.test(pipelineId)
}

// ============================================
// Authorization Helper
// ============================================

/**
 * Organization data returned from membership verification.
 * Includes all fields needed for pipeline execution checks.
 */
interface OrgAuthData {
  id: string
  org_slug: string
  billing_status: string | null
  integration_gcp_status: string | null
  integration_openai_status: string | null
  integration_anthropic_status: string | null
}

/**
 * Verify user is authenticated and belongs to the organization.
 * SECURITY: Prevents unauthorized access to other orgs' pipelines.
 *
 * FIX: Uses join query pattern to work with RLS policies that restrict
 * direct access to organizations table. Fetches ALL needed org data in
 * a single query to avoid redundant DB calls.
 */
async function verifyOrgMembership(orgSlug: string): Promise<{
  authorized: boolean
  userId?: string
  orgId?: string
  orgData?: OrgAuthData
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { authorized: false, error: "Not authenticated" }
  }

  // Use join query pattern - this works with RLS policies that restrict
  // direct access to organizations table. Query organization_members with
  // inner join to organizations, filtered by user_id and org_slug.
  // Fetch ALL needed org data in ONE query (subscription, integrations).
  const { data: membership, error: memberError } = await supabase
    .from("organization_members")
    .select("id, role, status, org_id, organizations!inner(id, org_slug, billing_status, integration_gcp_status, integration_openai_status, integration_anthropic_status)")
    .eq("user_id", user.id)
    .eq("organizations.org_slug", orgSlug)
    .eq("status", "active")
    .single()

  if (memberError || !membership) {
    // Provide more specific error based on query result
    if (memberError?.code === "PGRST116") {
      // No rows returned - either org doesn't exist or user not a member
      return { authorized: false, userId: user.id, error: "Organization not found or you are not a member" }
    }
    return { authorized: false, userId: user.id, error: memberError?.message || "Not a member of this organization" }
  }

  // Extract org data from the joined result
  const orgData = (membership.organizations && Array.isArray(membership.organizations))
    ? membership.organizations[0]
    : membership.organizations as OrgAuthData

  return { authorized: true, userId: user.id, orgId: orgData.id, orgData }
}

// ============================================
// Available Pipelines (fetched from API)
// ============================================

// Cache for pipelines (refreshed on demand)
let pipelinesCache: PipelineConfig[] | null = null
let pipelinesCacheTime: number = 0
const PIPELINES_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Get available pipelines from the backend API.
 * Caches results for 5 minutes to reduce API calls.
 */
export async function getAvailablePipelines(): Promise<{
  success: boolean
  pipelines: PipelineConfig[]
  error?: string
}> {
  try {
    // Check cache first
    const now = Date.now()
    if (pipelinesCache && (now - pipelinesCacheTime) < PIPELINES_CACHE_TTL) {
      return { success: true, pipelines: pipelinesCache }
    }

    // Fetch from API
    const backend = new BackendClient({})
    const response = await backend.listPipelines()

    if (response.success) {
      pipelinesCache = response.pipelines
      pipelinesCacheTime = now
      return { success: true, pipelines: response.pipelines }
    }

    // Clear cache on API failure
    pipelinesCache = null
    pipelinesCacheTime = 0

    // Fall back to hardcoded defaults if API fails
    console.error("[Pipelines] Failed to fetch from API, using defaults")
    return { success: true, pipelines: FALLBACK_PIPELINES }
  } catch (err: any) {
    console.error("[Pipelines] Error fetching pipelines:", err)
    // Clear cache on error
    pipelinesCache = null
    pipelinesCacheTime = 0
    // Fall back to hardcoded defaults
    return { success: true, pipelines: FALLBACK_PIPELINES }
  }
}

// Fallback pipelines if API is unavailable
// NOTE: These should match api-service's pipeline_validator.py defaults
// Domain must match config path: configs/{provider}/{domain}/{pipeline}.yml
const FALLBACK_PIPELINES: PipelineConfig[] = [
  {
    id: "gcp_billing",
    name: "GCP Billing",
    description: "Extract daily billing cost data from GCP Cloud Billing export",
    provider: "gcp",
    domain: "cost",  // configs/gcp/cost/billing.yml
    pipeline: "billing",
    required_integration: "GCP_SA",
    enabled: true,
  },
  {
    id: "openai_usage_cost",
    name: "OpenAI Usage & Cost",
    description: "Extract usage data and calculate costs from OpenAI API",
    provider: "openai",
    domain: "",  // configs/openai/usage_cost.yml (no subdomain)
    pipeline: "usage_cost",
    required_integration: "OPENAI",
    enabled: true,
  },
  {
    id: "anthropic_usage_cost",
    name: "Anthropic Usage & Cost",
    description: "Extract usage data and calculate costs from Anthropic API",
    provider: "anthropic",
    domain: "",  // configs/anthropic/usage_cost.yml (no subdomain)
    pipeline: "usage_cost",
    required_integration: "ANTHROPIC",
    enabled: true,
  },
]

// ============================================
// Helper: Get Org API Key (from secure storage)
// ============================================

/**
 * Get org API key from secure server-side storage.
 * SECURITY: Uses service_role client to read from RLS-protected table.
 * API keys are NEVER exposed to the browser.
 */
async function getOrgApiKey(orgSlug: string): Promise<string | null> {
  // Get from secure server-side storage (NOT user_metadata)
  return await getOrgApiKeySecure(orgSlug)
}

// ============================================
// Pipeline Actions
// ============================================

/**
 * Run a pipeline by ID.
 *
 * SECURITY:
 * - Validates input formats
 * - Requires authenticated user
 * - Verifies user belongs to organization
 */
export async function runPipeline(
  orgSlug: string,
  pipelineId: string,
  params?: { date?: string; [key: string]: any }
): Promise<PipelineRunResult> {
  try {
    // Step 1: Validate inputs
    if (!isValidOrgSlug(orgSlug)) {
      return {
        success: false,
        error: "Invalid organization identifier",
      }
    }

    if (!isValidPipelineId(pipelineId)) {
      return {
        success: false,
        error: "Invalid pipeline identifier",
      }
    }

    // Step 2: Verify authentication and authorization
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return {
        success: false,
        error: authResult.error || "Not authorized",
      }
    }

    // Step 3: Get API key
    const apiKey = await getOrgApiKey(orgSlug)

    if (!apiKey) {
      return {
        success: false,
        error: "Organization API key not found. Please complete backend onboarding first.",
      }
    }

    // Step 4: Validate pipeline exists (fetch from API)
    const pipelinesResult = await getAvailablePipelines()
    const pipeline = pipelinesResult.pipelines.find(p => p.id === pipelineId)
    if (!pipeline) {
      return {
        success: false,
        error: `Unknown pipeline: ${pipelineId}. Available: ${pipelinesResult.pipelines.map(p => p.id).join(", ")}`,
      }
    }

    // Step 5: Verify subscription is active (using data from verifyOrgMembership)
    if (!authResult.orgData) {
      return {
        success: false,
        error: "Organization data not available. Please try again.",
      }
    }

    const org = authResult.orgData
    const validSubscriptionStatuses = ["active", "trialing"]
    if (!validSubscriptionStatuses.includes(org.billing_status || "")) {
      return {
        success: false,
        error: `Subscription is not active. Current status: ${org.billing_status || "unknown"}. Please update your billing.`,
      }
    }

    // Step 6: Verify required integration is configured (using data from verifyOrgMembership)
    const requiredIntegration = pipeline.required_integration
    if (requiredIntegration) {
      const integrationStatusMap: Record<string, string | null> = {
        "GCP_SA": org.integration_gcp_status,
        "OPENAI": org.integration_openai_status,
        "ANTHROPIC": org.integration_anthropic_status,
      }

      const integrationStatus = integrationStatusMap[requiredIntegration]
      if (integrationStatus !== "VALID") {
        return {
          success: false,
          error: `Required integration "${pipeline.required_integration}" is not configured or invalid. Please set up the integration first.`,
        }
      }
    }

    // Step 7: Execute pipeline
    const backend = new BackendClient({ orgApiKey: apiKey })

    const response = await backend.runPipeline(
      orgSlug,
      pipeline.provider,
      pipeline.domain,
      pipeline.pipeline,
      params
    )

    // Backend returns PENDING for async pipelines (background execution)
    // Also accept SUCCESS, COMPLETED, and RUNNING as successful triggers
    const isSuccess = ["PENDING", "RUNNING", "SUCCESS", "COMPLETED"].includes(response.status)

    return {
      success: isSuccess,
      pipelineId: response.pipeline_id,
      runId: response.run_id,
      status: response.status,
      message: response.message,
      result: response.result,
    }
  } catch (err: any) {
    console.error(`[Pipelines] Run ${pipelineId} error:`, err)
    return {
      success: false,
      error: err.detail || err.message || "Pipeline run failed",
    }
  }
}

/**
 * Run GCP Billing pipeline with optional date.
 * Convenience wrapper for the most common pipeline.
 */
export async function runGcpBillingPipeline(
  orgSlug: string,
  date?: string
): Promise<PipelineRunResult> {
  return runPipeline(orgSlug, "gcp_billing", { date })
}

// Legacy alias for backward compatibility
export const runGcpCostBillingPipeline = runGcpBillingPipeline

// ============================================
// Pipeline Logs Actions
// ============================================

/**
 * Get pipeline runs (execution history) for an organization.
 *
 * SECURITY:
 * - Validates org slug format
 * - Requires authenticated user
 * - Verifies user belongs to organization
 */
export async function getPipelineRuns(
  orgSlug: string,
  options?: {
    status?: string
    pipelineId?: string
    startDate?: string
    endDate?: string
    limit?: number
    offset?: number
  }
): Promise<{
  success: boolean
  data?: PipelineRunsResponse
  error?: string
}> {
  try {
    // Step 1: Validate inputs
    if (!isValidOrgSlug(orgSlug)) {
      return {
        success: false,
        error: "Invalid organization identifier",
      }
    }

    // Step 2: Verify authentication and authorization
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return {
        success: false,
        error: authResult.error || "Not authorized",
      }
    }

    // Step 3: Get API key
    const apiKey = await getOrgApiKey(orgSlug)

    if (!apiKey) {
      return {
        success: false,
        error: "Organization API key not found. Please complete backend onboarding first.",
      }
    }

    // Step 4: Fetch pipeline runs from backend
    const backend = new BackendClient({ orgApiKey: apiKey })
    const response = await backend.listPipelineRuns(orgSlug, options)

    return {
      success: true,
      data: response,
    }
  } catch (err: any) {
    console.error(`[Pipelines] Get runs error:`, err)
    return {
      success: false,
      error: err.detail || err.message || "Failed to fetch pipeline runs",
    }
  }
}

/**
 * Get detailed pipeline run with step logs.
 *
 * SECURITY:
 * - Validates org slug format
 * - Requires authenticated user
 * - Verifies user belongs to organization
 */
export async function getPipelineRunDetail(
  orgSlug: string,
  pipelineLoggingId: string
): Promise<{
  success: boolean
  data?: PipelineRunDetail
  error?: string
}> {
  try {
    // Step 1: Validate inputs
    if (!isValidOrgSlug(orgSlug)) {
      return {
        success: false,
        error: "Invalid organization identifier",
      }
    }

    if (!pipelineLoggingId || typeof pipelineLoggingId !== "string") {
      return {
        success: false,
        error: "Invalid pipeline run identifier",
      }
    }

    // Step 2: Verify authentication and authorization
    const authResult = await verifyOrgMembership(orgSlug)
    if (!authResult.authorized) {
      return {
        success: false,
        error: authResult.error || "Not authorized",
      }
    }

    // Step 3: Get API key
    const apiKey = await getOrgApiKey(orgSlug)

    if (!apiKey) {
      return {
        success: false,
        error: "Organization API key not found. Please complete backend onboarding first.",
      }
    }

    // Step 4: Fetch pipeline run detail from backend
    const backend = new BackendClient({ orgApiKey: apiKey })
    const response = await backend.getPipelineRunDetail(orgSlug, pipelineLoggingId)

    return {
      success: true,
      data: response,
    }
  } catch (err: any) {
    console.error(`[Pipelines] Get run detail error:`, err)
    return {
      success: false,
      error: err.detail || err.message || "Failed to fetch pipeline run details",
    }
  }
}
