import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), ['NEXT_PUBLIC_', 'CA_ROOT_', 'API_'])
    return {
        test: {
            // Node environment for API integration tests
            environment: 'node',
            include: [
                '**/tests/*-openai-*.test.ts',
                '**/tests/*-api-*.test.ts',
            ],
            // Allow tests to run longer for API integration flows
            testTimeout: 120000,
            hookTimeout: 60000,
            env: {
                ...env,
            },
        },
    }
})
