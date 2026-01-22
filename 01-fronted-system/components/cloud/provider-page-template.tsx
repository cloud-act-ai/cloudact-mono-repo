"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  Shield,
  Clock,
  Upload,
  FileJson,
  X,
  Key,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  getIntegrations,
  setupIntegration,
  validateIntegration,
  deleteIntegration,
  IntegrationProvider,
} from "@/actions/integrations"
import { ProviderLogo } from "@/components/ui/provider-logo"

// ============================================================================
// SECURITY HELPERS
// ============================================================================

/**
 * Safely parse a docs step string that may contain HTML links.
 * Security: Only allows safe anchor tags with href - strips all other HTML.
 */
interface ParsedSegment {
  type: 'text' | 'link' | 'bold' | 'code'
  content: string
  href?: string
}

function parseDocStep(htmlContent: string): ParsedSegment[] {
  const segments: ParsedSegment[] = []

  // Clone content to work with - strip any dangerous patterns first
  const safeContent = htmlContent
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')

  // Match patterns in order: links, bold, code
  const combinedRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>|<strong>([^<]+)<\/strong>|<code>([^<]+)<\/code>/gi

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = combinedRegex.exec(safeContent)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      const textBefore = safeContent.slice(lastIndex, match.index).replace(/<[^>]*>/g, '')
      if (textBefore) {
        segments.push({ type: 'text', content: textBefore })
      }
    }

    if (match[1] && match[2]) {
      // Link: <a href="...">...</a>
      const href = match[1]
      const linkText = match[2]
      if (/^https?:\/\//i.test(href)) {
        segments.push({ type: 'link', content: linkText, href })
      } else {
        segments.push({ type: 'text', content: linkText })
      }
    } else if (match[3]) {
      // Bold: <strong>...</strong>
      segments.push({ type: 'bold', content: match[3] })
    } else if (match[4]) {
      // Code: <code>...</code>
      segments.push({ type: 'code', content: match[4] })
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < safeContent.length) {
    const remainingText = safeContent.slice(lastIndex).replace(/<[^>]*>/g, '')
    if (remainingText) {
      segments.push({ type: 'text', content: remainingText })
    }
  }

  if (segments.length === 0) {
    segments.push({ type: 'text', content: safeContent.replace(/<[^>]*>/g, '') })
  }

  return segments
}

/**
 * Component that safely renders docs step content with proper links.
 */
function SafeStepContent({ content }: { content: string }) {
  const segments = parseDocStep(content)

  return (
    <>
      {segments.map((segment, i) => {
        if (segment.type === 'link' && segment.href) {
          return (
            <a
              key={`segment-${i}`}
              href={segment.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#007AFF] hover:underline font-medium"
            >
              {segment.content}
            </a>
          )
        }
        if (segment.type === 'bold') {
          return <strong key={`segment-${i}`} className="font-semibold text-black">{segment.content}</strong>
        }
        if (segment.type === 'code') {
          return <code key={`segment-${i}`} className="px-1.5 py-0.5 bg-slate-100 rounded text-[13px] font-mono">{segment.content}</code>
        }
        return <span key={`segment-${i}`}>{segment.content}</span>
      })}
    </>
  )
}

// ============================================================================
// TYPES
// ============================================================================

export type CredentialType = 'json_file' | 'text_input' | 'multi_field'

export interface CredentialField {
  name: string
  label: string
  placeholder: string
  type: 'text' | 'password' | 'textarea'
  required: boolean
  helperText?: string
}

export interface AuthMethod {
  id: string
  label: string
  type: CredentialType
  fields?: CredentialField[]
  fileType?: string
  fileLabel?: string
  validateFile?: (content: string) => { valid: boolean; error?: string; parsed?: Record<string, unknown> }
}

export interface CloudProviderConfig {
  id: IntegrationProvider
  backendKey: string // Key used in backend (e.g., "GCP_SA", "AWS_IAM")
  name: string
  description: string
  icon: React.ReactNode
  color: string
  authMethods: AuthMethod[]
  docsUrl: string
  docsSteps: string[]
  billingSetupInfo?: string
}

export interface CloudProviderPageTemplateProps {
  config: CloudProviderConfig
}

interface IntegrationStatus {
  provider: string
  status: "VALID" | "INVALID" | "PENDING" | "NOT_CONFIGURED" | "EXPIRED"
  credential_name?: string
  last_validated_at?: string
  last_error?: string
  created_at?: string
}

// ============================================================================
// STATUS BADGE
// ============================================================================

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

  const configVariant = variants[status] || variants.NOT_CONFIGURED

  return (
    <div className={`${configVariant.className} px-3 py-1.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5`}>
      {configVariant.icon}
      {configVariant.text}
    </div>
  )
}

// ============================================================================
// STEP INDICATOR
// ============================================================================

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: totalSteps }).map((_, index) => (
        <div key={index} className="flex items-center">
          <div
            className={`h-2 w-8 rounded-full transition-all ${
              index + 1 <= currentStep ? 'bg-[#90FCA6]' : 'bg-border'
            }`}
          />
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CloudProviderPageTemplate({ config }: CloudProviderPageTemplateProps) {
  const params = useParams()
  const _router = useRouter()
  const orgSlug = params.orgSlug as string
  const fileInputRef = useRef<HTMLInputElement>(null)

  // State
  const [integration, setIntegration] = useState<IntegrationStatus | undefined>()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Auth method state
  const [selectedAuthMethod, setSelectedAuthMethod] = useState<string>(config.authMethods[0]?.id || '')
  const [wizardStep, setWizardStep] = useState(1)
  const [showSetup, setShowSetup] = useState(false)
  const [setupLoading, setSetupLoading] = useState(false)

  // File upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [parsedFile, setParsedFile] = useState<Record<string, unknown> | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Field input state (for text/multi-field auth)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})

  // Delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const status = integration?.status || "NOT_CONFIGURED"
  const isConfigured = status !== "NOT_CONFIGURED"

  const currentAuthMethod = config.authMethods.find(m => m.id === selectedAuthMethod)

  // Load integration status
  const loadIntegration = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const result = await getIntegrations(orgSlug)

    if (result.success && result.integrations) {
      const providerIntegration = result.integrations?.integrations?.[config.backendKey]
      setIntegration(providerIntegration)
    } else {
      setError(result.error || "Failed to load integration status")
    }

    setIsLoading(false)
  }, [orgSlug, config.backendKey])

  useEffect(() => {
    void loadIntegration()
  }, [loadIntegration])

  // Clear messages
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 10000)
      return () => clearTimeout(timer)
    }
  }, [error])

  // Handle file selection
  const handleFileSelect = async (file: File) => {
    setError(null)

    if (!currentAuthMethod || currentAuthMethod.type !== 'json_file') return

    const expectedType = currentAuthMethod.fileType || '.json'
    if (!file.name.endsWith(expectedType)) {
      setError(`Please upload a ${expectedType} file`)
      return
    }

    if (file.size > 100000) {
      setError("File too large. Maximum size is 100KB")
      return
    }

    try {
      const content = await file.text()

      if (currentAuthMethod.validateFile) {
        const validation = currentAuthMethod.validateFile(content)
        if (!validation.valid) {
          setError(validation.error || "Invalid file format")
          return
        }
        setParsedFile(validation.parsed || null)
      } else {
        // Default JSON validation
        try {
          const parsed = JSON.parse(content)
          setParsedFile(parsed)
        } catch {
          setError("Invalid JSON file")
          return
        }
      }

      setUploadedFile(file)
      setFileContent(content)
      setWizardStep(2)
    } catch {
      setError("Error reading file. Please try again.")
    }
  }

  // Drag and drop handlers
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  // Clear file
  const clearFile = () => {
    setUploadedFile(null)
    setFileContent(null)
    setParsedFile(null)
    setWizardStep(1)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  // Reset form
  const resetForm = () => {
    clearFile()
    setFieldValues({})
    setShowSetup(false)
  }

  // Handle setup
  const handleSetup = async () => {
    setError(null)
    setSuccessMessage(null)
    setSetupLoading(true)
    setWizardStep(3)

    try {
      let credential: string

      if (currentAuthMethod?.type === 'json_file') {
        if (!fileContent) {
          setError("No file uploaded")
          setWizardStep(2)
          setSetupLoading(false)
          return
        }
        credential = fileContent
      } else if (currentAuthMethod?.type === 'text_input' || currentAuthMethod?.type === 'multi_field') {
        const fields = currentAuthMethod.fields || []
        const missingFields = fields.filter(f => f.required && !fieldValues[f.name])
        if (missingFields.length > 0) {
          setError(`Missing required fields: ${missingFields.map(f => f.label).join(', ')}`)
          setWizardStep(2)
          setSetupLoading(false)
          return
        }
        credential = JSON.stringify(fieldValues)
      } else {
        setError("Invalid auth method")
        setSetupLoading(false)
        return
      }

      const result = await setupIntegration({
        orgSlug,
        provider: config.id,
        credential,
      })

      if (result.success) {
        setSuccessMessage(
          result.validationStatus === "VALID"
            ? `${config.name} connected and validated successfully!`
            : `${config.name} saved (Status: ${result.validationStatus})`
        )
        resetForm()
        await loadIntegration()
      } else {
        setError(result.error || result.message || "Setup failed. Please check your credentials and try again.")
        setWizardStep(2)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to setup integration")
      setWizardStep(2)
    } finally {
      setSetupLoading(false)
    }
  }

  // Handle validate
  const handleValidate = async () => {
    setError(null)
    setSuccessMessage(null)
    setSetupLoading(true)

    try {
      const result = await validateIntegration(orgSlug, config.id)

      if (result.validationStatus === "VALID") {
        setSuccessMessage(`${config.name} credentials validated successfully!`)
      } else {
        setError(result.error || "Validation failed")
      }

      await loadIntegration()
    } finally {
      setSetupLoading(false)
    }
  }

  // Handle delete
  const handleDelete = async () => {
    setError(null)
    setSuccessMessage(null)
    setSetupLoading(true)

    try {
      const result = await deleteIntegration(orgSlug, config.id)

      if (result.success) {
        setSuccessMessage(`${config.name} integration removed`)
        setShowDeleteDialog(false)
        await loadIntegration()
      } else {
        setError(result.error || "Delete failed")
      }
    } finally {
      setSetupLoading(false)
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
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" style={{ color: config.color }} />
          <p className="text-[14px] text-slate-500">Loading integration...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header with back link */}
      <div className="flex items-center gap-3">
        <Link href={`/${orgSlug}/integrations/cloud-providers`}>
          <button className="h-10 px-4 rounded-xl hover:bg-slate-100 transition-colors flex items-center gap-2 text-slate-600 hover:text-black font-medium text-[14px]">
            <ArrowLeft className="h-4 w-4" />
            Back to Providers
          </button>
        </Link>
      </div>

      {/* Provider Header */}
      <div className="flex items-center gap-5">
        <div className="h-16 w-16 rounded-2xl bg-white border-2 border-slate-200 flex items-center justify-center shadow-lg">
          <ProviderLogo provider={config.id} size={40} />
        </div>
        <div>
          <h1 className="text-[32px] font-bold text-black tracking-tight">{config.name}</h1>
          <p className="text-[15px] text-slate-500 mt-2">{config.description}</p>
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
              <h3 className="text-[15px] font-semibold text-black">Error</h3>
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
              <h3 className="text-[15px] font-semibold text-black">Success</h3>
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
              <div
                className="h-12 w-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${config.color}15` }}
              >
                <Key className="h-6 w-6" style={{ color: config.color }} />
              </div>
              <div>
                <h2 className="text-[18px] font-bold text-black">Integration Connection</h2>
                <p className="text-[14px] text-slate-500 mt-1">
                  {config.authMethods.length > 1
                    ? "Choose your preferred authentication method"
                    : config.authMethods[0]?.label || "Configure your credentials"
                  }
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
                  <h4 className="text-[14px] font-semibold text-black">Validation Error</h4>
                  <p className="text-[13px] text-red-700 mt-1">{integration.last_error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Setup Form */}
          {showSetup ? (
            <div className="space-y-6 p-6 border-2 border-slate-200 rounded-2xl bg-slate-50">
              {/* Step Indicator */}
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold text-black">Connection Wizard</span>
                <StepIndicator currentStep={wizardStep} totalSteps={3} />
              </div>

              {/* Auth Method Selector (if multiple) */}
              {config.authMethods.length > 1 && wizardStep === 1 && (
                <div className="space-y-3">
                  <Label className="text-[14px] font-semibold text-black">Authentication Method</Label>
                  <Select value={selectedAuthMethod} onValueChange={setSelectedAuthMethod}>
                    <SelectTrigger className="h-12 rounded-xl border-2 border-slate-200">
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      {config.authMethods.map((method) => (
                        <SelectItem key={method.id} value={method.id}>
                          {method.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* File Upload */}
              {currentAuthMethod?.type === 'json_file' && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={currentAuthMethod.fileType || ".json"}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleFileSelect(file)
                    }}
                    className="hidden"
                  />

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
                        <p className="text-[16px] font-bold text-black mb-2">
                          {isDragging ? 'Drop your file here' : `Upload ${currentAuthMethod.fileLabel || 'Credential File'}`}
                        </p>
                        <p className="text-[14px] text-slate-500">Drag and drop or click to browse</p>
                        <p className="text-[13px] text-slate-400 mt-2">Maximum file size: 100KB</p>
                      </div>
                    </div>
                  )}

                  {wizardStep === 2 && uploadedFile && (
                    <div className="border-2 border-[#90FCA6]/30 rounded-2xl p-5 bg-white">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start gap-4 flex-1">
                          <div className="p-3 bg-[#90FCA6]/15 rounded-xl">
                            <FileJson className="h-6 w-6 text-[#1a7a3a]" />
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-[15px] text-black mb-1">{uploadedFile.name}</p>
                            <p className="text-[13px] text-slate-500">{(uploadedFile.size / 1024).toFixed(1)} KB</p>
                          </div>
                        </div>
                        <button
                          onClick={clearFile}
                          className="h-10 w-10 rounded-xl hover:bg-slate-100 transition-colors flex items-center justify-center"
                        >
                          <X className="h-4 w-4 text-slate-600" />
                        </button>
                      </div>

                      {parsedFile && (
                        <div className="space-y-3 pt-4 border-t border-slate-200">
                          {Object.entries(parsedFile).slice(0, 3).map(([key, value]) => (
                            <div key={key} className="flex items-start gap-3">
                              <div className="h-6 w-6 rounded-lg bg-[#90FCA6]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <Check className="h-4 w-4 text-[#1a7a3a]" />
                              </div>
                              <div>
                                <p className="text-[12px] font-semibold text-slate-500 mb-1">{key}</p>
                                <p className="text-[14px] font-mono font-medium text-black truncate max-w-md">
                                  {typeof value === 'string' ? value : JSON.stringify(value)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Text/Multi-field Input */}
              {(currentAuthMethod?.type === 'text_input' || currentAuthMethod?.type === 'multi_field') && wizardStep <= 2 && (
                <div className="space-y-4">
                  {currentAuthMethod.fields?.map((field) => (
                    <div key={field.name} className="space-y-2">
                      <Label className="text-[14px] font-semibold text-black">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </Label>
                      <div className="relative">
                        <Input
                          type={field.type === 'password' && !showPasswords[field.name] ? 'password' : 'text'}
                          placeholder={field.placeholder}
                          value={fieldValues[field.name] || ''}
                          onChange={(e) => setFieldValues(prev => ({ ...prev, [field.name]: e.target.value }))}
                          className="h-12 rounded-xl border-2 border-slate-200 pr-12"
                        />
                        {field.type === 'password' && (
                          <button
                            type="button"
                            onClick={() => setShowPasswords(prev => ({ ...prev, [field.name]: !prev[field.name] }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showPasswords[field.name] ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </button>
                        )}
                      </div>
                      {field.helperText && (
                        <p className="text-[13px] text-slate-500">{field.helperText}</p>
                      )}
                    </div>
                  ))}
                  {wizardStep === 1 && (
                    <Button
                      onClick={() => setWizardStep(2)}
                      disabled={!currentAuthMethod.fields?.every(f => !f.required || fieldValues[f.name])}
                      className="w-full h-12 rounded-xl bg-[#90FCA6] hover:bg-[#6EE890] text-black font-semibold"
                    >
                      Continue
                    </Button>
                  )}
                </div>
              )}

              {/* Step 3: Connecting */}
              {wizardStep === 3 && (
                <div className="text-center py-8">
                  <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" style={{ color: config.color }} />
                  <p className="text-[16px] font-bold text-black mb-2">Connecting to {config.name}...</p>
                  <p className="text-[13px] text-muted-foreground">Encrypting and validating your credentials</p>
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
              {wizardStep === 2 && (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSetup}
                    disabled={setupLoading || (currentAuthMethod?.type === 'json_file' && !fileContent)}
                    className="flex-1 h-12 bg-[#90FCA6] hover:bg-[#6EE890] text-black text-[15px] font-semibold rounded-xl shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {setupLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isConfigured ? "Update Credentials" : `Connect ${config.name}`}
                  </button>
                  <button
                    onClick={resetForm}
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
                  <p className="font-semibold text-[16px] text-black mb-1">
                    {integration?.credential_name || `${config.name} Credentials`}
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
              <div
                className="h-20 w-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
                style={{ backgroundColor: `${config.color}15` }}
              >
                <Upload className="h-10 w-10" style={{ color: config.color }} />
              </div>
              <p className="text-[18px] font-bold text-black mb-3">No Integration Connected</p>
              <p className="text-[15px] text-slate-500 mb-8 max-w-md mx-auto leading-relaxed">
                {config.description}
              </p>
              <button
                onClick={() => {
                  setShowSetup(true)
                  setWizardStep(1)
                }}
                className="h-12 px-6 bg-[#90FCA6] hover:bg-[#6EE890] text-black text-[15px] font-semibold rounded-xl shadow-sm hover:shadow-md transition-all inline-flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Start Connection Wizard
              </button>
            </div>
          )}
        </div>

        {/* Actions Footer */}
        {isConfigured && !showSetup && (
          <div className="flex justify-between border-t border-slate-100 pt-6 px-6 pb-6">
            <div className="flex gap-3">
              <button
                onClick={handleValidate}
                disabled={setupLoading}
                className="h-11 px-5 text-[14px] font-semibold rounded-xl border-2 border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {setupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Re-validate
              </button>
              <button
                onClick={() => {
                  setShowSetup(true)
                  setWizardStep(1)
                }}
                className="h-11 px-5 text-[14px] font-semibold rounded-xl border-2 border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Update Credentials
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
                  <DialogTitle className="text-[20px] font-bold text-black">Remove {config.name} Integration</DialogTitle>
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
                    disabled={setupLoading}
                    className="h-11 px-5 rounded-xl bg-[#FF6C5E] hover:bg-[#FF5533] text-white font-semibold text-[14px] transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {setupLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Remove Integration
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Billing Setup Info */}
      {config.billingSetupInfo && (
        <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-black mb-1">Billing Export Setup Required</h3>
              <p className="text-[14px] text-amber-700">
                <SafeStepContent content={config.billingSetupInfo} />
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Help Section */}
      <div
        className="rounded-2xl border-2 p-6 bg-white shadow-sm"
        style={{ borderColor: `${config.color}40` }}
      >
        <div className="flex items-center gap-3 mb-5">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${config.color}15` }}
          >
            <ExternalLink className="h-5 w-5" style={{ color: config.color }} />
          </div>
          <h3 className="text-[18px] font-bold text-black">
            How to set up {config.name}
          </h3>
        </div>
        <ol className="list-decimal list-inside space-y-3 text-[14px] leading-relaxed ml-1 text-slate-600">
          {config.docsSteps.map((step, idx) => (
            <li key={`step-${idx}`}>
              <SafeStepContent content={step} />
            </li>
          ))}
        </ol>
        <a
          href={config.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-5 text-[14px] font-semibold text-[#007AFF] hover:underline"
        >
          View full documentation
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  )
}
