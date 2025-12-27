// ============================================================================
// GenAI Pricing Types
// Exported separately from server actions (which can only export async functions)
// ============================================================================

export type GenAIFlow = "payg" | "commitment" | "infrastructure"

/**
 * PAYG pricing record from API
 */
export interface PAYGPricingRecord {
  id?: string
  provider: string
  model: string
  model_family?: string | null
  model_version?: string | null
  region?: string | null
  input_per_1m: number
  output_per_1m: number
  cached_input_per_1m?: number | null
  cached_write_per_1m?: number | null
  batch_input_per_1m?: number | null
  batch_output_per_1m?: number | null
  cached_discount_pct?: number | null
  batch_discount_pct?: number | null
  volume_tier?: string | null
  volume_discount_pct?: number | null
  free_tier_input_tokens?: number | null
  free_tier_output_tokens?: number | null
  context_window?: number | null
  max_output_tokens?: number | null
  supports_vision?: boolean | null
  supports_streaming?: boolean | null
  supports_tools?: boolean | null
  rate_limit_rpm?: number | null
  rate_limit_tpm?: number | null
  sla_uptime_pct?: number | null
  effective_from?: string | null
  effective_to?: string | null
  status?: string | null
  last_updated?: string | null
  notes?: string | null
  // Override fields
  override_value?: number | null
  override_field?: string | null
  is_custom?: boolean
}

/**
 * Commitment pricing record from API
 */
export interface CommitmentPricingRecord {
  id?: string
  provider: string
  commitment_type?: string | null
  model: string
  model_group?: string | null
  unit_name?: string | null
  region?: string | null
  ptu_hourly_rate?: number | null
  ptu_monthly_rate?: number | null
  min_units?: number | null
  max_units?: number | null
  commitment_term_months?: number | null
  min_commitment_months?: number | null
  tokens_per_unit_minute?: number | null
  term_discount_pct?: number | null
  volume_discount_pct?: number | null
  supports_overage?: boolean | null
  overage_rate_per_unit?: number | null
  effective_from?: string | null
  effective_to?: string | null
  status?: string | null
  last_updated?: string | null
  notes?: string | null
  // Override fields
  override_value?: number | null
  override_field?: string | null
  is_custom?: boolean
}

/**
 * Infrastructure pricing record from API
 */
export interface InfrastructurePricingRecord {
  id?: string
  provider: string
  resource_type?: string | null
  instance_type: string
  gpu_type?: string | null
  gpu_count?: number | null
  gpu_memory_gb?: number | null
  hourly_rate: number
  spot_discount_pct?: number | null
  reserved_1yr_discount_pct?: number | null
  reserved_3yr_discount_pct?: number | null
  region?: string | null
  cloud_provider?: string | null
  effective_from?: string | null
  effective_to?: string | null
  status?: string | null
  last_updated?: string | null
  notes?: string | null
  // Override fields
  override_value?: number | null
  override_field?: string | null
  is_custom?: boolean
}

export interface GenAIPricingResponse {
  org_slug: string
  payg: PAYGPricingRecord[]
  commitment: CommitmentPricingRecord[]
  infrastructure: InfrastructurePricingRecord[]
  total_count: number
  // Pagination metadata
  limit?: number
  offset?: number
  has_more?: boolean
}

export interface PaginationParams {
  limit?: number
  offset?: number
}

// Default pagination limit to prevent frontend crashes with large datasets
export const DEFAULT_PAGINATION_LIMIT = 100

export interface CustomPricingData {
  provider: string
  // PAYG fields
  model?: string | null
  model_family?: string | null
  model_version?: string | null
  region?: string | null
  input_per_1m?: number | null
  output_per_1m?: number | null
  cached_input_per_1m?: number | null
  cached_write_per_1m?: number | null
  batch_input_per_1m?: number | null
  batch_output_per_1m?: number | null
  cached_discount_pct?: number | null
  batch_discount_pct?: number | null
  volume_tier?: string | null
  volume_discount_pct?: number | null
  free_tier_input_tokens?: number | null
  free_tier_output_tokens?: number | null
  context_window?: number | null
  max_output_tokens?: number | null
  supports_vision?: boolean | null
  supports_streaming?: boolean | null
  supports_tools?: boolean | null
  rate_limit_rpm?: number | null
  rate_limit_tpm?: number | null
  sla_uptime_pct?: number | null
  effective_from?: string | null
  effective_to?: string | null
  status?: string | null
  notes?: string | null
  // Commitment fields - Issue #46: Standardized field names
  commitment_type?: string | null
  model_group?: string | null
  unit_name?: string | null  // Issue #48: PTU type identifier
  ptu_hourly_rate?: number | null
  ptu_monthly_rate?: number | null
  min_units?: number | null           // Issue #46: Standardized from min_ptu
  max_units?: number | null           // Issue #46: Standardized from max_ptu
  commitment_term_months?: number | null
  min_commitment_months?: number | null
  tokens_per_unit_minute?: number | null  // Issue #46: Standardized from tokens_per_ptu_minute
  term_discount_pct?: number | null
  supports_overage?: boolean | null
  overage_rate_per_unit?: number | null  // Issue #24: Added overage rate support
  // Infrastructure fields
  resource_type?: string | null
  instance_type?: string | null
  gpu_type?: string | null
  gpu_count?: number | null
  gpu_memory_gb?: number | null
  hourly_rate?: number | null
  spot_discount_pct?: number | null
  reserved_1yr_discount_pct?: number | null
  reserved_3yr_discount_pct?: number | null
  cloud_provider?: string | null
}

export interface PricingOverrideData {
  override_value: number
  override_field?: string
  override_effective_from?: string
  override_effective_to?: string
  notes?: string
  effective_from?: string
}

/** Return type for flow-specific pricing based on GenAIFlow */
export type FlowPricingRecord<T extends GenAIFlow> =
  T extends "payg" ? PAYGPricingRecord :
  T extends "commitment" ? CommitmentPricingRecord :
  T extends "infrastructure" ? InfrastructurePricingRecord :
  never

/** Response data from addCustomPricing */
export interface AddCustomPricingResult {
  success: boolean
  pricingId?: string
  data?: PAYGPricingRecord | CommitmentPricingRecord | InfrastructurePricingRecord
  error?: string
}

/** Validation errors for pricing data */
export interface PricingValidationError {
  field: string
  message: string
}
