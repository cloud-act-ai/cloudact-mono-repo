const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
    }
  });

  page.on('pageerror', error => {
    console.log('PAGE ERROR:', error.message);
  });

  console.log('1. Navigating to login...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: '/tmp/mobile-01-login.png' });

  console.log('2. Filling login form...');
  await page.waitForSelector('input[type="email"]', { timeout: 5000 });
  await page.fill('input[type="email"]', 'guru.kallam@gmail.com');
  await page.fill('input[type="password"]', 'guru1234');
  await page.screenshot({ path: '/tmp/mobile-02-filled.png' });

  console.log('3. Submitting login...');
  await page.click('button[type="submit"]');

  // Wait for navigation or error
  console.log('4. Waiting for response...');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/tmp/mobile-03-after-submit.png' });

  console.log('5. Current URL:', page.url());

  // Check for error message on page
  const errorAlert = await page.$('[role="alert"]');
  if (errorAlert) {
    const errorText = await errorAlert.textContent();
    console.log('ERROR ON PAGE:', errorText);
  }

  // If we're on dashboard, test mobile menu
  if (page.url().includes('dashboard') || page.url().includes('cost-dashboards')) {
    console.log('6. On dashboard, testing mobile menu...');

    const menuButton = await page.$('button[aria-label*="menu" i]') ||
                       await page.$('header button:first-child');

    if (menuButton) {
      console.log('7. Found menu button, clicking...');
      await menuButton.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: '/tmp/mobile-04-menu-open.png' });
      console.log('Menu screenshot saved');
    } else {
      console.log('Menu button NOT FOUND');
    }
  } else {
    console.log('NOT on dashboard - login may have failed');
    // Get page HTML for debugging
    const bodyHTML = await page.$eval('body', el => el.innerHTML.substring(0, 500));
    console.log('Page content preview:', bodyHTML);
  }

  await browser.close();
  console.log('\nDone! Check /tmp/mobile-*.png');
})();
