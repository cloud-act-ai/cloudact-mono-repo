"use client"

/**
 * Main chat layout with full-width chat and right-side history drawer.
 * Max 10 conversations enforced — oldest auto-hidden when limit reached.
 *
 * IMPORTANT: URL updates use replaceState with ?c= search params
 * (NOT path segment changes) to avoid Next.js route re-matching
 * which causes full server-side re-renders that kill streaming.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { ConversationList } from "./conversation-list"
import { ChatCopilot } from "./chat-copilot"
import { ChatWelcome } from "./chat-welcome"
import { listConversations, getChatStatus, deleteConversation, renameConversation, getMessages } from "@/lib/chat/client"
import type { ChatClientContext } from "@/lib/chat/client"
import type { Conversation } from "@/lib/chat/constants"
import { MAX_CONVERSATIONS } from "@/lib/chat/constants"
import { Loader2, Settings, Plus, History } from "lucide-react"
import Link from "next/link"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

interface ChatLayoutProps {
  apiKey?: string
  userId?: string
}

/**
 * Update browser URL without triggering Next.js server navigation.
 * Uses replaceState with search params (NOT path segments) to avoid
 * Next.js route-segment re-matching which causes full re-renders.
 */
function updateUrl(orgSlug: string, conversationId?: string) {
  if (typeof window === "undefined") return
  const base = `/${orgSlug}/chat`
  const url = conversationId ? `${base}?c=${conversationId}` : base
  window.history.replaceState(null, "", url)
}

export function ChatLayout({ apiKey, userId }: ChatLayoutProps) {
  const params = useParams<{ orgSlug: string; conversationId?: string }>()
  const searchParams = useSearchParams()
  const orgSlug = params.orgSlug

  const chatCtx = useMemo<ChatClientContext | undefined>(
    () => apiKey ? { apiKey, orgSlug, userId } : undefined,
    [apiKey, orgSlug, userId]
  )

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState<boolean | null>(null)
  // Support both path param (/chat/{id}) and query param (/chat?c={id})
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(
    params.conversationId || searchParams.get("c") || undefined
  )
  const [initialMessage, setInitialMessage] = useState<string | undefined>()
  const [toast, setToast] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  // In-memory cache for conversations list (serve stale while fetching fresh)
  const conversationsCache = useRef<Map<string, Conversation[]>>(new Map())

  // Check if chat is configured
  useEffect(() => {
    async function checkConfig() {
      const status = await getChatStatus(orgSlug, chatCtx)
      setConfigured(status.configured)
      if (status.configured) {
        loadConversations()
      } else {
        setLoading(false)
      }
    }
    checkConfig()
  }, [orgSlug, chatCtx]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadConversations = useCallback(async () => {
    // Serve stale data from cache immediately while fetching fresh data
    const cached = conversationsCache.current.get(orgSlug)
    if (cached) {
      setConversations(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }

    try {
      const data = await listConversations(orgSlug, chatCtx)
      // Enforce max conversations limit (show most recent)
      const convs = (data.conversations || []).slice(0, MAX_CONVERSATIONS)
      setConversations(convs)
      conversationsCache.current.set(orgSlug, convs)
    } catch {
      // Silently handle - empty state or cached data is fine
    } finally {
      setLoading(false)
    }
  }, [orgSlug, chatCtx])

  const handleNewConversation = useCallback(async () => {
    // Auto-delete oldest conversation if at limit
    if (conversations.length >= MAX_CONVERSATIONS) {
      const oldest = conversations[conversations.length - 1]
      if (oldest) {
        try {
          await deleteConversation(orgSlug, oldest.conversation_id, chatCtx)
          setConversations((prev) => prev.filter((c) => c.conversation_id !== oldest.conversation_id))
          setToast("Oldest conversation removed to make room")
          setTimeout(() => setToast(null), 3000)
        } catch {
          // Continue anyway — conversation will be cleaned up eventually
        }
      }
    }
    setActiveConversationId(undefined)
    setInitialMessage(undefined)
    updateUrl(orgSlug)
  }, [orgSlug, conversations, chatCtx])

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveConversationId(id)
      setInitialMessage(undefined)
      setHistoryOpen(false)
      updateUrl(orgSlug, id)
    },
    [orgSlug]
  )

  const handleConversationCreated = useCallback(
    (id: string) => {
      setActiveConversationId(id)
      loadConversations()
      updateUrl(orgSlug, id)
      // Broadcast to other tabs
      try {
        if (typeof BroadcastChannel !== "undefined") {
          const ch = new BroadcastChannel(`cloudact_chat_${orgSlug}`)
          ch.postMessage({ type: "conversation_created", id })
          ch.close()
        }
      } catch {
        // BroadcastChannel not available
      }
    },
    [orgSlug, loadConversations]
  )

  const handleSuggestionMessage = useCallback((message: string) => {
    setInitialMessage(message)
  }, [])

  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      try {
        await renameConversation(orgSlug, id, title, chatCtx)
        setConversations((prev) =>
          prev.map((c) => (c.conversation_id === id ? { ...c, title } : c))
        )
        // Update cache
        conversationsCache.current.set(
          orgSlug,
          (conversationsCache.current.get(orgSlug) || []).map((c) =>
            c.conversation_id === id ? { ...c, title } : c
          )
        )
      } catch {
        // Silent fail -- title stays unchanged
      }
    },
    [orgSlug, chatCtx]
  )

  const handleExportConversation = useCallback(
    async (id: string) => {
      try {
        const data = await getMessages(orgSlug, id, chatCtx)
        const conv = conversations.find((c) => c.conversation_id === id)
        const title = conv?.title || `Chat ${id.slice(0, 8)}`

        // Build markdown
        const lines = [`# ${title}\n`]
        for (const m of data.messages || []) {
          const role = m.role === "user" ? "You" : "Assistant"
          lines.push(`## ${role}\n`)
          lines.push(`${m.content}\n`)
        }

        const blob = new Blob([lines.join("\n")], { type: "text/markdown" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}.md`
        a.click()
        URL.revokeObjectURL(url)
      } catch {
        setToast("Failed to export conversation")
        setTimeout(() => setToast(null), 3000)
      }
    },
    [orgSlug, chatCtx, conversations]
  )

  // Multi-tab sync via BroadcastChannel
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return
    const channel = new BroadcastChannel(`cloudact_chat_${orgSlug}`)

    channel.onmessage = (event) => {
      if (
        event.data.type === "conversation_created" ||
        event.data.type === "conversation_deleted"
      ) {
        loadConversations()
      }
    }

    return () => channel.close()
  }, [orgSlug, loadConversations])

  // Active conversation title for header
  const activeTitle = useMemo(() => {
    if (!activeConversationId) return null
    const conv = conversations.find((c) => c.conversation_id === activeConversationId)
    return conv?.title || `Chat ${activeConversationId.slice(0, 8)}`
  }, [activeConversationId, conversations])

  // Loading state
  if (configured === null) {
    return (
      <div className="flex h-full items-center justify-center bg-white dark:bg-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-[var(--text-tertiary)]" />
      </div>
    )
  }

  // Not configured — show setup prompt
  if (!configured) {
    return (
      <div className="flex h-full items-center justify-center bg-white dark:bg-gray-950 px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-950 border border-gray-200 dark:border-[var(--text-secondary)]">
            <Settings className="h-8 w-8 text-gray-400 dark:text-[var(--text-tertiary)]" />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">Set Up AI Chat</h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-[var(--text-muted)]">
            Configure your LLM provider and API key to start using CloudAct AI.
            Choose from OpenAI, Anthropic, Gemini, or DeepSeek.
          </p>
          <Link
            href={`/${orgSlug}/settings/ai-chat`}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--cloudact-mint-dark)] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--cloudact-mint-text)]"
          >
            <Settings className="h-4 w-4" />
            Configure AI Chat
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-col bg-white dark:bg-gray-950">
      {/* Toast notification */}
      {toast && (
        <div className="absolute top-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-gray-800 dark:bg-[var(--text-secondary)] px-4 py-2 text-sm text-white shadow-lg animate-in fade-in slide-in-from-top-2">
          {toast}
        </div>
      )}

      {/* Header bar */}
      <div className="flex h-12 items-center justify-between border-b border-gray-200 dark:border-[var(--text-primary)] px-4">
        <button
          onClick={handleNewConversation}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-[var(--text-muted)] transition-colors hover:bg-gray-100 dark:hover:bg-[var(--text-primary)] hover:text-gray-900 dark:hover:text-white"
          title="Start new conversation"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Chat</span>
        </button>

        {activeTitle && (
          <p className="absolute left-1/2 -translate-x-1/2 text-sm font-medium text-gray-700 dark:text-[var(--text-muted)] truncate max-w-[40%]">
            {activeTitle}
          </p>
        )}

        <button
          onClick={() => setHistoryOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-[var(--text-muted)] transition-colors hover:bg-gray-100 dark:hover:bg-[var(--text-primary)] hover:text-gray-900 dark:hover:text-white"
          title="View conversation history"
        >
          <History className="h-4 w-4" />
          <span className="hidden sm:inline">History</span>
        </button>
      </div>

      {/* Main chat area (full width) */}
      <div className="flex flex-1 flex-col min-h-0">
        {activeConversationId || initialMessage ? (
          <ChatCopilot
            orgSlug={orgSlug}
            conversationId={activeConversationId}
            chatCtx={chatCtx}
            onConversationCreated={handleConversationCreated}
            initialMessage={initialMessage}
          />
        ) : (
          <ChatWelcome onSendMessage={handleSuggestionMessage} />
        )}
      </div>

      {/* History drawer (right side) */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" size="sm">
          <SheetHeader>
            <SheetTitle>History</SheetTitle>
          </SheetHeader>
          <ConversationList
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={handleSelectConversation}
            onNew={() => { handleNewConversation(); setHistoryOpen(false) }}
            onRename={handleRenameConversation}
            onExport={handleExportConversation}
            loading={loading}
          />
        </SheetContent>
      </Sheet>
    </div>
  )
}
