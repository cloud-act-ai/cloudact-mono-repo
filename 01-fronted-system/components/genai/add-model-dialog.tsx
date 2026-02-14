"use client"

import { useState, useEffect } from "react"
import { Sparkles, Zap, Clock, Server } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface AddModelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (model: Record<string, any>) => void
  type: "payg" | "commitment" | "infrastructure"
  providerLabel: string
}

const REGIONS = [
  { value: "global", label: "Global" },
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-central1", label: "US Central (Iowa)" },
  { value: "eu-west-1", label: "EU West (Ireland)" },
  { value: "eu-central-1", label: "EU Central (Frankfurt)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
]

const GPU_TYPES = [
  { value: "A100-40GB", label: "A100 40GB" },
  { value: "A100-80GB", label: "A100 80GB" },
  { value: "H100-80GB", label: "H100 80GB" },
  { value: "L4", label: "L4 24GB" },
  { value: "A10G", label: "A10G 24GB" },
  { value: "V100", label: "V100 16GB" },
  { value: "T4", label: "T4 16GB" },
  { value: "TPU-v4", label: "TPU v4" },
  { value: "TPU-v5e", label: "TPU v5e" },
  { value: "TPU-v5p", label: "TPU v5p" },
  { value: "Inferentia2", label: "AWS Inferentia2" },
  { value: "Trainium", label: "AWS Trainium" },
]

export function AddModelDialog({
  open,
  onOpenChange,
  onSave,
  type,
  providerLabel,
}: AddModelDialogProps) {
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Reset form when dialog opens to ensure clean state
  useEffect(() => {
    if (open) {
      setFormData({})
      setErrors({})
    }
  }, [open])

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {}

    // Pricing bounds validation constants - Issue #11/#14: Aligned with API MAX_PRICE_VALUE (1,000,000)
    const MAX_PRICE_VALUE = 1000000 // Aligned with API bounds (ge=0, le=1000000)
    const MAX_PRICE_PER_1M = MAX_PRICE_VALUE // Maximum per 1M tokens
    const MAX_HOURLY_RATE = MAX_PRICE_VALUE  // Maximum hourly rate
    const MAX_MONTHLY_RATE = MAX_PRICE_VALUE // Maximum monthly rate

    // Model ID pattern: alphanumeric, hyphens, underscores, periods only
    const MODEL_ID_PATTERN = /^[a-zA-Z0-9\-_.]+$/
    const MAX_MODEL_ID_LENGTH = 200

    if (type === "payg") {
      const modelId = formData.model_id?.trim()
      if (!modelId) {
        newErrors.model_id = "Model ID is required"
      } else if (modelId.length > MAX_MODEL_ID_LENGTH) {
        newErrors.model_id = `Model ID cannot exceed ${MAX_MODEL_ID_LENGTH} characters`
      } else if (!MODEL_ID_PATTERN.test(modelId)) {
        newErrors.model_id = "Model ID can only contain letters, numbers, hyphens, underscores, and periods"
      }

      if (formData.input_per_1m === undefined || formData.input_per_1m === null) {
        newErrors.input_per_1m = "Input price is required"
      } else if (typeof formData.input_per_1m !== 'number' || isNaN(formData.input_per_1m)) {
        newErrors.input_per_1m = "Input price must be a valid number"
      } else if (formData.input_per_1m < 0) {
        newErrors.input_per_1m = "Input price cannot be negative"
      } else if (formData.input_per_1m > MAX_PRICE_PER_1M) {
        newErrors.input_per_1m = `Input price cannot exceed $${MAX_PRICE_PER_1M.toLocaleString()}`
      }

      if (formData.output_per_1m === undefined || formData.output_per_1m === null) {
        newErrors.output_per_1m = "Output price is required"
      } else if (typeof formData.output_per_1m !== 'number' || isNaN(formData.output_per_1m)) {
        newErrors.output_per_1m = "Output price must be a valid number"
      } else if (formData.output_per_1m < 0) {
        newErrors.output_per_1m = "Output price cannot be negative"
      } else if (formData.output_per_1m > MAX_PRICE_PER_1M) {
        newErrors.output_per_1m = `Output price cannot exceed $${MAX_PRICE_PER_1M.toLocaleString()}`
      }

      // Validate optional pricing fields
      if (formData.cached_input_per_1m !== undefined && formData.cached_input_per_1m !== null) {
        if (typeof formData.cached_input_per_1m !== 'number' || isNaN(formData.cached_input_per_1m)) {
          newErrors.cached_input_per_1m = "Cached input price must be a valid number"
        } else if (formData.cached_input_per_1m < 0) {
          newErrors.cached_input_per_1m = "Cached input price cannot be negative"
        } else if (formData.cached_input_per_1m > MAX_PRICE_PER_1M) {
          newErrors.cached_input_per_1m = `Cached input price cannot exceed $${MAX_PRICE_PER_1M.toLocaleString()}`
        }
      }
    } else if (type === "commitment") {
      const modelId = formData.model_id?.trim()
      if (!modelId) {
        newErrors.model_id = "Model ID is required"
      } else if (modelId.length > MAX_MODEL_ID_LENGTH) {
        newErrors.model_id = `Model ID cannot exceed ${MAX_MODEL_ID_LENGTH} characters`
      } else if (!MODEL_ID_PATTERN.test(modelId)) {
        newErrors.model_id = "Model ID can only contain letters, numbers, hyphens, underscores, and periods"
      }

      // Validate commitment pricing fields
      if (formData.ptu_hourly_rate !== undefined && formData.ptu_hourly_rate !== null) {
        if (typeof formData.ptu_hourly_rate !== 'number' || isNaN(formData.ptu_hourly_rate)) {
          newErrors.ptu_hourly_rate = "Hourly rate must be a valid number"
        } else if (formData.ptu_hourly_rate < 0) {
          newErrors.ptu_hourly_rate = "Hourly rate cannot be negative"
        } else if (formData.ptu_hourly_rate > MAX_HOURLY_RATE) {
          newErrors.ptu_hourly_rate = `Hourly rate cannot exceed $${MAX_HOURLY_RATE.toLocaleString()}`
        }
      }
      if (formData.ptu_monthly_rate !== undefined && formData.ptu_monthly_rate !== null) {
        if (typeof formData.ptu_monthly_rate !== 'number' || isNaN(formData.ptu_monthly_rate)) {
          newErrors.ptu_monthly_rate = "Monthly rate must be a valid number"
        } else if (formData.ptu_monthly_rate < 0) {
          newErrors.ptu_monthly_rate = "Monthly rate cannot be negative"
        } else if (formData.ptu_monthly_rate > MAX_MONTHLY_RATE) {
          newErrors.ptu_monthly_rate = `Monthly rate cannot exceed $${MAX_MONTHLY_RATE.toLocaleString()}`
        }
      }
    } else if (type === "infrastructure") {
      const instanceType = formData.instance_type?.trim()
      if (!instanceType) {
        newErrors.instance_type = "Instance type is required"
      } else if (instanceType.length > MAX_MODEL_ID_LENGTH) {
        newErrors.instance_type = `Instance type cannot exceed ${MAX_MODEL_ID_LENGTH} characters`
      }

      if (!formData.gpu_type) newErrors.gpu_type = "GPU type is required"

      if (formData.hourly_rate === undefined || formData.hourly_rate === null) {
        newErrors.hourly_rate = "Hourly rate is required"
      } else if (typeof formData.hourly_rate !== 'number' || isNaN(formData.hourly_rate)) {
        newErrors.hourly_rate = "Hourly rate must be a valid number"
      } else if (formData.hourly_rate < 0) {
        newErrors.hourly_rate = "Hourly rate cannot be negative"
      } else if (formData.hourly_rate > MAX_HOURLY_RATE) {
        newErrors.hourly_rate = `Hourly rate cannot exceed $${MAX_HOURLY_RATE.toLocaleString()}`
      }
    }

    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return

    // Apply defaults for model_family if not provided (for PAYG)
    const finalData = { ...formData }
    if (type === "payg" && !finalData.model_family) {
      // Derive model_family from model_id if not set
      // Handles various formats:
      // - "gpt-4o-custom" -> "gpt-4o"
      // - "claude-3.5-sonnet" -> "claude-3.5"
      // - "gemini-1.5-pro" -> "gemini-1.5"
      // - "o1-preview" -> "o1"
      // - "gpt-4-turbo-2024-04-09" -> "gpt-4"
      // - "text-embedding-3-large" -> "text-embedding-3"
      // - "claude-3-opus-20240229" -> "claude-3"
      const modelId = (finalData.model_id || "").trim()

      if (modelId) {
        // More robust regex that handles:
        // 1. Models starting with letters followed by optional version numbers
        // 2. Stops before descriptive suffixes like -sonnet, -opus, -turbo, -preview
        // Pattern: word + optional (hyphen + version digits/dots)
        const familyMatch = modelId.match(/^([a-zA-Z][a-zA-Z0-9]*(?:-[0-9]+(?:\.[0-9]+)?)?)/i)
        finalData.model_family = familyMatch ? familyMatch[1].toLowerCase() : "custom"
      } else {
        finalData.model_family = "custom"
      }
    }

    // Mark data for server-side validation fallback
    // The backend will perform final validation and may reject invalid data
    finalData._requiresServerValidation = true

    onSave(finalData)
    setFormData({})
    setErrors({})
  }

  const handleClose = () => {
    setFormData({})
    setErrors({})
    onOpenChange(false)
  }

  /**
   * Securely parse a float value from user input.
   * Security: Prevents injection by validating numeric format and bounds.
   * @param value The raw input value
   * @param min Minimum allowed value (default 0)
   * @param max Maximum allowed value (default 1e12)
   * @returns Validated number or null if invalid
   */
  const parseSecureFloat = (value: string | number, min = 0, max = 1e12): number | null => {
    if (value === '' || value === null || value === undefined) return null

    // If already a number, validate it
    if (typeof value === 'number') {
      if (!isFinite(value) || isNaN(value)) return null
      if (value < min || value > max) return null
      return value
    }

    // Clean the string - only allow digits, decimal point, and optional leading minus
    const cleaned = String(value).trim()
    if (!/^-?\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '-' || cleaned === '.') {
      return null
    }

    const parsed = parseFloat(cleaned)
    if (!isFinite(parsed) || isNaN(parsed)) return null
    if (parsed < min || parsed > max) return null

    return parsed
  }

  /**
   * Securely parse an integer value from user input.
   * Security: Prevents injection by validating numeric format and bounds.
   */
  const parseSecureInt = (value: string | number, min = 0, max = 1e9): number | null => {
    if (value === '' || value === null || value === undefined) return null

    if (typeof value === 'number') {
      if (!isFinite(value) || isNaN(value) || !Number.isInteger(value)) return null
      if (value < min || value > max) return null
      return value
    }

    const cleaned = String(value).trim()
    if (!/^-?\d+$/.test(cleaned)) return null

    const parsed = parseInt(cleaned, 10)
    if (!isFinite(parsed) || isNaN(parsed)) return null
    if (parsed < min || parsed > max) return null

    return parsed
  }

  const updateField = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  /**
   * Update a float field with secure parsing.
   */
  const updateFloatField = (key: string, rawValue: string, min = 0, max = 1e12) => {
    const parsed = parseSecureFloat(rawValue, min, max)
    // If empty string, set to null (allows clearing the field)
    // If invalid but non-empty, set the raw value to show validation error
    updateField(key, rawValue === '' ? null : (parsed ?? (parseFloat(rawValue) || 0)))
  }

  /**
   * Update an integer field with secure parsing.
   */
  const updateIntField = (key: string, rawValue: string, min = 0, max = 1e9) => {
    const parsed = parseSecureInt(rawValue, min, max)
    updateField(key, rawValue === '' ? null : (parsed ?? (parseInt(rawValue, 10) || 0)))
  }

  const getIcon = () => {
    switch (type) {
      case "payg":
        return <Zap className="h-5 w-5 text-[#90FCA6]" />
      case "commitment":
        return <Clock className="h-5 w-5 text-blue-500" />
      case "infrastructure":
        return <Server className="h-5 w-5 text-[#FF6C5E]" />
    }
  }

  const getTitle = () => {
    switch (type) {
      case "payg":
        return "Add Custom PAYG Model"
      case "commitment":
        return "Add Custom Commitment Plan"
      case "infrastructure":
        return "Add Custom Infrastructure"
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden rounded-2xl border-[var(--border-subtle)]">
        {/* Header with gradient */}
        <div className="relative bg-gradient-to-br from-[var(--surface-secondary)] to-white px-6 py-5 border-b border-[var(--border-subtle)]">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#90FCA6] via-blue-400 to-[#FF6C5E]" />
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white border border-[var(--border-subtle)] shadow-sm flex items-center justify-center">
                {getIcon()}
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-[var(--text-primary)]">
                  {getTitle()}
                </DialogTitle>
                <DialogDescription className="text-sm text-[var(--text-tertiary)]">
                  Add a custom pricing entry for {providerLabel}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {type === "payg" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="model_id" className="text-sm font-medium text-[var(--text-secondary)]">
                  Model ID <span className="text-[#FF6C5E]" aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </Label>
                <Input
                  id="model_id"
                  placeholder="e.g., gpt-4o-custom"
                  value={formData.model_id || ""}
                  onChange={(e) => updateField("model_id", e.target.value)}
                  aria-required="true"
                  aria-invalid={!!errors.model_id}
                  aria-describedby={errors.model_id ? "model_id-error" : undefined}
                  className={cn(
                    "h-10 rounded-xl border-[var(--border-subtle)] focus:border-[#90FCA6] focus:ring-[#90FCA6]",
                    errors.model_id && "border-[#FF6C5E] focus:border-[#FF6C5E] focus:ring-[#FF6C5E]"
                  )}
                />
                {errors.model_id && (
                  <p id="model_id-error" className="text-xs text-[#FF6C5E]" role="alert">{errors.model_id}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="model_family" className="text-sm font-medium text-[var(--text-secondary)]">
                    Model Family
                  </Label>
                  <Input
                    id="model_family"
                    placeholder="e.g., gpt-4o"
                    value={formData.model_family || ""}
                    onChange={(e) => updateField("model_family", e.target.value)}
                    maxLength={100}
                    aria-describedby="model_family-hint"
                    className="h-10 rounded-xl border-[var(--border-subtle)] focus:border-[#90FCA6] focus:ring-[#90FCA6]"
                  />
                  <p id="model_family-hint" className="text-[10px] text-[var(--text-muted)]">
                    Auto-derived from model ID if not provided
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="region" className="text-sm font-medium text-[var(--text-secondary)]">
                    Region
                  </Label>
                  <Select
                    value={formData.region || "global"}
                    onValueChange={(v) => updateField("region", v)}
                  >
                    <SelectTrigger className="h-10 rounded-xl border-[var(--border-subtle)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="input_per_1m" className="text-sm font-medium text-[var(--text-secondary)]">
                    Input Price / 1M Tokens <span className="text-[#FF6C5E]" aria-hidden="true">*</span>
                    <span className="sr-only">(required)</span>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true">$</span>
                    <Input
                      id="input_per_1m"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formData.input_per_1m ?? ""}
                      onChange={(e) => updateFloatField("input_per_1m", e.target.value, 0, 1000000)}
                      aria-required="true"
                      aria-invalid={!!errors.input_per_1m}
                      aria-describedby={errors.input_per_1m ? "input_per_1m-error" : undefined}
                      className={cn(
                        "h-10 pl-7 rounded-xl border-[var(--border-subtle)] font-mono focus:border-[#90FCA6] focus:ring-[#90FCA6]",
                        errors.input_per_1m && "border-[#FF6C5E] focus:border-[#FF6C5E] focus:ring-[#FF6C5E]"
                      )}
                    />
                  </div>
                  {errors.input_per_1m && (
                    <p id="input_per_1m-error" className="text-xs text-[#FF6C5E]" role="alert">{errors.input_per_1m}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="output_per_1m" className="text-sm font-medium text-[var(--text-secondary)]">
                    Output Price / 1M Tokens <span className="text-[#FF6C5E]" aria-hidden="true">*</span>
                    <span className="sr-only">(required)</span>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true">$</span>
                    <Input
                      id="output_per_1m"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formData.output_per_1m ?? ""}
                      onChange={(e) => updateFloatField("output_per_1m", e.target.value, 0, 1000000)}
                      aria-required="true"
                      aria-invalid={!!errors.output_per_1m}
                      aria-describedby={errors.output_per_1m ? "output_per_1m-error" : undefined}
                      className={cn(
                        "h-10 pl-7 rounded-xl border-[var(--border-subtle)] font-mono focus:border-[#90FCA6] focus:ring-[#90FCA6]",
                        errors.output_per_1m && "border-[#FF6C5E] focus:border-[#FF6C5E] focus:ring-[#FF6C5E]"
                      )}
                    />
                  </div>
                  {errors.output_per_1m && (
                    <p id="output_per_1m-error" className="text-xs text-[#FF6C5E]" role="alert">{errors.output_per_1m}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cached_input_per_1m" className="text-sm font-medium text-[var(--text-secondary)]">
                    Cached Input / 1M (Optional)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true">$</span>
                    <Input
                      id="cached_input_per_1m"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formData.cached_input_per_1m ?? ""}
                      onChange={(e) => updateFloatField("cached_input_per_1m", e.target.value, 0, 1000000)}
                      aria-invalid={!!errors.cached_input_per_1m}
                      aria-describedby={errors.cached_input_per_1m ? "cached_input_per_1m-error" : undefined}
                      className={cn(
                        "h-10 pl-7 rounded-xl border-[var(--border-subtle)] font-mono focus:border-[#90FCA6] focus:ring-[#90FCA6]",
                        errors.cached_input_per_1m && "border-[#FF6C5E] focus:border-[#FF6C5E] focus:ring-[#FF6C5E]"
                      )}
                    />
                  </div>
                  {errors.cached_input_per_1m && (
                    <p id="cached_input_per_1m-error" className="text-xs text-[#FF6C5E]" role="alert">{errors.cached_input_per_1m}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="context_window" className="text-sm font-medium text-[var(--text-secondary)]">
                    Context Window
                  </Label>
                  <Input
                    id="context_window"
                    type="number"
                    min="0"
                    placeholder="128000"
                    value={formData.context_window ?? ""}
                    onChange={(e) => updateIntField("context_window", e.target.value, 0, 10000000)}
                    className="h-10 rounded-xl border-[var(--border-subtle)] font-mono focus:border-[#90FCA6] focus:ring-[#90FCA6]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rate_limit_rpm" className="text-sm font-medium text-[var(--text-secondary)]">
                    Rate Limit (RPM)
                  </Label>
                  <Input
                    id="rate_limit_rpm"
                    type="number"
                    min="0"
                    placeholder="500"
                    value={formData.rate_limit_rpm ?? ""}
                    onChange={(e) => updateIntField("rate_limit_rpm", e.target.value, 0, 1000000)}
                    className="h-10 rounded-xl border-[var(--border-subtle)] font-mono focus:border-[#90FCA6] focus:ring-[#90FCA6]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rate_limit_tpm" className="text-sm font-medium text-[var(--text-secondary)]">
                    Rate Limit (TPM)
                  </Label>
                  <Input
                    id="rate_limit_tpm"
                    type="number"
                    min="0"
                    placeholder="30000"
                    value={formData.rate_limit_tpm ?? ""}
                    onChange={(e) => updateIntField("rate_limit_tpm", e.target.value, 0, 1e12)}
                    className="h-10 rounded-xl border-[var(--border-subtle)] font-mono focus:border-[#90FCA6] focus:ring-[#90FCA6]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="volume_tier" className="text-sm font-medium text-[var(--text-secondary)]">
                    Volume Tier
                  </Label>
                  <Select
                    value={formData.volume_tier || "standard"}
                    onValueChange={(v) => updateField("volume_tier", v)}
                  >
                    <SelectTrigger className="h-10 rounded-xl border-[var(--border-subtle)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="tier1">Tier 1</SelectItem>
                      <SelectItem value="tier2">Tier 2</SelectItem>
                      <SelectItem value="tier3">Tier 3</SelectItem>
                      <SelectItem value="tier4">Tier 4</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="volume_discount_pct" className="text-sm font-medium text-[var(--text-secondary)]">
                    Volume Discount %
                  </Label>
                  <Input
                    id="volume_discount_pct"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={formData.volume_discount_pct ?? ""}
                    onChange={(e) => updateField("volume_discount_pct", parseInt(e.target.value) || 0)}
                    className="h-10 rounded-xl border-[var(--border-subtle)] font-mono focus:border-[#90FCA6] focus:ring-[#90FCA6]"
                  />
                </div>
              </div>
            </>
          )}

          {type === "commitment" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="commitment_model_id" className="text-sm font-medium text-[var(--text-secondary)]">
                  Model ID <span className="text-[#FF6C5E]" aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </Label>
                <Input
                  id="commitment_model_id"
                  placeholder="e.g., gpt-4-ptu"
                  value={formData.model_id || ""}
                  onChange={(e) => updateField("model_id", e.target.value)}
                  aria-required="true"
                  aria-invalid={!!errors.model_id}
                  aria-describedby={errors.model_id ? "commitment_model_id-error" : undefined}
                  className={cn(
                    "h-10 rounded-xl border-[var(--border-subtle)] focus:border-blue-500 focus:ring-blue-500",
                    errors.model_id && "border-[#FF6C5E] focus:border-[#FF6C5E] focus:ring-[#FF6C5E]"
                  )}
                />
                {errors.model_id && (
                  <p id="commitment_model_id-error" className="text-xs text-[#FF6C5E]" role="alert">{errors.model_id}</p>
                )}
              </div>

              {/* Issue #48: Added unit_name field for PTU type identification */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="model_group" className="text-sm font-medium text-[var(--text-secondary)]">
                    Model Group
                  </Label>
                  <Input
                    id="model_group"
                    placeholder="e.g., gpt-4, claude-3"
                    value={formData.model_group || ""}
                    onChange={(e) => updateField("model_group", e.target.value)}
                    className="h-10 rounded-xl border-[var(--border-subtle)] focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit_name" className="text-sm font-medium text-[var(--text-secondary)]">
                    Unit Name
                  </Label>
                  <Input
                    id="unit_name"
                    placeholder="e.g., gpt-4-ptu, claude-3-pt"
                    value={formData.unit_name || ""}
                    onChange={(e) => updateField("unit_name", e.target.value)}
                    className="h-10 rounded-xl border-[var(--border-subtle)] focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="commitment_type" className="text-sm font-medium text-[var(--text-secondary)]">
                    Commitment Type
                  </Label>
                  <Select
                    value={formData.commitment_type || "ptu"}
                    onValueChange={(v) => updateField("commitment_type", v)}
                  >
                    <SelectTrigger className="h-10 rounded-xl border-[var(--border-subtle)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ptu">PTU (Provisioned Throughput)</SelectItem>
                      <SelectItem value="gsu">GSU (Generative Serving Units)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="region" className="text-sm font-medium text-[var(--text-secondary)]">
                    Region
                  </Label>
                  <Select
                    value={formData.region || "global"}
                    onValueChange={(v) => updateField("region", v)}
                  >
                    <SelectTrigger className="h-10 rounded-xl border-[var(--border-subtle)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ptu_hourly_rate" className="text-sm font-medium text-[var(--text-secondary)]">
                    Hourly Rate per Unit
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true">$</span>
                    <Input
                      id="ptu_hourly_rate"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formData.ptu_hourly_rate ?? ""}
                      onChange={(e) => updateFloatField("ptu_hourly_rate", e.target.value, 0, 1000000)}
                      aria-invalid={!!errors.ptu_hourly_rate}
                      aria-describedby={errors.ptu_hourly_rate ? "ptu_hourly_rate-error" : undefined}
                      className={cn(
                        "h-10 pl-7 rounded-xl border-[var(--border-subtle)] font-mono focus:border-blue-500 focus:ring-blue-500",
                        errors.ptu_hourly_rate && "border-[#FF6C5E] focus:border-[#FF6C5E] focus:ring-[#FF6C5E]"
                      )}
                    />
                  </div>
                  {errors.ptu_hourly_rate && (
                    <p id="ptu_hourly_rate-error" className="text-xs text-[#FF6C5E]" role="alert">{errors.ptu_hourly_rate}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ptu_monthly_rate" className="text-sm font-medium text-[var(--text-secondary)]">
                    Monthly Rate per Unit
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true">$</span>
                    <Input
                      id="ptu_monthly_rate"
                      type="number"
                      step="1"
                      min="0"
                      placeholder="0"
                      value={formData.ptu_monthly_rate ?? ""}
                      onChange={(e) => updateFloatField("ptu_monthly_rate", e.target.value, 0, 1000000)} // Aligned with API MAX_PRICE_VALUE
                      aria-invalid={!!errors.ptu_monthly_rate}
                      aria-describedby={errors.ptu_monthly_rate ? "ptu_monthly_rate-error" : undefined}
                      className={cn(
                        "h-10 pl-7 rounded-xl border-[var(--border-subtle)] font-mono focus:border-blue-500 focus:ring-blue-500",
                        errors.ptu_monthly_rate && "border-[#FF6C5E] focus:border-[#FF6C5E] focus:ring-[#FF6C5E]"
                      )}
                    />
                  </div>
                  {errors.ptu_monthly_rate && (
                    <p id="ptu_monthly_rate-error" className="text-xs text-[#FF6C5E]" role="alert">{errors.ptu_monthly_rate}</p>
                  )}
                </div>
              </div>

              {/* Issue #46: Use standardized field names (min_units, max_units) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="min_units" className="text-sm font-medium text-[var(--text-secondary)]">
                    Min Units
                  </Label>
                  <Input
                    id="min_units"
                    type="number"
                    min="1"
                    placeholder="1"
                    value={formData.min_units ?? ""}
                    onChange={(e) => updateIntField("min_units", e.target.value, 1, 100000)}
                    className="h-10 rounded-xl border-[var(--border-subtle)] font-mono focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_units" className="text-sm font-medium text-[var(--text-secondary)]">
                    Max Units
                  </Label>
                  <Input
                    id="max_units"
                    type="number"
                    min="1"
                    placeholder="100"
                    value={formData.max_units ?? ""}
                    onChange={(e) => updateIntField("max_units", e.target.value, 1, 100000)}
                    className="h-10 rounded-xl border-[var(--border-subtle)] font-mono focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commitment_term_months" className="text-sm font-medium text-[var(--text-secondary)]">
                    Term (Months)
                  </Label>
                  <Input
                    id="commitment_term_months"
                    type="number"
                    min="1"
                    placeholder="1"
                    value={formData.commitment_term_months ?? ""}
                    onChange={(e) => updateField("commitment_term_months", parseInt(e.target.value) || 1)}
                    className="h-10 rounded-xl border-[var(--border-subtle)] font-mono focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Issue #46: Added tokens_per_unit_minute field */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tokens_per_unit_minute" className="text-sm font-medium text-[var(--text-secondary)]">
                    Tokens per Unit/Minute
                  </Label>
                  <Input
                    id="tokens_per_unit_minute"
                    type="number"
                    min="0"
                    placeholder="2500"
                    value={formData.tokens_per_unit_minute ?? ""}
                    onChange={(e) => updateIntField("tokens_per_unit_minute", e.target.value, 0, 1e12)}
                    className="h-10 rounded-xl border-[var(--border-subtle)] font-mono focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min_commitment_months" className="text-sm font-medium text-[var(--text-secondary)]">
                    Min Commitment (Months)
                  </Label>
                  <Input
                    id="min_commitment_months"
                    type="number"
                    min="1"
                    placeholder="1"
                    value={formData.min_commitment_months ?? ""}
                    onChange={(e) => updateField("min_commitment_months", parseInt(e.target.value) || 1)}
                    className="h-10 rounded-xl border-[var(--border-subtle)] font-mono focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Discount and overage fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="term_discount_pct" className="text-sm font-medium text-[var(--text-secondary)]">
                    Term Discount %
                  </Label>
                  <Input
                    id="term_discount_pct"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={formData.term_discount_pct ?? ""}
                    onChange={(e) => updateField("term_discount_pct", parseInt(e.target.value) || 0)}
                    className="h-10 rounded-xl border-[var(--border-subtle)] font-mono focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="volume_discount_pct" className="text-sm font-medium text-[var(--text-secondary)]">
                    Volume Discount %
                  </Label>
                  <Input
                    id="volume_discount_pct"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={formData.volume_discount_pct ?? ""}
                    onChange={(e) => updateField("volume_discount_pct", parseInt(e.target.value) || 0)}
                    className="h-10 rounded-xl border-[var(--border-subtle)] font-mono focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-[var(--text-secondary)]">
                    Supports Overage
                  </Label>
                  <Select
                    value={formData.supports_overage ? "yes" : "no"}
                    onValueChange={(v) => updateField("supports_overage", v === "yes")}
                  >
                    <SelectTrigger className="h-10 rounded-xl border-[var(--border-subtle)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {type === "infrastructure" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="instance_type" className="text-sm font-medium text-[var(--text-secondary)]">
                  Instance Type <span className="text-[#FF6C5E]" aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </Label>
                <Input
                  id="instance_type"
                  placeholder="e.g., a2-highgpu-1g"
                  value={formData.instance_type || ""}
                  onChange={(e) => updateField("instance_type", e.target.value)}
                  aria-required="true"
                  aria-invalid={!!errors.instance_type}
                  aria-describedby={errors.instance_type ? "instance_type-error" : undefined}
                  className={cn(
                    "h-10 rounded-xl border-[var(--border-subtle)] focus:border-[#FF6C5E] focus:ring-[#FF6C5E]",
                    errors.instance_type && "border-[#FF6C5E]"
                  )}
                />
                {errors.instance_type && (
                  <p id="instance_type-error" className="text-xs text-[#FF6C5E]" role="alert">{errors.instance_type}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gpu_type" className="text-sm font-medium text-[var(--text-secondary)]">
                    GPU Type <span className="text-[#FF6C5E]" aria-hidden="true">*</span>
                    <span className="sr-only">(required)</span>
                  </Label>
                  <Select
                    value={formData.gpu_type || ""}
                    onValueChange={(v) => updateField("gpu_type", v)}
                    required
                  >
                    <SelectTrigger
                      className={cn(
                        "h-10 rounded-xl border-[var(--border-subtle)]",
                        errors.gpu_type && "border-[#FF6C5E]"
                      )}
                      aria-invalid={!!errors.gpu_type}
                      aria-describedby={errors.gpu_type ? "gpu_type-error" : undefined}
                    >
                      <SelectValue placeholder="Select GPU type" />
                    </SelectTrigger>
                    <SelectContent>
                      {GPU_TYPES.map((g) => (
                        <SelectItem key={g.value} value={g.value}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.gpu_type && (
                    <p id="gpu_type-error" className="text-xs text-[#FF6C5E]" role="alert">{errors.gpu_type}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="region" className="text-sm font-medium text-[var(--text-secondary)]">
                    Region
                  </Label>
                  <Select
                    value={formData.region || "us-central1"}
                    onValueChange={(v) => updateField("region", v)}
                  >
                    <SelectTrigger className="h-10 rounded-xl border-[var(--border-subtle)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIONS.filter(r => r.value !== "global").map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gpu_count" className="text-sm font-medium text-[var(--text-secondary)]">
                    GPU Count
                  </Label>
                  <Input
                    id="gpu_count"
                    type="number"
                    min="1"
                    placeholder="1"
                    value={formData.gpu_count ?? ""}
                    onChange={(e) => updateIntField("gpu_count", e.target.value, 1, 1000)}
                    className="h-10 rounded-xl border-[var(--border-subtle)] font-mono focus:border-[#FF6C5E] focus:ring-[#FF6C5E]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gpu_memory_gb" className="text-sm font-medium text-[var(--text-secondary)]">
                    Memory (GB)
                  </Label>
                  <Input
                    id="gpu_memory_gb"
                    type="number"
                    min="1"
                    placeholder="24"
                    value={formData.gpu_memory_gb ?? ""}
                    onChange={(e) => updateIntField("gpu_memory_gb", e.target.value, 1, 10000)}
                    className="h-10 rounded-xl border-[var(--border-subtle)] font-mono focus:border-[#FF6C5E] focus:ring-[#FF6C5E]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hourly_rate" className="text-sm font-medium text-[var(--text-secondary)]">
                    $/Hour <span className="text-[#FF6C5E]" aria-hidden="true">*</span>
                    <span className="sr-only">(required)</span>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true">$</span>
                    <Input
                      id="hourly_rate"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formData.hourly_rate ?? ""}
                      onChange={(e) => updateFloatField("hourly_rate", e.target.value, 0, 1000000)}
                      aria-required="true"
                      aria-invalid={!!errors.hourly_rate}
                      aria-describedby={errors.hourly_rate ? "hourly_rate-error" : undefined}
                      className={cn(
                        "h-10 pl-7 rounded-xl border-[var(--border-subtle)] font-mono focus:border-[#FF6C5E] focus:ring-[#FF6C5E]",
                        errors.hourly_rate && "border-[#FF6C5E]"
                      )}
                    />
                  </div>
                  {errors.hourly_rate && (
                    <p id="hourly_rate-error" className="text-xs text-[#FF6C5E]" role="alert">{errors.hourly_rate}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="spot_discount_pct" className="text-sm font-medium text-[var(--text-secondary)]">
                    Spot Discount %
                  </Label>
                  <Input
                    id="spot_discount_pct"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="70"
                    value={formData.spot_discount_pct ?? ""}
                    onChange={(e) => updateField("spot_discount_pct", parseInt(e.target.value) || 0)}
                    className="h-10 rounded-xl border-[var(--border-subtle)] font-mono focus:border-[#FF6C5E] focus:ring-[#FF6C5E]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reserved_1yr_discount_pct" className="text-sm font-medium text-[var(--text-secondary)]">
                    1yr RI %
                  </Label>
                  <Input
                    id="reserved_1yr_discount_pct"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="30"
                    value={formData.reserved_1yr_discount_pct ?? ""}
                    onChange={(e) => updateField("reserved_1yr_discount_pct", parseInt(e.target.value) || 0)}
                    className="h-10 rounded-xl border-[var(--border-subtle)] font-mono focus:border-[#FF6C5E] focus:ring-[#FF6C5E]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reserved_3yr_discount_pct" className="text-sm font-medium text-[var(--text-secondary)]">
                    3yr RI %
                  </Label>
                  <Input
                    id="reserved_3yr_discount_pct"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="50"
                    value={formData.reserved_3yr_discount_pct ?? ""}
                    onChange={(e) => updateField("reserved_3yr_discount_pct", parseInt(e.target.value) || 0)}
                    className="h-10 rounded-xl border-[var(--border-subtle)] font-mono focus:border-[#FF6C5E] focus:ring-[#FF6C5E]"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50">
          <Button
            variant="outline"
            onClick={handleClose}
            className="h-10 px-4 rounded-xl border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            className="h-10 px-4 rounded-xl bg-[#90FCA6] text-black font-semibold hover:bg-[#7BE992] shadow-sm"
          >
            <Sparkles className="h-4 w-4 mr-1.5" />
            {type === "payg" ? "Add Model" : type === "commitment" ? "Add Plan" : "Add Instance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
