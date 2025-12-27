/**
 * GenAI Pricing Data Index
 * Central export for all GenAI pricing and provider data
 *
 * Error Boundary Pattern: All data access functions include error handling
 * to prevent crashes from malformed data and provide meaningful fallbacks.
 */

// ============================================================================
// Error Boundary Types and Utilities
// ============================================================================

/**
 * Error type for GenAI pricing data operations
 */
export interface GenAIPricingError {
  code: 'DATA_LOAD_ERROR' | 'CALCULATION_ERROR' | 'VALIDATION_ERROR' | 'UNKNOWN_ERROR'
  message: string
  context?: string
  originalError?: Error
}

/**
 * Result type for safe operations that may fail
 */
export type SafeResult<T> =
  | { success: true; data: T }
  | { success: false; error: GenAIPricingError }

/**
 * Creates a pricing error with consistent structure
 */
export function createPricingError(
  code: GenAIPricingError['code'],
  message: string,
  context?: string,
  originalError?: Error
): GenAIPricingError {
  return { code, message, context, originalError }
}

/**
 * Wraps a function with error boundary handling
 * Returns a safe result or empty array/default value on error
 */
export function withErrorBoundary<T, Args extends unknown[]>(
  fn: (...args: Args) => T,
  defaultValue: T,
  context: string
): (...args: Args) => T {
  return (...args: Args): T => {
    try {
      return fn(...args)
    } catch (error) {
      console.error(`[GenAI Pricing Error] ${context}:`, error)
      return defaultValue
    }
  }
}

/**
 * Wraps a function with error boundary and returns SafeResult
 */
export function withSafeResult<T, Args extends unknown[]>(
  fn: (...args: Args) => T,
  context: string
): (...args: Args) => SafeResult<T> {
  return (...args: Args): SafeResult<T> => {
    try {
      const data = fn(...args)
      return { success: true, data }
    } catch (error) {
      console.error(`[GenAI Pricing Error] ${context}:`, error)
      return {
        success: false,
        error: createPricingError(
          'CALCULATION_ERROR',
          error instanceof Error ? error.message : 'Unknown error occurred',
          context,
          error instanceof Error ? error : undefined
        )
      }
    }
  }
}

// ============================================================================
// PAYG (Pay-As-You-Go) Token Pricing
// ============================================================================
export {
  type GenAIPAYGPricing,
  GENAI_PAYG_PRICING,
  getPaygPricingByProvider,
  getPaygPricingByModel,
  getPaygPricingByRegion,
  getActivePaygPricing,
  getPaygProviders,
  calculateTokenCost
} from './genai-payg-pricing';

// ============================================================================
// Commitment Pricing (PTU/GSU) - Issue #46: Updated with standardized field names
// ============================================================================
export {
  type GenAICommitmentPricing,
  GENAI_COMMITMENT_PRICING,
  getCommitmentPricingByProvider,
  getCommitmentPricingByModel,
  getCommitmentPricingByType,
  getActiveCommitmentPricing,
  getCommitmentProviders,
  calculateCommitmentMonthlyCost,
  calculateCommitmentHourlyCost,
  calculateTokenCapacity  // New: Calculate token capacity for given units
} from './genai-commitment-pricing';

// ============================================================================
// Infrastructure Pricing (GPU/TPU)
// ============================================================================
export {
  type GenAIInfrastructurePricing,
  GENAI_INFRASTRUCTURE_PRICING,
  getInfraPricingByProvider,
  getInfraPricingByGpuType,
  getInfraPricingByResourceType,
  getInfraPricingByCloudProvider,
  getActiveInfraPricing,
  getInfraProviders,
  getGpuTypes,
  calculateHourlyCost,
  calculateMonthlyCost
} from './genai-infrastructure-pricing';

// ============================================================================
// Volume Tiers
// ============================================================================
export {
  type GenAIVolumeTier,
  GENAI_VOLUME_TIERS,
  getVolumeTiersByProvider,
  getVolumeTierForSpend,
  getVolumeTierForTokens,
  getActiveVolumeTiers,
  getVolumeProviders,
  calculateDiscountedCost
} from './genai-volume-tiers';

// ============================================================================
// Support Tiers
// ============================================================================
export {
  type GenAISupportTier,
  GENAI_SUPPORT_TIERS,
  getSupportTiersByProvider,
  getSupportTierForSpend,
  getActiveSupportTiers,
  getSupportProviders,
  calculateSupportCost,
  parseResponseTime
} from './genai-support-tiers';

// ============================================================================
// Media Pricing (Image/Audio/Video)
// ============================================================================
export {
  type GenAIMediaPricing,
  GENAI_MEDIA_PRICING,
  getMediaPricingByProvider,
  getMediaPricingByType,
  getMediaPricingByModel,
  getActiveMediaPricing,
  getMediaProviders,
  getMediaTypes,
  calculateMediaCost
} from './genai-media-pricing';

// ============================================================================
// Training/Fine-tuning Pricing
// ============================================================================
export {
  type GenAITrainingPricing,
  GENAI_TRAINING_PRICING,
  getTrainingPricingByProvider,
  getTrainingPricingByType,
  getTrainingPricingByBaseModel,
  getActiveTrainingPricing,
  getTrainingProviders,
  getTrainingTypes,
  calculateTrainingCost,
  calculateFineTunedInferenceCost
} from './genai-training-pricing';

// ============================================================================
// Provider Metadata
// ============================================================================
export {
  type GenAIProvider,
  GENAI_PROVIDERS,
  getProviderById,
  getProvidersByType,
  getProvidersByCloudPlatform,
  getPaygProviders as getPaygProvidersList,
  getCommitmentProviders as getCommitmentProvidersList,
  getInfrastructureProviders as getInfrastructureProvidersList,
  getActiveProviders,
  getProviderRegions,
  getApiProviders,
  getCloudProviders
} from './genai-providers';

// Convenience type exports for BigQuery table mapping
export type GenAIPricingTable =
  | 'genai_payg_pricing'
  | 'genai_commitment_pricing'
  | 'genai_infrastructure_pricing';

export type GenAIUsageTable =
  | 'genai_payg_usage_raw'
  | 'genai_commitment_usage_raw'
  | 'genai_infrastructure_usage_raw';

export type GenAICostsTable =
  | 'genai_payg_costs_daily'
  | 'genai_commitment_costs_daily'
  | 'genai_infrastructure_costs_daily';

export type GenAIUnifiedTable =
  | 'genai_usage_daily_unified'
  | 'genai_costs_daily_unified';

export type GenAICostType = 'payg' | 'commitment' | 'infrastructure';

// ============================================================================
// Summary Statistics Helper with Error Boundary
// ============================================================================

interface GenAIPricingSummary {
  payg: { models: number; providers: number }
  commitment: { entries: number; providers: number }
  infrastructure: { instances: number; providers: number }
  volumeTiers: number
  supportTiers: number
  media: number
  training: number
  providers: number
}

const DEFAULT_SUMMARY: GenAIPricingSummary = {
  payg: { models: 0, providers: 0 },
  commitment: { entries: 0, providers: 0 },
  infrastructure: { instances: 0, providers: 0 },
  volumeTiers: 0,
  supportTiers: 0,
  media: 0,
  training: 0,
  providers: 0
}

/**
 * Get summary statistics for GenAI pricing data
 * Wrapped with error boundary to prevent crashes from malformed data
 */
export function getGenAIPricingSummary(): GenAIPricingSummary {
  try {
    return {
      payg: {
        models: GENAI_PAYG_PRICING?.length ?? 0,
        providers: GENAI_PAYG_PRICING ? [...new Set(GENAI_PAYG_PRICING.map(p => p.provider))].length : 0
      },
      commitment: {
        entries: GENAI_COMMITMENT_PRICING?.length ?? 0,
        providers: GENAI_COMMITMENT_PRICING ? [...new Set(GENAI_COMMITMENT_PRICING.map(p => p.provider))].length : 0
      },
      infrastructure: {
        instances: GENAI_INFRASTRUCTURE_PRICING?.length ?? 0,
        providers: GENAI_INFRASTRUCTURE_PRICING ? [...new Set(GENAI_INFRASTRUCTURE_PRICING.map(p => p.provider))].length : 0
      },
      volumeTiers: GENAI_VOLUME_TIERS?.length ?? 0,
      supportTiers: GENAI_SUPPORT_TIERS?.length ?? 0,
      media: GENAI_MEDIA_PRICING?.length ?? 0,
      training: GENAI_TRAINING_PRICING?.length ?? 0,
      providers: GENAI_PROVIDERS?.length ?? 0
    }
  } catch (error) {
    console.error('[GenAI Pricing Error] Failed to generate summary:', error)
    return DEFAULT_SUMMARY
  }
}

/**
 * Safe version of getGenAIPricingSummary that returns SafeResult
 */
export function getGenAIPricingSummarySafe(): SafeResult<GenAIPricingSummary> {
  try {
    const data = getGenAIPricingSummary()
    return { success: true, data }
  } catch (error) {
    console.error('[GenAI Pricing Error] Failed to generate summary:', error)
    return {
      success: false,
      error: createPricingError(
        'DATA_LOAD_ERROR',
        error instanceof Error ? error.message : 'Failed to load pricing summary',
        'getGenAIPricingSummarySafe',
        error instanceof Error ? error : undefined
      )
    }
  }
}

// Import these for convenience
import { GENAI_PAYG_PRICING } from './genai-payg-pricing';
import { GENAI_COMMITMENT_PRICING } from './genai-commitment-pricing';
import { GENAI_INFRASTRUCTURE_PRICING } from './genai-infrastructure-pricing';
import { GENAI_VOLUME_TIERS } from './genai-volume-tiers';
import { GENAI_SUPPORT_TIERS } from './genai-support-tiers';
import { GENAI_MEDIA_PRICING } from './genai-media-pricing';
import { GENAI_TRAINING_PRICING } from './genai-training-pricing';
import { GENAI_PROVIDERS } from './genai-providers';
