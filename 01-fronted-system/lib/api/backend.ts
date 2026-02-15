/**
 * Pipeline Backend API Client
 *
 * Client for communicating with the FastAPI backends:
 * - api-service (8000): Onboarding, integrations, LLM data management
 * - convergence-data-pipeline (8001): Pipeline execution
 *
 * Configuration via environment variables:
 * - API_SERVICE_URL / NEXT_PUBLIC_API_SERVICE_URL: api-service URL for onboarding/integrations (required)
 * - PIPELINE_SERVICE_URL / NEXT_PUBLIC_PIPELINE_SERVICE_URL: pipeline service URL for execution (optional)
 */

function getApiServiceUrl(): string {
  // Use server-side env var first, fall back to NEXT_PUBLIC_ version
  const url = process.env.API_SERVICE_URL || process.env.NEXT_PUBLIC_API_SERVICE_URL
  if (!url) {
    throw new Error(
      "API_SERVICE_URL or NEXT_PUBLIC_API_SERVICE_URL environment variable is not set. " +
      "Please configure it in your .env.local file."
    )
  }
  // Validate URL format
  try {
    new URL(url)
  } catch {
    throw new Error(
      `API service URL is not a valid URL: "${url}". ` +
      "Expected format: https://example.com or http://localhost:8000"
    )
  }
  return url
}

/**
 * Get the pipeline execution service URL.
 * This is the convergence-data-pipeline service that runs pipelines.
 * Falls back to the api-service URL if not separately configured.
 */
function getPipelineServiceUrl(): string {
  const url = process.env.PIPELINE_SERVICE_URL || process.env.NEXT_PUBLIC_PIPELINE_SERVICE_URL
  if (!url) {
    // Fall back to api-service URL if pipeline service URL not configured
    return getApiServiceUrl()
  }
  // Validate URL format
  try {
    new URL(url)
  } catch {
    throw new Error(
      `Pipeline service URL is not a valid URL: "${url}". ` +
      "Expected format: https://example.com or http://localhost:8001"
    )
  }
  return url
}

/**
 * Validate org_slug format.
 * Prevents path traversal and injection attacks.
 * MUST match backend validation: lowercase alphanumeric + underscore only, 3-50 chars
 */
function validateOrgSlug(orgSlug: string): void {
  if (!orgSlug || typeof orgSlug !== "string") {
    throw new Error("org_slug is required and must be a string")
  }
  // Match backend validation: lowercase alphanumeric + underscore only, 3-50 chars (NO hyphens, NO uppercase)
  if (!/^[a-z0-9_]{3,50}$/.test(orgSlug)) {
    throw new Error(
      `Invalid org_slug format: "${orgSlug}". ` +
      "Must be 3-50 characters, lowercase alphanumeric with underscores only (no hyphens, no uppercase)."
    )
  }
}

// ============================================
// Types
// ============================================

export interface OnboardOrgRequest {
  org_slug: string
  company_name: string
  admin_email: string
  subscription_plan: "STARTER" | "PROFESSIONAL" | "SCALE"
  // i18n fields (set at signup)
  default_currency?: string  // ISO 4217 code (e.g., USD, AED)
  default_timezone?: string  // IANA timezone (e.g., UTC, Asia/Dubai)
  regenerate_api_key_if_exists?: boolean
}

export interface OnboardOrgResponse {
  org_slug: string
  api_key: string // Plaintext, shown ONCE
  subscription_plan: string
  // i18n fields
  default_currency?: string  // ISO 4217 code
  default_country?: string   // ISO 3166-1 alpha-2 (auto-inferred from currency)
  default_language?: string  // BCP 47 (always "en" for now)
  default_timezone?: string  // IANA timezone
  dataset_location?: string // (#49) Where the dataset was created
  dataset_created: boolean
  tables_created: string[]
  dryrun_status: string
  message: string
}

export interface DeleteOrgRequest {
  delete_dataset: boolean  // If true, deletes the BigQuery dataset
  confirm_org_slug: string // Must match URL org_slug to confirm
}

export interface DeleteOrgResponse {
  org_slug: string
  deleted_from_tables: string[]
  dataset_deleted: boolean
  message: string
}

export interface SetupIntegrationRequest {
  credential: string
  credential_name?: string
  metadata?: Record<string, unknown>
  skip_validation?: boolean
  // Default hierarchy for all usage from this integration (GenAI providers)
  // Uses the 5-field hierarchy model with x_hierarchy prefix to match BigQuery schema
  default_x_hierarchy_entity_id?: string      // Entity ID (e.g., "DEPT-001", "PROJ-001", "TEAM-001")
  default_x_hierarchy_entity_name?: string    // Human-readable name (e.g., "Engineering", "AI Platform")
  default_x_hierarchy_level_code?: string     // Level type: "ORG" | "DEPT" | "PROJ" | "TEAM"
  default_x_hierarchy_path?: string           // Full path of IDs (e.g., "/acme/DEPT-001/PROJ-001")
  default_x_hierarchy_path_names?: string     // Full path of names (e.g., "/Acme Inc/Engineering/AI Platform")
}

export interface SetupIntegrationResponse {
  success: boolean
  provider: string
  credential_id?: string
  validation_status: string
  validation_error?: string
  message: string
}

export interface IntegrationStatus {
  provider: string
  status: "VALID" | "INVALID" | "PENDING" | "NOT_CONFIGURED" | "EXPIRED"
  credential_id?: string      // For multi-credential cloud providers
  credential_name?: string    // Human-readable name for the credential
  account_identifier?: string // Provider-specific: GCP project_id, AWS account_id, etc.
  last_validated_at?: string
  last_error?: string
  created_at?: string
  is_enabled?: boolean
  metadata?: Record<string, unknown> // Integration-specific metadata (e.g., billing_export_table for GCP)
}

/**
 * Request to update integration metadata.
 * Only updates metadata, not credentials.
 */
export interface UpdateIntegrationMetadataRequest {
  metadata: Record<string, unknown>
  skip_validation?: boolean
}

export interface AllIntegrationsResponse {
  org_slug: string
  integrations: Record<string, IntegrationStatus>
  all_valid: boolean
  providers_configured: string[]
}

export interface PipelineRunRequest {
  date?: string
  [key: string]: unknown
}

// ============================================
// Pipeline Configuration Types
// ============================================

export interface PipelineConfig {
  id: string
  name: string
  description: string
  category: string  // Top-level category (cloud, genai, subscription)
  provider: string  // Provider within category (gcp, aws, openai, anthropic)
  domain: string
  pipeline: string
  required_integration: string
  schedule?: string
  enabled: boolean
}

export interface PipelinesListResponse {
  success: boolean
  pipelines: PipelineConfig[]
  total: number
}

// ============================================
// LLM Data Types (Generic - works for all providers)
// ============================================

export type LLMProvider = "openai" | "anthropic" | "gemini" | "deepseek" | "custom"

/**
 * Billing period frequency for subscriptions.
 * Matches backend BillingPeriodEnum.
 */
export type BillingPeriod = "weekly" | "monthly" | "quarterly" | "yearly" | "pay_as_you_go"

/**
 * Tier type for subscriptions.
 * Matches backend TierTypeEnum.
 */
export type TierType = "free" | "trial" | "paid" | "enterprise" | "committed_use"

/**
 * Pricing type for models.
 * Matches backend PricingTypeEnum.
 */
export type PricingType = "standard" | "free_tier" | "volume_discount" | "committed_use" | "promotional" | "negotiated"

/**
 * Free tier reset frequency.
 * Matches backend FreeTierResetFrequency enum.
 */
export type FreeTierResetFrequency = "daily" | "monthly" | "never"

/**
 * Discount reason for pricing.
 * Matches backend DiscountReasonEnum.
 */
export type DiscountReason = "volume" | "commitment" | "promotion" | "negotiated" | "trial"

/**
 * LLM pricing model - full response from backend.
 * Matches OpenAIPricingResponse Pydantic model.
 */
export interface LLMPricing {
  pricing_id: string
  provider: string
  model_id: string
  model_name?: string
  is_custom: boolean
  input_price_per_1k: number
  output_price_per_1k: number
  effective_date: string
  end_date?: string
  is_enabled: boolean
  notes?: string
  // Provider-specific fields (x_ prefix)
  x_gemini_context_window?: string
  x_gemini_region?: string
  x_anthropic_tier?: string
  x_openai_batch_input_price?: number
  x_openai_batch_output_price?: number
  // Pricing type and free tier
  pricing_type: PricingType
  free_tier_input_tokens?: number
  free_tier_output_tokens?: number
  free_tier_reset_frequency?: FreeTierResetFrequency
  // Discount fields
  discount_percentage?: number
  discount_reason?: DiscountReason
  volume_threshold_tokens?: number
  base_input_price_per_1k?: number
  base_output_price_per_1k?: number
  discounted_input_price_per_1k?: number
  discounted_output_price_per_1k?: number
  // Timestamps
  created_at?: string
  updated_at?: string
}

/**
 * LLM pricing create request.
 * Matches LLMPricingCreate Pydantic model.
 * NOTE: Provider-specific x_* fields are response-only (not in create model)
 */
export interface LLMPricingCreate {
  model_id: string
  model_name?: string
  input_price_per_1k: number
  output_price_per_1k: number
  effective_date: string
  notes?: string
  // Pricing type and free tier
  pricing_type?: PricingType
  free_tier_input_tokens?: number
  free_tier_output_tokens?: number
  free_tier_reset_frequency?: FreeTierResetFrequency
  // Discount fields
  discount_percentage?: number
  discount_reason?: DiscountReason
  volume_threshold_tokens?: number
  base_input_price_per_1k?: number
  base_output_price_per_1k?: number
  discounted_input_price_per_1k?: number
  discounted_output_price_per_1k?: number
}

/**
 * LLM pricing update request.
 * Matches LLMPricingUpdate Pydantic model.
 * NOTE: Provider-specific x_* fields are response-only (not in update model)
 */
export interface LLMPricingUpdate {
  model_name?: string
  input_price_per_1k?: number
  output_price_per_1k?: number
  effective_date?: string
  notes?: string
  // Pricing type and free tier
  pricing_type?: PricingType
  free_tier_input_tokens?: number
  free_tier_output_tokens?: number
  free_tier_reset_frequency?: FreeTierResetFrequency
  // Discount fields
  discount_percentage?: number
  discount_reason?: DiscountReason
  volume_threshold_tokens?: number
  base_input_price_per_1k?: number
  base_output_price_per_1k?: number
  discounted_input_price_per_1k?: number
  discounted_output_price_per_1k?: number
}

export interface LLMPricingListResponse {
  pricing: LLMPricing[]
  count: number
}

/**
 * SaaS subscription - full response from backend.
 * Matches OpenAISubscriptionResponse Pydantic model.
 */
export interface SaaSSubscription {
  subscription_id: string
  provider: string
  plan_name: string
  is_custom: boolean
  quantity: number
  unit_price_usd: number
  effective_date: string
  end_date?: string
  is_enabled: boolean
  auth_type?: string
  notes?: string
  // Provider-specific fields (x_ prefix)
  x_gemini_project_id?: string
  x_gemini_region?: string
  x_anthropic_workspace_id?: string
  x_openai_org_id?: string
  // Tier and trial info
  tier_type: TierType
  trial_end_date?: string
  trial_credit_usd?: number
  // Rate limits
  monthly_token_limit?: number
  daily_token_limit?: number
  rpm_limit?: number  // Requests per minute
  tpm_limit?: number  // Tokens per minute
  rpd_limit?: number  // Requests per day
  tpd_limit?: number  // Tokens per day
  concurrent_limit?: number
  // Commitment/discount fields
  committed_spend_usd?: number
  commitment_term_months?: number
  discount_percentage?: number
  // Billing period fields
  billing_period?: BillingPeriod
  yearly_price_usd?: number
  yearly_discount_percentage?: number
  // Timestamps
  created_at?: string
  updated_at?: string
}

/**
 * SaaS subscription create request.
 * Matches SaaSSubscriptionCreate Pydantic model.
 * NOTE: Provider-specific x_* fields are response-only (not in create model)
 */
export interface SaaSSubscriptionCreate {
  subscription_id: string
  plan_name: string
  quantity: number
  unit_price_usd: number
  effective_date: string
  notes?: string
  // Tier and trial info
  tier_type?: TierType
  trial_end_date?: string
  trial_credit_usd?: number
  // Rate limits
  monthly_token_limit?: number
  daily_token_limit?: number
  rpm_limit?: number
  tpm_limit?: number
  rpd_limit?: number
  tpd_limit?: number
  concurrent_limit?: number
  // Commitment/discount fields
  committed_spend_usd?: number
  commitment_term_months?: number
  discount_percentage?: number
  // Billing period fields
  billing_period?: BillingPeriod
  yearly_price_usd?: number
  yearly_discount_percentage?: number
}

/**
 * SaaS subscription update request.
 * Matches SaaSSubscriptionUpdate Pydantic model.
 * NOTE: Provider-specific x_* fields are response-only (not in update model)
 */
export interface SaaSSubscriptionUpdate {
  quantity?: number
  unit_price_usd?: number
  effective_date?: string
  notes?: string
  // Tier and trial info
  tier_type?: TierType
  trial_end_date?: string
  trial_credit_usd?: number
  // Rate limits
  monthly_token_limit?: number
  daily_token_limit?: number
  rpm_limit?: number
  tpm_limit?: number
  rpd_limit?: number
  tpd_limit?: number
  concurrent_limit?: number
  // Commitment/discount fields
  committed_spend_usd?: number
  commitment_term_months?: number
  discount_percentage?: number
  // Billing period fields
  billing_period?: BillingPeriod
  yearly_price_usd?: number
  yearly_discount_percentage?: number
}

export interface SaaSSubscriptionListResponse {
  subscriptions: SaaSSubscription[]
  count: number
}

// LLM type aliases pointing to SaaS types
export type LLMSubscription = SaaSSubscription
export type LLMSubscriptionCreate = SaaSSubscriptionCreate
export type LLMSubscriptionUpdate = SaaSSubscriptionUpdate
export type LLMSubscriptionListResponse = SaaSSubscriptionListResponse

export interface PipelineRunResponse {
  status: string
  pipeline_id: string
  pipeline_logging_id: string  // Unique ID for this run (renamed from run_id to match backend)
  run_id?: string  // @deprecated - use pipeline_logging_id instead
  message?: string
  result?: unknown
}

// ============================================
// Pipeline Logs Types
// ============================================

/** Enhanced error context with classification and debugging info */
export interface ErrorContext {
  error_type?: 'TRANSIENT' | 'PERMANENT' | 'TIMEOUT' | 'VALIDATION_ERROR' | 'DEPENDENCY_FAILURE'
  error_code?: string
  retry_count?: number
  is_retryable?: boolean
  stack_trace?: string
  suggested_action?: string
}

/** Valid pipeline/step status values */
export type PipelineStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'CANCELLING' | 'TIMEOUT' | 'SKIPPED'

export interface PipelineRunSummary {
  pipeline_logging_id: string
  pipeline_id: string
  status: PipelineStatus | string
  trigger_type: string
  trigger_by?: string
  start_time?: string
  end_time?: string
  duration_ms?: number
  run_date?: string
  error_message?: string
  error_context?: ErrorContext
  parameters?: Record<string, unknown>
}

export interface StepLogSummary {
  step_logging_id: string
  step_name: string
  step_type: string
  step_index: number
  status: PipelineStatus | string
  start_time?: string
  end_time?: string
  duration_ms?: number
  rows_processed?: number
  error_message?: string
  error_context?: ErrorContext
  metadata?: Record<string, unknown>
}

export interface PipelineRunDetail extends PipelineRunSummary {
  run_metadata?: Record<string, unknown>
  steps: StepLogSummary[]
}

export interface PipelineRunsResponse {
  runs: PipelineRunSummary[]
  total: number
  limit: number
  offset: number
}

/** State transition event for audit trail */
export interface StateTransition {
  transition_id: string
  pipeline_logging_id: string
  step_logging_id?: string
  entity_type: 'PIPELINE' | 'STEP'
  from_state: string
  to_state: string
  transition_time: string
  error_type?: string
  error_message?: string
  retry_count?: number
  duration_in_state_ms?: number
  metadata?: Record<string, unknown>
}

export interface StateTransitionsResponse {
  transitions: StateTransition[]
  total: number
  limit: number
  offset: number
}

export interface ApiKeyInfoResponse {
  org_slug: string
  api_key_fingerprint: string
  is_active: boolean
  created_at: string
  scopes: string[]
}

export interface RotateApiKeyResponse {
  org_slug: string
  api_key: string // New API key - shown ONCE
  api_key_fingerprint: string
  previous_key_revoked: boolean
  message: string
}

export interface RegenerateApiKeyResponse {
  api_key: string // New API key - shown ONCE
  org_api_key_hash: string
  org_slug: string
  created_at: string
  description: string
}

// ============================================
// Timeout and Error Handling
// ============================================

// Default timeouts (in milliseconds)
const DEFAULT_TIMEOUT = 30000 // 30 seconds for most operations
const LONG_TIMEOUT = 60000   // 60 seconds for pipeline operations

/**
 * Generate a unique request ID for tracing.
 * Format: req_{timestamp}_{random}
 */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `req_${timestamp}_${random}`
}

export class BackendAPIError extends Error {
  constructor(
    public statusCode: number,
    public detail: string,
    public retryAfter?: number,  // Seconds to wait before retrying (from Retry-After header)
    public originalError?: unknown
  ) {
    super(detail)
    this.name = "BackendAPIError"
  }

  /**
   * Check if this error is rate limited and can be retried
   */
  isRateLimited(): boolean {
    return this.statusCode === 429
  }

  /**
   * Get suggested retry delay in milliseconds
   */
  getRetryDelayMs(): number {
    return (this.retryAfter || 60) * 1000  // Default to 60s if not specified
  }
}

export class BackendTimeoutError extends Error {
  constructor(public timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`)
    this.name = "BackendTimeoutError"
  }
}

/**
 * Fetch with timeout support using AbortController.
 * Prevents hanging requests from blocking users indefinitely.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new BackendTimeoutError(timeoutMs)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Retry configuration for exponential backoff.
 * Issue #22: Add retry logic with exponential backoff.
 */
interface RetryConfig {
  maxAttempts: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,  // 1 second
  maxDelayMs: 10000,     // 10 seconds
  backoffMultiplier: 2,
}

/**
 * Check if an error is retryable.
 * Retry on 5xx server errors, 429 rate limiting, and network errors.
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof BackendAPIError) {
    // Retry on 5xx errors (server errors)
    if (error.statusCode >= 500 && error.statusCode < 600) {
      return true
    }
    // Also retry on 429 (rate limited) - use Retry-After if available
    if (error.statusCode === 429) {
      return true
    }
    return false
  }
  if (error instanceof BackendTimeoutError) {
    // Retry on timeout errors
    return true
  }
  if (error instanceof Error) {
    // Retry on network errors (connection refused, DNS failures, etc.)
    return error.message.includes("fetch failed") ||
           error.message.includes("network") ||
           error.message.includes("ECONNREFUSED") ||
           error.message.includes("ETIMEDOUT")
  }
  return false
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Fetch with retry logic and exponential backoff.
 * Issue #22: Only retries on 5xx and network errors.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT,
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<Response> {
  let lastError: unknown

  for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
    try {
      return await fetchWithTimeout(url, options, timeoutMs)
    } catch (error: unknown) {
      lastError = error

      // Don't retry if error is not retryable
      if (!isRetryableError(error)) {
        throw error
      }

      // Don't retry on last attempt
      if (attempt === retryConfig.maxAttempts) {
        throw error
      }

      // Calculate delay with exponential backoff
      // For 429 errors, respect Retry-After header if available
      let delayMs = Math.min(
        retryConfig.initialDelayMs * Math.pow(retryConfig.backoffMultiplier, attempt - 1),
        retryConfig.maxDelayMs
      )

      // Use Retry-After from rate limit response if available
      if (error instanceof BackendAPIError && error.statusCode === 429 && error.retryAfter) {
        delayMs = Math.max(delayMs, error.retryAfter * 1000)
      }

      await sleep(delayMs)
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as Record<string, unknown>

    // Parse Retry-After header for rate limited responses
    let retryAfter: number | undefined
    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("Retry-After")
      if (retryAfterHeader) {
        retryAfter = parseInt(retryAfterHeader, 10)
        if (isNaN(retryAfter)) retryAfter = undefined
      }
    }

    throw new BackendAPIError(
      response.status,
      (typeof errorData.detail === 'string' ? errorData.detail : Array.isArray(errorData.detail) ? errorData.detail.map((e: { msg?: string }) => e.msg || JSON.stringify(e)).join('; ') : `HTTP ${response.status}: ${response.statusText}`),
      retryAfter,
      errorData
    )
  }
  return response.json() as Promise<T>
}

// ============================================
// Pipeline Backend API Client
// ============================================

export class PipelineBackendClient {
  private baseUrl: string
  private pipelineServiceUrl: string
  private orgApiKey?: string
  private adminApiKey?: string

  constructor(options?: { orgApiKey?: string; adminApiKey?: string; orgSlug?: string }) {
    this.baseUrl = getApiServiceUrl()
    this.pipelineServiceUrl = getPipelineServiceUrl()
    this.orgApiKey = options?.orgApiKey
    this.adminApiKey = options?.adminApiKey

    // Validate org_slug if provided (Issue #18: org_slug validation)
    if (options?.orgSlug) {
      validateOrgSlug(options.orgSlug)
    }
  }

  private getHeaders(useAdminKey: boolean = false): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "X-Request-ID": generateRequestId(),  // Add request tracing
    }

    if (useAdminKey && this.adminApiKey) {
      headers["X-CA-Root-Key"] = this.adminApiKey
    } else if (this.orgApiKey) {
      headers["X-API-Key"] = this.orgApiKey
    }

    return headers
  }

  // ============================================
  // Organization Onboarding
  // ============================================

  /**
   * Onboard a new organization to the backend.
   * Returns the org API key (plaintext, shown once).
   * REQUIRES: Admin API key (X-CA-Root-Key header)
   */
  async onboardOrganization(request: OnboardOrgRequest): Promise<OnboardOrgResponse> {
    const response = await fetchWithRetry(
      `${this.baseUrl}/api/v1/organizations/onboard`,
      {
        method: "POST",
        headers: this.getHeaders(true), // Use admin key
        body: JSON.stringify(request),
      },
      LONG_TIMEOUT // Onboarding may take longer due to dataset creation
    )

    return handleResponse<OnboardOrgResponse>(response)
  }

  /**
   * Dry-run validation before onboarding.
   * Validates org_slug, email, GCP connectivity.
   */
  async dryrunOnboarding(request: OnboardOrgRequest): Promise<Record<string, unknown>> {
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/organizations/dryrun`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(request),
      },
      DEFAULT_TIMEOUT
    )

    return handleResponse<Record<string, unknown>>(response)
  }

  /**
   * Delete/offboard an organization from the backend.
   * Removes org data from all meta tables and optionally deletes the BigQuery dataset.
   * REQUIRES: Admin API key (X-CA-Root-Key header)
   */
  async deleteOrganization(
    orgSlug: string,
    deleteDataset: boolean = false
  ): Promise<DeleteOrgResponse> {
    validateOrgSlug(orgSlug)

    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/organizations/${orgSlug}`,
      {
        method: "DELETE",
        headers: this.getHeaders(true), // Use admin key
        body: JSON.stringify({
          delete_dataset: deleteDataset,
          confirm_org_slug: orgSlug, // Confirmation required
        }),
      },
      LONG_TIMEOUT // May take longer for dataset deletion
    )

    return handleResponse<DeleteOrgResponse>(response)
  }

  // ============================================
  // Integration Management (Provider-Based URLs)
  // ============================================

  /**
   * Setup an integration (OpenAI, Anthropic, GCP).
   * Uses provider-based URL: /api/v1/integrations/{org}/{provider}/setup
   * Requires org API key.
   */
  async setupIntegration(
    orgSlug: string,
    provider: "openai" | "anthropic" | "gemini" | "deepseek" | "gcp" | "gcp_service_account" | "aws" | "azure" | "oci",
    request: SetupIntegrationRequest
  ): Promise<SetupIntegrationResponse> {
    validateOrgSlug(orgSlug)
    // Normalize provider names for URL
    const providerUrl = this.normalizeProviderForUrl(provider)

    const response = await fetchWithRetry(
      `${this.baseUrl}/api/v1/integrations/${orgSlug}/${providerUrl}/setup`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(request),
      },
      DEFAULT_TIMEOUT
    )

    return handleResponse<SetupIntegrationResponse>(response)
  }

  /**
   * Get all integration statuses for an organization.
   * URL: /api/v1/integrations/{org}
   */
  async getIntegrations(orgSlug: string): Promise<AllIntegrationsResponse> {
    validateOrgSlug(orgSlug)
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/integrations/${orgSlug}`,
      {
        method: "GET",
        headers: this.getHeaders(),
      },
      DEFAULT_TIMEOUT
    )

    return handleResponse<AllIntegrationsResponse>(response)
  }

  /**
   * Get single integration status.
   * URL: /api/v1/integrations/{org}/{provider}
   */
  async getIntegrationStatus(
    orgSlug: string,
    provider: string
  ): Promise<IntegrationStatus> {
    validateOrgSlug(orgSlug)
    const providerUrl = this.normalizeProviderForUrl(provider)

    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/integrations/${orgSlug}/${providerUrl}`,
      {
        method: "GET",
        headers: this.getHeaders(),
      },
      DEFAULT_TIMEOUT
    )

    return handleResponse<IntegrationStatus>(response)
  }

  /**
   * Validate an existing integration.
   * URL: /api/v1/integrations/{org}/{provider}/validate
   */
  async validateIntegration(
    orgSlug: string,
    provider: string
  ): Promise<SetupIntegrationResponse> {
    validateOrgSlug(orgSlug)
    const providerUrl = this.normalizeProviderForUrl(provider)

    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/integrations/${orgSlug}/${providerUrl}/validate`,
      {
        method: "POST",
        headers: this.getHeaders(),
      },
      DEFAULT_TIMEOUT
    )

    return handleResponse<SetupIntegrationResponse>(response)
  }

  /**
   * Update integration metadata (without re-uploading credentials).
   * URL: PUT /api/v1/integrations/{org}/{provider}
   *
   * Use this to update metadata like billing_export_table, detailed_export_table, etc.
   */
  async updateIntegrationMetadata(
    orgSlug: string,
    provider: string,
    request: UpdateIntegrationMetadataRequest
  ): Promise<SetupIntegrationResponse> {
    validateOrgSlug(orgSlug)
    const providerUrl = this.normalizeProviderForUrl(provider)

    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/integrations/${orgSlug}/${providerUrl}`,
      {
        method: "PUT",
        headers: this.getHeaders(),
        body: JSON.stringify(request),
      },
      DEFAULT_TIMEOUT
    )

    return handleResponse<SetupIntegrationResponse>(response)
  }

  /**
   * Delete an integration.
   * URL: /api/v1/integrations/{org}/{provider}
   */
  async deleteIntegration(
    orgSlug: string,
    provider: string
  ): Promise<{ success: boolean; message: string }> {
    validateOrgSlug(orgSlug)
    const providerUrl = this.normalizeProviderForUrl(provider)

    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/integrations/${orgSlug}/${providerUrl}`,
      {
        method: "DELETE",
        headers: this.getHeaders(),
      },
      DEFAULT_TIMEOUT
    )

    return handleResponse(response)
  }

  /**
   * Normalize provider name for URL path.
   */
  private normalizeProviderForUrl(provider: string): string {
    const providerMap: Record<string, string> = {
      "openai": "openai",
      "OPENAI": "openai",
      "anthropic": "anthropic",
      "ANTHROPIC": "anthropic",
      "gcp": "gcp",
      "GCP_SA": "gcp",
      "gcp_service_account": "gcp",
    }
    return providerMap[provider] || provider.toLowerCase()
  }

  // ============================================
  // Pipeline Operations
  // ============================================

  /**
   * List available pipelines.
   * This is a public endpoint - no authentication required.
   * URL: /api/v1/validator/pipelines (on api-service)
   */
  async listPipelines(provider?: string): Promise<PipelinesListResponse> {
    const params = new URLSearchParams()
    if (provider) {
      params.append("provider", provider)
    }
    const queryString = params.toString()
    // Use baseUrl (api-service) for pipeline listing, not pipelineServiceUrl
    const url = `${this.baseUrl}/api/v1/validator/pipelines${queryString ? `?${queryString}` : ""}`

    const response = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": generateRequestId(),
        },
      },
      DEFAULT_TIMEOUT
    )

    return handleResponse<PipelinesListResponse>(response)
  }

  /**
   * Run a pipeline.
   * Uses the pipeline service URL (convergence-data-pipeline) for execution.
   *
   * URL structure:
   * - Cloud (4 segments): /api/v1/pipelines/run/{org}/{category}/{provider}/{domain}/{pipeline}
   *   Example: /api/v1/pipelines/run/acme_inc/cloud/gcp/cost/billing
   * - GenAI/SaaS (3 segments): /api/v1/pipelines/run/{org}/{category}/{domain}/{pipeline}
   *   Example: /api/v1/pipelines/run/acme_inc/genai/payg/openai
   */
  async runPipeline(
    orgSlug: string,
    category: string,
    provider: string,
    domain: string,
    pipeline: string,
    params?: PipelineRunRequest
  ): Promise<PipelineRunResponse> {
    validateOrgSlug(orgSlug)
    // Build URL path: category/provider/domain/pipeline (4 segments) or category/domain/pipeline (3 segments)
    // Provider is empty for genai/subscription pipelines
    const pathParts = [category, provider, domain, pipeline].filter(Boolean)
    const response = await fetchWithRetry(
      `${this.pipelineServiceUrl}/api/v1/pipelines/run/${orgSlug}/${pathParts.join("/")}`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(params || {}),
      },
      LONG_TIMEOUT // Pipeline operations may take longer
    )

    return handleResponse<PipelineRunResponse>(response)
  }

  /**
   * Run the GCP billing pipeline.
   * URL: /api/v1/pipelines/run/{org}/cloud/gcp/cost/billing
   */
  async runBillingPipeline(
    orgSlug: string,
    date?: string
  ): Promise<PipelineRunResponse> {
    return this.runPipeline(orgSlug, "cloud", "gcp", "cost", "billing", { date })
  }

  // Legacy alias for backward compatibility
  async runCostBillingPipeline(
    orgSlug: string,
    date?: string
  ): Promise<PipelineRunResponse> {
    return this.runBillingPipeline(orgSlug, date)
  }

  // ============================================
  // Pipeline Logs
  // ============================================

  /**
   * List pipeline runs for an organization.
   * URL: /api/v1/pipelines/{org_slug}/runs
   * Note: Uses pipelineServiceUrl (port 8001) for pipeline run data
   */
  async listPipelineRuns(
    orgSlug: string,
    options?: {
      status?: string
      pipelineId?: string
      startDate?: string
      endDate?: string
      limit?: number
      offset?: number
    }
  ): Promise<PipelineRunsResponse> {
    validateOrgSlug(orgSlug)
    const params = new URLSearchParams()
    if (options?.status) params.append("status_filter", options.status)
    if (options?.pipelineId) params.append("pipeline_id", options.pipelineId)
    if (options?.startDate) params.append("start_date", options.startDate)
    if (options?.endDate) params.append("end_date", options.endDate)
    if (options?.limit) params.append("limit", options.limit.toString())
    if (options?.offset) params.append("offset", options.offset.toString())

    const queryString = params.toString()
    const url = `${this.pipelineServiceUrl}/api/v1/pipelines/${orgSlug}/runs${queryString ? `?${queryString}` : ""}`

    const response = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: this.getHeaders(),
      },
      DEFAULT_TIMEOUT
    )

    return handleResponse<PipelineRunsResponse>(response)
  }

  /**
   * Get detailed pipeline run with step logs.
   * URL: /api/v1/pipelines/{org_slug}/runs/{pipeline_logging_id}
   * Note: Uses pipelineServiceUrl (port 8001) for pipeline run data
   */
  async getPipelineRunDetail(
    orgSlug: string,
    pipelineLoggingId: string
  ): Promise<PipelineRunDetail> {
    validateOrgSlug(orgSlug)
    const response = await fetchWithTimeout(
      `${this.pipelineServiceUrl}/api/v1/pipelines/${orgSlug}/runs/${encodeURIComponent(pipelineLoggingId)}`,
      {
        method: "GET",
        headers: this.getHeaders(),
      },
      DEFAULT_TIMEOUT
    )

    return handleResponse<PipelineRunDetail>(response)
  }

  // ============================================
  // API Key Management
  // ============================================

  /**
   * Get API key info (fingerprint only, not full key).
   * URL: /api/v1/organizations/{org_slug}/api-key
   */
  async getApiKeyInfo(orgSlug: string): Promise<ApiKeyInfoResponse> {
    validateOrgSlug(orgSlug)
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/organizations/${orgSlug}/api-key`,
      {
        method: "GET",
        headers: this.getHeaders(),
      },
      DEFAULT_TIMEOUT
    )

    return handleResponse<ApiKeyInfoResponse>(response)
  }

  /**
   * Rotate the API key for an organization.
   * Returns new API key (shown ONCE - save immediately!).
   * URL: /api/v1/organizations/{org_slug}/api-key/rotate
   */
  async rotateApiKey(orgSlug: string): Promise<RotateApiKeyResponse> {
    validateOrgSlug(orgSlug)
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/organizations/${orgSlug}/api-key/rotate`,
      {
        method: "POST",
        headers: this.getHeaders(),
      },
      DEFAULT_TIMEOUT
    )

    return handleResponse<RotateApiKeyResponse>(response)
  }

  /**
   * Regenerate API key for an existing organization (admin operation).
   * Used for 409 recovery when frontend and backend are out of sync.
   * REQUIRES: Admin API key (X-CA-Root-Key header)
   * URL: /api/v1/admin/organizations/{org_slug}/regenerate-api-key
   */
  async regenerateApiKey(orgSlug: string): Promise<RegenerateApiKeyResponse> {
    validateOrgSlug(orgSlug)
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/admin/organizations/${orgSlug}/regenerate-api-key`,
      {
        method: "POST",
        headers: this.getHeaders(true), // Use admin key
      },
      DEFAULT_TIMEOUT
    )

    return handleResponse<RegenerateApiKeyResponse>(response)
  }

  // ============================================
  // Health Check
  // ============================================

  async healthCheck(): Promise<{ status: string }> {
    const response = await fetchWithTimeout(
      `${this.baseUrl}/health`,
      {
        method: "GET",
      },
      DEFAULT_TIMEOUT
    )

    return handleResponse(response)
  }

  // ============================================
  // Generic LLM Data CRUD Operations
  // ============================================

  /**
   * Validate LLM provider name.
   */
  private validateLLMProvider(provider: string): LLMProvider {
    const validProviders: LLMProvider[] = ["openai", "anthropic", "gemini", "deepseek", "custom"]
    const normalizedProvider = provider.toLowerCase() as LLMProvider
    if (!validProviders.includes(normalizedProvider)) {
      throw new Error(`Invalid LLM provider: ${provider}. Valid providers: ${validProviders.join(", ")}`)
    }
    return normalizedProvider
  }

  /**
   * List all pricing models for an LLM provider.
   * URL: /api/v1/integrations/{org_slug}/{provider}/pricing
   */
  async listLLMPricing(orgSlug: string, provider: LLMProvider): Promise<LLMPricingListResponse> {
    validateOrgSlug(orgSlug)
    const validProvider = this.validateLLMProvider(provider)
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/integrations/${orgSlug}/${validProvider}/pricing`,
      {
        method: "GET",
        headers: this.getHeaders(),
      },
      DEFAULT_TIMEOUT
    )
    return handleResponse<LLMPricingListResponse>(response)
  }

  /**
   * Get a specific pricing model for an LLM provider.
   * URL: /api/v1/integrations/{org_slug}/{provider}/pricing/{model_id}
   */
  async getLLMPricing(orgSlug: string, provider: LLMProvider, modelId: string): Promise<LLMPricing> {
    validateOrgSlug(orgSlug)
    const validProvider = this.validateLLMProvider(provider)
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/integrations/${orgSlug}/${validProvider}/pricing/${encodeURIComponent(modelId)}`,
      {
        method: "GET",
        headers: this.getHeaders(),
      },
      DEFAULT_TIMEOUT
    )
    return handleResponse<LLMPricing>(response)
  }

  /**
   * Create a new pricing model for an LLM provider.
   * URL: /api/v1/integrations/{org_slug}/{provider}/pricing
   */
  async createLLMPricing(orgSlug: string, provider: LLMProvider, pricing: LLMPricingCreate): Promise<LLMPricing> {
    validateOrgSlug(orgSlug)
    const validProvider = this.validateLLMProvider(provider)
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/integrations/${orgSlug}/${validProvider}/pricing`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(pricing),
      },
      DEFAULT_TIMEOUT
    )
    return handleResponse<LLMPricing>(response)
  }

  /**
   * Update an existing pricing model for an LLM provider.
   * URL: /api/v1/integrations/{org_slug}/{provider}/pricing/{model_id}
   */
  async updateLLMPricing(orgSlug: string, provider: LLMProvider, modelId: string, pricing: LLMPricingUpdate): Promise<LLMPricing> {
    validateOrgSlug(orgSlug)
    const validProvider = this.validateLLMProvider(provider)
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/integrations/${orgSlug}/${validProvider}/pricing/${encodeURIComponent(modelId)}`,
      {
        method: "PUT",
        headers: this.getHeaders(),
        body: JSON.stringify(pricing),
      },
      DEFAULT_TIMEOUT
    )
    return handleResponse<LLMPricing>(response)
  }

  /**
   * Delete a pricing model for an LLM provider.
   * URL: /api/v1/integrations/{org_slug}/{provider}/pricing/{model_id}
   */
  async deleteLLMPricing(orgSlug: string, provider: LLMProvider, modelId: string): Promise<void> {
    validateOrgSlug(orgSlug)
    const validProvider = this.validateLLMProvider(provider)
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/integrations/${orgSlug}/${validProvider}/pricing/${encodeURIComponent(modelId)}`,
      {
        method: "DELETE",
        headers: this.getHeaders(),
      },
      DEFAULT_TIMEOUT
    )
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as Record<string, unknown>
      throw new BackendAPIError(response.status, (errorData.detail as string) || "Failed to delete pricing", undefined, errorData)
    }
  }

  /**
   * Reset pricing to defaults for an LLM provider.
   * URL: /api/v1/integrations/{org_slug}/{provider}/pricing/reset
   */
  async resetLLMPricing(orgSlug: string, provider: LLMProvider): Promise<LLMPricingListResponse> {
    validateOrgSlug(orgSlug)
    const validProvider = this.validateLLMProvider(provider)
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/integrations/${orgSlug}/${validProvider}/pricing/reset`,
      {
        method: "POST",
        headers: this.getHeaders(),
      },
      DEFAULT_TIMEOUT
    )
    return handleResponse<LLMPricingListResponse>(response)
  }

  /**
   * List all subscriptions for an LLM provider.
   * URL: /api/v1/integrations/{org_slug}/{provider}/subscriptions
   */
  async listSaaSSubscriptions(orgSlug: string, provider: LLMProvider): Promise<SaaSSubscriptionListResponse> {
    validateOrgSlug(orgSlug)
    const validProvider = this.validateLLMProvider(provider)
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/integrations/${orgSlug}/${validProvider}/subscriptions`,
      {
        method: "GET",
        headers: this.getHeaders(),
      },
      DEFAULT_TIMEOUT
    )
    return handleResponse<SaaSSubscriptionListResponse>(response)
  }

  /**
   * Get a specific subscription for an LLM provider.
   * URL: /api/v1/integrations/{org_slug}/{provider}/subscriptions/{plan_name}
   */
  async getSaaSSubscription(orgSlug: string, provider: LLMProvider, planName: string): Promise<SaaSSubscription> {
    validateOrgSlug(orgSlug)
    const validProvider = this.validateLLMProvider(provider)
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/integrations/${orgSlug}/${validProvider}/subscriptions/${encodeURIComponent(planName)}`,
      {
        method: "GET",
        headers: this.getHeaders(),
      },
      DEFAULT_TIMEOUT
    )
    return handleResponse<SaaSSubscription>(response)
  }

  /**
   * Create a new subscription for an LLM provider.
   * URL: /api/v1/integrations/{org_slug}/{provider}/subscriptions
   */
  async createSaaSSubscription(orgSlug: string, provider: LLMProvider, subscription: SaaSSubscriptionCreate): Promise<SaaSSubscription> {
    validateOrgSlug(orgSlug)
    const validProvider = this.validateLLMProvider(provider)
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/integrations/${orgSlug}/${validProvider}/subscriptions`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(subscription),
      },
      DEFAULT_TIMEOUT
    )
    return handleResponse<SaaSSubscription>(response)
  }

  /**
   * Update an existing subscription for an LLM provider.
   * URL: /api/v1/integrations/{org_slug}/{provider}/subscriptions/{plan_name}
   */
  async updateSaaSSubscription(orgSlug: string, provider: LLMProvider, planName: string, subscription: SaaSSubscriptionUpdate): Promise<SaaSSubscription> {
    validateOrgSlug(orgSlug)
    const validProvider = this.validateLLMProvider(provider)
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/integrations/${orgSlug}/${validProvider}/subscriptions/${encodeURIComponent(planName)}`,
      {
        method: "PUT",
        headers: this.getHeaders(),
        body: JSON.stringify(subscription),
      },
      DEFAULT_TIMEOUT
    )
    return handleResponse<SaaSSubscription>(response)
  }

  /**
   * Delete a subscription for an LLM provider.
   * URL: /api/v1/integrations/{org_slug}/{provider}/subscriptions/{plan_name}
   */
  async deleteSaaSSubscription(orgSlug: string, provider: LLMProvider, planName: string): Promise<void> {
    validateOrgSlug(orgSlug)
    const validProvider = this.validateLLMProvider(provider)
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/integrations/${orgSlug}/${validProvider}/subscriptions/${encodeURIComponent(planName)}`,
      {
        method: "DELETE",
        headers: this.getHeaders(),
      },
      DEFAULT_TIMEOUT
    )
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as Record<string, unknown>
      throw new BackendAPIError(response.status, (errorData.detail as string) || "Failed to delete subscription", undefined, errorData)
    }
  }

  /**
   * Reset subscriptions to defaults for an LLM provider.
   * URL: /api/v1/integrations/{org_slug}/{provider}/subscriptions/reset
   */
  async resetSaaSSubscriptions(orgSlug: string, provider: LLMProvider): Promise<SaaSSubscriptionListResponse> {
    validateOrgSlug(orgSlug)
    const validProvider = this.validateLLMProvider(provider)
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/integrations/${orgSlug}/${validProvider}/subscriptions/reset`,
      {
        method: "POST",
        headers: this.getHeaders(),
      },
      DEFAULT_TIMEOUT
    )
    return handleResponse<SaaSSubscriptionListResponse>(response)
  }

  // ============================================
}

// ============================================
// Singleton Instance
// ============================================

/**
 * Get Pipeline Backend Client instance.
 *
 * Authentication options:
 * - orgApiKey: For org-level operations (integrations, pipelines, API key info)
 * - adminApiKey: For admin operations (onboarding). Server-side only from CA_ROOT_API_KEY.
 *
 * Note: Always creates a new instance when options are provided to ensure
 * correct authentication context. Caching is intentionally not used.
 */
export function getPipelineBackendClient(options?: { orgApiKey?: string; adminApiKey?: string }): PipelineBackendClient {
  return new PipelineBackendClient(options)
}

// Legacy export for backward compatibility
export const getBackendClient = getPipelineBackendClient
export const BackendClient = PipelineBackendClient
