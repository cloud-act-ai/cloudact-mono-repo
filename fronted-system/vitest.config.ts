import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import path from 'path'
import * as dotenv from 'dotenv'

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' })

export default defineConfig({
    test: {
        // Exclude API integration tests from browser mode - they run with --pool=forks
        // Also exclude tests that require Node.js features (fs, process.env)
        exclude: [
            '**/node_modules/**',
            '**/tests/*-openai-*.test.ts',
            '**/tests/*-api-*.test.ts',
            '**/tests/07-*.test.ts',
            '**/tests/09-*.test.ts',
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
        // Pass environment variables to tests
        env: {
            NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
            NEXT_PUBLIC_API_SERVICE_URL: process.env.NEXT_PUBLIC_API_SERVICE_URL || 'http://localhost:8001',
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './'),
        },
    },
})
