"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { Loader2, Check, AlertCircle, ArrowLeft, Upload, FileJson, X, Key, Clock, Shield, RefreshCw, Trash2, CheckCircle2 } from "lucide-react"
import Link from "next/link"
import { ProviderLogo } from "@/components/ui/provider-logo"

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
  updateIntegrationMetadata,
} from "@/actions/integrations"

// Additional billing account type (for multi-billing-account support)
interface BillingAccount {
  name: string
  billing_export_table: string
  detailed_export_table?: string
  pricing_export_table?: string
  committed_use_discount_table?: string
}

interface IntegrationStatus {
  provider: string
  status: "VALID" | "INVALID" | "PENDING" | "NOT_CONFIGURED" | "EXPIRED"
  credential_name?: string
  last_validated_at?: string
  last_error?: string
  created_at?: string
  metadata?: {
    billing_export_table?: string
    detailed_export_table?: string
    pricing_export_table?: string
    committed_use_discount_table?: string
    additional_billing_accounts?: BillingAccount[]
    project_id?: string
    client_email?: string
    region?: string
    environment?: string
    [key: string]: unknown
  }
}

// Helper to check if billing tables are configured
function hasBillingTablesConfigured(metadata?: IntegrationStatus['metadata']): boolean {
  return !!(metadata?.billing_export_table)
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
      className: "bg-[#90FCA6]/15 text-[#1a7a3a] border border-[#90FCA6]/30",
      icon: <div className="h-2 w-2 rounded-full bg-[#1a7a3a] animate-pulse" />,
      text: "Connected"
    },
    INVALID: {
      className: "bg-red-50 text-red-700 border border-red-200",
      icon: <X className="h-3 w-3" />,
      text: "Invalid"
    },
    PENDING: {
      className: "bg-slate-100 text-slate-600 border border-slate-200",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      text: "Validating..."
    },
    NOT_CONFIGURED: {
      className: "bg-slate-100 text-slate-500 border border-slate-200",
      icon: null,
      text: "Not Connected"
    },
  }

  const config = variants[status] || variants.NOT_CONFIGURED

  return (
    <div className={`${config.className} px-3 py-1.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5`}>
      {config.icon}
      {config.text}
    </div>
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

  // Billing export table configuration (primary)
  const [billingExportTable, setBillingExportTable] = useState("")
  const [detailedExportTable, setDetailedExportTable] = useState("")
  const [pricingExportTable, setPricingExportTable] = useState("")
  const [cudTable, setCudTable] = useState("")
  // Additional billing accounts (multi-billing-account support)
  const [additionalAccounts, setAdditionalAccounts] = useState<BillingAccount[]>([])
  const [showBillingConfig, setShowBillingConfig] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)

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

      // Populate billing export fields from metadata
      if (gcpIntegration?.metadata) {
        setBillingExportTable(String(gcpIntegration.metadata.billing_export_table || ""))
        setDetailedExportTable(String(gcpIntegration.metadata.detailed_export_table || ""))
        setPricingExportTable(String(gcpIntegration.metadata.pricing_export_table || ""))
        setCudTable(String(gcpIntegration.metadata.committed_use_discount_table || ""))
        // Load additional billing accounts
        if (Array.isArray(gcpIntegration.metadata.additional_billing_accounts)) {
          setAdditionalAccounts(gcpIntegration.metadata.additional_billing_accounts)
        }
      }
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
        project_id: parsed.project_id as string,
        client_email: parsed.client_email as string,
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

  // Handle save billing export configuration
  const handleSaveBillingConfig = async () => {
    setError(null)
    setSuccessMessage(null)
    setSavingConfig(true)

    try {
      // Validate table paths (must be project.dataset.table format)
      const validateTablePath = (path: string, fieldName: string) => {
        if (path && path.trim()) {
          const trimmed = path.trim()
          // VAL-001 FIX: Use < 3 to allow tables with dots in their names (e.g., project.dataset.table_v1.0)
          if (trimmed.split('.').length < 3) {
            throw new Error(`${fieldName} must be in format: project.dataset.table`)
          }
          // SEC-002 FIX: Check for path traversal and SQL injection attempts
          const dangerousPatterns = ['..', '`', ';', "'", '"', '--', '/*', '*/']
          for (const pattern of dangerousPatterns) {
            if (trimmed.includes(pattern)) {
              throw new Error(`Invalid ${fieldName}: disallowed character sequence detected`)
            }
          }
          if (trimmed.startsWith('/')) {
            throw new Error(`Invalid ${fieldName}: path traversal not allowed`)
          }
        }
      }

      validateTablePath(billingExportTable, "Billing Export Table")
      validateTablePath(detailedExportTable, "Detailed Export Table")
      validateTablePath(pricingExportTable, "Pricing Export Table")
      validateTablePath(cudTable, "Committed Use Discount Table")

      // Validate additional billing accounts
      for (const account of additionalAccounts) {
        if (!account.name.trim()) {
          throw new Error("Additional billing account must have a name")
        }
        validateTablePath(account.billing_export_table, `${account.name} Billing Export Table`)
        if (account.detailed_export_table) {
          validateTablePath(account.detailed_export_table, `${account.name} Detailed Export Table`)
        }
      }

      const result = await updateIntegrationMetadata({
        orgSlug,
        provider: "gcp",
        metadata: {
          // Preserve existing metadata fields
          ...(integration?.metadata || {}),
          // Update billing export tables
          billing_export_table: billingExportTable.trim() || undefined,
          detailed_export_table: detailedExportTable.trim() || undefined,
          pricing_export_table: pricingExportTable.trim() || undefined,
          committed_use_discount_table: cudTable.trim() || undefined,
          // EDGE-001 FIX: Send empty array instead of undefined for consistent backend handling
          additional_billing_accounts: additionalAccounts.length > 0 ? additionalAccounts : [],
        },
      })

      if (result.success) {
        setSuccessMessage("Billing export configuration saved successfully!")
        setShowBillingConfig(false)
        // STATE-001 FIX: Clear local form state before reloading to prevent stale data
        setBillingExportTable("")
        setDetailedExportTable("")
        setPricingExportTable("")
        setCudTable("")
        setAdditionalAccounts([])
        await loadIntegration()
      } else {
        setError(result.error || "Failed to save configuration")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save configuration")
    } finally {
      setSavingConfig(false)
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
          <p className="text-[14px] text-slate-500">Loading GCP integration...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-7xl">
      {/* Header with back link */}
      <div className="flex items-center gap-3">
        <Link href={`/${orgSlug}/integrations/cloud-providers`}>
          <button className="h-10 px-4 rounded-xl hover:bg-slate-100 transition-colors flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium text-[14px]">
            <ArrowLeft className="h-4 w-4" />
            Back to Providers
          </button>
        </Link>
      </div>

      {/* Header Section */}
      <div className="flex items-center gap-5">
        <div className="h-16 w-16 rounded-2xl bg-white border-2 border-slate-200 flex items-center justify-center shadow-lg">
          <ProviderLogo provider="gcp" size={40} />
        </div>
        <div>
          <h1 className="text-[32px] font-bold text-slate-900 tracking-tight">Google Cloud Platform</h1>
          <p className="text-[15px] text-slate-500 mt-2">
            Connect your GCP Service Account to enable billing data access and cloud cost analytics
          </p>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-5 rounded-2xl bg-red-50 border border-red-200 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900">Error</h3>
              <p className="text-[14px] text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="p-5 rounded-2xl bg-[#90FCA6]/10 border border-[#90FCA6]/30 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-[#90FCA6]/20 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="h-5 w-5 text-[#1a7a3a]" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900">Success</h3>
              <p className="text-[14px] text-[#1a7a3a] mt-1">{successMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Integration Card */}
      <div className={`bg-white rounded-2xl border-2 ${status === "INVALID" ? "border-[#FF6C5E]/40" : "border-slate-200"} shadow-sm transition-all`}>
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-[#4285F4]/15 flex items-center justify-center">
                <Key className="h-6 w-6 text-[#4285F4]" />
              </div>
              <div>
                <h2 className="text-[18px] font-bold text-slate-900">Service Account Connection</h2>
                <p className="text-[14px] text-slate-500 mt-1">
                  Upload your GCP Service Account JSON for secure authentication
                </p>
              </div>
            </div>
            <StatusBadge status={status} />
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Error Alert */}
          {integration?.last_error && status === "INVALID" && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[14px] font-semibold text-slate-900">Validation Error</h4>
                  <p className="text-[13px] text-red-700 mt-1">{integration.last_error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Upload Form */}
          {showUpload ? (
            <div className="space-y-6 p-6 border-2 border-slate-200 rounded-2xl bg-slate-50">
              {/* Step Indicator */}
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold text-slate-900">Connection Wizard</span>
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
                    relative overflow-hidden border-3 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all bg-white
                    ${isDragging
                      ? "border-[#90FCA6] bg-[#90FCA6]/10 scale-[1.02]"
                      : "border-slate-300 hover:border-[#90FCA6] hover:bg-slate-50"
                    }
                  `}
                >
                  <div className={`transition-all ${isDragging ? 'scale-110' : ''}`}>
                    <div className="h-16 w-16 rounded-2xl bg-[#90FCA6]/15 flex items-center justify-center mx-auto mb-4">
                      <Upload className="h-8 w-8 text-[#1a7a3a]" />
                    </div>
                    <p className="text-[16px] font-bold text-slate-900 mb-2">
                      {isDragging ? 'Drop your file here' : 'Upload Service Account JSON'}
                    </p>
                    <p className="text-[14px] text-slate-500">
                      Drag and drop or click to browse
                    </p>
                    <p className="text-[13px] text-slate-400 mt-2">
                      Maximum file size: 50KB
                    </p>
                  </div>
                </div>
              )}

              {/* Step 2: Review */}
              {wizardStep === 2 && uploadedFile && (
                <div className="space-y-4">
                  <div className="border-2 border-[#90FCA6]/30 rounded-2xl p-5 bg-white">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="p-3 bg-[#90FCA6]/15 rounded-xl">
                          <FileJson className="h-6 w-6 text-[#1a7a3a]" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-[15px] text-slate-900 mb-1">{uploadedFile.name}</p>
                          <p className="text-[13px] text-slate-500">
                            {(uploadedFile.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={clearFile}
                        className="h-10 w-10 rounded-xl hover:bg-slate-100 transition-colors flex items-center justify-center"
                      >
                        <X className="h-4 w-4 text-slate-600" />
                      </button>
                    </div>

                    {parsedSA && (
                      <div className="space-y-3 pt-4 border-t border-slate-200">
                        <div className="flex items-start gap-3">
                          <div className="h-6 w-6 rounded-lg bg-[#90FCA6]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Check className="h-4 w-4 text-[#1a7a3a]" />
                          </div>
                          <div>
                            <p className="text-[12px] font-semibold text-slate-500 mb-1">Project ID</p>
                            <p className="text-[14px] font-mono font-medium text-slate-900">{parsedSA.project_id}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="h-6 w-6 rounded-lg bg-[#90FCA6]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Check className="h-4 w-4 text-[#1a7a3a]" />
                          </div>
                          <div>
                            <p className="text-[12px] font-semibold text-slate-500 mb-1">Service Account</p>
                            <p className="text-[13px] font-mono text-slate-900 break-all">{parsedSA.client_email}</p>
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
                  <p className="text-[16px] font-bold text-slate-900 mb-2">Connecting to GCP...</p>
                  <p className="text-[13px] text-muted-foreground">
                    Encrypting and validating your credentials
                  </p>
                </div>
              )}

              {/* Security Notice */}
              <div className="flex items-start gap-4 p-5 rounded-xl bg-[#90FCA6]/10 border border-[#90FCA6]/20">
                <Shield className="h-5 w-5 mt-0.5 flex-shrink-0 text-[#1a7a3a]" />
                <p className="text-[14px] text-slate-600 leading-relaxed">
                  Your credentials will be encrypted using Google Cloud KMS before storage. We never store plain text credentials.
                </p>
              </div>

              {/* Actions */}
              {wizardStep !== 3 && (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSetup}
                    disabled={!fileContent || uploadLoading}
                    className="flex-1 h-12 bg-[#90FCA6] hover:bg-[#6EE890] text-slate-900 text-[15px] font-semibold rounded-xl shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {uploadLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isConfigured ? "Update Credential" : "Connect GCP"}
                  </button>
                  <button
                    onClick={() => {
                      setShowUpload(false)
                      clearFile()
                    }}
                    className="h-12 px-6 text-[15px] font-semibold rounded-xl border-2 border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ) : isConfigured ? (
            /* Configured state */
            <div className="space-y-5">
              <div className="flex items-center gap-4 p-5 border-2 border-[#90FCA6]/30 rounded-2xl bg-white">
                <div className="h-12 w-12 bg-[#90FCA6]/15 rounded-xl flex items-center justify-center">
                  <Key className="h-6 w-6 text-[#1a7a3a]" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[16px] text-slate-900 mb-1">
                    {integration?.credential_name || "GCP Service Account"}
                  </p>
                  <div className="flex items-center gap-2 text-[13px] text-slate-500">
                    <Clock className="h-4 w-4" />
                    <span>Last validated: {formatDate(integration?.last_validated_at)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-4 p-5 rounded-xl bg-slate-50 border border-slate-200">
                <Shield className="h-5 w-5 mt-0.5 flex-shrink-0 text-[#1a7a3a]" />
                <span className="text-[14px] text-slate-600 leading-relaxed">
                  Credentials are encrypted using Google Cloud KMS and never stored in plain text.
                </span>
              </div>
            </div>
          ) : (
            /* Not configured state */
            <div className="text-center py-12">
              <div className="h-20 w-20 rounded-2xl bg-[#4285F4]/15 flex items-center justify-center mx-auto mb-6">
                <Upload className="h-10 w-10 text-[#4285F4]" />
              </div>
              <p className="text-[18px] font-bold text-slate-900 mb-3">
                No Service Account Connected
              </p>
              <p className="text-[15px] text-slate-500 mb-8 max-w-md mx-auto leading-relaxed">
                Upload your GCP Service Account JSON to enable billing data access and start tracking cloud costs
              </p>
              <button
                onClick={() => {
                  setShowUpload(true)
                  setWizardStep(1)
                }}
                className="h-12 px-6 bg-[#90FCA6] hover:bg-[#6EE890] text-slate-900 text-[15px] font-semibold rounded-xl shadow-sm hover:shadow-md transition-all inline-flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Start Connection Wizard
              </button>
            </div>
          )}
        </div>

        {/* Actions Footer */}
        {isConfigured && !showUpload && (
          <div className="flex justify-between border-t border-slate-100 pt-6 px-6 pb-6">
            <div className="flex gap-3">
              <button
                onClick={handleValidate}
                disabled={uploadLoading}
                className="h-11 px-5 text-[14px] font-semibold rounded-xl border-2 border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {uploadLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Re-validate
              </button>
              <button
                onClick={() => {
                  setShowUpload(true)
                  setWizardStep(1)
                }}
                className="h-11 px-5 text-[14px] font-semibold rounded-xl border-2 border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Update Credential
              </button>
            </div>

            {/* Delete Dialog */}
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <DialogTrigger asChild>
                <button className="text-[#FF6C5E] hover:bg-[#FF6C5E]/10 h-11 px-5 rounded-xl font-semibold text-[14px] transition-colors flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="text-[20px] font-bold text-slate-900">Remove GCP Integration</DialogTitle>
                  <DialogDescription className="text-[14px] leading-relaxed text-slate-600 mt-2">
                    Are you sure you want to remove this integration? This will delete the stored credentials
                    and any pipelines using this integration will stop working.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-3">
                  <button
                    onClick={() => setShowDeleteDialog(false)}
                    className="h-11 px-5 rounded-xl border-2 border-slate-200 hover:bg-slate-50 font-semibold text-[14px] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={uploadLoading}
                    className="h-11 px-5 rounded-xl bg-[#FF6C5E] hover:bg-[#FF5533] text-white font-semibold text-[14px] transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {uploadLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Remove Integration
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Billing Export Configuration - Only show when connected */}
      {isConfigured && (
        <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm">
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-[#90FCA6]/15 flex items-center justify-center">
                  <svg className="h-6 w-6 text-[#1a7a3a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-[18px] font-bold text-slate-900">Billing Export Tables</h2>
                  <p className="text-[14px] text-slate-500 mt-1">
                    Configure your GCP billing export tables for cost data extraction
                  </p>
                </div>
              </div>
              {!showBillingConfig && (
                <button
                  onClick={() => setShowBillingConfig(true)}
                  className="h-10 px-4 text-[14px] font-semibold rounded-xl border-2 border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Configure
                </button>
              )}
            </div>
          </div>

          <div className="p-6">
            {showBillingConfig ? (
              <div className="space-y-6">
                {/* Billing Export Table */}
                <div>
                  <label className="block text-[14px] font-semibold text-slate-700 mb-2">
                    Standard Billing Export Table
                    <span className="text-slate-400 font-normal ml-1">(Required)</span>
                  </label>
                  <input
                    type="text"
                    value={billingExportTable}
                    onChange={(e) => setBillingExportTable(e.target.value)}
                    placeholder="project-id.dataset.gcp_billing_export_v1_XXXXXX"
                    className="w-full h-12 px-4 text-[14px] rounded-xl border-2 border-slate-200 focus:border-[#90FCA6] focus:ring-0 focus:outline-none transition-colors font-mono"
                  />
                  <p className="mt-2 text-[13px] text-slate-500">
                    Standard billing export table (gcp_billing_export_v1_*). Found in BigQuery under your billing export dataset.
                  </p>
                </div>

                {/* Detailed Export Table */}
                <div>
                  <label className="block text-[14px] font-semibold text-slate-700 mb-2">
                    Detailed/Resource Export Table
                  </label>
                  <input
                    type="text"
                    value={detailedExportTable}
                    onChange={(e) => setDetailedExportTable(e.target.value)}
                    placeholder="project-id.dataset.gcp_billing_export_resource_v1_XXXXXX"
                    className="w-full h-12 px-4 text-[14px] rounded-xl border-2 border-slate-200 focus:border-[#90FCA6] focus:ring-0 focus:outline-none transition-colors font-mono"
                  />
                  <p className="mt-2 text-[13px] text-slate-500">
                    Detailed billing export with resource-level data (gcp_billing_export_resource_v1_*). Provides more granular cost breakdown.
                  </p>
                </div>

                {/* Pricing Export Table */}
                <div>
                  <label className="block text-[14px] font-semibold text-slate-700 mb-2">
                    Pricing Export Table
                  </label>
                  <input
                    type="text"
                    value={pricingExportTable}
                    onChange={(e) => setPricingExportTable(e.target.value)}
                    placeholder="project-id.dataset.cloud_pricing_export"
                    className="w-full h-12 px-4 text-[14px] rounded-xl border-2 border-slate-200 focus:border-[#90FCA6] focus:ring-0 focus:outline-none transition-colors font-mono"
                  />
                  <p className="mt-2 text-[13px] text-slate-500">
                    GCP pricing catalog export (cloud_pricing_export). Used for pricing lookups and cost optimization analysis.
                  </p>
                </div>

                {/* Committed Use Discounts Table */}
                <div>
                  <label className="block text-[14px] font-semibold text-slate-700 mb-2">
                    Committed Use Discounts Table
                  </label>
                  <input
                    type="text"
                    value={cudTable}
                    onChange={(e) => setCudTable(e.target.value)}
                    placeholder="project-id.dataset.committed_use_discount_export"
                    className="w-full h-12 px-4 text-[14px] rounded-xl border-2 border-slate-200 focus:border-[#90FCA6] focus:ring-0 focus:outline-none transition-colors font-mono"
                  />
                  <p className="mt-2 text-[13px] text-slate-500">
                    GCP Committed Use Discounts (CUD) export. Used for analyzing commitment utilization and savings.
                  </p>
                </div>

                {/* Additional Billing Accounts Section */}
                <div className="pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-[15px] font-semibold text-slate-900">Additional Billing Accounts</h4>
                      <p className="text-[13px] text-slate-500 mt-1">
                        Enterprise organizations can configure multiple billing accounts for different business units
                      </p>
                    </div>
                    {additionalAccounts.length < 10 && (
                      <button
                        onClick={() => {
                          setAdditionalAccounts([
                            ...additionalAccounts,
                            { name: "", billing_export_table: "" }
                          ])
                        }}
                        className="h-9 px-4 text-[13px] font-semibold rounded-lg border-2 border-[#90FCA6] text-[#1a7a3a] hover:bg-[#90FCA6]/10 transition-colors"
                      >
                        + Add Account
                      </button>
                    )}
                  </div>

                  {additionalAccounts.length > 0 && (
                    <div className="space-y-4">
                      {additionalAccounts.map((account, index) => (
                        <div key={index} className="p-4 rounded-xl border-2 border-slate-200 bg-slate-50 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[13px] font-semibold text-slate-600">Billing Account {index + 1}</span>
                            <button
                              onClick={() => {
                                setAdditionalAccounts(additionalAccounts.filter((_, i) => i !== index))
                              }}
                              className="text-[#FF6C5E] hover:bg-[#FF6C5E]/10 h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          <div>
                            <label className="block text-[13px] font-medium text-slate-600 mb-1">
                              Account Name
                            </label>
                            <input
                              type="text"
                              value={account.name}
                              onChange={(e) => {
                                const updated = [...additionalAccounts]
                                updated[index] = { ...updated[index], name: e.target.value }
                                setAdditionalAccounts(updated)
                              }}
                              placeholder="e.g., Production, Development, Marketing"
                              className="w-full h-10 px-3 text-[13px] rounded-lg border-2 border-slate-200 focus:border-[#90FCA6] focus:ring-0 focus:outline-none transition-colors"
                            />
                          </div>

                          <div>
                            <label className="block text-[13px] font-medium text-slate-600 mb-1">
                              Standard Billing Export Table
                            </label>
                            <input
                              type="text"
                              value={account.billing_export_table}
                              onChange={(e) => {
                                const updated = [...additionalAccounts]
                                updated[index] = { ...updated[index], billing_export_table: e.target.value }
                                setAdditionalAccounts(updated)
                              }}
                              placeholder="project-id.dataset.gcp_billing_export_v1_XXXXXX"
                              className="w-full h-10 px-3 text-[13px] rounded-lg border-2 border-slate-200 focus:border-[#90FCA6] focus:ring-0 focus:outline-none transition-colors font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-[13px] font-medium text-slate-600 mb-1">
                              Detailed/Resource Export Table
                            </label>
                            <input
                              type="text"
                              value={account.detailed_export_table || ""}
                              onChange={(e) => {
                                const updated = [...additionalAccounts]
                                updated[index] = { ...updated[index], detailed_export_table: e.target.value || undefined }
                                setAdditionalAccounts(updated)
                              }}
                              placeholder="project-id.dataset.gcp_billing_export_resource_v1_XXXXXX"
                              className="w-full h-10 px-3 text-[13px] rounded-lg border-2 border-slate-200 focus:border-[#90FCA6] focus:ring-0 focus:outline-none transition-colors font-mono"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Help Info */}
                <div className="p-4 rounded-xl bg-[#4285F4]/10 border border-[#4285F4]/20">
                  <p className="text-[13px] text-slate-600 leading-relaxed">
                    <strong className="text-slate-800">How to find your billing export tables:</strong><br />
                    1. Go to <a href="https://console.cloud.google.com/bigquery" target="_blank" rel="noopener noreferrer" className="text-[#007AFF] hover:underline">BigQuery Console</a><br />
                    2. Find your billing export dataset (usually named like <code className="bg-slate-200 px-1 rounded">cloudact_cost_usage</code>)<br />
                    3. Copy the full table path: <code className="bg-slate-200 px-1 rounded">project.dataset.table_name</code>
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSaveBillingConfig}
                    disabled={savingConfig || !billingExportTable.trim()}
                    className="flex-1 h-12 bg-[#90FCA6] hover:bg-[#6EE890] text-slate-900 text-[15px] font-semibold rounded-xl shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {savingConfig && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save Configuration
                  </button>
                  <button
                    onClick={() => {
                      setShowBillingConfig(false)
                      // Reset to saved values
                      if (integration?.metadata) {
                        setBillingExportTable(String(integration.metadata.billing_export_table || ""))
                        setDetailedExportTable(String(integration.metadata.detailed_export_table || ""))
                        setPricingExportTable(String(integration.metadata.pricing_export_table || ""))
                        setCudTable(String(integration.metadata.committed_use_discount_table || ""))
                        // Reset additional billing accounts
                        if (Array.isArray(integration.metadata.additional_billing_accounts)) {
                          setAdditionalAccounts(integration.metadata.additional_billing_accounts)
                        } else {
                          setAdditionalAccounts([])
                        }
                      }
                    }}
                    className="h-12 px-6 text-[15px] font-semibold rounded-xl border-2 border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Display current configuration */
              <div className="space-y-4">
                {hasBillingTablesConfigured(integration?.metadata) ? (
                  <>
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                      <Check className="h-5 w-5 text-[#1a7a3a] flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[13px] font-semibold text-slate-500 mb-1">Standard Billing Export</p>
                        <p className="text-[14px] font-mono text-slate-900 break-all">{String(integration?.metadata?.billing_export_table)}</p>
                      </div>
                    </div>
                    {integration?.metadata?.detailed_export_table && (
                      <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                        <Check className="h-5 w-5 text-[#1a7a3a] flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[13px] font-semibold text-slate-500 mb-1">Detailed Export</p>
                          <p className="text-[14px] font-mono text-slate-900 break-all">{String(integration.metadata.detailed_export_table)}</p>
                        </div>
                      </div>
                    )}
                    {integration?.metadata?.pricing_export_table && (
                      <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                        <Check className="h-5 w-5 text-[#1a7a3a] flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[13px] font-semibold text-slate-500 mb-1">Pricing Export</p>
                          <p className="text-[14px] font-mono text-slate-900 break-all">{String(integration.metadata.pricing_export_table)}</p>
                        </div>
                      </div>
                    )}
                    {integration?.metadata?.committed_use_discount_table && (
                      <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                        <Check className="h-5 w-5 text-[#1a7a3a] flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[13px] font-semibold text-slate-500 mb-1">Committed Use Discounts</p>
                          <p className="text-[14px] font-mono text-slate-900 break-all">{String(integration.metadata.committed_use_discount_table)}</p>
                        </div>
                      </div>
                    )}
                    {/* Additional Billing Accounts Display */}
                    {integration?.metadata?.additional_billing_accounts && integration.metadata.additional_billing_accounts.length > 0 && (
                      <div className="pt-4 mt-4 border-t border-slate-200">
                        <p className="text-[14px] font-semibold text-slate-700 mb-3">Additional Billing Accounts ({integration.metadata.additional_billing_accounts.length})</p>
                        <div className="space-y-3">
                          {integration.metadata.additional_billing_accounts.map((account, index) => (
                            <div key={index} className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="h-6 w-6 rounded-lg bg-[#90FCA6]/15 flex items-center justify-center">
                                  <Check className="h-4 w-4 text-[#1a7a3a]" />
                                </div>
                                <span className="text-[14px] font-semibold text-slate-900">{account.name}</span>
                              </div>
                              <div className="ml-8 space-y-1">
                                <p className="text-[12px] text-slate-500">Standard: <span className="font-mono text-slate-700">{account.billing_export_table}</span></p>
                                {account.detailed_export_table && (
                                  <p className="text-[12px] text-slate-500">Detailed: <span className="font-mono text-slate-700">{account.detailed_export_table}</span></p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                      <AlertCircle className="h-8 w-8 text-slate-400" />
                    </div>
                    <p className="text-[16px] font-bold text-slate-900 mb-2">
                      No Billing Tables Configured
                    </p>
                    <p className="text-[14px] text-slate-500 mb-6 max-w-md mx-auto">
                      Configure your GCP billing export tables to enable cost data extraction
                    </p>
                    <button
                      onClick={() => setShowBillingConfig(true)}
                      className="h-11 px-6 bg-[#90FCA6] hover:bg-[#6EE890] text-slate-900 text-[14px] font-semibold rounded-xl shadow-sm hover:shadow-md transition-all"
                    >
                      Configure Tables
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Help Section */}
      <div className="rounded-2xl border-2 border-[#4285F4]/20 p-6 bg-white shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-[#4285F4]/15 flex items-center justify-center">
            <FileJson className="h-5 w-5 text-[#4285F4]" />
          </div>
          <h3 className="text-[18px] font-bold text-slate-900">
            How to get your Service Account JSON
          </h3>
        </div>
        <ol className="list-decimal list-inside space-y-3 text-[14px] leading-relaxed ml-1 text-slate-600">
          <li>
            Go to{' '}
            <a
              href="https://console.cloud.google.com/iam-admin/serviceaccounts"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#007AFF] font-semibold hover:underline"
            >
              GCP Console → IAM & Admin → Service Accounts
            </a>
          </li>
          <li>Create a new service account or select an existing one</li>
          <li>Click "Keys" tab → "Add Key" → "Create new key" → JSON</li>
          <li>Download the JSON file and upload it using the wizard above</li>
        </ol>
        <div className="mt-5 p-5 rounded-xl bg-[#90FCA6]/10 border border-[#90FCA6]/20">
          <p className="text-[14px] text-slate-600 leading-relaxed">
            <strong className="text-slate-900 font-semibold">Required roles:</strong> BigQuery Data Viewer, Billing Account Viewer (for cost data)
          </p>
        </div>
      </div>
    </div>
  )
}
