import fs from 'fs';
import fetch from 'node-fetch';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const API_KEY = process.env.TEST_ORG_API_KEY || '';
const ORG_SLUG = process.env.TEST_ORG_SLUG || process.argv[2] || '';
const KEY_FILE = process.env.GCP_KEY_FILE || process.argv[3] || '';
const BACKEND_URL = process.env.API_SERVICE_URL || 'http://localhost:8000';

if (!API_KEY || !ORG_SLUG || !KEY_FILE) {
    console.error('Missing required vars. Set TEST_ORG_API_KEY, TEST_ORG_SLUG in .env.local');
    console.error('Usage: npx tsx scripts/setup_gcp_integration.ts <org_slug> <gcp_key_file_path>');
    process.exit(1);
}

async function setupGcp() {
    try {
        const keyContent = fs.readFileSync(KEY_FILE, 'utf8');
        // Ensure it's valid JSON
        JSON.parse(keyContent);

        const url = `${BACKEND_URL}/api/v1/integrations/${ORG_SLUG}/gcp/setup`;
        console.log(`Sending request to ${url}...`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY
            },
            body: JSON.stringify({
                credential: keyContent,
                credential_name: 'gcp-prod-key',
                skip_validation: false
            })
        });

        const data = await response.json();
        console.log('Response Status:', response.status);
        console.log('Response Body:', JSON.stringify(data, null, 2));

    } catch (error) {
        console.error('Error:', error);
    }
}

setupGcp();
