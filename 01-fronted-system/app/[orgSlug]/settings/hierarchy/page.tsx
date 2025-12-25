"use client"

import { useState, useEffect, useCallback } from "react"
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
  DialogTrigger,
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
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importData, setImportData] = useState<string>("")
  const [isImporting, setIsImporting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

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
    } catch {
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
        setImportDialogOpen(false)
        setImportData("")
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
        case "department": return <Building2 className="h-4 w-4 text-[#007A78]" />
        case "project": return <FolderKanban className="h-4 w-4 text-[#FF6E50]" />
        case "team": return <Users className="h-4 w-4 text-blue-500" />
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
      <div key={node.entity_id} className="select-none">
        <div
          className={`flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-[#007A78]/5 cursor-pointer transition-colors`}
          style={{ paddingLeft: `${level * 24 + 12}px` }}
        >
          {hasChildren ? (
            <button onClick={toggleExpand} className="p-0.5 hover:bg-[#007A78]/10 rounded">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          ) : (
            <div className="w-5" />
          )}
          {getIcon()}
          <span className="font-medium text-[15px]">{node.entity_name}</span>
          <Badge variant="outline" className="text-[11px] ml-2">
            {node.entity_id}
          </Badge>
          {node.owner_name && (
            <span className="text-[13px] text-muted-foreground ml-auto">
              {node.owner_name}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 ml-2 opacity-0 group-hover:opacity-100 hover:bg-[#FF6E50]/10 hover:text-[#FF6E50]"
            onClick={(e) => {
              e.stopPropagation()
              openDeleteDialog(node.entity_type, node.entity_id, node.entity_name)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          {node.entity_type === "department" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:bg-[#007A78]/10 hover:text-[#007A78]"
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
              className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:bg-[#007A78]/10 hover:text-[#007A78]"
              onClick={(e) => {
                e.stopPropagation()
                openCreateDialog("team", node.entity_id)
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {isExpanded && hasChildren && (
          <div>
            {node.children.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-[#007A78]" />
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-[32px] sm:text-[34px] font-bold text-black tracking-tight flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#007A78] to-[#005F5D] flex items-center justify-center shadow-sm">
            <Network className="h-5 w-5 text-white" />
          </div>
          Organizational Hierarchy
        </h1>
        <p className="text-[15px] text-muted-foreground mt-2 ml-[52px]">
          Manage departments, projects, and teams for cost allocation
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="border-[#FF6E50]/30 bg-[#FF6E50]/5 animate-in slide-in-from-top-2 duration-300">
          <AlertTriangle className="h-4 w-4 text-[#FF6E50]" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-[#007A78]/5 border-[#007A78]/30 animate-in slide-in-from-top-2 duration-300">
          <CheckCircle2 className="h-4 w-4 text-[#007A78]" />
          <AlertDescription className="text-foreground">{success}</AlertDescription>
        </Alert>
      )}

      {/* Action Bar */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => openCreateDialog("department")}
          className="console-button-primary h-11 px-5"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Department
        </Button>
        <Button
          onClick={handleExport}
          disabled={isExporting}
          variant="outline"
          className="console-button-secondary h-11 px-5"
        >
          {isExporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Export CSV
        </Button>
        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="console-button-secondary h-11 px-5">
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Import Hierarchy</DialogTitle>
              <DialogDescription>
                Paste CSV data to import hierarchy entities. Format: entity_type,entity_id,entity_name,parent_id,owner_id,owner_name,owner_email,description
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <textarea
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
                placeholder="entity_type,entity_id,entity_name,parent_id,owner_id,owner_name,owner_email,description&#10;department,DEPT-001,Engineering,,,John Doe,john@example.com,Engineering department"
                className="w-full h-48 p-3 text-[14px] font-mono border border-[#E5E5EA] rounded-xl focus:border-[#007A78] focus:ring-2 focus:ring-[#007A78]/20"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={isImporting} className="console-button-primary">
                {isImporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  "Import"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="metric-card shadow-sm border-l-4 border-l-[#007A78]">
          <div className="metric-card-content flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-[#007A78]/10 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-[#007A78]" />
            </div>
            <div>
              <p className="text-[13px] text-muted-foreground">Departments</p>
              <p className="text-[28px] font-bold text-black">{treeData?.total_departments || 0}</p>
            </div>
          </div>
        </div>
        <div className="metric-card shadow-sm border-l-4 border-l-[#FF6E50]">
          <div className="metric-card-content flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-[#FF6E50]/10 flex items-center justify-center">
              <FolderKanban className="h-6 w-6 text-[#FF6E50]" />
            </div>
            <div>
              <p className="text-[13px] text-muted-foreground">Projects</p>
              <p className="text-[28px] font-bold text-black">{treeData?.total_projects || 0}</p>
            </div>
          </div>
        </div>
        <div className="metric-card shadow-sm border-l-4 border-l-blue-500">
          <div className="metric-card-content flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Users className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-[13px] text-muted-foreground">Teams</p>
              <p className="text-[28px] font-bold text-black">{treeData?.total_teams || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full sm:w-auto bg-white border border-border">
          <TabsTrigger value="tree" className="data-[state=active]:bg-[#007A78]/10 data-[state=active]:text-[#007A78]">
            <Network className="h-4 w-4 mr-2" />
            Tree View
          </TabsTrigger>
          <TabsTrigger value="departments" className="data-[state=active]:bg-[#007A78]/10 data-[state=active]:text-[#007A78]">
            <Building2 className="h-4 w-4 mr-2" />
            Departments
          </TabsTrigger>
          <TabsTrigger value="projects" className="data-[state=active]:bg-[#007A78]/10 data-[state=active]:text-[#007A78]">
            <FolderKanban className="h-4 w-4 mr-2" />
            Projects
          </TabsTrigger>
          <TabsTrigger value="teams" className="data-[state=active]:bg-[#007A78]/10 data-[state=active]:text-[#007A78]">
            <Users className="h-4 w-4 mr-2" />
            Teams
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tree" className="mt-6">
          <div className="metric-card shadow-sm">
            <div className="metric-card-content py-2">
              {treeData && treeData.departments.length > 0 ? (
                <div className="space-y-1">
                  {treeData.departments.map(dept => renderTreeNode(dept))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Network className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-[15px]">No hierarchy defined yet</p>
                  <p className="text-[13px] mt-1">Start by adding a department</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="departments" className="mt-6">
          <div className="metric-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Projects</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.length > 0 ? departments.map(dept => (
                  <TableRow key={dept.entity_id}>
                    <TableCell className="font-mono text-[13px]">{dept.entity_id}</TableCell>
                    <TableCell className="font-medium">{dept.entity_name}</TableCell>
                    <TableCell>{dept.owner_name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {projects.filter(p => p.parent_id === dept.entity_id).length}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-[#007A78]/10 hover:text-[#007A78]"
                          onClick={() => openCreateDialog("project", dept.entity_id)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-[#FF6E50]/10 hover:text-[#FF6E50]"
                          onClick={() => openDeleteDialog("department", dept.entity_id, dept.entity_name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No departments yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="projects" className="mt-6">
          <div className="metric-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Teams</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.length > 0 ? projects.map(proj => (
                  <TableRow key={proj.entity_id}>
                    <TableCell className="font-mono text-[13px]">{proj.entity_id}</TableCell>
                    <TableCell className="font-medium">{proj.entity_name}</TableCell>
                    <TableCell>{proj.dept_name || proj.parent_id}</TableCell>
                    <TableCell>{proj.owner_name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {teams.filter(t => t.parent_id === proj.entity_id).length}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-[#007A78]/10 hover:text-[#007A78]"
                          onClick={() => openCreateDialog("team", proj.entity_id)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-[#FF6E50]/10 hover:text-[#FF6E50]"
                          onClick={() => openDeleteDialog("project", proj.entity_id, proj.entity_name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No projects yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="teams" className="mt-6">
          <div className="metric-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.length > 0 ? teams.map(team => (
                  <TableRow key={team.entity_id}>
                    <TableCell className="font-mono text-[13px]">{team.entity_id}</TableCell>
                    <TableCell className="font-medium">{team.entity_name}</TableCell>
                    <TableCell>{team.project_name || team.parent_id}</TableCell>
                    <TableCell>{team.dept_name || "-"}</TableCell>
                    <TableCell>{team.owner_name || "-"}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-[#FF6E50]/10 hover:text-[#FF6E50]"
                        onClick={() => openDeleteDialog("team", team.entity_id, team.entity_name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No teams yet
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
            <DialogTitle className="text-[#FF6E50]">Delete {deleteTarget?.type}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteBlocked && (
            <Alert variant="destructive" className="border-[#FF6E50]/30 bg-[#FF6E50]/5">
              <AlertTriangle className="h-4 w-4 text-[#FF6E50]" />
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
              className="bg-[#FF6E50] hover:bg-[#E55A3C]"
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
