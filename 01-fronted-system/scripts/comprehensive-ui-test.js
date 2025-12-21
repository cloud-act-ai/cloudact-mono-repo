const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, '../test-results/comprehensive-ui');
const CREDENTIALS = {
  email: 'guru.kallam@gmail.com',
  password: 'guru1234'
};

const VIEWPORTS = {
  desktop: { width: 1920, height: 1080, isMobile: false, label: 'Desktop' },
  mobile: { width: 375, height: 812, isMobile: true, label: 'Mobile-iPhoneX' }
};

const ROUTES = [
  { path: '/dashboard', label: 'Dashboard-Overview' },
  { path: '/dashboard/cost-dashboards', label: 'Cost-Dashboards' },
  { path: '/dashboard/billing', label: 'Billing' },
  { path: '/dashboard/integrations', label: 'Integrations' },
  { path: '/dashboard/pipelines', label: 'Pipelines' },
  { path: '/dashboard/settings', label: 'Settings' }
];

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Logger
const logStream = fs.createWriteStream(path.join(OUTPUT_DIR, 'test-log.txt'), { flags: 'a' });
function log(message) {
  const timestamp = new Date().toISOString();
  const msg = `[${timestamp}] ${message}`;
  console.log(msg);
  logStream.write(msg + '\n');
}

async function runTest() {
  log('Starting Comprehensive UI Test...');
  const browser = await chromium.launch({ headless: true });
  
  // Create a context for persistent state (like login cookies if needed across tests, though we'll login per viewport scope for cleanliness or share?? 
  // actually, let's just do one pass per viewport to simulate that specific device experience fully)
  
  for (const [vpName, vpConfig] of Object.entries(VIEWPORTS)) {
    log(`\n=== Testing Viewport: ${vpName} (${vpConfig.width}x${vpConfig.height}) ===`);
    
    const context = await browser.newContext({
      viewport: { width: vpConfig.width, height: vpConfig.height },
      isMobile: vpConfig.isMobile,
      hasTouch: vpConfig.isMobile,
      userAgent: vpConfig.isMobile 
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
        : undefined
    });

    const page = await context.newPage();
    const consoleErrors = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        const text = msg.text();
        // Filter out common noise if necessary
        consoleErrors.push({ type: msg.type(), text, url: page.url() });
        log(`[CONSOLE ${msg.type().toUpperCase()}] ${text}`);
      }
    });

    page.on('pageerror', err => {
      consoleErrors.push({ type: 'exception', text: err.message, url: page.url() });
      log(`[PAGE ERROR] ${err.message}`);
    });

    // 1. Login
    try {
      log('Navigating to Login...');
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
      
      // Check if already logged in (redirected)
      if (page.url().includes('/dashboard')) {
        log('Already logged in!');
      } else {
        log('Filling credentials...');
        await page.fill('input[type="email"]', CREDENTIALS.email);
        await page.fill('input[type="password"]', CREDENTIALS.password);
        await page.click('button[type="submit"]'); // Assuming standard button
        
        await page.waitForTimeout(3000); // Wait for auth
        await page.waitForLoadState('networkidle');
      }
      
      // Verify Dashboard access
      if (!page.url().includes('dashboard') && !page.url().includes('onboarding')) {
        log(`Login might have failed. Current URL: ${page.url()}`);
        await page.screenshot({ path: path.join(OUTPUT_DIR, `${vpName}-login-fail.png`) });
      } else {
        log('Login successful.');
      }

    } catch (e) {
      log(`Login Fatal Error: ${e.message}`);
    }

    // 2. Iterate Routes
    for (const route of ROUTES) {
      try {
        const fullUrl = `${BASE_URL}${route.path}`;
        log(`Visiting: ${route.label} (${fullUrl})`);
        
        await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1500); // settle UI
        
        // Take Screenshot
        const screenshotPath = path.join(OUTPUT_DIR, `${vpName}-${route.label}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        log(`Saved screenshot: ${screenshotPath}`);

        // Interactive Check: Mobile Menu
        if (vpConfig.isMobile) {
          // Attempt to find and open menu to check sidebar padding/layout
          const menuSelectors = ['button[aria-label="Toggle Menu"]', 'button[aria-label="menu"]', '[data-testid="mobile-menu-btn"]', 'header button'];
          for (const sel of menuSelectors) {
            if (await page.$(sel)) {
              log(`Found potential menu button: ${sel}`);
              // We won't click it in this loop to avoid state messiness, but we note it exists.
              // Actually, let's click it for the Dashboard view only.
              if (route.label.includes('Dashboard')) {
                 await page.click(sel);
                 await page.waitForTimeout(500);
                 await page.screenshot({ path: path.join(OUTPUT_DIR, `${vpName}-${route.label}-MenuOpen.png`) });
                 log('Captured Mobile Menu Open state');
                 // click outside or reload to reset??
                 await page.reload();
              }
              break;
            }
          }
        }

      } catch (e) {
        log(`Error visiting ${route.label}: ${e.message}`);
      }
    }

    await context.close();
    
    // Dump console errors for this viewport
    if (consoleErrors.length > 0) {
      fs.writeFileSync(path.join(OUTPUT_DIR, `${vpName}-console-errors.json`), JSON.stringify(consoleErrors, null, 2));
    }
  }

  await browser.close();
  log('Test Run Complete.');
  logStream.end();
}

runTest();
