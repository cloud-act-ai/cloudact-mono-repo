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
 * 3. Input Validation: orgSlug and pipelineId validated with zod (Issue #23)
 * 4. API Key: Retrieved from secure server-side storage (not user metadata)
 */

import { createClient } from "@/lib/supabase/server"
import { BackendClient, PipelineConfig, PipelineRunsResponse, PipelineRunDetail } from "@/lib/api/backend"
import { getCachedApiKey } from "@/lib/auth-cache"
import { pipelineRunParamsSchema, pipelineRunWithDateSchema, validateInput } from "@/lib/validation/schemas"

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
  result?: unknown
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

// LRU Cache implementation for pipelines
// Issue #19: Implement LRU cache with max size to prevent memory leaks
class LRUCache<K, V> {
  private cache: Map<K, V>
  private maxSize: number

  constructor(maxSize: number = 1000) {
    this.cache = new Map()
    this.maxSize = maxSize
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key)
      this.cache.set(key, value)
    }
    return value
  }

  set(key: K, value: V): void {
    // Remove if exists (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }
    // Add to end
    this.cache.set(key, value)
    // Evict oldest if over max size
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }
}

// Cache for pipelines (refreshed on demand)
// Using LRU cache to prevent unbounded growth
interface CacheEntry {
  pipelines: PipelineConfig[]
  timestamp: number
}

const pipelinesCache = new LRUCache<string, CacheEntry>(1000)
const PIPELINES_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const CACHE_KEY = "pipelines_list" // Single cache key for now

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
    // Check LRU cache first (Issue #19)
    const now = Date.now()
    const cached = pipelinesCache.get(CACHE_KEY)
    if (cached && (now - cached.timestamp) < PIPELINES_CACHE_TTL) {
      return { success: true, pipelines: cached.pipelines }
    }

    // Fetch from API
    const backend = new BackendClient({})
    const response = await backend.listPipelines()

    if (response.success) {
      // Store in LRU cache
      pipelinesCache.set(CACHE_KEY, {
        pipelines: response.pipelines,
        timestamp: now,
      })
      return { success: true, pipelines: response.pipelines }
    }

    // Clear cache on API failure
    pipelinesCache.clear()

    // Fall back to hardcoded defaults if API fails
    
    return { success: true, pipelines: FALLBACK_PIPELINES }
  } catch (pipelineError) {
    // Clear cache on error
    pipelinesCache.clear()
    if (process.env.NODE_ENV === "development") {
      console.warn("[getAvailablePipelines] Failed to fetch pipelines, using fallback:", pipelineError)
    }
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
  // GenAI PAYG Pipelines
  {
    id: "genai_payg_openai",
    name: "OpenAI Usage & Cost",
    description: "Extract OpenAI token usage and calculate daily costs",
    provider: "genai",
    domain: "payg",
    pipeline: "openai",
    required_integration: "OPENAI",
    enabled: true,
  },
  {
    id: "genai_payg_anthropic",
    name: "Anthropic Usage & Cost",
    description: "Extract Anthropic token usage and calculate daily costs",
    provider: "genai",
    domain: "payg",
    pipeline: "anthropic",
    required_integration: "ANTHROPIC",
    enabled: true,
  },
  {
    id: "genai_payg_gemini",
    name: "Gemini Usage & Cost",
    description: "Extract Gemini token usage and calculate daily costs",
    provider: "genai",
    domain: "payg",
    pipeline: "gemini",
    required_integration: "GEMINI",
    enabled: true,
  },
  {
    id: "genai_payg_deepseek",
    name: "DeepSeek Usage & Cost",
    description: "Extract DeepSeek token usage and calculate daily costs",
    provider: "genai",
    domain: "payg",
    pipeline: "deepseek",
    required_integration: "DEEPSEEK",
    enabled: true,
  },
  {
    id: "genai_payg_azure_openai",
    name: "Azure OpenAI Usage & Cost",
    description: "Extract Azure OpenAI token usage and calculate daily costs",
    provider: "genai",
    domain: "payg",
    pipeline: "azure_openai",
    required_integration: "AZURE_OPENAI",
    enabled: true,
  },
  // GenAI Commitment Pipelines
  {
    id: "genai_commitment_aws_bedrock",
    name: "AWS Bedrock Provisioned Throughput",
    description: "Extract AWS Bedrock PT usage and calculate commitment costs",
    provider: "genai",
    domain: "commitment",
    pipeline: "aws_bedrock",
    required_integration: "AWS_BEDROCK",
    enabled: true,
  },
  {
    id: "genai_commitment_azure_ptu",
    name: "Azure OpenAI PTU Commitment",
    description: "Extract Azure OpenAI PTU usage and calculate commitment costs",
    provider: "genai",
    domain: "commitment",
    pipeline: "azure_ptu",
    required_integration: "AZURE_OPENAI",
    enabled: true,
  },
  {
    id: "genai_commitment_gcp_vertex",
    name: "GCP Vertex AI GSU Commitment",
    description: "Extract GCP Vertex AI GSU usage and calculate commitment costs",
    provider: "genai",
    domain: "commitment",
    pipeline: "gcp_vertex",
    required_integration: "GCP_VERTEX",
    enabled: true,
  },
  // GenAI Infrastructure Pipeline
  {
    id: "genai_infrastructure_gcp_gpu",
    name: "GCP GPU Infrastructure",
    description: "Extract GCP GPU/TPU usage and calculate infrastructure costs",
    provider: "genai",
    domain: "infrastructure",
    pipeline: "gcp_gpu",
    required_integration: "GCP_SA",
    enabled: true,
  },
  // GenAI Unified Pipeline
  {
    id: "genai_unified_consolidate",
    name: "GenAI Unified Consolidation",
    description: "Consolidate PAYG, Commitment, and Infrastructure costs into unified tables and FOCUS 1.3",
    provider: "genai",
    domain: "unified",
    pipeline: "consolidate",
    required_integration: "",
    enabled: true,
  },
  {
    id: "subscription_costs",
    name: "Subscription Costs",
    description: "Calculate daily amortized costs from subscription plans",
    provider: "subscription",
    domain: "costs",  // configs/subscription/costs/subscription_cost.yml
    pipeline: "subscription_cost",
    required_integration: "",  // No external integration needed
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
  return await getCachedApiKey(orgSlug)
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
  params?: Record<string, unknown>
): Promise<PipelineRunResult> {
  try {
    // Step 1: Validate inputs with zod (Issue #23)
    const validation = validateInput(pipelineRunParamsSchema, { orgSlug, pipelineId, params })
    if (!validation.success || !validation.data) {
      return {
        success: false,
        error: validation.error || "Invalid input parameters",
      }
    }

    const { orgSlug: validOrgSlug, pipelineId: validPipelineId, params: validParams } = validation.data

    // Legacy validation kept for backward compatibility
    if (!isValidOrgSlug(validOrgSlug)) {
      return {
        success: false,
        error: "Invalid organization identifier",
      }
    }

    if (!isValidPipelineId(validPipelineId)) {
      return {
        success: false,
        error: "Invalid pipeline identifier",
      }
    }

    // Step 2: Verify authentication and authorization
    // Verify authentication (use cached auth for performance)
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(validOrgSlug)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Not authorized",
      }
    }

    // Step 3: Get API key using validated orgSlug
    const apiKey = await getOrgApiKey(validOrgSlug)

    if (!apiKey) {
      return {
        success: false,
        error: "Organization API key not found. Please complete backend onboarding first.",
      }
    }

    // Step 4: Fetch organization data (billing status, integration statuses)
    const supabase = await createClient()
    const { data: orgData, error: orgError } = await supabase
      .from("organizations")
      .select("id, org_slug, billing_status, integration_gcp_status, integration_openai_status, integration_anthropic_status")
      .eq("org_slug", validOrgSlug)
      .single()

    if (orgError || !orgData) {
      return {
        success: false,
        error: "Failed to fetch organization data. Please try again.",
      }
    }

    // Step 5: Validate pipeline exists (fetch from API)
    const pipelinesResult = await getAvailablePipelines()
    const pipeline = pipelinesResult.pipelines.find(p => p.id === validPipelineId)
    if (!pipeline) {
      return {
        success: false,
        error: `Unknown pipeline: ${validPipelineId}. Available: ${pipelinesResult.pipelines.map(p => p.id).join(", ")}`,
      }
    }

    // Step 6: Verify subscription is active
    const org = orgData
    // IMPORTANT: Status values are case-insensitive to handle both frontend (lowercase)
    // and backend (UPPERCASE) conventions. Backend uses ACTIVE/TRIAL, Supabase uses active/trialing.
    const billingStatus = org.billing_status?.toLowerCase() || ""
    const isValidStatus = billingStatus === "active" || billingStatus === "trialing" ||
                          billingStatus === "trial"  // Backend uses TRIAL, not TRIALING
    if (!isValidStatus) {
      return {
        success: false,
        error: `Subscription is not active. Current status: ${org.billing_status || "unknown"}. Please update your billing.`,
      }
    }

    // Step 7: Verify required integration is configured
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

    // Step 8: Execute pipeline with validated parameters
    const backend = new BackendClient({ orgApiKey: apiKey })

    const response = await backend.runPipeline(
      validOrgSlug,
      pipeline.provider,
      pipeline.domain,
      pipeline.pipeline,
      validParams || {}
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
  } catch (err: unknown) {
    
    const errorMessage = err instanceof Error && 'detail' in err
      ? (err as Error & { detail?: string }).detail
      : err instanceof Error
      ? err.message
      : "Pipeline run failed"
    return {
      success: false,
      error: errorMessage,
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
  // Validate with zod (Issue #23)
  const validation = validateInput(pipelineRunWithDateSchema, { orgSlug, date })
  if (!validation.success || !validation.data) {
    return {
      success: false,
      error: validation.error || "Invalid input parameters",
    }
  }

  return runPipeline(validation.data.orgSlug, "gcp_billing", { date: validation.data.date })
}

// Legacy alias for backward compatibility
export const runGcpCostBillingPipeline = runGcpBillingPipeline

// ============================================
// Pipeline Logs Actions
// ============================================

/**
 * Poll pipeline run status until completion or timeout.
 * Useful for tracking async pipeline execution.
 *
 * @param orgSlug - Organization slug
 * @param runId - Pipeline run ID to poll
 * @param options - Polling options
 * @returns Final status when complete or timeout
 */
export async function pollPipelineStatus(
  orgSlug: string,
  runId: string,
  options?: {
    maxAttempts?: number      // Default: 30 (5 minutes with 10s interval)
    intervalMs?: number       // Default: 10000 (10 seconds)
    onStatusChange?: (status: string) => void
  }
): Promise<{
  success: boolean
  status?: string
  completed?: boolean
  error?: string
}> {
  const maxAttempts = options?.maxAttempts ?? 30
  const intervalMs = options?.intervalMs ?? 10000

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await getPipelineRunDetail(orgSlug, runId)

    if (!result.success) {
      return { success: false, error: result.error }
    }

    const status = result.data?.status || "UNKNOWN"
    options?.onStatusChange?.(status)

    // Check for terminal states
    if (["COMPLETED", "FAILED", "CANCELLED", "TIMEOUT"].includes(status)) {
      return {
        success: true,
        status,
        completed: true,
      }
    }

    // Wait before next poll (except on last attempt)
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
  }

  return {
    success: true,
    status: "POLLING_TIMEOUT",
    completed: false,
    error: `Pipeline still running after ${maxAttempts * intervalMs / 1000}s`,
  }
}

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
    // Verify authentication (use cached auth for performance)
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(orgSlug)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Not authorized",
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
  } catch (err: unknown) {
    
    const errorMessage = err instanceof Error && 'detail' in err
      ? (err as Error & { detail?: string }).detail
      : err instanceof Error
      ? err.message
      : "Failed to fetch pipeline runs"
    return {
      success: false,
      error: errorMessage,
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
    // Verify authentication (use cached auth for performance)
    const { requireOrgMembership } = await import("@/lib/auth-cache")
    try {
      await requireOrgMembership(orgSlug)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Not authorized",
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
  } catch (err: unknown) {
    
    const errorMessage = err instanceof Error && 'detail' in err
      ? (err as Error & { detail?: string }).detail
      : err instanceof Error
      ? err.message
      : "Failed to fetch pipeline run details"
    return {
      success: false,
      error: errorMessage,
    }
  }
}
