import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"

export const runtime = "nodejs" // Need nodejs for Stripe SDK
export const dynamic = "force-dynamic"

// Release info - matches backend services format
const RELEASE_VERSION = "v1.0.5"
const RELEASE_TIMESTAMP = "2025-12-30T16:15:00-08:00" // PST timezone

interface ServiceHealth {
  status: "healthy" | "unhealthy" | "degraded"
  latency_ms?: number
  error?: string
}

interface HealthResponse {
  status: "healthy" | "unhealthy" | "degraded"
  service: string
  version: string
  release: string
  release_timestamp: string
  environment: string
  checks: {
    database: ServiceHealth
    payments: ServiceHealth
    api: ServiceHealth
    pipeline: ServiceHealth
  }
}

async function checkSupabase(): Promise<ServiceHealth> {
  const start = Date.now()
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return { status: "unhealthy", error: "Missing Supabase configuration" }
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Simple query to check connection - just get server time
    const { error } = await supabase.from("organizations").select("id").limit(1)

    // Even if no rows, connection worked if no error
    if (error && !error.message.includes("0 rows")) {
      return {
        status: "unhealthy",
        latency_ms: Date.now() - start,
        error: error.message
      }
    }

    return { status: "healthy", latency_ms: Date.now() - start }
  } catch (err) {
    return {
      status: "unhealthy",
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown error"
    }
  }
}

async function checkStripe(): Promise<ServiceHealth> {
  const start = Date.now()
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY

    if (!stripeKey) {
      return { status: "unhealthy", error: "Missing Stripe configuration" }
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-12-15.clover" })

    // Simple API call to verify connection
    await stripe.balance.retrieve()

    return { status: "healthy", latency_ms: Date.now() - start }
  } catch (err) {
    return {
      status: "unhealthy",
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown error"
    }
  }
}

async function checkBackendService(url: string, name: string): Promise<ServiceHealth> {
  const start = Date.now()
  try {
    if (!url) {
      return { status: "unhealthy", error: `Missing ${name} URL configuration` }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5s timeout

    const response = await fetch(`${url}/health`, {
      signal: controller.signal,
      cache: "no-store"
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      return {
        status: "unhealthy",
        latency_ms: Date.now() - start,
        error: `HTTP ${response.status}`
      }
    }

    const data = await response.json()
    return {
      status: data.status === "healthy" ? "healthy" : "degraded",
      latency_ms: Date.now() - start
    }
  } catch (err) {
    return {
      status: "unhealthy",
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown error"
    }
  }
}

export async function GET() {
  const apiServiceUrl = process.env.API_SERVICE_URL || process.env.NEXT_PUBLIC_API_SERVICE_URL
  const pipelineServiceUrl = process.env.PIPELINE_SERVICE_URL || process.env.NEXT_PUBLIC_PIPELINE_SERVICE_URL

  // Run all checks in parallel
  const [supabase, stripe, apiService, pipelineService] = await Promise.all([
    checkSupabase(),
    checkStripe(),
    checkBackendService(apiServiceUrl || "", "API Service"),
    checkBackendService(pipelineServiceUrl || "", "Pipeline Service"),
  ])

  const checks = {
    database: supabase,
    payments: stripe,
    api: apiService,
    pipeline: pipelineService,
  }

  // Determine overall status
  const allHealthy = Object.values(checks).every(c => c.status === "healthy")
  const anyUnhealthy = Object.values(checks).some(c => c.status === "unhealthy")

  const overallStatus: "healthy" | "unhealthy" | "degraded" =
    allHealthy ? "healthy" :
    anyUnhealthy ? "unhealthy" : "degraded"

  const response: HealthResponse = {
    status: overallStatus,
    service: "frontend",
    version: "1.0.0",
    release: RELEASE_VERSION,
    release_timestamp: RELEASE_TIMESTAMP,
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    checks,
  }

  return NextResponse.json(response, {
    status: overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
