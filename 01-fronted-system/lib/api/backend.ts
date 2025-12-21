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
 * MUST match backend validation: alphanumeric + underscore only, 3-50 chars
 */
function validateOrgSlug(orgSlug: string): void {
  if (!orgSlug || typeof orgSlug !== "string") {
    throw new Error("org_slug is required and must be a string")
  }
  // Match backend validation: alphanumeric + underscore only, 3-50 chars (NO hyphens)
  if (!/^[a-zA-Z0-9_]{3,50}$/.test(orgSlug)) {
    throw new Error(
      `Invalid org_slug format: "${orgSlug}". ` +
      "Must be 3-50 characters, alphanumeric with underscores only (no hyphens)."
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
  status: "VALID" | "INVALID" | "PENDING" | "NOT_CONFIGURED"
  credential_name?: string
  last_validated_at?: string
  last_error?: string
  created_at?: string
  is_enabled?: boolean
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
  provider: string
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
 * Matches OpenAIPricingCreate Pydantic model.
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
 * Matches OpenAIPricingUpdate Pydantic model.
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
 * Matches OpenAISubscriptionCreate Pydantic model.
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
 * Matches OpenAISubscriptionUpdate Pydantic model.
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

// Legacy type aliases for backward compatibility
export type OpenAIPricing = LLMPricing
export type OpenAIPricingCreate = LLMPricingCreate
export type OpenAIPricingUpdate = LLMPricingUpdate
export type OpenAIPricingListResponse = LLMPricingListResponse
export type OpenAISubscription = SaaSSubscription
export type OpenAISubscriptionCreate = SaaSSubscriptionCreate
export type OpenAISubscriptionUpdate = SaaSSubscriptionUpdate
export type OpenAISubscriptionListResponse = SaaSSubscriptionListResponse
// New LLM type aliases pointing to SaaS types
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

export interface PipelineRunSummary {
  pipeline_logging_id: string
  pipeline_id: string
  status: string
  trigger_type: string
  trigger_by?: string
  start_time?: string
  end_time?: string
  duration_ms?: number
  run_date?: string
  error_message?: string
  parameters?: Record<string, unknown>
}

export interface StepLogSummary {
  step_logging_id: string
  step_name: string
  step_type: string
  step_index: number
  status: string
  start_time?: string
  end_time?: string
  duration_ms?: number
  rows_processed?: number
  error_message?: string
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
 * Only retry on 5xx server errors and network errors.
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof BackendAPIError) {
    // Retry on 5xx errors (server errors)
    return error.statusCode >= 500 && error.statusCode < 600
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
      const delayMs = Math.min(
        retryConfig.initialDelayMs * Math.pow(retryConfig.backoffMultiplier, attempt - 1),
        retryConfig.maxDelayMs
      )

      console.log(`[Backend] Retry attempt ${attempt}/${retryConfig.maxAttempts} after ${delayMs}ms`)
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
      (errorData.detail as string) || `HTTP ${response.status}: ${response.statusText}`,
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
    provider: "openai" | "anthropic" | "gemini" | "deepseek" | "gcp" | "gcp_service_account",
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
   */
  async runPipeline(
    orgSlug: string,
    provider: string,
    domain: string,
    pipeline: string,
    params?: PipelineRunRequest
  ): Promise<PipelineRunResponse> {
    validateOrgSlug(orgSlug)
    // Build URL path, handling empty domain (avoids double slash)
    const pathParts = [provider, domain, pipeline].filter(Boolean)
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
   * Note: Uses empty string for domain since config is at configs/gcp/billing.yml
   */
  async runBillingPipeline(
    orgSlug: string,
    date?: string
  ): Promise<PipelineRunResponse> {
    return this.runPipeline(orgSlug, "gcp", "", "billing", { date })
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
    const url = `${this.baseUrl}/api/v1/pipelines/${orgSlug}/runs${queryString ? `?${queryString}` : ""}`

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
   */
  async getPipelineRunDetail(
    orgSlug: string,
    pipelineLoggingId: string
  ): Promise<PipelineRunDetail> {
    validateOrgSlug(orgSlug)
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/pipelines/${orgSlug}/runs/${encodeURIComponent(pipelineLoggingId)}`,
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
  // Legacy method aliases for backward compatibility
  // ============================================

  /**
   * @deprecated Use listSaaSSubscriptions(orgSlug, provider) instead
   */
  async listLLMSubscriptions(orgSlug: string, provider: LLMProvider): Promise<SaaSSubscriptionListResponse> {
    return this.listSaaSSubscriptions(orgSlug, provider)
  }

  /**
   * @deprecated Use getSaaSSubscription(orgSlug, provider, planName) instead
   */
  async getLLMSubscription(orgSlug: string, provider: LLMProvider, planName: string): Promise<SaaSSubscription> {
    return this.getSaaSSubscription(orgSlug, provider, planName)
  }

  /**
   * @deprecated Use createSaaSSubscription(orgSlug, provider, subscription) instead
   */
  async createLLMSubscription(orgSlug: string, provider: LLMProvider, subscription: SaaSSubscriptionCreate): Promise<SaaSSubscription> {
    return this.createSaaSSubscription(orgSlug, provider, subscription)
  }

  /**
   * @deprecated Use updateSaaSSubscription(orgSlug, provider, planName, subscription) instead
   */
  async updateLLMSubscription(orgSlug: string, provider: LLMProvider, planName: string, subscription: SaaSSubscriptionUpdate): Promise<SaaSSubscription> {
    return this.updateSaaSSubscription(orgSlug, provider, planName, subscription)
  }

  /**
   * @deprecated Use deleteSaaSSubscription(orgSlug, provider, planName) instead
   */
  async deleteLLMSubscription(orgSlug: string, provider: LLMProvider, planName: string): Promise<void> {
    return this.deleteSaaSSubscription(orgSlug, provider, planName)
  }

  /**
   * @deprecated Use resetSaaSSubscriptions(orgSlug, provider) instead
   */
  async resetLLMSubscriptions(orgSlug: string, provider: LLMProvider): Promise<SaaSSubscriptionListResponse> {
    return this.resetSaaSSubscriptions(orgSlug, provider)
  }

  // ============================================
  // OpenAI Data CRUD Operations (Legacy - use listLLMPricing("openai") instead)
  // ============================================

  /**
   * @deprecated Use listLLMPricing(orgSlug, "openai") instead
   * List all OpenAI pricing models for an organization.
   */
  async listOpenAIPricing(orgSlug: string): Promise<OpenAIPricingListResponse> {
    return this.listLLMPricing(orgSlug, "openai")
  }

  /**
   * @deprecated Use getLLMPricing(orgSlug, "openai", modelId) instead
   */
  async getOpenAIPricing(orgSlug: string, modelId: string): Promise<OpenAIPricing> {
    return this.getLLMPricing(orgSlug, "openai", modelId)
  }

  /**
   * @deprecated Use createLLMPricing(orgSlug, "openai", pricing) instead
   */
  async createOpenAIPricing(orgSlug: string, pricing: OpenAIPricingCreate): Promise<OpenAIPricing> {
    return this.createLLMPricing(orgSlug, "openai", pricing)
  }

  /**
   * @deprecated Use updateLLMPricing(orgSlug, "openai", modelId, pricing) instead
   */
  async updateOpenAIPricing(orgSlug: string, modelId: string, pricing: OpenAIPricingUpdate): Promise<OpenAIPricing> {
    return this.updateLLMPricing(orgSlug, "openai", modelId, pricing)
  }

  /**
   * @deprecated Use deleteLLMPricing(orgSlug, "openai", modelId) instead
   */
  async deleteOpenAIPricing(orgSlug: string, modelId: string): Promise<void> {
    return this.deleteLLMPricing(orgSlug, "openai", modelId)
  }

  /**
   * @deprecated Use resetLLMPricing(orgSlug, "openai") instead
   */
  async resetOpenAIPricing(orgSlug: string): Promise<LLMPricingListResponse> {
    return this.resetLLMPricing(orgSlug, "openai")
  }

  /**
   * @deprecated Use listSaaSSubscriptions(orgSlug, "openai") instead
   */
  async listOpenAISubscriptions(orgSlug: string): Promise<OpenAISubscriptionListResponse> {
    return this.listSaaSSubscriptions(orgSlug, "openai")
  }

  /**
   * @deprecated Use getSaaSSubscription(orgSlug, "openai", planName) instead
   */
  async getOpenAISubscription(orgSlug: string, planName: string): Promise<OpenAISubscription> {
    return this.getSaaSSubscription(orgSlug, "openai", planName)
  }

  /**
   * @deprecated Use createSaaSSubscription(orgSlug, "openai", subscription) instead
   */
  async createOpenAISubscription(orgSlug: string, subscription: OpenAISubscriptionCreate): Promise<OpenAISubscription> {
    return this.createSaaSSubscription(orgSlug, "openai", subscription)
  }

  /**
   * @deprecated Use updateSaaSSubscription(orgSlug, "openai", planName, subscription) instead
   */
  async updateOpenAISubscription(orgSlug: string, planName: string, subscription: OpenAISubscriptionUpdate): Promise<OpenAISubscription> {
    return this.updateSaaSSubscription(orgSlug, "openai", planName, subscription)
  }

  /**
   * @deprecated Use deleteSaaSSubscription(orgSlug, "openai", planName) instead
   */
  async deleteOpenAISubscription(orgSlug: string, planName: string): Promise<void> {
    return this.deleteSaaSSubscription(orgSlug, "openai", planName)
  }

  /**
   * @deprecated Use resetSaaSSubscriptions(orgSlug, "openai") instead
   */
  async resetOpenAISubscriptions(orgSlug: string): Promise<SaaSSubscriptionListResponse> {
    return this.resetSaaSSubscriptions(orgSlug, "openai")
  }
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
