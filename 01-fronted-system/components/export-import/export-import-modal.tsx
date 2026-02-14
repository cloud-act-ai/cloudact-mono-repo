"use client"

/**
 * ExportImportModal - Reusable modal for CSV export/import operations
 *
 * Features:
 * - Export tab: Download current data as CSV
 * - Import tab: Upload CSV file, preview changes, confirm import
 * - Full sync mode: CSV becomes source of truth (creates, updates, deletes)
 * - Change preview before import
 */

import { useState, useCallback, useRef } from "react"
import {
  Download,
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Edit3,
  Plus,
  Loader2,
  X,
  FileUp,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"

// ============================================
// Types
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

export interface ImportResult {
  success: boolean
  created_count: number
  updated_count: number
  deleted_count: number
  unchanged_count: number
  errors: string[]
}

export interface ExportImportModalProps {
  /** Whether the modal is open */
  open: boolean
  /** Callback when modal closes */
  onClose: () => void
  /** Entity type being exported/imported (e.g., "hierarchy") */
  entityType: string
  /** Callback to export data - returns CSV content */
  onExport: () => Promise<string>
  /** Callback to preview import - returns preview data */
  onPreviewImport: (csvContent: string) => Promise<SyncPreview>
  /** Callback to execute import */
  onImport: (csvContent: string) => Promise<ImportResult>
  /** Optional filename for export (without extension) */
  exportFilename?: string
  /** ERR-002: Callback after successful import to refresh data */
  onImportSuccess?: () => void
}

// ============================================
// Component
// ============================================

export function ExportImportModal({
  open,
  onClose,
  entityType,
  onExport,
  onPreviewImport,
  onImport,
  exportFilename = "export",
  onImportSuccess,  // ERR-002: Callback to refresh data after import
}: ExportImportModalProps) {
  const [activeTab, setActiveTab] = useState<"export" | "import">("export")
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const [csvContent, setCsvContent] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [preview, setPreview] = useState<SyncPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [showAllErrors, setShowAllErrors] = useState(false)  // ERR-004: Expandable errors

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset state when modal opens/closes
  const handleClose = useCallback(() => {
    setCsvContent(null)
    setFileName(null)
    setPreview(null)
    setPreviewError(null)
    setImportResult(null)
    setImportError(null)
    setExportError(null)
    setActiveTab("export")
    onClose()
  }, [onClose])

  // Handle export
  const handleExport = async () => {
    setIsExporting(true)
    setExportError(null)
    try {
      const content = await onExport()
      // Download as file
      const blob = new Blob([content], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${exportFilename}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed")
    } finally {
      setIsExporting(false)
    }
  }

  // Handle file selection
  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      // Reset state
      setPreview(null)
      setPreviewError(null)
      setImportResult(null)
      setImportError(null)
      setShowAllErrors(false)

      // SEC-004: Basic client-side validation
      // Check file size (max 5MB)
      const MAX_FILE_SIZE = 5 * 1024 * 1024  // 5MB
      if (file.size > MAX_FILE_SIZE) {
        setPreviewError("File too large. Maximum size is 5MB.")
        event.target.value = ""
        return
      }

      // Read file content
      const reader = new FileReader()
      reader.onload = async (e) => {
        const content = e.target?.result as string

        // SEC-004: Basic CSV header validation
        const firstLine = content.split('\n')[0]?.trim() || ""
        const requiredHeaders = ["entity_id", "entity_name", "level", "level_code"]
        const hasHeaders = requiredHeaders.every(header =>
          firstLine.toLowerCase().includes(header.toLowerCase())
        )

        if (!hasHeaders) {
          setPreviewError(
            `Invalid CSV format. Missing required headers: ${requiredHeaders.join(", ")}`
          )
          return
        }

        setCsvContent(content)
        setFileName(file.name)

        // Auto-preview
        setIsPreviewing(true)
        try {
          const previewData = await onPreviewImport(content)
          setPreview(previewData)
        } catch (err) {
          setPreviewError(
            err instanceof Error ? err.message : "Preview failed"
          )
        } finally {
          setIsPreviewing(false)
        }
      }
      reader.readAsText(file)

      // Reset input so same file can be selected again
      event.target.value = ""
    },
    [onPreviewImport]
  )

  // Handle import
  const handleImport = async () => {
    if (!csvContent) return

    setIsImporting(true)
    setImportError(null)
    try {
      const result = await onImport(csvContent)
      setImportResult(result)
      if (!result.success && result.errors.length > 0) {
        setImportError(result.errors.join("; "))
      } else if (result.success) {
        // ERR-002: Call onImportSuccess to refresh data
        onImportSuccess?.()
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed")
    } finally {
      setIsImporting(false)
    }
  }

  // Clear file selection
  const handleClearFile = () => {
    setCsvContent(null)
    setFileName(null)
    setPreview(null)
    setPreviewError(null)
    setImportResult(null)
    setImportError(null)
    setShowAllErrors(false)  // Reset expandable errors
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[var(--cloudact-mint-dark)]" />
            Export / Import {entityType}
          </DialogTitle>
          <DialogDescription>
            Export current {entityType.toLowerCase()} to CSV or import from a
            CSV file. Import uses full sync mode where CSV becomes the source
            of truth.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as "export" | "import")
            // STATE-001: Clear preview state on tab switch to avoid stale data
            if (v === "export") {
              setPreview(null)
              setPreviewError(null)
              setShowAllErrors(false)
            }
          }}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export" className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </TabsTrigger>
            <TabsTrigger value="import" className="gap-2">
              <Upload className="h-4 w-4" />
              Import
            </TabsTrigger>
          </TabsList>

          {/* Export Tab */}
          <TabsContent value="export" className="space-y-4 mt-4">
            <div className="p-4 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]">
              <p className="text-sm text-[var(--text-secondary)]">
                Download all active {entityType.toLowerCase()} entities as a CSV
                file. You can edit this file and re-import to make bulk changes.
              </p>
            </div>

            {exportError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{exportError}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleExport}
                disabled={isExporting}
                className="bg-[var(--cloudact-mint)] hover:bg-[var(--cloudact-mint-dark)] text-[#1a7a3a]"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download CSV
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          {/* Import Tab */}
          <TabsContent value="import" className="space-y-4 mt-4">
            {/* File Upload - STATE-003: Disable during preview loading */}
            {!csvContent && (
              <div
                onClick={() => !isPreviewing && fileInputRef.current?.click()}
                className={cn(
                  "p-8 rounded-lg border-2 border-dashed transition-all",
                  isPreviewing
                    ? "cursor-not-allowed opacity-50 border-[var(--border-subtle)] bg-[var(--surface-secondary)]"
                    : "cursor-pointer hover:border-[var(--cloudact-mint-dark)] hover:bg-[var(--cloudact-mint)]/10 border-[var(--border-medium)] bg-[var(--surface-secondary)]"
                )}
              >
                <div className="flex flex-col items-center gap-2 text-center">
                  <FileUp className="h-10 w-10 text-[var(--text-muted)]" />
                  <p className="text-sm font-medium text-[var(--text-secondary)]">
                    Click to select a CSV file
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    or drag and drop here
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileSelect}
                  disabled={isPreviewing}
                  className="hidden"
                />
              </div>
            )}

            {/* File Selected */}
            {csvContent && (
              <div className="p-3 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[var(--text-tertiary)]" />
                  <span className="text-sm font-medium text-[var(--text-secondary)]">
                    {fileName}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFile}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Loading Preview */}
            {isPreviewing && (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
                <span className="ml-3 text-sm text-[var(--text-secondary)]">
                  Analyzing changes...
                </span>
              </div>
            )}

            {/* Preview Error */}
            {previewError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{previewError}</AlertDescription>
              </Alert>
            )}

            {/* Preview Results */}
            {preview && !isPreviewing && (
              <div className="space-y-4">
                {/* Validation Errors - ERR-004: Expandable error display */}
                {!preview.is_valid && preview.validation_errors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Validation errors found:</strong>
                      <ul className="mt-2 list-disc list-inside text-sm">
                        {(showAllErrors
                          ? preview.validation_errors
                          : preview.validation_errors.slice(0, 5)
                        ).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                      {preview.validation_errors.length > 5 && (
                        <button
                          type="button"
                          onClick={() => setShowAllErrors(!showAllErrors)}
                          className="mt-2 text-sm underline hover:no-underline"
                        >
                          {showAllErrors
                            ? "Show fewer"
                            : `Show all ${preview.validation_errors.length} errors`}
                        </button>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-center">
                    <Plus className="h-4 w-4 mx-auto text-green-600" />
                    <p className="text-base font-bold text-green-700">
                      {preview.summary.creates}
                    </p>
                    <p className="text-xs text-green-600">Create</p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-center">
                    <Edit3 className="h-4 w-4 mx-auto text-blue-600" />
                    <p className="text-base font-bold text-blue-700">
                      {preview.summary.updates}
                    </p>
                    <p className="text-xs text-blue-600">Update</p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-center">
                    <Trash2 className="h-4 w-4 mx-auto text-red-600" />
                    <p className="text-base font-bold text-red-700">
                      {preview.summary.deletes}
                    </p>
                    <p className="text-xs text-red-600">Delete</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-center">
                    <CheckCircle2 className="h-4 w-4 mx-auto text-[var(--text-tertiary)]" />
                    <p className="text-base font-bold text-[var(--text-secondary)]">
                      {preview.summary.unchanged}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)]">Unchanged</p>
                  </div>
                </div>

                {/* Changes Detail */}
                {preview.has_changes && preview.is_valid && (
                  <ScrollArea className="h-[200px] rounded-lg border">
                    <div className="p-3 space-y-2">
                      {preview.creates.map((item) => (
                        <PreviewItemRow
                          key={item.entity_id}
                          item={item}
                          action="create"
                        />
                      ))}
                      {preview.updates.map((item) => (
                        <PreviewItemRow
                          key={item.entity_id}
                          item={item}
                          action="update"
                        />
                      ))}
                      {preview.deletes.map((item) => (
                        <PreviewItemRow
                          key={item.entity_id}
                          item={item}
                          action="delete"
                        />
                      ))}
                    </div>
                  </ScrollArea>
                )}

                {/* No Changes */}
                {!preview.has_changes && preview.is_valid && (
                  <div className="p-4 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-center">
                    <CheckCircle2 className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-2" />
                    <p className="text-sm text-[var(--text-secondary)]">
                      No changes detected. The CSV matches the current data.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Import Result */}
            {importResult && (
              <Alert
                variant={importResult.success ? "default" : "destructive"}
                className={
                  importResult.success
                    ? "bg-green-50 border-green-200 text-green-800"
                    : undefined
                }
              >
                {importResult.success ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                <AlertDescription>
                  {importResult.success ? (
                    <>
                      Import complete: {importResult.created_count} created,{" "}
                      {importResult.updated_count} updated,{" "}
                      {importResult.deleted_count} deleted
                    </>
                  ) : (
                    <>
                      Import failed with {importResult.errors.length} error(s)
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {importError && !importResult && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleClose}>
                {importResult?.success ? "Done" : "Cancel"}
              </Button>
              {preview && preview.is_valid && preview.has_changes && !importResult && (
                <Button
                  onClick={handleImport}
                  disabled={isImporting}
                  className="bg-[var(--cloudact-mint)] hover:bg-[var(--cloudact-mint-dark)] text-[#1a7a3a]"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Confirm Import
                    </>
                  )}
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// ============================================
// Preview Item Row Component
// ============================================

function PreviewItemRow({
  item,
  action,
}: {
  item: SyncPreviewItem
  action: "create" | "update" | "delete"
}) {
  const colorMap = {
    create: "bg-green-100 text-green-800 border-green-200",
    update: "bg-blue-100 text-blue-800 border-blue-200",
    delete: "bg-red-100 text-red-800 border-red-200",
  }

  const iconMap = {
    create: <Plus className="h-3 w-3" />,
    update: <Edit3 className="h-3 w-3" />,
    delete: <Trash2 className="h-3 w-3" />,
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded bg-[var(--surface-secondary)]">
      <Badge variant="outline" className={cn("gap-1", colorMap[action])}>
        {iconMap[action]}
        {action}
      </Badge>
      <span className="font-mono text-xs text-[var(--text-secondary)]">{item.entity_id}</span>
      <span className="text-sm text-[var(--text-secondary)] truncate flex-1">
        {item.entity_name || "-"}
      </span>
      {item.level_code && (
        <Badge variant="secondary" className="text-xs">
          {item.level_code}
        </Badge>
      )}
    </div>
  )
}
