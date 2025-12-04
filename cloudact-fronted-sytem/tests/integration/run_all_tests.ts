/**
 * Integration Test Runner
 *
 * Runs all integration tests against real services.
 * Run: npx tsx tests/integration/run_all_tests.ts
 *
 * Prerequisites:
 * - Run health check first: npx tsx tests/test_health_check.ts
 * - API Service running (port 8000)
 * - Supabase accessible
 */

import { config } from "dotenv"
import { resolve } from "path"
import { spawn } from "child_process"

// Load .env.local
config({ path: resolve(process.cwd(), ".env.local") })

interface TestResult {
  name: string
  passed: boolean
  duration: number
  output: string
}

async function runTest(testFile: string): Promise<TestResult> {
  const name = testFile.replace(/^test_/, "").replace(/\.ts$/, "")
  const startTime = Date.now()

  return new Promise((resolve) => {
    const proc = spawn("npx", ["tsx", `tests/integration/${testFile}`], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    })

    let output = ""

    proc.stdout?.on("data", (data) => {
      output += data.toString()
    })

    proc.stderr?.on("data", (data) => {
      output += data.toString()
    })

    proc.on("close", (code) => {
      const duration = Date.now() - startTime
      resolve({
        name,
        passed: code === 0,
        duration,
        output,
      })
    })

    proc.on("error", (err) => {
      const duration = Date.now() - startTime
      resolve({
        name,
        passed: false,
        duration,
        output: `Error: ${err.message}`,
      })
    })
  })
}

async function runHealthCheck(): Promise<boolean> {
  console.log("Running health check...\n")

  return new Promise((resolve) => {
    const proc = spawn("npx", ["tsx", "tests/test_health_check.ts"], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: "inherit",
    })

    proc.on("close", (code) => {
      resolve(code === 0)
    })

    proc.on("error", () => {
      resolve(false)
    })
  })
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗")
  console.log("║              INTEGRATION TEST RUNNER                           ║")
  console.log("╚════════════════════════════════════════════════════════════════╝\n")

  // Run health check first
  const healthOk = await runHealthCheck()
  if (!healthOk) {
    console.log("\n❌ Health check failed. Please start required services.\n")
    process.exit(1)
  }

  console.log("\n" + "═".repeat(68) + "\n")

  // List of test files to run
  const testFiles = [
    "test_organization_delete.ts",
    // Add more test files here as they are created
    // "test_user_signup.ts",
    // "test_integration_setup.ts",
    // "test_pipeline_execution.ts",
  ]

  console.log(`Running ${testFiles.length} integration test(s)...\n`)

  const results: TestResult[] = []

  for (const testFile of testFiles) {
    console.log(`\n📋 Running: ${testFile}`)
    console.log("─".repeat(68))

    const result = await runTest(testFile)
    results.push(result)

    // Show abbreviated output
    const lines = result.output.split("\n")
    const summaryStart = lines.findIndex((l) => l.includes("TEST SUMMARY"))
    if (summaryStart > 0) {
      console.log(lines.slice(summaryStart).join("\n"))
    } else {
      // Show last 20 lines if no summary found
      console.log(lines.slice(-20).join("\n"))
    }
  }

  // Final Summary
  console.log("\n╔════════════════════════════════════════════════════════════════╗")
  console.log("║                    FINAL SUMMARY                               ║")
  console.log("╚════════════════════════════════════════════════════════════════╝\n")

  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0)

  for (const result of results) {
    const icon = result.passed ? "✅" : "❌"
    console.log(`${icon} ${result.name.padEnd(40)} ${(result.duration / 1000).toFixed(1)}s`)
  }

  console.log("\n───────────────────────────────────────────────────────────────────")
  console.log(`   Test Suites: ${passed} passed, ${failed} failed, ${results.length} total`)
  console.log(`   Time:        ${(totalTime / 1000).toFixed(1)}s`)
  console.log("═══════════════════════════════════════════════════════════════════\n")

  if (failed === 0) {
    console.log("🎉 All integration tests passed!\n")
    process.exit(0)
  } else {
    console.log(`❌ ${failed} test suite(s) failed\n`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("Test runner failed:", err)
  process.exit(1)
})
