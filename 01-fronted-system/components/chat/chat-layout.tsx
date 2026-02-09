"use client"

/**
 * Main chat layout with conversation sidebar and chat area.
 */

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { ConversationList } from "./conversation-list"
import { ChatCopilot } from "./chat-copilot"
import { ChatWelcome } from "./chat-welcome"
import { listConversations, getChatStatus } from "@/lib/chat/client"
import type { Conversation } from "@/lib/chat/constants"
import { Loader2, Settings } from "lucide-react"
import Link from "next/link"

export function ChatLayout() {
  const params = useParams<{ orgSlug: string; conversationId?: string }>()
  const router = useRouter()
  const orgSlug = params.orgSlug

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(
    params.conversationId
  )
  const [initialMessage, setInitialMessage] = useState<string | undefined>()

  // Check if chat is configured
  useEffect(() => {
    async function checkConfig() {
      const status = await getChatStatus(orgSlug)
      setConfigured(status.configured)
      if (status.configured) {
        loadConversations()
      } else {
        setLoading(false)
      }
    }
    checkConfig()
  }, [orgSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadConversations = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listConversations(orgSlug)
      setConversations(data.conversations || [])
    } catch {
      // Silently handle - empty state is fine
    } finally {
      setLoading(false)
    }
  }, [orgSlug])

  const handleNewConversation = useCallback(() => {
    setActiveConversationId(undefined)
    setInitialMessage(undefined)
    router.push(`/${orgSlug}/chat`)
  }, [orgSlug, router])

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveConversationId(id)
      setInitialMessage(undefined)
      router.push(`/${orgSlug}/chat/${id}`)
    },
    [orgSlug, router]
  )

  const handleConversationCreated = useCallback(
    (id: string) => {
      setActiveConversationId(id)
      loadConversations()
      router.push(`/${orgSlug}/chat/${id}`)
    },
    [orgSlug, router, loadConversations]
  )

  const handleSuggestionMessage = useCallback((message: string) => {
    setInitialMessage(message)
  }, [])

  // Loading state
  if (configured === null) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    )
  }

  // Not configured — show setup prompt
  if (!configured) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 border border-slate-700">
            <Settings className="h-8 w-8 text-slate-500" />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-white">Set Up AI Chat</h2>
          <p className="mb-6 text-sm text-slate-400">
            Configure your LLM provider and API key to start using CloudAct AI.
            Choose from OpenAI, Anthropic, Gemini, or DeepSeek.
          </p>
          <Link
            href={`/${orgSlug}/settings/ai-chat`}
            className="inline-flex items-center gap-2 rounded-lg bg-[#90FCA6] px-6 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-[#7dec94]"
          >
            <Settings className="h-4 w-4" />
            Configure AI Chat
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full bg-slate-950">
      {/* Sidebar */}
      <div className="hidden w-64 md:block">
        <ConversationList
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          loading={loading}
        />
      </div>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        {activeConversationId || initialMessage ? (
          <ChatCopilot
            orgSlug={orgSlug}
            conversationId={activeConversationId}
            onConversationCreated={handleConversationCreated}
            initialMessage={initialMessage}
          />
        ) : (
          <ChatWelcome onSendMessage={handleSuggestionMessage} />
        )}
      </div>
    </div>
  )
}
