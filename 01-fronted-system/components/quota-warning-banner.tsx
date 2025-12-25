"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AlertTriangle, TrendingUp, Users, Plug, X } from "lucide-react"
import { getQuotaUsage, type QuotaUsage } from "@/actions/quota"

// Helper functions moved outside component to prevent re-creation on each render
function getAlertVariant(level: string): "destructive" | undefined {
  if (level === 'exceeded') return 'destructive'
  return undefined
}

function getAlertStyles(level: string): string {
  switch (level) {
    case 'critical':
      return 'border-[var(--cloudact-coral)] bg-[var(--cloudact-coral)]/10 dark:bg-[var(--cloudact-coral)]/20'
    case 'warning':
      return 'border-[var(--cloudact-mint)] bg-[var(--cloudact-mint)]/10 dark:bg-[var(--cloudact-mint-light)]/20'
    default:
      return ''
  }
}

function getTitleStyles(level: string): string {
  switch (level) {
    case 'critical':
      return 'text-[var(--cloudact-coral)] dark:text-[var(--cloudact-coral)]'
    case 'warning':
      return 'text-[var(--cloudact-mint-dark)] dark:text-[var(--cloudact-mint-light)]'
    default:
      return ''
  }
}

function getDescStyles(level: string): string {
  switch (level) {
    case 'critical':
      return 'text-[var(--cloudact-coral)] dark:text-[var(--cloudact-coral)]'
    case 'warning':
      return 'text-[var(--cloudact-mint-dark)] dark:text-[var(--cloudact-mint-light)]'
    default:
      return ''
  }
}

interface QuotaWarningBannerProps {
  className?: string
  showPipelineQuota?: boolean
  showResourceQuota?: boolean
}

/**
 * QuotaWarningBanner - Displays warnings when approaching quota limits
 *
 * Shows alerts at:
 * - 80% usage (warning - yellow)
 * - 90% usage (critical - orange)
 * - 100% usage (exceeded - red)
 */
export function QuotaWarningBanner({
  className = "",
  showPipelineQuota = true,
  showResourceQuota = true,
}: QuotaWarningBannerProps) {
  const params = useParams<{ orgSlug: string }>()
  const orgSlug = params.orgSlug

  const [quota, setQuota] = useState<QuotaUsage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!orgSlug) return

    const fetchQuota = async () => {
      setIsLoading(true)
      try {
        const result = await getQuotaUsage(orgSlug)
        if (result.success && result.data) {
          setQuota(result.data)
        }
      } catch (err) {
        console.error("Failed to fetch quota:", err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchQuota()

    // Refresh every 5 minutes
    const interval = setInterval(fetchQuota, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [orgSlug])

  if (isLoading || !quota) {
    return null
  }

  const warnings: Array<{
    id: string
    level: 'warning' | 'critical' | 'exceeded'
    icon: typeof AlertTriangle
    title: string
    description: string
    action?: { label: string; href: string }
  }> = []

  // Daily pipeline warning
  if (showPipelineQuota && quota.dailyWarningLevel !== 'ok') {
    warnings.push({
      id: 'daily',
      level: quota.dailyWarningLevel as 'warning' | 'critical' | 'exceeded',
      icon: TrendingUp,
      title: quota.dailyWarningLevel === 'exceeded'
        ? 'Daily Pipeline Limit Reached'
        : 'Approaching Daily Pipeline Limit',
      description: quota.dailyWarningLevel === 'exceeded'
        ? `You've used all ${quota.dailyLimit} pipelines for today. Upgrade your plan for more.`
        : `You've used ${quota.pipelinesRunToday} of ${quota.dailyLimit} daily pipelines (${quota.dailyUsagePercent}%).`,
      action: { label: 'Upgrade Plan', href: `/${orgSlug}/billing` }
    })
  }

  // Monthly pipeline warning
  if (showPipelineQuota && quota.monthlyWarningLevel !== 'ok' && quota.monthlyWarningLevel !== quota.dailyWarningLevel) {
    warnings.push({
      id: 'monthly',
      level: quota.monthlyWarningLevel as 'warning' | 'critical' | 'exceeded',
      icon: TrendingUp,
      title: quota.monthlyWarningLevel === 'exceeded'
        ? 'Monthly Pipeline Limit Reached'
        : 'Approaching Monthly Pipeline Limit',
      description: quota.monthlyWarningLevel === 'exceeded'
        ? `You've used all ${quota.monthlyLimit} pipelines this month. Upgrade your plan for more.`
        : `You've used ${quota.pipelinesRunMonth} of ${quota.monthlyLimit} monthly pipelines (${quota.monthlyUsagePercent}%).`,
      action: { label: 'Upgrade Plan', href: `/${orgSlug}/billing` }
    })
  }

  // Seat limit warning
  if (showResourceQuota && quota.seatWarningLevel !== 'ok') {
    warnings.push({
      id: 'seats',
      level: quota.seatWarningLevel as 'warning' | 'critical' | 'exceeded',
      icon: Users,
      title: quota.seatWarningLevel === 'exceeded'
        ? 'Team Member Limit Reached'
        : 'Approaching Team Member Limit',
      description: quota.seatWarningLevel === 'exceeded'
        ? `You have ${quota.teamMembers} team members, which is your plan's limit.`
        : `You have ${quota.teamMembers} of ${quota.seatLimit} team members (${quota.seatUsagePercent}%).`,
      action: { label: 'Upgrade Plan', href: `/${orgSlug}/billing` }
    })
  }

  // Provider limit warning
  if (showResourceQuota && quota.providerWarningLevel !== 'ok') {
    warnings.push({
      id: 'providers',
      level: quota.providerWarningLevel as 'warning' | 'critical' | 'exceeded',
      icon: Plug,
      title: quota.providerWarningLevel === 'exceeded'
        ? 'Integration Limit Reached'
        : 'Approaching Integration Limit',
      description: quota.providerWarningLevel === 'exceeded'
        ? `You have ${quota.configuredProviders} integrations configured, which is your plan's limit.`
        : `You have ${quota.configuredProviders} of ${quota.providersLimit} integrations (${quota.providerUsagePercent}%).`,
      action: { label: 'Upgrade Plan', href: `/${orgSlug}/billing` }
    })
  }

  // Filter out dismissed warnings
  const activeWarnings = warnings.filter(w => !dismissed.has(w.id))

  if (activeWarnings.length === 0) {
    return null
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {activeWarnings.map((warning) => {
        const Icon = warning.icon
        return (
          <Alert
            key={warning.id}
            variant={getAlertVariant(warning.level)}
            className={getAlertStyles(warning.level)}
            role="alert"
            aria-live="polite"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <AlertTitle className={getTitleStyles(warning.level)}>
              {warning.title}
            </AlertTitle>
            <AlertDescription className={getDescStyles(warning.level)}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span>{warning.description}</span>
                <div className="flex items-center gap-2">
                  {warning.action && (
                    <Button
                      asChild
                      size="sm"
                      variant={warning.level === 'exceeded' ? 'default' : 'outline'}
                      className={warning.level === 'warning' ? 'h-11 rounded-xl border-border text-foreground hover:bg-[var(--cloudact-mint)]/5 focus-visible:outline-[var(--cloudact-mint-dark)] focus-visible:ring-[var(--cloudact-mint-dark)] dark:border-[var(--cloudact-mint-light)] dark:text-[var(--cloudact-mint-light)] dark:hover:bg-[var(--cloudact-mint-light)]/20' : 'h-11 rounded-xl focus-visible:outline-[var(--cloudact-mint-dark)] focus-visible:ring-[var(--cloudact-mint-dark)]'}
                    >
                      <Link href={warning.action.href}>{warning.action.label}</Link>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11 rounded-xl p-1 hover:bg-[var(--cloudact-mint)]/5 focus-visible:outline-[var(--cloudact-mint-dark)] focus-visible:ring-[var(--cloudact-mint-dark)]"
                    onClick={() => setDismissed(prev => new Set([...prev, warning.id]))}
                    aria-label={`Dismiss ${warning.title} warning`}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )
      })}
    </div>
  )
}
