"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useParams, useSearchParams } from "next/navigation"
import {
  Bell,
  Mail,
  MessageSquare,
  Webhook,
  Plus,
  Settings2,
  AlertTriangle,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  History,
  Send,
  Pause,
  Trash2,
  Edit3,
  TestTube2,
  DollarSign,
  Activity,
  Zap,
  Calendar,
  MoreVertical,
} from "lucide-react"

// Premium components
import { PremiumCard, MetricCard, SectionHeader } from "@/components/ui/premium-card"
import { PageActionsMenu } from "@/components/ui/page-actions-menu"
import { StatusBadge } from "@/components/ui/status-badge"
import { StatRow } from "@/components/ui/stat-row"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Actions
import {
  listNotificationChannels,
  createNotificationChannel,
  updateNotificationChannel,
  deleteNotificationChannel,
  testNotificationChannel,
  listNotificationRules,
  createNotificationRule,
  updateNotificationRule,
  deleteNotificationRule,
  pauseNotificationRule,
  resumeNotificationRule,
  listNotificationSummaries,
  createNotificationSummary,
  updateNotificationSummary,
  deleteNotificationSummary,
  sendNotificationSummaryNow,
  listNotificationHistory,
  acknowledgeNotification,
  getNotificationStats,
  NotificationChannel,
  NotificationChannelCreate,
  NotificationChannelUpdate,
  NotificationRule,
  NotificationRuleCreate,
  NotificationRuleUpdate,
  NotificationSummary,
  NotificationSummaryCreate,
  NotificationSummaryUpdate,
  NotificationHistoryEntry,
  NotificationStats,
  ChannelType,
  RuleCategory,
  RuleType,
  RulePriority,
  SummaryType,
} from "@/actions/notifications"
import { checkBackendOnboarding, hasStoredApiKey } from "@/actions/backend-onboarding"

// ============================================================================
// Types
// ============================================================================

interface QuickStats {
  channels: number
  activeRules: number
  summaries: number
  alerts24h: number
  deliveryRate: number
}

// ============================================================================
// Validation Functions (VAL-001 to VAL-005)
// ============================================================================

// VAL-001: Email validation
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email.trim())
}

const validateEmailList = (emails: string): { valid: boolean; errors: string[] } => {
  if (!emails.trim()) {
    return { valid: false, errors: ["At least one email is required"] }
  }
  const emailList = emails.split(",").map((e) => e.trim()).filter(Boolean)
  const invalidEmails = emailList.filter((e) => !isValidEmail(e))
  if (invalidEmails.length > 0) {
    return { valid: false, errors: [`Invalid email(s): ${invalidEmails.join(", ")}`] }
  }
  return { valid: true, errors: [] }
}

// VAL-002: URL validation
const isValidUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" || parsed.protocol === "http:"
  } catch {
    return false
  }
}

const isValidSlackWebhook = (url: string): boolean => {
  if (!isValidUrl(url)) return false
  // Slack webhooks must start with https://hooks.slack.com/
  return url.startsWith("https://hooks.slack.com/services/")
}

// VAL-003: Cron expression validation (basic)
const isValidCron = (cron: string): { valid: boolean; error?: string } => {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) {
    return { valid: false, error: "Cron must have exactly 5 fields (minute hour day month weekday)" }
  }

  // Basic validation for each field
  const fieldRanges = [
    { name: "minute", min: 0, max: 59 },
    { name: "hour", min: 0, max: 23 },
    { name: "day", min: 1, max: 31 },
    { name: "month", min: 1, max: 12 },
    { name: "weekday", min: 0, max: 7 },
  ]

  for (let i = 0; i < 5; i++) {
    const part = parts[i]
    const range = fieldRanges[i]

    // Allow * and */n patterns
    if (part === "*" || /^\*\/\d+$/.test(part)) continue

    // Allow single numbers
    if (/^\d+$/.test(part)) {
      const num = parseInt(part, 10)
      if (num < range.min || num > range.max) {
        return { valid: false, error: `${range.name} must be between ${range.min} and ${range.max}` }
      }
      continue
    }

    // Allow ranges (e.g., 1-5)
    if (/^\d+-\d+$/.test(part)) {
      const [start, end] = part.split("-").map(Number)
      if (start < range.min || end > range.max || start > end) {
        return { valid: false, error: `Invalid range in ${range.name} field` }
      }
      continue
    }

    // Allow lists (e.g., 1,3,5)
    if (/^[\d,]+$/.test(part)) {
      const nums = part.split(",").map(Number)
      for (const num of nums) {
        if (num < range.min || num > range.max) {
          return { valid: false, error: `${range.name} values must be between ${range.min} and ${range.max}` }
        }
      }
      continue
    }

    return { valid: false, error: `Invalid ${range.name} field: ${part}` }
  }

  return { valid: true }
}

// ============================================================================
// Helper Functions
// ============================================================================

const formatDateTime = (dateString?: string) => {
  if (!dateString) return "-"
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor(diff / (1000 * 60))

    if (minutes < 1) return "Just now"
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`

    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  } catch {
    return dateString
  }
}

const getChannelIcon = (type: ChannelType) => {
  switch (type) {
    case "email":
      return Mail
    case "slack":
      return MessageSquare
    case "webhook":
      return Webhook
    default:
      return Bell
  }
}

const getRuleCategoryIcon = (category: RuleCategory) => {
  switch (category) {
    case "cost":
      return DollarSign
    case "pipeline":
      return Activity
    case "integration":
      return Zap
    case "subscription":
      return Calendar
    case "system":
      return Settings2
    default:
      return AlertTriangle
  }
}

const getPriorityColor = (priority: RulePriority) => {
  switch (priority) {
    case "critical":
      return "bg-red-100 text-red-700 border-red-200"
    case "high":
      return "bg-orange-100 text-orange-700 border-orange-200"
    case "medium":
      return "bg-amber-100 text-amber-700 border-amber-200"
    case "low":
      return "bg-blue-100 text-blue-700 border-blue-200"
    case "info":
      return "bg-[var(--surface-secondary)] text-[var(--text-secondary)] border-[var(--border-medium)]"
    default:
      return "bg-[var(--surface-secondary)] text-[var(--text-secondary)] border-[var(--border-medium)]"
  }
}

const getRuleTypeLabel = (type: RuleType) => {
  const labels: Record<RuleType, string> = {
    budget_percent: "Budget % Threshold",
    budget_forecast: "Budget Forecast",
    absolute_threshold: "Absolute Threshold",
    anomaly_percent_change: "Anomaly % Change",
    anomaly_std_deviation: "Anomaly Std Dev",
    hierarchy_budget: "Hierarchy Budget",
    pipeline_failure: "Pipeline Failure",
    pipeline_success: "Pipeline Success",
    data_freshness: "Data Freshness",
    integration_health: "Integration Health",
    credential_expiry: "Credential Expiry",
    subscription_renewal: "Subscription Renewal",
    license_utilization: "License Utilization",
  }
  return labels[type] || type
}

// ============================================================================
// Channel Card Component
// ============================================================================

function ChannelCard({
  channel,
  onTest,
  onEdit,
  onDelete,
  onToggle,
  testing,
}: {
  channel: NotificationChannel
  onTest: () => void
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  testing: boolean
}) {
  const Icon = getChannelIcon(channel.channel_type)

  return (
    <div className="p-4 border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--surface-hover)]/50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            channel.is_active ? "bg-[var(--cloudact-mint)]/10" : "bg-[var(--surface-secondary)]"
          }`}>
            <Icon className={`h-5 w-5 ${channel.is_active ? "text-[#1a7a3a]" : "text-[var(--text-muted)]"}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
                {channel.name}
              </span>
              {channel.is_default && (
                <span className="px-2 py-0.5 text-xs font-semibold bg-[var(--cloudact-mint)]/10 text-[#1a7a3a] rounded-full">
                  DEFAULT
                </span>
              )}
            </div>
            <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
              {channel.channel_type === "email" && channel.email_recipients?.join(", ")}
              {channel.channel_type === "slack" && channel.slack_channel}
              {channel.channel_type === "webhook" && "Webhook configured"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            checked={channel.is_active}
            onCheckedChange={onToggle}
            className="data-[state=checked]:bg-[var(--cloudact-mint)]"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={onTest}
            disabled={testing || !channel.is_active}
            className="h-8 px-2"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <TestTube2 className="h-4 w-4" />
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Edit3 className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-red-600">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Rule Card Component
// ============================================================================

function RuleCard({
  rule,
  onEdit,
  onDelete,
  onToggle,
}: {
  rule: NotificationRule
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  const CategoryIcon = getRuleCategoryIcon(rule.rule_category)

  return (
    <div className="p-4 border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--surface-hover)]/50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            rule.is_active ? "bg-[var(--cloudact-mint)]/10" : "bg-[var(--surface-secondary)]"
          }`}>
            <CategoryIcon className={`h-5 w-5 ${rule.is_active ? "text-[#1a7a3a]" : "text-[var(--text-muted)]"}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-semibold text-[var(--text-primary)]">
                {rule.name}
              </span>
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${getPriorityColor(rule.priority)}`}>
                {rule.priority.toUpperCase()}
              </span>
            </div>
            <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
              {getRuleTypeLabel(rule.rule_type)}
              {rule.description && ` • ${rule.description}`}
            </div>
            <div className="flex items-center gap-3 mt-2 text-[11px] text-[var(--text-muted)]">
              {rule.last_triggered_at && (
                <span>Last triggered: {formatDateTime(rule.last_triggered_at)}</span>
              )}
              {rule.trigger_count_today > 0 && (
                <span className="text-amber-600">{rule.trigger_count_today} today</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            checked={rule.is_active}
            onCheckedChange={onToggle}
            className="data-[state=checked]:bg-[var(--cloudact-mint)]"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Edit3 className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-red-600">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Summary Card Component
// ============================================================================

function SummaryCard({
  summary,
  onEdit,
  onDelete,
  onSendNow,
  onToggle,
  sending,
}: {
  summary: NotificationSummary
  onEdit: () => void
  onDelete: () => void
  onSendNow: () => void
  onToggle: () => void
  sending: boolean
}) {
  return (
    <div className="p-4 border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--surface-hover)]/50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            summary.is_active ? "bg-[var(--cloudact-mint)]/10" : "bg-[var(--surface-secondary)]"
          }`}>
            <Calendar className={`h-5 w-5 ${summary.is_active ? "text-[#1a7a3a]" : "text-[var(--text-muted)]"}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-[var(--text-primary)]">
                {summary.name}
              </span>
              <span className="px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 rounded-full">
                {summary.summary_type.toUpperCase()}
              </span>
            </div>
            <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
              {summary.schedule_cron} ({summary.schedule_timezone})
            </div>
            <div className="flex items-center gap-3 mt-2 text-[11px] text-[var(--text-muted)]">
              {summary.last_sent_at && (
                <span>Last sent: {formatDateTime(summary.last_sent_at)}</span>
              )}
              {summary.next_scheduled_at && (
                <span>Next: {formatDateTime(summary.next_scheduled_at)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            checked={summary.is_active}
            onCheckedChange={onToggle}
            className="data-[state=checked]:bg-[var(--cloudact-mint)]"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={onSendNow}
            disabled={sending || !summary.is_active}
            className="h-8 px-2"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Edit3 className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-red-600">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// History Entry Component
// ============================================================================

function HistoryEntry({
  entry,
  onAcknowledge,
}: {
  entry: NotificationHistoryEntry
  onAcknowledge: () => void
}) {
  const statusIcon = {
    delivered: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    sent: <Send className="h-4 w-4 text-blue-500" />,
    failed: <XCircle className="h-4 w-4 text-red-500" />,
    queued: <Clock className="h-4 w-4 text-amber-500" />,
    skipped: <Pause className="h-4 w-4 text-[var(--text-muted)]" />,
  }

  return (
    <div className="p-4 border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--surface-hover)]/50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-8 w-8 rounded-lg bg-[var(--surface-secondary)] flex items-center justify-center flex-shrink-0">
            {statusIcon[entry.status] || <Bell className="h-4 w-4 text-[var(--text-muted)]" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-[var(--text-primary)]">
              {entry.subject}
            </div>
            {entry.body_preview && (
              <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5 line-clamp-2">
                {entry.body_preview}
              </div>
            )}
            <div className="flex items-center gap-3 mt-2 text-[11px] text-[var(--text-muted)]">
              <span>{formatDateTime(entry.created_at)}</span>
              <span className="capitalize">{entry.notification_type}</span>
              {entry.escalated && (
                <span className="text-amber-600">Escalated</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge status={entry.status === "delivered" ? "COMPLETED" : entry.status === "failed" ? "FAILED" : "PENDING"} />
          {!entry.acknowledged_at && entry.status === "delivered" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onAcknowledge}
              className="h-8 px-2 text-[11px]"
            >
              Acknowledge
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Create Channel Dialog
// ============================================================================

function CreateChannelDialog({
  open,
  onOpenChange,
  onSubmit,
  loading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (channel: NotificationChannelCreate) => void
  loading: boolean
}) {
  const [channelType, setChannelType] = useState<ChannelType>("email")
  const [name, setName] = useState("")
  const [emailRecipients, setEmailRecipients] = useState("")
  const [slackWebhook, setSlackWebhook] = useState("")
  const [slackChannel, setSlackChannel] = useState("")
  const [webhookUrl, setWebhookUrl] = useState("")
  const [isDefault, setIsDefault] = useState(false)

  // VAL-001/VAL-002 FIX: Validation error state
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Validate inputs before submit
  const validateInputs = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!name.trim()) {
      newErrors.name = "Name is required"
    }

    if (channelType === "email") {
      const emailValidation = validateEmailList(emailRecipients)
      if (!emailValidation.valid) {
        newErrors.emailRecipients = emailValidation.errors[0]
      }
    } else if (channelType === "slack") {
      if (!slackWebhook.trim()) {
        newErrors.slackWebhook = "Webhook URL is required"
      } else if (!isValidSlackWebhook(slackWebhook)) {
        newErrors.slackWebhook = "Invalid Slack webhook URL (must start with https://hooks.slack.com/services/)"
      }
    } else if (channelType === "webhook") {
      if (!webhookUrl.trim()) {
        newErrors.webhookUrl = "Webhook URL is required"
      } else if (!isValidUrl(webhookUrl)) {
        newErrors.webhookUrl = "Invalid URL format (must be http:// or https://)"
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (!validateInputs()) return

    const channel: NotificationChannelCreate = {
      name,
      channel_type: channelType,
      is_default: isDefault,
      is_active: true,
    }

    if (channelType === "email") {
      channel.email_recipients = emailRecipients.split(",").map((e) => e.trim()).filter(Boolean)
    } else if (channelType === "slack") {
      channel.slack_webhook_url = slackWebhook
      channel.slack_channel = slackChannel
    } else if (channelType === "webhook") {
      channel.webhook_url = webhookUrl
    }

    onSubmit(channel)
  }

  // Clear errors when channel type changes
  const handleChannelTypeChange = (type: ChannelType) => {
    setChannelType(type)
    setErrors({})
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Notification Channel</DialogTitle>
          <DialogDescription>
            Add a new channel to receive notifications
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Channel Type</Label>
            <Select value={channelType} onValueChange={(v) => handleChannelTypeChange(v as ChannelType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </div>
                </SelectItem>
                <SelectItem value="slack">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Slack
                  </div>
                </SelectItem>
                <SelectItem value="webhook">
                  <div className="flex items-center gap-2">
                    <Webhook className="h-4 w-4" />
                    Webhook
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              placeholder="e.g., Engineering Team"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((prev) => ({ ...prev, name: "" })) }}
              className={errors.name ? "border-red-500" : ""}
            />
            {errors.name && <p className="text-[11px] text-red-500">{errors.name}</p>}
          </div>

          {channelType === "email" && (
            <div className="space-y-2">
              <Label>Recipients (comma-separated)</Label>
              <Input
                placeholder="team@company.com, alerts@company.com"
                value={emailRecipients}
                onChange={(e) => { setEmailRecipients(e.target.value); setErrors((prev) => ({ ...prev, emailRecipients: "" })) }}
                className={errors.emailRecipients ? "border-red-500" : ""}
              />
              {errors.emailRecipients && <p className="text-[11px] text-red-500">{errors.emailRecipients}</p>}
            </div>
          )}

          {channelType === "slack" && (
            <>
              <div className="space-y-2">
                <Label>Slack Webhook URL</Label>
                <Input
                  placeholder="https://hooks.slack.com/services/..."
                  value={slackWebhook}
                  onChange={(e) => { setSlackWebhook(e.target.value); setErrors((prev) => ({ ...prev, slackWebhook: "" })) }}
                  className={errors.slackWebhook ? "border-red-500" : ""}
                />
                {errors.slackWebhook && <p className="text-[11px] text-red-500">{errors.slackWebhook}</p>}
              </div>
              <div className="space-y-2">
                <Label>Channel (optional)</Label>
                <Input
                  placeholder="#cost-alerts"
                  value={slackChannel}
                  onChange={(e) => setSlackChannel(e.target.value)}
                />
              </div>
            </>
          )}

          {channelType === "webhook" && (
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <Input
                placeholder="https://api.example.com/webhook"
                value={webhookUrl}
                onChange={(e) => { setWebhookUrl(e.target.value); setErrors((prev) => ({ ...prev, webhookUrl: "" })) }}
                className={errors.webhookUrl ? "border-red-500" : ""}
              />
              {errors.webhookUrl && <p className="text-[11px] text-red-500">{errors.webhookUrl}</p>}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch
              checked={isDefault}
              onCheckedChange={setIsDefault}
              className="data-[state=checked]:bg-[var(--cloudact-mint)]"
            />
            <Label>Set as default channel</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !name}
            className="bg-[var(--cloudact-mint)] hover:bg-[var(--cloudact-mint-dark)] text-[var(--cloudact-mint-text)]"
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Channel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Create Rule Dialog
// ============================================================================

function CreateRuleDialog({
  open,
  onOpenChange,
  onSubmit,
  loading,
  channels,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (rule: NotificationRuleCreate) => void
  loading: boolean
  channels: NotificationChannel[]
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<RuleCategory>("cost")
  const [ruleType, setRuleType] = useState<RuleType>("budget_percent")
  const [priority, setPriority] = useState<RulePriority>("medium")
  const [thresholdPercent, setThresholdPercent] = useState("80")
  const [thresholdAmount, setThresholdAmount] = useState("")
  const [budgetAmount, setBudgetAmount] = useState("")
  const [selectedChannels, setSelectedChannels] = useState<string[]>([])
  const [cooldownMinutes, setCooldownMinutes] = useState("60")

  const ruleTypesByCategory: Record<RuleCategory, RuleType[]> = {
    cost: ["budget_percent", "budget_forecast", "absolute_threshold", "anomaly_percent_change", "anomaly_std_deviation", "hierarchy_budget"],
    pipeline: ["pipeline_failure", "pipeline_success", "data_freshness"],
    integration: ["integration_health", "credential_expiry"],
    subscription: ["subscription_renewal", "license_utilization"],
    system: ["data_freshness"],
  }

  const handleSubmit = () => {
    const rule: NotificationRuleCreate = {
      name,
      description: description || undefined,
      rule_category: category,
      rule_type: ruleType,
      priority,
      notify_channel_ids: selectedChannels,
      cooldown_minutes: parseInt(cooldownMinutes) || 60,
      conditions: {},
    }

    // Add conditions based on rule type
    if (ruleType === "budget_percent") {
      rule.conditions = {
        threshold_percent: parseFloat(thresholdPercent) || 80,
        budget_amount: parseFloat(budgetAmount) || undefined,
      }
    } else if (ruleType === "absolute_threshold") {
      rule.conditions = {
        threshold_amount: parseFloat(thresholdAmount) || 0,
        period: "daily",
      }
    } else if (ruleType === "anomaly_percent_change") {
      rule.conditions = {
        threshold_percent: parseFloat(thresholdPercent) || 20,
        comparison: "day_over_day",
        lookback_days: 7,
      }
    }

    onSubmit(rule)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Alert Rule</DialogTitle>
          <DialogDescription>
            Configure when and how you want to be notified
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => {
                setCategory(v as RuleCategory)
                setRuleType(ruleTypesByCategory[v as RuleCategory][0])
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cost">Cost Alerts</SelectItem>
                  <SelectItem value="pipeline">Pipeline Alerts</SelectItem>
                  <SelectItem value="integration">Integration Alerts</SelectItem>
                  <SelectItem value="subscription">Subscription Alerts</SelectItem>
                  <SelectItem value="system">System Alerts</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Rule Type</Label>
              <Select value={ruleType} onValueChange={(v) => setRuleType(v as RuleType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ruleTypesByCategory[category].map((type) => (
                    <SelectItem key={type} value={type}>
                      {getRuleTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              placeholder="e.g., Daily Budget Alert"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Input
              placeholder="Alert when daily costs exceed threshold"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as RulePriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Cooldown (minutes)</Label>
              <Input
                type="number"
                value={cooldownMinutes}
                onChange={(e) => setCooldownMinutes(e.target.value)}
              />
            </div>
          </div>

          {/* Threshold Configuration */}
          <div className="p-4 bg-[var(--surface-secondary)] rounded-xl space-y-4">
            <div className="text-[12px] font-semibold text-[var(--text-secondary)]">Threshold Configuration</div>

            {(ruleType === "budget_percent" || ruleType === "anomaly_percent_change") && (
              <div className="space-y-2">
                <Label>Threshold (%)</Label>
                <Input
                  type="number"
                  placeholder="80"
                  value={thresholdPercent}
                  onChange={(e) => setThresholdPercent(e.target.value)}
                />
                <p className="text-[11px] text-[var(--text-tertiary)]">
                  {ruleType === "budget_percent"
                    ? "Alert when spending reaches this % of budget"
                    : "Alert when cost changes by this % compared to baseline"
                  }
                </p>
              </div>
            )}

            {ruleType === "budget_percent" && (
              <div className="space-y-2">
                <Label>Budget Amount ($)</Label>
                <Input
                  type="number"
                  placeholder="10000"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                />
              </div>
            )}

            {ruleType === "absolute_threshold" && (
              <div className="space-y-2">
                <Label>Threshold Amount ($)</Label>
                <Input
                  type="number"
                  placeholder="1000"
                  value={thresholdAmount}
                  onChange={(e) => setThresholdAmount(e.target.value)}
                />
                <p className="text-[11px] text-[var(--text-tertiary)]">
                  Alert when daily cost exceeds this amount
                </p>
              </div>
            )}
          </div>

          {/* Channel Selection */}
          <div className="space-y-2">
            <Label>Notification Channels</Label>
            <div className="space-y-2">
              {channels.filter((c) => c.is_active).map((channel) => (
                <label key={channel.channel_id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--surface-hover)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedChannels.includes(channel.channel_id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedChannels([...selectedChannels, channel.channel_id])
                      } else {
                        setSelectedChannels(selectedChannels.filter((id) => id !== channel.channel_id))
                      }
                    }}
                    className="rounded border-[var(--border-medium)]"
                  />
                  <span className="text-[12px]">{channel.name}</span>
                  <span className="text-[11px] text-[var(--text-tertiary)] capitalize">({channel.channel_type})</span>
                </label>
              ))}
              {channels.filter((c) => c.is_active).length === 0 && (
                <p className="text-[11px] text-[var(--text-tertiary)] p-2">
                  No active channels. Create a channel first.
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !name || selectedChannels.length === 0}
            className="bg-[var(--cloudact-mint)] hover:bg-[var(--cloudact-mint-dark)] text-[var(--cloudact-mint-text)]"
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Create Summary Dialog
// ============================================================================

function CreateSummaryDialog({
  open,
  onOpenChange,
  onSubmit,
  loading,
  channels,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (summary: NotificationSummaryCreate) => void
  loading: boolean
  channels: NotificationChannel[]
}) {
  const [name, setName] = useState("")
  const [summaryType, setSummaryType] = useState<SummaryType>("daily")
  const [scheduleCron, setScheduleCron] = useState("0 9 * * *")
  const [timezone, setTimezone] = useState("UTC")
  const [selectedChannels, setSelectedChannels] = useState<string[]>([])
  const [includeSections, setIncludeSections] = useState<string[]>(["cost_summary", "top_services", "anomalies"])

  // VAL-003 FIX: Validation error state
  const [errors, setErrors] = useState<Record<string, string>>({})

  const cronPresets = {
    daily: "0 9 * * *",
    weekly: "0 9 * * 1",
    monthly: "0 9 1 * *",
  }

  // Validate inputs before submit
  const validateInputs = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!name.trim()) {
      newErrors.name = "Name is required"
    }

    // VAL-003: Validate cron expression
    const cronValidation = isValidCron(scheduleCron)
    if (!cronValidation.valid) {
      newErrors.scheduleCron = cronValidation.error || "Invalid cron expression"
    }

    if (selectedChannels.length === 0) {
      newErrors.channels = "Select at least one notification channel"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (!validateInputs()) return

    const summary: NotificationSummaryCreate = {
      name,
      summary_type: summaryType,
      schedule_cron: scheduleCron,
      schedule_timezone: timezone,
      notify_channel_ids: selectedChannels,
      include_sections: includeSections,
      top_n_items: 10,
    }

    onSubmit(summary)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Cost Summary</DialogTitle>
          <DialogDescription>
            Schedule regular cost summary reports
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              placeholder="e.g., Weekly Cost Report"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((prev) => ({ ...prev, name: "" })) }}
              className={errors.name ? "border-red-500" : ""}
            />
            {errors.name && <p className="text-[11px] text-red-500">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={summaryType} onValueChange={(v) => {
                setSummaryType(v as SummaryType)
                const newCron = cronPresets[v as SummaryType]
                setScheduleCron(newCron)
                setErrors((prev) => ({ ...prev, scheduleCron: "" }))
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTC">UTC</SelectItem>
                  <SelectItem value="America/New_York">Eastern Time</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                  <SelectItem value="Europe/London">London</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Schedule (Cron)</Label>
            <Input
              value={scheduleCron}
              onChange={(e) => { setScheduleCron(e.target.value); setErrors((prev) => ({ ...prev, scheduleCron: "" })) }}
              placeholder="0 9 * * *"
              className={errors.scheduleCron ? "border-red-500" : ""}
            />
            {errors.scheduleCron ? (
              <p className="text-[11px] text-red-500">{errors.scheduleCron}</p>
            ) : (
              <p className="text-[11px] text-[var(--text-tertiary)]">
                Default: 9:00 AM {summaryType}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Include Sections</Label>
            <div className="space-y-2">
              {[
                { id: "cost_summary", label: "Cost Summary" },
                { id: "top_services", label: "Top Services" },
                { id: "anomalies", label: "Anomalies" },
                { id: "trends", label: "Trends" },
                { id: "forecasts", label: "Forecasts" },
              ].map((section) => (
                <label key={section.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSections.includes(section.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setIncludeSections([...includeSections, section.id])
                      } else {
                        setIncludeSections(includeSections.filter((s) => s !== section.id))
                      }
                    }}
                    className="rounded border-[var(--border-medium)]"
                  />
                  <span className="text-[12px]">{section.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notification Channels</Label>
            <div className={`space-y-2 ${errors.channels ? "border border-red-500 rounded-lg p-2" : ""}`}>
              {channels.filter((c) => c.is_active).map((channel) => (
                <label key={channel.channel_id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--surface-hover)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedChannels.includes(channel.channel_id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedChannels([...selectedChannels, channel.channel_id])
                        setErrors((prev) => ({ ...prev, channels: "" }))
                      } else {
                        setSelectedChannels(selectedChannels.filter((id) => id !== channel.channel_id))
                      }
                    }}
                    className="rounded border-[var(--border-medium)]"
                  />
                  <span className="text-[12px]">{channel.name}</span>
                  <span className="text-[11px] text-[var(--text-tertiary)] capitalize">({channel.channel_type})</span>
                </label>
              ))}
            </div>
            {errors.channels && <p className="text-[11px] text-red-500">{errors.channels}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-[var(--cloudact-mint)] hover:bg-[var(--cloudact-mint-dark)] text-[var(--cloudact-mint-text)]"
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Summary
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function NotificationsPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const orgSlug = params.orgSlug as string

  // Get initial tab from URL or default to overview
  const initialTab = searchParams.get("tab") || "overview"

  // State
  const [isLoading, setIsLoading] = useState(true)
  const [backendConnected, setBackendConnected] = useState(true)
  const [hasApiKey, setHasApiKey] = useState(true)

  const [channels, setChannels] = useState<NotificationChannel[]>([])
  const [rules, setRules] = useState<NotificationRule[]>([])
  const [summaries, setSummaries] = useState<NotificationSummary[]>([])
  const [history, setHistory] = useState<NotificationHistoryEntry[]>([])
  const [stats, setStats] = useState<NotificationStats | null>(null)

  const [testingChannel, setTestingChannel] = useState<string | null>(null)
  const [sendingSummary, setSendingSummary] = useState<string | null>(null)

  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [showCreateRule, setShowCreateRule] = useState(false)
  const [showCreateSummary, setShowCreateSummary] = useState(false)
  const [creating, setCreating] = useState(false)

  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // UX-003 FIX: Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "channel" | "rule" | "summary"
    id: string
    name: string
  } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // UX-001/002 FIX: Edit state for channels, rules, summaries
  const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null)
  const [editingRule, setEditingRule] = useState<NotificationRule | null>(null)
  const [editingSummary, setEditingSummary] = useState<NotificationSummary | null>(null)

  // Load data
  const loadData = useCallback(async () => {
    setIsLoading(true)

    const [onboardingStatus, apiKeyResult] = await Promise.all([
      checkBackendOnboarding(orgSlug, { skipValidation: true, timeout: 3000 }),
      hasStoredApiKey(orgSlug),
    ])

    setBackendConnected(onboardingStatus.onboarded)
    setHasApiKey(apiKeyResult.hasKey)

    if (onboardingStatus.onboarded && apiKeyResult.hasKey) {
      const [channelsRes, rulesRes, summariesRes, historyRes, statsRes] = await Promise.all([
        listNotificationChannels(orgSlug),
        listNotificationRules(orgSlug),
        listNotificationSummaries(orgSlug),
        listNotificationHistory(orgSlug, { limit: 50 }),
        getNotificationStats(orgSlug),
      ])

      if (channelsRes.success && channelsRes.data) setChannels(channelsRes.data)
      if (rulesRes.success && rulesRes.data) setRules(rulesRes.data)
      if (summariesRes.success && summariesRes.data) setSummaries(summariesRes.data)
      if (historyRes.success && historyRes.data) setHistory(historyRes.data)
      if (statsRes.success && statsRes.data) setStats(statsRes.data)
    }

    setIsLoading(false)
  }, [orgSlug])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [message])

  // Handlers
  const handleTestChannel = async (channelId: string) => {
    setTestingChannel(channelId)
    const result = await testNotificationChannel(orgSlug, channelId)
    if (result.success) {
      setMessage({ type: "success", text: "Test notification sent successfully!" })
    } else {
      setMessage({ type: "error", text: result.error || "Failed to send test notification" })
    }
    setTestingChannel(null)
  }

  const handleToggleChannel = async (channel: NotificationChannel) => {
    // STATE-001 FIX: Optimistic update with rollback on failure
    const previousState = channel.is_active
    // Optimistic update
    setChannels(channels.map((c) =>
      c.channel_id === channel.channel_id ? { ...c, is_active: !c.is_active } : c
    ))

    const result = await updateNotificationChannel(orgSlug, channel.channel_id, {
      is_active: !previousState,
    })

    if (!result.success) {
      // Rollback on failure
      setChannels(channels.map((c) =>
        c.channel_id === channel.channel_id ? { ...c, is_active: previousState } : c
      ))
      setMessage({ type: "error", text: result.error || "Failed to update channel" })
    }
  }

  // UX-003 FIX: Show confirmation dialog before delete
  const handleRequestDeleteChannel = (channel: NotificationChannel) => {
    setDeleteConfirm({ type: "channel", id: channel.channel_id, name: channel.name })
  }

  const handleDeleteChannel = async (channelId: string) => {
    setDeleting(true)
    const result = await deleteNotificationChannel(orgSlug, channelId)
    if (result.success) {
      setChannels(channels.filter((c) => c.channel_id !== channelId))
      setMessage({ type: "success", text: "Channel deleted" })
    } else {
      setMessage({ type: "error", text: result.error || "Failed to delete channel" })
    }
    setDeleting(false)
    setDeleteConfirm(null)
  }

  const handleCreateChannel = async (channel: NotificationChannelCreate) => {
    setCreating(true)
    const result = await createNotificationChannel(orgSlug, channel)
    if (result.success && result.data) {
      setChannels([...channels, result.data])
      setShowCreateChannel(false)
      setMessage({ type: "success", text: "Channel created successfully!" })
    } else {
      setMessage({ type: "error", text: result.error || "Failed to create channel" })
    }
    setCreating(false)
  }

  const handleToggleRule = async (rule: NotificationRule) => {
    // STATE-002 FIX: Optimistic update with rollback on failure
    const previousState = rule.is_active
    // Optimistic update
    setRules(rules.map((r) =>
      r.rule_id === rule.rule_id ? { ...r, is_active: !r.is_active } : r
    ))

    const result = previousState
      ? await pauseNotificationRule(orgSlug, rule.rule_id)
      : await resumeNotificationRule(orgSlug, rule.rule_id)

    if (!result.success) {
      // Rollback on failure
      setRules(rules.map((r) =>
        r.rule_id === rule.rule_id ? { ...r, is_active: previousState } : r
      ))
      setMessage({ type: "error", text: result.error || "Failed to update rule" })
    }
  }

  // UX-003 FIX: Show confirmation dialog before delete
  const handleRequestDeleteRule = (rule: NotificationRule) => {
    setDeleteConfirm({ type: "rule", id: rule.rule_id, name: rule.name })
  }

  const handleDeleteRule = async (ruleId: string) => {
    setDeleting(true)
    const result = await deleteNotificationRule(orgSlug, ruleId)
    if (result.success) {
      setRules(rules.filter((r) => r.rule_id !== ruleId))
      setMessage({ type: "success", text: "Rule deleted" })
    } else {
      setMessage({ type: "error", text: result.error || "Failed to delete rule" })
    }
    setDeleting(false)
    setDeleteConfirm(null)
  }

  const handleCreateRule = async (rule: NotificationRuleCreate) => {
    setCreating(true)
    const result = await createNotificationRule(orgSlug, rule)
    if (result.success && result.data) {
      setRules([...rules, result.data])
      setShowCreateRule(false)
      setMessage({ type: "success", text: "Alert rule created successfully!" })
    } else {
      setMessage({ type: "error", text: result.error || "Failed to create rule" })
    }
    setCreating(false)
  }

  const handleToggleSummary = async (summary: NotificationSummary) => {
    // STATE-003 FIX: Optimistic update with rollback on failure
    const previousState = summary.is_active
    // Optimistic update
    setSummaries(summaries.map((s) =>
      s.summary_id === summary.summary_id ? { ...s, is_active: !s.is_active } : s
    ))

    const result = await updateNotificationSummary(orgSlug, summary.summary_id, {
      is_active: !previousState,
    })

    if (!result.success) {
      // Rollback on failure
      setSummaries(summaries.map((s) =>
        s.summary_id === summary.summary_id ? { ...s, is_active: previousState } : s
      ))
      setMessage({ type: "error", text: result.error || "Failed to update summary" })
    }
  }

  // UX-003 FIX: Show confirmation dialog before delete
  const handleRequestDeleteSummary = (summary: NotificationSummary) => {
    setDeleteConfirm({ type: "summary", id: summary.summary_id, name: summary.name })
  }

  const handleDeleteSummary = async (summaryId: string) => {
    setDeleting(true)
    const result = await deleteNotificationSummary(orgSlug, summaryId)
    if (result.success) {
      setSummaries(summaries.filter((s) => s.summary_id !== summaryId))
      setMessage({ type: "success", text: "Summary deleted" })
    } else {
      setMessage({ type: "error", text: result.error || "Failed to delete summary" })
    }
    setDeleting(false)
    setDeleteConfirm(null)
  }

  // UX-003 FIX: Unified confirmation handler
  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return
    switch (deleteConfirm.type) {
      case "channel":
        await handleDeleteChannel(deleteConfirm.id)
        break
      case "rule":
        await handleDeleteRule(deleteConfirm.id)
        break
      case "summary":
        await handleDeleteSummary(deleteConfirm.id)
        break
    }
  }

  // UX-001/002 FIX: Edit handlers
  const handleEditChannel = async (channelId: string, update: NotificationChannelUpdate) => {
    setCreating(true)
    const result = await updateNotificationChannel(orgSlug, channelId, update)
    if (result.success && result.data) {
      setChannels(channels.map((c) => c.channel_id === channelId ? result.data! : c))
      setEditingChannel(null)
      setMessage({ type: "success", text: "Channel updated successfully!" })
    } else {
      setMessage({ type: "error", text: result.error || "Failed to update channel" })
    }
    setCreating(false)
  }

  const handleEditRule = async (ruleId: string, update: NotificationRuleUpdate) => {
    setCreating(true)
    const result = await updateNotificationRule(orgSlug, ruleId, update)
    if (result.success && result.data) {
      setRules(rules.map((r) => r.rule_id === ruleId ? result.data! : r))
      setEditingRule(null)
      setMessage({ type: "success", text: "Rule updated successfully!" })
    } else {
      setMessage({ type: "error", text: result.error || "Failed to update rule" })
    }
    setCreating(false)
  }

  const handleEditSummary = async (summaryId: string, update: NotificationSummaryUpdate) => {
    setCreating(true)
    const result = await updateNotificationSummary(orgSlug, summaryId, update)
    if (result.success && result.data) {
      setSummaries(summaries.map((s) => s.summary_id === summaryId ? result.data! : s))
      setEditingSummary(null)
      setMessage({ type: "success", text: "Summary updated successfully!" })
    } else {
      setMessage({ type: "error", text: result.error || "Failed to update summary" })
    }
    setCreating(false)
  }

  const handleSendSummaryNow = async (summaryId: string) => {
    setSendingSummary(summaryId)
    const result = await sendNotificationSummaryNow(orgSlug, summaryId)
    if (result.success) {
      setMessage({ type: "success", text: "Summary sent successfully!" })
    } else {
      setMessage({ type: "error", text: result.error || "Failed to send summary" })
    }
    setSendingSummary(null)
  }

  const handleCreateSummary = async (summary: NotificationSummaryCreate) => {
    setCreating(true)
    const result = await createNotificationSummary(orgSlug, summary)
    if (result.success && result.data) {
      setSummaries([...summaries, result.data])
      setShowCreateSummary(false)
      setMessage({ type: "success", text: "Summary schedule created successfully!" })
    } else {
      setMessage({ type: "error", text: result.error || "Failed to create summary" })
    }
    setCreating(false)
  }

  const handleAcknowledge = async (notificationId: string) => {
    const result = await acknowledgeNotification(orgSlug, notificationId)
    if (result.success && result.data) {
      setHistory(history.map((h) =>
        h.notification_id === notificationId ? { ...h, acknowledged_at: new Date().toISOString() } : h
      ))
    }
  }

  // Stats for StatRow
  const statRowData = [
    { icon: Bell, value: stats?.active_channels || 0, label: "Channels", color: "mint" as const },
    { icon: AlertTriangle, value: stats?.active_rules || 0, label: "Active Rules", color: "coral" as const },
    { icon: Calendar, value: stats?.active_summaries || 0, label: "Summaries", color: "mint" as const },
    { icon: TrendingUp, value: `${stats?.delivery_rate || 0}%`, label: "Delivery Rate", color: "mint" as const },
  ]

  // Loading state
  if (isLoading) {
    return <LoadingState message="Loading notifications..." size="lg" />
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] sm:text-[24px] lg:text-[28px] font-bold text-[var(--text-primary)] tracking-tight leading-tight">
            Notifications
          </h1>
          <p className="text-[12px] sm:text-[13px] text-[var(--text-tertiary)] mt-1 sm:mt-2 max-w-lg">
            Configure alerts, summaries, and notification channels
          </p>
        </div>
        <PageActionsMenu onClearCache={loadData} />
      </div>

      {/* Backend Warning */}
      {(!backendConnected || !hasApiKey) && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-200">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-[var(--surface-primary)] shadow-sm flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                {!backendConnected ? "Backend Not Connected" : "API Key Missing"}
              </h3>
              <p className="text-[12px] text-[var(--text-secondary)] mt-1">
                {!backendConnected
                  ? "Your organization is not connected to the backend."
                  : "Your organization API key is missing."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 ${
          message.type === "success"
            ? "bg-[var(--cloudact-mint)]/10 border-[var(--cloudact-mint)]/20"
            : "bg-rose-50 border-rose-200"
        }`}>
          {message.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-[#1a7a3a] flex-shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
          )}
          <p className={`text-[12px] font-medium ${
            message.type === "success" ? "text-[#1a7a3a]" : "text-rose-700"
          }`}>
            {message.text}
          </p>
        </div>
      )}

      {/* Stats Row */}
      {stats && <StatRow stats={statRowData} />}

      {/* Tabs */}
      <Tabs defaultValue={initialTab} className="w-full">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="summaries">Summaries</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icon={Bell}
              title="Active Channels"
              value={stats?.active_channels || 0}
              subtitle={`${stats?.total_channels || 0} total channels`}
              color="mint"
            />
            <MetricCard
              icon={AlertTriangle}
              title="Alerts (24h)"
              value={stats?.alerts_24h || 0}
              subtitle={`${stats?.active_rules || 0} active rules`}
              color="coral"
            />
            <MetricCard
              icon={Send}
              title="Notifications (24h)"
              value={stats?.notifications_24h || 0}
              subtitle={`${stats?.delivery_rate || 0}% delivery rate`}
              color="blue"
            />
            <MetricCard
              icon={Clock}
              title="Pending Acks"
              value={stats?.pending_acknowledgments || 0}
              subtitle="Awaiting acknowledgment"
              color="amber"
            />
          </div>

          {/* Quick Actions */}
          <div className="mt-6">
            <SectionHeader title="Quick Actions" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <PremiumCard
                className="cursor-pointer"
                onClick={() => setShowCreateChannel(true)}
              >
                <div className="flex items-center gap-3 p-4">
                  <div className="h-10 w-10 rounded-xl bg-[var(--cloudact-mint)]/10 flex items-center justify-center">
                    <Plus className="h-5 w-5 text-[#1a7a3a]" />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-[var(--text-primary)]">Add Channel</div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">Email, Slack, or Webhook</div>
                  </div>
                </div>
              </PremiumCard>

              <PremiumCard
                className="cursor-pointer"
                onClick={() => setShowCreateRule(true)}
              >
                <div className="flex items-center gap-3 p-4">
                  <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-[var(--text-primary)]">Create Alert</div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">Cost, pipeline, anomaly alerts</div>
                  </div>
                </div>
              </PremiumCard>

              <PremiumCard
                className="cursor-pointer"
                onClick={() => setShowCreateSummary(true)}
              >
                <div className="flex items-center gap-3 p-4">
                  <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-[var(--text-primary)]">Schedule Summary</div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">Daily, weekly, monthly reports</div>
                  </div>
                </div>
              </PremiumCard>
            </div>
          </div>
        </TabsContent>

        {/* Channels Tab */}
        <TabsContent value="channels">
          <div className="flex items-center justify-between mb-4">
            <SectionHeader title="Notification Channels" subtitle="Configure where notifications are sent" />
            <Button
              onClick={() => setShowCreateChannel(true)}
              className="bg-[var(--cloudact-mint)] hover:bg-[var(--cloudact-mint-dark)] text-[var(--cloudact-mint-text)]"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Channel
            </Button>
          </div>

          <PremiumCard padding="none">
            {channels.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="No notification channels"
                description="Add email, Slack, or webhook channels to receive notifications"
                action={{
                  label: "Add Channel",
                  onClick: () => setShowCreateChannel(true),
                  icon: Plus,
                }}
                size="lg"
              />
            ) : (
              <div>
                {channels.map((channel) => (
                  <ChannelCard
                    key={channel.channel_id}
                    channel={channel}
                    onTest={() => handleTestChannel(channel.channel_id)}
                    onEdit={() => setEditingChannel(channel)}
                    onDelete={() => handleRequestDeleteChannel(channel)}
                    onToggle={() => handleToggleChannel(channel)}
                    testing={testingChannel === channel.channel_id}
                  />
                ))}
              </div>
            )}
          </PremiumCard>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts">
          <div className="flex items-center justify-between mb-4">
            <SectionHeader title="Alert Rules" subtitle="Configure when to send notifications" />
            <Button
              onClick={() => setShowCreateRule(true)}
              className="bg-[var(--cloudact-mint)] hover:bg-[var(--cloudact-mint-dark)] text-[var(--cloudact-mint-text)]"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Rule
            </Button>
          </div>

          <PremiumCard padding="none">
            {rules.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                title="No alert rules"
                description="Create rules to get notified about cost anomalies, budget thresholds, and more"
                action={{
                  label: "Create Rule",
                  onClick: () => setShowCreateRule(true),
                  icon: Plus,
                }}
                size="lg"
              />
            ) : (
              <div>
                {rules.map((rule) => (
                  <RuleCard
                    key={rule.rule_id}
                    rule={rule}
                    onEdit={() => setEditingRule(rule)}
                    onDelete={() => handleRequestDeleteRule(rule)}
                    onToggle={() => handleToggleRule(rule)}
                  />
                ))}
              </div>
            )}
          </PremiumCard>
        </TabsContent>

        {/* Summaries Tab */}
        <TabsContent value="summaries">
          <div className="flex items-center justify-between mb-4">
            <SectionHeader title="Cost Summaries" subtitle="Scheduled cost reports" />
            <Button
              onClick={() => setShowCreateSummary(true)}
              className="bg-[var(--cloudact-mint)] hover:bg-[var(--cloudact-mint-dark)] text-[var(--cloudact-mint-text)]"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Summary
            </Button>
          </div>

          <PremiumCard padding="none">
            {summaries.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="No scheduled summaries"
                description="Schedule daily, weekly, or monthly cost summary reports"
                action={{
                  label: "Create Summary",
                  onClick: () => setShowCreateSummary(true),
                  icon: Plus,
                }}
                size="lg"
              />
            ) : (
              <div>
                {summaries.map((summary) => (
                  <SummaryCard
                    key={summary.summary_id}
                    summary={summary}
                    onEdit={() => setEditingSummary(summary)}
                    onDelete={() => handleRequestDeleteSummary(summary)}
                    onSendNow={() => handleSendSummaryNow(summary.summary_id)}
                    onToggle={() => handleToggleSummary(summary)}
                    sending={sendingSummary === summary.summary_id}
                  />
                ))}
              </div>
            )}
          </PremiumCard>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <div className="flex items-center justify-between mb-4">
            <SectionHeader title="Notification History" subtitle="Recent notifications sent" />
          </div>

          <PremiumCard padding="none">
            {history.length === 0 ? (
              <EmptyState
                icon={History}
                title="No notification history"
                description="Notifications will appear here once sent"
                size="lg"
              />
            ) : (
              <div>
                {history.map((entry) => (
                  <HistoryEntry
                    key={entry.notification_id}
                    entry={entry}
                    onAcknowledge={() => handleAcknowledge(entry.notification_id)}
                  />
                ))}
              </div>
            )}
          </PremiumCard>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <CreateChannelDialog
        open={showCreateChannel}
        onOpenChange={setShowCreateChannel}
        onSubmit={handleCreateChannel}
        loading={creating}
      />

      <CreateRuleDialog
        open={showCreateRule}
        onOpenChange={setShowCreateRule}
        onSubmit={handleCreateRule}
        loading={creating}
        channels={channels}
      />

      <CreateSummaryDialog
        open={showCreateSummary}
        onOpenChange={setShowCreateSummary}
        onSubmit={handleCreateSummary}
        loading={creating}
        channels={channels}
      />

      {/* UX-003 FIX: Delete Confirmation Dialog */}
      <Dialog open={deleteConfirm !== null} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete {deleteConfirm?.type === "channel" ? "Channel" : deleteConfirm?.type === "rule" ? "Rule" : "Summary"}?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteConfirm?.name}&rdquo;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-[var(--cloudact-coral)] hover:bg-[var(--cloudact-coral)]/90"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
