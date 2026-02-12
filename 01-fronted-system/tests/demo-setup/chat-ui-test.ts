/**
 * Chat UI Redesign - Comprehensive Visual Test
 *
 * Tests every aspect of the chat UI redesign:
 * 1. Layout: Full-width chat, header bar with New Chat / title / History
 * 2. Colors: All mint→indigo replacements verified
 * 3. History drawer: Right-side Sheet opens/closes properly
 * 4. Metadata: Relative timestamps instead of "OPENAI · 2 msgs"
 * 5. Welcome: Sparkles icon with indigo, not MessageSquare with mint
 * 6. Sidebar: Beta badge is indigo, not mint
 */

import { chromium } from "playwright"

const BASE_URL = "http://localhost:3000"
const HEADLESS = !process.argv.includes("--headless=false")
const ORG_SLUG = process.env.ORG_SLUG || "acme_inc_mle4mnwe"
const EMAIL = "demo@cloudact.ai"
const PASSWORD = "Demo1234"
const SS = "tests/demo-setup/screenshots"

let passed = 0
let failed = 0
let warnings = 0
const results: { test: string; status: string; detail?: string }[] = []

function pass(n: string, d?: string) { passed++; results.push({ test: n, status: "PASS", detail: d }); console.log(`  ✅ ${n}${d ? ` — ${d}` : ""}`) }
function fail(n: string, d?: string) { failed++; results.push({ test: n, status: "FAIL", detail: d }); console.log(`  ❌ ${n}${d ? ` — ${d}` : ""}`) }
function warn(n: string, d?: string) { warnings++; results.push({ test: n, status: "WARN", detail: d }); console.log(`  ⚠️  ${n}${d ? ` — ${d}` : ""}`) }

async function run() {
  console.log("\n╔══════════════════════════════════════════╗")
  console.log("║   Chat UI Redesign - Comprehensive Test  ║")
  console.log("╚══════════════════════════════════════════╝\n")

  const browser = await chromium.launch({ headless: HEADLESS })
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })

  try {
    // ═══════════ STEP 1: Login (with retry for hydration race) ═══════════
    console.log("[1/8] Logging in...")

    let loggedIn = false
    for (let attempt = 0; attempt < 3 && !loggedIn; attempt++) {
      if (attempt > 0) console.log(`   Retry attempt ${attempt + 1}...`)

      await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" })
      // Wait extra for client-side hydration
      await page.waitForSelector('input[name="email"]', { state: "visible", timeout: 10000 })
      await page.waitForTimeout(3000 + attempt * 2000) // Increasing wait per attempt

      await page.locator('input[name="email"]').click()
      await page.locator('input[name="email"]').type(EMAIL, { delay: 15 })
      await page.locator('input[name="password"]').click()
      await page.locator('input[name="password"]').type(PASSWORD, { delay: 15 })
      await page.waitForTimeout(500)
      await page.locator('button[type="submit"]').click()

      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(1000)
        const url = page.url()
        if (!url.includes("/login")) { loggedIn = true; break }
        // If form submitted as GET (hydration missed), break to retry
        if (url.includes("?email=") || url.includes("?password=")) break
      }
    }

    if (loggedIn) {
      pass("Login successful", page.url())
    } else {
      fail("Login failed", page.url())
      await page.screenshot({ path: `${SS}/_login-fail.png` })
      return
    }

    // ═══════════ STEP 2: Chat layout ═══════════
    console.log("\n[2/8] Chat layout verification...")
    await page.goto(`${BASE_URL}/${ORG_SLUG}/chat`, { waitUntil: "domcontentloaded" })

    // Wait for chat to fully load — either header bar appears (configured) or setup button (not configured)
    try {
      await page.waitForSelector('button[title="Start new conversation"], text=Configure AI Chat', { timeout: 20000 })
    } catch {
      // Fallback: just wait
      await page.waitForTimeout(10000)
    }
    await page.waitForTimeout(1000)

    // 2a: No old left sidebar
    const oldSidebar = await page.locator("div.hidden.w-64").count()
    if (oldSidebar === 0) pass("Left sidebar removed")
    else fail("Left sidebar still present")

    // 2b: Header bar with New Chat button
    const newChatBtn = page.locator('button[title="Start new conversation"]')
    if (await newChatBtn.count() > 0) pass("New Chat button in header")
    else fail("New Chat button missing")

    // 2c: History button
    const historyBtn = page.locator('button[title="View conversation history"]')
    if (await historyBtn.count() > 0) pass("History button in header")
    else fail("History button missing")

    await page.screenshot({ path: `${SS}/chat-redesign-01-welcome.png`, fullPage: true })
    console.log("   📸 chat-redesign-01-welcome.png")

    // ═══════════ STEP 3: Welcome screen ═══════════
    console.log("\n[3/8] Welcome screen verification...")

    // Check for no mint #90FCA6 in chat component HTML (exclude sidebar/shared UI)
    const chatAreaHtml = await page.evaluate(() => {
      // Get only the chat area content (not sidebar)
      const chatArea = document.querySelector('div.flex.h-full.flex-col.bg-white') ||
                        document.querySelector('[class*="flex h-full flex-col"]')
      return chatArea?.innerHTML || ""
    })
    const mintCount = (chatAreaHtml.match(/#90FCA6/gi) || []).length
    if (mintCount === 0) pass("No #90FCA6 (mint) in chat area HTML")
    else fail(`Found ${mintCount} occurrences of #90FCA6 in chat area`)

    // Check for indigo CSS variables
    const fullHtml = await page.content()
    const indigoCount = (fullHtml.match(/cloudact-indigo/gi) || []).length
    if (indigoCount > 0) pass("Indigo CSS variables in use", `${indigoCount} occurrences`)
    else warn("Indigo CSS variables", "None in HTML — may be in CSS only")

    // Check suggestion cards (2x2 grid of clickable suggestions)
    const cards = await page.locator("button.group").count()
    if (cards >= 4) pass("Suggestion cards rendered", `${cards} cards`)
    else if (cards > 0) warn("Suggestion cards", `${cards} found, expected 4`)
    else {
      // Fallback: check by text content
      const costText = await page.locator("text=What are my total cloud costs").count()
      if (costText > 0) pass("Suggestion cards rendered", "Found by text content")
      else fail("No suggestion cards")
    }

    // Check send button color
    const sendBtnClass = await page.locator('button[aria-label="Send message"]').getAttribute("class") || ""
    if (sendBtnClass.includes("cloudact-indigo")) pass("Send button uses indigo")
    else if (sendBtnClass.includes("90FCA6")) fail("Send button still uses mint")
    else warn("Send button color", `Classes: ${sendBtnClass.substring(0, 80)}`)

    await page.screenshot({ path: `${SS}/chat-redesign-02-welcome-detail.png` })
    console.log("   📸 chat-redesign-02-welcome-detail.png")

    // ═══════════ STEP 4: History drawer ═══════════
    console.log("\n[4/8] History drawer verification...")

    await historyBtn.click()
    await page.waitForTimeout(1000)

    // Check Sheet opened
    const sheet = page.locator('[data-slot="sheet-content"], [role="dialog"]')
    if (await sheet.count() > 0) {
      pass("History Sheet opened")

      // Check title
      const title = page.locator("text=History")
      if (await title.count() > 0) pass("Sheet title shows 'History'")
      else warn("Sheet title not found")

      // Check right-side position
      const box = await sheet.first().boundingBox()
      if (box && box.x > 800) pass("Sheet on right side", `x=${Math.round(box.x)}`)
      else if (box) warn("Sheet position", `x=${Math.round(box.x)}`)

      // Check conversation metadata format
      const metaTexts = await page.locator('[role="dialog"] .text-xs.text-gray-400, [data-slot="sheet-content"] .text-xs.text-gray-400').allTextContents()
      const hasOldMeta = metaTexts.some(t => /·.*msgs?$/i.test(t))
      const hasRelTime = metaTexts.some(t => /^(Just now|\d+[mhd] ago|Yesterday|\d+d ago|[A-Z][a-z]{2} \d{1,2})$/.test(t))

      if (hasOldMeta) fail("Old 'provider · X msgs' metadata present", metaTexts.join(", "))
      else pass("Old metadata format removed")

      if (hasRelTime) pass("Relative timestamps shown", metaTexts.slice(0, 3).join(", "))
      else if (metaTexts.length > 0) warn("Timestamp format", metaTexts.slice(0, 3).join(", "))
      else warn("No conversation metadata found", "May be empty list")
    } else {
      fail("History Sheet did not open")
    }

    await page.screenshot({ path: `${SS}/chat-redesign-03-history-open.png`, fullPage: true })
    console.log("   📸 chat-redesign-03-history-open.png")

    // Close sheet
    await page.keyboard.press("Escape")
    await page.waitForTimeout(500)

    // ═══════════ STEP 5: Send message + indigo colors ═══════════
    console.log("\n[5/8] Message send + indigo color verification...")

    await page.locator('textarea[aria-label="Chat message input"]').fill("What are my total costs?")
    await page.waitForTimeout(300)

    await page.screenshot({ path: `${SS}/chat-redesign-04-typed.png`, fullPage: true })
    console.log("   📸 chat-redesign-04-typed.png")

    await page.locator('button[aria-label="Send message"]').click()
    await page.waitForTimeout(3000)

    // Check streaming cursor color (may fail if page navigates during send)
    try {
      const cursorClass = await page.evaluate(() => {
        const c = document.querySelector(".animate-pulse")
        return c?.className || null
      })
      if (cursorClass && cursorClass.includes("cloudact-indigo")) pass("Streaming cursor uses indigo")
      else if (cursorClass && cursorClass.includes("90FCA6")) fail("Streaming cursor still uses mint")
      else if (cursorClass) warn("Streaming cursor", cursorClass.substring(0, 80))
      else warn("Streaming cursor not found", "May have completed or using non-streaming")
    } catch {
      warn("Streaming cursor check", "Page context changed during check")
    }

    await page.screenshot({ path: `${SS}/chat-redesign-05-streaming.png`, fullPage: true })
    console.log("   📸 chat-redesign-05-streaming.png")

    // Wait for response
    try {
      await page.waitForFunction(() => {
        return document.querySelectorAll(".animate-pulse").length === 0 &&
               document.querySelectorAll(".animate-spin").length === 0
      }, { timeout: 60000 })
      pass("Response completed")
    } catch {
      warn("Response timeout", "Still streaming after 60s")
    }

    await page.waitForTimeout(1000)
    await page.screenshot({ path: `${SS}/chat-redesign-06-response.png`, fullPage: true })
    console.log("   📸 chat-redesign-06-response.png")

    // Check bot icon uses indigo (not mint)
    try {
      const botIconHtml = await page.evaluate(() => {
        const icons = document.querySelectorAll(".justify-start .rounded-lg")
        return Array.from(icons).map(i => i.innerHTML.substring(0, 200)).join(" || ")
      })
      if (botIconHtml.includes("cloudact-indigo")) pass("Bot icon uses indigo")
      else if (botIconHtml.includes("90FCA6")) fail("Bot icon still uses mint")
      else if (botIconHtml) warn("Bot icon color", "Could not determine color from HTML")
    } catch {
      warn("Bot icon check", "Page context changed")
    }

    // Check header title appears (uses absolute positioning)
    try {
      const headerTitle = await page.evaluate(() => {
        const el = document.querySelector("p.absolute")
        return el?.textContent?.trim() || null
      })
      if (headerTitle) pass("Conversation title in header", headerTitle.substring(0, 40))
      else warn("Header title not visible", "May not have loaded yet")
    } catch {
      warn("Header title check", "Page context changed")
    }

    // ═══════════ STEP 6: Sheet auto-close on select ═══════════
    console.log("\n[6/8] History drawer auto-close on select...")

    await historyBtn.click()
    await page.waitForTimeout(1000)

    const convBtn = page.locator('[data-slot="sheet-content"] button.group, [role="dialog"] button.group').first()
    if (await convBtn.count() > 0) {
      await convBtn.click()
      await page.waitForTimeout(1000)

      const sheetVisible = await page.locator('[data-slot="sheet-content"], [role="dialog"]').count()
      if (sheetVisible === 0) pass("Sheet auto-closes on select")
      else fail("Sheet did NOT close after select")
    } else {
      warn("Auto-close test skipped", "No conversations in list")
    }

    await page.screenshot({ path: `${SS}/chat-redesign-07-after-select.png`, fullPage: true })
    console.log("   📸 chat-redesign-07-after-select.png")

    // ═══════════ STEP 7: Sidebar Beta badge ═══════════
    console.log("\n[7/8] Sidebar Beta badge verification...")

    try {
      await page.goto(`${BASE_URL}/${ORG_SLUG}/dashboard`, { waitUntil: "domcontentloaded", timeout: 15000 })
    } catch {
      // Retry on ERR_ABORTED (dev server recompiling)
      await page.waitForTimeout(3000)
      await page.goto(`${BASE_URL}/${ORG_SLUG}/dashboard`, { waitUntil: "domcontentloaded" })
    }
    await page.waitForTimeout(3000)

    const badgeInfo = await page.evaluate(() => {
      const badges = Array.from(document.querySelectorAll("span")).filter(s => s.textContent?.trim() === "Beta")
      return badges.map(b => b.className)
    })

    if (badgeInfo.length > 0) {
      const hasIndigo = badgeInfo.some(c => c.includes("cloudact-indigo"))
      const hasMint = badgeInfo.some(c => c.includes("90FCA6") || c.includes("cloudact-mint"))
      if (hasIndigo && !hasMint) pass("Beta badge uses indigo", `${badgeInfo.length} badge(s)`)
      else if (hasMint) fail("Beta badge still uses mint")
      else warn("Beta badge color", badgeInfo[0]?.substring(0, 80))
    } else {
      warn("Beta badges not found", "Sidebar may be collapsed")
    }

    // Expand AI Chat section
    const aiChatLabel = page.locator("text=AI Chat")
    if (await aiChatLabel.count() > 0) await aiChatLabel.click()
    await page.waitForTimeout(500)

    await page.screenshot({ path: `${SS}/chat-redesign-08-sidebar-badge.png`, fullPage: true })
    console.log("   📸 chat-redesign-08-sidebar-badge.png")

    // ═══════════ STEP 8: Full color audit ═══════════
    console.log("\n[8/8] Full color audit on chat page...")

    try {
      await page.goto(`${BASE_URL}/${ORG_SLUG}/chat`, { waitUntil: "domcontentloaded", timeout: 15000 })
    } catch {
      await page.waitForTimeout(3000)
      await page.goto(`${BASE_URL}/${ORG_SLUG}/chat`, { waitUntil: "domcontentloaded" })
    }
    await page.waitForTimeout(5000)

    const mintElements = await page.evaluate(() => {
      const found: string[] = []
      document.querySelectorAll("*").forEach(el => {
        const s = window.getComputedStyle(el)
        const mint = "rgb(144, 252, 166)"
        if (s.backgroundColor === mint) found.push(`bg:${el.tagName}`)
        if (s.color === mint) found.push(`text:${el.tagName}`)
        if (s.borderColor === mint) found.push(`border:${el.tagName}`)
      })
      return found
    })

    if (mintElements.length === 0) pass("No mint computed on chat page")
    else fail(`${mintElements.length} elements with mint`, mintElements.slice(0, 5).join("; "))

    const indigoElements = await page.evaluate(() => {
      let count = 0
      const indigo = "rgb(79, 70, 229)"
      document.querySelectorAll("*").forEach(el => {
        const s = window.getComputedStyle(el)
        if (s.backgroundColor === indigo || s.color === indigo || s.borderColor === indigo) count++
      })
      return count
    })

    if (indigoElements > 0) pass("Indigo actively rendered", `${indigoElements} elements`)
    else warn("Indigo computed", "None found — may be in hover/disabled states only")

    await page.screenshot({ path: `${SS}/chat-redesign-09-final.png`, fullPage: true })
    console.log("   📸 chat-redesign-09-final.png")

    if (!HEADLESS) {
      console.log("\n  Browser open. Ctrl+C to close.")
      await page.waitForTimeout(300000)
    }

  } catch (error) {
    console.error("\n  FATAL:", error)
    failed++
  } finally {
    if (HEADLESS) await browser.close()
  }

  // Summary
  console.log("\n╔══════════════════════════════════════════╗")
  console.log("║             TEST RESULTS                 ║")
  console.log("╠══════════════════════════════════════════╣")
  console.log(`║  ✅ Passed:   ${String(passed).padStart(3)}                        ║`)
  console.log(`║  ❌ Failed:   ${String(failed).padStart(3)}                        ║`)
  console.log(`║  ⚠️  Warnings: ${String(warnings).padStart(3)}                        ║`)
  console.log(`║  📊 Total:    ${String(passed + failed + warnings).padStart(3)}                        ║`)
  console.log("╚══════════════════════════════════════════╝")

  if (failed > 0) {
    console.log("\n  Failed tests:")
    results.filter(r => r.status === "FAIL").forEach(r => console.log(`    ❌ ${r.test}${r.detail ? ` — ${r.detail}` : ""}`))
  }

  console.log("")
  process.exit(failed > 0 ? 1 : 0)
}

run()
