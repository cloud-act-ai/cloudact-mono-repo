import fetch from 'node-fetch';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const API_KEY = process.env.TEST_ORG_API_KEY;
const ORG_SLUG = process.env.TEST_ORG_SLUG || process.argv[2];
const PIPELINE_SERVICE_URL = process.env.PIPELINE_SERVICE_URL || 'http://localhost:8001';

if (!API_KEY || !ORG_SLUG) {
    console.error('Missing TEST_ORG_API_KEY or TEST_ORG_SLUG. Set in .env.local or pass org_slug as argument.');
    process.exit(1);
}

async function spamPipeline() {
    const url = `${PIPELINE_SERVICE_URL}/api/v1/pipelines/run/${ORG_SLUG}/gcp/cost/billing`;

    // Run 6 times (we already ran once, so total 7)
    for (let i = 1; i <= 6; i++) {
        console.log(`Attempt ${i}...`);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': API_KEY
                },
                body: JSON.stringify({ date: '2025-12-01' })
            });

            const data = await response.json();
            console.log(`Status: ${response.status}`);
            if (response.status !== 200) {
                console.log('Error Body:', JSON.stringify(data, null, 2));
            } else {
                console.log('Success:', data.run_id);
            }
        } catch (error) {
            console.error('Request failed:', error);
        }
        // Small delay to avoid overwhelming local server
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

spamPipeline();
