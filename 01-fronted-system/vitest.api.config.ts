import { defineConfig } from 'vite'
import * as dotenv from 'dotenv'

// Load .env.local for API integration tests
dotenv.config({ path: '.env.local' })

export default defineConfig({
    test: {
        include: [
            'tests/07-pipeline-quota-enforcement.test.ts',
            'tests/08-openai-quota-enforcement.test.ts',
            'tests/10-pipeline-validation.unit.test.ts',
            'tests/06-backend-onboarding-sync.test.ts',
            'tests/13-saas-subscription-providers.test.ts',
            'tests/organization_onboarding/validation.test.ts',
        ],
        environment: 'node',
        testTimeout: 120000,
        hookTimeout: 60000,
        // Pass environment variables from .env.local
        env: {
            NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
            SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
            NEXT_PUBLIC_API_SERVICE_URL: process.env.NEXT_PUBLIC_API_SERVICE_URL || 'http://localhost:8000',
            API_SERVICE_URL: process.env.API_SERVICE_URL || 'http://localhost:8000',
            CA_ROOT_API_KEY: process.env.CA_ROOT_API_KEY || '',
        },
    },
})
