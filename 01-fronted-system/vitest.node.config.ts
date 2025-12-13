import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import * as dotenv from 'dotenv'

// Load .env.local directly for Node environment
dotenv.config({ path: '.env.local' })

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), ['NEXT_PUBLIC_', 'CA_ROOT_', 'API_', 'SUPABASE_'])
    return {
        test: {
            // Node environment for API integration tests
            environment: 'node',
            include: [
                '**/tests/*-openai-*.test.ts',
                '**/tests/*-api-*.test.ts',
                '**/tests/07-*.test.ts',
                '**/tests/09-*.test.ts',
                '**/tests/13-*.test.ts',
                '**/tests/saas_subscription/*.test.ts',
            ],
            // Allow tests to run longer for API integration flows
            testTimeout: 120000,
            hookTimeout: 60000,
            env: {
                ...env,
                SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
                NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
                CA_ROOT_API_KEY: process.env.CA_ROOT_API_KEY || '',
            },
        },
    }
})
