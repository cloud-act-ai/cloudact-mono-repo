"use server"

/**
 * Server actions for chat settings CRUD.
 * Calls 02-api-service chat-settings endpoints.
 */

import type { ChatSettings, ChatSettingsInput, ProviderInfo } from "@/lib/chat/constants"
import { requireOrgMembership } from "@/lib/auth-cache"
import { isValidOrgSlug } from "@/lib/utils/validation"

const API_URL = process.env.API_SERVICE_URL || process.env.NEXT_PUBLIC_API_SERVICE_URL || "http://localhost:8000"

async function apiRequest(
  path: string,
  options: RequestInit,
  apiKey: string
): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...(options.headers as Record<string, string>),
    },
  })
}

/**
 * Get active chat settings for an organization.
 */
export async function getChatSettings(
  orgSlug: string,
  apiKey: string
): Promise<{ success: boolean; data?: ChatSettings; error?: string }> {
  if (!isValidOrgSlug(orgSlug)) {
    return { success: false, error: "Invalid organization" }
  }

  try {
    await requireOrgMembership(orgSlug)

    const response = await apiRequest(
      `/api/v1/chat-settings/${orgSlug}`,
      { method: "GET" },
      apiKey
    )

    if (response.status === 204 || response.status === 404) {
      return { success: true, data: undefined }
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      return { success: false, error: err.detail || "Failed to load settings" }
    }

    const data = await response.json()
    return { success: true, data: data || undefined }
  } catch (e) {
    if (e instanceof Error && e.message.includes("membership")) {
      return { success: false, error: "Access denied" }
    }
    return { success: false, error: "Failed to connect to API" }
  }
}

/**
 * Create or update chat settings.
 */
export async function saveChatSettings(
  orgSlug: string,
  settings: ChatSettingsInput,
  apiKey: string
): Promise<{ success: boolean; data?: ChatSettings; error?: string }> {
  if (!isValidOrgSlug(orgSlug)) {
    return { success: false, error: "Invalid organization" }
  }

  try {
    await requireOrgMembership(orgSlug)
    const response = await apiRequest(
      `/api/v1/chat-settings/${orgSlug}`,
      {
        method: "POST",
        body: JSON.stringify(settings),
      },
      apiKey
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      return { success: false, error: err.detail || "Failed to save settings" }
    }

    const data = await response.json()
    return { success: true, data }
  } catch {
    return { success: false, error: "Failed to connect to API" }
  }
}

/**
 * Delete chat settings.
 */
export async function deleteChatSettings(
  orgSlug: string,
  settingId: string,
  apiKey: string
): Promise<{ success: boolean; error?: string }> {
  if (!isValidOrgSlug(orgSlug)) {
    return { success: false, error: "Invalid organization" }
  }

  try {
    await requireOrgMembership(orgSlug)
    const response = await apiRequest(
      `/api/v1/chat-settings/${orgSlug}/${settingId}`,
      { method: "DELETE" },
      apiKey
    )

    if (!response.ok && response.status !== 204) {
      const err = await response.json().catch(() => ({}))
      return { success: false, error: err.detail || "Failed to delete settings" }
    }

    return { success: true }
  } catch {
    return { success: false, error: "Failed to connect to API" }
  }
}

/**
 * List available providers and their credential status.
 */
export async function getProviders(
  orgSlug: string,
  apiKey: string
): Promise<{ success: boolean; providers?: ProviderInfo[]; error?: string }> {
  if (!isValidOrgSlug(orgSlug)) {
    return { success: false, error: "Invalid organization" }
  }

  try {
    await requireOrgMembership(orgSlug)
    const response = await apiRequest(
      `/api/v1/chat-settings/${orgSlug}/providers`,
      { method: "GET" },
      apiKey
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      return { success: false, error: err.detail || "Failed to load providers" }
    }

    const data = await response.json()
    return { success: true, providers: data.providers }
  } catch {
    return { success: false, error: "Failed to connect to API" }
  }
}
