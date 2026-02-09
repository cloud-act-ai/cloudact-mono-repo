"use client"

import { useState } from "react"
import { Loader2, Check, X, RefreshCw, Trash2, Key, AlertCircle, Clock, Shield, Sparkles } from "lucide-react"

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
import { cn } from "@/lib/utils"

// ============================================
// Types
// ============================================

export interface IntegrationStatus {
  provider: string
  status: "VALID" | "INVALID" | "PENDING" | "NOT_CONFIGURED" | "EXPIRED"
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
// Status Badge Component (Ultra-Premium)
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
      className: cn(
        "bg-gradient-to-r from-[#90FCA6]/20 to-[#B8FDCA]/20",
        "text-[#1a7a3a] border border-[#90FCA6]/40",
        "hover:from-[#90FCA6]/30 hover:to-[#B8FDCA]/30",
        "shadow-[0_2px_8px_rgba(144,252,166,0.2)]",
        "transition-all duration-200"
      ),
    },
    INVALID: {
      variant: "destructive",
      text: "Invalid",
      className: cn(
        "bg-gradient-to-r from-[#FF6C5E]/15 to-[#FF6C5E]/10",
        "text-[#FF6C5E] border border-[#FF6C5E]/30",
        "hover:from-[#FF6C5E]/20 hover:to-[#FF6C5E]/15",
        "shadow-[0_2px_8px_rgba(255,108,94,0.15)]",
        "transition-all duration-200"
      ),
    },
    PENDING: {
      variant: "secondary",
      text: "Validating...",
      className: cn(
        "bg-gradient-to-r from-amber-50 to-amber-100/50",
        "text-amber-700 border border-amber-200/50",
        "hover:from-amber-100 hover:to-amber-100",
        "transition-all duration-200"
      ),
    },
  }

  const config = variants[status]
  if (!config) return null

  return (
    <Badge
      variant={config.variant}
      className={cn("px-3 py-1 text-[11px] font-semibold rounded-full", config.className)}
      aria-label={`Integration status: ${config.text}`}
    >
      {status === "VALID" && (
        <span className="h-1.5 w-1.5 rounded-full bg-[#1a7a3a] mr-1.5 animate-pulse" />
      )}
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
      className={cn(
        "relative overflow-hidden rounded-2xl",
        "bg-white/[0.98] backdrop-blur-sm",
        "transition-all duration-300 ease-out",
        "hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:-translate-y-0.5",
        status === "INVALID"
          ? "border-2 border-[#FF6C5E] shadow-[0_4px_20px_rgba(255,108,94,0.15)]"
          : "border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
      )}
    >
      {/* Top gradient accent bar */}
      <div className={cn(
        "absolute top-0 left-0 right-0 h-[3px]",
        status === "VALID" && "bg-gradient-to-r from-[var(--cloudact-mint)] via-[var(--cloudact-mint-light)] to-transparent",
        status === "INVALID" && "bg-gradient-to-r from-[var(--cloudact-coral)] to-[var(--cloudact-coral)]/50",
        status === "NOT_CONFIGURED" && "bg-gradient-to-r from-slate-200 via-slate-300 to-transparent",
        status === "PENDING" && "bg-gradient-to-r from-amber-400 via-amber-300 to-transparent"
      )} />

      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {/* Integration icon - Ultra-premium styling */}
            {icon ? (
              <div className={cn(
                "h-14 w-14 rounded-2xl flex items-center justify-center flex-shrink-0",
                "bg-gradient-to-br from-slate-50 to-slate-100",
                "border border-slate-200/80 shadow-sm",
                "transition-all duration-200",
                "group-hover:shadow-md"
              )}>
                {icon}
              </div>
            ) : (
              <ProviderLogo
                provider={provider as any}
                size="md"
                showLabel={false}
              />
            )}
            <div className="min-w-0">
              <CardTitle className="text-[16px] font-bold text-slate-900 tracking-tight">{providerName}</CardTitle>
              <CardDescription className="text-[12px] text-slate-500 mt-1 line-clamp-2">{providerDescription}</CardDescription>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-2">
        {/* Error Alert - Ultra-premium styling */}
        {integration?.last_error && status === "INVALID" && (
          <Alert
            variant="destructive"
            className={cn(
              "rounded-xl border border-[#FF6C5E]/30",
              "bg-gradient-to-r from-[#FF6C5E]/10 to-[#FF6C5E]/5",
              "shadow-[0_2px_12px_rgba(255,108,94,0.1)]"
            )}
          >
            <AlertCircle className="h-4 w-4 text-[#FF6C5E]" />
            <AlertTitle className="text-[#FF6C5E] font-semibold">Validation Error</AlertTitle>
            <AlertDescription className="text-slate-700 mt-1 text-[12px]">{integration.last_error}</AlertDescription>
          </Alert>
        )}

        {/* Setup Form or Status Display */}
        {showSetup ? (
          <div className={cn(
            "space-y-4 p-5 rounded-xl",
            "bg-gradient-to-br from-slate-50 to-slate-100/50",
            "border border-slate-200/80",
            "shadow-inner"
          )}>
            <div className="space-y-3">
              <Label
                htmlFor={`${provider}-credential`}
                className="text-[13px] font-semibold text-slate-700"
              >
                {provider === "gcp" ? "Service Account JSON" : "API Key"}
              </Label>
              {inputType === "textarea" ? (
                <textarea
                  id={`${provider}-credential`}
                  className={cn(
                    "flex min-h-[150px] w-full rounded-xl px-4 py-3 text-[13px] font-mono",
                    "bg-white border border-slate-200",
                    "placeholder:text-slate-400 text-slate-900",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cloudact-mint)]/40 focus-visible:border-[var(--cloudact-mint)]",
                    "focus:shadow-[0_0_20px_rgba(144,252,166,0.15)]",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    "transition-all duration-200",
                    validationError && "border-[var(--cloudact-coral)] focus-visible:ring-[var(--cloudact-coral)]/40"
                  )}
                  placeholder={placeholder}
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  disabled={localLoading}
                  aria-describedby={validationError ? `${provider}-error` : undefined}
                />
              ) : (
                <Input
                  id={`${provider}-credential`}
                  type="password"
                  placeholder={placeholder}
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  disabled={localLoading}
                  aria-describedby={validationError ? `${provider}-error` : undefined}
                  className={cn(
                    "h-12 rounded-xl font-mono text-[13px]",
                    "bg-white border border-slate-200",
                    "placeholder:text-slate-400",
                    "focus-visible:ring-2 focus-visible:ring-[var(--cloudact-mint)]/40 focus-visible:border-[var(--cloudact-mint)]",
                    "focus:shadow-[0_0_20px_rgba(144,252,166,0.15)]",
                    "transition-all duration-200",
                    validationError && "border-[var(--cloudact-coral)] focus-visible:ring-[var(--cloudact-coral)]/40"
                  )}
                />
              )}
              <p className="text-[11px] text-slate-500">{helperText}</p>
              {validationError && (
                <p
                  id={`${provider}-error`}
                  className="text-[11px] text-[#FF6C5E] font-medium flex items-center gap-1.5"
                  role="alert"
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  {validationError}
                </p>
              )}
            </div>
            <div className="flex gap-3 pt-1">
              <Button
                onClick={handleSetup}
                disabled={!credential.trim() || localLoading}
                className={cn(
                  "h-11 px-5 rounded-xl text-[13px] font-semibold",
                  "bg-gradient-to-r from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)]",
                  "text-slate-900 shadow-sm",
                  "hover:shadow-[0_4px_20px_rgba(144,252,166,0.35)] hover:scale-[1.02]",
                  "active:scale-[0.98]",
                  "disabled:from-slate-100 disabled:to-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:scale-100",
                  "transition-all duration-200"
                )}
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
                className={cn(
                  "h-11 px-5 rounded-xl text-[13px] font-medium",
                  "bg-white border border-slate-200",
                  "hover:bg-slate-50 hover:border-slate-300",
                  "transition-all duration-200"
                )}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : isConfigured ? (
          <div className="space-y-4">
            {/* Credential Info - Ultra-premium card */}
            <div className={cn(
              "flex items-center gap-4 p-4 rounded-xl",
              "bg-gradient-to-r from-slate-50 to-white",
              "border border-slate-200/80",
              "shadow-[0_2px_8px_rgba(0,0,0,0.03)]"
            )}>
              <div className={cn(
                "h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0",
                "bg-gradient-to-br from-[var(--cloudact-mint)]/10 to-[var(--cloudact-mint-light)]/10",
                "border border-[var(--cloudact-mint)]/20"
              )}>
                <Key className="h-5 w-5 text-[#1a7a3a]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-slate-900">
                  {integration?.credential_name || `${providerName} Credential`}
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Last validated: {formatDate(integration?.last_validated_at)}
                  </span>
                  {integration?.created_at && (
                    <span className="flex items-center gap-1.5">
                      <span className="text-slate-300">•</span>
                      Added: {formatDate(integration?.created_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Security Note - Premium styling */}
            <div className={cn(
              "flex items-start gap-3 p-4 rounded-xl",
              "bg-gradient-to-r from-[var(--cloudact-mint)]/[0.05] to-transparent",
              "border border-[var(--cloudact-mint)]/10"
            )}>
              <Shield className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#1a7a3a]" />
              <span className="text-[11px] text-slate-600 leading-relaxed">
                Credentials are encrypted using Google Cloud KMS with AES-256 encryption.
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center py-10 px-4">
            {/* Empty state - Premium styling */}
            <div className={cn(
              "inline-flex items-center justify-center h-16 w-16 rounded-2xl mb-5",
              "bg-gradient-to-br from-slate-100 to-slate-50",
              "border border-slate-200/80 shadow-sm"
            )}>
              <Sparkles className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-[14px] text-slate-600 mb-6 max-w-md mx-auto leading-relaxed">
              No {providerName} integration configured. Connect to start tracking usage and costs.
            </p>
            <Button
              onClick={() => setShowSetup(true)}
              size="lg"
              className={cn(
                "h-12 px-6 rounded-xl text-[14px] font-semibold",
                "bg-gradient-to-r from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)]",
                "text-slate-900 shadow-sm",
                "hover:shadow-[0_4px_20px_rgba(144,252,166,0.35)] hover:scale-[1.02]",
                "active:scale-[0.98]",
                "transition-all duration-200"
              )}
            >
              <Key className="h-4 w-4 mr-2" />
              Connect {providerName}
            </Button>
          </div>
        )}
      </CardContent>

      {/* Actions Footer - Ultra-premium styling */}
      {isConfigured && !showSetup && (
        <CardFooter className={cn(
          "flex flex-wrap justify-between gap-3 pt-5",
          "border-t border-slate-100",
          "bg-gradient-to-r from-slate-50/80 to-white"
        )}>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleValidate}
              disabled={isLoading || localLoading}
              className={cn(
                "h-10 px-4 rounded-xl text-[12px] font-medium",
                "bg-white border border-slate-200",
                "text-[#1a7a3a] hover:bg-[var(--cloudact-mint)]/10 hover:border-[var(--cloudact-mint)]/30",
                "shadow-sm hover:shadow",
                "transition-all duration-200"
              )}
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
              className={cn(
                "h-10 px-4 rounded-xl text-[12px] font-medium",
                "bg-white border border-slate-200",
                "hover:bg-slate-50 hover:border-slate-300",
                "shadow-sm hover:shadow",
                "transition-all duration-200"
              )}
            >
              <Key className="h-4 w-4 mr-1.5" />
              Update Credential
            </Button>
          </div>

          {/* Delete Dialog - Ultra-premium styling */}
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-10 px-4 rounded-xl text-[12px] font-medium",
                  "text-[#FF6C5E] hover:text-[#FF6C5E]",
                  "hover:bg-[var(--cloudact-coral)]/10",
                  "transition-all duration-200"
                )}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Remove
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px] rounded-2xl border-slate-200/80 shadow-2xl">
              <DialogHeader>
                <DialogTitle className="text-[18px] font-bold text-slate-900 tracking-tight">
                  Remove {providerName} Integration
                </DialogTitle>
                <DialogDescription className="text-[13px] text-slate-500 mt-2 leading-relaxed">
                  Are you sure you want to remove this integration? This will delete the stored credentials and any
                  pipelines using this integration will stop working.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-3 sm:gap-3 mt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteDialog(false)}
                  className={cn(
                    "h-11 px-5 rounded-xl text-[13px] font-medium",
                    "bg-white border border-slate-200",
                    "hover:bg-slate-50 hover:border-slate-300",
                    "transition-all duration-200"
                  )}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={localLoading}
                  className={cn(
                    "h-11 px-5 rounded-xl text-[13px] font-semibold",
                    "bg-[var(--cloudact-coral)] hover:bg-[#e55a4d]",
                    "text-white shadow-sm",
                    "hover:shadow-[0_4px_20px_rgba(255,108,94,0.3)]",
                    "active:scale-[0.98]",
                    "transition-all duration-200"
                  )}
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
