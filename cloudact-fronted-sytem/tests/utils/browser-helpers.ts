/**
 * Browser Test Helpers
 * 
 * Utility functions for browser automation tests
 */

export async function waitForNavigation(expectedPath: string, timeout = 10000): Promise<boolean> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
        const currentUrl = typeof window !== 'undefined' ? window.location.pathname : ''
        if (currentUrl.includes(expectedPath)) {
            return true
        }
        await new Promise(resolve => setTimeout(resolve, 500))
    }

    return false
}

export async function waitForElement(selector: string, timeout = 10000): Promise<boolean> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
        if (typeof document !== 'undefined') {
            const element = document.querySelector(selector)
            if (element) {
                return true
            }
        }
        await new Promise(resolve => setTimeout(resolve, 500))
    }

    return false
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export interface FormData {
    [key: string]: string
}

export interface TestResult {
    success: boolean
    message: string
    screenshot?: string
    duration?: number
}

export interface FlowStep {
    name: string
    action: () => Promise<TestResult>
    required: boolean
}

export async function executeFlow(steps: FlowStep[]): Promise<TestResult[]> {
    const results: TestResult[] = []

    for (const step of steps) {
        console.log(`Executing step: ${step.name}`)
        const startTime = Date.now()

        try {
            const result = await step.action()
            result.duration = Date.now() - startTime
            results.push(result)

            if (!result.success && step.required) {
                console.error(`Required step failed: ${step.name}`)
                break
            }
        } catch (error) {
            results.push({
                success: false,
                message: `Step failed: ${error instanceof Error ? error.message : String(error)}`,
                duration: Date.now() - startTime,
            })

            if (step.required) {
                break
            }
        }
    }

    return results
}

export function formatTestResults(results: TestResult[]): string {
    const passed = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0)

    return `
Test Results:
  Passed: ${passed}
  Failed: ${failed}
  Total Duration: ${(totalDuration / 1000).toFixed(2)}s
  
Details:
${results.map((r, i) => `  ${i + 1}. ${r.success ? '✅' : '❌'} ${r.message} (${((r.duration || 0) / 1000).toFixed(2)}s)`).join('\n')}
  `
}
