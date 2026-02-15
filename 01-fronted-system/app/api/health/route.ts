import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"
import { readFileSync } from "fs"
import { join } from "path"

export const runtime = "nodejs" // Need nodejs for Stripe SDK
export const dynamic = "force-dynamic"

// Dynamic version info - reads from version.json or env vars
function getVersionInfo(): { version: string; release: string; release_timestamp: string } {
  // First check environment variables (set by CI/CD)
  const envVersion = process.env.APP_VERSION
  const envRelease = process.env.RELEASE_VERSION
  const envTimestamp = process.env.RELEASE_TIMESTAMP

  if (envVersion && envRelease && envTimestamp) {
    return { version: envVersion, release: envRelease, release_timestamp: envTimestamp }
  }

  // Try to read from version.json at repo root
  try {
    const versionPaths = [
      join(process.cwd(), "version.json"),
      join(process.cwd(), "..", "version.json"),
    ]

    for (const versionPath of versionPaths) {
      try {
        const versionData = JSON.parse(readFileSync(versionPath, "utf8"))
        if (versionData.release && versionData.release_timestamp) {
          return {
            version: versionData.version || versionData.release,
            release: versionData.release,
            release_timestamp: versionData.release_timestamp
          }
        }
      } catch {
        // Try next path
      }
    }
  } catch {
    // Fall through to default
  }

  // Generate dynamic timestamp as fallback (PST timezone)
  const now = new Date()
  const pstOffset = -8 * 60 // PST is UTC-8
  const pstDate = new Date(now.getTime() + (now.getTimezoneOffset() + pstOffset) * 60000)
  const dynamicTimestamp = pstDate.toISOString().replace("Z", "-0800")

  return {
    version: envVersion || "v4.4.4",
    release: envRelease || "v4.4.4",
    release_timestamp: envTimestamp || dynamicTimestamp
  }
}

const versionInfo = getVersionInfo()

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
  const chatBackendUrl = process.env.CHAT_BACKEND_URL || process.env.NEXT_PUBLIC_CHAT_BACKEND_URL

  // Run all checks in parallel
  const [supabase, stripe, apiService, pipelineService, chatBackend] = await Promise.all([
    checkSupabase(),
    checkStripe(),
    checkBackendService(apiServiceUrl || "", "API Service"),
    checkBackendService(pipelineServiceUrl || "", "Pipeline Service"),
    checkBackendService(chatBackendUrl || "", "Chat Backend"),
  ])

  const checks = {
    database: supabase,
    payments: stripe,
    api: apiService,
    pipeline: pipelineService,
    chat: chatBackend,
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
    version: versionInfo.version,
    release: versionInfo.release,
    release_timestamp: versionInfo.release_timestamp,
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
