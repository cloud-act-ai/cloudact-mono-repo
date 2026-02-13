"use client"

/**
 * Cascading Hierarchy Selector Component
 *
 * Displays a cascading dropdown selection for organizational hierarchy.
 * All levels are required and must be selected from top to bottom.
 *
 * Features:
 * - Fetches hierarchy tree structure
 * - Cascading selection (Department → Project → Team)
 * - All levels mandatory
 * - Displays full path breadcrumb
 * - Error handling and loading states
 */

import { useEffect, useState, useCallback } from "react"
import { ChevronRight, Building2, FolderKanban, Users, AlertCircle } from "lucide-react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  getHierarchyTree,
  type HierarchyTreeNode,
  type HierarchyLevel,
} from "@/actions/hierarchy"

export interface SelectedHierarchy {
  entity_id: string
  entity_name: string
  level_code: string
  path: string
  path_names: string
}

interface CascadingHierarchySelectorProps {
  orgSlug: string
  value: SelectedHierarchy | null
  onChange: (hierarchy: SelectedHierarchy | null) => void
  disabled?: boolean
  error?: string
  /**
   * If true, all levels are required (default).
   * If false, selection at any level is accepted (optional hierarchy).
   */
  required?: boolean
  /**
   * Custom label text. Defaults to "Hierarchy Assignment".
   */
  label?: string
  /**
   * Custom description text.
   */
  description?: string
}

// Icon mapping for hierarchy levels
const getLevelIcon = (levelCode: string) => {
  switch (levelCode.toLowerCase()) {
    case 'department':
    case 'dept':
      return <Building2 className="h-4 w-4" />
    case 'project':
    case 'proj':
      return <FolderKanban className="h-4 w-4" />
    case 'team':
      return <Users className="h-4 w-4" />
    default:
      return <Building2 className="h-4 w-4" />
  }
}

export function CascadingHierarchySelector({
  orgSlug,
  value,
  onChange,
  disabled = false,
  error,
  required = true,
  label = "Hierarchy Assignment",
  description,
}: CascadingHierarchySelectorProps) {
  // State
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [levels, setLevels] = useState<HierarchyLevel[]>([])
  const [treeData, setTreeData] = useState<HierarchyTreeNode[]>([])

  // Selected values at each level
  const [selections, setSelections] = useState<Record<number, HierarchyTreeNode>>({})

  // Load hierarchy tree
  const loadHierarchy = useCallback(async () => {
    setLoading(true)
    setFetchError(null)

    try {
      const result = await getHierarchyTree(orgSlug)

      if (!result.success || !result.data) {
        setFetchError(result.error || "Failed to load hierarchy")
        setLoading(false)
        return
      }

      const { levels: hierarchyLevels, roots } = result.data

      // Sort levels by level number
      const sortedLevels = hierarchyLevels
        .filter(l => l.is_active)
        .sort((a, b) => a.level - b.level)

      setLevels(sortedLevels)
      setTreeData(roots)

      // If there's an initial value, pre-populate selections
      // HIGH-003 FIX: Validate path format before parsing
      if (value && value.path) {
        // Build selections map from the value's path
        const pathSegments = value.path.split('/').filter(Boolean)
        const newSelections: Record<number, HierarchyTreeNode> = {}

        // HIGH-003 FIX: Track if any path segment was not found to log warning
        let pathValid = true
        let currentNodes = roots
        for (let i = 0; i < pathSegments.length; i++) {
          const targetEntityId = pathSegments[i]
          // HIGH-003 FIX: Validate entity_id format (alphanumeric, hyphens, underscores)
          if (!/^[a-zA-Z0-9_-]+$/.test(targetEntityId)) {
            console.warn(`[CascadingHierarchySelector] Invalid entity_id format in path: ${targetEntityId}`)
            pathValid = false
            break
          }
          const node = currentNodes.find(n => n.entity_id === targetEntityId)

          if (node) {
            newSelections[node.level] = node
            currentNodes = node.children
          } else {
            // HIGH-003 FIX: Log when path segment not found (ancestor missing)
            console.warn(`[CascadingHierarchySelector] Path segment not found: ${targetEntityId} at depth ${i}`)
            pathValid = false
            break
          }
        }

        if (pathValid) {
          setSelections(newSelections)
        }
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [orgSlug, value])

  useEffect(() => {
    loadHierarchy()
  }, [loadHierarchy])

  // Get available options for a given level
  const getOptionsForLevel = (level: number): HierarchyTreeNode[] => {
    if (level === levels[0]?.level) {
      // First level - show all root nodes
      return treeData
    }

    // For deeper levels, show children of the previous selection
    const parentLevel = levels.find(l => l.level === level - 1)
    if (!parentLevel) return []

    const parentSelection = selections[parentLevel.level]
    if (!parentSelection) return []

    return parentSelection.children || []
  }

  // GAP-001 FIX: Sentinel value for "no selection" since shadcn/ui Select doesn't handle empty strings
  const NO_SELECTION_VALUE = "__NONE__"

  // Handle selection at a specific level
  const handleLevelChange = (level: number, entityId: string) => {
    // Handle "clear" selection for optional mode
    // GAP-001 FIX: Check for sentinel value instead of empty string
    if ((entityId === NO_SELECTION_VALUE || !entityId) && !required) {
      // Is this the first level?
      const isFirstLevel = level === levels[0]?.level

      if (isFirstLevel) {
        // Clear everything - no hierarchy selected
        setSelections({})
        onChange(null)
        return
      }

      // Keep previous level selections, clear current and subsequent
      const newSelections: Record<number, HierarchyTreeNode> = {}
      for (const [lvl, node] of Object.entries(selections)) {
        if (Number(lvl) < level) {
          newSelections[Number(lvl)] = node
        }
      }
      setSelections(newSelections)

      // Find the deepest selected level
      let deepestNode: HierarchyTreeNode | null = null
      for (const lvl of [...levels].reverse()) {
        if (newSelections[lvl.level]) {
          deepestNode = newSelections[lvl.level]
          break
        }
      }

      if (!deepestNode) {
        onChange(null)
        return
      }

      // Emit the deepest level selection
      const pathSegments: string[] = []
      const pathNames: string[] = []
      for (const lvl of levels) {
        const node = newSelections[lvl.level]
        if (node) {
          pathSegments.push(node.entity_id)
          pathNames.push(node.entity_name)
        }
      }
      onChange({
        entity_id: deepestNode.entity_id,
        entity_name: deepestNode.entity_name,
        level_code: deepestNode.level_code,
        path: '/' + pathSegments.join('/'),
        path_names: pathNames.join(' > '),
      })
      return
    }

    const options = getOptionsForLevel(level)
    const selectedNode = options.find(n => n.entity_id === entityId)

    if (!selectedNode) return

    // Update selections - keep all previous levels, clear all subsequent levels
    const newSelections: Record<number, HierarchyTreeNode> = {}

    // Keep selections up to and including current level
    for (const [lvl, node] of Object.entries(selections)) {
      if (Number(lvl) < level) {
        newSelections[Number(lvl)] = node
      }
    }
    newSelections[level] = selectedNode

    setSelections(newSelections)

    // Build the hierarchy data
    const pathSegments: string[] = []
    const pathNames: string[] = []

    // Iterate through all levels in order
    for (const lvl of levels) {
      const node = newSelections[lvl.level]
      if (node) {
        pathSegments.push(node.entity_id)
        pathNames.push(node.entity_name)
      }
    }

    const hierarchyData: SelectedHierarchy = {
      entity_id: selectedNode.entity_id,
      entity_name: selectedNode.entity_name,
      level_code: selectedNode.level_code,
      path: '/' + pathSegments.join('/'),
      path_names: pathNames.join(' > '),
    }

    // Check if this is the last level (leaf level)
    const isLastLevel = level === levels[levels.length - 1]?.level

    if (isLastLevel || !required) {
      // In optional mode, emit on any selection
      // In required mode, only emit on last level
      onChange(hierarchyData)
    } else {
      // Required mode and not at last level - clear the value
      onChange(null)
    }
  }

  // Check if a level should be disabled
  const isLevelDisabled = (level: number): boolean => {
    if (disabled) return true

    // First level is always enabled (if not globally disabled)
    if (level === levels[0]?.level) return false

    // Other levels are disabled if the previous level hasn't been selected
    const previousLevel = levels.find(l => l.level === level - 1)
    if (!previousLevel) return true

    return !selections[previousLevel.level]
  }

  // Render loading state
  if (loading) {
    return (
      <div className="space-y-3">
        <Label>Hierarchy Assignment (Required)</Label>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-10 bg-[var(--border-subtle)] rounded-md" />
          ))}
        </div>
      </div>
    )
  }

  // Render error state
  if (fetchError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {fetchError}
        </AlertDescription>
      </Alert>
    )
  }

  // Render empty state
  if (levels.length === 0 || treeData.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No hierarchy configured. Please contact your administrator to set up organizational hierarchy.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-[14px] font-medium">
          {label} {required && <span className="text-[#FF6C5E]">*</span>}
        </Label>
        <p className="text-[12px] text-muted-foreground">
          {description || (required
            ? "Select the organizational hierarchy for cost allocation. All levels are required."
            : "Assign this cost to a specific part of your organization. Selection at any level is accepted."
          )}
        </p>
      </div>

      {/* Level selectors */}
      <div className="space-y-3">
        {levels.map((level, index) => {
          const options = getOptionsForLevel(level.level)
          const selectedValue = selections[level.level]?.entity_id
          const levelDisabled = isLevelDisabled(level.level)
          const isFirstLevel = index === 0
          const showOptionalLabel = !required && !isFirstLevel

          return (
            <div key={level.id} className="space-y-2">
              <Label htmlFor={`level-${level.level}`} className="text-sm flex items-center gap-2">
                {getLevelIcon(level.level_code)}
                <span>
                  {level.level_name}
                  {required && <span className="text-[#FF6C5E] ml-1">*</span>}
                  {showOptionalLabel && <span className="text-muted-foreground text-xs ml-1">(optional)</span>}
                </span>
              </Label>
              <Select
                value={selectedValue || ""}
                onValueChange={(val) => handleLevelChange(level.level, val)}
                disabled={levelDisabled}
              >
                <SelectTrigger
                  id={`level-${level.level}`}
                  className={`h-11 ${error && required && !selectedValue ? 'border-[#FF6C5E]' : ''}`}
                >
                  <SelectValue placeholder={
                    isFirstLevel && !required
                      ? "No allocation (org-level)"
                      : `Select ${level.level_name.toLowerCase()}...`
                  } />
                </SelectTrigger>
                <SelectContent>
                  {/* Show "keep at parent level" option for non-first levels in optional mode */}
                  {/* GAP-001 FIX: Use sentinel value instead of empty string for shadcn/ui compatibility */}
                  {!required && !isFirstLevel && (
                    <SelectItem value={NO_SELECTION_VALUE}>
                      <span className="text-muted-foreground">Keep at parent level</span>
                    </SelectItem>
                  )}
                  {/* Show "no allocation" for first level in optional mode */}
                  {/* GAP-001 FIX: Use sentinel value instead of empty string for shadcn/ui compatibility */}
                  {!required && isFirstLevel && (
                    <SelectItem value={NO_SELECTION_VALUE}>
                      <span className="text-muted-foreground">No allocation (org-level)</span>
                    </SelectItem>
                  )}
                  {options.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      No {level.level_name_plural.toLowerCase()} available
                    </div>
                  ) : (
                    options.map(node => (
                      <SelectItem key={node.entity_id} value={node.entity_id}>
                        <div className="flex items-center gap-2">
                          {getLevelIcon(node.level_code)}
                          <span>{node.entity_name}</span>
                          {node.owner_name && (
                            <span className="text-xs text-muted-foreground ml-auto">
                              ({node.owner_name})
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {/* Show arrow for non-last levels when selected */}
              {index < levels.length - 1 && selections[level.level] && (
                <div className="flex justify-center py-1">
                  <ChevronRight className="h-4 w-4 text-muted-foreground rotate-90" />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Selected path breadcrumb */}
      {value && value.path_names && (
        <div className="mt-4 p-3 bg-[#90FCA6]/5 border border-[#90FCA6]/20 rounded-lg">
          <div className="text-xs font-medium text-[#1a7a3a] mb-1">Selected Path:</div>
          <div className="text-sm text-foreground font-medium">{value.path_names}</div>
          <div className="text-xs text-muted-foreground mt-1">{value.path}</div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <Alert variant="destructive" className="mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
