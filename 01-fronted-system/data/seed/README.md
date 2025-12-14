# CSV Seed Data Architecture

This directory contains CSV-based seed data for exchange rates and SaaS subscription templates. The CSV format allows for easy updates and version control while maintaining data integrity.

## Files

### 1. `exchange-rates.csv`

Currency exchange rates relative to USD (base = 1.0).

**Columns:**
- `currency_code` - ISO 4217 currency code (e.g., "USD", "EUR", "INR")
- `currency_name` - Full currency name (e.g., "US Dollar", "Indian Rupee")
- `rate_to_usd` - Exchange rate relative to USD (e.g., 83.12 for INR)
- `symbol` - Currency symbol (e.g., "$", "₹", "€")
- `last_updated` - Last update date (YYYY-MM-DD)

**Supported Currencies (20):**
- Major: USD, EUR, GBP, JPY, CAD, AUD, CNY, INR, SGD, CHF, HKD, NZD, SEK, KRW
- Arab Countries: AED, SAR, QAR, KWD, BHD, OMR

**Update Policy:**
- Review rates monthly
- Update `last_updated` field when rates change
- All rates are relative to USD (USD = 1.0)

**Usage:**
```typescript
import { loadExchangeRates, getExchangeRate } from "@/data/seed"

// Load all rates
const rates = await loadExchangeRates()

// Get specific rate
const inrRate = await getExchangeRate("INR")  // 83.12
```

### 2. `saas-subscription-templates.csv`

SaaS subscription plan templates for seeding organization-specific subscription data.

**Columns:**
- `template_id` - Unique template identifier (e.g., "tmpl_chatgpt_plus")
- `subscription_id` - Original subscription ID (for reference)
- `provider` - Provider slug (e.g., "chatgpt_plus", "slack", "canva")
- `plan_name` - Plan tier (e.g., "FREE", "PRO", "TEAM", "ENTERPRISE")
- `display_name` - Human-readable plan name
- `category` - Service category (e.g., "ai", "design", "communication")
- `status` - Plan status (always "active" for templates)
- `billing_cycle` - Billing frequency (monthly, annual, quarterly)
- `currency` - Currency code (always "USD" for templates)
- `source_currency` - Original pricing currency (always "USD")
- `seats` - Number of seats (0 for templates, set by user)
- `pricing_model` - Pricing type (FLAT_FEE, PER_SEAT)
- `unit_price_usd` - Monthly price per unit in USD
- `yearly_price_usd` - Annual price in USD
- `discount_type` - Discount type (percent, fixed)
- `discount_value` - Discount amount
- `notes` - Plan description

**Supported Providers (25+):**
- AI: chatgpt_plus, claude_pro, copilot, cursor
- Design: canva, figma, miro, adobe_cc
- Communication: slack, zoom, teams
- Productivity: notion, asana, monday
- Developer Tools: github, gitlab, vercel, netlify, railway, supabase
- Project Management: jira, confluence, linear
- Video: loom
- Automation: zapier

**Usage:**
```typescript
import { getTemplatesByProvider, getTemplateById } from "@/data/seed"

// Get templates for a provider
const slackTemplates = await getTemplatesByProvider("slack")

// Get specific template
const template = await getTemplateById("tmpl_chatgpt_plus")
```

### 3. `index.ts`

Re-exports all loader functions and types for centralized access.

**Exports:**
- Types: `ExchangeRate`, `SubscriptionTemplate`
- Exchange Rates: `loadExchangeRates()`, `getExchangeRate()`, `getCurrencySymbol()`, `getSupportedCurrencies()`
- Subscription Templates: `loadSubscriptionTemplates()`, `getTemplatesByProvider()`, `getTemplateById()`, `getAvailableProviders()`, `getTemplatesByCategory()`
- Cache Management: `clearCache()`

## Integration with Exchange Rates Library

The `lib/currency/exchange-rates.ts` module has been updated to support both CSV-based and hardcoded exchange rates:

**Synchronous Functions (Hardcoded Fallback):**
- `convertCurrency()` - Uses hardcoded `EXCHANGE_RATES` constant
- `convertFromUSD()` - Converts USD to target currency
- `convertToUSD()` - Converts target currency to USD
- `getExchangeRate()` - Gets rate from hardcoded constant
- `getSupportedCurrencies()` - Lists hardcoded currencies
- `convertWithAudit()` - Conversion with audit trail

**Async Functions (CSV-Based):**
- `convertCurrencyAsync()` - Uses CSV-loaded rates
- `convertFromUSDAsync()` - Converts USD to target currency (CSV)
- `convertToUSDAsync()` - Converts target currency to USD (CSV)
- `getExchangeRateAsync()` - Gets rate from CSV
- `getSupportedCurrenciesAsync()` - Lists CSV currencies
- `convertWithAuditAsync()` - Conversion with audit trail (CSV)

**Migration Strategy:**
1. Existing code continues to work with synchronous functions
2. New code can use async functions for CSV-based rates
3. Async functions fallback to hardcoded rates on error
4. Gradual migration path for existing codebase

## CSV Loader (`lib/seed/csv-loader.ts`)

Utility module for parsing CSV files and loading seed data.

**Features:**
- Automatic type conversion (numbers, booleans, nulls)
- In-memory caching for performance
- Error handling with fallbacks
- Type-safe interfaces

**Functions:**

**Exchange Rates:**
```typescript
loadExchangeRates(): Promise<ExchangeRate[]>
getExchangeRate(currency: string): Promise<number>
getCurrencySymbol(currency: string): Promise<string>
getSupportedCurrencies(): Promise<string[]>
```

**Subscription Templates:**
```typescript
loadSubscriptionTemplates(): Promise<SubscriptionTemplate[]>
getTemplatesByProvider(provider: string): Promise<SubscriptionTemplate[]>
getTemplateById(templateId: string): Promise<SubscriptionTemplate | null>
getAvailableProviders(): Promise<string[]>
getTemplatesByCategory(category: string): Promise<SubscriptionTemplate[]>
```

**Cache Management:**
```typescript
clearCache(): void  // Clear all caches (useful for testing)
```

## Usage Examples

### Exchange Rates

```typescript
import {
  loadExchangeRates,
  getExchangeRate,
  getCurrencySymbol,
  getSupportedCurrencies,
} from "@/data/seed"

// Load all exchange rates
const rates = await loadExchangeRates()
console.log(rates)
// [
//   { currency_code: "USD", currency_name: "US Dollar", rate_to_usd: 1.0, symbol: "$", ... },
//   { currency_code: "INR", currency_name: "Indian Rupee", rate_to_usd: 83.12, symbol: "₹", ... },
//   ...
// ]

// Get specific exchange rate
const inrRate = await getExchangeRate("INR")  // 83.12
const eurRate = await getExchangeRate("EUR")  // 0.92

// Get currency symbol
const symbol = await getCurrencySymbol("AED")  // "د.إ"

// Get all supported currencies
const currencies = await getSupportedCurrencies()
// ["USD", "EUR", "GBP", "INR", "AED", ...]
```

### Subscription Templates

```typescript
import {
  loadSubscriptionTemplates,
  getTemplatesByProvider,
  getTemplateById,
  getAvailableProviders,
  getTemplatesByCategory,
} from "@/data/seed"

// Load all templates
const templates = await loadSubscriptionTemplates()

// Get templates for a specific provider
const slackTemplates = await getTemplatesByProvider("slack")
// [
//   { template_id: "tmpl_slack_free", plan_name: "FREE", ... },
//   { template_id: "tmpl_slack_pro", plan_name: "PRO", ... },
//   { template_id: "tmpl_slack_business", plan_name: "BUSINESS_PLUS", ... },
//   { template_id: "tmpl_slack_enterprise", plan_name: "ENTERPRISE_GRID", ... }
// ]

// Get specific template
const template = await getTemplateById("tmpl_chatgpt_plus")
// { template_id: "tmpl_chatgpt_plus", plan_name: "PLUS", unit_price_usd: 20, ... }

// Get all available providers
const providers = await getAvailableProviders()
// ["chatgpt_plus", "claude_pro", "slack", "canva", ...]

// Get templates by category
const aiTemplates = await getTemplatesByCategory("ai")
// [ChatGPT Plus, Claude Pro, Copilot, Cursor templates]
```

### Currency Conversion with CSV Rates

```typescript
import {
  convertCurrencyAsync,
  convertFromUSDAsync,
  convertToUSDAsync,
  getExchangeRateAsync,
  convertWithAuditAsync,
} from "@/lib/currency/exchange-rates"

// Convert between currencies (CSV-based)
const inrAmount = await convertCurrencyAsync(100, "USD", "INR")  // 8312.00
const usdAmount = await convertCurrencyAsync(8312, "INR", "USD")  // 100.00

// Convert from USD
const aedAmount = await convertFromUSDAsync(15, "AED")  // 55.10

// Convert to USD
const usdFromInr = await convertToUSDAsync(831.20, "INR")  // 10.00

// Get exchange rate
const rate = await getExchangeRateAsync("EUR")  // 0.92

// Convert with audit trail
const audit = await convertWithAuditAsync(10, "USD", "INR")
// {
//   sourceCurrency: "USD",
//   sourcePrice: 10,
//   targetCurrency: "INR",
//   convertedPrice: 831.20,
//   exchangeRateUsed: 83.12,
//   convertedAt: "2025-12-14T10:30:00.000Z"
// }
```

## Data Maintenance

### Updating Exchange Rates

1. Open `exchange-rates.csv`
2. Update the `rate_to_usd` column for changed currencies
3. Update `last_updated` to current date (YYYY-MM-DD)
4. Commit changes to version control

**Example:**
```csv
INR,Indian Rupee,84.50,₹,2025-12-20
```

### Adding Subscription Templates

1. Open `saas-subscription-templates.csv`
2. Add new row with template details
3. Use template ID format: `tmpl_{provider}_{plan_slug}`
4. Set `source_currency` to "USD"
5. Leave org-specific fields empty (`org_slug`, `start_date`, `owner_email`, etc.)

**Example:**
```csv
tmpl_discord_nitro,,sub_discord_nitro,discord,NITRO,Discord Nitro,communication,active,,,monthly,USD,USD,0,FLAT_FEE,9.99,119.88,,,TRUE,,,,,,,Enhanced Discord features with HD streaming
```

## Best Practices

1. **Always use CSV loader functions** - Don't parse CSV manually
2. **Cache is automatic** - Data is cached in memory after first load
3. **Clear cache in tests** - Use `clearCache()` between test runs
4. **Fallback to hardcoded** - Async functions fallback to hardcoded rates on error
5. **Version control CSV files** - Track changes to rates and templates
6. **Update last_updated dates** - When modifying exchange rates
7. **Use template_id** - For unique identification of templates
8. **Keep USD as source** - All template prices are in USD

## File Paths

```
01-fronted-system/
├── data/
│   └── seed/
│       ├── exchange-rates.csv                    # Exchange rates data
│       ├── saas-subscription-templates.csv       # Subscription templates
│       ├── index.ts                              # Re-exports
│       └── README.md                             # This file
├── lib/
│   ├── seed/
│   │   └── csv-loader.ts                         # CSV parsing and loading
│   └── currency/
│       └── exchange-rates.ts                     # Currency conversion (updated)
```

## Migration from Backend Seed Data

This CSV architecture replaces direct backend CSV imports with frontend-managed seed data:

**Before (Backend CSV):**
- `02-api-service/configs/saas/seed/data/saas_subscription_plans.csv`
- No exchange rate CSV (hardcoded in backend)

**After (Frontend CSV):**
- `01-fronted-system/data/seed/exchange-rates.csv`
- `01-fronted-system/data/seed/saas-subscription-templates.csv`
- `01-fronted-system/lib/seed/csv-loader.ts`

**Benefits:**
- Single source of truth in frontend
- Version-controlled seed data
- Type-safe TypeScript interfaces
- Automatic caching
- Fallback to hardcoded values
- Gradual migration path

---

**Last Updated:** 2025-12-14
