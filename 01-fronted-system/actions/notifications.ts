"use server"

/**
 * Notification Settings Server Actions
 *
 * Server actions for managing notification channels, rules, summaries, and history.
 * Uses the notification settings API endpoints from the backend.
 */

import { logError } from "@/lib/utils"
import { getAuthContext } from "@/lib/auth-cache"
import {
  getApiServiceUrl,
  fetchWithTimeout,
  safeJsonParse,
  extractErrorMessage,
} from "@/lib/api/helpers"

// ============================================
// Types
// ============================================

export type ChannelType = "email" | "slack" | "webhook"
export type RuleCategory = "cost" | "pipeline" | "integration" | "subscription" | "system"
export type RuleType =
  | "budget_percent"
  | "budget_forecast"
  | "absolute_threshold"
  | "anomaly_percent_change"
  | "anomaly_std_deviation"
  | "hierarchy_budget"
  | "pipeline_failure"
  | "pipeline_success"
  | "data_freshness"
  | "integration_health"
  | "credential_expiry"
  | "subscription_renewal"
  | "license_utilization"
export type RulePriority = "critical" | "high" | "medium" | "low" | "info"
export type SummaryType = "daily" | "weekly" | "monthly"
export type NotificationStatus = "queued" | "sent" | "delivered" | "failed" | "skipped"

export interface RuleConditions {
  // Budget rules
  budget_amount?: number
  budget_period?: string
  threshold_percent?: number
  forecast_threshold_percent?: number
  // Absolute threshold
  period?: string
  threshold_amount?: number
  // Anomaly detection
  comparison?: string
  min_absolute_change?: number
  lookback_days?: number
  std_dev_threshold?: number
  // Hierarchy
  hierarchy_level?: string
  // Pipeline
  pipeline_patterns?: string[]
  consecutive_failures?: number
  // Data freshness
  max_hours_since_update?: number
  tables?: string[]
  // Integration
  check_type?: string
  expiry_warning_days?: number
  // Subscription
  days_before_renewal?: number[]
  utilization_threshold_percent?: number
}

export interface NotificationChannel {
  channel_id: string
  org_slug: string
  channel_type: ChannelType
  name: string
  is_default: boolean
  is_active: boolean
  email_recipients?: string[]
  email_cc_recipients?: string[]
  email_subject_prefix?: string
  slack_channel?: string
  slack_mention_users?: string[]
  slack_mention_channel?: boolean
  slack_webhook_configured?: boolean
  webhook_configured?: boolean
  webhook_method?: string
  created_at: string
  updated_at?: string
  created_by?: string
}

export interface NotificationChannelCreate {
  name: string
  channel_type: ChannelType
  is_default?: boolean
  is_active?: boolean
  email_recipients?: string[]
  email_cc_recipients?: string[]
  email_subject_prefix?: string
  slack_webhook_url?: string
  slack_channel?: string
  slack_mention_users?: string[]
  slack_mention_channel?: boolean
  webhook_url?: string
  webhook_headers?: Record<string, string>
  webhook_method?: string
}

export interface NotificationChannelUpdate {
  name?: string
  is_default?: boolean
  is_active?: boolean
  email_recipients?: string[]
  email_cc_recipients?: string[]
  email_subject_prefix?: string
  slack_webhook_url?: string
  slack_channel?: string
  slack_mention_users?: string[]
  slack_mention_channel?: boolean
  webhook_url?: string
  webhook_headers?: Record<string, string>
  webhook_method?: string
}

export interface NotificationRule {
  rule_id: string
  org_slug: string
  name: string
  description?: string
  is_active: boolean
  priority: RulePriority
  rule_category: RuleCategory
  rule_type: RuleType
  conditions: RuleConditions
  provider_filter?: string[]
  service_filter?: string[]
  hierarchy_entity_id?: string
  hierarchy_path?: string
  notify_channel_ids: string[]
  escalate_after_mins?: number
  escalate_to_channel_ids?: string[]
  cooldown_minutes?: number
  batch_window_minutes?: number
  quiet_hours_start?: string
  quiet_hours_end?: string
  quiet_hours_timezone?: string
  last_triggered_at?: string
  trigger_count_today: number
  acknowledged_at?: string
  acknowledged_by?: string
  created_at: string
  updated_at?: string
  created_by?: string
}

export interface NotificationRuleCreate {
  name: string
  description?: string
  is_active?: boolean
  priority?: RulePriority
  rule_category: RuleCategory
  rule_type: RuleType
  conditions: RuleConditions
  provider_filter?: string[]
  service_filter?: string[]
  hierarchy_entity_id?: string
  hierarchy_path?: string
  notify_channel_ids: string[]
  escalate_after_mins?: number
  escalate_to_channel_ids?: string[]
  cooldown_minutes?: number
  batch_window_minutes?: number
  quiet_hours_start?: string
  quiet_hours_end?: string
  quiet_hours_timezone?: string
}

export interface NotificationRuleUpdate {
  name?: string
  description?: string
  is_active?: boolean
  priority?: RulePriority
  conditions?: RuleConditions
  provider_filter?: string[]
  service_filter?: string[]
  hierarchy_entity_id?: string
  hierarchy_path?: string
  notify_channel_ids?: string[]
  escalate_after_mins?: number
  escalate_to_channel_ids?: string[]
  cooldown_minutes?: number
  batch_window_minutes?: number
  quiet_hours_start?: string
  quiet_hours_end?: string
  quiet_hours_timezone?: string
}

export interface NotificationSummary {
  summary_id: string
  org_slug: string
  name: string
  summary_type: SummaryType
  is_active: boolean
  schedule_cron: string
  schedule_timezone: string
  notify_channel_ids: string[]
  include_sections: string[]
  top_n_items: number
  currency_display?: string
  provider_filter?: string[]
  hierarchy_filter?: Record<string, string>
  last_sent_at?: string
  next_scheduled_at?: string
  created_at: string
  updated_at?: string
  created_by?: string
}

export interface NotificationSummaryCreate {
  name: string
  summary_type: SummaryType
  is_active?: boolean
  schedule_cron: string
  schedule_timezone?: string
  notify_channel_ids: string[]
  include_sections?: string[]
  top_n_items?: number
  currency_display?: string
  provider_filter?: string[]
  hierarchy_filter?: Record<string, string>
}

export interface NotificationSummaryUpdate {
  name?: string
  is_active?: boolean
  schedule_cron?: string
  schedule_timezone?: string
  notify_channel_ids?: string[]
  include_sections?: string[]
  top_n_items?: number
  currency_display?: string
  provider_filter?: string[]
  hierarchy_filter?: Record<string, string>
}

export interface NotificationHistoryEntry {
  notification_id: string
  org_slug: string
  rule_id?: string
  summary_id?: string
  channel_id: string
  notification_type: string
  priority?: string
  subject: string
  body_preview?: string
  status: NotificationStatus
  sent_at?: string
  delivered_at?: string
  error_message?: string
  retry_count: number
  trigger_data?: Record<string, unknown>
  recipients: string[]
  acknowledged_at?: string
  acknowledged_by?: string
  escalated: boolean
  escalated_at?: string
  created_at: string
}

export interface NotificationStats {
  total_channels: number
  active_channels: number
  total_rules: number
  active_rules: number
  total_summaries: number
  active_summaries: number
  notifications_24h: number
  alerts_24h: number
  delivery_rate: number
  pending_acknowledgments: number
}

export interface ActionResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// Auth is now handled by shared @/lib/auth-cache module

// ============================================
// Channel Actions
// ============================================

export async function listNotificationChannels(
  orgSlug: string,
  channelType?: ChannelType,
  activeOnly?: boolean
): Promise<ActionResponse<NotificationChannel[]>> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthContext(orgSlug)
    if (!authContext) {
      return { success: false, error: "Organization API key not found." }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const params = new URLSearchParams()
    if (channelType) params.append("channel_type", channelType)
    if (activeOnly) params.append("active_only", "true")

    const url = `${apiUrl}/api/v1/notifications/${orgSlug}/channels${params.toString() ? `?${params.toString()}` : ""}`

    const response = await fetchWithTimeout(url, {
      headers: { "X-API-Key": orgApiKey },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<NotificationChannel[]>(response, [])
    return { success: true, data }
  } catch (error) {
    return { success: false, error: logError("listNotificationChannels", error) }
  }
}

export async function createNotificationChannel(
  orgSlug: string,
  channel: NotificationChannelCreate
): Promise<ActionResponse<NotificationChannel>> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthContext(orgSlug)
    if (!authContext) {
      return { success: false, error: "Organization API key not found." }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/notifications/${orgSlug}/channels`,
      {
        method: "POST",
        headers: {
          "X-API-Key": orgApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(channel),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<NotificationChannel>(response, {} as NotificationChannel)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: logError("createNotificationChannel", error) }
  }
}

export async function updateNotificationChannel(
  orgSlug: string,
  channelId: string,
  update: NotificationChannelUpdate
): Promise<ActionResponse<NotificationChannel>> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthContext(orgSlug)
    if (!authContext) {
      return { success: false, error: "Organization API key not found." }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/notifications/${orgSlug}/channels/${channelId}`,
      {
        method: "PUT",
        headers: {
          "X-API-Key": orgApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(update),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<NotificationChannel>(response, {} as NotificationChannel)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: logError("updateNotificationChannel", error) }
  }
}

export async function deleteNotificationChannel(
  orgSlug: string,
  channelId: string
): Promise<ActionResponse<void>> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthContext(orgSlug)
    if (!authContext) {
      return { success: false, error: "Organization API key not found." }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/notifications/${orgSlug}/channels/${channelId}`,
      {
        method: "DELETE",
        headers: { "X-API-Key": orgApiKey },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: extractErrorMessage(errorText) }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: logError("deleteNotificationChannel", error) }
  }
}

export async function testNotificationChannel(
  orgSlug: string,
  channelId: string
): Promise<ActionResponse<{ message: string }>> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthContext(orgSlug)
    if (!authContext) {
      return { success: false, error: "Organization API key not found." }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/notifications/${orgSlug}/channels/${channelId}/test`,
      {
        method: "POST",
        headers: { "X-API-Key": orgApiKey },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<{ message: string }>(response, { message: "" })
    return { success: true, data }
  } catch (error) {
    return { success: false, error: logError("testNotificationChannel", error) }
  }
}

// ============================================
// Rule Actions
// ============================================

export async function listNotificationRules(
  orgSlug: string,
  category?: RuleCategory,
  priority?: RulePriority,
  activeOnly?: boolean
): Promise<ActionResponse<NotificationRule[]>> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthContext(orgSlug)
    if (!authContext) {
      return { success: false, error: "Organization API key not found." }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const params = new URLSearchParams()
    if (category) params.append("category", category)
    if (priority) params.append("priority", priority)
    if (activeOnly) params.append("active_only", "true")

    const url = `${apiUrl}/api/v1/notifications/${orgSlug}/rules${params.toString() ? `?${params.toString()}` : ""}`

    const response = await fetchWithTimeout(url, {
      headers: { "X-API-Key": orgApiKey },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<NotificationRule[]>(response, [])
    return { success: true, data }
  } catch (error) {
    return { success: false, error: logError("listNotificationRules", error) }
  }
}

export async function createNotificationRule(
  orgSlug: string,
  rule: NotificationRuleCreate
): Promise<ActionResponse<NotificationRule>> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthContext(orgSlug)
    if (!authContext) {
      return { success: false, error: "Organization API key not found." }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/notifications/${orgSlug}/rules`,
      {
        method: "POST",
        headers: {
          "X-API-Key": orgApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(rule),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<NotificationRule>(response, {} as NotificationRule)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: logError("createNotificationRule", error) }
  }
}

export async function updateNotificationRule(
  orgSlug: string,
  ruleId: string,
  update: NotificationRuleUpdate
): Promise<ActionResponse<NotificationRule>> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthContext(orgSlug)
    if (!authContext) {
      return { success: false, error: "Organization API key not found." }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/notifications/${orgSlug}/rules/${ruleId}`,
      {
        method: "PUT",
        headers: {
          "X-API-Key": orgApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(update),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<NotificationRule>(response, {} as NotificationRule)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: logError("updateNotificationRule", error) }
  }
}

export async function deleteNotificationRule(
  orgSlug: string,
  ruleId: string
): Promise<ActionResponse<void>> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthContext(orgSlug)
    if (!authContext) {
      return { success: false, error: "Organization API key not found." }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/notifications/${orgSlug}/rules/${ruleId}`,
      {
        method: "DELETE",
        headers: { "X-API-Key": orgApiKey },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: extractErrorMessage(errorText) }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: logError("deleteNotificationRule", error) }
  }
}

export async function pauseNotificationRule(
  orgSlug: string,
  ruleId: string
): Promise<ActionResponse<NotificationRule>> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthContext(orgSlug)
    if (!authContext) {
      return { success: false, error: "Organization API key not found." }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/notifications/${orgSlug}/rules/${ruleId}/pause`,
      {
        method: "POST",
        headers: { "X-API-Key": orgApiKey },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<NotificationRule>(response, {} as NotificationRule)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: logError("pauseNotificationRule", error) }
  }
}

export async function resumeNotificationRule(
  orgSlug: string,
  ruleId: string
): Promise<ActionResponse<NotificationRule>> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthContext(orgSlug)
    if (!authContext) {
      return { success: false, error: "Organization API key not found." }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/notifications/${orgSlug}/rules/${ruleId}/resume`,
      {
        method: "POST",
        headers: { "X-API-Key": orgApiKey },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<NotificationRule>(response, {} as NotificationRule)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: logError("resumeNotificationRule", error) }
  }
}

// ============================================
// Summary Actions
// ============================================

export async function listNotificationSummaries(
  orgSlug: string,
  summaryType?: SummaryType,
  activeOnly?: boolean
): Promise<ActionResponse<NotificationSummary[]>> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthContext(orgSlug)
    if (!authContext) {
      return { success: false, error: "Organization API key not found." }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const params = new URLSearchParams()
    if (summaryType) params.append("summary_type", summaryType)
    if (activeOnly) params.append("active_only", "true")

    const url = `${apiUrl}/api/v1/notifications/${orgSlug}/summaries${params.toString() ? `?${params.toString()}` : ""}`

    const response = await fetchWithTimeout(url, {
      headers: { "X-API-Key": orgApiKey },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<NotificationSummary[]>(response, [])
    return { success: true, data }
  } catch (error) {
    return { success: false, error: logError("listNotificationSummaries", error) }
  }
}

export async function createNotificationSummary(
  orgSlug: string,
  summary: NotificationSummaryCreate
): Promise<ActionResponse<NotificationSummary>> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthContext(orgSlug)
    if (!authContext) {
      return { success: false, error: "Organization API key not found." }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/notifications/${orgSlug}/summaries`,
      {
        method: "POST",
        headers: {
          "X-API-Key": orgApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(summary),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<NotificationSummary>(response, {} as NotificationSummary)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: logError("createNotificationSummary", error) }
  }
}

export async function updateNotificationSummary(
  orgSlug: string,
  summaryId: string,
  update: NotificationSummaryUpdate
): Promise<ActionResponse<NotificationSummary>> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthContext(orgSlug)
    if (!authContext) {
      return { success: false, error: "Organization API key not found." }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/notifications/${orgSlug}/summaries/${summaryId}`,
      {
        method: "PUT",
        headers: {
          "X-API-Key": orgApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(update),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<NotificationSummary>(response, {} as NotificationSummary)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: logError("updateNotificationSummary", error) }
  }
}

export async function deleteNotificationSummary(
  orgSlug: string,
  summaryId: string
): Promise<ActionResponse<void>> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthContext(orgSlug)
    if (!authContext) {
      return { success: false, error: "Organization API key not found." }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/notifications/${orgSlug}/summaries/${summaryId}`,
      {
        method: "DELETE",
        headers: { "X-API-Key": orgApiKey },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: extractErrorMessage(errorText) }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: logError("deleteNotificationSummary", error) }
  }
}

export async function sendNotificationSummaryNow(
  orgSlug: string,
  summaryId: string
): Promise<ActionResponse<{ message: string }>> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthContext(orgSlug)
    if (!authContext) {
      return { success: false, error: "Organization API key not found." }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/notifications/${orgSlug}/summaries/${summaryId}/send-now`,
      {
        method: "POST",
        headers: { "X-API-Key": orgApiKey },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<{ message: string }>(response, { message: "" })
    return { success: true, data }
  } catch (error) {
    return { success: false, error: logError("sendNotificationSummaryNow", error) }
  }
}

// ============================================
// History Actions
// ============================================

export async function listNotificationHistory(
  orgSlug: string,
  options?: {
    notificationType?: string
    channelId?: string
    status?: NotificationStatus
    days?: number
    limit?: number
    offset?: number
  }
): Promise<ActionResponse<NotificationHistoryEntry[]>> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthContext(orgSlug)
    if (!authContext) {
      return { success: false, error: "Organization API key not found." }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const params = new URLSearchParams()
    if (options?.notificationType) params.append("notification_type", options.notificationType)
    if (options?.channelId) params.append("channel_id", options.channelId)
    if (options?.status) params.append("status", options.status)
    if (options?.days) params.append("days", options.days.toString())
    if (options?.limit) params.append("limit", options.limit.toString())
    if (options?.offset) params.append("offset", options.offset.toString())

    const url = `${apiUrl}/api/v1/notifications/${orgSlug}/history${params.toString() ? `?${params.toString()}` : ""}`

    const response = await fetchWithTimeout(url, {
      headers: { "X-API-Key": orgApiKey },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<NotificationHistoryEntry[]>(response, [])
    return { success: true, data }
  } catch (error) {
    return { success: false, error: logError("listNotificationHistory", error) }
  }
}

export async function acknowledgeNotification(
  orgSlug: string,
  notificationId: string
): Promise<ActionResponse<NotificationHistoryEntry>> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthContext(orgSlug)
    if (!authContext) {
      return { success: false, error: "Organization API key not found." }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/notifications/${orgSlug}/history/${notificationId}/acknowledge`,
      {
        method: "POST",
        headers: { "X-API-Key": orgApiKey },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<NotificationHistoryEntry>(response, {} as NotificationHistoryEntry)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: logError("acknowledgeNotification", error) }
  }
}

// ============================================
// Stats Actions
// ============================================

export async function getNotificationStats(
  orgSlug: string
): Promise<ActionResponse<NotificationStats>> {
  try {
    // PERFORMANCE: Use cached auth + API key
    const authContext = await getAuthContext(orgSlug)
    if (!authContext) {
      return { success: false, error: "Organization API key not found." }
    }
    const { apiKey: orgApiKey } = authContext

    const apiUrl = getApiServiceUrl()
    const response = await fetchWithTimeout(
      `${apiUrl}/api/v1/notifications/${orgSlug}/stats`,
      {
        headers: { "X-API-Key": orgApiKey },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: extractErrorMessage(errorText) }
    }

    const data = await safeJsonParse<NotificationStats>(response, {
      total_channels: 0,
      active_channels: 0,
      total_rules: 0,
      active_rules: 0,
      total_summaries: 0,
      active_summaries: 0,
      notifications_24h: 0,
      alerts_24h: 0,
      delivery_rate: 0,
      pending_acknowledgments: 0,
    })
    return { success: true, data }
  } catch (error) {
    return { success: false, error: logError("getNotificationStats", error) }
  }
}
