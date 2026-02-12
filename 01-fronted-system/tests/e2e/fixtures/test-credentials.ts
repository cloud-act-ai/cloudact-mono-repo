/**
 * Test User Credentials
 *
 * Used across all E2E tests for authentication.
 * Uses environment variables when available, otherwise falls back to defaults.
 */

export const TEST_USER = {
  email: process.env.TEST_USER_EMAIL || 'demo@cloudact.ai',
  password: process.env.TEST_USER_PASSWORD || 'Demo1234',
}

export const SUBSCRIPTION_PROVIDERS = [
  { name: 'Slack', provider: 'slack' },
  { name: 'GitHub', provider: 'github' },
  { name: 'Figma', provider: 'figma' },
  { name: 'Notion', provider: 'notion' },
  { name: 'Jira', provider: 'jira' },
  { name: 'Canva', provider: 'canva' },
  { name: 'ChatGPT Plus', provider: 'chatgpt_plus' },
]
