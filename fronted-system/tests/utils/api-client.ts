import fs from 'fs';
import path from 'path';
// @ts-ignore
import userCreds from '../fixtures/user_credentials.json';

const API_BASE_URL = process.env.API_SERVICE_URL || process.env.NEXT_PUBLIC_API_SERVICE_URL || 'http://localhost:8000';
const PIPELINE_SERVICE_URL = process.env.NEXT_PUBLIC_PIPELINE_SERVICE_URL || 'http://localhost:8001';
const ROOT_KEY = process.env.CA_ROOT_API_KEY;

if (!ROOT_KEY) {
    console.warn('Warning: CA_ROOT_API_KEY not set. Tests requiring root access will fail.');
}

export class ApiClient {
    private orgSlug: string;
    private apiKey: string;

    constructor(orgSlug: string, apiKey: string) {
        this.orgSlug = orgSlug;
        this.apiKey = apiKey;
    }

    static async createOrg(orgSlug: string, email: string): Promise<ApiClient> {
        const url = `${API_BASE_URL}/api/v1/organizations/onboard`;
        const payload = {
            org_slug: orgSlug,
            company_name: `${orgSlug} Corp`,
            admin_email: email,
            subscription_plan: "STARTER",
            regenerate_api_key_if_exists: true
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CA-Root-Key': ROOT_KEY
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to create org: ${response.status} ${text}`);
        }

        const data = await response.json();
        return new ApiClient(data.org_slug, data.api_key);
    }

    async setupGcpIntegration(credsPath: string = ''): Promise<void> {
        let credsContent: string;
        
        if (credsPath) {
            credsContent = fs.readFileSync(credsPath, 'utf-8');
        } else {
            // Use stored credentials
            credsContent = JSON.stringify(userCreds.gcp);
        }

        const url = `${API_BASE_URL}/api/v1/integrations/${this.orgSlug}/gcp/setup`;
        
        const payload = {
            credential: credsContent,
            credential_name: "GCP Service Account (Auto)",
            skip_validation: false
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.apiKey
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to setup GCP: ${response.status} ${text}`);
        }
    }

    async setupOpenAiIntegration(apiKey: string = ''): Promise<void> {
        const keyToUse = apiKey || userCreds.openai;
        const url = `${API_BASE_URL}/api/v1/integrations/${this.orgSlug}/openai/setup`;
        
        const payload = {
            credential: keyToUse,
            credential_name: "OpenAI Key (Auto)",
            skip_validation: false
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.apiKey
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to setup OpenAI: ${response.status} ${text}`);
        }
    }

    async triggerPipeline(pipelineId: string = 'gcp_billing'): Promise<boolean> {
        // Construct URL based on pipeline ID logic
        let path = 'gcp/cost/billing';
        if (pipelineId === 'openai_usage_cost') {
            path = 'openai/cost/usage_cost';
        }

        const url = `${PIPELINE_SERVICE_URL}/api/v1/pipelines/run/${this.orgSlug}/${path}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.apiKey
            },
            body: JSON.stringify({})
        });

        if (response.status === 429) {
            const text = await response.text();
            console.log(`Quota exceeded (429): ${text}`);
            return false;
        }

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to trigger pipeline: ${response.status} ${text}`);
        }

        return true;
    }

    async getQuota(pipelineId: string = 'gcp_billing'): Promise<any> {
        const url = `${API_BASE_URL}/api/v1/validator/validate/${this.orgSlug}`;
        const payload = {
            pipeline_id: pipelineId,
            include_credentials: false
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.apiKey
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
             // If 429, it might return error but not quota. 
             // But validator usually returns 200 with valid=False if quota exceeded?
             // Actually my script showed 200 OK but quota missing when I hit limit?
             // No, script showed 429 when TRIGGERING.
             // Validator check should return 200 with valid=False if quota exceeded.
             const text = await response.text();
             console.log(`Get Quota Error: ${response.status} ${text}`);
             return null;
        }

        const data = await response.json();
        return data.quota;
    }

    async resetPipelineState(): Promise<void> {
        // This is a hack for testing - we can't easily reset the backend state
        // So we just wait a bit to ensure previous runs clear
        await new Promise(r => setTimeout(r, 5000));
        const url = `${API_BASE_URL}/api/v1/validator/complete/${this.orgSlug}`;
        await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.apiKey
            },
            // Use URLSearchParams for query params if needed, but endpoint expects query param
        });
        // Actually requests library uses params=... for query params.
        // fetch needs '?' in URL.
        const fullUrl = `${url}?pipeline_status=FAILED`;
        await fetch(fullUrl, {
             method: 'POST',
             headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.apiKey
            }
        });
    }
}
