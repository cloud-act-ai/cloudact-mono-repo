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
  icon: React.ReactNode
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

  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; text: string; className?: string }> = {
    VALID: { variant: "default", text: "Connected", className: "console-badge console-badge-success" },
    INVALID: { variant: "destructive", text: "Invalid", className: "console-badge console-badge-coral" },
    PENDING: { variant: "secondary", text: "Validating...", className: "console-badge console-badge-warning" },
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
    <Card className={status === "INVALID" ? "border-[#FF6E50]" : "console-stat-card"}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg bg-[#F0FDFA] flex items-center justify-center">{icon}</div>
            <div>
              <CardTitle className="console-card-title">{providerName}</CardTitle>
              <CardDescription className="console-subheading mt-1">{providerDescription}</CardDescription>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Error Alert */}
        {integration?.last_error && status === "INVALID" && (
          <Alert variant="destructive" className="border-[#FF6E50] bg-[#FFF5F3]">
            <AlertCircle className="h-4 w-4 text-[#FF6E50]" />
            <AlertTitle className="text-[#FF6E50]">Validation Error</AlertTitle>
            <AlertDescription className="text-gray-700">{integration.last_error}</AlertDescription>
          </Alert>
        )}

        {/* Setup Form or Status Display */}
        {showSetup ? (
          <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
            <div className="space-y-2">
              <Label htmlFor={`${provider}-credential`} className="console-label">
                {provider === "gcp" ? "Service Account JSON" : "API Key"}
              </Label>
              {inputType === "textarea" ? (
                <textarea
                  id={`${provider}-credential`}
                  className="flex min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
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
                  className="console-input font-mono"
                />
              )}
              <p className="console-small text-gray-600">{helperText}</p>
              {validationError && (
                <p className="console-small text-[#FF6E50] mt-1">{validationError}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSetup} disabled={!credential.trim() || localLoading} className="console-button-primary">
                {localLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isConfigured ? "Update Credential" : "Connect"}
              </Button>
              <Button variant="outline" onClick={() => { setShowSetup(false); setCredential(""); }} className="console-button-secondary">
                Cancel
              </Button>
            </div>
          </div>
        ) : isConfigured ? (
          <div className="space-y-4">
            {/* Credential Info */}
            <div className="flex items-center gap-4 p-4 border rounded-lg bg-gray-50">
              <div className="h-10 w-10 rounded-lg bg-[#F0FDFA] flex items-center justify-center">
                <Key className="h-5 w-5 text-[#007A78]" />
              </div>
              <div className="flex-1">
                <p className="console-card-title">{integration?.credential_name || `${providerName} Credential`}</p>
                <div className="flex items-center gap-4 mt-1 console-small text-gray-600">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Last validated: {formatDate(integration?.last_validated_at)}
                  </span>
                  {integration?.created_at && (
                    <span className="flex items-center gap-1">
                      Added: {formatDate(integration?.created_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Security Note */}
            <div className="flex items-start gap-2 console-small text-gray-600">
              <Shield className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#007A78]" />
              <span>Credentials are encrypted using Google Cloud KMS and never stored in plain text.</span>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="console-body text-gray-600 mb-4">
              No {providerName} integration configured. Click below to add your credentials.
            </p>
            <Button onClick={() => setShowSetup(true)} size="lg" className="console-button-primary">
              <Key className="h-4 w-4 mr-2" />
              Connect {providerName}
            </Button>
          </div>
        )}
      </CardContent>

      {/* Actions Footer */}
      {isConfigured && !showSetup && (
        <CardFooter className="flex justify-between border-t pt-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleValidate}
              disabled={isLoading || localLoading}
              className="console-button-secondary"
            >
              {localLoading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Re-validate
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSetup(true)}
              className="console-button-secondary"
            >
              Update Credential
            </Button>
          </div>

          {/* Delete Dialog */}
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-[#FF6E50] hover:text-[#FF6E50] hover:bg-[#FFF5F3]">
                <Trash2 className="h-4 w-4 mr-1" />
                Remove
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Remove {providerName} Integration</DialogTitle>
                <DialogDescription>
                  Are you sure you want to remove this integration? This will delete the stored credentials
                  and any pipelines using this integration will stop working.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDeleteDialog(false)} className="console-button-secondary">
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDelete} disabled={localLoading} className="console-button-coral">
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
