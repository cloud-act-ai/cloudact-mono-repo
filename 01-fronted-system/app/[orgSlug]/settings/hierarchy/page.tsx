"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  AlertTriangle,
  CheckCircle2,
  Building2,
  FolderKanban,
  Users,
  ChevronRight,
  ChevronDown,
  Network,
  Layers,
  FileText,
  type LucideIcon,
} from "lucide-react"
import { logError } from "@/lib/utils"
import {
  getHierarchyTree,
  getHierarchy,
  getHierarchyLevels,
  createEntity,
  updateEntity,
  deleteEntity,
  checkCanDelete,
  type HierarchyEntity,
  type HierarchyTreeNode,
  type HierarchyTreeResponse,
  type HierarchyLevel,
  type CreateEntityInput,
  type UpdateEntityInput,
} from "@/actions/hierarchy"

// Premium components
import { StatRow } from "@/components/ui/stat-row"
import { LoadingState } from "@/components/ui/loading-state"

// Export/Import
import { ExportImportModal, type SyncPreview, type ImportResult } from "@/components/export-import/export-import-modal"
import {
  exportHierarchy,
  previewHierarchyImport,
  importHierarchy,
} from "@/actions/hierarchy-export-import"

// Level icons mapping - supports both old (department/project/team) and new (c_suite/business_unit/function) level codes
const LEVEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  // Old level codes
  department: Building2,
  project: FolderKanban,
  team: Users,
  // New N-level codes
  c_suite: Building2,
  business_unit: FolderKanban,
  function: Users,
}

const LEVEL_COLORS: Record<string, { icon: string; bg: string; badge: string }> = {
  // Old level codes
  department: { icon: "text-[#1a7a3a]", bg: "bg-[#90FCA6]/15", badge: "bg-[#90FCA6]/15 text-[#1a7a3a]" },
  project: { icon: "text-[#FF6C5E]", bg: "bg-[#FF6C5E]/10", badge: "bg-[#FF6C5E]/10 text-[#FF6C5E]" },
  team: { icon: "text-slate-600", bg: "bg-slate-100", badge: "bg-slate-100 text-slate-600" },
  // New N-level codes
  c_suite: { icon: "text-[#1a7a3a]", bg: "bg-[#90FCA6]/15", badge: "bg-[#90FCA6]/15 text-[#1a7a3a]" },
  business_unit: { icon: "text-[#FF6C5E]", bg: "bg-[#FF6C5E]/10", badge: "bg-[#FF6C5E]/10 text-[#FF6C5E]" },
  function: { icon: "text-slate-600", bg: "bg-slate-100", badge: "bg-slate-100 text-slate-600" },
}

interface CreateFormData {
  entity_id: string
  entity_name: string
  level_code: string
  parent_id: string
  owner_name: string
  owner_email: string
  description: string
}

const initialFormData: CreateFormData = {
  entity_id: "",
  entity_name: "",
  level_code: "",
  parent_id: "",
  owner_name: "",
  owner_email: "",
  description: "",
}

export default function HierarchySettingsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Data states
  const [treeData, setTreeData] = useState<HierarchyTreeResponse | null>(null)
  const [allEntities, setAllEntities] = useState<HierarchyEntity[]>([])
  const [levels, setLevels] = useState<HierarchyLevel[]>([])

  // UI states
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState("tree")

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [formData, setFormData] = useState<CreateFormData>(initialFormData)
  const [isSaving, setIsSaving] = useState(false)

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ entityId: string; name: string; levelCode: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null)

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<HierarchyEntity | null>(null)
  const [editFormData, setEditFormData] = useState<{
    entity_name: string
    owner_name: string
    owner_email: string
    description: string
  }>({ entity_name: "", owner_name: "", owner_email: "", description: "" })
  const [isEditing, setIsEditing] = useState(false)

  // Export/Import dialog
  const [exportImportOpen, setExportImportOpen] = useState(false)

  useEffect(() => {
    document.title = "Hierarchy Settings | CloudAct.ai"
  }, [])

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [treeResult, entitiesResult, levelsResult] = await Promise.all([
        getHierarchyTree(orgSlug),
        getHierarchy(orgSlug),
        getHierarchyLevels(orgSlug),
      ])

      if (treeResult.success && treeResult.data) {
        setTreeData(treeResult.data)
      }
      if (entitiesResult.success && entitiesResult.data) {
        setAllEntities(entitiesResult.data.entities)
      }
      if (levelsResult.success && levelsResult.data) {
        setLevels(levelsResult.data.levels)
      }
    } catch (err) {
      const errorMessage = logError("HierarchySettingsPage:loadData", err)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [orgSlug])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Get entities by level_code
  const entitiesByLevel = useMemo(() => {
    const byLevel: Record<string, HierarchyEntity[]> = {}
    for (const entity of allEntities) {
      if (!byLevel[entity.level_code]) {
        byLevel[entity.level_code] = []
      }
      byLevel[entity.level_code].push(entity)
    }
    return byLevel
  }, [allEntities])

  // FIX BUG-003: Deduplicate tree nodes to prevent React key errors
  // The backend may return duplicate entities in the tree structure
  const deduplicatedTreeData = useMemo(() => {
    if (!treeData) return null

    const deduplicateNodes = (nodes: HierarchyTreeNode[]): HierarchyTreeNode[] => {
      const seen = new Set<string>()
      const result: HierarchyTreeNode[] = []

      for (const node of nodes) {
        if (!seen.has(node.entity_id)) {
          seen.add(node.entity_id)
          result.push({
            ...node,
            children: node.children ? deduplicateNodes(node.children) : [],
          })
        }
      }

      return result
    }

    return {
      ...treeData,
      roots: deduplicateNodes(treeData.roots),
    }
  }, [treeData])

  // Get potential parents for a given level
  const getParentsForLevel = useCallback((levelCode: string): HierarchyEntity[] => {
    const targetLevel = levels.find(l => l.level_code === levelCode)
    if (!targetLevel || targetLevel.parent_level === null) return []

    const parentLevelConfig = levels.find(l => l.level === targetLevel.parent_level)
    if (!parentLevelConfig) return []

    return entitiesByLevel[parentLevelConfig.level_code] || []
  }, [levels, entitiesByLevel])

  const toggleNodeExpand = (entityId: string) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(entityId)) {
      newExpanded.delete(entityId)
    } else {
      newExpanded.add(entityId)
    }
    setExpandedNodes(newExpanded)
  }

  const openCreateDialog = (levelCode: string, parentId?: string) => {
    setFormData({ ...initialFormData, level_code: levelCode, parent_id: parentId || "" })
    setError(null)
    setCreateDialogOpen(true)
  }

  const handleCreate = async () => {
    setIsSaving(true)
    setError(null)

    try {
      const input: CreateEntityInput = {
        entity_id: formData.entity_id || undefined,
        entity_name: formData.entity_name,
        level_code: formData.level_code,
        parent_id: formData.parent_id || null,
        owner_name: formData.owner_name || undefined,
        owner_email: formData.owner_email || undefined,
        description: formData.description || undefined,
      }

      const result = await createEntity(orgSlug, input)

      if (result.success) {
        const levelConfig = levels.find(l => l.level_code === formData.level_code)
        setSuccess(`${levelConfig?.level_name || formData.level_code} created successfully!`)
        setCreateDialogOpen(false)
        setFormData(initialFormData)
        await loadData()
        setTimeout(() => setSuccess(null), 4000)
      } else {
        setError(result.error || "Failed to create entity")
      }
    } catch {
      setError("Failed to create entity")
    } finally {
      setIsSaving(false)
    }
  }

  const openDeleteDialog = async (entityId: string, name: string, levelCode: string) => {
    setDeleteTarget({ entityId, name, levelCode })
    setDeleteBlocked(null)

    const result = await checkCanDelete(orgSlug, entityId)
    if (result.success && result.data && result.data.blocked) {
      setDeleteBlocked(result.data.reason)
    }

    setDeleteDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    setIsDeleting(true)
    setError(null)

    try {
      const result = await deleteEntity(orgSlug, deleteTarget.entityId)
      if (result.success) {
        const levelConfig = levels.find(l => l.level_code === deleteTarget.levelCode)
        setSuccess(`${levelConfig?.level_name || deleteTarget.levelCode} deleted successfully!`)
        setDeleteDialogOpen(false)
        setDeleteTarget(null)
        await loadData()
        setTimeout(() => setSuccess(null), 4000)
      } else {
        setError(result.error || "Failed to delete entity")
      }
    } catch {
      setError("Failed to delete entity")
    } finally {
      setIsDeleting(false)
    }
  }

  const openEditDialog = (entity: HierarchyEntity) => {
    setEditTarget(entity)
    setEditFormData({
      entity_name: entity.entity_name,
      owner_name: entity.owner_name || "",
      owner_email: entity.owner_email || "",
      description: entity.description || "",
    })
    setError(null)
    setEditDialogOpen(true)
  }

  const handleEdit = async () => {
    if (!editTarget) return

    setIsEditing(true)
    setError(null)

    try {
      const input: UpdateEntityInput = {
        entity_name: editFormData.entity_name,
        owner_name: editFormData.owner_name || undefined,
        owner_email: editFormData.owner_email || undefined,
        description: editFormData.description || undefined,
      }

      const result = await updateEntity(orgSlug, editTarget.entity_id, input)

      if (result.success) {
        const levelConfig = levels.find(l => l.level_code === editTarget.level_code)
        setSuccess(`${levelConfig?.level_name || editTarget.level_code} updated successfully!`)
        setEditDialogOpen(false)
        setEditTarget(null)
        await loadData()
        setTimeout(() => setSuccess(null), 4000)
      } else {
        setError(result.error || "Failed to update entity")
      }
    } catch {
      setError("Failed to update entity")
    } finally {
      setIsEditing(false)
    }
  }

  const getLevelIcon = (levelCode: string) => {
    const IconComponent = LEVEL_ICONS[levelCode] || Layers
    // MED-004 FIX: Ensure fallback includes all required properties (icon, bg, badge)
    const colors = LEVEL_COLORS[levelCode] || { icon: "text-slate-600", bg: "bg-slate-100", badge: "bg-slate-100 text-slate-600" }
    return { IconComponent, colors }
  }

  const renderTreeNode = (node: HierarchyTreeNode, depth: number = 0) => {
    const isExpanded = expandedNodes.has(node.entity_id)
    const hasChildren = node.children && node.children.length > 0
    const { IconComponent, colors } = getLevelIcon(node.level_code)

    // Find the child level for this node
    const currentLevelConfig = levels.find(l => l.level_code === node.level_code)
    const childLevel = currentLevelConfig ? levels.find(l => l.parent_level === currentLevelConfig.level) : null

    return (
      <div key={node.entity_id} className="select-none group/item">
        <div
          className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-[#90FCA6]/5 cursor-pointer transition-all duration-150"
          style={{ paddingLeft: `${depth * 28 + 12}px` }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggleNodeExpand(node.entity_id)}
              className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-slate-100 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
            </button>
          ) : (
            <div className="w-6" />
          )}
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${colors.bg}`}>
            <IconComponent className={`h-4 w-4 ${colors.icon}`} />
          </div>
          <span className="font-semibold text-[13px] text-slate-900">{node.entity_name}</span>
          <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
            {node.entity_id}
          </span>
          <span className="text-[11px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
            {node.level_name}
          </span>
          {node.owner_name && (
            <span className="text-[11px] text-slate-500 ml-auto mr-2">
              {node.owner_name}
            </span>
          )}
          <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
            {childLevel && !currentLevelConfig?.is_leaf && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg hover:bg-[#90FCA6]/15 hover:text-[#1a7a3a] transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  openCreateDialog(childLevel.level_code, node.entity_id)
                }}
                title={`Add ${childLevel.level_name}`}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg hover:bg-blue-500/10 hover:text-blue-600 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                const entity = allEntities.find(e => e.entity_id === node.entity_id)
                if (entity) openEditDialog(entity)
              }}
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg hover:bg-[#FF6C5E]/10 hover:text-[#FF6C5E] transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                openDeleteDialog(node.entity_id, node.entity_name, node.level_code)
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {isExpanded && hasChildren && (
          <div className="relative">
            <div
              className="absolute top-0 bottom-2 w-px bg-slate-200"
              style={{ left: `${depth * 28 + 24}px` }}
            />
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  // Build stats dynamically from treeData.stats
  const stats = useMemo(() => {
    if (!treeData?.stats) return []
    return levels
      .filter(l => l.is_active)
      .sort((a, b) => a.level - b.level)
      .map(level => {
        const { IconComponent } = getLevelIcon(level.level_code)
        const count = treeData.stats[level.level_code] || 0
        return {
          icon: IconComponent as LucideIcon,
          value: count,
          label: level.level_name_plural,
          color: level.level_code === "c_suite" ? "mint" as const :
                 level.level_code === "business_unit" ? "coral" as const : "blue" as const
        }
      })
  }, [treeData, levels])

  // Get the root level for the "Add" button
  const rootLevel = levels.find(l => l.parent_level === null)

  // Current selected level for create dialog
  const selectedLevelConfig = levels.find(l => l.level_code === formData.level_code)
  const requiresParent = selectedLevelConfig ? selectedLevelConfig.parent_level !== null : false
  const parentOptions = requiresParent ? getParentsForLevel(formData.level_code) : []
  // BUG-004 FIX: Check if entity_id is required based on level's id_auto_generate setting
  const requiresEntityId = selectedLevelConfig ? !selectedLevelConfig.id_auto_generate : true

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6 lg:space-y-8">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="h-11 w-11 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#90FCA6]/30 to-[#90FCA6]/10 flex items-center justify-center flex-shrink-0 shadow-sm border border-[#90FCA6]/20">
            <Network className="h-5 w-5 sm:h-7 sm:w-7 text-[#1a7a3a]" />
          </div>
          <div>
            <h1 className="text-[20px] sm:text-[24px] lg:text-[28px] font-bold text-slate-900 tracking-tight leading-tight">
              Organizational Hierarchy
            </h1>
            <p className="text-[12px] sm:text-[13px] text-slate-500 mt-1 sm:mt-2 max-w-lg">
              Manage your organizational structure
            </p>
          </div>
        </div>
        <LoadingState message="Loading hierarchy..." />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Premium Header */}
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="h-11 w-11 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#90FCA6]/30 to-[#90FCA6]/10 flex items-center justify-center flex-shrink-0 shadow-sm border border-[#90FCA6]/20">
          <Network className="h-5 w-5 sm:h-7 sm:w-7 text-[#1a7a3a]" />
        </div>
        <div>
          <h1 className="text-[20px] sm:text-[24px] lg:text-[28px] font-bold text-slate-900 tracking-tight leading-tight">
            Organizational Hierarchy
          </h1>
          <p className="text-[12px] sm:text-[13px] text-slate-500 mt-1 sm:mt-2 max-w-lg">
            Manage your organizational structure
          </p>
        </div>
      </div>

      {/* Stats Row */}
      {stats.length > 0 && (
        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-3 sm:p-5 shadow-sm">
          <StatRow stats={stats} size="md" />
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="border-coral/30 bg-coral/5 animate-in slide-in-from-top-2 duration-300">
          <AlertTriangle className="h-4 w-4 text-coral" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-mint/5 border-mint/30 animate-in slide-in-from-top-2 duration-300">
          <CheckCircle2 className="h-4 w-4 text-mint" />
          <AlertDescription className="text-foreground">{success}</AlertDescription>
        </Alert>
      )}

      {/* Action Bar */}
      <div className="flex flex-wrap gap-2 sm:gap-3">
        {levels.length > 0 && (
          <Button
            onClick={() => openCreateDialog("")}
            className="console-button-primary h-10 sm:h-11 px-4 sm:px-5 text-[12px] touch-manipulation"
          >
            <Plus className="mr-1.5 sm:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Add Entity</span>
            <span className="sm:hidden">Add</span>
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => setExportImportOpen(true)}
          className="h-10 sm:h-11 px-4 sm:px-5 text-[12px] touch-manipulation"
        >
          <FileText className="mr-1.5 sm:mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Export / Import</span>
          <span className="sm:hidden">CSV</span>
        </Button>
      </div>

      {/* Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="border-b border-slate-200">
          <TabsList className="w-full sm:w-auto flex gap-0.5 sm:gap-1 -mb-px h-auto bg-transparent p-0 overflow-x-auto scrollbar-hide">
            <TabsTrigger
              value="tree"
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-[11px] sm:text-[13px] font-medium whitespace-nowrap border-b-2 transition-all touch-manipulation rounded-none data-[state=inactive]:border-transparent data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-700 data-[state=inactive]:hover:border-slate-300 data-[state=inactive]:bg-transparent data-[state=active]:border-[var(--cloudact-mint-dark)] data-[state=active]:text-[#1a7a3a] data-[state=active]:bg-[var(--cloudact-mint)]/5 data-[state=active]:shadow-none"
            >
              <Network className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Org Structure</span>
              <span className="sm:hidden">Org</span>
            </TabsTrigger>
            {levels.filter(l => l.is_active).sort((a, b) => a.level - b.level).map(level => {
              const { IconComponent } = getLevelIcon(level.level_code)
              return (
                <TabsTrigger
                  key={level.level_code}
                  value={level.level_code}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-[11px] sm:text-[13px] font-medium whitespace-nowrap border-b-2 transition-all touch-manipulation rounded-none data-[state=inactive]:border-transparent data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-700 data-[state=inactive]:hover:border-slate-300 data-[state=inactive]:bg-transparent data-[state=active]:border-[var(--cloudact-mint-dark)] data-[state=active]:text-[#1a7a3a] data-[state=active]:bg-[var(--cloudact-mint)]/5 data-[state=active]:shadow-none"
                >
                  <IconComponent className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">{level.level_name_plural}</span>
                  <span className="sm:hidden">{level.level_name}</span>
                </TabsTrigger>
              )
            })}
          </TabsList>
        </div>

        <TabsContent value="tree" className="mt-6">
          <div className="console-table-card p-4">
            {deduplicatedTreeData && deduplicatedTreeData.roots.length > 0 ? (
              <div className="space-y-0.5">
                {deduplicatedTreeData.roots.map(root => renderTreeNode(root))}
              </div>
            ) : (
              <div className="text-center py-16 text-slate-400">
                <div className="h-16 w-16 rounded-2xl bg-[#90FCA6]/10 flex items-center justify-center mx-auto mb-4">
                  <Network className="h-8 w-8 text-[#90FCA6]" />
                </div>
                <p className="text-[14px] font-semibold text-slate-600">No hierarchy defined yet</p>
                <p className="text-[12px] mt-1">Start by adding {rootLevel?.level_name.toLowerCase() || "an entity"}</p>
              </div>
            )}
          </div>
        </TabsContent>

        {levels.filter(l => l.is_active).sort((a, b) => a.level - b.level).map(level => {
          const levelEntities = entitiesByLevel[level.level_code] || []
          const { IconComponent, colors } = getLevelIcon(level.level_code)
          const childLevel = levels.find(l => l.parent_level === level.level)

          return (
            <TabsContent key={level.level_code} value={level.level_code} className="mt-6">
              <div className="console-table-card">
                <Table>
                  <TableHeader>
                    <TableRow className="console-table-header-row">
                      <TableHead className="console-table-header">ID</TableHead>
                      <TableHead className="console-table-header">Name</TableHead>
                      <TableHead className="console-table-header">Path</TableHead>
                      <TableHead className="console-table-header">Owner</TableHead>
                      {childLevel && (
                        <TableHead className="console-table-header">{childLevel.level_name_plural}</TableHead>
                      )}
                      <TableHead className="console-table-header w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {levelEntities.length > 0 ? levelEntities.map(entity => {
                      const childCount = allEntities.filter(e => e.parent_id === entity.entity_id).length
                      return (
                        <TableRow key={entity.entity_id} className="console-table-row">
                          <TableCell className="console-table-cell font-mono text-[12px] text-slate-600">
                            {entity.entity_id}
                          </TableCell>
                          <TableCell className="console-table-cell font-semibold text-slate-900">
                            {entity.entity_name}
                          </TableCell>
                          <TableCell className="console-table-cell text-[11px] text-slate-500 font-mono">
                            {entity.path_names.join(" → ")}
                          </TableCell>
                          <TableCell className="console-table-cell text-slate-600">
                            {entity.owner_name || "—"}
                          </TableCell>
                          {childLevel && (
                            <TableCell className="console-table-cell">
                              <span className={`inline-flex items-center justify-center h-6 min-w-[24px] px-2 rounded-full ${colors.badge} text-[11px] font-semibold`}>
                                {childCount}
                              </span>
                            </TableCell>
                          )}
                          <TableCell className="console-table-cell">
                            <div className="flex gap-1">
                              {childLevel && !level.is_leaf && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg hover:bg-[#90FCA6]/10 hover:text-[#1a7a3a] transition-colors"
                                  onClick={() => openCreateDialog(childLevel.level_code, entity.entity_id)}
                                  title={`Add ${childLevel.level_name}`}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg hover:bg-blue-500/10 hover:text-blue-600 transition-colors"
                                onClick={() => openEditDialog(entity)}
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg hover:bg-[#FF6C5E]/10 hover:text-[#FF6C5E] transition-colors"
                                onClick={() => openDeleteDialog(entity.entity_id, entity.entity_name, entity.level_code)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    }) : (
                      <TableRow>
                        <TableCell colSpan={childLevel ? 6 : 5} className="text-center py-12 text-slate-400">
                          <IconComponent className="h-10 w-10 mx-auto mb-3 opacity-40" />
                          <p className="text-[13px] font-medium">No {level.level_name_plural.toLowerCase()} yet</p>
                          <p className="text-[11px] mt-1">
                            {level.parent_level ? `Add a ${levels.find(l => l.level === level.parent_level)?.level_name.toLowerCase() || "parent"} first` : `Add your first ${level.level_name.toLowerCase()}`}
                          </p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          )
        })}
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add New Entity
            </DialogTitle>
            <DialogDescription>
              Add a new entity to your organizational hierarchy
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Level selector - always shown */}
            <div className="space-y-2">
              <Label htmlFor="level_code">Level *</Label>
              <Select
                value={formData.level_code}
                onValueChange={(val) => setFormData({ ...formData, level_code: val, parent_id: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {levels.filter(l => l.is_active).sort((a, b) => a.level - b.level).map(level => (
                    <SelectItem key={level.level_code} value={level.level_code}>
                      <span className="flex items-center gap-2">
                        <span className="text-slate-400">L{level.level}</span>
                        {level.level_name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Parent selector - shown for non-root levels */}
            {formData.level_code && requiresParent && (
              <div className="space-y-2">
                <Label htmlFor="parent_id">
                  Parent ({levels.find(l => l.level === selectedLevelConfig?.parent_level)?.level_name || "Parent"}) *
                </Label>
                <Select
                  value={formData.parent_id}
                  onValueChange={(val) => setFormData({ ...formData, parent_id: val })}
                >
                  <SelectTrigger className={!formData.parent_id ? "border-amber-300" : ""}>
                    <SelectValue placeholder="Select parent (required)" />
                  </SelectTrigger>
                  <SelectContent>
                    {parentOptions.length > 0 ? parentOptions.map(parent => (
                      <SelectItem key={parent.entity_id} value={parent.entity_id}>
                        {parent.entity_name} ({parent.entity_id})
                      </SelectItem>
                    )) : (
                      <div className="px-3 py-2 text-sm text-slate-500">
                        No {levels.find(l => l.level === selectedLevelConfig?.parent_level)?.level_name_plural || "parents"} available. Create one first.
                      </div>
                    )}
                  </SelectContent>
                </Select>
                {requiresParent && !formData.parent_id && (
                  <p className="text-xs text-amber-600">Parent is required for {selectedLevelConfig?.level_name_plural || "this level"}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                {/* BUG-004 FIX: Show required indicator when id_auto_generate is false */}
                <Label htmlFor="entity_id">ID {requiresEntityId ? "*" : "(optional)"}</Label>
                <Input
                  id="entity_id"
                  value={formData.entity_id}
                  onChange={(e) => setFormData({ ...formData, entity_id: e.target.value.toUpperCase() })}
                  placeholder={selectedLevelConfig?.id_prefix ? `${selectedLevelConfig.id_prefix}001` : (requiresEntityId ? "Enter ID" : "Auto-generated")}
                  className={requiresEntityId && !formData.entity_id ? "border-amber-300" : ""}
                />
                {requiresEntityId && !formData.entity_id && (
                  <p className="text-xs text-amber-600">ID is required for {selectedLevelConfig?.level_name_plural || "this level"}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="entity_name">Name *</Label>
                <Input
                  id="entity_name"
                  value={formData.entity_name}
                  onChange={(e) => setFormData({ ...formData, entity_name: e.target.value })}
                  placeholder="Enter name"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="owner_name">Owner Name</Label>
                <Input
                  id="owner_name"
                  value={formData.owner_name}
                  onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner_email">Owner Email</Label>
                <Input
                  id="owner_email"
                  type="email"
                  value={formData.owner_email}
                  onChange={(e) => setFormData({ ...formData, owner_email: e.target.value })}
                  placeholder="john@example.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isSaving || !formData.entity_name || !formData.level_code || (requiresParent && !formData.parent_id) || (requiresEntityId && !formData.entity_id)}
              className="console-button-primary"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-coral">Delete {levels.find(l => l.level_code === deleteTarget?.levelCode)?.level_name || "Entity"}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteBlocked && (
            <Alert variant="destructive" className="border-coral/30 bg-coral/5">
              <AlertTriangle className="h-4 w-4 text-coral" />
              <AlertDescription>{deleteBlocked}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || !!deleteBlocked}
              className="bg-coral hover:bg-coral-dark"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit {levels.find(l => l.level_code === editTarget?.level_code)?.level_name || "Entity"}
            </DialogTitle>
            <DialogDescription>
              Update details for "{editTarget?.entity_name}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit_entity_id">ID</Label>
              <Input
                id="edit_entity_id"
                value={editTarget?.entity_id || ""}
                disabled
                className="bg-slate-50 text-slate-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_entity_name">Name *</Label>
              <Input
                id="edit_entity_name"
                value={editFormData.entity_name}
                onChange={(e) => setEditFormData({ ...editFormData, entity_name: e.target.value })}
                placeholder="Enter name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_owner_name">Owner Name</Label>
                <Input
                  id="edit_owner_name"
                  value={editFormData.owner_name}
                  onChange={(e) => setEditFormData({ ...editFormData, owner_name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_owner_email">Owner Email</Label>
                <Input
                  id="edit_owner_email"
                  type="email"
                  value={editFormData.owner_email}
                  onChange={(e) => setEditFormData({ ...editFormData, owner_email: e.target.value })}
                  placeholder="john@example.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_description">Description</Label>
              <Input
                id="edit_description"
                value={editFormData.description}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              disabled={isEditing || !editFormData.entity_name}
              className="console-button-primary"
            >
              {isEditing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Pencil className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export/Import Modal */}
      <ExportImportModal
        open={exportImportOpen}
        onClose={() => setExportImportOpen(false)}
        entityType="Hierarchy"
        exportFilename={`hierarchy_${orgSlug}`}
        onExport={async () => {
          const result = await exportHierarchy(orgSlug)
          if (!result.success) {
            throw new Error(result.error)
          }
          return result.data
        }}
        onPreviewImport={async (csvContent) => {
          const result = await previewHierarchyImport(orgSlug, csvContent)
          if (!result.success) {
            throw new Error(result.error)
          }
          return result.data as SyncPreview
        }}
        onImport={async (csvContent) => {
          const result = await importHierarchy(orgSlug, csvContent)
          if (!result.success) {
            throw new Error(result.error)
          }
          // Refresh data after import
          await loadData()
          return result.data as ImportResult
        }}
      />
    </div>
  )
}
