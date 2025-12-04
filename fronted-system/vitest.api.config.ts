import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        include: [
            'tests/07-pipeline-quota-enforcement.test.ts',
            'tests/08-openai-quota-enforcement.test.ts',
            'tests/10-pipeline-validation.unit.test.ts',
            'tests/06-backend-onboarding-sync.test.ts'
        ],
        environment: 'node',
        testTimeout: 120000,
        hookTimeout: 60000,
    },
})
