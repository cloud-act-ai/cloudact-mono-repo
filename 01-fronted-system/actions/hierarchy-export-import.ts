"use server"

/**
 * Hierarchy Export/Import Server Actions
 *
 * Actions for exporting and importing hierarchy data via CSV.
 * Import uses full sync mode where CSV becomes the source of truth.
 */

import { logError } from "@/lib/utils"
import { getCachedApiKey } from "@/lib/auth-cache"
import { isValidOrgSlug } from "@/lib/utils/validation"
import {
  getApiServiceUrl,
  fetchWithTimeout,
  safeJsonParse,
  extractErrorMessage,
} from "@/lib/api/helpers"

// ============================================
// Types - Sync Preview
// ============================================

export interface SyncChange {
  field: string
  old_value: unknown
  new_value: unknown
}

export interface SyncPreviewItem {
  action: "create" | "update" | "delete" | "unchanged"
  entity_id: string
  entity_name: string | null
  level_code: string | null
  changes: SyncChange[]
  validation_errors: string[]
}

export interface SyncPreview {
  summary: {
    creates: number
    updates: number
    deletes: number
    unchanged: number
  }
  is_valid: boolean
  has_changes: boolean
  creates: SyncPreviewItem[]
  updates: SyncPreviewItem[]
  deletes: SyncPreviewItem[]
  unchanged: SyncPreviewItem[]
  validation_errors: string[]
}

// ============================================
// Types - Import Result
// ============================================

export interface ImportResult {
  success: boolean
  created_count: number
  updated_count: number
  deleted_count: number
  unchanged_count: number
  errors: string[]
}

// ============================================
// Export Action
// ============================================

/**
 * Export hierarchy to CSV format.
 *
 * @param orgSlug - Organization slug
 * @returns CSV content as string, or error
 */
export async function exportHierarchy(
  orgSlug: string
): Promise<{ success: true; data: string } | { success: false; error: string }> {
  try {
    // Validate org slug
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    // Get API key
    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization not configured for API access" }
    }

    // Make request
    const url = `${getApiServiceUrl()}/api/v1/hierarchy/${encodeURIComponent(orgSlug)}/export`
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        error: `Export failed: ${extractErrorMessage(errorText)}`,
      }
    }

    const csvContent = await response.text()
    return { success: true, data: csvContent }
  } catch (err) {
    const errorMessage = logError("exportHierarchy", err)
    return { success: false, error: errorMessage }
  }
}

// ============================================
// Preview Import Action
// ============================================

/**
 * Preview what changes an import would make without applying them.
 *
 * Full sync mode: CSV becomes source of truth.
 * - Entities in CSV but not in DB -> CREATE
 * - Entities in both but different -> UPDATE
 * - Entities in DB but not in CSV -> DELETE
 *
 * @param orgSlug - Organization slug
 * @param csvContent - CSV file content
 * @returns Preview of changes, or error
 */
export async function previewHierarchyImport(
  orgSlug: string,
  csvContent: string
): Promise<{ success: true; data: SyncPreview } | { success: false; error: string }> {
  try {
    // Validate org slug
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    // Validate CSV content
    if (!csvContent || csvContent.trim().length === 0) {
      return { success: false, error: "CSV content is empty" }
    }

    // Get API key
    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization not configured for API access" }
    }

    // Make request
    const url = `${getApiServiceUrl()}/api/v1/hierarchy/${encodeURIComponent(orgSlug)}/import/preview`
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ csv_content: csvContent }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        error: `Preview failed: ${extractErrorMessage(errorText)}`,
      }
    }

    // NULL-001 FIX: Use safeJsonParse with null checking
    const data = await safeJsonParse<SyncPreview>(response, null as unknown as SyncPreview)
    if (!data) {
      return { success: false, error: "Invalid response from server" }
    }
    return { success: true, data }
  } catch (err) {
    const errorMessage = logError("previewHierarchyImport", err)
    return { success: false, error: errorMessage }
  }
}

// ============================================
// Import Action
// ============================================

/**
 * Import hierarchy from CSV with full sync.
 *
 * CSV becomes source of truth:
 * - Entities in CSV but not in DB -> CREATE
 * - Entities in both but different -> UPDATE
 * - Entities in DB but not in CSV -> DELETE (soft delete)
 *
 * @param orgSlug - Organization slug
 * @param csvContent - CSV file content
 * @returns Import result with counts, or error
 */
export async function importHierarchy(
  orgSlug: string,
  csvContent: string
): Promise<{ success: true; data: ImportResult } | { success: false; error: string }> {
  try {
    // Validate org slug
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    // Validate CSV content
    if (!csvContent || csvContent.trim().length === 0) {
      return { success: false, error: "CSV content is empty" }
    }

    // Get API key
    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization not configured for API access" }
    }

    // Make request
    const url = `${getApiServiceUrl()}/api/v1/hierarchy/${encodeURIComponent(orgSlug)}/import`
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ csv_content: csvContent }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        error: `Import failed: ${extractErrorMessage(errorText)}`,
      }
    }

    // NULL-001 FIX: Use safeJsonParse with null checking
    const data = await safeJsonParse<ImportResult>(response, null as unknown as ImportResult)
    if (!data) {
      return { success: false, error: "Invalid response from server" }
    }
    return { success: true, data }
  } catch (err) {
    const errorMessage = logError("importHierarchy", err)
    return { success: false, error: errorMessage }
  }
}
