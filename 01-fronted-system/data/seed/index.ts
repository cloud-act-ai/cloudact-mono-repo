/**
 * Seed Data Module
 *
 * Centralized access to CSV-based seed data for exchange rates and subscription templates.
 */

export {
  // Types
  type ExchangeRate,
  type SubscriptionTemplate,
  // Exchange Rates
  loadExchangeRates,
  getExchangeRate,
  getCurrencySymbol,
  getSupportedCurrencies,
  // Subscription Templates
  loadSubscriptionTemplates,
  getTemplatesByProvider,
  getTemplateById,
  getAvailableProviders,
  getTemplatesByCategory,
  // Cache Management
  clearCache,
} from "@/lib/seed/csv-loader"
