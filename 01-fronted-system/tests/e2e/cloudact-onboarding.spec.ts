
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const USER = {
  email: 'sursani.rama@gmail.com',
  password: 'guru1234',
  firstName: 'Sursani',
  lastName: 'Rama',
  phone: '+1 669 467 0258',
  orgName: 'CloudAct Inc',
  currency: 'USD',
  timezone: 'America/Los_Angeles'
};

test.describe('CloudAct Onboarding Automation', () => {
  test.setTimeout(300000); // 5 minutes

  test('Complete Onboarding Flow', async ({ page }) => {
    console.log('Starting Onboarding Automation...');

    // 1. Try Login
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');
    
    console.log('Attempting login...');
    await page.getByRole('textbox', { name: 'Email address' }).fill(USER.email);
    await page.getByRole('textbox', { name: 'Password' }).fill(USER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Check for success or failure
    try {
      // If we see the dashboard or specific user element, login worked
      await page.waitForURL('**/dashboard', { timeout: 5000 });
      console.log('Login successful! Proceeding to post-signup steps.');
    } catch (e) {
      console.log('Login failed or timed out, assuming account needs creation.');
      
      // 2. Signup Flow
      await page.goto(`${BASE_URL}/signup`);
      await page.waitForLoadState('networkidle');

      console.log('Filling Signup Step 1...');
      await page.getByLabel('Email address').fill(USER.email);
      await page.getByLabel('Password', { exact: true }).fill(USER.password);
      // Confirm Password does not exist in the current form
      await page.getByLabel('First name').fill(USER.firstName);
      await page.getByLabel('Last name').fill(USER.lastName);
      
      // Phone is required
      await page.getByLabel('Phone number').fill(USER.phone.replace('+1 ', '')); // input handles formatted phone?
      // actually the input type is 'tel' and handled by `formatPhoneNumber`
      // It expects just the number probably if country code is default +1.
      // Or I can just type the whole thing and let it format?
      // Let's type just the number part '6694670258'
      await page.getByLabel('Phone number').fill('669 467 0258'); 

      await page.getByRole('button', { name: /continue/i }).click();

      console.log('Filling Signup Step 2...');
      await expect(page.getByRole('heading', { name: /set up organization/i })).toBeVisible();
      await page.getByLabel('Company name').fill(USER.orgName);
      
      // Select Currency
      await page.getByLabel('Currency').selectOption(USER.currency);

      // Complet Signup
      await page.getByRole('button', { name: /complete/i }).click();
      
      console.log('Waiting for billing page...');
      await page.waitForURL('**/onboarding/billing', { timeout: 30000 });

      // Select Scale Plan
      console.log('Selecting Scale Plan...');
      // Assuming there's a button or card for Scale
      await page.getByText('Scale').click(); 
      // Or find the specific button
      const scaleButton = page.locator('button').filter({ hasText: /subscribe/i }).last(); // Heuristic
       if (await scaleButton.isVisible()) {
           await scaleButton.click();
       } else {
           // Fallback selector
            await page.getByRole('button', { name: 'Subscribe' }).last().click();
       }

      console.log('Handling Stripe Checkout (if applicable)...');
      // This part is notoriously hard to script blindly. 
      // If it redirects to stripe.com, we might lose control or need to handle it.
      // For now, let's wait a bit and see where we end up.
      await page.waitForTimeout(10000);
      
      // If we are back at dashboard, great.
    }

    // 3. Add Subscription
    console.log('Navigating to Subscriptions...');
    // We expect to be logged in now.
    // If not at dashboard, go there
    if (!page.url().includes('dashboard')) {
        await page.goto(`${BASE_URL}`);
        // If it redirects to login, we have a problem
        await page.waitForLoadState('networkidle');
    }

    // Determine Org Slug from URL or assume it
    // URL format: /:orgSlug/dashboard
    const url = page.url();
    const orgSlug = url.match(/\/([^/]+)\/dashboard/)?.[1];
    if (!orgSlug) {
        console.error('Could not determine Org Slug from URL:', url);
        // Try locating it in the UI or retry login? 
        return;
    }
    console.log(`Org Slug: ${orgSlug}`);

    await page.goto(`${BASE_URL}/${orgSlug}/integrations`); // Assuming 'Subscriptions' maps to integrations or similar
    // The manual says "Navigate to Subscriptions in left sidebar".
    // I need to find the link.
    const subLink = page.getByRole('link', { name: /subscriptions/i });
    if (await subLink.isVisible()) {
        await subLink.click();
    } else {
         await page.goto(`${BASE_URL}/${orgSlug}/integrations/subscriptions`);
    }

    console.log('Adding ChatGPT Subscription...');
    await page.getByRole('button', { name: /add subscription/i }).click();
    
    // Fill Form
    await page.getByLabel('Provider').click();
    await page.getByRole('option', { name: 'OpenAI' }).click();
    
    await page.getByLabel('Service Name').fill('ChatGPT');
    
    // Subscription Type
    const typeLabel = page.getByLabel('Subscription Type');
    if (await typeLabel.isVisible()) {
         await typeLabel.click();
         await page.getByRole('option', { name: /per-user/i }).click();
    }
    
    await page.getByLabel('Plan Name').fill('ChatGPT Plus');
    await page.getByLabel('Cost').fill('20');
    
    // Billing Frequency
     await page.getByLabel('Billing Frequency').click();
    await page.getByRole('option', { name: 'Monthly' }).click();
    
    // Start Date
    await page.getByLabel('Start Date').fill('2025-01-01');
    
    await page.getByLabel('Active Users').fill('1');
    
    await page.getByRole('button', { name: /save|add/i }).click();
    console.log('Subscription added.');

    // 4. Invite Team Member
    console.log('Inviting Team Member...');
    await page.getByRole('link', { name: /team|users/i }).click();
    await page.getByRole('button', { name: /invite/i }).click();
    
    await page.getByLabel('Email').fill('guru.kallam@gmail.com');
    await page.getByLabel('Role').click();
    await page.getByRole('option', { name: 'Admin' }).click();
    
    await page.getByRole('button', { name: /send/i }).click();
    console.log('Invitation sent.');

  });
});
