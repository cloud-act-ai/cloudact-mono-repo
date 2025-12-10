/**
 * Test Configuration
 *
 * Centralized configuration for all tests.
 * Uses environment variables - NO hardcoded URLs.
 */

import { config } from "dotenv"
import { resolve } from "path"

// Load .env.local for local development
config({ path: resolve(process.cwd(), ".env.local") })

export interface ServiceConfig {
  name: string
  url: string
  healthEndpoint: string
  required: boolean
}

export interface TestEnvironment {
  name: "local" | "stage" | "prod"
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
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue
}

export function getTestEnvironment(): TestEnvironment {
  const env = getEnvOrDefault("TEST_ENV", "local") as "local" | "stage" | "prod"

  // Frontend URL (Next.js)
  const frontendUrl = getEnvOrDefault("NEXT_PUBLIC_APP_URL", "http://localhost:3000")

  // Backend URLs
  const apiServiceUrl = getEnvOrDefault("API_SERVICE_URL", "http://localhost:8000")
  const pipelineServiceUrl = getEnvOrDefault("PIPELINE_SERVICE_URL", "http://localhost:8001")

  // Supabase
  const supabaseUrl = getEnvOrThrow("NEXT_PUBLIC_SUPABASE_URL")
  const supabaseAnonKey = getEnvOrThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  const supabaseServiceRoleKey = getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY")

  // Stripe (optional for some tests)
  const stripeSecretKey = getEnvOrDefault("STRIPE_SECRET_KEY", "")
  const stripePublishableKey = getEnvOrDefault("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "")

  // Backend admin key
  const caRootApiKey = getEnvOrDefault("CA_ROOT_API_KEY", "")

  return {
    name: env,
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
