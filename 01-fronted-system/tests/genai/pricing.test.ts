/**
 * GenAI Pricing Data Tests
 * Tests for all GenAI pricing data files and helper functions
 */

import { describe, it, expect } from 'vitest';
import {
  // PAYG
  GENAI_PAYG_PRICING,
  getPaygPricingByProvider,
  getPaygPricingByModel,
  getActivePaygPricing,
  getPaygProviders,
  calculateTokenCost,
  type GenAIPAYGPricing,

  // Commitment
  GENAI_COMMITMENT_PRICING,
  getCommitmentPricingByProvider,
  getActiveCommitmentPricing,
  getCommitmentProviders,
  type GenAICommitmentPricing,

  // Infrastructure
  GENAI_INFRASTRUCTURE_PRICING,
  getInfraPricingByProvider,
  getInfraPricingByGpuType,
  getActiveInfraPricing,
  getInfraProviders,
  getGpuTypes,
  calculateHourlyCost,
  calculateMonthlyCost,
  type GenAIInfrastructurePricing,

  // Volume Tiers
  GENAI_VOLUME_TIERS,
  getVolumeTiersByProvider,
  getActiveVolumeTiers,
  type GenAIVolumeTier,

  // Support Tiers
  GENAI_SUPPORT_TIERS,
  getSupportTiersByProvider,
  getActiveSupportTiers,
  type GenAISupportTier,

  // Media
  GENAI_MEDIA_PRICING,
  getMediaPricingByProvider,
  getMediaPricingByType,
  getActiveMediaPricing,
  getMediaProviders,
  type GenAIMediaPricing,

  // Training
  GENAI_TRAINING_PRICING,
  getTrainingPricingByProvider,
  getActiveTrainingPricing,
  getTrainingProviders,
  type GenAITrainingPricing,

  // Providers
  GENAI_PROVIDERS,
  getProviderById,
  getProvidersByType,
  getActiveProviders,
  type GenAIProvider,

  // Summary
  getGenAIPricingSummary
} from '@/lib/data/genai';

// ============================================================================
// PAYG Pricing Tests
// ============================================================================
describe('GenAI PAYG Pricing', () => {
  describe('Data Integrity', () => {
    it('should have PAYG pricing data', () => {
      expect(GENAI_PAYG_PRICING).toBeDefined();
      expect(Array.isArray(GENAI_PAYG_PRICING)).toBe(true);
      expect(GENAI_PAYG_PRICING.length).toBeGreaterThan(0);
    });

    it('should have required fields for all entries', () => {
      GENAI_PAYG_PRICING.forEach((pricing: GenAIPAYGPricing) => {
        expect(pricing.provider).toBeDefined();
        expect(pricing.model).toBeDefined();
        expect(pricing.input_per_1m).toBeDefined();
        expect(pricing.output_per_1m).toBeDefined();
        expect(pricing.status).toBeDefined();
      });
    });

    it('should have valid numeric values for pricing', () => {
      GENAI_PAYG_PRICING.forEach((pricing: GenAIPAYGPricing) => {
        expect(typeof pricing.input_per_1m).toBe('number');
        expect(typeof pricing.output_per_1m).toBe('number');
        expect(pricing.input_per_1m).toBeGreaterThanOrEqual(0);
        expect(pricing.output_per_1m).toBeGreaterThanOrEqual(0);
      });
    });

    it('should have valid provider names', () => {
      const validProviders = ['openai', 'anthropic', 'gemini', 'azure_openai', 'aws_bedrock', 'gcp_vertex', 'deepseek'];
      GENAI_PAYG_PRICING.forEach((pricing: GenAIPAYGPricing) => {
        expect(validProviders).toContain(pricing.provider);
      });
    });
  });

  describe('Helper Functions', () => {
    it('getPaygPricingByProvider should filter by provider', () => {
      const openaiPricing = getPaygPricingByProvider('openai');
      expect(openaiPricing.length).toBeGreaterThan(0);
      openaiPricing.forEach((p) => {
        expect(p.provider).toBe('openai');
      });
    });

    it('getPaygPricingByModel should find specific model (requires provider)', () => {
      const gpt4Pricing = getPaygPricingByModel('openai', 'gpt-4o');
      expect(gpt4Pricing).toBeDefined();
      if (gpt4Pricing) {
        expect(gpt4Pricing.model).toBe('gpt-4o');
        expect(gpt4Pricing.provider).toBe('openai');
      }
    });

    it('getActivePaygPricing should return only active entries', () => {
      const activePricing = getActivePaygPricing();
      activePricing.forEach((p) => {
        expect(p.status).toBe('active');
      });
    });

    it('getPaygProviders should return unique providers', () => {
      const providers = getPaygProviders();
      expect(providers.length).toBeGreaterThan(0);
      const uniqueProviders = [...new Set(providers)];
      expect(providers.length).toBe(uniqueProviders.length);
    });
  });

  describe('Cost Calculations', () => {
    it('calculateTokenCost should calculate correctly with pricing object', () => {
      const pricing = getPaygPricingByModel('openai', 'gpt-4o');
      expect(pricing).toBeDefined();
      if (pricing) {
        // 1M input tokens at $2.50/1M = $2.50
        const cost = calculateTokenCost(pricing, 1000000, 0, 0);
        expect(cost).toBeCloseTo(2.50, 2);
      }
    });

    it('calculateTokenCost should handle both input and output', () => {
      const pricing = getPaygPricingByModel('openai', 'gpt-4o');
      expect(pricing).toBeDefined();
      if (pricing) {
        // 500K input at $2.50/1M = $1.25, 500K output at $10/1M = $5
        const cost = calculateTokenCost(pricing, 500000, 500000, 0);
        expect(cost).toBeCloseTo(6.25, 2);
      }
    });

    it('calculateTokenCost should handle zero tokens', () => {
      const pricing = getPaygPricingByModel('openai', 'gpt-4o');
      expect(pricing).toBeDefined();
      if (pricing) {
        const cost = calculateTokenCost(pricing, 0, 0, 0);
        expect(cost).toBe(0);
      }
    });
  });
});

// ============================================================================
// Commitment Pricing Tests
// ============================================================================
describe('GenAI Commitment Pricing', () => {
  describe('Data Integrity', () => {
    it('should have commitment pricing data', () => {
      expect(GENAI_COMMITMENT_PRICING).toBeDefined();
      expect(Array.isArray(GENAI_COMMITMENT_PRICING)).toBe(true);
      expect(GENAI_COMMITMENT_PRICING.length).toBeGreaterThan(0);
    });

    it('should have required fields', () => {
      GENAI_COMMITMENT_PRICING.forEach((pricing: GenAICommitmentPricing) => {
        expect(pricing.provider).toBeDefined();
        expect(pricing.commitment_type).toBeDefined();
        expect(pricing.status).toBeDefined();
      });
    });

    it('should have valid commitment types', () => {
      const validTypes = ['ptu', 'gsu', 'provisioned_throughput', 'reserved'];
      GENAI_COMMITMENT_PRICING.forEach((pricing: GenAICommitmentPricing) => {
        expect(validTypes).toContain(pricing.commitment_type);
      });
    });
  });

  describe('Helper Functions', () => {
    it('getCommitmentPricingByProvider should filter correctly', () => {
      const azurePricing = getCommitmentPricingByProvider('azure_openai_ptu');
      azurePricing.forEach((p) => {
        expect(p.provider).toBe('azure_openai_ptu');
      });
    });

    it('getActiveCommitmentPricing should return active entries', () => {
      const activePricing = getActiveCommitmentPricing();
      activePricing.forEach((p) => {
        expect(p.status).toBe('active');
      });
    });

    it('getCommitmentProviders should return unique providers', () => {
      const providers = getCommitmentProviders();
      const uniqueProviders = [...new Set(providers)];
      expect(providers.length).toBe(uniqueProviders.length);
    });
  });
});

// ============================================================================
// Infrastructure Pricing Tests
// ============================================================================
describe('GenAI Infrastructure Pricing', () => {
  describe('Data Integrity', () => {
    it('should have infrastructure pricing data', () => {
      expect(GENAI_INFRASTRUCTURE_PRICING).toBeDefined();
      expect(Array.isArray(GENAI_INFRASTRUCTURE_PRICING)).toBe(true);
      expect(GENAI_INFRASTRUCTURE_PRICING.length).toBeGreaterThan(0);
    });

    it('should have required fields', () => {
      GENAI_INFRASTRUCTURE_PRICING.forEach((pricing: GenAIInfrastructurePricing) => {
        expect(pricing.provider).toBeDefined();
        expect(pricing.gpu_type).toBeDefined();
        expect(pricing.hourly_rate).toBeDefined();
      });
    });

    it('should have valid hourly rates', () => {
      GENAI_INFRASTRUCTURE_PRICING.forEach((pricing: GenAIInfrastructurePricing) => {
        expect(typeof pricing.hourly_rate).toBe('number');
        expect(pricing.hourly_rate).toBeGreaterThan(0);
      });
    });
  });

  describe('Helper Functions', () => {
    it('getInfraPricingByProvider should filter correctly', () => {
      const gcpPricing = getInfraPricingByProvider('gcp_gpu');
      gcpPricing.forEach((p) => {
        expect(p.provider).toBe('gcp_gpu');
      });
    });

    it('getInfraPricingByGpuType should filter by GPU', () => {
      const a100Pricing = getInfraPricingByGpuType('A100-40GB');
      a100Pricing.forEach((p) => {
        expect(p.gpu_type).toBe('A100-40GB');
      });
    });

    it('getGpuTypes should return unique GPU types', () => {
      const gpuTypes = getGpuTypes();
      expect(gpuTypes.length).toBeGreaterThan(0);
    });

    it('getActiveInfraPricing should return active entries', () => {
      const activePricing = getActiveInfraPricing();
      activePricing.forEach((p) => {
        expect(p.status).toBe('active');
      });
    });
  });

  describe('Cost Calculations', () => {
    it('calculateHourlyCost should calculate correctly with pricing object', () => {
      const gcpPricing = getInfraPricingByProvider('gcp_gpu');
      expect(gcpPricing.length).toBeGreaterThan(0);
      const pricing = gcpPricing[0];
      // 10 hours at on-demand rate
      const cost = calculateHourlyCost(pricing, 10, 'on_demand');
      expect(cost).toBeCloseTo(pricing.hourly_rate * 10, 2);
    });

    it('calculateMonthlyCost should estimate 720 hours (24h * 30d)', () => {
      const gcpPricing = getInfraPricingByProvider('gcp_gpu');
      expect(gcpPricing.length).toBeGreaterThan(0);
      const pricing = gcpPricing[0];
      const cost = calculateMonthlyCost(pricing, 24, 'on_demand');
      expect(cost).toBeCloseTo(pricing.hourly_rate * 720, 2);
    });

    it('calculateHourlyCost should apply spot discount', () => {
      const gcpPricing = getInfraPricingByProvider('gcp_gpu');
      expect(gcpPricing.length).toBeGreaterThan(0);
      const pricing = gcpPricing[0];
      const onDemandCost = calculateHourlyCost(pricing, 10, 'on_demand');
      const spotCost = calculateHourlyCost(pricing, 10, 'spot');
      // Spot should be cheaper
      expect(spotCost).toBeLessThan(onDemandCost);
    });
  });
});

// ============================================================================
// Volume Tiers Tests
// ============================================================================
describe('GenAI Volume Tiers', () => {
  describe('Data Integrity', () => {
    it('should have volume tier data', () => {
      expect(GENAI_VOLUME_TIERS).toBeDefined();
      expect(Array.isArray(GENAI_VOLUME_TIERS)).toBe(true);
      expect(GENAI_VOLUME_TIERS.length).toBeGreaterThan(0);
    });

    it('should have required fields', () => {
      GENAI_VOLUME_TIERS.forEach((tier: GenAIVolumeTier) => {
        expect(tier.provider).toBeDefined();
        expect(tier.tier_name).toBeDefined();
        expect(tier.discount_pct).toBeDefined();
      });
    });

    it('should have valid discount percentages', () => {
      GENAI_VOLUME_TIERS.forEach((tier: GenAIVolumeTier) => {
        expect(tier.discount_pct).toBeGreaterThanOrEqual(0);
        expect(tier.discount_pct).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Helper Functions', () => {
    it('getVolumeTiersByProvider should filter correctly', () => {
      const openaiTiers = getVolumeTiersByProvider('openai');
      openaiTiers.forEach((t) => {
        expect(t.provider).toBe('openai');
      });
    });

    it('getActiveVolumeTiers should return active entries', () => {
      const activeTiers = getActiveVolumeTiers();
      activeTiers.forEach((t) => {
        expect(t.status).toBe('active');
      });
    });
  });
});

// ============================================================================
// Support Tiers Tests
// ============================================================================
describe('GenAI Support Tiers', () => {
  describe('Data Integrity', () => {
    it('should have support tier data', () => {
      expect(GENAI_SUPPORT_TIERS).toBeDefined();
      expect(Array.isArray(GENAI_SUPPORT_TIERS)).toBe(true);
      expect(GENAI_SUPPORT_TIERS.length).toBeGreaterThan(0);
    });

    it('should have required fields', () => {
      GENAI_SUPPORT_TIERS.forEach((tier: GenAISupportTier) => {
        expect(tier.provider).toBeDefined();
        expect(tier.support_tier).toBeDefined();
      });
    });
  });

  describe('Helper Functions', () => {
    it('getSupportTiersByProvider should filter correctly', () => {
      const openaiTiers = getSupportTiersByProvider('openai');
      openaiTiers.forEach((t) => {
        expect(t.provider).toBe('openai');
      });
    });

    it('getActiveSupportTiers should return active entries', () => {
      const activeTiers = getActiveSupportTiers();
      activeTiers.forEach((t) => {
        expect(t.status).toBe('active');
      });
    });
  });
});

// ============================================================================
// Media Pricing Tests
// ============================================================================
describe('GenAI Media Pricing', () => {
  describe('Data Integrity', () => {
    it('should have media pricing data', () => {
      expect(GENAI_MEDIA_PRICING).toBeDefined();
      expect(Array.isArray(GENAI_MEDIA_PRICING)).toBe(true);
      expect(GENAI_MEDIA_PRICING.length).toBeGreaterThan(0);
    });

    it('should have required fields', () => {
      GENAI_MEDIA_PRICING.forEach((pricing: GenAIMediaPricing) => {
        expect(pricing.provider).toBeDefined();
        expect(pricing.media_type).toBeDefined();
        expect(pricing.model).toBeDefined();
      });
    });

    it('should have valid media types', () => {
      const validTypes = ['image', 'audio', 'video', 'speech', 'image_generation', 'image_editing', 'speech_synthesis', 'speech_recognition'];
      GENAI_MEDIA_PRICING.forEach((pricing: GenAIMediaPricing) => {
        expect(validTypes).toContain(pricing.media_type);
      });
    });
  });

  describe('Helper Functions', () => {
    it('getMediaPricingByProvider should filter correctly', () => {
      const openaiMedia = getMediaPricingByProvider('openai');
      openaiMedia.forEach((p) => {
        expect(p.provider).toBe('openai');
      });
    });

    it('getMediaPricingByType should filter by type', () => {
      const imagePricing = getMediaPricingByType('image_generation');
      imagePricing.forEach((p) => {
        expect(p.media_type).toBe('image_generation');
      });
    });

    it('getActiveMediaPricing should return active entries', () => {
      const activePricing = getActiveMediaPricing();
      activePricing.forEach((p) => {
        expect(p.status).toBe('active');
      });
    });

    it('getMediaProviders should return unique providers', () => {
      const providers = getMediaProviders();
      const uniqueProviders = [...new Set(providers)];
      expect(providers.length).toBe(uniqueProviders.length);
    });
  });
});

// ============================================================================
// Training Pricing Tests
// ============================================================================
describe('GenAI Training Pricing', () => {
  describe('Data Integrity', () => {
    it('should have training pricing data', () => {
      expect(GENAI_TRAINING_PRICING).toBeDefined();
      expect(Array.isArray(GENAI_TRAINING_PRICING)).toBe(true);
      expect(GENAI_TRAINING_PRICING.length).toBeGreaterThan(0);
    });

    it('should have required fields', () => {
      GENAI_TRAINING_PRICING.forEach((pricing: GenAITrainingPricing) => {
        expect(pricing.provider).toBeDefined();
        expect(pricing.training_type).toBeDefined();
        expect(pricing.base_model).toBeDefined();
      });
    });

    it('should have valid training types', () => {
      const validTypes = ['fine-tuning', 'distillation', 'reinforcement', 'customization', 'tuning'];
      GENAI_TRAINING_PRICING.forEach((pricing: GenAITrainingPricing) => {
        expect(validTypes).toContain(pricing.training_type);
      });
    });
  });

  describe('Helper Functions', () => {
    it('getTrainingPricingByProvider should filter correctly', () => {
      const openaiTraining = getTrainingPricingByProvider('openai');
      openaiTraining.forEach((p) => {
        expect(p.provider).toBe('openai');
      });
    });

    it('getActiveTrainingPricing should return active entries', () => {
      const activePricing = getActiveTrainingPricing();
      activePricing.forEach((p) => {
        expect(p.status).toBe('active');
      });
    });

    it('getTrainingProviders should return unique providers', () => {
      const providers = getTrainingProviders();
      const uniqueProviders = [...new Set(providers)];
      expect(providers.length).toBe(uniqueProviders.length);
    });
  });
});

// ============================================================================
// Provider Metadata Tests
// ============================================================================
describe('GenAI Providers', () => {
  describe('Data Integrity', () => {
    it('should have provider data', () => {
      expect(GENAI_PROVIDERS).toBeDefined();
      expect(Array.isArray(GENAI_PROVIDERS)).toBe(true);
      expect(GENAI_PROVIDERS.length).toBeGreaterThan(0);
    });

    it('should have required fields', () => {
      GENAI_PROVIDERS.forEach((provider: GenAIProvider) => {
        expect(provider.id).toBeDefined();
        expect(provider.name).toBeDefined();
        expect(provider.provider_type).toBeDefined();
        expect(provider.status).toBeDefined();
      });
    });

    it('should have valid provider types', () => {
      const validTypes = ['api', 'cloud_hosted', 'self_hosted'];
      GENAI_PROVIDERS.forEach((provider: GenAIProvider) => {
        expect(validTypes).toContain(provider.provider_type);
      });
    });
  });

  describe('Helper Functions', () => {
    it('getProviderById should find provider', () => {
      const openai = getProviderById('openai');
      expect(openai).toBeDefined();
      if (openai) {
        expect(openai.id).toBe('openai');
      }
    });

    it('getProvidersByType should filter correctly', () => {
      const apiProviders = getProvidersByType('api');
      apiProviders.forEach((p) => {
        expect(p.provider_type).toBe('api');
      });
    });

    it('getActiveProviders should return active entries', () => {
      const activeProviders = getActiveProviders();
      activeProviders.forEach((p) => {
        expect(p.status).toBe('active');
      });
    });
  });
});

// ============================================================================
// Summary Function Tests
// ============================================================================
describe('GenAI Pricing Summary', () => {
  it('should return complete summary', () => {
    const summary = getGenAIPricingSummary();

    expect(summary).toBeDefined();
    expect(summary.payg).toBeDefined();
    expect(summary.payg.models).toBeGreaterThan(0);
    expect(summary.payg.providers).toBeGreaterThan(0);

    expect(summary.commitment).toBeDefined();
    expect(summary.commitment.entries).toBeGreaterThan(0);

    expect(summary.infrastructure).toBeDefined();
    expect(summary.infrastructure.instances).toBeGreaterThan(0);

    expect(summary.volumeTiers).toBeGreaterThan(0);
    expect(summary.supportTiers).toBeGreaterThan(0);
    expect(summary.media).toBeGreaterThan(0);
    expect(summary.training).toBeGreaterThan(0);
    expect(summary.providers).toBeGreaterThan(0);
  });

  it('should have consistent provider counts', () => {
    const summary = getGenAIPricingSummary();
    const paygProviders = getPaygProviders();
    expect(summary.payg.providers).toBe(paygProviders.length);
  });
});

// ============================================================================
// Cross-Data Consistency Tests
// ============================================================================
describe('Cross-Data Consistency', () => {
  it('all PAYG providers should exist in providers list', () => {
    const paygProviders = getPaygProviders();
    paygProviders.forEach((providerId) => {
      const provider = getProviderById(providerId);
      expect(provider).toBeDefined();
    });
  });
});
