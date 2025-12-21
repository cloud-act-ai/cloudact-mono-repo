/**
 * CSV Seed Data Loader
 *
 * Provides exchange rates and SaaS subscription templates as static data.
 * Data is embedded at build time for browser compatibility.
 */

// ============================================
// TYPES
// ============================================

export interface ExchangeRate {
  currency_code: string
  currency_name: string
  rate_to_usd: number
  symbol: string
  last_updated: string
}

export interface SubscriptionTemplate {
  template_id: string
  provider: string
  plan_name: string
  display_name: string
  category: string
  billing_cycle: string
  currency: string
  source_currency: string
  unit_price_usd: number
  yearly_price_usd: number
  pricing_model: string
  default_seats: number
  features: string
}

// ============================================
// STATIC DATA - EXCHANGE RATES
// Updated: 2025-12-14
// ============================================

const EXCHANGE_RATES_DATA: ExchangeRate[] = [
  { currency_code: "USD", currency_name: "US Dollar", rate_to_usd: 1.0, symbol: "$", last_updated: "2025-12-14" },
  { currency_code: "EUR", currency_name: "Euro", rate_to_usd: 0.92, symbol: "€", last_updated: "2025-12-14" },
  { currency_code: "GBP", currency_name: "British Pound", rate_to_usd: 0.79, symbol: "£", last_updated: "2025-12-14" },
  { currency_code: "INR", currency_name: "Indian Rupee", rate_to_usd: 83.12, symbol: "₹", last_updated: "2025-12-14" },
  { currency_code: "AED", currency_name: "UAE Dirham", rate_to_usd: 3.673, symbol: "د.إ", last_updated: "2025-12-14" },
  { currency_code: "SAR", currency_name: "Saudi Riyal", rate_to_usd: 3.75, symbol: "﷼", last_updated: "2025-12-14" },
  { currency_code: "JPY", currency_name: "Japanese Yen", rate_to_usd: 149.50, symbol: "¥", last_updated: "2025-12-14" },
  { currency_code: "CAD", currency_name: "Canadian Dollar", rate_to_usd: 1.36, symbol: "C$", last_updated: "2025-12-14" },
  { currency_code: "AUD", currency_name: "Australian Dollar", rate_to_usd: 1.53, symbol: "A$", last_updated: "2025-12-14" },
  { currency_code: "SGD", currency_name: "Singapore Dollar", rate_to_usd: 1.34, symbol: "S$", last_updated: "2025-12-14" },
  { currency_code: "CHF", currency_name: "Swiss Franc", rate_to_usd: 0.88, symbol: "CHF", last_updated: "2025-12-14" },
  { currency_code: "CNY", currency_name: "Chinese Yuan", rate_to_usd: 7.24, symbol: "¥", last_updated: "2025-12-14" },
  { currency_code: "HKD", currency_name: "Hong Kong Dollar", rate_to_usd: 7.78, symbol: "HK$", last_updated: "2025-12-14" },
  { currency_code: "NZD", currency_name: "New Zealand Dollar", rate_to_usd: 1.67, symbol: "NZ$", last_updated: "2025-12-14" },
  { currency_code: "SEK", currency_name: "Swedish Krona", rate_to_usd: 10.45, symbol: "kr", last_updated: "2025-12-14" },
  { currency_code: "KRW", currency_name: "South Korean Won", rate_to_usd: 1320.0, symbol: "₩", last_updated: "2025-12-14" },
]

// ============================================
// STATIC DATA - SUBSCRIPTION TEMPLATES
// ============================================

const SUBSCRIPTION_TEMPLATES_DATA: SubscriptionTemplate[] = [
  // AI Tools
  { template_id: "tmpl_chatgpt_free", provider: "chatgpt_plus", plan_name: "FREE", display_name: "ChatGPT Free", category: "ai", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 0, yearly_price_usd: 0, pricing_model: "FREE", default_seats: 1, features: "GPT-3.5|Limited messages" },
  { template_id: "tmpl_chatgpt_plus", provider: "chatgpt_plus", plan_name: "PLUS", display_name: "ChatGPT Plus", category: "ai", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 20, yearly_price_usd: 240, pricing_model: "PER_USER", default_seats: 1, features: "GPT-4|DALL-E|Priority access" },
  { template_id: "tmpl_chatgpt_team", provider: "chatgpt_plus", plan_name: "TEAM", display_name: "ChatGPT Team", category: "ai", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 25, yearly_price_usd: 300, pricing_model: "PER_SEAT", default_seats: 5, features: "GPT-4|Admin console|Higher limits" },
  { template_id: "tmpl_claude_free", provider: "claude_pro", plan_name: "FREE", display_name: "Claude Free", category: "ai", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 0, yearly_price_usd: 0, pricing_model: "FREE", default_seats: 1, features: "Claude 3 Sonnet|Limited usage" },
  { template_id: "tmpl_claude_pro", provider: "claude_pro", plan_name: "PRO", display_name: "Claude Pro", category: "ai", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 20, yearly_price_usd: 240, pricing_model: "PER_USER", default_seats: 1, features: "Claude 3 Opus|Priority|5x usage" },
  { template_id: "tmpl_claude_team", provider: "claude_pro", plan_name: "TEAM", display_name: "Claude Team", category: "ai", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 25, yearly_price_usd: 300, pricing_model: "PER_SEAT", default_seats: 5, features: "Admin console|Collaboration" },
  { template_id: "tmpl_cursor_pro", provider: "cursor", plan_name: "PRO", display_name: "Cursor Pro", category: "ai", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 20, yearly_price_usd: 192, pricing_model: "PER_USER", default_seats: 1, features: "AI coding|Unlimited completions" },
  { template_id: "tmpl_cursor_business", provider: "cursor", plan_name: "BUSINESS", display_name: "Cursor Business", category: "ai", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 40, yearly_price_usd: 384, pricing_model: "PER_SEAT", default_seats: 5, features: "Admin|SSO|Priority support" },
  { template_id: "tmpl_copilot_individual", provider: "github_copilot", plan_name: "INDIVIDUAL", display_name: "GitHub Copilot Individual", category: "ai", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 10, yearly_price_usd: 100, pricing_model: "PER_USER", default_seats: 1, features: "Code suggestions|Multi-language" },
  { template_id: "tmpl_copilot_business", provider: "github_copilot", plan_name: "BUSINESS", display_name: "GitHub Copilot Business", category: "ai", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 19, yearly_price_usd: 228, pricing_model: "PER_SEAT", default_seats: 5, features: "Org management|Policy controls" },

  // Design Tools
  { template_id: "tmpl_canva_free", provider: "canva", plan_name: "FREE", display_name: "Canva Free", category: "design", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 0, yearly_price_usd: 0, pricing_model: "FREE", default_seats: 1, features: "Basic templates|Limited storage" },
  { template_id: "tmpl_canva_pro", provider: "canva", plan_name: "PRO", display_name: "Canva Pro", category: "design", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 12.99, yearly_price_usd: 119.99, pricing_model: "PER_USER", default_seats: 1, features: "Premium templates|Brand kit|100GB storage" },
  { template_id: "tmpl_canva_teams", provider: "canva", plan_name: "TEAMS", display_name: "Canva Teams", category: "design", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 14.99, yearly_price_usd: 149.90, pricing_model: "PER_SEAT", default_seats: 5, features: "Brand controls|Approval workflows" },
  { template_id: "tmpl_figma_starter", provider: "figma", plan_name: "STARTER", display_name: "Figma Starter", category: "design", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 0, yearly_price_usd: 0, pricing_model: "FREE", default_seats: 2, features: "3 projects|30 days history" },
  { template_id: "tmpl_figma_professional", provider: "figma", plan_name: "PROFESSIONAL", display_name: "Figma Professional", category: "design", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 15, yearly_price_usd: 144, pricing_model: "PER_SEAT", default_seats: 5, features: "Unlimited projects|Version history" },
  { template_id: "tmpl_figma_organization", provider: "figma", plan_name: "ORGANIZATION", display_name: "Figma Organization", category: "design", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 45, yearly_price_usd: 540, pricing_model: "PER_SEAT", default_seats: 10, features: "Design systems|SSO|Analytics" },

  // Collaboration
  { template_id: "tmpl_slack_free", provider: "slack", plan_name: "FREE", display_name: "Slack Free", category: "collaboration", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 0, yearly_price_usd: 0, pricing_model: "FREE", default_seats: 1, features: "90 days history|10 integrations" },
  { template_id: "tmpl_slack_pro", provider: "slack", plan_name: "PRO", display_name: "Slack Pro", category: "collaboration", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 7.25, yearly_price_usd: 87, pricing_model: "PER_SEAT", default_seats: 10, features: "Unlimited history|Unlimited apps" },
  { template_id: "tmpl_slack_business", provider: "slack", plan_name: "BUSINESS", display_name: "Slack Business+", category: "collaboration", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 12.50, yearly_price_usd: 150, pricing_model: "PER_SEAT", default_seats: 10, features: "SSO|Compliance|24/7 support" },
  { template_id: "tmpl_notion_free", provider: "notion", plan_name: "FREE", display_name: "Notion Free", category: "collaboration", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 0, yearly_price_usd: 0, pricing_model: "FREE", default_seats: 1, features: "Personal use|Limited blocks" },
  { template_id: "tmpl_notion_plus", provider: "notion", plan_name: "PLUS", display_name: "Notion Plus", category: "collaboration", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 10, yearly_price_usd: 96, pricing_model: "PER_USER", default_seats: 1, features: "Unlimited blocks|File uploads" },
  { template_id: "tmpl_notion_business", provider: "notion", plan_name: "BUSINESS", display_name: "Notion Business", category: "collaboration", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 15, yearly_price_usd: 180, pricing_model: "PER_SEAT", default_seats: 10, features: "SAML SSO|Advanced permissions" },
  { template_id: "tmpl_linear_free", provider: "linear", plan_name: "FREE", display_name: "Linear Free", category: "collaboration", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 0, yearly_price_usd: 0, pricing_model: "FREE", default_seats: 1, features: "Up to 250 issues" },
  { template_id: "tmpl_linear_standard", provider: "linear", plan_name: "STANDARD", display_name: "Linear Standard", category: "collaboration", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 8, yearly_price_usd: 96, pricing_model: "PER_SEAT", default_seats: 5, features: "Unlimited issues|Guest access" },

  // Development
  { template_id: "tmpl_github_free", provider: "github", plan_name: "FREE", display_name: "GitHub Free", category: "development", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 0, yearly_price_usd: 0, pricing_model: "FREE", default_seats: 1, features: "Unlimited repos|2000 CI minutes" },
  { template_id: "tmpl_github_team", provider: "github", plan_name: "TEAM", display_name: "GitHub Team", category: "development", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 4, yearly_price_usd: 48, pricing_model: "PER_SEAT", default_seats: 5, features: "3000 CI minutes|Protected branches" },
  { template_id: "tmpl_github_enterprise", provider: "github", plan_name: "ENTERPRISE", display_name: "GitHub Enterprise", category: "development", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 21, yearly_price_usd: 252, pricing_model: "PER_SEAT", default_seats: 10, features: "50000 CI minutes|SAML SSO" },
  { template_id: "tmpl_vercel_hobby", provider: "vercel", plan_name: "HOBBY", display_name: "Vercel Hobby", category: "development", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 0, yearly_price_usd: 0, pricing_model: "FREE", default_seats: 1, features: "Personal projects|100GB bandwidth" },
  { template_id: "tmpl_vercel_pro", provider: "vercel", plan_name: "PRO", display_name: "Vercel Pro", category: "development", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 20, yearly_price_usd: 240, pricing_model: "PER_SEAT", default_seats: 1, features: "1TB bandwidth|Preview deployments" },
  { template_id: "tmpl_vercel_enterprise", provider: "vercel", plan_name: "ENTERPRISE", display_name: "Vercel Enterprise", category: "development", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 0, yearly_price_usd: 0, pricing_model: "CUSTOM", default_seats: 10, features: "Custom pricing|SLA|SSO" },

  // Project Management
  { template_id: "tmpl_jira_free", provider: "jira", plan_name: "FREE", display_name: "Jira Free", category: "project_management", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 0, yearly_price_usd: 0, pricing_model: "FREE", default_seats: 10, features: "Up to 10 users|Basic features" },
  { template_id: "tmpl_jira_standard", provider: "jira", plan_name: "STANDARD", display_name: "Jira Standard", category: "project_management", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 7.75, yearly_price_usd: 77.50, pricing_model: "PER_SEAT", default_seats: 10, features: "User roles|Audit logs" },
  { template_id: "tmpl_jira_premium", provider: "jira", plan_name: "PREMIUM", display_name: "Jira Premium", category: "project_management", billing_cycle: "monthly", currency: "USD", source_currency: "USD", unit_price_usd: 15.25, yearly_price_usd: 152.50, pricing_model: "PER_SEAT", default_seats: 10, features: "Advanced roadmaps|Sandbox" },
]

// ============================================
// EXCHANGE RATES FUNCTIONS
// ============================================

/**
 * Load exchange rates (returns static data)
 */
export function loadExchangeRates(): ExchangeRate[] {
  return EXCHANGE_RATES_DATA
}

/**
 * Get exchange rate for a currency (relative to USD)
 */
export function getExchangeRate(currency: string): number {
  const rate = EXCHANGE_RATES_DATA.find((r) => r.currency_code === currency)
  return rate?.rate_to_usd ?? 1.0
}

/**
 * Get currency symbol
 */
export function getCurrencySymbol(currency: string): string {
  const rate = EXCHANGE_RATES_DATA.find((r) => r.currency_code === currency)
  return rate?.symbol ?? "$"
}

/**
 * Get all supported currencies
 */
export function getSupportedCurrencies(): string[] {
  return EXCHANGE_RATES_DATA.map((r) => r.currency_code)
}

/**
 * Get exchange rate with last updated info
 */
export function getExchangeRateWithDate(currency: string): { rate: number; lastUpdated: string } {
  const rateData = EXCHANGE_RATES_DATA.find((r) => r.currency_code === currency)
  return {
    rate: rateData?.rate_to_usd ?? 1.0,
    lastUpdated: rateData?.last_updated ?? new Date().toISOString().split("T")[0],
  }
}

// ============================================
// SUBSCRIPTION TEMPLATES FUNCTIONS
// ============================================

/**
 * Load SaaS subscription templates (returns static data)
 */
export function loadSubscriptionTemplates(): SubscriptionTemplate[] {
  return SUBSCRIPTION_TEMPLATES_DATA
}

/**
 * Get subscription templates by provider
 */
export function getTemplatesByProvider(provider: string): SubscriptionTemplate[] {
  return SUBSCRIPTION_TEMPLATES_DATA.filter((t) => t.provider === provider)
}

/**
 * Get subscription template by ID
 */
export function getTemplateById(templateId: string): SubscriptionTemplate | null {
  return SUBSCRIPTION_TEMPLATES_DATA.find((t) => t.template_id === templateId) ?? null
}

/**
 * Get all unique providers from templates
 */
export function getAvailableProviders(): string[] {
  const providers = new Set(SUBSCRIPTION_TEMPLATES_DATA.map((t) => t.provider))
  return Array.from(providers).sort()
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: string): SubscriptionTemplate[] {
  return SUBSCRIPTION_TEMPLATES_DATA.filter((t) => t.category === category)
}

// ============================================
// CACHE MANAGEMENT (no-op for static data)
// ============================================

/**
 * Clear cache (no-op for static data, kept for API compatibility)
 */
export function clearCache(): void {
  // No-op - data is static
}
