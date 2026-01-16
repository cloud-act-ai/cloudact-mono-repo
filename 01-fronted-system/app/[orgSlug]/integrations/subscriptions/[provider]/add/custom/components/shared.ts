/**
 * Shared Types and Helpers for Custom Subscription Form
 */

import type { BillingCycle } from "@/actions/subscription-providers"

// Extended form data to include audit trail from template
export type FormDataWithAudit = {
  plan_name: string
  display_name?: string
  unit_price: number | undefined
  billing_cycle?: BillingCycle
  currency?: string
  seats?: number | undefined
  pricing_model?: 'PER_SEAT' | 'FLAT_FEE'
  yearly_price?: number
  discount_type?: 'percent' | 'fixed'
  discount_value?: number
  auto_renew?: boolean
  payment_method?: string
  owner_email?: string
  department?: string
  start_date?: string
  end_date?: string
  renewal_date?: string
  contract_id?: string
  notes?: string
  // Audit trail fields
  source_currency?: string
  source_price?: number
  exchange_rate_used?: number
}

// Provider display names
export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  chatgpt_plus: "ChatGPT Plus",
  claude_pro: "Claude Pro",
  gemini_advanced: "Gemini Advanced",
  copilot: "GitHub Copilot",
  cursor: "Cursor",
  windsurf: "Windsurf",
  replit: "Replit",
  v0: "v0",
  lovable: "Lovable",
  canva: "Canva",
  adobe_cc: "Adobe Creative Cloud",
  figma: "Figma",
  miro: "Miro",
  notion: "Notion",
  confluence: "Confluence",
  asana: "Asana",
  monday: "Monday.com",
  slack: "Slack",
  zoom: "Zoom",
  teams: "Microsoft Teams",
  github: "GitHub",
  gitlab: "GitLab",
  jira: "Jira",
  linear: "Linear",
  vercel: "Vercel",
  netlify: "Netlify",
  railway: "Railway",
  supabase: "Supabase",
}

export function getProviderDisplayName(provider: string): string {
  return PROVIDER_DISPLAY_NAMES[provider] || provider.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
}

/**
 * Get default form data
 */
export function getDefaultFormData(currency: string): FormDataWithAudit {
  return {
    plan_name: "",
    display_name: "",
    unit_price: undefined,
    seats: undefined,
    billing_cycle: "monthly",
    pricing_model: "FLAT_FEE",
    currency,
    notes: "",
    source_currency: undefined,
    source_price: undefined,
    exchange_rate_used: undefined,
  }
}

/**
 * Calculate monthly cost from billing cycle
 */
export function calculateMonthlyCost(
  totalCost: number,
  billingCycle?: BillingCycle
): number {
  if (billingCycle === 'annual') return totalCost / 12
  if (billingCycle === 'quarterly') return totalCost / 3
  return totalCost
}

/**
 * Calculate total cost based on pricing model
 */
export function calculateTotalCost(
  unitPrice: number,
  pricingModel: 'PER_SEAT' | 'FLAT_FEE' | undefined,
  seats: number | undefined
): number {
  if (pricingModel === 'PER_SEAT') {
    return unitPrice * (seats || 1)
  }
  return unitPrice
}
