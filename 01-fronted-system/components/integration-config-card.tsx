"use client"

import { useState } from "react"
import { Loader2, Check, X, RefreshCw, Trash2, Key, AlertCircle, Clock, Shield } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ProviderLogo } from "@/components/ui/optimized-image"

// ============================================
// Brand Colors (Integrations = Features = Teal)
// ============================================
const BRAND_COLORS = {
  // Teal (Integrations/Features)
  teal: "#007A78",
  tealLight: "#14B8A6",
  tealDark: "#005F5D",
  tealBg: "#F0FDFA",

  // Coral (Destructive/Warning)
  coral: "#FF6E50",
  coralLight: "#FF8A73",
  coralDark: "#E55A3C",
  coralBg: "#FFF5F3",

  // Status Colors
  success: "#007A78",
  successBg: "#F0FDFA",
  warning: "#FF6E50",
  warningBg: "#FFF5F3",
  error: "#FF6E50",
  errorBg: "#FFF5F3",
  gray: "#8E8E93",
  grayBg: "#F9FAFB",
}

// ============================================
// Types
// ============================================

export interface IntegrationStatus {
  provider: string
  status: "VALID" | "INVALID" | "PENDING" | "NOT_CONFIGURED"
  credential_name?: string
  last_validated_at?: string
  last_error?: string
  created_at?: string
}

export interface IntegrationConfigCardProps {
  provider: string
  providerName: string
  providerDescription: string
  /** @deprecated Use provider prop instead - logo will be auto-loaded */
  icon?: React.ReactNode
  placeholder: string
  inputType: "text" | "textarea"
  helperText: string
  integration?: IntegrationStatus
  onSetup: (credential: string) => Promise<void>
  onValidate: () => Promise<void>
  onDelete: () => Promise<void>
  isLoading: boolean
  /** Optional client-side validation for credential format */
  validateCredentialFormat?: (credential: string) => { valid: boolean; error?: string }
}

// ============================================
// Status Badge Component
// ============================================

function StatusBadge({ status }: { status: string }) {
  // Only show badge for VALID (connected) status
  // NOT_CONFIGURED shows "Connect" button instead
  if (status === "NOT_CONFIGURED") {
    return null
  }

  const variants: Record<
    string,
    { variant: "default" | "secondary" | "destructive" | "outline"; text: string; className?: string }
  > = {
    VALID: {
      variant: "default",
      text: "Connected",
      className: "bg-[#F0FDFA] text-[#007A78] border-[#007A78] hover:bg-[#E5F9F8]",
    },
    INVALID: {
      variant: "destructive",
      text: "Invalid",
      className: "bg-[#FFF5F3] text-[#FF6E50] border-[#FF6E50] hover:bg-[#FFE8E3]",
    },
    PENDING: {
      variant: "secondary",
      text: "Validating...",
      className: "bg-[#FFF5F3] text-[#FF6E50] border-[#FF6E50] hover:bg-[#FFE8E3]",
    },
  }

  const config = variants[status]
  if (!config) return null

  return (
    <Badge variant={config.variant} className={config.className}>
      {status === "VALID" && <Check className="h-3 w-3 mr-1" />}
      {status === "INVALID" && <X className="h-3 w-3 mr-1" />}
      {status === "PENDING" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
      {config.text}
    </Badge>
  )
}

// ============================================
// Integration Config Card Component
// ============================================

export function IntegrationConfigCard({
  provider,
  providerName,
  providerDescription,
  icon,
  placeholder,
  inputType,
  helperText,
  integration,
  onSetup,
  onValidate,
  onDelete,
  isLoading,
  validateCredentialFormat,
}: IntegrationConfigCardProps) {
  const [showSetup, setShowSetup] = useState(false)
  const [credential, setCredential] = useState("")
  const [localLoading, setLocalLoading] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const status = integration?.status || "NOT_CONFIGURED"
  const isConfigured = status !== "NOT_CONFIGURED"

  const handleSetup = async () => {
    if (!credential.trim()) return

    // Client-side format validation (if provided)
    if (validateCredentialFormat) {
      const validation = validateCredentialFormat(credential)
      if (!validation.valid) {
        setValidationError(validation.error || "Invalid credential format")
        return
      }
    }
    setValidationError(null)

    setLocalLoading(true)
    try {
      await onSetup(credential)
      setCredential("")
      setShowSetup(false)
    } finally {
      setLocalLoading(false)
    }
  }

  const handleValidate = async () => {
    setLocalLoading(true)
    try {
      await onValidate()
    } finally {
      setLocalLoading(false)
    }
  }

  const handleDelete = async () => {
    setLocalLoading(true)
    try {
      await onDelete()
      setShowDeleteDialog(false)
    } finally {
      setLocalLoading(false)
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Never"
    const date = new Date(dateString)
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <Card
      className={
        status === "INVALID"
          ? "border-2 border-[#FF6E50] shadow-sm hover:shadow-md transition-shadow"
          : "console-stat-card border shadow-sm hover:shadow-md transition-shadow"
      }
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Integration icon - Auto-loaded provider logo with consistent sizing */}
            {icon ? (
              <div className="h-12 w-12 rounded-lg bg-[#F0FDFA] flex items-center justify-center shadow-sm border border-[#14B8A6]/20">
                {icon}
              </div>
            ) : (
              <ProviderLogo
                provider={provider as any}
                size="md"
                showLabel={false}
              />
            )}
            <div>
              <CardTitle className="console-card-title">{providerName}</CardTitle>
              <CardDescription className="console-subheading mt-1">{providerDescription}</CardDescription>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Error Alert - Use Coral */}
        {integration?.last_error && status === "INVALID" && (
          <Alert variant="destructive" className="border-2 border-[#FF6E50] bg-[#FFF5F3]">
            <AlertCircle className="h-4 w-4 text-[#FF6E50]" />
            <AlertTitle className="text-[#FF6E50] font-semibold">Validation Error</AlertTitle>
            <AlertDescription className="text-foreground/90 mt-1">{integration.last_error}</AlertDescription>
          </Alert>
        )}

        {/* Setup Form or Status Display */}
        {showSetup ? (
          <div className="space-y-4 p-5 border-2 border-[#007A78]/20 rounded-xl bg-[#007A78]/5">
            <div className="space-y-2">
              <Label htmlFor={`${provider}-credential`} className="console-label text-foreground font-medium">
                {provider === "gcp" ? "Service Account JSON" : "API Key"}
              </Label>
              {inputType === "textarea" ? (
                <textarea
                  id={`${provider}-credential`}
                  className="flex min-h-[150px] w-full rounded-xl border-2 border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007A78] focus-visible:border-[#007A78] disabled:cursor-not-allowed disabled:opacity-50 font-mono transition-colors"
                  placeholder={placeholder}
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                />
              ) : (
                <Input
                  id={`${provider}-credential`}
                  type="password"
                  placeholder={placeholder}
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  className="h-11 rounded-xl console-input font-mono border-2 border-input focus-visible:ring-2 focus-visible:ring-[#007A78] focus-visible:border-[#007A78] transition-colors"
                />
              )}
              <p className="console-small text-muted-foreground">{helperText}</p>
              {validationError && (
                <p className="console-small text-[#FF6E50] mt-1 font-medium">{validationError}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSetup}
                disabled={!credential.trim() || localLoading}
                className="h-11 rounded-xl bg-[#007A78] hover:bg-[#005F5D] text-white font-medium shadow-sm hover:shadow transition-all focus-visible:outline-[#007A78] focus-visible:ring-[#007A78]"
              >
                {localLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isConfigured ? "Update Credential" : "Connect"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowSetup(false)
                  setCredential("")
                }}
                className="h-11 rounded-xl console-button-secondary border-2 border-border hover:bg-[#007A78]/5 transition-colors focus-visible:outline-[#007A78] focus-visible:ring-[#007A78]"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : isConfigured ? (
          <div className="space-y-4">
            {/* Credential Info */}
            <div className="flex items-center gap-4 p-4 border-2 border-[#14B8A6]/20 rounded-lg bg-[#F0FDFA] shadow-sm">
              <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center shadow-sm border border-[#14B8A6]/30">
                <Key className="h-5 w-5 text-[#14B8A6]" />
              </div>
              <div className="flex-1">
                <p className="console-card-title text-foreground">
                  {integration?.credential_name || `${providerName} Credential`}
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 console-small text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-[#007A78]" />
                    Last validated: {formatDate(integration?.last_validated_at)}
                  </span>
                  {integration?.created_at && (
                    <span className="flex items-center gap-1.5">
                      <span className="text-muted-foreground/50">•</span>
                      Added: {formatDate(integration?.created_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Security Note */}
            <div className="flex items-start gap-2.5 console-small text-muted-foreground bg-[#007A78]/5 p-3 rounded-xl border border-border">
              <Shield className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#14B8A6]" />
              <span>Credentials are encrypted using Google Cloud KMS and never stored in plain text.</span>
            </div>
          </div>
        ) : (
          <div className="text-center py-10 px-4">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-[#F0FDFA] mb-4 shadow-sm border border-[#14B8A6]/20">
              <Key className="h-8 w-8 text-[#14B8A6]" />
            </div>
            <p className="console-body text-muted-foreground mb-6 max-w-md mx-auto">
              No {providerName} integration configured. Click below to add your credentials.
            </p>
            <Button
              onClick={() => setShowSetup(true)}
              size="lg"
              className="h-11 rounded-xl bg-[#007A78] hover:bg-[#005F5D] text-white font-medium shadow-sm hover:shadow transition-all focus-visible:outline-[#007A78] focus-visible:ring-[#007A78]"
            >
              <Key className="h-4 w-4 mr-2" />
              Connect {providerName}
            </Button>
          </div>
        )}
      </CardContent>

      {/* Actions Footer */}
      {isConfigured && !showSetup && (
        <CardFooter className="flex justify-between border-t pt-5 bg-[#007A78]/5">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleValidate}
              disabled={isLoading || localLoading}
              className="h-11 rounded-xl border-2 border-border text-[#007A78] hover:bg-[#007A78]/5 hover:text-[#005F5D] font-medium transition-colors shadow-sm focus-visible:outline-[#007A78] focus-visible:ring-[#007A78]"
            >
              {localLoading ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1.5" />
              )}
              Re-validate
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSetup(true)}
              className="h-11 rounded-xl console-button-secondary border-2 border-border hover:bg-[#007A78]/5 transition-colors shadow-sm focus-visible:outline-[#007A78] focus-visible:ring-[#007A78]"
            >
              <Key className="h-4 w-4 mr-1.5" />
              Update Credential
            </Button>
          </div>

          {/* Delete Dialog */}
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-11 rounded-xl text-[#FF6E50] hover:text-[#E55A3C] hover:bg-[#FF6E50]/10 font-medium transition-colors focus-visible:outline-[#007A78] focus-visible:ring-[#007A78]"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Remove
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold text-foreground">
                  Remove {providerName} Integration
                </DialogTitle>
                <DialogDescription className="text-muted-foreground mt-2">
                  Are you sure you want to remove this integration? This will delete the stored credentials and any
                  pipelines using this integration will stop working.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteDialog(false)}
                  className="h-11 rounded-xl console-button-secondary border-2 border-border hover:bg-[#007A78]/5 transition-colors focus-visible:outline-[#007A78] focus-visible:ring-[#007A78]"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={localLoading}
                  className="h-11 rounded-xl bg-[#FF6E50] hover:bg-[#E55A3C] text-white font-medium shadow-sm hover:shadow transition-all focus-visible:outline-[#007A78] focus-visible:ring-[#007A78]"
                >
                  {localLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Remove Integration
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardFooter>
      )}
    </Card>
  )
}
