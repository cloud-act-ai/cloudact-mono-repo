"use client"

/**
 * Main chat message area with input.
 * Handles message sending, display, and conversation state.
 */

import { useState, useRef, useEffect, useCallback, memo } from "react"
import { Send, Loader2, Bot, User, Copy, Check, RotateCcw, AlertCircle, Trash2 } from "lucide-react"
import { sendMessage, streamMessage, getMessages } from "@/lib/chat/client"
import type { ChatClientContext } from "@/lib/chat/client"
import type { ChatMessage } from "@/lib/chat/constants"
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/constants"

interface ChatCopilotProps {
  orgSlug: string
  conversationId?: string
  chatCtx?: ChatClientContext
  onConversationCreated?: (id: string) => void
  initialMessage?: string
}

// ============================================
// Memoized message component
// ============================================

const ChatMessageBubble = memo(function ChatMessageBubble({
  msg,
  onRetry,
  onCopy,
  onDelete,
  copiedId,
}: {
  msg: ChatMessage
  onRetry?: (content: string) => void
  onCopy: (id: string, content: string) => void
  onDelete?: (id: string) => void
  copiedId: string | null
}) {
  const isUser = msg.role === "user"
  const isError = msg.isError

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border ${
          isError
            ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
            : "bg-gray-100 dark:bg-[var(--text-primary)] border-gray-200 dark:border-[var(--text-secondary)]"
        }`}>
          {isError ? (
            <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400" />
          ) : (
            <Bot className="h-4 w-4 text-[var(--cloudact-mint-dark)]" />
          )}
        </div>
      )}
      <div className="group relative max-w-[80%]">
        <div
          className={`rounded-xl px-4 py-3 ${
            isUser
              ? "bg-gray-900 text-white dark:bg-[var(--text-secondary)]"
              : isError
                ? "bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/10 dark:border-red-800/50 dark:text-red-300"
                : "bg-gray-50 border border-gray-200 text-gray-800 dark:bg-[var(--text-primary)]/50 dark:border-[var(--text-secondary)]/50 dark:text-[var(--border-subtle)]"
          }`}
        >
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {msg.content}
            {msg.isStreaming && (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-[var(--cloudact-mint-dark)] animate-pulse rounded-sm" />
            )}
          </p>
          {!isUser && !isError && !msg.isStreaming && msg.agent_name && (
            <p className="mt-2 text-xs text-gray-400 dark:text-[var(--text-tertiary)]">
              {msg.agent_name}
              {msg.latency_ms ? ` · ${(msg.latency_ms / 1000).toFixed(1)}s` : ""}
            </p>
          )}
        </div>

        {/* Actions: copy + retry (assistant messages) */}
        {!isUser && !msg.isStreaming && (
          <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {!isError && (
              <button
                onClick={() => onCopy(msg.id, msg.content)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-[var(--text-tertiary)] dark:hover:bg-[var(--text-primary)] dark:hover:text-[var(--text-muted)]"
                aria-label="Copy response"
              >
                {copiedId === msg.id ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            {isError && onRetry && (
              <button
                onClick={() => onRetry(msg.content)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                aria-label="Retry message"
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </button>
            )}
          </div>
        )}

        {/* Actions: delete (user messages) */}
        {isUser && (
          <div className="mt-1 flex items-center gap-1 justify-end opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={() => onDelete?.(msg.id)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:text-[var(--text-tertiary)] dark:hover:bg-[var(--text-primary)] dark:hover:text-red-400"
              aria-label="Delete message"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      {isUser && (
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-[var(--text-secondary)]">
          <User className="h-4 w-4 text-gray-500 dark:text-[var(--text-muted)]" />
        </div>
      )}
    </div>
  )
})

// ============================================
// Main ChatCopilot component
// ============================================

export function ChatCopilot({
  orgSlug,
  conversationId,
  chatCtx,
  onConversationCreated,
  initialMessage,
}: ChatCopilotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState(false)
  const [currentConvId, setCurrentConvId] = useState(conversationId)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const initialMessageSentRef = useRef(false)
  const idCounter = useRef(0)
  const prevConvIdRef = useRef<string | undefined>(conversationId)
  const justCreatedRef = useRef(false) // Skip history load for conversations we just created

  // Draft message localStorage key
  const DRAFT_KEY = `chat_draft_${orgSlug}_${conversationId || "new"}`

  // Unique ID generator (no collisions)
  const nextId = useCallback((prefix: string) => {
    idCounter.current += 1
    return `${prefix}_${Date.now()}_${idCounter.current}`
  }, [])

  // Sync currentConvId when conversationId prop changes.
  // Only clear messages when switching to a DIFFERENT conversation,
  // NOT when a new conversation ID is assigned to an in-progress session
  // (e.g., after first message creates the conversation).
  useEffect(() => {
    const prev = prevConvIdRef.current
    const next = conversationId

    // Case 1: New conversation assigned (undefined → id) — keep messages, just sync ID
    if (!prev && next) {
      setCurrentConvId(next)
      prevConvIdRef.current = next
      justCreatedRef.current = true // Skip next history load — we already have the messages
      return
    }

    // Case 2: Switched to a different existing conversation — clear messages
    if (prev !== next) {
      setCurrentConvId(next)
      setMessages([])
      setHistoryError(false)
      setLastFailedMessage(null)
      initialMessageSentRef.current = false
      prevConvIdRef.current = next
    }
  }, [conversationId])

  // Restore draft from localStorage on mount / conversation change
  useEffect(() => {
    if (typeof window === "undefined") return
    const draft = localStorage.getItem(DRAFT_KEY)
    if (draft) setInput(draft)
  }, [conversationId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Save draft as user types (debounced 500ms)
  useEffect(() => {
    if (typeof window === "undefined") return
    const timer = setTimeout(() => {
      if (input) localStorage.setItem(DRAFT_KEY, input)
      else localStorage.removeItem(DRAFT_KEY)
    }, 500)
    return () => clearTimeout(timer)
  }, [input, DRAFT_KEY])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, sending])

  // Load message history when opening an existing conversation.
  // Skip loading if we already have messages (e.g., new conversation just created
  // during this session — messages are already in state from the streaming response).
  useEffect(() => {
    if (!conversationId || !chatCtx) return
    // Skip if this conversation was just created in this session (messages are already in state)
    if (justCreatedRef.current) {
      justCreatedRef.current = false
      return
    }
    // If we already have messages for this conversation, skip history load
    if (messages.length > 0 && messages[0]?.conversation_id === conversationId) return
    // Also skip if messages exist but conversation_id hasn't been set yet (mid-stream)
    if (messages.length > 0 && sending) return

    let cancelled = false

    async function loadHistory() {
      setLoadingHistory(true)
      setHistoryError(false)
      try {
        const data = await getMessages(orgSlug, conversationId!, chatCtx)
        if (!cancelled && data.messages) {
          setMessages(
            data.messages.map((m: Record<string, string | number | undefined>) => ({
              id: (m.message_id ?? m.id ?? `hist_${idCounter.current++}`) as string,
              conversation_id: conversationId!,
              role: (m.role === "user" || m.role === "assistant" ? m.role : "assistant") as "user" | "assistant",
              content: (m.content as string) || "",
              agent_name: m.agent_name as string | undefined,
              model_id: m.model_id as string | undefined,
              created_at: (m.created_at as string) || new Date().toISOString(),
            }))
          )
        }
      } catch {
        if (!cancelled) setHistoryError(true)
      } finally {
        if (!cancelled) setLoadingHistory(false)
      }
    }
    loadHistory()

    return () => { cancelled = true }
  }, [conversationId, orgSlug, chatCtx]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle initial message (from suggestion clicks)
  useEffect(() => {
    if (initialMessage && !initialMessageSentRef.current) {
      initialMessageSentRef.current = true
      handleSend(initialMessage)
    }
  }, [initialMessage]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(
    async (messageText?: string) => {
      const text = (messageText || input).trim()
      if (!text || sending) return
      if (text.length > MAX_MESSAGE_LENGTH) return

      setInput("")
      if (typeof window !== "undefined") localStorage.removeItem(DRAFT_KEY)
      setSending(true)
      setLastFailedMessage(null)

      // Add user message immediately
      const userMsg: ChatMessage = {
        id: nextId("user"),
        conversation_id: currentConvId || "",
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMsg])

      // Add streaming assistant message placeholder
      const streamMsgId = nextId("stream")
      const streamMsg: ChatMessage = {
        id: streamMsgId,
        conversation_id: currentConvId || "",
        role: "assistant",
        content: "",
        created_at: new Date().toISOString(),
        isStreaming: true,
      }
      setMessages((prev) => [...prev, streamMsg])

      try {
        await streamMessage(
          orgSlug,
          text,
          currentConvId,
          chatCtx,
          // onToken
          (token) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamMsgId ? { ...m, content: m.content + token } : m
              )
            )
          },
          // onDone
          (data) => {
            const isNewConv = !currentConvId && data.conversation_id
            if (isNewConv) {
              setCurrentConvId(data.conversation_id)
              onConversationCreated?.(data.conversation_id)
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamMsgId
                  ? {
                      ...m,
                      isStreaming: false,
                      conversation_id: data.conversation_id,
                      agent_name: data.agent_name,
                      model_id: data.model_id,
                      latency_ms: data.latency_ms,
                    }
                  : isNewConv
                    ? { ...m, conversation_id: data.conversation_id }
                    : m
              )
            )
            setSending(false)
            inputRef.current?.focus()
          },
          // onError -- fall back to non-streaming
          async (errorMsg) => {
            // Remove streaming placeholder
            setMessages((prev) => prev.filter((m) => m.id !== streamMsgId))

            // Fall back to regular sendMessage
            try {
              const result = await sendMessage(orgSlug, text, currentConvId, chatCtx)

              const isNewConvFallback = !currentConvId && result.conversation_id
              if (isNewConvFallback) {
                setCurrentConvId(result.conversation_id)
                onConversationCreated?.(result.conversation_id)
              }

              const assistantMsg: ChatMessage = {
                id: nextId("resp"),
                conversation_id: result.conversation_id,
                role: "assistant",
                content: result.response,
                agent_name: result.agent_name,
                model_id: result.model_id,
                latency_ms: result.latency_ms,
                created_at: new Date().toISOString(),
              }
              setMessages((prev) => [
                ...prev.map((m) => isNewConvFallback ? { ...m, conversation_id: result.conversation_id } : m),
                assistantMsg,
              ])
            } catch (fallbackError) {
              setLastFailedMessage(text)
              const errMsg: ChatMessage = {
                id: nextId("err"),
                conversation_id: currentConvId || "",
                role: "assistant",
                content:
                  fallbackError instanceof Error
                    ? fallbackError.message
                    : "Something went wrong. Please try again.",
                created_at: new Date().toISOString(),
                isError: true,
              }
              setMessages((prev) => [...prev, errMsg])
            } finally {
              setSending(false)
              inputRef.current?.focus()
            }
          }
        )
      } catch {
        // If streamMessage itself throws (e.g., network error before SSE), fall back
        setMessages((prev) => prev.filter((m) => m.id !== streamMsgId))

        try {
          const result = await sendMessage(orgSlug, text, currentConvId, chatCtx)

          const isNewConvCatch = !currentConvId && result.conversation_id
          if (isNewConvCatch) {
            setCurrentConvId(result.conversation_id)
            onConversationCreated?.(result.conversation_id)
          }

          const assistantMsg: ChatMessage = {
            id: nextId("resp"),
            conversation_id: result.conversation_id,
            role: "assistant",
            content: result.response,
            agent_name: result.agent_name,
            model_id: result.model_id,
            latency_ms: result.latency_ms,
            created_at: new Date().toISOString(),
          }
          setMessages((prev) => [
            ...prev.map((m) => isNewConvCatch ? { ...m, conversation_id: result.conversation_id } : m),
            assistantMsg,
          ])
        } catch (error) {
          setLastFailedMessage(text)
          const errorMsg: ChatMessage = {
            id: nextId("err"),
            conversation_id: currentConvId || "",
            role: "assistant",
            content:
              error instanceof Error
                ? error.message
                : "Something went wrong. Please try again.",
            created_at: new Date().toISOString(),
            isError: true,
          }
          setMessages((prev) => [...prev, errorMsg])
        } finally {
          setSending(false)
          inputRef.current?.focus()
        }
      }
    },
    [input, sending, currentConvId, orgSlug, chatCtx, onConversationCreated, nextId, DRAFT_KEY]
  )

  const handleRetry = useCallback(() => {
    if (lastFailedMessage) {
      // Remove trailing error + user message pair in a single update
      setMessages((prev) => {
        let msgs = prev
        if (msgs.length > 0 && msgs[msgs.length - 1].isError) {
          msgs = msgs.slice(0, -1)
        }
        if (msgs.length > 0 && msgs[msgs.length - 1].role === "user") {
          msgs = msgs.slice(0, -1)
        }
        return msgs
      })
      handleSend(lastFailedMessage)
    }
  }, [lastFailedMessage, handleSend])

  const handleCopy = useCallback((id: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    }).catch(() => { /* clipboard unavailable (e.g. non-HTTPS) */ })
  }, [])

  const handleDeleteMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const charCount = input.length
  const isOverLimit = charCount > MAX_MESSAGE_LENGTH

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* History loading skeleton */}
          {loadingHistory && (
            <div className="space-y-4 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className={`flex gap-3 ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
                  {i % 2 !== 0 && <div className="h-8 w-8 rounded-lg bg-gray-200 dark:bg-[var(--text-secondary)]" />}
                  <div className={`h-16 rounded-xl ${i % 2 === 0 ? "w-48" : "w-64"} bg-gray-100 dark:bg-[var(--text-primary)]`} />
                  {i % 2 === 0 && <div className="h-8 w-8 rounded-lg bg-gray-200 dark:bg-[var(--text-secondary)]" />}
                </div>
              ))}
            </div>
          )}

          {/* History load error */}
          {historyError && !loadingHistory && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-red-200 dark:border-red-800/30 bg-red-50 dark:bg-red-900/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              Failed to load message history.
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessageBubble
              key={msg.id}
              msg={msg}
              onRetry={msg.isError ? handleRetry : undefined}
              onCopy={handleCopy}
              onDelete={handleDeleteMessage}
              copiedId={copiedId}
            />
          ))}

          {/* Typing indicator — only show when sending without streaming */}
          {sending && !messages.some((m) => m.isStreaming) && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-[var(--text-primary)] border border-gray-200 dark:border-[var(--text-secondary)]">
                <Bot className="h-4 w-4 text-[var(--cloudact-mint-dark)]" />
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-200 dark:bg-[var(--text-primary)]/50 dark:border-[var(--text-secondary)]/50 px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400 dark:text-[var(--text-muted)]" />
                <span className="text-sm text-gray-400 dark:text-[var(--text-tertiary)]">Thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-[var(--text-primary)] bg-white dark:bg-[var(--text-primary)] px-4 py-4">
        <div className="mx-auto max-w-3xl">
          <div className={`flex items-end gap-3 rounded-xl border bg-gray-50 dark:bg-[var(--text-primary)]/50 px-4 py-3 transition-colors ${
            isOverLimit
              ? "border-red-300 dark:border-red-800"
              : "border-gray-300 dark:border-[var(--text-secondary)] focus-within:border-[var(--cloudact-mint)]/40"
          }`}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your cloud costs..."
              rows={1}
              maxLength={MAX_MESSAGE_LENGTH + 100} // Allow typing slightly over for UX
              className={`flex-1 resize-none bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[var(--text-tertiary)] outline-none transition-opacity ${
                sending ? "opacity-50 cursor-not-allowed" : ""
              }`}
              disabled={sending}
              aria-label="Chat message input"
            />
            <button
              onClick={() => handleSend()}
              disabled={sending || !input.trim() || isOverLimit}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--cloudact-mint-dark)] text-white transition-colors hover:bg-[var(--cloudact-mint-text)] disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-gray-400 dark:text-[var(--text-secondary)]">
              AI responses may not always be accurate. Verify important data.
            </p>
            {charCount > MAX_MESSAGE_LENGTH * 0.8 && (
              <p className={`text-xs ${isOverLimit ? "text-red-500" : "text-gray-400 dark:text-[var(--text-secondary)]"}`}>
                {charCount.toLocaleString()}/{MAX_MESSAGE_LENGTH.toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
