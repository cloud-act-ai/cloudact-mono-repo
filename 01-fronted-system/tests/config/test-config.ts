/**
 * Test Configuration
 *
 * Centralized configuration for all tests.
 * Supports multiple environments: local, test, stage, prod
 *
 * Usage:
 *   TEST_ENV=local npm test          # Local development (default)
 *   TEST_ENV=test npm test           # Test environment (cloudact-testing-1)
 *   TEST_ENV=stage npm test          # Staging environment (cloudact-stage)
 *   TEST_ENV=prod npm test           # Production environment (cloudact-prod)
 */

import { config } from "dotenv"
import { resolve } from "path"

// Environment-specific configuration
const ENV_CONFIGS = {
  local: {
    envFile: ".env.local",
    supabaseProjectId: "kwroaccbrxppfiysqlzs",
    gcpProject: "cloudact-testing-1",
    stripeMode: "test",
    frontendUrl: "http://localhost:3000",
    apiServiceUrl: "http://localhost:8000",
    pipelineServiceUrl: "http://localhost:8001",
  },
  test: {
    envFile: ".env.test",
    supabaseProjectId: "kwroaccbrxppfiysqlzs",
    gcpProject: "cloudact-testing-1",
    stripeMode: "test",
    frontendUrl: "", // From env
    apiServiceUrl: "", // From env
    pipelineServiceUrl: "", // From env
  },
  stage: {
    envFile: ".env.stage",
    supabaseProjectId: "kwroaccbrxppfiysqlzs",
    gcpProject: "cloudact-stage",
    stripeMode: "test",
    frontendUrl: "", // From env
    apiServiceUrl: "", // From env
    pipelineServiceUrl: "", // From env
  },
  prod: {
    envFile: ".env.prod",
    supabaseProjectId: "ovfxswhkkshouhsryzaf",
    gcpProject: "cloudact-prod",
    stripeMode: "live",
    frontendUrl: "https://cloudact.ai",
    apiServiceUrl: "https://api.cloudact.ai",
    pipelineServiceUrl: "https://pipeline.cloudact.ai",
  },
} as const

// Stripe Price IDs per environment
const STRIPE_PRICE_IDS = {
  test: {
    starter: "price_1SWBiDDXGNX5XqKayCBUng4Y",
    professional: "price_1SWBiiDXGNX5XqKawojFxG99",
    scale: "price_1SWBiiDXGNX5XqKawojFxG99",
  },
  live: {
    starter: "price_1SWJMfDoxINmrJKY7tOoJUIs",
    professional: "price_1SWJOYDoxINmrJKY8jEZwVuU",
    scale: "price_1SWJP8DoxINmrJKYfg0jmeLv",
  },
}

// Determine environment
const testEnv = (process.env.TEST_ENV || "local") as keyof typeof ENV_CONFIGS
const envConfig = ENV_CONFIGS[testEnv]

// Load environment-specific .env file
config({ path: resolve(process.cwd(), envConfig.envFile) })

export interface ServiceConfig {
  name: string
  url: string
  healthEndpoint: string
  required: boolean
}

export interface TestEnvironment {
  name: "local" | "test" | "stage" | "prod"
  gcpProject: string
  supabaseProjectId: string
  stripeMode: "test" | "live"
  stripePriceIds: {
    starter: string
    professional: string
    scale: string
  }
  services: {
    frontend: ServiceConfig
    apiService: ServiceConfig
    pipelineService: ServiceConfig
    supabase: ServiceConfig
  }
  supabase: {
    url: string
    anonKey: string
    serviceRoleKey: string
  }
  stripe: {
    secretKey: string
    publishableKey: string
  }
  backend: {
    caRootApiKey: string
  }
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}. Are you using the correct env file for TEST_ENV=${testEnv}?`)
  }
  return value
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue
}

export function getTestEnvironment(): TestEnvironment {
  // Frontend URL (Next.js)
  const frontendUrl = envConfig.frontendUrl || getEnvOrDefault("NEXT_PUBLIC_APP_URL", "http://localhost:3000")

  // Backend URLs
  const apiServiceUrl = envConfig.apiServiceUrl || getEnvOrDefault("API_SERVICE_URL", "http://localhost:8000")
  const pipelineServiceUrl = envConfig.pipelineServiceUrl || getEnvOrDefault("PIPELINE_SERVICE_URL", "http://localhost:8001")

  // Supabase
  const supabaseUrl = getEnvOrThrow("NEXT_PUBLIC_SUPABASE_URL")
  const supabaseAnonKey = getEnvOrThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  const supabaseServiceRoleKey = getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY")

  // Stripe (optional for some tests)
  const stripeSecretKey = getEnvOrDefault("STRIPE_SECRET_KEY", "")
  const stripePublishableKey = getEnvOrDefault("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "")

  // Backend admin key
  const caRootApiKey = getEnvOrDefault("CA_ROOT_API_KEY", "")

  // Get stripe price IDs for this environment
  const stripePriceIds = STRIPE_PRICE_IDS[envConfig.stripeMode]

  return {
    name: testEnv,
    gcpProject: envConfig.gcpProject,
    supabaseProjectId: envConfig.supabaseProjectId,
    stripeMode: envConfig.stripeMode,
    stripePriceIds,
    services: {
      frontend: {
        name: "Frontend (Next.js)",
        url: frontendUrl,
        healthEndpoint: "/api/health",
        required: true,
      },
      apiService: {
        name: "API Service",
        url: apiServiceUrl,
        healthEndpoint: "/health",
        required: true,
      },
      pipelineService: {
        name: "Pipeline Service",
        url: pipelineServiceUrl,
        healthEndpoint: "/health",
        required: false, // Optional for some tests
      },
      supabase: {
        name: "Supabase",
        url: supabaseUrl,
        healthEndpoint: "/rest/v1/", // Supabase REST endpoint
        required: true,
      },
    },
    supabase: {
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      serviceRoleKey: supabaseServiceRoleKey,
    },
    stripe: {
      secretKey: stripeSecretKey,
      publishableKey: stripePublishableKey,
    },
    backend: {
      caRootApiKey,
    },
  }
}

/**
 * Validate that test environment matches expected configuration
 */
export function validateTestEnvironment(): void {
  const env = getTestEnvironment()

  console.log(`\n🧪 Test Environment: ${env.name.toUpperCase()}`)
  console.log(`   GCP Project: ${env.gcpProject}`)
  console.log(`   Supabase Project: ${env.supabaseProjectId}`)
  console.log(`   Stripe Mode: ${env.stripeMode.toUpperCase()}`)
  console.log(`   Frontend: ${env.services.frontend.url}`)
  console.log(`   API Service: ${env.services.apiService.url}`)
  console.log(`   Pipeline Service: ${env.services.pipelineService.url}`)

  // Validate Supabase URL matches expected project
  if (!env.supabase.url.includes(env.supabaseProjectId)) {
    console.warn(`⚠️  Warning: Supabase URL doesn't match expected project ID`)
    console.warn(`   Expected: ${env.supabaseProjectId}`)
    console.warn(`   Got: ${env.supabase.url}`)
  }

  // Validate Stripe key mode
  if (env.stripeMode === "live" && !env.stripe.publishableKey.startsWith("pk_live_")) {
    console.warn(`⚠️  Warning: Expected LIVE Stripe keys for prod environment`)
    console.warn(`   Got: ${env.stripe.publishableKey.substring(0, 15)}...`)
  }
  if (env.stripeMode === "test" && !env.stripe.publishableKey.startsWith("pk_test_")) {
    console.warn(`⚠️  Warning: Expected TEST Stripe keys for ${env.name} environment`)
    console.warn(`   Got: ${env.stripe.publishableKey.substring(0, 15)}...`)
  }

  console.log(`\n`)
}

/**
 * Skip test if not running in expected environment
 */
export function skipIfNotEnv(expectedEnv: "local" | "test" | "stage" | "prod"): void {
  if (testEnv !== expectedEnv) {
    throw new Error(`Test requires TEST_ENV=${expectedEnv}, but running with TEST_ENV=${testEnv}`)
  }
}

/**
 * Check if running in production environment
 */
export function isProductionTest(): boolean {
  return testEnv === "prod"
}

export const testConfig = getTestEnvironment()

// Test timeouts
export const TIMEOUTS = {
  short: 5000,      // Quick operations
  medium: 15000,    // API calls
  long: 60000,      // Full flows
  extended: 120000, // Backend operations
}

// Test user credentials (from env or defaults for local)
export const TEST_CREDENTIALS = {
  email: getEnvOrDefault("TEST_USER_EMAIL", ""),
  password: getEnvOrDefault("TEST_USER_PASSWORD", "TestPassword123!"),
}
