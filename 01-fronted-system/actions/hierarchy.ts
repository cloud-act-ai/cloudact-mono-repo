"use server"

/**
 * Organizational Hierarchy Server Actions
 *
 * Actions for managing organizational hierarchy:
 * - Departments, Projects, Teams
 * - CSV import/export
 * - Tree view operations
 */

import { logError } from "@/lib/utils"
import { getCachedApiKey } from "@/lib/auth-cache"
import {
  getApiServiceUrl,
  fetchWithTimeout,
  safeJsonParse,
  extractErrorMessage,
  isValidOrgSlug as isValidOrgSlugHelper,
} from "@/lib/api/helpers"

// ============================================
// Types
// ============================================

export type HierarchyEntityType = "department" | "project" | "team"

export interface HierarchyEntity {
  id: string
  org_slug: string
  entity_type: HierarchyEntityType
  entity_id: string
  entity_name: string
  parent_id: string | null
  parent_type: string | null
  dept_id: string | null
  dept_name: string | null
  project_id: string | null
  project_name: string | null
  team_id: string | null
  team_name: string | null
  owner_id: string | null
  owner_name: string | null
  owner_email: string | null
  description: string | null
  metadata: Record<string, unknown> | null
  is_active: boolean
  created_at: string
  created_by: string
  updated_at: string | null
  updated_by: string | null
  version: number
}

export interface HierarchyTreeNode {
  entity_type: HierarchyEntityType
  entity_id: string
  entity_name: string
  owner_name: string | null
  owner_email: string | null
  description: string | null
  is_active: boolean
  children: HierarchyTreeNode[]
}

export interface HierarchyTreeResponse {
  org_slug: string
  departments: HierarchyTreeNode[]
  total_departments: number
  total_projects: number
  total_teams: number
}

export interface HierarchyListResponse {
  org_slug: string
  entities: HierarchyEntity[]
  total: number
}

export interface HierarchyImportResult {
  success: boolean
  created: number
  updated: number
  errors: Array<{ row: number; entity_id: string; error: string }>
  message: string
}

export interface DeletionBlockedResponse {
  entity_type: HierarchyEntityType
  entity_id: string
  blocked: boolean
  reason: string
  blocking_entities: Array<{ entity_type: string; entity_id: string; entity_name: string }>
}

export interface CreateDepartmentInput {
  entity_id: string
  entity_name: string
  owner_id?: string
  owner_name?: string
  owner_email?: string
  description?: string
}

export interface CreateProjectInput {
  entity_id: string
  entity_name: string
  dept_id: string
  owner_id?: string
  owner_name?: string
  owner_email?: string
  description?: string
}

export interface CreateTeamInput {
  entity_id: string
  entity_name: string
  project_id: string
  owner_id?: string
  owner_name?: string
  owner_email?: string
  description?: string
}

export interface UpdateEntityInput {
  entity_name?: string
  owner_id?: string
  owner_name?: string
  owner_email?: string
  description?: string
  is_active?: boolean
}

export interface HierarchyCSVRow {
  entity_type: HierarchyEntityType
  entity_id: string
  entity_name: string
  parent_id?: string
  owner_id?: string
  owner_name?: string
  owner_email?: string
  description?: string
}

// ============================================
// Auth Helpers
// ============================================

const isValidOrgSlug = isValidOrgSlugHelper

const isValidEntityId = (id: string): boolean => {
  if (!id || typeof id !== "string") return false
  return /^[a-zA-Z0-9_-]{1,50}$/.test(id)
}

// ============================================
// List Operations
// ============================================

/**
 * Get all hierarchy entities for an organization
 */
export async function getHierarchy(
  orgSlug: string,
  entityType?: HierarchyEntityType,
  includeInactive: boolean = false
): Promise<{ success: boolean; data?: HierarchyListResponse; error?: string }> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization not configured for API access" }
    }

    const apiUrl = getApiServiceUrl()
    let url = `${apiUrl}/api/v1/hierarchy/${orgSlug}?include_inactive=${includeInactive}`
    if (entityType) {
      url += `&entity_type=${entityType}`
    }

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to fetch hierarchy: ${extractErrorMessage(errorText)}` }
    }

    // Use safeJsonParse with default to handle empty/invalid responses
    const data = await safeJsonParse<HierarchyListResponse>(response, {
      org_slug: orgSlug,
      entities: [],
      total: 0,
    })
    return { success: true, data }
  } catch (error) {
    logError("getHierarchy", error)
    return { success: false, error: "Failed to fetch hierarchy" }
  }
}

/**
 * Get hierarchy as a tree structure
 */
export async function getHierarchyTree(
  orgSlug: string
): Promise<{ success: boolean; data?: HierarchyTreeResponse; error?: string }> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization not configured for API access" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(`${apiUrl}/api/v1/hierarchy/${orgSlug}/tree`, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to fetch hierarchy tree: ${extractErrorMessage(errorText)}` }
    }

    // Use safeJsonParse with default to handle empty/invalid responses
    const data = await safeJsonParse<HierarchyTreeResponse>(response, {
      org_slug: orgSlug,
      departments: [],
      total_departments: 0,
      total_projects: 0,
      total_teams: 0,
    })
    return { success: true, data }
  } catch (error) {
    logError("getHierarchyTree", error)
    return { success: false, error: "Failed to fetch hierarchy tree" }
  }
}

// ============================================
// Create Operations
// ============================================

/**
 * Create a new department
 */
export async function createDepartment(
  orgSlug: string,
  input: CreateDepartmentInput
): Promise<{ success: boolean; data?: HierarchyEntity; error?: string }> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (!isValidEntityId(input.entity_id)) {
      return { success: false, error: "Invalid entity ID format" }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization not configured for API access" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(`${apiUrl}/api/v1/hierarchy/${orgSlug}/departments`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to create department: ${extractErrorMessage(errorText)}` }
    }

    const data = await response.json() as HierarchyEntity
    return { success: true, data }
  } catch (error) {
    logError("createDepartment", error)
    return { success: false, error: "Failed to create department" }
  }
}

/**
 * Create a new project under a department
 */
export async function createProject(
  orgSlug: string,
  input: CreateProjectInput
): Promise<{ success: boolean; data?: HierarchyEntity; error?: string }> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (!isValidEntityId(input.entity_id)) {
      return { success: false, error: "Invalid entity ID format" }
    }
    if (!isValidEntityId(input.dept_id)) {
      return { success: false, error: "Invalid department ID format" }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization not configured for API access" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(`${apiUrl}/api/v1/hierarchy/${orgSlug}/projects`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to create project: ${extractErrorMessage(errorText)}` }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    logError("createProject", error)
    return { success: false, error: "Failed to create project" }
  }
}

/**
 * Create a new team under a project
 */
export async function createTeam(
  orgSlug: string,
  input: CreateTeamInput
): Promise<{ success: boolean; data?: HierarchyEntity; error?: string }> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (!isValidEntityId(input.entity_id)) {
      return { success: false, error: "Invalid entity ID format" }
    }
    if (!isValidEntityId(input.project_id)) {
      return { success: false, error: "Invalid project ID format" }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization not configured for API access" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(`${apiUrl}/api/v1/hierarchy/${orgSlug}/teams`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to create team: ${extractErrorMessage(errorText)}` }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    logError("createTeam", error)
    return { success: false, error: "Failed to create team" }
  }
}

// ============================================
// Update Operations
// ============================================

/**
 * Update a hierarchy entity
 */
export async function updateEntity(
  orgSlug: string,
  entityType: HierarchyEntityType,
  entityId: string,
  input: UpdateEntityInput
): Promise<{ success: boolean; data?: HierarchyEntity; error?: string }> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (!isValidEntityId(entityId)) {
      return { success: false, error: "Invalid entity ID format" }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization not configured for API access" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/hierarchy/${orgSlug}/${entityType}/${entityId}`,
      {
        method: "PUT",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to update entity: ${extractErrorMessage(errorText)}` }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    logError("updateEntity", error)
    return { success: false, error: "Failed to update entity" }
  }
}

// ============================================
// Delete Operations
// ============================================

/**
 * Check if an entity can be deleted
 */
export async function checkCanDelete(
  orgSlug: string,
  entityType: HierarchyEntityType,
  entityId: string
): Promise<{ success: boolean; data?: DeletionBlockedResponse; error?: string }> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (!isValidEntityId(entityId)) {
      return { success: false, error: "Invalid entity ID format" }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization not configured for API access" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/hierarchy/${orgSlug}/${entityType}/${entityId}/can-delete`,
      {
        method: "GET",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to check deletion: ${extractErrorMessage(errorText)}` }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    logError("checkCanDelete", error)
    return { success: false, error: "Failed to check deletion status" }
  }
}

/**
 * Delete a hierarchy entity
 */
export async function deleteEntity(
  orgSlug: string,
  entityType: HierarchyEntityType,
  entityId: string,
  force: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (!isValidEntityId(entityId)) {
      return { success: false, error: "Invalid entity ID format" }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization not configured for API access" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/hierarchy/${orgSlug}/${entityType}/${entityId}?force=${force}`,
      {
        method: "DELETE",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to delete entity: ${extractErrorMessage(errorText)}` }
    }

    return { success: true }
  } catch (error) {
    logError("deleteEntity", error)
    return { success: false, error: "Failed to delete entity" }
  }
}

// ============================================
// Import/Export Operations
// ============================================

/**
 * Import hierarchy from CSV rows
 */
export async function importHierarchy(
  orgSlug: string,
  rows: HierarchyCSVRow[],
  mode: "merge" | "replace" = "merge"
): Promise<{ success: boolean; data?: HierarchyImportResult; error?: string }> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization not configured for API access" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/hierarchy/${orgSlug}/import`,
      {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rows, mode }),
      },
      120000 // 2 minute timeout for imports
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to import hierarchy: ${extractErrorMessage(errorText)}` }
    }

    const data = await response.json() as HierarchyImportResult

    // Check if there were any errors during import - report partial success accurately
    const hasErrors = data.errors && data.errors.length > 0
    const totalProcessed = (data.created || 0) + (data.updated || 0)

    if (hasErrors && totalProcessed === 0) {
      // Complete failure - no items processed
      return { success: false, data, error: `Import failed: ${data.errors?.length} errors` }
    }

    // Return success with data - UI can check data.errors for partial failures
    return { success: true, data }
  } catch (error) {
    logError("importHierarchy", error)
    return { success: false, error: "Failed to import hierarchy" }
  }
}

/**
 * Export hierarchy as CSV data
 */
export async function exportHierarchy(
  orgSlug: string
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization not configured for API access" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(`${apiUrl}/api/v1/hierarchy/${orgSlug}/export`, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to export hierarchy: ${extractErrorMessage(errorText)}` }
    }

    const data = await response.text()
    return { success: true, data }
  } catch (error) {
    logError("exportHierarchy", error)
    return { success: false, error: "Failed to export hierarchy" }
  }
}

/**
 * Get CSV template for hierarchy import
 */
export async function getHierarchyTemplate(
  orgSlug: string
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization not configured for API access" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(`${apiUrl}/api/v1/hierarchy/${orgSlug}/template`, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to get template: ${extractErrorMessage(errorText)}` }
    }

    const data = await response.text()
    return { success: true, data }
  } catch (error) {
    logError("getHierarchyTemplate", error)
    return { success: false, error: "Failed to get template" }
  }
}

// ============================================
// Convenience Getters
// ============================================

/**
 * Get all departments
 */
export async function getDepartments(
  orgSlug: string
): Promise<{ success: boolean; data?: HierarchyEntity[]; error?: string }> {
  const result = await getHierarchy(orgSlug, "department")
  if (result.success && result.data) {
    return { success: true, data: result.data.entities }
  }
  return { success: false, error: result.error }
}

/**
 * Get all projects
 */
export async function getProjects(
  orgSlug: string
): Promise<{ success: boolean; data?: HierarchyEntity[]; error?: string }> {
  const result = await getHierarchy(orgSlug, "project")
  if (result.success && result.data) {
    return { success: true, data: result.data.entities }
  }
  return { success: false, error: result.error }
}

/**
 * Get all teams
 */
export async function getTeams(
  orgSlug: string
): Promise<{ success: boolean; data?: HierarchyEntity[]; error?: string }> {
  const result = await getHierarchy(orgSlug, "team")
  if (result.success && result.data) {
    return { success: true, data: result.data.entities }
  }
  return { success: false, error: result.error }
}

/**
 * Get projects under a specific department
 */
export async function getProjectsByDepartment(
  orgSlug: string,
  deptId: string
): Promise<{ success: boolean; data?: HierarchyEntity[]; error?: string }> {
  const result = await getProjects(orgSlug)
  if (result.success && result.data) {
    const filtered = result.data.filter((p) => p.parent_id === deptId.toUpperCase())
    return { success: true, data: filtered }
  }
  return { success: false, error: result.error }
}

/**
 * Get teams under a specific project
 */
export async function getTeamsByProject(
  orgSlug: string,
  projectId: string
): Promise<{ success: boolean; data?: HierarchyEntity[]; error?: string }> {
  const result = await getTeams(orgSlug)
  if (result.success && result.data) {
    const filtered = result.data.filter((t) => t.parent_id === projectId.toUpperCase())
    return { success: true, data: filtered }
  }
  return { success: false, error: result.error }
}
