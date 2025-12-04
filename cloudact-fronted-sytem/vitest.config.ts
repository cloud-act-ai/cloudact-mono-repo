import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
    test: {
        // Exclude API integration tests from browser mode - they run with --pool=forks
        exclude: [
            '**/node_modules/**',
            '**/tests/*-openai-*.test.ts',
            '**/tests/*-api-*.test.ts',
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
    },
})
