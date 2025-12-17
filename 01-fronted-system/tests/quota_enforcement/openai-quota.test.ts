// @vitest-environment node
/**
 * Flow Test 8: OpenAI Integration & Quota (Integration Test)
 * 
 * Tests OpenAI pipeline execution and quota enforcement using real backend APIs.
 * 
 * Verifies:
 * 1. OpenAI integration setup via API
 * 2. Pipeline execution (usage_cost)
 * 3. Quota increments
 * 4. Quota limit enforcement
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { ApiClient } from '../utils/api-client'

// Use a unique org slug for this test run
const TEST_ORG_SLUG = `openai_test_${Date.now()}`
const TEST_EMAIL = `openai_test_${Date.now()}@example.com`

describe('Flow 8: OpenAI Integration & Quota', () => {
    let client: ApiClient;

    beforeAll(async () => {
        console.log(`Creating test org: ${TEST_ORG_SLUG}`);
        client = await ApiClient.createOrg(TEST_ORG_SLUG, TEST_EMAIL);
        
        console.log('Configuring OpenAI Integration...');
        // Uses credentials from fixtures/user_credentials.json by default
        await client.setupOpenAiIntegration();
    }, 120000);

    it('should enforce pipeline quotas for OpenAI', async () => {
        console.log('Starting OpenAI Pipeline Quota Test');

        // 1. Check initial quota
        // Note: Quota is shared across all pipelines for the org
        let quota = await client.getQuota('openai_usage_cost') as any;
        expect(quota).toBeDefined();
        const initialRuns = quota.pipelines_run_today;
        console.log(`Initial runs: ${initialRuns}`);

        // 2. Run pipelines until limit (Starter limit is 6)
        const limit = 6;
        let runs = initialRuns;

        // Reset any stuck state first
        await client.resetPipelineState();

        for (let i = runs; i < limit; i++) {
            console.log(`Triggering OpenAI run ${i + 1}/${limit}...`);
            const success = await client.triggerPipeline('openai_usage_cost');
            expect(success).toBe(true);
            
            // Wait for execution to register
            await new Promise(r => setTimeout(r, 2000));
            await client.resetPipelineState();
            
            // Check quota increment
            quota = await client.getQuota('openai_usage_cost');
            expect(quota.pipelines_run_today).toBeGreaterThan(runs);
            runs = quota.pipelines_run_today;
            console.log(`Current quota: ${runs}/${limit}`);
        }

        // 3. Verify limit reached
        console.log('Attempting run over limit...');
        const success = await client.triggerPipeline('openai_usage_cost');
        expect(success).toBe(false); // Should fail with 429
        console.log('OpenAI Quota enforcement verified!');

    }, 120000); // 2 min timeout
})
