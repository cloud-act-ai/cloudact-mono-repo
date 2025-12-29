"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
  AlertTriangle,
  CheckCircle2,
  Building2,
  FolderKanban,
  Users,
  Download,
  Upload,
  ChevronRight,
  ChevronDown,
  Network,
  FileDown,
  FileSpreadsheet,
} from "lucide-react"
import { logError } from "@/lib/utils"
import {
  getHierarchyTree,
  getDepartments,
  getProjects,
  getTeams,
  createDepartment,
  createProject,
  createTeam,
  deleteEntity,
  checkCanDelete,
  exportHierarchy,
  importHierarchy,
  type HierarchyEntity,
  type HierarchyTreeNode,
  type HierarchyTreeResponse,
  type HierarchyEntityType,
  type HierarchyCSVRow,
} from "@/actions/hierarchy"

interface CreateFormData {
  entity_id: string
  entity_name: string
  parent_id: string
  owner_name: string
  owner_email: string
  description: string
}

const initialFormData: CreateFormData = {
  entity_id: "",
  entity_name: "",
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
  const [departments, setDepartments] = useState<HierarchyEntity[]>([])
  const [projects, setProjects] = useState<HierarchyEntity[]>([])
  const [teams, setTeams] = useState<HierarchyEntity[]>([])

  // UI states
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set())
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState("tree")

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createType, setCreateType] = useState<HierarchyEntityType>("department")
  const [formData, setFormData] = useState<CreateFormData>(initialFormData)
  const [isSaving, setIsSaving] = useState(false)

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: HierarchyEntityType; id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null)

  // Import/Export states
  const [showImportSection, setShowImportSection] = useState(false)
  const [importData, setImportData] = useState<string>("")
  const [importFileName, setImportFileName] = useState<string>("")
  const [isImporting, setIsImporting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.title = "Hierarchy Settings | CloudAct.ai"
  }, [])

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [treeResult, deptsResult, projsResult, teamsResult] = await Promise.all([
        getHierarchyTree(orgSlug),
        getDepartments(orgSlug),
        getProjects(orgSlug),
        getTeams(orgSlug),
      ])

      if (treeResult.success && treeResult.data) {
        setTreeData(treeResult.data)
      }
      if (deptsResult.success && deptsResult.data) {
        setDepartments(deptsResult.data)
      }
      if (projsResult.success && projsResult.data) {
        setProjects(projsResult.data)
      }
      if (teamsResult.success && teamsResult.data) {
        setTeams(teamsResult.data)
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

  const toggleDeptExpand = (deptId: string) => {
    const newExpanded = new Set(expandedDepts)
    if (newExpanded.has(deptId)) {
      newExpanded.delete(deptId)
    } else {
      newExpanded.add(deptId)
    }
    setExpandedDepts(newExpanded)
  }

  const toggleProjectExpand = (projectId: string) => {
    const newExpanded = new Set(expandedProjects)
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId)
    } else {
      newExpanded.add(projectId)
    }
    setExpandedProjects(newExpanded)
  }

  const openCreateDialog = (type: HierarchyEntityType, parentId?: string) => {
    setCreateType(type)
    setFormData({ ...initialFormData, parent_id: parentId || "" })
    setError(null) // Clear any previous errors when opening dialog
    setCreateDialogOpen(true)
  }

  const handleCreate = async () => {
    setIsSaving(true)
    setError(null)

    try {
      let result
      if (createType === "department") {
        result = await createDepartment(orgSlug, {
          entity_id: formData.entity_id,
          entity_name: formData.entity_name,
          owner_name: formData.owner_name || undefined,
          owner_email: formData.owner_email || undefined,
          description: formData.description || undefined,
        })
      } else if (createType === "project") {
        result = await createProject(orgSlug, {
          entity_id: formData.entity_id,
          entity_name: formData.entity_name,
          dept_id: formData.parent_id,
          owner_name: formData.owner_name || undefined,
          owner_email: formData.owner_email || undefined,
          description: formData.description || undefined,
        })
      } else {
        result = await createTeam(orgSlug, {
          entity_id: formData.entity_id,
          entity_name: formData.entity_name,
          project_id: formData.parent_id,
          owner_name: formData.owner_name || undefined,
          owner_email: formData.owner_email || undefined,
          description: formData.description || undefined,
        })
      }

      if (result.success) {
        setSuccess(`${createType.charAt(0).toUpperCase() + createType.slice(1)} created successfully!`)
        setCreateDialogOpen(false)
        setFormData(initialFormData)
        await loadData()
        setTimeout(() => setSuccess(null), 4000)
      } else {
        setError(result.error || `Failed to create ${createType}`)
      }
    } catch {
      setError(`Failed to create ${createType}`)
    } finally {
      setIsSaving(false)
    }
  }

  const openDeleteDialog = async (type: HierarchyEntityType, id: string, name: string) => {
    setDeleteTarget({ type, id, name })
    setDeleteBlocked(null)

    // Check if deletion is blocked
    const result = await checkCanDelete(orgSlug, type, id)
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
      const result = await deleteEntity(orgSlug, deleteTarget.type, deleteTarget.id)
      if (result.success) {
        setSuccess(`${deleteTarget.type.charAt(0).toUpperCase() + deleteTarget.type.slice(1)} deleted successfully!`)
        setDeleteDialogOpen(false)
        setDeleteTarget(null)
        await loadData()
        setTimeout(() => setSuccess(null), 4000)
      } else {
        setError(result.error || `Failed to delete ${deleteTarget.type}`)
      }
    } catch {
      setError(`Failed to delete ${deleteTarget.type}`)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const result = await exportHierarchy(orgSlug)
      if (result.success && result.data) {
        // Download as CSV
        const blob = new Blob([result.data], { type: "text/csv" })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${orgSlug}_hierarchy.csv`
        a.click()
        window.URL.revokeObjectURL(url)
        setSuccess("Hierarchy exported successfully!")
        setTimeout(() => setSuccess(null), 4000)
      } else {
        setError(result.error || "Failed to export hierarchy")
      }
    } catch {
      setError("Failed to export hierarchy")
    } finally {
      setIsExporting(false)
    }
  }

  const handleDownloadTemplate = () => {
    const sampleTemplate = `entity_type,entity_id,entity_name,parent_id,owner_id,owner_name,owner_email,description
department,DEPT-ENG,Engineering,,,John Smith,john.smith@example.com,Engineering and product development
department,DEPT-SALES,Sales & Marketing,,,Jane Doe,jane.doe@example.com,Sales and marketing operations
project,PROJ-PLATFORM,Platform Team,DEPT-ENG,,Alice Johnson,alice@example.com,Core platform infrastructure
project,PROJ-MOBILE,Mobile Apps,DEPT-ENG,,Bob Williams,bob@example.com,iOS and Android applications
project,PROJ-CAMPAIGNS,Marketing Campaigns,DEPT-SALES,,Carol Brown,carol@example.com,Marketing campaign management
team,TEAM-BACKEND,Backend Engineers,PROJ-PLATFORM,,David Lee,david@example.com,Backend API development
team,TEAM-FRONTEND,Frontend Engineers,PROJ-PLATFORM,,Emma Wilson,emma@example.com,Frontend web development
team,TEAM-IOS,iOS Team,PROJ-MOBILE,,Frank Miller,frank@example.com,iOS app development
team,TEAM-ANDROID,Android Team,PROJ-MOBILE,,Grace Chen,grace@example.com,Android app development`

    const blob = new Blob([sampleTemplate], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "hierarchy_import_template.csv"
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith(".csv")) {
      setError("Please upload a CSV file")
      return
    }

    setImportFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setImportData(content)
    }
    reader.onerror = () => {
      setError("Failed to read file")
    }
    reader.readAsText(file)
  }

  const clearImportData = () => {
    setImportData("")
    setImportFileName("")
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleImport = async () => {
    if (!importData.trim()) {
      setError("Please paste CSV data to import")
      return
    }

    setIsImporting(true)
    setError(null)

    try {
      // Parse CSV
      const lines = importData.trim().split("\n")
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase())
      const rows: HierarchyCSVRow[] = []

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map(v => v.trim())
        const row: Record<string, string> = {}
        headers.forEach((h, idx) => {
          row[h] = values[idx] || ""
        })

        rows.push({
          entity_type: row.entity_type as HierarchyEntityType,
          entity_id: row.entity_id,
          entity_name: row.entity_name,
          parent_id: row.parent_id || undefined,
          owner_id: row.owner_id || undefined,
          owner_name: row.owner_name || undefined,
          owner_email: row.owner_email || undefined,
          description: row.description || undefined,
        })
      }

      const result = await importHierarchy(orgSlug, rows, "merge")
      if (result.success && result.data) {
        setSuccess(`Import completed: ${result.data.created} created, ${result.data.updated} updated`)
        setShowImportSection(false)
        clearImportData()
        await loadData()
        setTimeout(() => setSuccess(null), 4000)
      } else {
        setError(result.error || "Failed to import hierarchy")
      }
    } catch {
      setError("Failed to parse CSV data")
    } finally {
      setIsImporting(false)
    }
  }

  const renderTreeNode = (node: HierarchyTreeNode, level: number = 0) => {
    const isExpanded = node.entity_type === "department"
      ? expandedDepts.has(node.entity_id)
      : expandedProjects.has(node.entity_id)
    const hasChildren = node.children && node.children.length > 0

    const getIcon = () => {
      switch (node.entity_type) {
        case "department": return <Building2 className="h-4 w-4 text-[#1a7a3a]" />
        case "project": return <FolderKanban className="h-4 w-4 text-[#FF6C5E]" />
        case "team": return <Users className="h-4 w-4 text-slate-600" />
      }
    }

    const getIconBg = () => {
      switch (node.entity_type) {
        case "department": return "bg-[#90FCA6]/15"
        case "project": return "bg-[#FF6C5E]/10"
        case "team": return "bg-slate-100"
      }
    }

    const toggleExpand = () => {
      if (node.entity_type === "department") {
        toggleDeptExpand(node.entity_id)
      } else if (node.entity_type === "project") {
        toggleProjectExpand(node.entity_id)
      }
    }

    return (
      <div key={node.entity_id} className="select-none group/item">
        <div
          className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-[#90FCA6]/5 cursor-pointer transition-all duration-150"
          style={{ paddingLeft: `${level * 28 + 12}px` }}
        >
          {hasChildren ? (
            <button
              onClick={toggleExpand}
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
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${getIconBg()}`}>
            {getIcon()}
          </div>
          <span className="font-semibold text-[14px] text-slate-900">{node.entity_name}</span>
          <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
            {node.entity_id}
          </span>
          {node.owner_name && (
            <span className="text-[12px] text-slate-500 ml-auto mr-2">
              {node.owner_name}
            </span>
          )}
          <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
            {node.entity_type === "department" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg hover:bg-[#90FCA6]/15 hover:text-[#1a7a3a] transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  openCreateDialog("project", node.entity_id)
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
            {node.entity_type === "project" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg hover:bg-[#90FCA6]/15 hover:text-[#1a7a3a] transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  openCreateDialog("team", node.entity_id)
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg hover:bg-[#FF6C5E]/10 hover:text-[#FF6C5E] transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                openDeleteDialog(node.entity_type, node.entity_id, node.entity_name)
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
              style={{ left: `${level * 28 + 24}px` }}
            />
            {node.children.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-mint" />
      </div>
    )
  }

  return (
    <div className="space-y-5 sm:space-y-8 animate-in fade-in duration-500 px-4 sm:px-0">
      <div>
        <h1 className="text-[24px] sm:text-[32px] lg:text-[34px] font-bold text-slate-900 tracking-tight flex items-center gap-2.5 sm:gap-3">
          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl sm:rounded-2xl bg-gradient-mint flex items-center justify-center shadow-sm flex-shrink-0">
            <Network className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
          </div>
          <span className="leading-tight">Organizational Hierarchy</span>
        </h1>
        <p className="text-[13px] sm:text-[15px] text-muted-foreground mt-1.5 sm:mt-2 ml-[46px] sm:ml-[52px]">
          Manage departments, projects, and teams
        </p>
      </div>

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
        <Button
          onClick={() => openCreateDialog("department")}
          className="console-button-primary h-10 sm:h-11 px-4 sm:px-5 text-[13px] touch-manipulation"
        >
          <Plus className="mr-1.5 sm:mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Add Department</span>
          <span className="sm:hidden">Add Dept</span>
        </Button>
        <Button
          onClick={handleExport}
          disabled={isExporting}
          variant="outline"
          className="console-button-secondary h-10 sm:h-11 px-3 sm:px-5 text-[13px] touch-manipulation"
        >
          {isExporting ? (
            <Loader2 className="mr-1.5 sm:mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-1.5 sm:mr-2 h-4 w-4" />
          )}
          <span className="hidden sm:inline">Export CSV</span>
          <span className="sm:hidden">Export</span>
        </Button>
        <Button
          variant={showImportSection ? "default" : "outline"}
          className={showImportSection
            ? "h-10 sm:h-11 px-3 sm:px-5 text-[13px] bg-[#90FCA6] text-slate-900 hover:bg-[#6EE890] touch-manipulation"
            : "console-button-secondary h-10 sm:h-11 px-3 sm:px-5 text-[13px] touch-manipulation"
          }
          onClick={() => setShowImportSection(!showImportSection)}
        >
          <Upload className="mr-1.5 sm:mr-2 h-4 w-4" />
          <span className="hidden sm:inline">{showImportSection ? "Hide Import" : "Import CSV"}</span>
          <span className="sm:hidden">Import</span>
        </Button>
      </div>

      {/* Import Section - Inline */}
      {showImportSection && (
        <div className="console-table-card p-6 border-[#90FCA6]/30 bg-[#90FCA6]/5 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-4 mb-6">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#90FCA6]/30 to-[#B8FDCA]/30 flex items-center justify-center flex-shrink-0">
              <Upload className="h-6 w-6 text-[#1a7a3a]" />
            </div>
            <div>
              <h3 className="text-[18px] font-bold text-slate-900">Import Hierarchy from CSV</h3>
              <p className="text-[14px] text-slate-600 mt-1">
                Bulk import departments, projects, and teams. Upload a CSV file or paste data directly.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Upload & Template */}
            <div className="space-y-4">
              {/* Download Template */}
              <div className="p-4 rounded-xl bg-white border border-[#90FCA6]/20">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-[#90FCA6]/15 flex items-center justify-center flex-shrink-0">
                    <FileSpreadsheet className="h-4 w-4 text-[#1a7a3a]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[14px] font-semibold text-slate-900 mb-1">Start with a Template</h4>
                    <p className="text-[12px] text-slate-500 mb-3">
                      Download sample CSV with example hierarchy structure.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadTemplate}
                      className="h-8 px-3 border-[#90FCA6]/30 text-[#1a7a3a] hover:bg-[#90FCA6]/10 rounded-lg text-[13px]"
                    >
                      <FileDown className="h-3.5 w-3.5 mr-1.5" />
                      Download Template
                    </Button>
                  </div>
                </div>
              </div>

              {/* File Upload */}
              <div className="p-4 rounded-xl bg-white border border-slate-200">
                <Label className="text-[13px] font-semibold text-slate-700 mb-3 block">
                  Upload CSV File
                </Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="csv-file-input"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-[#90FCA6] hover:bg-[#90FCA6]/5 transition-colors"
                >
                  {importFileName ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileSpreadsheet className="h-5 w-5 text-[#1a7a3a]" />
                      <span className="text-[14px] font-medium text-slate-900">{importFileName}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          clearImportData()
                        }}
                        className="h-6 w-6 p-0 ml-2 hover:bg-[#FF6C5E]/10 hover:text-[#FF6C5E]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-[13px] text-slate-500">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">CSV files only</p>
                    </>
                  )}
                </div>
              </div>

              {/* CSV Format Reference */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-[11px] font-semibold text-slate-600 mb-2">CSV Format:</p>
                <code className="text-[10px] font-mono text-slate-500 break-all block mb-2">
                  entity_type,entity_id,entity_name,parent_id,owner_id,owner_name,owner_email,description
                </code>
                <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3 text-[#90FCA6]" />
                    <strong>department</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <FolderKanban className="h-3 w-3 text-[#FF6C5E]" />
                    <strong>project</strong> → parent_id = dept
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3 text-slate-600" />
                    <strong>team</strong> → parent_id = project
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column - Preview & Import */}
            <div className="space-y-4">
              <div>
                <Label className="text-[13px] font-semibold text-slate-700 mb-2 block">
                  CSV Data Preview
                </Label>
                <textarea
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  placeholder="Upload a file or paste CSV data here..."
                  className="w-full h-[240px] p-3 text-[12px] font-mono border border-slate-200 rounded-xl bg-white focus:border-[#90FCA6] focus:ring-2 focus:ring-[#90FCA6]/20 resize-none transition-colors"
                />
              </div>

              {/* Import Actions */}
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-slate-500">
                  {importData ? `${importData.split("\n").length - 1} rows to import` : "No data loaded"}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowImportSection(false)
                      clearImportData()
                    }}
                    className="h-9 px-4 rounded-lg"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleImport}
                    disabled={isImporting || !importData.trim()}
                    className="h-9 px-4 bg-[#90FCA6] text-slate-900 hover:bg-[#6EE890] rounded-lg font-semibold"
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-3.5 w-3.5" />
                        Import Hierarchy
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="metric-card shadow-sm border-l-4 border-l-mint p-3 sm:p-4">
          <div className="metric-card-content flex items-center gap-2 sm:gap-4">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg sm:rounded-xl bg-mint/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-mint" />
            </div>
            <div>
              <p className="text-[11px] sm:text-[13px] text-muted-foreground">Depts</p>
              <p className="text-[20px] sm:text-[28px] font-bold text-slate-900">{treeData?.total_departments || 0}</p>
            </div>
          </div>
        </div>
        <div className="metric-card shadow-sm border-l-4 border-l-coral p-3 sm:p-4">
          <div className="metric-card-content flex items-center gap-2 sm:gap-4">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg sm:rounded-xl bg-coral/10 flex items-center justify-center flex-shrink-0">
              <FolderKanban className="h-5 w-5 sm:h-6 sm:w-6 text-coral" />
            </div>
            <div>
              <p className="text-[11px] sm:text-[13px] text-muted-foreground">Projects</p>
              <p className="text-[20px] sm:text-[28px] font-bold text-slate-900">{treeData?.total_projects || 0}</p>
            </div>
          </div>
        </div>
        <div className="metric-card shadow-sm border-l-4 border-l-ca-blue p-3 sm:p-4">
          <div className="metric-card-content flex items-center gap-2 sm:gap-4">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg sm:rounded-xl bg-ca-blue/10 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-ca-blue" />
            </div>
            <div>
              <p className="text-[11px] sm:text-[13px] text-muted-foreground">Teams</p>
              <p className="text-[20px] sm:text-[28px] font-bold text-slate-900">{treeData?.total_teams || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content Tabs - Horizontally scrollable on mobile */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full sm:w-auto flex gap-1 bg-slate-50/80 border border-slate-200 p-1 rounded-xl overflow-x-auto scrollbar-hide whitespace-nowrap">
          <TabsTrigger
            value="tree"
            className="flex-shrink-0 rounded-lg text-[13px] font-semibold data-[state=active]:bg-[#90FCA6] data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all"
          >
            <Network className="h-4 w-4 mr-2 flex-shrink-0" />
            Tree View
          </TabsTrigger>
          <TabsTrigger
            value="departments"
            className="flex-shrink-0 rounded-lg text-[13px] font-semibold data-[state=active]:bg-[#90FCA6] data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all"
          >
            <Building2 className="h-4 w-4 mr-2 flex-shrink-0" />
            Departments
          </TabsTrigger>
          <TabsTrigger
            value="projects"
            className="flex-shrink-0 rounded-lg text-[13px] font-semibold data-[state=active]:bg-[#90FCA6] data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all"
          >
            <FolderKanban className="h-4 w-4 mr-2 flex-shrink-0" />
            Projects
          </TabsTrigger>
          <TabsTrigger
            value="teams"
            className="flex-shrink-0 rounded-lg text-[13px] font-semibold data-[state=active]:bg-[#90FCA6] data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all"
          >
            <Users className="h-4 w-4 mr-2 flex-shrink-0" />
            Teams
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tree" className="mt-6">
          <div className="console-table-card p-4">
            {treeData && treeData.departments.length > 0 ? (
              <div className="space-y-0.5">
                {treeData.departments.map(dept => renderTreeNode(dept))}
              </div>
            ) : (
              <div className="text-center py-16 text-slate-400">
                <div className="h-16 w-16 rounded-2xl bg-[#90FCA6]/10 flex items-center justify-center mx-auto mb-4">
                  <Network className="h-8 w-8 text-[#90FCA6]" />
                </div>
                <p className="text-[15px] font-semibold text-slate-600">No hierarchy defined yet</p>
                <p className="text-[13px] mt-1">Start by adding a department to organize your teams</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="departments" className="mt-6">
          <div className="console-table-card">
            <Table>
              <TableHeader>
                <TableRow className="console-table-header-row">
                  <TableHead className="console-table-header">ID</TableHead>
                  <TableHead className="console-table-header">Name</TableHead>
                  <TableHead className="console-table-header">Owner</TableHead>
                  <TableHead className="console-table-header">Projects</TableHead>
                  <TableHead className="console-table-header w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.length > 0 ? departments.map(dept => (
                  <TableRow key={dept.entity_id} className="console-table-row">
                    <TableCell className="console-table-cell font-mono text-[13px] text-slate-600">{dept.entity_id}</TableCell>
                    <TableCell className="console-table-cell font-semibold text-slate-900">{dept.entity_name}</TableCell>
                    <TableCell className="console-table-cell text-slate-600">{dept.owner_name || "—"}</TableCell>
                    <TableCell className="console-table-cell">
                      <span className="inline-flex items-center justify-center h-6 min-w-[24px] px-2 rounded-full bg-[#90FCA6]/15 text-[12px] font-semibold text-[#1a7a3a]">
                        {projects.filter(p => p.parent_id === dept.entity_id).length}
                      </span>
                    </TableCell>
                    <TableCell className="console-table-cell">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg hover:bg-[#90FCA6]/10 hover:text-[#1a7a3a] transition-colors"
                          onClick={() => openCreateDialog("project", dept.entity_id)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg hover:bg-[#FF6C5E]/10 hover:text-[#FF6C5E] transition-colors"
                          onClick={() => openDeleteDialog("department", dept.entity_id, dept.entity_name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-slate-400">
                      <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p className="text-[14px] font-medium">No departments yet</p>
                      <p className="text-[12px] mt-1">Add your first department to get started</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="projects" className="mt-6">
          <div className="console-table-card">
            <Table>
              <TableHeader>
                <TableRow className="console-table-header-row">
                  <TableHead className="console-table-header">ID</TableHead>
                  <TableHead className="console-table-header">Name</TableHead>
                  <TableHead className="console-table-header">Department</TableHead>
                  <TableHead className="console-table-header">Owner</TableHead>
                  <TableHead className="console-table-header">Teams</TableHead>
                  <TableHead className="console-table-header w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.length > 0 ? projects.map(proj => (
                  <TableRow key={proj.entity_id} className="console-table-row">
                    <TableCell className="console-table-cell font-mono text-[13px] text-slate-600">{proj.entity_id}</TableCell>
                    <TableCell className="console-table-cell font-semibold text-slate-900">{proj.entity_name}</TableCell>
                    <TableCell className="console-table-cell">
                      <span className="inline-flex items-center gap-1.5 text-slate-600">
                        <Building2 className="h-3.5 w-3.5 text-[#90FCA6]" />
                        {proj.dept_name || proj.parent_id}
                      </span>
                    </TableCell>
                    <TableCell className="console-table-cell text-slate-600">{proj.owner_name || "—"}</TableCell>
                    <TableCell className="console-table-cell">
                      <span className="inline-flex items-center justify-center h-6 min-w-[24px] px-2 rounded-full bg-[#FF6C5E]/10 text-[12px] font-semibold text-[#FF6C5E]">
                        {teams.filter(t => t.parent_id === proj.entity_id).length}
                      </span>
                    </TableCell>
                    <TableCell className="console-table-cell">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg hover:bg-[#90FCA6]/10 hover:text-[#1a7a3a] transition-colors"
                          onClick={() => openCreateDialog("team", proj.entity_id)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg hover:bg-[#FF6C5E]/10 hover:text-[#FF6C5E] transition-colors"
                          onClick={() => openDeleteDialog("project", proj.entity_id, proj.entity_name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                      <FolderKanban className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p className="text-[14px] font-medium">No projects yet</p>
                      <p className="text-[12px] mt-1">Create departments first, then add projects</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="teams" className="mt-6">
          <div className="console-table-card">
            <Table>
              <TableHeader>
                <TableRow className="console-table-header-row">
                  <TableHead className="console-table-header">ID</TableHead>
                  <TableHead className="console-table-header">Name</TableHead>
                  <TableHead className="console-table-header">Project</TableHead>
                  <TableHead className="console-table-header">Department</TableHead>
                  <TableHead className="console-table-header">Owner</TableHead>
                  <TableHead className="console-table-header w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.length > 0 ? teams.map(team => (
                  <TableRow key={team.entity_id} className="console-table-row">
                    <TableCell className="console-table-cell font-mono text-[13px] text-slate-600">{team.entity_id}</TableCell>
                    <TableCell className="console-table-cell font-semibold text-slate-900">{team.entity_name}</TableCell>
                    <TableCell className="console-table-cell">
                      <span className="inline-flex items-center gap-1.5 text-slate-600">
                        <FolderKanban className="h-3.5 w-3.5 text-[#FF6C5E]" />
                        {team.project_name || team.parent_id}
                      </span>
                    </TableCell>
                    <TableCell className="console-table-cell">
                      <span className="inline-flex items-center gap-1.5 text-slate-600">
                        <Building2 className="h-3.5 w-3.5 text-[#90FCA6]" />
                        {team.dept_name || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="console-table-cell text-slate-600">{team.owner_name || "—"}</TableCell>
                    <TableCell className="console-table-cell">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg hover:bg-[#FF6C5E]/10 hover:text-[#FF6C5E] transition-colors"
                        onClick={() => openDeleteDialog("team", team.entity_id, team.entity_name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                      <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p className="text-[14px] font-medium">No teams yet</p>
                      <p className="text-[12px] mt-1">Create projects first, then add teams</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Create {createType.charAt(0).toUpperCase() + createType.slice(1)}
            </DialogTitle>
            <DialogDescription>
              {createType === "department" && "Add a new department to your organization"}
              {createType === "project" && "Add a new project under the selected department"}
              {createType === "team" && "Add a new team under the selected project"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="entity_id">ID *</Label>
                <Input
                  id="entity_id"
                  value={formData.entity_id}
                  onChange={(e) => setFormData({ ...formData, entity_id: e.target.value.toUpperCase() })}
                  placeholder={`${createType.toUpperCase().slice(0, 4)}-001`}
                />
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
            {createType !== "department" && (
              <div className="space-y-2">
                <Label htmlFor="parent_id">
                  {createType === "project" ? "Department" : "Project"} *
                </Label>
                <Select
                  value={formData.parent_id}
                  onValueChange={(val) => setFormData({ ...formData, parent_id: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`Select ${createType === "project" ? "department" : "project"}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {(createType === "project" ? departments : projects).map(item => (
                      <SelectItem key={item.entity_id} value={item.entity_id}>
                        {item.entity_name} ({item.entity_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
              disabled={isSaving || !formData.entity_id || !formData.entity_name || (createType !== "department" && !formData.parent_id)}
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
            <DialogTitle className="text-coral">Delete {deleteTarget?.type}</DialogTitle>
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

    </div>
  )
}
