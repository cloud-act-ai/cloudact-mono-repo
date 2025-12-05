"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { Cloud, Loader2, Check, AlertCircle, ArrowLeft, Upload, FileJson, X, Key, Clock, Shield, RefreshCw, Trash2 } from "lucide-react"
import Link from "next/link"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
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
  getIntegrations,
  setupIntegration,
  validateIntegration,
  deleteIntegration,
} from "@/actions/integrations"

interface IntegrationStatus {
  provider: string
  status: "VALID" | "INVALID" | "PENDING" | "NOT_CONFIGURED"
  credential_name?: string
  last_validated_at?: string
  last_error?: string
  created_at?: string
}

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; text: string; className?: string }> = {
    VALID: { variant: "default", text: "Connected", className: "bg-green-500/10 text-green-600 border-green-500/20" },
    INVALID: { variant: "destructive", text: "Invalid" },
    PENDING: { variant: "secondary", text: "Validating..." },
    NOT_CONFIGURED: { variant: "outline", text: "Not Configured" },
  }

  const config = variants[status] || variants.NOT_CONFIGURED

  return (
    <Badge variant={config.variant} className={config.className}>
      {status === "VALID" && <Check className="h-3 w-3 mr-1" />}
      {status === "INVALID" && <X className="h-3 w-3 mr-1" />}
      {status === "PENDING" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
      {config.text}
    </Badge>
  )
}

export default function GCPIntegrationPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [integration, setIntegration] = useState<IntegrationStatus | undefined>()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Upload state
  const [showUpload, setShowUpload] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [parsedSA, setParsedSA] = useState<{ project_id?: string; client_email?: string } | null>(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const status = integration?.status || "NOT_CONFIGURED"
  const isConfigured = status !== "NOT_CONFIGURED"

  // Load integration status
  const loadIntegration = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const result = await getIntegrations(orgSlug)

    if (result.success && result.integrations) {
      const gcpIntegration = result.integrations.integrations["GCP_SA"]
      setIntegration(gcpIntegration)
    } else {
      setError(result.error || "Failed to load integration status")
    }

    setIsLoading(false)
  }, [orgSlug])

  useEffect(() => {
    loadIntegration()
  }, [loadIntegration])

  // Clear success message after delay (15 seconds for better visibility)
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 15000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  // Clear error message after delay (20 seconds - longer for errors so users can read)
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 20000)
      return () => clearTimeout(timer)
    }
  }, [error])

  // Handle file selection
  const handleFileSelect = async (file: File) => {
    setError(null)

    if (!file.name.endsWith('.json')) {
      setError("Please upload a JSON file")
      return
    }

    if (file.size > 50000) { // 50KB limit for SA JSON
      setError("File too large. Service Account JSON should be under 50KB")
      return
    }

    try {
      const content = await file.text()
      const parsed = JSON.parse(content)

      // Validate it's a service account JSON
      if (parsed.type !== "service_account") {
        setError("Invalid file: This doesn't appear to be a GCP Service Account JSON")
        return
      }

      if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
        setError("Invalid Service Account JSON: Missing required fields (project_id, client_email, or private_key)")
        return
      }

      setUploadedFile(file)
      setFileContent(content)
      setParsedSA({
        project_id: parsed.project_id,
        client_email: parsed.client_email,
      })
    } catch {
      setError("Invalid JSON file. Please upload a valid Service Account JSON.")
    }
  }

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  // Clear uploaded file
  const clearFile = () => {
    setUploadedFile(null)
    setFileContent(null)
    setParsedSA(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  // Handle setup - calls backend pipeline to encrypt, store, and validate
  const handleSetup = async () => {
    if (!fileContent) return

    setError(null)
    setSuccessMessage(null)
    setUploadLoading(true)

    try {
      const result = await setupIntegration({
        orgSlug,
        provider: "gcp",
        credential: fileContent,
      })

      if (result.success) {
        setSuccessMessage(
          result.validationStatus === "VALID"
            ? "GCP Service Account connected and validated successfully!"
            : `GCP Service Account saved (Status: ${result.validationStatus})`
        )
        clearFile()
        setShowUpload(false)
        await loadIntegration()
      } else {
        // Use error, message, or a descriptive fallback
        setError(result.error || result.message || "Setup failed. Please check your Service Account JSON and try again.")
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to setup integration")
    } finally {
      setUploadLoading(false)
    }
  }

  // Handle validate - re-validates existing credentials
  const handleValidate = async () => {
    setError(null)
    setSuccessMessage(null)
    setUploadLoading(true)

    try {
      const result = await validateIntegration(orgSlug, "gcp")

      if (result.validationStatus === "VALID") {
        setSuccessMessage("GCP Service Account validated successfully!")
      } else {
        setError(result.error || "Validation failed")
      }

      await loadIntegration()
    } finally {
      setUploadLoading(false)
    }
  }

  // Handle delete
  const handleDelete = async () => {
    setError(null)
    setSuccessMessage(null)
    setUploadLoading(true)

    try {
      const result = await deleteIntegration(orgSlug, "gcp")

      if (result.success) {
        setSuccessMessage("GCP integration removed")
        setShowDeleteDialog(false)
        await loadIntegration()
      } else {
        setError(result.error || "Delete failed")
      }
    } finally {
      setUploadLoading(false)
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Never"
    const date = new Date(dateString)
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with back link */}
      <div className="flex items-center gap-4">
        <Link href={`/${orgSlug}/settings/integrations`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            All Integrations
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="console-page-title">GCP Integration</h1>
        <p className="console-subheading mt-1">
          Connect your Google Cloud Platform Service Account to enable billing data access and other GCP services.
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="border-[#007A78]/20 bg-[#F0FDFA]">
          <Check className="h-4 w-4 text-[#007A78]" />
          <AlertTitle className="text-[#007A78]">Success</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* Integration Card */}
      <Card className={status === "INVALID" ? "border-destructive" : ""}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-muted rounded-lg">
                <Cloud className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-xl">Google Cloud Platform</CardTitle>
                <CardDescription className="mt-1">
                  Service Account for accessing GCP Billing, BigQuery, and other Google Cloud services
                </CardDescription>
              </div>
            </div>
            <StatusBadge status={status} />
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Error Alert */}
          {integration?.last_error && status === "INVALID" && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Validation Error</AlertTitle>
              <AlertDescription>{integration.last_error}</AlertDescription>
            </Alert>
          )}

          {/* Upload Form */}
          {showUpload ? (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <Label className="text-sm font-medium">Upload Service Account JSON</Label>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileSelect(file)
                }}
                className="hidden"
              />

              {/* Drop zone */}
              {!uploadedFile ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                    ${isDragging
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                    }
                  `}
                >
                  <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    Drop your Service Account JSON here
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    or click to browse
                  </p>
                </div>
              ) : (
                /* File preview */
                <div className="border rounded-lg p-4 bg-background">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-muted rounded-md">
                        <FileJson className="h-5 w-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{uploadedFile.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {(uploadedFile.size / 1024).toFixed(1)} KB
                        </p>
                        {parsedSA && (
                          <div className="mt-2 space-y-1">
                            <p className="text-xs">
                              <span className="text-muted-foreground">Project:</span>{" "}
                              <span className="font-mono">{parsedSA.project_id}</span>
                            </p>
                            <p className="text-xs">
                              <span className="text-muted-foreground">Service Account:</span>{" "}
                              <span className="font-mono text-xs">{parsedSA.client_email}</span>
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearFile}
                      className="h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              <p className="console-small">
                Your credentials will be encrypted using Google Cloud KMS before storage.
              </p>

              <div className="flex gap-2">
                <Button
                  onClick={handleSetup}
                  disabled={!fileContent || uploadLoading}
                  className="console-button-primary"
                >
                  {uploadLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isConfigured ? "Update Credential" : "Connect"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowUpload(false)
                    clearFile()
                  }}
                  className="console-button-secondary"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : isConfigured ? (
            /* Configured state */
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 border rounded-lg bg-muted/30">
                <div className="p-2 bg-background rounded-md">
                  <Key className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{integration?.credential_name || "GCP Service Account"}</p>
                  <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Last validated: {formatDate(integration?.last_validated_at)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 console-small">
                <Shield className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#007A78]" />
                <span>Credentials are encrypted using Google Cloud KMS and never stored in plain text.</span>
              </div>
            </div>
          ) : (
            /* Not configured state */
            <div className="text-center py-8">
              <Cloud className="h-12 w-12 mx-auto mb-4 text-[#007A78]/50" />
              <p className="console-body mb-4">
                No GCP Service Account configured. Upload your JSON key file to get started.
              </p>
              <Button onClick={() => setShowUpload(true)} className="console-button-primary">
                <Upload className="h-4 w-4 mr-2" />
                Upload Service Account JSON
              </Button>
            </div>
          )}
        </CardContent>

        {/* Actions Footer */}
        {isConfigured && !showUpload && (
          <CardFooter className="flex justify-between border-t pt-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleValidate}
                disabled={uploadLoading}
                className="console-button-secondary"
              >
                {uploadLoading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Re-validate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUpload(true)}
                className="console-button-secondary"
              >
                <Upload className="h-4 w-4 mr-1" />
                Update Credential
              </Button>
            </div>

            {/* Delete Dialog */}
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Remove GCP Integration</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to remove this integration? This will delete the stored credentials
                    and any pipelines using this integration will stop working.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleDelete} disabled={uploadLoading}>
                    {uploadLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Remove Integration
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardFooter>
        )}
      </Card>

      {/* Help Section */}
      <div className="rounded-lg border border-[#007A78]/20 p-4 bg-[#F0FDFA]">
        <h3 className="console-card-title mb-2">How to get your Service Account JSON</h3>
        <ol className="list-decimal list-inside space-y-2 console-body">
          <li>Go to <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer" className="text-[#007A78] underline">GCP Console → IAM & Admin → Service Accounts</a></li>
          <li>Create a new service account or select an existing one</li>
          <li>Click "Keys" tab → "Add Key" → "Create new key" → JSON</li>
          <li>Download the JSON file and upload it here</li>
        </ol>
        <p className="console-body mt-3">
          <strong>Required roles:</strong> BigQuery Data Viewer, Billing Account Viewer (for cost data)
        </p>
      </div>
    </div>
  )
}
