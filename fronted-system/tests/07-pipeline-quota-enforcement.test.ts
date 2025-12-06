// @vitest-environment node
/**
 * Flow Test 7: Pipeline Quota Enforcement (Integration Test)
 * 
 * Tests pipeline run quotas are enforced per plan using real backend APIs.
 * 
 * Verifies:
 * 1. Quota increments with each run
 * 2. Quota limit enforced (Starter: 6/day)
 * 3. Error 429 returned when exceeded
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { ApiClient } from './utils/api-client'
// Use a unique org slug for this test run to avoid conflicts
const TEST_ORG_SLUG = `quota_test_${Date.now()}`
const TEST_EMAIL = `quota_test_${Date.now()}@example.com`

describe('Flow 7: Pipeline Quota Enforcement', () => {
    let client: ApiClient;

    beforeAll(async () => {
        console.log(`Creating test org: ${TEST_ORG_SLUG}`);
        client = await ApiClient.createOrg(TEST_ORG_SLUG, TEST_EMAIL);
        
        console.log('Configuring GCP Integration...');
        // Uses credentials from fixtures/user_credentials.json by default
        await client.setupGcpIntegration();
    }, 120000);

    it('should enforce pipeline quotas', async () => {
        console.log('Starting Pipeline Quota Test');

        // 1. Check initial quota
        let quota = await client.getQuota() as any;
        expect(quota).toBeDefined();
        const initialRuns = quota.pipelines_run_today;
        console.log(`Initial runs: ${initialRuns}`);

        // 2. Run pipelines until limit (Starter limit is 6)
        // We might start with 0 or more if reused (but we create new org)
        const limit = 6;
        let runs = initialRuns;

        // Reset any stuck state first
        await client.resetPipelineState();

        for (let i = runs; i < limit; i++) {
            console.log(`Triggering run ${i + 1}/${limit}...`);
            const success = await client.triggerPipeline();
            expect(success).toBe(true);
            
            // Wait for execution to register (and complete/fail)
            // Since we don't wait for completion in trigger, we might hit concurrent limit
            // So we force reset state between runs to simulate completion
            await new Promise(r => setTimeout(r, 2000));
            await client.resetPipelineState();
            
            // Check quota increment
            quota = await client.getQuota() as any;
            expect(quota.pipelines_run_today).toBeGreaterThan(runs);
            runs = quota.pipelines_run_today;
            console.log(`Current quota: ${runs}/${limit}`);
        }

        // 3. Verify limit reached
        console.log('Attempting run over limit...');
        const success = await client.triggerPipeline();
        expect(success).toBe(false); // Should fail with 429
        console.log('Quota enforcement verified!');

    }, 120000); // 2 min timeout
})

