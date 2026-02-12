/**
 * Chat API client for communicating with 07-org-chat-backend.
 *
 * All calls go through the Next.js /api/chat proxy route (server-side)
 * which handles authentication and forwards to the internal chat backend.
 * This ensures the internal-only chat backend (port 8002) is never
 * called directly from the browser.
 */

import type { ChatMessage, Conversation } from "./constants"

const DEFAULT_TIMEOUT = 120000 // 120s for LLM responses

// Proxy base: browser calls /api/chat/{org_slug}/... which Next.js proxies to chat backend
const CHAT_PROXY_BASE = "/api/chat"

async function chatFetch(
  path: string,
  options: RequestInit & { timeout?: number } = {},
  _context?: { apiKey?: string; orgSlug?: string; userId?: string }
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string>),
  }

  // Auth is handled server-side by the /api/chat proxy route
  // No need to send API keys from the browser

  try {
    const response = await fetch(`${CHAT_PROXY_BASE}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

/** Context required for authenticated chat backend calls. */
export interface ChatClientContext {
  apiKey: string
  orgSlug: string
  userId?: string
}

/**
 * Send a message and get a response from the chat backend.
 */
export async function sendMessage(
  orgSlug: string,
  message: string,
  conversationId?: string,
  ctx?: ChatClientContext
): Promise<{
  conversation_id: string
  response: string
  agent_name?: string
  model_id?: string
  latency_ms: number
}> {
  const response = await chatFetch(
    `/${orgSlug}/send`,
    {
      method: "POST",
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
      }),
    },
    ctx
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: "Failed to send message" }))
    throw new Error(errorData.message || errorData.detail || "Chat request failed")
  }

  return response.json()
}

/**
 * Load message history for a conversation.
 */
export async function getMessages(
  orgSlug: string,
  conversationId: string,
  ctx?: ChatClientContext
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ messages: any[] }> {
  const response = await chatFetch(
    `/${orgSlug}/conversations/${conversationId}/messages`,
    { method: "GET", timeout: 15000 },
    ctx
  )

  if (!response.ok) {
    throw new Error("Failed to load messages")
  }

  return response.json()
}

/**
 * List conversations for the authenticated user.
 */
export async function listConversations(
  orgSlug: string,
  ctx?: ChatClientContext
): Promise<{ conversations: Conversation[] }> {
  const response = await chatFetch(
    `/${orgSlug}/conversations`,
    { method: "GET", timeout: 15000 },
    ctx
  )

  if (!response.ok) {
    throw new Error("Failed to load conversations")
  }

  return response.json()
}

/**
 * Delete a conversation (soft-delete).
 */
export async function deleteConversation(
  orgSlug: string,
  conversationId: string,
  ctx?: ChatClientContext
): Promise<void> {
  const response = await chatFetch(
    `/${orgSlug}/conversations/${conversationId}`,
    { method: "DELETE", timeout: 15000 },
    ctx
  )

  if (!response.ok) {
    throw new Error("Failed to delete conversation")
  }
}

/**
 * Check if chat is configured for the org.
 */
export async function getChatStatus(
  orgSlug: string,
  ctx?: ChatClientContext
): Promise<{ configured: boolean; provider?: string; model_id?: string; status?: string }> {
  const response = await chatFetch(
    `/${orgSlug}/settings/status`,
    { method: "GET", timeout: 10000 },
    ctx
  )

  if (!response.ok) {
    return { configured: false, status: "error" }
  }

  return response.json()
}

/**
 * Send a message and stream the response via SSE.
 */
export async function streamMessage(
  orgSlug: string,
  message: string,
  conversationId?: string,
  ctx?: ChatClientContext,
  onToken: (text: string) => void = () => {},
  onDone: (data: { conversation_id: string; agent_name?: string; model_id?: string; latency_ms: number }) => void = () => {},
  onError: (error: string) => void = () => {},
): Promise<void> {
  // For streaming, use a longer timeout (connection only — cleared once stream starts)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120000)

  const response = await fetch(`${CHAT_PROXY_BASE}/${orgSlug}/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversation_id: conversationId }),
    signal: controller.signal,
  })

  // Connection established — clear timeout so streaming can continue indefinitely
  clearTimeout(timeoutId)

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: "Failed to send message" }))
    onError(errorData.message || errorData.detail || "Chat request failed")
    return
  }

  const reader = response.body?.getReader()
  if (!reader) {
    onError("Streaming not supported")
    return
  }

  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      let eventType = ""
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim()
        } else if (line.startsWith("data: ")) {
          const data = line.slice(6)
          try {
            const parsed = JSON.parse(data)
            if (eventType === "token") {
              onToken(parsed.text || "")
            } else if (eventType === "done") {
              onDone(parsed)
            } else if (eventType === "error") {
              onError(parsed.message || "Unknown error")
            }
          } catch {
            // Non-JSON data line, skip
          }
          eventType = ""
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Delete a message from a conversation.
 * Client-side only -- remove from local state.
 * Backend doesn't support individual message deletion (BQ streaming buffer limitation).
 */
export async function deleteMessage(
  _orgSlug: string,
  _conversationId: string,
  _messageId: string,
  _ctx?: ChatClientContext
): Promise<void> {
  // Client-side only — remove from local state
  // Backend doesn't support individual message deletion (BQ streaming buffer limitation)
}

/**
 * Rename a conversation.
 */
export async function renameConversation(
  orgSlug: string,
  conversationId: string,
  title: string,
  ctx?: ChatClientContext
): Promise<void> {
  const response = await chatFetch(
    `/${orgSlug}/conversations/${conversationId}/rename`,
    {
      method: "PATCH",
      body: JSON.stringify({ title }),
      timeout: 10000,
    },
    ctx
  )
  if (!response.ok) {
    throw new Error("Failed to rename conversation")
  }
}

/**
 * Search messages across conversations.
 */
export async function searchMessages(
  orgSlug: string,
  query: string,
  ctx?: ChatClientContext
): Promise<{ results: Array<{ conversation_id: string; message_id: string; content: string; role: string; created_at: string }> }> {
  const response = await chatFetch(
    `/${orgSlug}/messages/search?q=${encodeURIComponent(query)}`,
    { method: "GET", timeout: 15000 },
    ctx
  )
  if (!response.ok) {
    return { results: [] }
  }
  return response.json()
}
