import { defineConfig } from 'vite'
import { playwright } from '@vitest/browser-playwright'
import path from 'path'
import * as dotenv from 'dotenv'

// Load environment variables from .env.local
// This loads ALL credentials for testing (Supabase, Stripe, API keys, etc.)
dotenv.config({ path: '.env.local' })

export default defineConfig({
    test: {
        // Setup file for DOM cleanup between tests
        setupFiles: ['./vitest.setup.ts'],
        // Exclude API integration tests from browser mode - they run with --pool=forks
        // Also exclude tests that require Node.js features (fs, process.env)
        exclude: [
            '**/node_modules/**',
            // API integration tests - run with --pool=forks in node env
            '**/tests/*-openai-*.test.ts',
            '**/tests/*-api-*.test.ts',
            '**/tests/07-*.test.ts',
            '**/tests/09-*.test.ts',
            '**/tests/13-*.test.ts',
            '**/tests/saas_subscription/**',
            '**/tests/organization_onboarding/**',
            '**/tests/user_account/**',
            // E2E tests that require Node.js modules (fs, crypto)
            '**/tests/01-*.test.ts',
            '**/tests/02-*.test.ts',
            '**/tests/03-*.test.ts',
            '**/tests/04-*.test.ts',
            '**/tests/05-*.test.ts',
            '**/tests/06-*.test.ts',
            '**/tests/14-*.test.ts',
            '**/tests/15-*.test.ts',
            '**/tests/quota_enforcement/**',
        ],
        browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [
                { browser: 'chromium' },
            ],
        },
        // Allow tests to run longer for E2E flows
        testTimeout: 60000,
        hookTimeout: 30000,
        // Pass ALL environment variables from .env.local to tests
        // This ensures tests have access to Supabase, Stripe, and API credentials
        env: {
            // Supabase credentials
            NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
            SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
            // API Service URLs
            NEXT_PUBLIC_API_SERVICE_URL: process.env.NEXT_PUBLIC_API_SERVICE_URL || 'http://localhost:8000',
            API_SERVICE_URL: process.env.API_SERVICE_URL || 'http://localhost:8000',
            NEXT_PUBLIC_PIPELINE_SERVICE_URL: process.env.NEXT_PUBLIC_PIPELINE_SERVICE_URL || 'http://localhost:8001',
            PIPELINE_SERVICE_URL: process.env.PIPELINE_SERVICE_URL || 'http://localhost:8001',
            // Backend API Key (server-side only for onboarding)
            CA_ROOT_API_KEY: process.env.CA_ROOT_API_KEY || '',
            // Stripe credentials
            STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
            NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
            // Test configuration
            TEST_BASE_URL: process.env.TEST_BASE_URL || 'http://localhost:3000',
            TEST_PASSWORD: process.env.TEST_PASSWORD || 'testpass123',
            TEST_TIMEOUT: process.env.TEST_TIMEOUT || '60000',
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './'),
        },
    },
})
