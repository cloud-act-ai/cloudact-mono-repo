/**
 * Health Check Test Script
 *
 * Verifies all services are running before executing tests.
 * Run: npx tsx tests/test_health_check.ts
 *
 * Checks:
 * 1. Frontend (Next.js) - http://localhost:3000
 * 2. API Service - http://localhost:8000
 * 3. Pipeline Service - http://localhost:8001
 * 4. Supabase - connection test
 */

import { config } from "dotenv"
import { resolve } from "path"
import { createClient } from "@supabase/supabase-js"

// Load .env.local
config({ path: resolve(process.cwd(), ".env.local") })

interface HealthCheckResult {
  service: string
  url: string
  status: "up" | "down" | "error"
  message: string
  responseTime?: number
}

async function checkService(
  name: string,
  url: string,
  endpoint: string,
  timeout = 5000
): Promise<HealthCheckResult> {
  const fullUrl = `${url}${endpoint}`
  const startTime = Date.now()

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(fullUrl, {
      method: "GET",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const responseTime = Date.now() - startTime

    if (response.ok) {
      await response.json().catch(() => ({}))
      return {
        service: name,
        url: fullUrl,
        status: "up",
        message: `Healthy (${response.status})`,
        responseTime,
      }
    } else {
      return {
        service: name,
        url: fullUrl,
        status: "error",
        message: `HTTP ${response.status}`,
        responseTime,
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        service: name,
        url: fullUrl,
        status: "down",
        message: `Timeout (>${timeout}ms)`,
      }
    }
    const error = err as { code?: string; message?: string }
    const message = error.code === "ECONNREFUSED" ? "Connection refused" : (error.message || String(err))
    return {
      service: name,
      url: fullUrl,
      status: "down",
      message,
    }
  }
}

async function checkSupabase(): Promise<HealthCheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return {
      service: "Supabase",
      url: url || "NOT SET",
      status: "error",
      message: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    }
  }

  const startTime = Date.now()
  try {
    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Try to query a simple table
    const { error } = await supabase.from("organizations").select("id").limit(1)

    const responseTime = Date.now() - startTime

    if (error) {
      return {
        service: "Supabase",
        url,
        status: "error",
        message: error.message,
        responseTime,
      }
    }

    return {
      service: "Supabase",
      url,
      status: "up",
      message: "Connected",
      responseTime,
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return {
      service: "Supabase",
      url,
      status: "down",
      message: errorMessage,
    }
  }
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗")
  console.log("║                     SERVICE HEALTH CHECK                       ║")
  console.log("╚════════════════════════════════════════════════════════════════╝\n")

  const env = process.env.TEST_ENV || "local"
  console.log(`Environment: ${env.toUpperCase()}\n`)

  // Get URLs from environment
  const frontendUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const apiServiceUrl = process.env.API_SERVICE_URL || "http://localhost:8000"
  const pipelineServiceUrl = process.env.PIPELINE_SERVICE_URL || "http://localhost:8001"

  const results: HealthCheckResult[] = []

  // Check Frontend
  console.log("Checking Frontend (Next.js)...")
  const frontendResult = await checkService("Frontend", frontendUrl, "/api/health")
  results.push(frontendResult)

  // Check API Service
  console.log("Checking API Service...")
  const apiResult = await checkService("API Service", apiServiceUrl, "/health")
  results.push(apiResult)

  // Check Pipeline Service
  console.log("Checking Pipeline Service...")
  const pipelineResult = await checkService("Pipeline Service", pipelineServiceUrl, "/health")
  results.push(pipelineResult)

  // Check Supabase
  console.log("Checking Supabase...")
  const supabaseResult = await checkSupabase()
  results.push(supabaseResult)

  // Print Results
  console.log("\n╔════════════════════════════════════════════════════════════════╗")
  console.log("║                          RESULTS                               ║")
  console.log("╚════════════════════════════════════════════════════════════════╝\n")

  let allHealthy = true
  let requiredHealthy = true

  for (const result of results) {
    const icon = result.status === "up" ? "✅" : result.status === "error" ? "⚠️" : "❌"
    const time = result.responseTime ? ` (${result.responseTime}ms)` : ""
    console.log(`${icon} ${result.service.padEnd(20)} ${result.status.toUpperCase().padEnd(8)} ${result.message}${time}`)
    console.log(`   URL: ${result.url}`)
    console.log("")

    if (result.status !== "up") {
      allHealthy = false
      // API Service and Supabase are required
      if (result.service === "API Service" || result.service === "Supabase") {
        requiredHealthy = false
      }
    }
  }

  // Summary
  console.log("═══════════════════════════════════════════════════════════════════\n")

  if (allHealthy) {
    console.log("✅ All services are healthy. Ready to run tests!\n")
    process.exit(0)
  } else if (requiredHealthy) {
    console.log("⚠️  Some optional services are down. Tests may have limited functionality.\n")
    console.log("Required services (API Service, Supabase) are healthy.\n")
    process.exit(0)
  } else {
    console.log("❌ Required services are not healthy. Please start them before running tests.\n")
    console.log("Commands to start services:")
    console.log("  Frontend:         cd fronted-system && npm run dev")
    console.log("  API Service:      cd api-service && python3 -m uvicorn src.app.main:app --port 8000")
    console.log("  Pipeline Service: cd data-pipeline-service && python3 -m uvicorn src.app.main:app --port 8001")
    console.log("")
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("Health check failed:", err)
  process.exit(1)
})
