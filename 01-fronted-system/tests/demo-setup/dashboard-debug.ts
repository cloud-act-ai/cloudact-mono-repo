import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Capture console logs
  const consoleLogs: string[] = [];
  page.on('console', (msg) => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });

  // Capture network errors
  const networkErrors: string[] = [];
  page.on('requestfailed', (request) => {
    networkErrors.push(`FAILED: ${request.url()} - ${request.failure()?.errorText}`);
  });

  // Capture ALL 404 responses
  const notFoundResponses: string[] = [];
  page.on('response', (response) => {
    if (response.status() === 404) {
      notFoundResponses.push(`404: ${response.request().method()} ${response.url()}`);
    }
  });

  // Step 1: Login
  console.log('=== Step 1: Logging in ===');
  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');

  await page.fill('input[type="email"], input[name="email"]', 'demo@cloudact.ai');
  await page.fill('input[type="password"], input[name="password"]', 'Demo1234');
  await page.click('button[type="submit"]');

  await page.waitForURL('**/dashboard**', { timeout: 15000 }).catch(() => {
    console.log('Did not redirect to dashboard, current URL:', page.url());
  });
  console.log('After login URL:', page.url());

  // Step 2: Navigate to dashboard
  console.log('\n=== Step 2: Dashboard ===');

  // Capture ALL network requests
  const allRequests: Array<{url: string, status: number, method: string, body?: string}> = [];

  page.on('response', async (response) => {
    const url = response.url();
    const method = response.request().method();
    if (url.includes('localhost:8000') || url.includes('localhost:8001') || url.includes('api/v1') || url.includes('supabase')) {
      let body = '';
      try {
        body = await response.text();
        if (body.length > 500) body = body.substring(0, 500) + '...';
      } catch {}
      allRequests.push({ url, status: response.status(), method, body });
    }
  });

  await page.goto('http://localhost:3000/acme_inc_mle4mnwe/dashboard', { timeout: 60000 });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(30000);

  console.log('Dashboard URL:', page.url());

  // Screenshot
  await page.screenshot({ path: '/tmp/dashboard-debug.png', fullPage: true });
  console.log('Screenshot: /tmp/dashboard-debug.png');

  // Console logs
  console.log('\n=== Relevant Console Logs ===');
  for (const log of consoleLogs) {
    if (log.includes('CostData') || log.includes('error') || log.includes('Error') || log.includes('cost') || log.includes('auth') || log.includes('API') || log.includes('fetch')) {
      console.log(log);
    }
  }

  console.log('\n=== ALL Console Logs (last 40) ===');
  for (const log of consoleLogs.slice(-40)) {
    console.log(log);
  }

  // Network
  console.log('\n=== Network Requests ===');
  for (const r of allRequests) {
    console.log(`  [${r.status}] ${r.method} ${r.url.substring(0, 150)}`);
    if (r.status !== 200 || r.body?.includes('error') || r.body?.includes('Error')) {
      console.log(`    Body: ${r.body?.substring(0, 300)}`);
    }
  }

  console.log('\n=== 404 Responses ===');
  for (const r of notFoundResponses) {
    console.log(r);
  }

  console.log('\n=== Network Errors ===');
  for (const err of networkErrors) {
    console.log(err);
  }

  // Dollar amounts
  console.log('\n=== Data Status ===');
  const bodyText = await page.textContent('body') || '';
  const dollarMatches = bodyText.match(/\$[\d,.]+/g);
  if (dollarMatches) {
    const unique = [...new Set(dollarMatches)];
    console.log('Dollar values:', unique.join(', '));
  }
  if (bodyText.includes('No cost data')) console.log('FOUND: "No cost data"');
  if (bodyText.includes('No GenAI costs')) console.log('FOUND: "No GenAI costs"');
  if (bodyText.includes('No cloud costs')) console.log('FOUND: "No cloud costs"');
  if (bodyText.includes('No subscription costs')) console.log('FOUND: "No subscription costs"');
  if (bodyText.includes('$0.00')) console.log('FOUND: "$0.00"');

  await browser.close();
})();
