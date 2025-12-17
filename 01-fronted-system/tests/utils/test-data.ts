/**
 * Test Data Generators
 * 
 * Utilities for generating unique test data for browser tests
 */

export function generateTestEmail(flowName: string): string {
    const timestamp = Date.now()
    return `test_${flowName}_${timestamp}@test.com`
}

export function generateOrgName(prefix: string): string {
    const timestamp = Date.now()
    const date = new Date()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const yyyy = date.getFullYear()

    return `${prefix}_${mm}${dd}${yyyy}_${timestamp}`
}

export function generateTestUser(flowName: string) {
    return {
        email: generateTestEmail(flowName),
        password: process.env.TEST_PASSWORD || 'testpass123',
        orgName: generateOrgName(`testorg_${flowName}`),
        // Phone number fields
        countryCode: '+1',
        phone: '5551234567',
        companyType: 'startup',
    }
}

export function generateInviteEmail(baseEmail: string): string {
    const [name, domain] = baseEmail.split('@')
    const timestamp = Date.now()
    return `${name}_invited_${timestamp}@${domain}`
}

export const TEST_CONFIG = {
    baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
    timeout: parseInt(process.env.TEST_TIMEOUT || '60000'),
    headless: process.env.TEST_HEADLESS === 'true',
    cleanup: process.env.TEST_CLEANUP !== 'false',
    password: process.env.TEST_PASSWORD || 'testpass123',
}
