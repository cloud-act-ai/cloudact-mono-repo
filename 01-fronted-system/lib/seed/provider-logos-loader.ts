/**
 * Provider Logos Loader
 *
 * Loads provider logo configuration from CSV file.
 * Can be used for both GenAI integrations and SaaS subscriptions.
 *
 * Source CSV: data/seed/provider-logos.csv
 * CDN: https://cdn.simpleicons.org/{logo_slug}/{logo_color}
 */

import fs from "fs"
import path from "path"
import Papa from "papaparse"

export interface ProviderLogo {
  provider_id: string
  display_name: string
  category: string
  logo_slug: string | null
  logo_color: string
  accent_color: string
  description: string
}

// Cache for loaded logos
let cachedLogos: Map<string, ProviderLogo> | null = null

/**
 * Load provider logos from CSV file (server-side only)
 */
export function loadProviderLogos(): Map<string, ProviderLogo> {
  if (cachedLogos) return cachedLogos

  const csvPath = path.join(process.cwd(), "data/seed/provider-logos.csv")

  if (!fs.existsSync(csvPath)) {
    console.warn("Provider logos CSV not found:", csvPath)
    return new Map()
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8")
  const result = Papa.parse<ProviderLogo>(csvContent, {
    header: true,
    skipEmptyLines: true,
    comments: "#",
    transform: (value, field) => {
      // Handle empty logo_slug as null
      if (field === "logo_slug" && (!value || value.trim() === "")) {
        return null
      }
      return value.trim()
    },
  })

  cachedLogos = new Map()
  for (const row of result.data) {
    if (row.provider_id) {
      cachedLogos.set(row.provider_id, row)
    }
  }

  return cachedLogos
}

/**
 * Get logo URL for a provider
 */
export function getLogoUrl(providerId: string): string | null {
  const logos = loadProviderLogos()
  const logo = logos.get(providerId)

  if (!logo?.logo_slug) return null

  return `https://cdn.simpleicons.org/${logo.logo_slug}/${logo.logo_color}`
}

/**
 * Get provider logo config
 */
export function getProviderLogo(providerId: string): ProviderLogo | undefined {
  const logos = loadProviderLogos()
  return logos.get(providerId)
}

/**
 * Get all providers by category
 */
export function getProvidersByCategory(category: string): ProviderLogo[] {
  const logos = loadProviderLogos()
  return Array.from(logos.values()).filter((logo) => logo.category === category)
}

/**
 * Export all logos as JSON (for client-side use)
 */
export function exportLogosAsJson(): Record<string, ProviderLogo> {
  const logos = loadProviderLogos()
  return Object.fromEntries(logos)
}
