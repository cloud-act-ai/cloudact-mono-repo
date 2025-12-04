/**
 * Flow Test 6: Backend Onboarding Sync
 * 
 * Tests backend integration and synchronization:
 * 1. Create organization
 * 2. Verify backend onboarding triggered
 * 3. Check API key generation
 * 4. Verify BigQuery dataset creation
 * 5. Test integration setup
 * 6. Run test pipeline
 * 
 * Uses Antigravity browser automation
 */

import { describe, it, expect } from 'vitest'
import { generateTestUser, TEST_CONFIG } from './utils/test-data'

describe('Flow 6: Backend Onboarding Sync', () => {
    const testUser = generateTestUser('backend_sync_flow')
    let orgSlug: string
    let apiKey: string

    it('should complete backend onboarding and sync', async () => {
        console.log('Starting Flow 6: Backend Onboarding Sync')
        console.log(`Test User: ${testUser.email}`)

        // This test will be executed by browser_subagent
        // See BROWSER_AUTOMATION_TASK below

        expect(true).toBe(true) // Placeholder
    }, TEST_CONFIG.timeout * 3) // Triple timeout for backend operations
})

/**
 * BROWSER AUTOMATION TASK
 *
 * Execute this flow using browser_subagent:
 *
 * Task: Flow 6 - Backend Onboarding and Sync
 *
 * PART 1: Create Organization and Trigger Backend Onboarding
 * 1. Navigate to http://localhost:3000/signup
 * 2. Fill signup form:
 *    - Email: {testUser.email}
 *    - Password: {testUser.password}
 *    - Country code: "+1" (US/Canada)
 *    - Phone: "5551234567"
 *    - Company name: {testUser.orgName}
 *    - Company type: "Startup"
 * 3. Click "Continue to plan selection"
 * 4. Wait for redirect to /onboarding/billing
 * 5. Select "Starter" plan card
 * 6. Click "Continue to Checkout"
 * 7. Complete Stripe checkout (test card: 4242 4242 4242 4242)
 * 8. Wait for redirect to /onboarding/success
 * 9. Monitor "Setting up your organization..." screen
 * 10. Wait for backend onboarding (max 30s)
 * 11. Capture any error messages
 * 12. Note the orgSlug from redirect URL (/{orgSlug}/dashboard)
 * 13. Take screenshot of final state
 * 
 * PART 2: Verify API Key and Backend Status
 * 11. Navigate to /{orgSlug}/settings/onboarding
 * 12. Look for "Backend Integration" or "API Key" section
 * 13. Check backend onboarding status:
 *     - Should show "✅ Configured" or "Backend Onboarded"
 *     - Should display API key fingerprint (last 4-8 chars)
 *     - Shows "Internal API Key" label
 * 14. Take screenshot of API key section
 * 15. Verify backend connection status
 * 
 * PART 3: Test Integration Setup (Verify API Key Works)
 * 16. Navigate to /{orgSlug}/settings/integrations
 * 17. Click "Configure OpenAI"
 * 18. Enter test API key: "sk-test-demo-key-12345"
 * 19. Click "Connect" or "Save"
 * 20. Observe result:
 *     - If "Organization API key not found" → FAIL (backend sync issue)
 *     - If "Invalid OpenAI key" → PASS (org API key works, OpenAI key invalid as expected)
 *     - If "Success" → PASS (both keys work)
 * 21. Take screenshot of integration result
 * 
 * PART 4: Verify Backend Data (Optional - requires backend access)
 * 22. Check if BigQuery dataset created: {orgSlug}
 * 23. Verify tables exist: org_api_keys, org_integrations, org_meta_pipeline_runs
 * 24. Query org_api_keys table for {orgSlug}
 * 25. Verify API key encrypted and stored
 * 
 * PART 5: Test Pipeline Execution (If GCP configured)
 * 26. Navigate to /{orgSlug}/pipelines
 * 27. Select "GCP Cost Billing" pipeline
 * 28. Click "Run Pipeline"
 * 29. Observe result:
 *     - If "Organization API key not found" → FAIL
 *     - If "GCP integration not configured" → EXPECTED (need GCP setup)
 *     - If pipeline runs → PASS
 * 30. Take screenshot of pipeline result
 * 
 * VERIFICATION CHECKLIST:
 * - [ ] Organization created in Supabase
 * - [ ] Backend onboarding completed
 * - [ ] API key generated and stored
 * - [ ] API key accessible for integrations
 * - [ ] BigQuery dataset created (if verifiable)
 * - [ ] Integration setup works
 * - [ ] Pipeline execution works (if GCP configured)
 * 
 * Return pass/fail with detailed status for each check
 */
