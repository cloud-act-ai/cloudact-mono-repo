"use client"

/**
 * CostFilters - Combined filter bar for cost dashboards
 *
 * Features:
 * - Hierarchy filter (Department/Project/Team)
 * - Provider filter
 * - Category filter (GenAI/Cloud/SaaS)
 * - Consistent styling with cost dashboard design
 */

import React, { useState, useCallback } from "react"
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
  entity_type: "department" | "project" | "team"
  parent_id?: string | null
}

export interface CostFiltersState {
  department?: string
  project?: string
  team?: string
  providers: string[]
  categories: string[]
}

export interface CostFiltersProps {
  /** Current filter state */
  value: CostFiltersState
  /** Callback when filters change */
  onChange: (filters: CostFiltersState) => void
  /** Available hierarchy entities */
  hierarchy?: HierarchyEntity[]
  /** Available providers */
  availableProviders?: string[]
  /** Available categories */
  availableCategories?: string[]
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
  { id: "saas", name: "SaaS", color: "#FF6C5E" },
]

export function getDefaultFilters(): CostFiltersState {
  return {
    department: undefined,
    project: undefined,
    team: undefined,
    providers: [],
    categories: [],
  }
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

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "gap-2 h-9",
        "border-slate-200 hover:border-slate-300",
        hasValue ? "bg-[#90FCA6]/10 border-[#90FCA6]/50" : "",
        className
      )}
    >
      {icon}
      <span className={cn("text-sm", hasValue ? "font-medium" : "text-slate-600")}>
        {displayValue}
      </span>
      {hasValue && onClear && (
        <X
          className="h-3 w-3 ml-1 hover:text-red-500"
          onClick={(e) => {
            e.stopPropagation()
            onClear()
          }}
        />
      )}
      <ChevronDown className="h-4 w-4 text-slate-400" />
    </Button>
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
  const [hierarchyOpen, setHierarchyOpen] = useState(false)
  const [providerOpen, setProviderOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)

  // Parse hierarchy into nested structure
  const departments = hierarchy.filter((h) => h.entity_type === "department")
  const projects = hierarchy.filter((h) => h.entity_type === "project")
  const teams = hierarchy.filter((h) => h.entity_type === "team")

  // Filter projects/teams based on selected parent
  const filteredProjects = value.department
    ? projects.filter((p) => p.parent_id === value.department)
    : projects
  const filteredTeams = value.project
    ? teams.filter((t) => t.parent_id === value.project)
    : teams

  const categories = availableCategories
    ? availableCategories.map((c) => ({
        id: c,
        name: c.charAt(0).toUpperCase() + c.slice(1),
        color: DEFAULT_CATEGORIES.find((dc) => dc.id === c)?.color || "#94a3b8",
      }))
    : DEFAULT_CATEGORIES

  // Handlers
  const handleDepartmentChange = useCallback(
    (deptId: string | undefined) => {
      onChange({
        ...value,
        department: deptId,
        project: undefined, // Reset child selections
        team: undefined,
      })
    },
    [value, onChange]
  )

  const handleProjectChange = useCallback(
    (projectId: string | undefined) => {
      onChange({
        ...value,
        project: projectId,
        team: undefined, // Reset child selection
      })
    },
    [value, onChange]
  )

  const handleTeamChange = useCallback(
    (teamId: string | undefined) => {
      onChange({
        ...value,
        team: teamId,
      })
    },
    [value, onChange]
  )

  const handleProviderToggle = useCallback(
    (provider: string) => {
      const newProviders = value.providers.includes(provider)
        ? value.providers.filter((p) => p !== provider)
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

  // Get display names
  const selectedDeptName = departments.find((d) => d.entity_id === value.department)?.entity_name
  const selectedProjectName = projects.find((p) => p.entity_id === value.project)?.entity_name
  const selectedTeamName = teams.find((t) => t.entity_id === value.team)?.entity_name

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* Hierarchy Filter */}
      {hierarchy.length > 0 && (
        <Popover open={hierarchyOpen} onOpenChange={setHierarchyOpen}>
          <PopoverTrigger asChild>
            <div>
              <FilterButton
                label="Hierarchy"
                value={
                  selectedTeamName || selectedProjectName || selectedDeptName || undefined
                }
                icon={<Building2 className="h-4 w-4 text-slate-500" />}
                onClick={() => setHierarchyOpen(true)}
                onClear={
                  value.department || value.project || value.team
                    ? () => handleDepartmentChange(undefined)
                    : undefined
                }
                disabled={disabled || loading}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="start">
            <div className="space-y-4">
              {/* Department */}
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <Building2 className="h-3.5 w-3.5" />
                  Department
                </label>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => handleDepartmentChange(undefined)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                      !value.department
                        ? "bg-[#90FCA6]/20 text-[#1a7a3a] font-medium"
                        : "text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    All Departments
                  </button>
                  {departments.map((dept) => (
                    <button
                      key={dept.entity_id}
                      type="button"
                      onClick={() => handleDepartmentChange(dept.entity_id)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                        value.department === dept.entity_id
                          ? "bg-[#90FCA6]/20 text-[#1a7a3a] font-medium"
                          : "text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      {dept.entity_name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Project (shows when department selected) */}
              {value.department && filteredProjects.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <FolderKanban className="h-3.5 w-3.5" />
                    Project
                  </label>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => handleProjectChange(undefined)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                        !value.project
                          ? "bg-[#90FCA6]/20 text-[#1a7a3a] font-medium"
                          : "text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      All Projects
                    </button>
                    {filteredProjects.map((proj) => (
                      <button
                        key={proj.entity_id}
                        type="button"
                        onClick={() => handleProjectChange(proj.entity_id)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                          value.project === proj.entity_id
                            ? "bg-[#90FCA6]/20 text-[#1a7a3a] font-medium"
                            : "text-slate-600 hover:bg-slate-100"
                        )}
                      >
                        {proj.entity_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Team (shows when project selected) */}
              {value.project && filteredTeams.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <Users className="h-3.5 w-3.5" />
                    Team
                  </label>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => handleTeamChange(undefined)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                        !value.team
                          ? "bg-[#90FCA6]/20 text-[#1a7a3a] font-medium"
                          : "text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      All Teams
                    </button>
                    {filteredTeams.map((team) => (
                      <button
                        key={team.entity_id}
                        type="button"
                        onClick={() => handleTeamChange(team.entity_id)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                          value.team === team.entity_id
                            ? "bg-[#90FCA6]/20 text-[#1a7a3a] font-medium"
                            : "text-slate-600 hover:bg-slate-100"
                        )}
                      >
                        {team.entity_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Provider Filter */}
      {availableProviders.length > 0 && (
        <Popover open={providerOpen} onOpenChange={setProviderOpen}>
          <PopoverTrigger asChild>
            <div>
              <FilterButton
                label="Provider"
                value={value.providers}
                icon={<Layers className="h-4 w-4 text-slate-500" />}
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
                const isSelected = value.providers.includes(provider)
                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => handleProviderToggle(provider)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm",
                      "transition-colors",
                      isSelected
                        ? "bg-[#90FCA6]/20 text-[#1a7a3a] font-medium"
                        : "text-slate-700 hover:bg-slate-100"
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

      {/* Category Filter */}
      <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
        <PopoverTrigger asChild>
          <div>
            <FilterButton
              label="Category"
              value={value.categories}
              icon={<Filter className="h-4 w-4 text-slate-500" />}
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
                    "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm",
                    "transition-colors",
                    isSelected
                      ? "bg-[#90FCA6]/20 text-[#1a7a3a] font-medium"
                      : "text-slate-700 hover:bg-slate-100"
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

      {/* Clear All */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAllFilters}
          className="text-slate-500 hover:text-slate-700 h-9"
        >
          <X className="h-4 w-4 mr-1" />
          Clear all
        </Button>
      )}
    </div>
  )
}

// ============================================
// Time Range Filter (Standalone)
// ============================================

export interface TimeRangeFilterProps {
  /** Current selected time range */
  value: TimeRange
  /** Callback when time range changes */
  onChange: (range: TimeRange) => void
  /** Optional class name */
  className?: string
  /** Disabled state */
  disabled?: boolean
  /** Size variant */
  size?: "sm" | "default"
}

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; shortLabel: string }[] = [
  { value: "365", label: "Last 365 Days", shortLabel: "1Y" },
  { value: "ytd", label: "Year to Date", shortLabel: "YTD" },
  { value: "qtd", label: "This Quarter", shortLabel: "QTD" },
  { value: "90", label: "Last 90 Days", shortLabel: "90D" },
  { value: "mtd", label: "Month to Date", shortLabel: "MTD" },
  { value: "30", label: "Last 30 Days", shortLabel: "30D" },
  { value: "last_month", label: "Last Month", shortLabel: "LM" },
  { value: "14", label: "Last 14 Days", shortLabel: "14D" },
  { value: "7", label: "Last 7 Days", shortLabel: "7D" },
]

export function TimeRangeFilter({
  value,
  onChange,
  className,
  disabled = false,
  size = "default",
}: TimeRangeFilterProps) {
  const [open, setOpen] = useState(false)

  const selectedOption = TIME_RANGE_OPTIONS.find((opt) => opt.value === value) || TIME_RANGE_OPTIONS[2]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={size === "sm" ? "sm" : "default"}
          disabled={disabled}
          className={cn(
            "gap-2",
            size === "sm" ? "h-8 px-2.5" : "h-9 px-3",
            "border-slate-200 hover:border-slate-300",
            "bg-white hover:bg-slate-50",
            className
          )}
        >
          <Calendar className={cn("text-slate-500", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} />
          <span className={cn("font-medium text-slate-700", size === "sm" ? "text-xs" : "text-sm")}>
            {selectedOption.label}
          </span>
          <ChevronDown className={cn("text-slate-400", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1.5" align="end">
        <div className="space-y-0.5">
          {TIME_RANGE_OPTIONS.map((option) => {
            const isSelected = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm",
                  "transition-colors",
                  isSelected
                    ? "bg-[#90FCA6]/20 text-[#1a7a3a] font-medium"
                    : "text-slate-700 hover:bg-slate-100"
                )}
              >
                <span>{option.label}</span>
                {isSelected && <Check className="h-4 w-4" />}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Get rolling average window size based on time range
 */
export function getRollingAverageWindow(timeRange: TimeRange): number {
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
 * Get label for the rolling average based on time range
 */
export function getRollingAverageLabel(timeRange: TimeRange): string {
  switch (timeRange) {
    case "365":
    case "ytd":
      return "30-Day Avg"
    case "qtd":
    case "90":
      return "14-Day Avg"
    case "mtd":
    case "30":
    case "last_month":
      return "7-Day Avg"
    case "14":
    case "7":
      return "3-Day Avg"
    default:
      return "7-Day Avg"
  }
}
