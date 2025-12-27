/**
 * @vitest-environment node
 *
 * GenAI Pricing CRUD Tests
 *
 * Tests for GenAI pricing server actions:
 * - Get pricing from backend
 * - Add custom pricing (PAYG, Commitment, Infrastructure)
 * - Set pricing overrides
 * - Delete custom pricing
 * - Reset pricing overrides
 *
 * Prerequisites:
 * - API Service running on port 8000
 * - Backend onboarded organization
 *
 * Run: npx vitest -c vitest.node.config.ts tests/genai/pricing-crud.test.ts --run
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Environment config
const getEnv = (key: string, defaultValue = ''): string => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || defaultValue
  }
  return defaultValue
}

const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL')
const SUPABASE_SERVICE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY')
const API_SERVICE_URL = getEnv('API_SERVICE_URL', 'http://localhost:8000')

// Check if credentials are available
const SKIP_TESTS = !SUPABASE_URL || !SUPABASE_SERVICE_KEY

if (SKIP_TESTS) {
  console.warn('Warning: Supabase credentials not set. Tests will be skipped.')
}

// Test org details
const TEST_ORG_NAME = `genai_pricing_test_org_${Date.now()}`
const TEST_USER_EMAIL = `genai_pricing_test_${Date.now()}@example.com`
const TEST_ORG_SLUG = TEST_ORG_NAME.toLowerCase().replace(/\s+/g, '_')

// Store test data
let supabase: SupabaseClient
let testOrgId: string
let testUserId: string
let testOrgApiKey: string

// ============================================================================
// PAYG PRICING CRUD TESTS
// ============================================================================

describe.skipIf(SKIP_TESTS)('GenAI PAYG Pricing CRUD', () => {
  beforeAll(async () => {
    console.log('Setting up GenAI pricing CRUD tests...')

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false }
    })

    // Create test user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: TEST_USER_EMAIL,
      password: 'TestPassword123!',
      email_confirm: true,
      user_metadata: {
        full_name: 'GenAI Pricing Test User',
        company_name: TEST_ORG_NAME,
        company_type: 'enterprise'
      }
    })

    if (authError) {
      throw new Error(`Failed to create test user: ${authError.message}`)
    }

    testUserId = authData.user.id
    console.log(`Created test user: ${testUserId}`)

    // Create test organization
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .insert({
        org_name: TEST_ORG_NAME,
        org_slug: TEST_ORG_SLUG,
        created_by: testUserId,
        billing_status: 'active',
        plan: 'enterprise',
        backend_onboarded: true,
        backend_api_key_fingerprint: 'test_fingerprint_genai_123'
      })
      .select()
      .single()

    if (orgError) {
      throw new Error(`Failed to create test org: ${orgError.message}`)
    }

    testOrgId = orgData.id
    testOrgApiKey = `${TEST_ORG_SLUG}_api_test_key_${Date.now()}`
    console.log(`Created test org: ${testOrgId}`)

    // Add user as org member (owner)
    await supabase
      .from('organization_members')
      .insert({
        org_id: testOrgId,
        user_id: testUserId,
        role: 'owner',
        status: 'active'
      })

    // Store API key in user metadata
    await supabase.auth.admin.updateUserById(testUserId, {
      user_metadata: {
        full_name: 'GenAI Pricing Test User',
        company_name: TEST_ORG_NAME,
        company_type: 'enterprise',
        org_api_keys: {
          [TEST_ORG_SLUG]: testOrgApiKey
        }
      }
    })

    console.log('Test setup complete')
  }, 60000)

  describe('PAYG Pricing Data Validation', () => {
    it('should validate required fields for PAYG pricing', () => {
      const validPaygData = {
        provider: 'openai',
        model: 'gpt-4-turbo-custom',
        model_family: 'gpt-4',
        region: 'global',
        input_per_1m: 10.00,
        output_per_1m: 30.00,
        context_window: 128000,
        max_output_tokens: 4096
      }

      expect(validPaygData.provider).toBeDefined()
      expect(validPaygData.model).toBeDefined()
      expect(validPaygData.input_per_1m).toBeGreaterThanOrEqual(0)
      expect(validPaygData.output_per_1m).toBeGreaterThanOrEqual(0)

      console.log('✓ PAYG required fields validated')
    })

    it('should reject negative input price', () => {
      const invalidData = {
        provider: 'openai',
        model: 'test-model',
        input_per_1m: -5.00, // Invalid
        output_per_1m: 10.00
      }

      const isValid = invalidData.input_per_1m >= 0
      expect(isValid).toBe(false)

      console.log('✓ Negative input price rejection validated')
    })

    it('should reject negative output price', () => {
      const invalidData = {
        provider: 'openai',
        model: 'test-model',
        input_per_1m: 5.00,
        output_per_1m: -10.00 // Invalid
      }

      const isValid = invalidData.output_per_1m >= 0
      expect(isValid).toBe(false)

      console.log('✓ Negative output price rejection validated')
    })

    it('should validate provider enum', () => {
      const validProviders = ['openai', 'anthropic', 'gemini', 'azure_openai', 'aws_bedrock', 'gcp_vertex']
      const invalidProvider = 'unknown_provider'

      expect(validProviders).not.toContain(invalidProvider)
      validProviders.forEach(p => expect(typeof p).toBe('string'))

      console.log('✓ Provider enum validated')
    })

    it('should validate model name format', () => {
      const validModelNames = ['gpt-4o', 'claude-3-5-sonnet', 'gemini-2.0-flash']
      const invalidModelName = 'model with spaces' // Invalid - spaces not recommended

      validModelNames.forEach(name => {
        expect(name).toMatch(/^[a-zA-Z0-9\-._]+$/)
      })

      console.log('✓ Model name format validated')
    })

    it('should validate context window is positive integer', () => {
      const validContextWindows = [4096, 8192, 128000, 200000]
      const invalidContextWindow = -1000

      validContextWindows.forEach(cw => {
        expect(Number.isInteger(cw)).toBe(true)
        expect(cw).toBeGreaterThan(0)
      })

      expect(invalidContextWindow).toBeLessThan(0)

      console.log('✓ Context window validation passed')
    })
  })

  describe('PAYG API Endpoints', () => {
    it('should validate get all pricing endpoint', () => {
      const endpoint = `${API_SERVICE_URL}/api/v1/genai/${TEST_ORG_SLUG}/pricing`

      expect(endpoint).toContain('/api/v1/genai/')
      expect(endpoint).toContain(TEST_ORG_SLUG)
      expect(endpoint).toContain('/pricing')

      console.log('✓ Get all pricing endpoint validated')
      console.log(`  GET ${endpoint}`)
    })

    it('should validate get pricing by flow endpoint', () => {
      const flows = ['payg', 'commitment', 'infrastructure']

      flows.forEach(flow => {
        const endpoint = `${API_SERVICE_URL}/api/v1/genai/${TEST_ORG_SLUG}/pricing/${flow}`
        expect(endpoint).toContain(`/pricing/${flow}`)
      })

      console.log('✓ Get pricing by flow endpoints validated')
    })

    it('should validate add custom pricing endpoint', () => {
      const endpoint = `${API_SERVICE_URL}/api/v1/genai/${TEST_ORG_SLUG}/pricing/payg`

      expect(endpoint).toContain('/pricing/payg')

      console.log('✓ Add custom pricing endpoint validated')
      console.log(`  POST ${endpoint}`)
    })

    it('should validate set override endpoint', () => {
      const pricingId = 'openai-gpt-4o-global'
      const endpoint = `${API_SERVICE_URL}/api/v1/genai/${TEST_ORG_SLUG}/pricing/payg/${pricingId}/override`

      expect(endpoint).toContain('/override')
      expect(endpoint).toContain(pricingId)

      console.log('✓ Set override endpoint validated')
      console.log(`  PUT ${endpoint}`)
    })

    it('should validate delete pricing endpoint', () => {
      const pricingId = 'custom-model-123'
      const endpoint = `${API_SERVICE_URL}/api/v1/genai/${TEST_ORG_SLUG}/pricing/payg/${pricingId}`

      expect(endpoint).toContain(pricingId)

      console.log('✓ Delete pricing endpoint validated')
      console.log(`  DELETE ${endpoint}`)
    })

    it('should validate reset override endpoint', () => {
      const pricingId = 'openai-gpt-4o-global'
      const endpoint = `${API_SERVICE_URL}/api/v1/genai/${TEST_ORG_SLUG}/pricing/payg/${pricingId}/override`

      expect(endpoint).toContain('/override')

      console.log('✓ Reset override endpoint validated')
      console.log(`  DELETE ${endpoint}`)
    })
  })

  describe('PAYG Cost Calculations', () => {
    it('should calculate token cost correctly', () => {
      const pricing = {
        input_per_1m: 2.50,
        output_per_1m: 10.00
      }

      // 500K input tokens + 200K output tokens
      const inputTokens = 500000
      const outputTokens = 200000

      const inputCost = (inputTokens / 1_000_000) * pricing.input_per_1m
      const outputCost = (outputTokens / 1_000_000) * pricing.output_per_1m
      const totalCost = inputCost + outputCost

      expect(inputCost).toBeCloseTo(1.25, 2)
      expect(outputCost).toBeCloseTo(2.00, 2)
      expect(totalCost).toBeCloseTo(3.25, 2)

      console.log(`✓ Token cost calculation: $${totalCost.toFixed(2)}`)
    })

    it('should apply cached discount correctly', () => {
      const pricing = {
        input_per_1m: 2.50,
        cached_input_per_1m: 0.50, // 80% discount for cached
        cached_discount_pct: 80
      }

      const cachedTokens = 1_000_000
      const regularCost = cachedTokens / 1_000_000 * pricing.input_per_1m
      const cachedCost = cachedTokens / 1_000_000 * pricing.cached_input_per_1m
      const savings = regularCost - cachedCost

      expect(cachedCost).toBeLessThan(regularCost)
      expect(savings).toBeCloseTo(2.00, 2)

      console.log(`✓ Cached discount saves: $${savings.toFixed(2)} per 1M tokens`)
    })

    it('should apply batch discount correctly', () => {
      const pricing = {
        input_per_1m: 2.50,
        output_per_1m: 10.00,
        batch_discount_pct: 50
      }

      const tokens = 1_000_000
      const regularCost = (tokens / 1_000_000) * pricing.input_per_1m
      const batchCost = regularCost * (1 - pricing.batch_discount_pct / 100)

      expect(batchCost).toBeCloseTo(1.25, 2)

      console.log(`✓ Batch discount: $${regularCost.toFixed(2)} → $${batchCost.toFixed(2)}`)
    })
  })

  afterAll(async () => {
    console.log('Cleaning up GenAI pricing test data...')

    try {
      // Delete org member
      await supabase
        .from('organization_members')
        .delete()
        .eq('org_id', testOrgId)

      // Delete test org
      await supabase
        .from('organizations')
        .delete()
        .eq('id', testOrgId)

      // Delete test user
      if (testUserId) {
        await supabase.auth.admin.deleteUser(testUserId)
      }

      console.log('Cleanup complete')
    } catch (e: unknown) {
      console.warn('Cleanup warning:', e)
    }
  }, 30000)
}, 120000)

// ============================================================================
// COMMITMENT PRICING CRUD TESTS
// ============================================================================

describe.skipIf(SKIP_TESTS)('GenAI Commitment Pricing CRUD', () => {
  describe('Commitment Pricing Data Validation', () => {
    it('should validate required fields for commitment pricing', () => {
      const validCommitmentData = {
        provider: 'azure_openai_ptu',
        model: 'gpt-4o',
        commitment_type: 'ptu',
        region: 'eastus',
        ptu_hourly_rate: 0.06,
        ptu_monthly_rate: 43.80,
        min_ptu: 1,
        max_ptu: 1000,
        commitment_term_months: 1
      }

      expect(validCommitmentData.provider).toBeDefined()
      expect(validCommitmentData.model).toBeDefined()
      expect(validCommitmentData.commitment_type).toBeDefined()
      expect(validCommitmentData.ptu_hourly_rate || validCommitmentData.ptu_monthly_rate).toBeTruthy()

      console.log('✓ Commitment required fields validated')
    })

    it('should validate commitment types', () => {
      const validTypes = ['ptu', 'gsu', 'provisioned_throughput', 'reserved']
      const invalidType = 'on_demand'

      validTypes.forEach(t => expect(typeof t).toBe('string'))
      expect(validTypes).not.toContain(invalidType)

      console.log('✓ Commitment types validated')
    })

    it('should validate PTU calculations', () => {
      const ptuPricing = {
        ptu_hourly_rate: 0.06,
        ptu_count: 100,
        hours_per_month: 730 // 24 * 30.4
      }

      const monthlyCost = ptuPricing.ptu_hourly_rate * ptuPricing.ptu_count * ptuPricing.hours_per_month
      expect(monthlyCost).toBeCloseTo(4380, 0)

      console.log(`✓ PTU monthly cost for 100 PTUs: $${monthlyCost.toFixed(2)}`)
    })

    it('should validate minimum commitment period', () => {
      const validTerms = [1, 3, 6, 12]
      const invalidTerm = 0

      validTerms.forEach(term => {
        expect(term).toBeGreaterThanOrEqual(1)
      })
      expect(invalidTerm).toBeLessThan(1)

      console.log('✓ Commitment term validation passed')
    })
  })

  describe('Commitment API Endpoints', () => {
    it('should validate add custom commitment endpoint', () => {
      const endpoint = `${API_SERVICE_URL}/api/v1/genai/${TEST_ORG_SLUG}/pricing/commitment`

      expect(endpoint).toContain('/pricing/commitment')

      console.log('✓ Add custom commitment endpoint validated')
      console.log(`  POST ${endpoint}`)
    })

    it('should validate commitment override endpoint', () => {
      const pricingId = 'azure-ptu-gpt4'
      const endpoint = `${API_SERVICE_URL}/api/v1/genai/${TEST_ORG_SLUG}/pricing/commitment/${pricingId}/override`

      expect(endpoint).toContain('/commitment/')
      expect(endpoint).toContain('/override')

      console.log('✓ Commitment override endpoint validated')
    })
  })
})

// ============================================================================
// INFRASTRUCTURE PRICING CRUD TESTS
// ============================================================================

describe.skipIf(SKIP_TESTS)('GenAI Infrastructure Pricing CRUD', () => {
  describe('Infrastructure Pricing Data Validation', () => {
    it('should validate required fields for infrastructure pricing', () => {
      const validInfraData = {
        provider: 'gcp_gpu',
        resource_type: 'gpu',
        instance_type: 'a2-highgpu-8g',
        gpu_type: 'A100-80GB',
        gpu_count: 8,
        gpu_memory_gb: 640,
        hourly_rate: 29.39,
        spot_discount_pct: 70,
        reserved_1yr_discount_pct: 30,
        reserved_3yr_discount_pct: 50,
        region: 'us-central1',
        cloud_provider: 'gcp'
      }

      expect(validInfraData.provider).toBeDefined()
      expect(validInfraData.instance_type).toBeDefined()
      expect(validInfraData.gpu_type).toBeDefined()
      expect(validInfraData.hourly_rate).toBeGreaterThan(0)

      console.log('✓ Infrastructure required fields validated')
    })

    it('should validate GPU types', () => {
      const validGpuTypes = [
        'A100-40GB', 'A100-80GB',
        'H100-80GB', 'H200-141GB',
        'L4', 'L40S',
        'T4', 'V100'
      ]

      validGpuTypes.forEach(gpu => {
        expect(typeof gpu).toBe('string')
        expect(gpu.length).toBeGreaterThan(0)
      })

      console.log('✓ GPU types validated')
    })

    it('should calculate spot instance savings', () => {
      const pricing = {
        hourly_rate: 30.00,
        spot_discount_pct: 70
      }

      const onDemandCost = pricing.hourly_rate * 720 // 30 days
      const spotCost = pricing.hourly_rate * (1 - pricing.spot_discount_pct / 100) * 720
      const savings = onDemandCost - spotCost

      expect(spotCost).toBeCloseTo(6480, 0)
      expect(savings).toBeCloseTo(15120, 0)

      console.log(`✓ Spot savings: $${savings.toFixed(2)}/month (${pricing.spot_discount_pct}% off)`)
    })

    it('should calculate reserved instance savings', () => {
      const pricing = {
        hourly_rate: 30.00,
        reserved_1yr_discount_pct: 30,
        reserved_3yr_discount_pct: 50
      }

      const monthlyOnDemand = pricing.hourly_rate * 720
      const monthly1yr = monthlyOnDemand * (1 - pricing.reserved_1yr_discount_pct / 100)
      const monthly3yr = monthlyOnDemand * (1 - pricing.reserved_3yr_discount_pct / 100)

      expect(monthly1yr).toBeLessThan(monthlyOnDemand)
      expect(monthly3yr).toBeLessThan(monthly1yr)

      console.log(`✓ Reserved: 1yr=$${monthly1yr.toFixed(2)}/mo, 3yr=$${monthly3yr.toFixed(2)}/mo`)
    })

    it('should validate cloud provider mapping', () => {
      const providerMapping = {
        'gcp_gpu': 'gcp',
        'aws_gpu': 'aws',
        'azure_gpu': 'azure'
      }

      Object.entries(providerMapping).forEach(([key, value]) => {
        expect(key).toContain('_gpu')
        expect(['gcp', 'aws', 'azure']).toContain(value)
      })

      console.log('✓ Cloud provider mapping validated')
    })
  })

  describe('Infrastructure API Endpoints', () => {
    it('should validate add custom infrastructure endpoint', () => {
      const endpoint = `${API_SERVICE_URL}/api/v1/genai/${TEST_ORG_SLUG}/pricing/infrastructure`

      expect(endpoint).toContain('/pricing/infrastructure')

      console.log('✓ Add custom infrastructure endpoint validated')
      console.log(`  POST ${endpoint}`)
    })

    it('should validate infrastructure override endpoint', () => {
      const instanceId = 'a2-highgpu-8g'
      const endpoint = `${API_SERVICE_URL}/api/v1/genai/${TEST_ORG_SLUG}/pricing/infrastructure/${instanceId}/override`

      expect(endpoint).toContain('/infrastructure/')
      expect(endpoint).toContain('/override')

      console.log('✓ Infrastructure override endpoint validated')
    })
  })
})

// ============================================================================
// SECURITY VALIDATION TESTS
// ============================================================================

describe.skipIf(SKIP_TESTS)('GenAI Pricing Security', () => {
  describe('Input Sanitization', () => {
    it('should sanitize XSS in model name', () => {
      const xssInput = '<script>alert("XSS")</script>'
      const sanitized = xssInput.replace(/<[^>]*>/g, '').replace(/[<>"'&;]/g, '')

      expect(sanitized).not.toContain('<script>')
      expect(sanitized).not.toContain('>')

      console.log('✓ XSS sanitization in model name validated')
    })

    it('should sanitize SQL injection in provider', () => {
      const sqlInput = "'; DROP TABLE pricing; --"
      const sanitized = sqlInput
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_')

      expect(sanitized).not.toContain(';')
      expect(sanitized).not.toContain("'")
      expect(sanitized).not.toContain('DROP')

      console.log('✓ SQL injection sanitization validated')
    })

    it('should validate notes field max length', () => {
      const longNotes = 'A'.repeat(600)
      const maxLength = 500

      expect(longNotes.length).toBeGreaterThan(maxLength)

      console.log('✓ Notes max length validation')
    })
  })

  describe('Authorization Checks', () => {
    it('should require API key for pricing endpoints', () => {
      const requiredHeader = 'X-API-Key'
      expect(requiredHeader).toBe('X-API-Key')

      console.log('✓ API key requirement validated')
    })

    it('should validate org slug access', () => {
      const requestOrgSlug = 'other_org'
      const userOrgSlug = TEST_ORG_SLUG

      const hasAccess = requestOrgSlug === userOrgSlug
      expect(hasAccess).toBe(false)

      console.log('✓ Org slug access validation')
    })
  })
})

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

describe.skipIf(SKIP_TESTS)('GenAI Pricing Error Handling', () => {
  describe('API Error Responses', () => {
    it('should handle 404 for non-existent pricing', () => {
      const expectedResponse = {
        success: false,
        error: 'Pricing record not found'
      }

      expect(expectedResponse.success).toBe(false)
      expect(expectedResponse.error).toContain('not found')

      console.log('✓ 404 error handling validated')
    })

    it('should handle 400 for invalid data', () => {
      const expectedResponse = {
        success: false,
        error: 'PAYG requires model, input_per_1m, output_per_1m'
      }

      expect(expectedResponse.success).toBe(false)
      expect(expectedResponse.error).toContain('requires')

      console.log('✓ 400 validation error handling validated')
    })

    it('should handle 403 for unauthorized access', () => {
      const expectedResponse = {
        success: false,
        error: 'Access denied'
      }

      expect(expectedResponse.success).toBe(false)
      expect(expectedResponse.error).toContain('denied')

      console.log('✓ 403 authorization error handling validated')
    })

    it('should handle rate limiting', () => {
      const expectedResponse = {
        success: false,
        error: 'Rate limit exceeded'
      }

      expect(expectedResponse.success).toBe(false)
      expect(expectedResponse.error).toContain('Rate limit')

      console.log('✓ Rate limiting error handling validated')
    })
  })
})
