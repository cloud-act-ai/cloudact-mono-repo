"use client"

import { GenAIPAYGPricing } from "./genai-payg-pricing"
import { GenAICommitmentPricing } from "./genai-commitment-pricing"
import { GenAIInfrastructurePricing } from "./genai-infrastructure-pricing"

// ============================================================================
// TYPES
// ============================================================================

export interface CustomPricingEntry {
  id: string
  createdAt: string
  updatedAt: string
  [key: string]: any
}

export interface PricingOverride {
  rowId: string
  field: string
  originalValue: any
  newValue: any
  updatedAt: string
}

export interface GenAIPricingStorage {
  customPayg: CustomPricingEntry[]
  customCommitment: CustomPricingEntry[]
  customInfrastructure: CustomPricingEntry[]
  overrides: Record<string, PricingOverride[]> // keyed by rowId
}

// ============================================================================
// STORAGE KEYS
// ============================================================================

const getStorageKey = (orgSlug: string, provider: string) =>
  `genai-pricing-${orgSlug}-${provider}`

// ============================================================================
// STORAGE FUNCTIONS
// ============================================================================

export function loadPricingStorage(
  orgSlug: string,
  provider: string
): GenAIPricingStorage {
  if (typeof window === "undefined") {
    return {
      customPayg: [],
      customCommitment: [],
      customInfrastructure: [],
      overrides: {},
    }
  }

  try {
    const key = getStorageKey(orgSlug, provider)
    const stored = localStorage.getItem(key)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error("Failed to load pricing storage:", e)
  }

  return {
    customPayg: [],
    customCommitment: [],
    customInfrastructure: [],
    overrides: {},
  }
}

export function savePricingStorage(
  orgSlug: string,
  provider: string,
  storage: GenAIPricingStorage
): void {
  if (typeof window === "undefined") return

  try {
    const key = getStorageKey(orgSlug, provider)
    localStorage.setItem(key, JSON.stringify(storage))
  } catch (e) {
    console.error("Failed to save pricing storage:", e)
  }
}

// ============================================================================
// CUSTOM PRICING CRUD
// ============================================================================

export function addCustomPayg(
  orgSlug: string,
  provider: string,
  entry: Partial<GenAIPAYGPricing>
): CustomPricingEntry {
  const storage = loadPricingStorage(orgSlug, provider)
  const id = `custom-payg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const now = new Date().toISOString()

  const newEntry: CustomPricingEntry = {
    id,
    ...entry,
    provider,
    isCustom: true,
    createdAt: now,
    updatedAt: now,
  }

  storage.customPayg.push(newEntry)
  savePricingStorage(orgSlug, provider, storage)

  return newEntry
}

export function addCustomCommitment(
  orgSlug: string,
  provider: string,
  entry: Partial<GenAICommitmentPricing>
): CustomPricingEntry {
  const storage = loadPricingStorage(orgSlug, provider)
  const id = `custom-commit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const now = new Date().toISOString()

  const newEntry: CustomPricingEntry = {
    id,
    ...entry,
    provider,
    isCustom: true,
    createdAt: now,
    updatedAt: now,
  }

  storage.customCommitment.push(newEntry)
  savePricingStorage(orgSlug, provider, storage)

  return newEntry
}

export function addCustomInfrastructure(
  orgSlug: string,
  provider: string,
  entry: Partial<GenAIInfrastructurePricing>
): CustomPricingEntry {
  const storage = loadPricingStorage(orgSlug, provider)
  const id = `custom-infra-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const now = new Date().toISOString()

  const newEntry: CustomPricingEntry = {
    id,
    ...entry,
    provider,
    isCustom: true,
    createdAt: now,
    updatedAt: now,
  }

  storage.customInfrastructure.push(newEntry)
  savePricingStorage(orgSlug, provider, storage)

  return newEntry
}

export function deleteCustomEntry(
  orgSlug: string,
  provider: string,
  entryId: string,
  type: "payg" | "commitment" | "infrastructure"
): boolean {
  const storage = loadPricingStorage(orgSlug, provider)

  if (type === "payg") {
    storage.customPayg = storage.customPayg.filter((e) => e.id !== entryId)
  } else if (type === "commitment") {
    storage.customCommitment = storage.customCommitment.filter((e) => e.id !== entryId)
  } else {
    storage.customInfrastructure = storage.customInfrastructure.filter((e) => e.id !== entryId)
  }

  // Also remove any overrides for this entry
  delete storage.overrides[entryId]

  savePricingStorage(orgSlug, provider, storage)
  return true
}

// ============================================================================
// OVERRIDE CRUD
// ============================================================================

export function updatePricingOverride(
  orgSlug: string,
  provider: string,
  rowId: string,
  updates: Record<string, any>
): void {
  const storage = loadPricingStorage(orgSlug, provider)
  const now = new Date().toISOString()

  if (!storage.overrides[rowId]) {
    storage.overrides[rowId] = []
  }

  // Update or add overrides for each field
  for (const [field, newValue] of Object.entries(updates)) {
    const existingIndex = storage.overrides[rowId].findIndex((o) => o.field === field)

    if (existingIndex >= 0) {
      storage.overrides[rowId][existingIndex].newValue = newValue
      storage.overrides[rowId][existingIndex].updatedAt = now
    } else {
      storage.overrides[rowId].push({
        rowId,
        field,
        originalValue: null, // Will be set by the component
        newValue,
        updatedAt: now,
      })
    }
  }

  savePricingStorage(orgSlug, provider, storage)
}

export function resetPricingOverride(
  orgSlug: string,
  provider: string,
  rowId: string
): void {
  const storage = loadPricingStorage(orgSlug, provider)
  delete storage.overrides[rowId]
  savePricingStorage(orgSlug, provider, storage)
}

export function getOverridesForRow(
  orgSlug: string,
  provider: string,
  rowId: string
): Record<string, any> {
  const storage = loadPricingStorage(orgSlug, provider)
  const overrides = storage.overrides[rowId] || []

  return overrides.reduce(
    (acc, o) => {
      acc[o.field] = o.newValue
      return acc
    },
    {} as Record<string, any>
  )
}

// ============================================================================
// UTILITY
// ============================================================================

export function clearAllPricingData(orgSlug: string, provider: string): void {
  if (typeof window === "undefined") return

  const key = getStorageKey(orgSlug, provider)
  localStorage.removeItem(key)
}

export function exportPricingData(
  orgSlug: string,
  provider: string
): GenAIPricingStorage {
  return loadPricingStorage(orgSlug, provider)
}

export function importPricingData(
  orgSlug: string,
  provider: string,
  data: GenAIPricingStorage
): void {
  savePricingStorage(orgSlug, provider, data)
}
