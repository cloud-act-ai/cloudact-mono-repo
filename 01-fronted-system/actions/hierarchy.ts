"use server"

/**
 * N-Level Configurable Hierarchy Server Actions
 *
 * Actions for managing organizational hierarchy with configurable levels.
 * Supports any hierarchy structure (e.g., Org -> Department -> Project -> Team).
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
// Types - Level Configuration
// ============================================

export interface HierarchyLevel {
  id: string
  org_slug: string
  level: number
  level_code: string
  level_name: string
  level_name_plural: string
  parent_level: number | null
  is_required: boolean
  is_leaf: boolean
  max_children: number | null
  id_prefix: string | null
  id_auto_generate: boolean
  metadata_schema: Record<string, unknown> | null
  display_order: number
  icon: string | null
  color: string | null
  is_active: boolean
  created_at: string
  created_by: string
  updated_at: string | null
  updated_by: string | null
}

export interface HierarchyLevelsListResponse {
  org_slug: string
  levels: HierarchyLevel[]
  total: number
  max_depth: number
}

// ============================================
// Types - Entity
// ============================================

export interface HierarchyEntity {
  id: string
  org_slug: string
  entity_id: string
  entity_name: string
  level: number
  level_code: string
  parent_id: string | null
  path: string
  path_ids: string[]
  path_names: string[]
  depth: number
  owner_id: string | null
  owner_name: string | null
  owner_email: string | null
  description: string | null
  metadata: Record<string, unknown> | null
  sort_order: number | null
  is_active: boolean
  created_at: string
  created_by: string
  updated_at: string | null
  updated_by: string | null
  version: number
  level_name?: string | null
  children_count?: number | null
}

export interface HierarchyListResponse {
  org_slug: string
  entities: HierarchyEntity[]
  total: number
}

// ============================================
// Types - Tree
// ============================================

export interface HierarchyTreeNode {
  id: string
  entity_id: string
  entity_name: string
  level: number
  level_code: string
  level_name: string
  path: string
  depth: number
  owner_name: string | null
  owner_email: string | null
  description: string | null
  is_active: boolean
  metadata: Record<string, unknown> | null
  children: HierarchyTreeNode[]
}

export interface HierarchyTreeResponse {
  org_slug: string
  levels: HierarchyLevel[]
  roots: HierarchyTreeNode[]
  stats: Record<string, number> // {"department": 5, "project": 12, "team": 25, "total": 42}
}

// ============================================
// Types - Deletion
// ============================================

export interface DeletionBlockedResponse {
  entity_id: string
  level_code: string
  blocked: boolean
  reason: string
  blocking_entities: Array<{ entity_id: string; entity_name: string; level_code: string }>
}

// ============================================
// Types - Request Inputs
// ============================================

export interface CreateEntityInput {
  entity_id?: string
  entity_name: string
  level_code: string
  parent_id?: string | null
  owner_id?: string
  owner_name?: string
  owner_email?: string
  description?: string
  metadata?: Record<string, unknown>
  sort_order?: number
}

export interface UpdateEntityInput {
  entity_name?: string
  owner_id?: string
  owner_name?: string
  owner_email?: string
  description?: string
  metadata?: Record<string, unknown>
  sort_order?: number
  is_active?: boolean
}

export interface MoveEntityInput {
  new_parent_id: string | null
}

export interface CreateLevelInput {
  level: number
  level_code: string
  level_name: string
  level_name_plural: string
  parent_level?: number | null
  is_required?: boolean
  is_leaf?: boolean
  max_children?: number
  id_prefix?: string
  id_auto_generate?: boolean
  metadata_schema?: Record<string, unknown>
  display_order?: number
  icon?: string
  color?: string
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
// Level Configuration Operations
// ============================================

/**
 * Get all configured hierarchy levels for an organization
 */
export async function getHierarchyLevels(
  orgSlug: string,
  includeInactive: boolean = false
): Promise<{ success: boolean; data?: HierarchyLevelsListResponse; error?: string }> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization not configured for API access" }
    }

    const apiUrl = getApiServiceUrl()
    const url = `${apiUrl}/api/v1/hierarchy/${orgSlug}/levels?include_inactive=${includeInactive}`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to fetch levels: ${extractErrorMessage(errorText)}` }
    }

    const data = await safeJsonParse<HierarchyLevelsListResponse>(response, {
      org_slug: orgSlug,
      levels: [],
      total: 0,
      max_depth: 0,
    })
    return { success: true, data }
  } catch (error) {
    logError("getHierarchyLevels", error)
    return { success: false, error: "Failed to fetch hierarchy levels" }
  }
}

/**
 * Create a new hierarchy level configuration
 */
export async function createHierarchyLevel(
  orgSlug: string,
  input: CreateLevelInput
): Promise<{ success: boolean; data?: HierarchyLevel; error?: string }> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization not configured for API access" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(`${apiUrl}/api/v1/hierarchy/${orgSlug}/levels`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to create level: ${extractErrorMessage(errorText)}` }
    }

    const data = await response.json() as HierarchyLevel
    return { success: true, data }
  } catch (error) {
    logError("createHierarchyLevel", error)
    return { success: false, error: "Failed to create hierarchy level" }
  }
}

// ============================================
// Entity List & Tree Operations
// ============================================

/**
 * Get all hierarchy entities for an organization
 */
export async function getHierarchy(
  orgSlug: string,
  levelCode?: string,
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
    if (levelCode) {
      url += `&level_code=${levelCode}`
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

    const data = await safeJsonParse<HierarchyTreeResponse>(response, {
      org_slug: orgSlug,
      levels: [],
      roots: [],
      stats: {},
    })
    return { success: true, data }
  } catch (error) {
    logError("getHierarchyTree", error)
    return { success: false, error: "Failed to fetch hierarchy tree" }
  }
}

// ============================================
// Entity CRUD Operations
// ============================================

/**
 * Get a specific entity by ID
 */
export async function getEntity(
  orgSlug: string,
  entityId: string
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
      `${apiUrl}/api/v1/hierarchy/${orgSlug}/entities/${entityId}`,
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
      return { success: false, error: `Failed to fetch entity: ${extractErrorMessage(errorText)}` }
    }

    const data = await response.json() as HierarchyEntity
    return { success: true, data }
  } catch (error) {
    logError("getEntity", error)
    return { success: false, error: "Failed to fetch entity" }
  }
}

/**
 * Create a new hierarchy entity at any level
 */
export async function createEntity(
  orgSlug: string,
  input: CreateEntityInput
): Promise<{ success: boolean; data?: HierarchyEntity; error?: string }> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (input.entity_id && !isValidEntityId(input.entity_id)) {
      return { success: false, error: "Invalid entity ID format" }
    }
    if (input.parent_id && !isValidEntityId(input.parent_id)) {
      return { success: false, error: "Invalid parent ID format" }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization not configured for API access" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(`${apiUrl}/api/v1/hierarchy/${orgSlug}/entities`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to create entity: ${extractErrorMessage(errorText)}` }
    }

    const data = await response.json() as HierarchyEntity
    return { success: true, data }
  } catch (error) {
    logError("createEntity", error)
    return { success: false, error: "Failed to create entity" }
  }
}

/**
 * Update a hierarchy entity
 */
export async function updateEntity(
  orgSlug: string,
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
      `${apiUrl}/api/v1/hierarchy/${orgSlug}/entities/${entityId}`,
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

    const data = await response.json() as HierarchyEntity
    return { success: true, data }
  } catch (error) {
    logError("updateEntity", error)
    return { success: false, error: "Failed to update entity" }
  }
}

/**
 * Move an entity to a new parent
 */
export async function moveEntity(
  orgSlug: string,
  entityId: string,
  input: MoveEntityInput
): Promise<{ success: boolean; data?: HierarchyEntity; error?: string }> {
  try {
    if (!isValidOrgSlug(orgSlug)) {
      return { success: false, error: "Invalid organization identifier" }
    }
    if (!isValidEntityId(entityId)) {
      return { success: false, error: "Invalid entity ID format" }
    }
    if (input.new_parent_id && !isValidEntityId(input.new_parent_id)) {
      return { success: false, error: "Invalid new parent ID format" }
    }

    const apiKey = await getCachedApiKey(orgSlug)
    if (!apiKey) {
      return { success: false, error: "Organization not configured for API access" }
    }

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/hierarchy/${orgSlug}/entities/${entityId}/move`,
      {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Failed to move entity: ${extractErrorMessage(errorText)}` }
    }

    const data = await response.json() as HierarchyEntity
    return { success: true, data }
  } catch (error) {
    logError("moveEntity", error)
    return { success: false, error: "Failed to move entity" }
  }
}

/**
 * Check if an entity can be deleted
 */
export async function checkCanDelete(
  orgSlug: string,
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
      `${apiUrl}/api/v1/hierarchy/${orgSlug}/entities/${entityId}/can-delete`,
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

    const data = await response.json() as DeletionBlockedResponse
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
      `${apiUrl}/api/v1/hierarchy/${orgSlug}/entities/${entityId}?force=${force}`,
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
// Hierarchy Navigation Operations
// ============================================

/**
 * Get direct children of an entity
 */
export async function getChildren(
  orgSlug: string,
  entityId: string
): Promise<{ success: boolean; data?: HierarchyListResponse; error?: string }> {
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
      `${apiUrl}/api/v1/hierarchy/${orgSlug}/entities/${entityId}/children`,
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
      return { success: false, error: `Failed to fetch children: ${extractErrorMessage(errorText)}` }
    }

    const data = await safeJsonParse<HierarchyListResponse>(response, {
      org_slug: orgSlug,
      entities: [],
      total: 0,
    })
    return { success: true, data }
  } catch (error) {
    logError("getChildren", error)
    return { success: false, error: "Failed to fetch children" }
  }
}

// ============================================
// Convenience Helpers
// ============================================

/**
 * Get entities at a specific level (by level_code)
 */
export async function getEntitiesByLevel(
  orgSlug: string,
  levelCode: string
): Promise<{ success: boolean; data?: HierarchyEntity[]; error?: string }> {
  const result = await getHierarchy(orgSlug, levelCode)
  if (result.success && result.data) {
    return { success: true, data: result.data.entities }
  }
  return { success: false, error: result.error }
}

/**
 * Get children of a specific parent entity
 */
export async function getChildrenOfParent(
  orgSlug: string,
  parentId: string
): Promise<{ success: boolean; data?: HierarchyEntity[]; error?: string }> {
  const result = await getChildren(orgSlug, parentId)
  if (result.success && result.data) {
    return { success: true, data: result.data.entities }
  }
  return { success: false, error: result.error }
}

/**
 * Get level configuration for a specific level_code
 */
export async function getLevelByCode(
  orgSlug: string,
  levelCode: string
): Promise<{ success: boolean; data?: HierarchyLevel; error?: string }> {
  const result = await getHierarchyLevels(orgSlug)
  if (result.success && result.data) {
    const level = result.data.levels.find(l => l.level_code === levelCode)
    if (level) {
      return { success: true, data: level }
    }
    return { success: false, error: `Level '${levelCode}' not found` }
  }
  return { success: false, error: result.error }
}
