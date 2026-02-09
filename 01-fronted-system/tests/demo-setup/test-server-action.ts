import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Capture ALL console output
  page.on('console', (msg) => {
    console.log(`[${msg.type()}] ${msg.text()}`);
  });

  // Capture ALL responses
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('_next') || url.includes('action') || response.status() >= 400) {
      console.log(`[NET ${response.status()}] ${response.request().method()} ${url.substring(0, 200)}`);
    }
  });

  page.on('requestfailed', (request) => {
    console.log(`[NET FAIL] ${request.method()} ${request.url().substring(0, 200)} - ${request.failure()?.errorText}`);
  });

  // Login first
  console.log('=== Logging in ===');
  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);

  await page.fill('input[type="email"], input[name="email"]', 'demo@cloudact.ai');
  await page.fill('input[type="password"], input[name="password"]', 'Demo1234');
  await page.click('button[type="submit"]');

  await page.waitForURL('**/dashboard**', { timeout: 15000 }).catch(() => {
    console.log('Did not redirect, current URL:', page.url());
  });
  console.log('After login URL:', page.url());

  // Go to dashboard
  console.log('\n=== Loading dashboard ===');
  await page.goto('http://localhost:3000/acme_inc_mle4mnwe/dashboard', { timeout: 60000 });
  await page.waitForLoadState('domcontentloaded');

  // Wait and observe what happens
  console.log('Waiting 45s for data to load...');
  await page.waitForTimeout(45000);

  // Take screenshot
  await page.screenshot({ path: '/tmp/dashboard-final.png', fullPage: true });
  console.log('\nScreenshot: /tmp/dashboard-final.png');

  // Check for cost data
  const bodyText = await page.textContent('body') || '';
  if (bodyText.includes('$0.00')) console.log('FOUND: $0.00');
  if (bodyText.includes('loading') || bodyText.includes('Loading')) console.log('FOUND: Loading text');
  if (bodyText.includes('No cost data')) console.log('FOUND: No cost data');

  // Check for specific cost categories
  const hasGenAI = bodyText.includes('GenAI') || bodyText.includes('genai');
  const hasCloud = bodyText.includes('Cloud') || bodyText.includes('cloud');
  const hasSub = bodyText.includes('Subscription') || bodyText.includes('subscription');
  console.log(`Cost categories visible: GenAI=${hasGenAI}, Cloud=${hasCloud}, Subscription=${hasSub}`);

  // Check for large dollar amounts (the real costs should be in the millions)
  const bigDollar = bodyText.match(/\$[\d,]+\.?\d*[KMB]?/g);
  if (bigDollar) {
    console.log('Dollar values:', bigDollar.slice(0, 30).join(', '));
  }

  await browser.close();
})();
