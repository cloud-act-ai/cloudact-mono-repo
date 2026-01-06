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

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react"
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
        "gap-2 h-9",
        "border-slate-200 hover:border-slate-300",
        // FIX-006: Add disabled styling during loading
        disabled && "opacity-60 cursor-not-allowed",
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
          className="h-3 w-3 ml-1 hover:text-red-500 cursor-pointer"
          role="button"
          aria-label={`Clear ${label} filter`}
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

  // Use dynamic categories from backend
  // If availableCategories is undefined/null → use defaults (backward compat)
  // If availableCategories is [] (empty) → hide category filter (category-specific pages)
  const categories = availableCategories === undefined || availableCategories === null
    ? DEFAULT_CATEGORIES
    : availableCategories

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
                // FILTER-007 FIX: Use case-insensitive matching for consistency with toggle
                const providerLower = provider.toLowerCase()
                const isSelected = value.providers.some(p => p.toLowerCase() === providerLower)
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

      {/* Category Filter - only show if categories available (hidden on category-specific pages) */}
      {categories.length > 0 && (
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
      )}

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
    const formatDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
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
  }, [customRange?.startDate, customRange?.endDate])

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
            size === "sm" ? "h-8 px-2.5" : "h-9 px-3",
            "border-slate-200 hover:border-slate-300",
            "bg-white hover:bg-slate-50",
            className
          )}
        >
          <Calendar className={cn("text-slate-500", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} />
          <span className={cn("font-medium text-slate-700", size === "sm" ? "text-xs" : "text-sm")}>
            {displayLabel}
          </span>
          <ChevronDown className={cn("text-slate-400", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} />
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
        ) : (
          // Custom date picker
          <div className="space-y-3 p-2">
            <div className="text-sm font-medium text-slate-700">Custom Date Range</div>

            <div className="space-y-2">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Start Date</label>
                <input
                  type="date"
                  value={tempStartDate}
                  onChange={(e) => setTempStartDate(e.target.value)}
                  max={tempEndDate || undefined}
                  className={cn(
                    "w-full px-3 py-2 rounded-md border border-slate-200",
                    "text-sm text-slate-700",
                    "focus:outline-none focus:ring-2 focus:ring-[#90FCA6] focus:border-transparent"
                  )}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">End Date</label>
                <input
                  type="date"
                  value={tempEndDate}
                  onChange={(e) => setTempEndDate(e.target.value)}
                  min={tempStartDate || undefined}
                  max={new Date().toISOString().split("T")[0]}
                  className={cn(
                    "w-full px-3 py-2 rounded-md border border-slate-200",
                    "text-sm text-slate-700",
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
                className="flex-1 text-slate-600"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleApplyCustom}
                disabled={!tempStartDate || !tempEndDate}
                className="flex-1 bg-[#90FCA6] hover:bg-[#6EE890] text-slate-900"
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
  timeRange: TimeRange,
  customRange?: CustomDateRange
): string {
  // User preference: Show simple "Daily Avg" label for overall period average
  return "Daily Avg"
}

// FIX-018: Add displayName to TimeRangeFilter
TimeRangeFilter.displayName = "TimeRangeFilter"
