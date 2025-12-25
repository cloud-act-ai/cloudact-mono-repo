"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { Cloud, Loader2, Check, AlertCircle, ArrowLeft, Upload, FileJson, X, Key, Clock, Shield, RefreshCw, Trash2, CheckCircle2 } from "lucide-react"
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

// Step Indicator Component
function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: totalSteps }).map((_, index) => (
        <div key={index} className="flex items-center">
          <div
            className={`h-2 w-8 rounded-full transition-all ${
              index + 1 <= currentStep
                ? 'bg-[#90FCA6]'
                : 'bg-border'
            }`}
          />
        </div>
      ))}
    </div>
  )
}

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { className: string; icon: React.ReactNode; text: string }> = {
    VALID: {
      className: "bg-[#90FCA6] text-black border-0 shadow-sm",
      icon: <div className="h-2 w-2 rounded-full bg-white animate-pulse" />,
      text: "Connected"
    },
    INVALID: {
      className: "bg-[#FF6C5E] text-white border-0",
      icon: <X className="h-3 w-3" />,
      text: "Invalid"
    },
    PENDING: {
      className: "bg-muted text-muted-foreground border-0",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      text: "Validating..."
    },
    NOT_CONFIGURED: {
      className: "bg-muted text-muted-foreground border-0",
      icon: null,
      text: "Not Connected"
    },
  }

  const config = variants[status] || variants.NOT_CONFIGURED

  return (
    <Badge className={`${config.className} px-3 py-1 text-[11px] font-semibold`}>
      <div className="flex items-center gap-1.5">
        {config.icon}
        {config.text}
      </div>
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
  const [wizardStep, setWizardStep] = useState(1)
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
      const gcpIntegration = result.integrations?.integrations?.["GCP_SA"]
      setIntegration(gcpIntegration)
    } else {
      setError(result.error || "Failed to load integration status")
    }

    setIsLoading(false)
  }, [orgSlug])

  useEffect(() => {
    void loadIntegration()
  }, [loadIntegration])

  // Clear success message after delay
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  // Clear error message after delay
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 10000)
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

    if (file.size > 50000) {
      setError("File too large. Service Account JSON should be under 50KB")
      return
    }

    try {
      const content = await file.text()
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(content)
      } catch {
        setError("Invalid JSON file. Please upload a valid Service Account JSON.")
        return
      }

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
      setWizardStep(2)
    } catch {
      setError("Error reading file. Please try again.")
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
    setWizardStep(1)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  // Handle setup
  const handleSetup = async () => {
    if (!fileContent) return

    setError(null)
    setSuccessMessage(null)
    setUploadLoading(true)
    setWizardStep(3)

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
        setError(result.error || result.message || "Setup failed. Please check your Service Account JSON and try again.")
        setWizardStep(2)
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to setup integration")
      setWizardStep(2)
    } finally {
      setUploadLoading(false)
    }
  }

  // Handle validate
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
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#1a7a3a] mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading GCP integration...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with back link */}
      <div className="flex items-center gap-4">
        <Link href={`/${orgSlug}/integrations/cloud-providers`}>
          <Button variant="ghost" size="sm" className="h-11 px-4 rounded-xl hover:bg-muted">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Providers
          </Button>
        </Link>
      </div>

      {/* Header Section */}
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#4285F4] to-[#3367D6] flex items-center justify-center shadow-lg">
          <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.19 2.38a9.344 9.344 0 0 1 9.426 9.428 9.344 9.344 0 0 1-9.426 9.428 9.344 9.344 0 0 1-9.426-9.428A9.344 9.344 0 0 1 12.19 2.38m-.012 2.544a6.751 6.751 0 0 0-6.768 6.76c0 1.745.675 3.408 1.9 4.686l4.796-4.796v-.001a2.423 2.423 0 0 1-.489-1.449c0-1.326 1.07-2.4 2.392-2.4a2.385 2.385 0 0 1 1.447.49v.001l4.796-4.796a6.733 6.733 0 0 0-4.686-1.9 6.705 6.705 0 0 0-3.388.905m0 9.56a2.388 2.388 0 0 1-2.398-2.396c0-.492.149-.965.424-1.364l-1.904-1.904A5.844 5.844 0 0 0 6.388 12c0 3.197 2.593 5.79 5.79 5.79.927 0 1.802-.224 2.578-.619l-1.904-1.904c-.399.275-.872.424-1.364.424m9.228-2.396a5.844 5.844 0 0 0-1.912-3.182l-1.904 1.904c.275.399.424.872.424 1.364a2.388 2.388 0 0 1-2.398 2.398c-.492 0-.965-.149-1.364-.424l-1.904 1.904a5.807 5.807 0 0 0 2.578.619 5.798 5.798 0 0 0 5.79-5.79z"/>
          </svg>
        </div>
        <div>
          <h1 className="text-[32px] font-bold text-black tracking-tight">Google Cloud Platform</h1>
          <p className="text-[15px] text-muted-foreground mt-1">
            Connect your GCP Service Account to enable billing data access and cloud cost analytics
          </p>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive" className="border-[#FF6C5E]/20 bg-gradient-to-br from-[#FF6C5E]/10 to-[#FF6C5E]/5">
          <AlertCircle className="h-5 w-5 text-[#FF6C5E]" />
          <AlertTitle className="text-[#FF6C5E] font-bold">Error</AlertTitle>
          <AlertDescription className="text-[14px]">{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="border-[#90FCA6]/20 bg-gradient-to-br from-[#90FCA6]/10 to-[#90FCA6]/5">
          <CheckCircle2 className="h-5 w-5 text-[#1a7a3a]" />
          <AlertTitle className="text-[#1a7a3a] font-bold">Success</AlertTitle>
          <AlertDescription className="text-[14px]">{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* Integration Card */}
      <Card className={`border-2 transition-all ${status === "INVALID" ? "border-[#FF6C5E]/40" : "border-border/50"}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-[#4285F4]/10 rounded-xl">
                <Cloud className="h-6 w-6 text-[#4285F4]" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold">Service Account Connection</CardTitle>
                <CardDescription className="mt-1">
                  Upload your GCP Service Account JSON for secure authentication
                </CardDescription>
              </div>
            </div>
            <StatusBadge status={status} />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Error Alert */}
          {integration?.last_error && status === "INVALID" && (
            <Alert variant="destructive" className="border-[#FF6C5E]/20 bg-gradient-to-br from-[#FF6C5E]/10 to-[#FF6C5E]/5">
              <AlertCircle className="h-4 w-4 text-[#FF6C5E]" />
              <AlertTitle className="text-[#FF6C5E] font-bold">Validation Error</AlertTitle>
              <AlertDescription>{integration.last_error}</AlertDescription>
            </Alert>
          )}

          {/* Upload Form */}
          {showUpload ? (
            <div className="space-y-6 p-6 border-2 border-border/50 rounded-2xl bg-gradient-to-br from-background to-muted/20">
              {/* Step Indicator */}
              <div className="flex items-center justify-between">
                <Label className="text-sm font-bold text-black">Connection Wizard</Label>
                <StepIndicator currentStep={wizardStep} totalSteps={3} />
              </div>

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

              {/* Step 1: Upload */}
              {wizardStep === 1 && !uploadedFile && (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    relative overflow-hidden border-3 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all
                    ${isDragging
                      ? "border-[#90FCA6] bg-[#90FCA6]/10 scale-105"
                      : "border-border/50 hover:border-[#90FCA6]/50 hover:bg-muted/50"
                    }
                  `}
                >
                  <div className={`transition-all ${isDragging ? 'scale-110' : ''}`}>
                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[#90FCA6]/20 to-[#90FCA6]/10 flex items-center justify-center mx-auto mb-4">
                      <Upload className="h-8 w-8 text-[#1a7a3a]" />
                    </div>
                    <p className="text-[16px] font-bold text-black mb-2">
                      {isDragging ? 'Drop your file here' : 'Upload Service Account JSON'}
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      Drag and drop or click to browse
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-2">
                      Maximum file size: 50KB
                    </p>
                  </div>
                </div>
              )}

              {/* Step 2: Review */}
              {wizardStep === 2 && uploadedFile && (
                <div className="space-y-4">
                  <div className="border-2 border-[#90FCA6]/20 rounded-2xl p-5 bg-gradient-to-br from-[#90FCA6]/5 to-background">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="p-2.5 bg-[#90FCA6]/10 rounded-xl">
                          <FileJson className="h-6 w-6 text-[#1a7a3a]" />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-[15px] text-black mb-1">{uploadedFile.name}</p>
                          <p className="text-[12px] text-muted-foreground">
                            {(uploadedFile.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFile}
                        className="h-10 w-10 p-0 rounded-xl hover:bg-[#FF6C5E]/10"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {parsedSA && (
                      <div className="space-y-3 pt-4 border-t border-border/50">
                        <div className="flex items-start gap-3">
                          <div className="h-5 w-5 rounded-lg bg-[#90FCA6]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Check className="h-3 w-3 text-[#1a7a3a]" />
                          </div>
                          <div>
                            <p className="text-[12px] font-semibold text-muted-foreground mb-0.5">Project ID</p>
                            <p className="text-[14px] font-mono font-medium text-black">{parsedSA.project_id}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="h-5 w-5 rounded-lg bg-[#90FCA6]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Check className="h-3 w-3 text-[#1a7a3a]" />
                          </div>
                          <div>
                            <p className="text-[12px] font-semibold text-muted-foreground mb-0.5">Service Account</p>
                            <p className="text-[13px] font-mono text-black break-all">{parsedSA.client_email}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Connecting */}
              {wizardStep === 3 && (
                <div className="text-center py-8">
                  <Loader2 className="h-12 w-12 animate-spin text-[#1a7a3a] mx-auto mb-4" />
                  <p className="text-[16px] font-bold text-black mb-2">Connecting to GCP...</p>
                  <p className="text-[13px] text-muted-foreground">
                    Encrypting and validating your credentials
                  </p>
                </div>
              )}

              {/* Security Notice */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-[#90FCA6]/5 border border-[#90FCA6]/10">
                <Shield className="h-5 w-5 mt-0.5 flex-shrink-0 text-[#1a7a3a]" />
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  Your credentials will be encrypted using Google Cloud KMS before storage. We never store plain text credentials.
                </p>
              </div>

              {/* Actions */}
              {wizardStep !== 3 && (
                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={handleSetup}
                    disabled={!fileContent || uploadLoading}
                    className="flex-1 h-12 bg-[#90FCA6] hover:bg-[#006664] text-white text-[15px] font-bold rounded-xl shadow-sm hover:shadow-md transition-all"
                  >
                    {uploadLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isConfigured ? "Update Credential" : "Connect GCP"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowUpload(false)
                      clearFile()
                    }}
                    className="h-12 px-6 text-[15px] font-semibold rounded-xl border-2"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          ) : isConfigured ? (
            /* Configured state */
            <div className="space-y-5">
              <div className="flex items-center gap-4 p-5 border-2 border-[#90FCA6]/20 rounded-2xl bg-gradient-to-br from-[#90FCA6]/5 to-background">
                <div className="p-3 bg-[#90FCA6]/10 rounded-xl">
                  <Key className="h-6 w-6 text-[#1a7a3a]" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-[15px] text-black mb-1">
                    {integration?.credential_name || "GCP Service Account"}
                  </p>
                  <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Last validated: {formatDate(integration?.last_validated_at)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/30">
                <Shield className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#1a7a3a]" />
                <span className="text-[13px] text-muted-foreground">
                  Credentials are encrypted using Google Cloud KMS and never stored in plain text.
                </span>
              </div>
            </div>
          ) : (
            /* Not configured state */
            <div className="text-center py-12">
              <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-[#4285F4]/20 to-[#4285F4]/10 flex items-center justify-center mx-auto mb-6">
                <Cloud className="h-10 w-10 text-[#4285F4]" />
              </div>
              <p className="text-[16px] font-bold text-black mb-2">
                No Service Account Connected
              </p>
              <p className="text-[14px] text-muted-foreground mb-6 max-w-md mx-auto">
                Upload your GCP Service Account JSON to enable billing data access and start tracking cloud costs
              </p>
              <Button
                onClick={() => {
                  setShowUpload(true)
                  setWizardStep(1)
                }}
                className="h-12 px-6 bg-[#90FCA6] hover:bg-[#006664] text-white text-[15px] font-bold rounded-xl shadow-sm hover:shadow-md transition-all"
              >
                <Upload className="h-4 w-4 mr-2" />
                Start Connection Wizard
              </Button>
            </div>
          )}
        </CardContent>

        {/* Actions Footer */}
        {isConfigured && !showUpload && (
          <CardFooter className="flex justify-between border-t pt-5">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleValidate}
                disabled={uploadLoading}
                className="h-11 px-5 text-[14px] font-semibold rounded-xl border-2 hover:bg-muted"
              >
                {uploadLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Re-validate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowUpload(true)
                  setWizardStep(1)
                }}
                className="h-11 px-5 text-[14px] font-semibold rounded-xl border-2 hover:bg-muted"
              >
                <Upload className="h-4 w-4 mr-2" />
                Update Credential
              </Button>
            </div>

            {/* Delete Dialog */}
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-[#FF6C5E] hover:text-[#FF6C5E] hover:bg-[#FF6C5E]/10 h-11 px-5 rounded-xl">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold">Remove GCP Integration</DialogTitle>
                  <DialogDescription className="text-[14px] leading-relaxed">
                    Are you sure you want to remove this integration? This will delete the stored credentials
                    and any pipelines using this integration will stop working.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteDialog(false)}
                    className="h-11 px-5 rounded-xl border-2"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={uploadLoading}
                    className="h-11 px-5 rounded-xl bg-[#FF6C5E] hover:bg-[#FF5533]"
                  >
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
      <div className="rounded-2xl border-2 border-[#4285F4]/20 p-6 bg-gradient-to-br from-[#4285F4]/5 to-background">
        <h3 className="text-[16px] font-bold text-black mb-4 flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-[#4285F4]/10 flex items-center justify-center">
            <Cloud className="h-4 w-4 text-[#4285F4]" />
          </div>
          How to get your Service Account JSON
        </h3>
        <ol className="list-decimal list-inside space-y-3 text-[14px] leading-relaxed ml-1">
          <li>
            Go to{' '}
            <a
              href="https://console.cloud.google.com/iam-admin/serviceaccounts"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1a7a3a] font-semibold hover:underline"
            >
              GCP Console → IAM & Admin → Service Accounts
            </a>
          </li>
          <li>Create a new service account or select an existing one</li>
          <li>Click "Keys" tab → "Add Key" → "Create new key" → JSON</li>
          <li>Download the JSON file and upload it using the wizard above</li>
        </ol>
        <div className="mt-5 p-4 rounded-xl bg-[#90FCA6]/5 border border-[#90FCA6]/10">
          <p className="text-[13px] text-muted-foreground">
            <strong className="text-black font-bold">Required roles:</strong> BigQuery Data Viewer, Billing Account Viewer (for cost data)
          </p>
        </div>
      </div>
    </div>
  )
}
