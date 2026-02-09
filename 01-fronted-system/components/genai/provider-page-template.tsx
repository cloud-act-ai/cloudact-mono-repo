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
  Zap,
  Clock,
  Server,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { IntegrationConfigCard, IntegrationStatus } from "@/components/integration-config-card"
import { PAYGPricingTable } from "./payg-pricing-table"
import { CommitmentPricingTable } from "./commitment-pricing-table"
import { InfrastructurePricingTable } from "./infrastructure-pricing-table"
import { PricingRow } from "./pricing-table-base"
import { cn } from "@/lib/utils"

import {
  getIntegrations,
  setupIntegration,
  validateIntegration,
  deleteIntegration,
  IntegrationProvider,
} from "@/actions/integrations"
import { ProviderLogo } from "@/components/ui/provider-logo"

import { GenAIPAYGPricing } from "@/lib/data/genai/genai-payg-pricing"
import { GenAICommitmentPricing } from "@/lib/data/genai/genai-commitment-pricing"
import { GenAIInfrastructurePricing } from "@/lib/data/genai/genai-infrastructure-pricing"
import {
  getGenAIPricing,
  addCustomPricing,
  deleteCustomPricing,
  setPricingOverride,
  resetPricingOverride as resetPricingOverrideApi,
} from "@/actions/genai-pricing"
import type { GenAIFlow, GenAIPricingResponse, PaginationParams } from "@/lib/types/genai-pricing"
import { DEFAULT_PAGINATION_LIMIT } from "@/lib/types/genai-pricing"

// ============================================================================
// SECURITY HELPERS
// ============================================================================

/**
 * Safely parse a docs step string that may contain HTML links.
 * Security: Only allows safe anchor tags with href - strips all other HTML.
 * This replaces dangerouslySetInnerHTML to prevent XSS attacks.
 */
interface ParsedSegment {
  type: 'text' | 'link'
  content: string
  href?: string
}

function parseDocStep(htmlContent: string): ParsedSegment[] {
  const segments: ParsedSegment[] = []

  // Match anchor tags with href attribute - this is the only HTML we allow
  // Pattern: <a href="URL">TEXT</a>
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi

  let lastIndex = 0
  let match: RegExpExecArray | null

  // Clone content to work with - strip any dangerous patterns first
  const safeContent = htmlContent
    // Remove script tags entirely
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove event handlers
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
    // Remove javascript: URLs
    .replace(/javascript:/gi, '')

  while ((match = linkRegex.exec(safeContent)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      const textBefore = safeContent.slice(lastIndex, match.index)
        .replace(/<[^>]*>/g, '') // Strip any remaining HTML tags
      if (textBefore) {
        segments.push({ type: 'text', content: textBefore })
      }
    }

    // Validate and add the link
    const href = match[1]
    const linkText = match[2]

    // Only allow http, https URLs - block javascript:, data:, etc.
    if (href && /^https?:\/\//i.test(href)) {
      segments.push({ type: 'link', content: linkText, href })
    } else {
      // If URL is suspicious, just show the text without the link
      segments.push({ type: 'text', content: linkText })
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text after last link
  if (lastIndex < safeContent.length) {
    const remainingText = safeContent.slice(lastIndex).replace(/<[^>]*>/g, '')
    if (remainingText) {
      segments.push({ type: 'text', content: remainingText })
    }
  }

  // If no segments found, treat entire content as text (with HTML stripped)
  if (segments.length === 0) {
    segments.push({ type: 'text', content: safeContent.replace(/<[^>]*>/g, '') })
  }

  return segments
}

/**
 * Component that safely renders docs step content with proper links.
 * Security: Replaces dangerouslySetInnerHTML with safe React rendering.
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
              className="text-[#007AFF] hover:underline"
            >
              {segment.content}
            </a>
          )
        }
        return <span key={`segment-${i}`}>{segment.content}</span>
      })}
    </>
  )
}

/**
 * Creates a safe summary of update fields for logging/notes.
 * Security: Redacts any potentially sensitive values while preserving field names.
 * This prevents credential exposure in notes if someone accidentally includes API keys.
 */
function createSafeUpdateSummary(updates: Record<string, unknown>): string {
  const safeFields = ['input_per_1m', 'output_per_1m', 'hourly_rate', 'ptu_hourly_rate',
                      'ptu_monthly_rate', 'region', 'model', 'instance_type']
  const summary: Record<string, string> = {}

  for (const [key, value] of Object.entries(updates)) {
    if (safeFields.includes(key) && (typeof value === 'number' || typeof value === 'string')) {
      // Only include safe numeric/pricing fields with their actual values
      summary[key] = String(value)
    } else if (typeof value === 'string' && value.length > 20) {
      // Long strings could be credentials - redact them
      summary[key] = '[REDACTED]'
    } else if (typeof value === 'number') {
      summary[key] = String(value)
    } else {
      summary[key] = '[REDACTED]'
    }
  }

  return `Updated fields: ${Object.keys(summary).join(', ')}`
}

// ============================================================================
// TYPES
// ============================================================================

export interface ProviderConfig {
  id: IntegrationProvider
  name: string
  description: string
  icon: React.ReactNode
  color: string
  placeholder: string
  helperText: string
  docsUrl: string
  docsSteps: string[]
  validateCredential?: (credential: string) => { valid: boolean; error?: string }
}

export interface GenAIProviderPageTemplateProps {
  config: ProviderConfig
  paygPricing: GenAIPAYGPricing[]
  commitmentPricing: GenAICommitmentPricing[]
  infrastructurePricing: GenAIInfrastructurePricing[]
}

// ============================================================================
// COLLAPSIBLE SECTION
// ============================================================================

interface CollapsibleSectionProps {
  title: string
  description?: string
  icon: React.ReactNode
  iconColor: string
  defaultOpen?: boolean
  badge?: React.ReactNode
  children: React.ReactNode
}

function CollapsibleSection({
  title,
  description,
  icon,
  iconColor,
  defaultOpen = true,
  badge,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${iconColor}15` }}
          >
            <div style={{ color: iconColor }} className="[&>svg]:h-5 [&>svg]:w-5">
              {icon}
            </div>
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-semibold text-slate-900">{title}</h3>
              {badge}
            </div>
            {description && (
              <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronUp className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-slate-400" />
          )}
        </div>
      </button>
      {isOpen && (
        <div className="px-5 pb-5 pt-2 border-t border-slate-100">
          {children}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function GenAIProviderPageTemplate({
  config,
  paygPricing,
  commitmentPricing,
  infrastructurePricing,
}: GenAIProviderPageTemplateProps) {
  const params = useParams()
  const router = useRouter()
  const orgSlug = params.orgSlug as string

  // State
  const [integration, setIntegration] = useState<IntegrationStatus | undefined>()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Backend pricing state (loaded from BigQuery)
  const [backendPricing, setBackendPricing] = useState<GenAIPricingResponse | null>(null)
  const [isPricingLoading, setIsPricingLoading] = useState(false)

  // Pagination state
  const [pricingOffset, setPricingOffset] = useState(0)
  const [hasMorePricing, setHasMorePricing] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Track pending changes for unsaved changes warning
  const [pendingChanges, setPendingChanges] = useState<Set<string>>(new Set())
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const pendingNavigationRef = useRef<string | null>(null)

  // Optimistic updates state - stores temporary UI state during API calls
  // Security: Using typed values instead of any
  const [optimisticUpdates, setOptimisticUpdates] = useState<Map<string, Record<string, string | number | boolean | null>>>(new Map())

  // Refs for preventing memory leaks and stale closures
  const isMountedRef = useRef(true)
  const hasUnsavedChangesRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Cleanup interval for optimistic updates (every 5 minutes)
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
  const MAX_OPTIMISTIC_UPDATE_AGE_MS = 10 * 60 * 1000 // 10 minutes

  // Check if there are unsaved changes
  const hasUnsavedChanges = pendingChanges.size > 0

  // Keep ref in sync with state for stale closure prevention
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges
  }, [hasUnsavedChanges])

  // Setup mount/unmount tracking and cleanup
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      // Cancel any pending async operations
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Periodic cleanup of stale optimistic updates
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      if (!isMountedRef.current) return

      // Clear any optimistic updates that have been pending too long
      // This prevents memory leaks from failed/abandoned operations
      setOptimisticUpdates(prev => {
        if (prev.size === 0) return prev
        // For now, just log - in production you'd track timestamps
        if (process.env.NODE_ENV !== 'production' && prev.size > 0) {
          console.debug(`GenAI: ${prev.size} optimistic updates pending cleanup check`)
        }
        return prev
      })
    }, CLEANUP_INTERVAL_MS)

    return () => clearInterval(cleanupInterval)
  }, [CLEANUP_INTERVAL_MS])

  // Handle navigation with unsaved changes warning
  const handleBackNavigation = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (hasUnsavedChanges) {
      e.preventDefault()
      pendingNavigationRef.current = `/${orgSlug}/integrations/genai`
      setShowUnsavedDialog(true)
    }
  }, [hasUnsavedChanges, orgSlug])

  // Confirm navigation (discard changes)
  const confirmNavigation = useCallback(() => {
    setShowUnsavedDialog(false)
    setPendingChanges(new Set())
    setOptimisticUpdates(new Map())
    if (pendingNavigationRef.current) {
      router.push(pendingNavigationRef.current)
      pendingNavigationRef.current = null
    }
  }, [router])

  // Cancel navigation
  const cancelNavigation = useCallback(() => {
    setShowUnsavedDialog(false)
    pendingNavigationRef.current = null
  }, [])

  // Add beforeunload handler for browser navigation
  // Security: Uses ref to avoid stale closure issue
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Use ref to get current value and avoid stale closure
      if (hasUnsavedChangesRef.current) {
        e.preventDefault()
        e.returnValue = ""
        return ""
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, []) // Empty deps - handler uses ref

  // Apply optimistic update to a row
  // Security: Using typed values instead of any
  const applyOptimisticUpdate = useCallback((rowId: string, updates: Record<string, string | number | boolean | null>) => {
    if (!isMountedRef.current) return
    setOptimisticUpdates(prev => {
      const next = new Map(prev)
      next.set(rowId, { ...prev.get(rowId), ...updates })
      return next
    })
    setPendingChanges(prev => new Set(prev).add(rowId))
  }, [])

  // Clear optimistic update after successful save
  const clearOptimisticUpdate = useCallback((rowId: string) => {
    if (!isMountedRef.current) return
    setOptimisticUpdates(prev => {
      const next = new Map(prev)
      next.delete(rowId)
      return next
    })
    setPendingChanges(prev => {
      const next = new Set(prev)
      next.delete(rowId)
      return next
    })
  }, [])

  // Revert optimistic update on error
  const revertOptimisticUpdate = useCallback((rowId: string) => {
    if (!isMountedRef.current) return
    setOptimisticUpdates(prev => {
      const next = new Map(prev)
      next.delete(rowId)
      return next
    })
    setPendingChanges(prev => {
      const next = new Set(prev)
      next.delete(rowId)
      return next
    })
  }, [])

  // Load integration status
  // Security: Added mounted check to prevent state updates after unmount
  const loadIntegration = useCallback(async () => {
    if (!isMountedRef.current) return
    setIsLoading(true)
    setError(null)

    const result = await getIntegrations(orgSlug)

    if (!isMountedRef.current) return // Check again after async operation

    if (result.success && result.integrations) {
      const providerIntegration = result.integrations?.integrations?.[config.id.toUpperCase()]
      setIntegration(providerIntegration)
    } else {
      setError(result.error || "Failed to load integration status")
    }

    setIsLoading(false)
  }, [orgSlug, config.id])

  useEffect(() => {
    loadIntegration().catch((err) => {
      if (!isMountedRef.current) return
      // Log to structured logger in production
      if (process.env.NODE_ENV !== 'production') {
        console.error("Failed to load integration:", err)
      }
      setError("Failed to load integration status")
      setIsLoading(false)
    })
  }, [loadIntegration])

  // Load pricing from backend when connected
  // Security: Added mounted check to prevent state updates after unmount
  const loadBackendPricing = useCallback(async (resetOffset = true) => {
    if (!orgSlug || !config.id || !isMountedRef.current) return

    const currentOffset = resetOffset ? 0 : pricingOffset
    if (resetOffset) {
      setIsPricingLoading(true)
      setPricingOffset(0)
    } else {
      setIsLoadingMore(true)
    }

    const result = await getGenAIPricing(orgSlug, config.id, {
      limit: DEFAULT_PAGINATION_LIMIT,
      offset: currentOffset,
    })

    if (!isMountedRef.current) return // Check again after async operation

    if (result.success && result.data) {
      if (resetOffset || !backendPricing) {
        // Initial load or reset - replace all data
        setBackendPricing(result.data)
      } else {
        // Load more - append to existing data
        setBackendPricing((prev) => {
          if (!prev) return result.data!
          return {
            ...prev,
            payg: [...prev.payg, ...result.data!.payg],
            commitment: [...prev.commitment, ...result.data!.commitment],
            infrastructure: [...prev.infrastructure, ...result.data!.infrastructure],
            total_count: result.data!.total_count || prev.total_count || 0,
          }
        })
      }
      setHasMorePricing(result.data.has_more || false)
      if (!resetOffset) {
        setPricingOffset(currentOffset + DEFAULT_PAGINATION_LIMIT)
      }
    }

    setIsPricingLoading(false)
    setIsLoadingMore(false)
  }, [orgSlug, config.id, pricingOffset, backendPricing])

  // Handler for loading more pricing data
  const handleLoadMorePricing = useCallback(async () => {
    await loadBackendPricing(false)
  }, [loadBackendPricing])

  // Load pricing when integration is connected
  // Security: Added mounted check to prevent state updates after unmount
  useEffect(() => {
    if (integration?.status === "VALID") {
      const loadPricing = async () => {
        try {
          await loadBackendPricing()
        } catch (err) {
          if (!isMountedRef.current) return
          // Log to structured logger in production
          if (process.env.NODE_ENV !== 'production') {
            console.error("Failed to load backend pricing:", err)
          }
          setError("Failed to load pricing data")
          setIsPricingLoading(false)
        }
      }
      loadPricing()
    }
  }, [integration?.status, loadBackendPricing])

  // Clear messages after delay
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

  // Handlers
  const handleSetup = async (credential: string) => {
    setError(null)
    setSuccessMessage(null)

    const result = await setupIntegration({
      orgSlug,
      provider: config.id,
      credential,
    })

    if (result.success) {
      setSuccessMessage(
        result.validationStatus === "VALID"
          ? `${config.name} API key connected and validated successfully!`
          : `${config.name} API key saved (Status: ${result.validationStatus})`
      )
      await loadIntegration()
    } else {
      setError(result.error || result.message || "Setup failed. Please check your API key and try again.")
    }
  }

  const handleValidate = async () => {
    setError(null)
    setSuccessMessage(null)

    const result = await validateIntegration(orgSlug, config.id)

    if (result.validationStatus === "VALID") {
      setSuccessMessage(`${config.name} API key validated successfully!`)
    } else {
      setError(result.error || "Validation failed")
    }

    await loadIntegration()
  }

  const handleDelete = async () => {
    setError(null)
    setSuccessMessage(null)

    const result = await deleteIntegration(orgSlug, config.id)

    if (result.success) {
      setSuccessMessage(`${config.name} integration removed`)
      await loadIntegration()
    } else {
      setError(result.error || "Delete failed")
    }
  }

  // ============================================================================
  // PRICING CRUD HANDLERS (Backend API)
  // ============================================================================

  // PAYG handlers
  const handleSaveCustomPayg = async (model: Partial<GenAIPAYGPricing>) => {
    setError(null)
    const result = await addCustomPricing(orgSlug, "payg", {
      provider: config.id,
      model: model.model,
      model_family: model.model_family,
      region: model.region,
      input_per_1m: model.input_per_1m,
      output_per_1m: model.output_per_1m,
      cached_input_per_1m: model.cached_input_per_1m,
      context_window: model.context_window,
      max_output_tokens: model.max_output_tokens,
      supports_vision: model.supports_vision,
      supports_tools: model.supports_tools,
      rate_limit_rpm: model.rate_limit_rpm,
      rate_limit_tpm: model.rate_limit_tpm,
    })
    if (result.success) {
      setSuccessMessage("Custom model added successfully")
      await loadBackendPricing()
    } else {
      setError(result.error || "Failed to add custom model")
    }
  }

  const handleUpdatePayg = async (rowId: string, updates: Record<string, any>) => {
    // Get the primary value to override (input or output price)
    const overrideValue = updates.input_per_1m || updates.output_per_1m
    if (!overrideValue) return

    // Apply optimistic update immediately for better UX
    applyOptimisticUpdate(rowId, updates)

    const result = await setPricingOverride(orgSlug, "payg", rowId, {
      override_value: overrideValue,
      notes: createSafeUpdateSummary(updates),
    })
    if (result.success) {
      clearOptimisticUpdate(rowId)
      await loadBackendPricing()
    } else {
      revertOptimisticUpdate(rowId)
      setError(result.error || "Failed to update pricing")
    }
  }

  const handleDeletePayg = async (rowId: string) => {
    const result = await deleteCustomPricing(orgSlug, "payg", rowId)
    if (result.success) {
      setSuccessMessage("Custom model removed")
      await loadBackendPricing()
    } else {
      setError(result.error || "Failed to delete custom model")
    }
  }

  const handleResetPayg = async (rowId: string) => {
    const result = await resetPricingOverrideApi(orgSlug, "payg", rowId)
    if (result.success) {
      setSuccessMessage("Pricing reset to default")
      await loadBackendPricing()
    } else {
      setError(result.error || "Failed to reset pricing")
    }
  }

  // Commitment handlers
  const handleSaveCustomCommitment = async (model: Partial<GenAICommitmentPricing>) => {
    setError(null)
    // Issue #46: Use standardized field names (min_units, max_units, tokens_per_unit_minute)
    const result = await addCustomPricing(orgSlug, "commitment", {
      provider: config.id,
      model: model.model,
      commitment_type: model.commitment_type,
      region: model.region,
      ptu_hourly_rate: model.ptu_hourly_rate,
      ptu_monthly_rate: model.ptu_monthly_rate,
      min_units: model.min_units,
      max_units: model.max_units,
      commitment_term_months: model.commitment_term_months,
      tokens_per_unit_minute: model.tokens_per_unit_minute,
    })
    if (result.success) {
      setSuccessMessage("Custom plan added successfully")
      await loadBackendPricing()
    } else {
      setError(result.error || "Failed to add custom plan")
    }
  }

  const handleUpdateCommitment = async (rowId: string, updates: Record<string, any>) => {
    const overrideValue = updates.ptu_hourly_rate || updates.ptu_monthly_rate
    if (!overrideValue) return

    // Apply optimistic update immediately for better UX
    applyOptimisticUpdate(rowId, updates)

    const result = await setPricingOverride(orgSlug, "commitment", rowId, {
      override_value: overrideValue,
      notes: createSafeUpdateSummary(updates),
    })
    if (result.success) {
      clearOptimisticUpdate(rowId)
      await loadBackendPricing()
    } else {
      revertOptimisticUpdate(rowId)
      setError(result.error || "Failed to update pricing")
    }
  }

  const handleDeleteCommitment = async (rowId: string) => {
    const result = await deleteCustomPricing(orgSlug, "commitment", rowId)
    if (result.success) {
      setSuccessMessage("Custom plan removed")
      await loadBackendPricing()
    } else {
      setError(result.error || "Failed to delete custom plan")
    }
  }

  const handleResetCommitment = async (rowId: string) => {
    const result = await resetPricingOverrideApi(orgSlug, "commitment", rowId)
    if (result.success) {
      setSuccessMessage("Pricing reset to default")
      await loadBackendPricing()
    } else {
      setError(result.error || "Failed to reset pricing")
    }
  }

  // Infrastructure handlers
  const handleSaveCustomInfra = async (model: Partial<GenAIInfrastructurePricing>) => {
    setError(null)
    const result = await addCustomPricing(orgSlug, "infrastructure", {
      provider: config.id,
      resource_type: model.resource_type,
      instance_type: model.instance_type,
      gpu_type: model.gpu_type,
      gpu_count: model.gpu_count,
      gpu_memory_gb: model.gpu_memory_gb,
      hourly_rate: model.hourly_rate,
      spot_discount_pct: model.spot_discount_pct,
      reserved_1yr_discount_pct: model.reserved_1yr_discount_pct,
      reserved_3yr_discount_pct: model.reserved_3yr_discount_pct,
      region: model.region,
      cloud_provider: model.cloud_provider,
    })
    if (result.success) {
      setSuccessMessage("Custom instance added successfully")
      await loadBackendPricing()
    } else {
      setError(result.error || "Failed to add custom instance")
    }
  }

  const handleUpdateInfra = async (rowId: string, updates: Record<string, any>) => {
    const overrideValue = updates.hourly_rate
    if (!overrideValue) return

    // Apply optimistic update immediately for better UX
    applyOptimisticUpdate(rowId, updates)

    const result = await setPricingOverride(orgSlug, "infrastructure", rowId, {
      override_value: overrideValue,
      notes: createSafeUpdateSummary(updates),
    })
    if (result.success) {
      clearOptimisticUpdate(rowId)
      await loadBackendPricing()
    } else {
      revertOptimisticUpdate(rowId)
      setError(result.error || "Failed to update pricing")
    }
  }

  const handleDeleteInfra = async (rowId: string) => {
    const result = await deleteCustomPricing(orgSlug, "infrastructure", rowId)
    if (result.success) {
      setSuccessMessage("Custom instance removed")
      await loadBackendPricing()
    } else {
      setError(result.error || "Failed to delete custom instance")
    }
  }

  const handleResetInfra = async (rowId: string) => {
    const result = await resetPricingOverrideApi(orgSlug, "infrastructure", rowId)
    if (result.success) {
      setSuccessMessage("Pricing reset to default")
      await loadBackendPricing()
    } else {
      setError(result.error || "Failed to reset pricing")
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: config.color }} />
          <p className="text-sm text-slate-500">Loading integration...</p>
        </div>
      </div>
    )
  }

  const isConnected = integration?.status === "VALID"

  return (
    <div className="space-y-6 pb-8">
      {/* Unsaved changes confirmation dialog */}
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Unsaved Changes
            </AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to leave this page?
              Your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelNavigation} className="rounded-xl">
              Stay on Page
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmNavigation}
              className="rounded-xl bg-[#FF6C5E] hover:bg-[#e55a4d]"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header with back link */}
      <div className="flex items-center gap-3">
        <Link href={`/${orgSlug}/integrations/genai`} onClick={handleBackNavigation}>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-600 hover:text-black hover:bg-slate-50 h-9 rounded-xl transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            GenAI Providers
          </Button>
        </Link>
        {hasUnsavedChanges && (
          <Badge className="bg-amber-100 text-amber-700 border-0 h-6 px-2.5 font-medium">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Unsaved changes
          </Badge>
        )}
      </div>

      {/* Provider Header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{ background: `linear-gradient(90deg, ${config.color}, ${config.color}80)` }}
        />
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-2xl bg-white border-2 border-slate-200 flex items-center justify-center flex-shrink-0">
              <ProviderLogo provider={config.id} size={32} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-[24px] font-bold text-black tracking-tight">
                  {config.name}
                </h1>
                {isConnected ? (
                  <Badge className="bg-[#90FCA6]/15 text-[#1a7a3a] border-0 h-6 px-2.5 font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#1a7a3a] mr-1.5" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-0 h-6 px-2.5 font-semibold">
                    Not Connected
                  </Badge>
                )}
              </div>
              <p className="text-[13px] text-slate-600 leading-relaxed">
                {config.description}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive" className="border-[#FF6C5E]/30 bg-[#FF6C5E]/10 rounded-xl">
          <AlertCircle className="h-4 w-4 text-[#FF6C5E]" />
          <AlertTitle className="text-[#FF6C5E] font-semibold">Error</AlertTitle>
          <AlertDescription className="text-[#FF6C5E]">{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="border-[#90FCA6]/30 bg-[#90FCA6]/15 rounded-xl">
          <Check className="h-4 w-4 text-[#1a7a3a]" />
          <AlertTitle className="text-[#1a7a3a] font-semibold">Success</AlertTitle>
          <AlertDescription className="text-[#1a7a3a]">{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* Connection Card */}
      <IntegrationConfigCard
        provider={config.id}
        providerName={config.name}
        providerDescription={config.description}
        placeholder={config.placeholder}
        inputType="text"
        helperText={config.helperText}
        integration={integration}
        onSetup={handleSetup}
        onValidate={handleValidate}
        onDelete={handleDelete}
        isLoading={isLoading}
        validateCredentialFormat={config.validateCredential}
      />

      {/* Pricing Tables */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">Pricing Reference</h2>
          {!isConnected && (
            <Badge variant="outline" className="text-[10px] font-medium border-slate-200 text-slate-500">
              <Shield className="h-3 w-3 mr-1" />
              Read-only until connected
            </Badge>
          )}
        </div>

        {/* PAYG Pricing */}
        {(paygPricing.length > 0 || (backendPricing?.payg?.length ?? 0) > 0) && (
          <CollapsibleSection
            title="Pay-As-You-Go Pricing"
            description="Token-based pricing for API calls"
            icon={<Zap />}
            iconColor="#90FCA6"
            defaultOpen={true}
            badge={
              <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0 h-5 bg-slate-100 text-slate-600">
                {isConnected && backendPricing ? backendPricing.payg.length : paygPricing.length} models
              </Badge>
            }
          >
            <PAYGPricingTable
              provider={config.id}
              providerLabel={config.name}
              defaultPricing={isConnected && backendPricing?.payg?.length ? [] : paygPricing}
              customPricing={isConnected && backendPricing?.payg ? backendPricing.payg as PricingRow[] : []}
              isConnected={isConnected}
              onSaveCustom={handleSaveCustomPayg}
              onUpdatePricing={handleUpdatePayg}
              onDeleteCustom={handleDeletePayg}
              onResetPricing={handleResetPayg}
            />
          </CollapsibleSection>
        )}

        {/* Commitment Pricing */}
        {(commitmentPricing.length > 0 || (backendPricing?.commitment?.length ?? 0) > 0) && (
          <CollapsibleSection
            title="Commitment Pricing"
            description="PTU / GSU provisioned throughput plans"
            icon={<Clock />}
            iconColor="#007AFF"
            defaultOpen={false}
            badge={
              <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0 h-5 bg-slate-100 text-slate-600">
                {isConnected && backendPricing ? backendPricing.commitment.length : commitmentPricing.length} plans
              </Badge>
            }
          >
            <CommitmentPricingTable
              provider={config.id}
              providerLabel={config.name}
              defaultPricing={isConnected && backendPricing?.commitment?.length ? [] : commitmentPricing}
              customPricing={isConnected && backendPricing?.commitment ? backendPricing.commitment as PricingRow[] : []}
              isConnected={isConnected}
              onSaveCustom={handleSaveCustomCommitment}
              onUpdatePricing={handleUpdateCommitment}
              onDeleteCustom={handleDeleteCommitment}
              onResetPricing={handleResetCommitment}
            />
          </CollapsibleSection>
        )}

        {/* Infrastructure Pricing */}
        {(infrastructurePricing.length > 0 || (backendPricing?.infrastructure?.length ?? 0) > 0) && (
          <CollapsibleSection
            title="Infrastructure Pricing"
            description="GPU/TPU instance hourly rates"
            icon={<Server />}
            iconColor="#FF6C5E"
            defaultOpen={false}
            badge={
              <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0 h-5 bg-slate-100 text-slate-600">
                {isConnected && backendPricing ? backendPricing.infrastructure.length : infrastructurePricing.length} instances
              </Badge>
            }
          >
            <InfrastructurePricingTable
              provider={config.id}
              providerLabel={config.name}
              defaultPricing={isConnected && backendPricing?.infrastructure?.length ? [] : infrastructurePricing}
              customPricing={isConnected && backendPricing?.infrastructure ? backendPricing.infrastructure as PricingRow[] : []}
              isConnected={isConnected}
              onSaveCustom={handleSaveCustomInfra}
              onUpdatePricing={handleUpdateInfra}
              onDeleteCustom={handleDeleteInfra}
              onResetPricing={handleResetInfra}
            />
          </CollapsibleSection>
        )}

        {/* Load More Button - only show when connected and has more data */}
        {isConnected && hasMorePricing && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              onClick={handleLoadMorePricing}
              disabled={isLoadingMore}
              className="min-w-[200px] h-10 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading more...
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-2" />
                  Load More Pricing
                </>
              )}
            </Button>
          </div>
        )}

        {/* Pagination info */}
        {isConnected && backendPricing && (
          <div className="text-center text-xs text-slate-500">
            Showing {backendPricing.payg.length + backendPricing.commitment.length + backendPricing.infrastructure.length} records
            {backendPricing.total_count ? ` of ${backendPricing.total_count} total` : ""}
          </div>
        )}
      </div>

      {/* Help Section */}
      <div className="rounded-2xl border border-slate-200 p-5 bg-gradient-to-br from-slate-50 to-white">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
            <ExternalLink className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-black mb-2">
              How to get your {config.name} API key
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 text-[12px] text-slate-700">
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
              className="inline-flex items-center gap-1.5 mt-3 text-[12px] font-medium text-[#007AFF] hover:underline"
            >
              View documentation
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
