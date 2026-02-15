"use client"

/**
 * CostFilters - Combined filter bar for cost dashboards
 *
 * Features:
 * - Hierarchy filter (Department/Project/Team) - 3 separate dropdowns
 * - Provider filter
 * - Category filter (GenAI/Cloud/SaaS)
 * - Consistent styling with cost dashboard design
 */

import React, { useState, useCallback, useEffect } from "react"
import {
  Building2,
  FolderKanban,
  Users,
  ChevronDown,
  Check,
  X,
  Filter,
  Layers,
  Calendar,
  AlertCircle,
} from "lucide-react"
import type { TimeRange } from "@/contexts/cost-data-context"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

// ============================================
// Types
// ============================================

export interface HierarchyEntity {
  entity_id: string
  entity_name: string
  level_code: string // N-level: "department", "project", "team", or custom levels
  path?: string
  path_names?: string
  parent_id?: string | null
}

export interface CostFiltersState {
  // Keep legacy for backwards compatibility
  department?: string
  project?: string
  team?: string
  // New 5-field model (UI-001 FIX: All 5 fields for complete hierarchy support)
  hierarchyEntityId?: string
  hierarchyEntityName?: string
  hierarchyLevelCode?: string
  hierarchyPath?: string
  hierarchyPathNames?: string
  // Other fields
  providers: string[]
  categories: string[]
}

/** Category option with metadata */
export interface CategoryOption {
  id: string
  name: string
  color: string
  providerCount?: number
  totalCost?: number
}

export interface CostFiltersProps {
  /** Current filter state */
  value: CostFiltersState
  /** Callback when filters change */
  onChange: (filters: CostFiltersState) => void
  /** Available hierarchy entities */
  hierarchy?: HierarchyEntity[]
  /** Available providers (from backend) */
  availableProviders?: string[]
  /** Available categories (from backend with metadata) */
  availableCategories?: CategoryOption[]
  /** Optional class name */
  className?: string
  /** Disabled state */
  disabled?: boolean
  /** Loading state */
  loading?: boolean
}

// ============================================
// Default Values
// ============================================

const DEFAULT_CATEGORIES = [
  { id: "genai", name: "GenAI", color: "#10A37F" },
  { id: "cloud", name: "Cloud", color: "#4285F4" },
  { id: "subscription", name: "Subscription", color: "#FF6C5E" },
]

export function getDefaultFilters(): CostFiltersState {
  return {
    department: undefined,
    project: undefined,
    team: undefined,
    // UI-001 FIX: All 5 hierarchy fields for complete hierarchy support
    hierarchyEntityId: undefined,
    hierarchyEntityName: undefined,
    hierarchyLevelCode: undefined,
    hierarchyPath: undefined,
    hierarchyPathNames: undefined,
    providers: [],
    categories: [],
  }
}

// ============================================
// Security & Validation Helpers
// ============================================

/**
 * VAL-001 FIX: Validate entity ID format.
 * Entity IDs should be alphanumeric with optional hyphens/underscores.
 */
function isValidEntityId(entityId: string | undefined): boolean {
  if (!entityId || typeof entityId !== "string") return true // undefined is valid (no selection)
  // Allow alphanumeric, hyphens, underscores, max 100 chars
  return /^[a-zA-Z0-9_-]{1,100}$/.test(entityId)
}

/**
 * SEC-002 FIX: Sanitize text for display to prevent XSS.
 * Removes HTML tags and escapes dangerous characters.
 */
function sanitizeDisplayText(text: string | undefined | null): string {
  if (!text || typeof text !== "string") return ""
  // Remove HTML tags
  const noTags = text.replace(/<[^>]*>/g, "")
  // Escape special characters that could be used in XSS
  return noTags
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .slice(0, 200) // Limit length
}

// ============================================
// Sub-components
// ============================================

interface FilterButtonProps {
  label: string
  value?: string | string[]
  icon: React.ReactNode
  onClick: () => void
  onClear?: () => void
  disabled?: boolean
  className?: string
}

// FIX-011: Added aria-label for accessibility
function FilterButton({
  label,
  value,
  icon,
  onClick,
  onClear,
  disabled,
  className,
}: FilterButtonProps) {
  const hasValue = Array.isArray(value) ? value.length > 0 : !!value
  const displayValue = Array.isArray(value)
    ? value.length > 0
      ? `${value.length} selected`
      : label
    : value || label

  // FIX-011: Build accessible label
  const ariaLabel = hasValue
    ? `${label}: ${displayValue}. Click to change.`
    : `Select ${label}`

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      className={cn(
        "gap-2 h-10 sm:h-9 min-w-[100px] sm:min-w-[120px]",
        "border-[var(--border-subtle)] hover:border-[var(--border-medium)]",
        // FIX-006: Add disabled styling during loading
        disabled && "opacity-60 cursor-not-allowed",
        hasValue ? "bg-[#90FCA6]/10 border-[#90FCA6]/50" : "",
        className
      )}
    >
      {icon}
      <span className={cn("text-xs sm:text-sm truncate max-w-[80px] sm:max-w-[100px]", hasValue ? "font-medium" : "text-[var(--text-secondary)]")}>
        {displayValue}
      </span>
      {hasValue && onClear && (
        <X
          className="h-3 w-3 ml-1 hover:text-red-500 cursor-pointer flex-shrink-0"
          role="button"
          aria-label={`Clear ${label} filter`}
          onClick={(e) => {
            e.stopPropagation()
            onClear()
          }}
        />
      )}
      <ChevronDown className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />
    </Button>
  )
}

/** Empty state message for dropdowns */
function EmptyDropdownMessage({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-4 text-sm text-[var(--text-tertiary)]">
      <AlertCircle className="h-4 w-4 text-[var(--text-muted)]" />
      <span>{message}</span>
    </div>
  )
}

// ============================================
// Main Component
// ============================================

export function CostFilters({
  value,
  onChange,
  hierarchy = [],
  availableProviders = [],
  availableCategories,
  className,
  disabled = false,
  loading = false,
}: CostFiltersProps) {
  // Separate popover states for each hierarchy level
  const [cSuiteOpen, setCSuiteOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)
  const [providerOpen, setProviderOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)

  // Parse hierarchy into nested structure (N-level: uses level_code)
  // Support both old (department/project/team) and new (c_suite/business_unit/function) level codes
  const departments = hierarchy.filter((h) =>
    h.level_code === "department" || h.level_code === "c_suite"
  )
  const projects = hierarchy.filter((h) =>
    h.level_code === "project" || h.level_code === "business_unit"
  )
  const teams = hierarchy.filter((h) =>
    h.level_code === "team" || h.level_code === "function"
  )

  // FILTER-001 FIX: Cascading filter logic - show ALL items at each level when no parent selected
  // This allows viewing all data by default, and drilling down when filters applied
  // All items show → user selects C-Suite → only projects under that C-Suite show → etc.
  const filteredProjects = value.department
    ? projects.filter((p) => p.parent_id === value.department)
    : projects // Show ALL projects when no department selected (allows viewing all)

  const filteredTeams = value.project
    ? teams.filter((t) => t.parent_id === value.project)
    : value.department
      ? teams.filter((t) => {
          // If department selected but no project, show teams under any project of that department
          const projectIds = filteredProjects.map(p => p.entity_id)
          return projectIds.includes(t.parent_id || "")
        })
      : teams // Show ALL teams when no department/project selected

  // Use dynamic categories from backend
  // If availableCategories is undefined/null → use defaults (backward compat)
  // If availableCategories is [] (empty) → hide category filter (category-specific pages)
  const categories = availableCategories === undefined || availableCategories === null
    ? DEFAULT_CATEGORIES
    : availableCategories

  // Clear all hierarchy fields helper (UI-001 FIX: All 5 fields)
  const clearHierarchyFields = useCallback(() => ({
    department: undefined,
    project: undefined,
    team: undefined,
    hierarchyEntityId: undefined,
    hierarchyEntityName: undefined,
    hierarchyLevelCode: undefined,
    hierarchyPath: undefined,
    hierarchyPathNames: undefined,
  }), [])

  // Handlers with VAL-001 validation
  const handleDepartmentChange = useCallback(
    (deptId: string | undefined) => {
      // VAL-001 FIX: Validate entity ID format
      if (deptId && !isValidEntityId(deptId)) {
        console.warn(`[CostFilters] Invalid department ID format: ${deptId}`)
        return
      }
      // Find selected entity
      const selectedEntity = deptId ? departments.find(d => d.entity_id === deptId) : undefined

      // UI-001 FIX: Properly reset all child selections and sync all 5 hierarchy fields
      onChange({
        ...value,
        department: deptId,
        project: undefined, // Reset child selections
        team: undefined,
        // Sync all 5 hierarchy fields (UI-001 FIX)
        hierarchyEntityId: deptId,
        hierarchyEntityName: selectedEntity?.entity_name,
        hierarchyLevelCode: selectedEntity?.level_code,
        hierarchyPath: selectedEntity?.path,
        hierarchyPathNames: selectedEntity?.path_names,
      })
      setCSuiteOpen(false)
    },
    [value, onChange, departments]
  )

  const handleProjectChange = useCallback(
    (projectId: string | undefined) => {
      // VAL-001 FIX: Validate entity ID format
      if (projectId && !isValidEntityId(projectId)) {
        console.warn(`[CostFilters] Invalid project ID format: ${projectId}`)
        return
      }
      // Find selected entity
      const selectedEntity = projectId ? projects.find(p => p.entity_id === projectId) : undefined

      onChange({
        ...value,
        project: projectId,
        team: undefined, // Reset child selection
        // UI-001 FIX: Sync all 5 hierarchy fields
        hierarchyEntityId: projectId,
        hierarchyEntityName: selectedEntity?.entity_name,
        hierarchyLevelCode: selectedEntity?.level_code,
        hierarchyPath: selectedEntity?.path,
        hierarchyPathNames: selectedEntity?.path_names,
      })
      setProjectOpen(false)
    },
    [value, onChange, projects]
  )

  const handleTeamChange = useCallback(
    (teamId: string | undefined) => {
      // VAL-001 FIX: Validate entity ID format
      if (teamId && !isValidEntityId(teamId)) {
        console.warn(`[CostFilters] Invalid team ID format: ${teamId}`)
        return
      }
      // Find selected entity
      const selectedEntity = teamId ? teams.find(t => t.entity_id === teamId) : undefined

      onChange({
        ...value,
        team: teamId,
        // UI-001 FIX: Sync all 5 hierarchy fields
        hierarchyEntityId: teamId,
        hierarchyEntityName: selectedEntity?.entity_name,
        hierarchyLevelCode: selectedEntity?.level_code,
        hierarchyPath: selectedEntity?.path,
        hierarchyPathNames: selectedEntity?.path_names,
      })
      setTeamOpen(false)
    },
    [value, onChange, teams]
  )

  // Clear individual hierarchy level
  const handleClearDepartment = useCallback(() => {
    onChange({
      ...value,
      ...clearHierarchyFields(),
    })
  }, [value, onChange, clearHierarchyFields])

  const handleClearProject = useCallback(() => {
    const parentEntity = value.department ? departments.find(d => d.entity_id === value.department) : undefined
    onChange({
      ...value,
      project: undefined,
      team: undefined,
      // UI-001 FIX: Update all 5 hierarchy fields to point to department if selected, otherwise clear
      hierarchyEntityId: value.department,
      hierarchyEntityName: parentEntity?.entity_name,
      hierarchyLevelCode: parentEntity?.level_code,
      hierarchyPath: parentEntity?.path,
      hierarchyPathNames: parentEntity?.path_names,
    })
  }, [value, onChange, departments])

  const handleClearTeam = useCallback(() => {
    // UI-001 FIX: Find parent entity for all 5 hierarchy fields
    const parentEntity = value.project
      ? projects.find(p => p.entity_id === value.project)
      : value.department
        ? departments.find(d => d.entity_id === value.department)
        : undefined

    onChange({
      ...value,
      team: undefined,
      // UI-001 FIX: Update all 5 hierarchy fields to point to parent
      hierarchyEntityId: value.project || value.department,
      hierarchyEntityName: parentEntity?.entity_name,
      hierarchyLevelCode: parentEntity?.level_code,
      hierarchyPath: parentEntity?.path,
      hierarchyPathNames: parentEntity?.path_names,
    })
  }, [value, onChange, projects, departments])

  const handleProviderToggle = useCallback(
    (provider: string) => {
      // FILTER-006 fix: Case-insensitive provider matching
      const providerLower = provider.toLowerCase()
      const existingIndex = value.providers.findIndex(
        p => p.toLowerCase() === providerLower
      )

      const newProviders = existingIndex >= 0
        ? value.providers.filter((_, i) => i !== existingIndex)
        : [...value.providers, provider]
      onChange({ ...value, providers: newProviders })
    },
    [value, onChange]
  )

  const handleCategoryToggle = useCallback(
    (category: string) => {
      const newCategories = value.categories.includes(category)
        ? value.categories.filter((c) => c !== category)
        : [...value.categories, category]
      onChange({ ...value, categories: newCategories })
    },
    [value, onChange]
  )

  const clearAllFilters = useCallback(() => {
    onChange(getDefaultFilters())
  }, [onChange])

  const hasActiveFilters =
    value.department ||
    value.project ||
    value.team ||
    value.providers.length > 0 ||
    value.categories.length > 0

  // Get display names with SEC-002 XSS sanitization
  const selectedDeptName = sanitizeDisplayText(
    departments.find((d) => d.entity_id === value.department)?.entity_name
  ) || undefined
  const selectedProjectName = sanitizeDisplayText(
    projects.find((p) => p.entity_id === value.project)?.entity_name
  ) || undefined
  const selectedTeamName = sanitizeDisplayText(
    teams.find((t) => t.entity_id === value.team)?.entity_name
  ) || undefined

  // Determine labels based on level_code
  const cSuiteLabel = departments[0]?.level_code === "c_suite" ? "C-Suite" : "Department"
  const projectLabel = projects[0]?.level_code === "business_unit" ? "Business Unit" : "Project"
  const teamLabel = teams[0]?.level_code === "function" ? "Function" : "Team"

  // Check if hierarchy data exists
  const hasHierarchy = hierarchy.length > 0

  return (
    <div className={cn("flex flex-wrap items-center gap-2 sm:gap-3", className)}>
      {/* C-Suite / Department Filter (Level 1) - Always show if hierarchy exists */}
      {hasHierarchy && (
        <Popover open={cSuiteOpen} onOpenChange={setCSuiteOpen}>
          <PopoverTrigger asChild>
            <div>
              <FilterButton
                label={cSuiteLabel}
                value={selectedDeptName}
                icon={<Building2 className="h-4 w-4 text-[var(--text-tertiary)]" />}
                onClick={() => setCSuiteOpen(true)}
                onClear={value.department ? handleClearDepartment : undefined}
                disabled={disabled || loading}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-2" align="start">
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {departments.length === 0 ? (
                <EmptyDropdownMessage message={`No ${cSuiteLabel.toLowerCase()}s configured`} />
              ) : (
                departments.map((dept) => (
                  <button
                    key={dept.entity_id}
                    type="button"
                    onClick={() => handleDepartmentChange(dept.entity_id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 sm:py-2 rounded-lg text-sm transition-colors min-h-[44px] sm:min-h-0",
                      value.department === dept.entity_id
                        ? "bg-[#90FCA6]/20 text-[#1a7a3a] font-medium"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
                    )}
                  >
                    <span className="truncate block">{sanitizeDisplayText(dept.entity_name)}</span>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Project / Business Unit Filter (Level 2) - Always show if hierarchy exists */}
      {hasHierarchy && (
        <Popover open={projectOpen} onOpenChange={setProjectOpen}>
          <PopoverTrigger asChild>
            <div>
              <FilterButton
                label={projectLabel}
                value={selectedProjectName}
                icon={<FolderKanban className="h-4 w-4 text-[var(--text-tertiary)]" />}
                onClick={() => setProjectOpen(true)}
                onClear={value.project ? handleClearProject : undefined}
                disabled={disabled || loading}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-2" align="start">
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {filteredProjects.length === 0 ? (
                <EmptyDropdownMessage
                  message={value.department
                    ? `No ${projectLabel.toLowerCase()}s under selected ${cSuiteLabel.toLowerCase()}`
                    : `No ${projectLabel.toLowerCase()}s configured`
                  }
                />
              ) : (
                filteredProjects.map((proj) => (
                  <button
                    key={proj.entity_id}
                    type="button"
                    onClick={() => handleProjectChange(proj.entity_id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 sm:py-2 rounded-lg text-sm transition-colors min-h-[44px] sm:min-h-0",
                      value.project === proj.entity_id
                        ? "bg-[#90FCA6]/20 text-[#1a7a3a] font-medium"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
                    )}
                  >
                    <span className="truncate block">{sanitizeDisplayText(proj.entity_name)}</span>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Team / Function Filter (Level 3) - Always show if hierarchy exists */}
      {hasHierarchy && (
        <Popover open={teamOpen} onOpenChange={setTeamOpen}>
          <PopoverTrigger asChild>
            <div>
              <FilterButton
                label={teamLabel}
                value={selectedTeamName}
                icon={<Users className="h-4 w-4 text-[var(--text-tertiary)]" />}
                onClick={() => setTeamOpen(true)}
                onClear={value.team ? handleClearTeam : undefined}
                disabled={disabled || loading}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-2" align="start">
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {filteredTeams.length === 0 ? (
                <EmptyDropdownMessage
                  message={value.project
                    ? `No ${teamLabel.toLowerCase()}s under selected ${projectLabel.toLowerCase()}`
                    : value.department
                      ? `No ${teamLabel.toLowerCase()}s under selected ${cSuiteLabel.toLowerCase()}`
                      : `No ${teamLabel.toLowerCase()}s configured`
                  }
                />
              ) : (
                filteredTeams.map((team) => (
                  <button
                    key={team.entity_id}
                    type="button"
                    onClick={() => handleTeamChange(team.entity_id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 sm:py-2 rounded-lg text-sm transition-colors min-h-[44px] sm:min-h-0",
                      value.team === team.entity_id
                        ? "bg-[#90FCA6]/20 text-[#1a7a3a] font-medium"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
                    )}
                  >
                    <span className="truncate block">{sanitizeDisplayText(team.entity_name)}</span>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Separator between hierarchy and other filters - hidden on mobile */}
      {hasHierarchy && (availableProviders.length > 0 || categories.length > 0) && (
        <div className="hidden sm:block h-6 w-px bg-[var(--surface-secondary)] mx-1" />
      )}

      {/* Provider Filter */}
      {availableProviders.length > 0 && (
        <Popover open={providerOpen} onOpenChange={setProviderOpen}>
          <PopoverTrigger asChild>
            <div>
              <FilterButton
                label="Provider"
                value={value.providers}
                icon={<Layers className="h-4 w-4 text-[var(--text-tertiary)]" />}
                onClick={() => setProviderOpen(true)}
                onClear={
                  value.providers.length > 0
                    ? () => onChange({ ...value, providers: [] })
                    : undefined
                }
                disabled={disabled || loading}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {availableProviders.map((provider) => {
                // FILTER-007 FIX: Use case-insensitive matching for consistency with toggle
                const providerLower = provider.toLowerCase()
                const isSelected = value.providers.some(p => p.toLowerCase() === providerLower)
                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => handleProviderToggle(provider)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 sm:py-2 rounded-lg text-sm min-h-[44px] sm:min-h-0",
                      "transition-colors",
                      isSelected
                        ? "bg-[#90FCA6]/20 text-[#1a7a3a] font-medium"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
                    )}
                  >
                    <span>{provider}</span>
                    {isSelected && <Check className="h-4 w-4" />}
                  </button>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Category Filter - only show if categories available (hidden on category-specific pages) */}
      {categories.length > 0 && (
        <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
          <PopoverTrigger asChild>
            <div>
              <FilterButton
                label="Category"
                value={value.categories}
                icon={<Filter className="h-4 w-4 text-[var(--text-tertiary)]" />}
                onClick={() => setCategoryOpen(true)}
                onClear={
                  value.categories.length > 0
                    ? () => onChange({ ...value, categories: [] })
                    : undefined
                }
                disabled={disabled || loading}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="space-y-1">
              {categories.map((cat) => {
                const isSelected = value.categories.includes(cat.id)
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleCategoryToggle(cat.id)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 sm:py-2 rounded-lg text-sm min-h-[44px] sm:min-h-0",
                      "transition-colors",
                      isSelected
                        ? "bg-[#90FCA6]/20 text-[#1a7a3a] font-medium"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span>{cat.name}</span>
                    </div>
                    {isSelected && <Check className="h-4 w-4" />}
                  </button>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Clear All */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAllFilters}
          className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] h-10 sm:h-9 ml-1"
        >
          <X className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Clear all</span>
          <span className="sm:hidden">Clear</span>
        </Button>
      )}
    </div>
  )
}

// ============================================
// Time Range Filter (Standalone)
// ============================================

export interface CustomDateRange {
  startDate: string  // YYYY-MM-DD format
  endDate: string    // YYYY-MM-DD format
}

export interface TimeRangeFilterProps {
  /** Current selected time range */
  value: TimeRange
  /** Callback when time range changes */
  onChange: (range: TimeRange) => void
  /** Custom date range (when value is "custom") */
  customRange?: CustomDateRange
  /** Callback when custom date range changes */
  onCustomRangeChange?: (range: CustomDateRange) => void
  /** Optional class name */
  className?: string
  /** Disabled state */
  disabled?: boolean
  /** Size variant */
  size?: "sm" | "default"
}

/** Default time range for all cost pages - 365 days */
export const DEFAULT_TIME_RANGE: TimeRange = "365"

// FIX-018: Add displayName to components for React DevTools
CostFilters.displayName = "CostFilters"

export const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; shortLabel: string }[] = [
  { value: "365", label: "Last 365 Days", shortLabel: "1Y" },
  { value: "ytd", label: "Year to Date", shortLabel: "YTD" },
  { value: "qtd", label: "This Quarter", shortLabel: "QTD" },
  { value: "90", label: "Last 90 Days", shortLabel: "90D" },
  { value: "mtd", label: "Month to Date", shortLabel: "MTD" },
  { value: "30", label: "Last 30 Days", shortLabel: "30D" },
  { value: "last_month", label: "Last Month", shortLabel: "LM" },
  { value: "14", label: "Last 14 Days", shortLabel: "14D" },
  { value: "7", label: "Last 7 Days", shortLabel: "7D" },
  { value: "custom", label: "Custom Range", shortLabel: "Custom" },
]

/** Get display label for time range (including custom date format) */
export function getTimeRangeLabel(
  timeRange: TimeRange,
  customRange?: CustomDateRange
): string {
  if (timeRange === "custom" && customRange) {
    const start = new Date(customRange.startDate)
    const end = new Date(customRange.endDate)
    const formatDate = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    return `${formatDate(start)} - ${formatDate(end)}`
  }
  const option = TIME_RANGE_OPTIONS.find((opt) => opt.value === timeRange)
  return option?.label || "Select range"
}

export function TimeRangeFilter({
  value,
  onChange,
  customRange,
  onCustomRangeChange,
  className,
  disabled = false,
  size = "default",
}: TimeRangeFilterProps) {
  const [open, setOpen] = useState(false)
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const [tempStartDate, setTempStartDate] = useState(customRange?.startDate || "")
  const [tempEndDate, setTempEndDate] = useState(customRange?.endDate || "")

  // FIX-002: Sync temp dates when customRange prop changes
  useEffect(() => {
    if (customRange) {
      setTempStartDate(customRange.startDate)
      setTempEndDate(customRange.endDate)
    }
  }, [customRange])

  // Get display label
  const displayLabel = getTimeRangeLabel(value, customRange)

  // Handle preset selection
  const handlePresetSelect = (range: TimeRange) => {
    if (range === "custom") {
      setShowCustomPicker(true)
      // Initialize with last 30 days if no custom range
      if (!tempStartDate || !tempEndDate) {
        const today = new Date()
        const start = new Date(today)
        start.setDate(start.getDate() - 30)
        setTempStartDate(start.toISOString().split("T")[0])
        setTempEndDate(today.toISOString().split("T")[0])
      }
    } else {
      onChange(range)
      setShowCustomPicker(false)
      setOpen(false)
    }
  }

  // Apply custom range with validation (FILTER-008 fix)
  const handleApplyCustom = () => {
    if (!tempStartDate || !tempEndDate || !onCustomRangeChange) {
      return
    }

    // Validate dates are valid
    const startDate = new Date(tempStartDate)
    const endDate = new Date(tempEndDate)
    const today = new Date()
    today.setHours(23, 59, 59, 999) // End of today

    // Check for invalid dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.warn("[TimeRangeFilter] Invalid date format")
      return
    }

    // Ensure start <= end
    if (startDate > endDate) {
      console.warn("[TimeRangeFilter] Start date must be before end date")
      return
    }

    // Ensure end date is not in the future
    if (endDate > today) {
      console.warn("[TimeRangeFilter] End date cannot be in the future")
      return
    }

    // Apply the validated range
    onCustomRangeChange({ startDate: tempStartDate, endDate: tempEndDate })
    onChange("custom")
    setOpen(false)
    setShowCustomPicker(false)
  }

  // Cancel custom picker
  const handleCancelCustom = () => {
    setShowCustomPicker(false)
    setTempStartDate(customRange?.startDate || "")
    setTempEndDate(customRange?.endDate || "")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={size === "sm" ? "sm" : "default"}
          disabled={disabled}
          className={cn(
            "gap-2",
            size === "sm" ? "h-9 sm:h-8 px-2.5" : "h-10 sm:h-9 px-3",
            "border-[var(--border-subtle)] hover:border-[var(--border-medium)]",
            "bg-white hover:bg-[var(--surface-secondary)]",
            className
          )}
        >
          <Calendar className={cn("text-[var(--text-tertiary)]", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} />
          <span className={cn("font-medium text-[var(--text-secondary)]", size === "sm" ? "text-xs" : "text-sm")}>
            {displayLabel}
          </span>
          <ChevronDown className={cn("text-[var(--text-muted)]", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-1.5", showCustomPicker ? "w-72" : "w-48")} align="end">
        {!showCustomPicker ? (
          // Preset options
          <div className="space-y-0.5">
            {TIME_RANGE_OPTIONS.map((option) => {
              const isSelected = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handlePresetSelect(option.value)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 sm:py-2 rounded-md text-sm min-h-[44px] sm:min-h-0",
                    "transition-colors",
                    isSelected
                      ? "bg-[#90FCA6]/20 text-[#1a7a3a] font-medium"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
                  )}
                >
                  <span>{option.label}</span>
                  {isSelected && <Check className="h-4 w-4" />}
                </button>
              )
            })}
          </div>
        ) : (
          // Custom date picker
          <div className="space-y-3 p-2">
            <div className="text-sm font-medium text-[var(--text-secondary)]">Custom Date Range</div>

            <div className="space-y-2">
              <div>
                <label className="text-xs text-[var(--text-tertiary)] mb-1 block">Start Date</label>
                <input
                  type="date"
                  value={tempStartDate}
                  onChange={(e) => setTempStartDate(e.target.value)}
                  max={tempEndDate || undefined}
                  className={cn(
                    "w-full px-3 py-2 rounded-md border border-[var(--border-subtle)]",
                    "text-sm text-[var(--text-secondary)]",
                    "focus:outline-none focus:ring-2 focus:ring-[#90FCA6] focus:border-transparent"
                  )}
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)] mb-1 block">End Date</label>
                <input
                  type="date"
                  value={tempEndDate}
                  onChange={(e) => setTempEndDate(e.target.value)}
                  min={tempStartDate || undefined}
                  max={new Date().toISOString().split("T")[0]}
                  className={cn(
                    "w-full px-3 py-2 rounded-md border border-[var(--border-subtle)]",
                    "text-sm text-[var(--text-secondary)]",
                    "focus:outline-none focus:ring-2 focus:ring-[#90FCA6] focus:border-transparent"
                  )}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelCustom}
                className="flex-1 text-[var(--text-secondary)]"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleApplyCustom}
                disabled={!tempStartDate || !tempEndDate}
                className="flex-1 bg-[#90FCA6] hover:bg-[#6EE890] text-[var(--text-primary)]"
              >
                Apply
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * Get rolling average window size based on time range
 * For custom ranges, calculate based on number of days
 */
export function getRollingAverageWindow(
  timeRange: TimeRange,
  customRange?: CustomDateRange
): number {
  // Handle custom range
  if (timeRange === "custom" && customRange) {
    const start = new Date(customRange.startDate)
    const end = new Date(customRange.endDate)
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    if (days >= 180) return 30
    if (days >= 60) return 14
    if (days >= 21) return 7
    return 3
  }

  switch (timeRange) {
    case "365":
    case "ytd":
      return 30  // 30-day rolling avg
    case "qtd":
    case "90":
      return 14  // 14-day rolling avg
    case "mtd":
    case "30":
    case "last_month":
      return 7   // 7-day rolling avg
    case "14":
    case "7":
      return 3   // 3-day rolling avg
    default:
      return 7
  }
}

/**
 * Get label for the average overlay based on time range
 * Shows "Daily Avg" as an overall average for the selected period
 */
export function getRollingAverageLabel(
  _timeRange: TimeRange,
  _customRange?: CustomDateRange
): string {
  // User preference: Show simple "Daily Avg" label for overall period average
  // Parameters kept for API compatibility / future use
  return "Daily Avg"
}

// FIX-018: Add displayName to TimeRangeFilter
TimeRangeFilter.displayName = "TimeRangeFilter"
