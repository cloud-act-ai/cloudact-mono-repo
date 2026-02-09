/**
 * Chat API client for communicating with 07-org-chat-backend.
 */

import { CHAT_BACKEND_URL } from "./constants"
import type { ChatMessage, Conversation } from "./constants"

const DEFAULT_TIMEOUT = 60000 // 60s for LLM responses

async function chatFetch(
  path: string,
  options: RequestInit & { timeout?: number } = {},
  apiKey?: string
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string>),
  }

  if (apiKey) {
    headers["X-API-Key"] = apiKey
  }

  try {
    const response = await fetch(`${CHAT_BACKEND_URL}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Send a message and get a response from the chat backend.
 */
export async function sendMessage(
  orgSlug: string,
  message: string,
  conversationId?: string,
  apiKey?: string
): Promise<{
  conversation_id: string
  response: string
  agent_name?: string
  model_id?: string
  latency_ms: number
}> {
  const response = await chatFetch(
    `/api/v1/chat/${orgSlug}/send`,
    {
      method: "POST",
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
      }),
    },
    apiKey
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: "Failed to send message" }))
    throw new Error(errorData.message || errorData.detail || "Chat request failed")
  }

  return response.json()
}

/**
 * List conversations for the authenticated user.
 */
export async function listConversations(
  orgSlug: string,
  apiKey?: string
): Promise<{ conversations: Conversation[] }> {
  const response = await chatFetch(
    `/api/v1/chat/${orgSlug}/conversations`,
    { method: "GET", timeout: 15000 },
    apiKey
  )

  if (!response.ok) {
    throw new Error("Failed to load conversations")
  }

  return response.json()
}

/**
 * Check if chat is configured for the org.
 */
export async function getChatStatus(
  orgSlug: string,
  apiKey?: string
): Promise<{ configured: boolean; provider?: string; model_id?: string; status?: string }> {
  const response = await chatFetch(
    `/api/v1/chat/${orgSlug}/settings/status`,
    { method: "GET", timeout: 10000 },
    apiKey
  )

  if (!response.ok) {
    return { configured: false, status: "error" }
  }

  return response.json()
}
