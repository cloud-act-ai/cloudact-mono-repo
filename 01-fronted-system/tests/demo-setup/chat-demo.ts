/**
 * Chat Demo Script
 *
 * Playwright automation to demo the AI Chat feature.
 * Logs into the demo account, navigates to chat, asks a question,
 * and captures the response.
 *
 * Usage:
 *   npx tsx tests/demo-setup/chat-demo.ts
 *   npx tsx tests/demo-setup/chat-demo.ts --headless=false
 *   npx tsx tests/demo-setup/chat-demo.ts --question="What are my AWS costs?"
 */

import { chromium, Browser, Page } from "playwright"

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000"
const HEADLESS = process.argv.includes("--headless=false") ? false : true
const SLOW_MO = parseInt(process.env.TEST_SLOW_MO || "0", 10)

// Demo account credentials
const EMAIL = "demo@cloudact.ai"
const PASSWORD = "Demo1234"

// Parse --question arg
function getQuestion(): string {
  const arg = process.argv.find((a) => a.startsWith("--question="))
  if (arg) return arg.split("=").slice(1).join("=")
  return "What are my January 2026 subscription costs only?"
}

// Parse --org-slug arg
function getOrgSlug(): string {
  const arg = process.argv.find((a) => a.startsWith("--org-slug="))
  if (arg) return arg.split("=").slice(1).join("=")
  return process.env.ORG_SLUG || "acme_inc_mle4mnwe"
}

async function run() {
  const question = getQuestion()
  const orgSlug = getOrgSlug()

  console.log("\n=== CloudAct Chat Demo ===")
  console.log(`  URL:      ${BASE_URL}`)
  console.log(`  Org:      ${orgSlug}`)
  console.log(`  Question: ${question}`)
  console.log(`  Headless: ${HEADLESS}`)
  console.log("")

  let browser: Browser | null = null

  try {
    browser = await chromium.launch({
      headless: HEADLESS,
      slowMo: SLOW_MO || (HEADLESS ? 0 : 100),
    })

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    })
    const page = context.pages()[0] || (await context.newPage())

    // ── Step 1: Login ──
    console.log("[1/5] Logging in...")
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1000)

    // Fill login form
    await page.fill('input[type="email"], input[name="email"]', EMAIL)
    await page.fill('input[type="password"], input[name="password"]', PASSWORD)
    await page.click('button[type="submit"]')

    // Wait for redirect to dashboard
    await page.waitForURL(`**/${orgSlug}/**`, { timeout: 15000 })
    console.log(`   Logged in. URL: ${page.url()}`)

    // ── Step 2: Navigate to Chat ──
    console.log("[2/5] Navigating to chat...")
    await page.goto(`${BASE_URL}/${orgSlug}/chat`, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(3000)

    // Take screenshot of welcome screen
    await page.screenshot({
      path: "tests/demo-setup/screenshots/chat-01-welcome.png",
      fullPage: true,
    })
    console.log("   Screenshot: chat-01-welcome.png")

    // ── Step 3: Type and send message ──
    console.log("[3/5] Typing question...")

    // Find the input field (either on welcome screen or in ChatCopilot)
    const inputSelector = 'textarea[aria-label="Chat message input"]'
    await page.waitForSelector(inputSelector, { timeout: 10000 })
    await page.fill(inputSelector, question)
    await page.waitForTimeout(500)

    // Take screenshot with typed message
    await page.screenshot({
      path: "tests/demo-setup/screenshots/chat-02-typed.png",
      fullPage: true,
    })
    console.log("   Screenshot: chat-02-typed.png")

    // Click send button
    console.log("[4/5] Sending message and waiting for response...")
    await page.click('button[aria-label="Send message"]')

    // Wait for assistant response (streaming may take a while)
    // Look for the assistant message bubble to appear and streaming cursor to disappear
    await page.waitForTimeout(3000) // Initial wait for streaming to start

    // Wait for streaming to complete (no more pulsing cursor)
    try {
      // Wait up to 120s for the response to finish streaming
      await page.waitForFunction(
        () => {
          const streamingCursors = document.querySelectorAll(".animate-pulse")
          const thinkingSpinners = document.querySelectorAll(".animate-spin")
          // No streaming cursors and no "Thinking..." spinners
          return streamingCursors.length === 0 && thinkingSpinners.length === 0
        },
        { timeout: 120000 }
      )
    } catch {
      console.log("   (Timeout waiting for streaming to complete, capturing current state)")
    }

    await page.waitForTimeout(1000) // Small buffer after streaming completes

    // ── Step 5: Capture result ──
    console.log("[5/5] Capturing result...")

    // Take final screenshot
    await page.screenshot({
      path: "tests/demo-setup/screenshots/chat-03-response.png",
      fullPage: true,
    })
    console.log("   Screenshot: chat-03-response.png")

    // Extract the assistant response text
    const assistantMessages = await page.$$eval(
      ".justify-start .rounded-xl p.whitespace-pre-wrap",
      (els) => els.map((el) => el.textContent?.trim() || "")
    )

    const lastResponse = assistantMessages[assistantMessages.length - 1] || "(no response captured)"

    console.log("\n=== AI Response ===")
    console.log(lastResponse)
    console.log("==================\n")

    // Check for errors
    const errorMessages = await page.$$eval(
      ".text-red-700, .text-red-600, .text-red-500",
      (els) => els.map((el) => el.textContent?.trim() || "").filter(Boolean)
    )

    if (errorMessages.length > 0) {
      console.log("Errors found:", errorMessages)
    }

    // Keep browser open if not headless
    if (!HEADLESS) {
      console.log("Browser is open. Press Ctrl+C to close.")
      await page.waitForTimeout(300000) // 5 min
    }

    console.log("Demo completed successfully.")
  } catch (error) {
    console.error("Demo failed:", error)
    process.exit(1)
  } finally {
    if (browser && HEADLESS) {
      await browser.close()
    }
  }
}

run()
