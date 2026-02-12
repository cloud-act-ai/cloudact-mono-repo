import { test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const screenshotDir = path.join(__dirname, '.screenshots')
const orgSlug = 'acme_inc_mle4mnwe'

test.beforeAll(() => { fs.mkdirSync(screenshotDir, { recursive: true }) })

const pages = [
  { name: 'dashboard', path: `/${orgSlug}/dashboard` },
  { name: 'cost-overview', path: `/${orgSlug}/cost-dashboards/overview` },
  { name: 'cost-cloud', path: `/${orgSlug}/cost-dashboards/cloud` },
  { name: 'cost-genai', path: `/${orgSlug}/cost-dashboards/genai` },
  { name: 'cost-subscription', path: `/${orgSlug}/cost-dashboards/subscription` },
  { name: 'pipelines', path: `/${orgSlug}/pipelines` },
  { name: 'pipelines-cloud', path: `/${orgSlug}/pipelines/cloud` },
  { name: 'chat', path: `/${orgSlug}/chat` },
  { name: 'settings-personal', path: `/${orgSlug}/settings/personal` },
  { name: 'integrations-genai', path: `/${orgSlug}/integrations/genai` },
]

for (const p of pages) {
  test(`screenshot ${p.name}`, async ({ page }) => {
    await page.goto(p.path)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)
    await page.screenshot({ path: path.join(screenshotDir, `${p.name}.png`), fullPage: true })
  })
}
