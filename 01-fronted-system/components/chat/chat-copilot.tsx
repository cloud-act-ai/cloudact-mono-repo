"use client"

/**
 * Main chat message area with input.
 * Handles message sending, streaming display, and conversation state.
 */

import { useState, useRef, useEffect, useCallback } from "react"
import { Send, Loader2, Bot, User } from "lucide-react"
import { sendMessage } from "@/lib/chat/client"
import type { ChatClientContext } from "@/lib/chat/client"
import type { ChatMessage } from "@/lib/chat/constants"

interface ChatCopilotProps {
  orgSlug: string
  conversationId?: string
  chatCtx?: ChatClientContext
  onConversationCreated?: (id: string) => void
  initialMessage?: string
}

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
  const [currentConvId, setCurrentConvId] = useState(conversationId)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Handle initial message (from suggestion clicks)
  useEffect(() => {
    if (initialMessage) {
      handleSend(initialMessage)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(
    async (messageText?: string) => {
      const text = messageText || input.trim()
      if (!text || sending) return

      setInput("")
      setSending(true)

      // Add user message immediately
      const userMsg: ChatMessage = {
        id: `temp_${Date.now()}`,
        conversation_id: currentConvId || "",
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMsg])

      try {
        const result = await sendMessage(orgSlug, text, currentConvId, chatCtx)

        // Update conversation ID if new
        if (!currentConvId && result.conversation_id) {
          setCurrentConvId(result.conversation_id)
          onConversationCreated?.(result.conversation_id)
        }

        // Add assistant response
        const assistantMsg: ChatMessage = {
          id: `resp_${Date.now()}`,
          conversation_id: result.conversation_id,
          role: "assistant",
          content: result.response,
          agent_name: result.agent_name,
          model_id: result.model_id,
          latency_ms: result.latency_ms,
          created_at: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, assistantMsg])
      } catch (error) {
        const errorMsg: ChatMessage = {
          id: `err_${Date.now()}`,
          conversation_id: currentConvId || "",
          role: "assistant",
          content: error instanceof Error ? error.message : "Something went wrong. Please try again.",
          created_at: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, errorMsg])
      } finally {
        setSending(false)
        inputRef.current?.focus()
      }
    },
    [input, sending, currentConvId, orgSlug, chatCtx, onConversationCreated]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-800 border border-slate-700">
                  <Bot className="h-4 w-4 text-[#90FCA6]" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-slate-700 text-white"
                    : "bg-slate-800/50 border border-slate-700/50 text-slate-200"
                }`}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                {msg.role === "assistant" && msg.agent_name && (
                  <p className="mt-2 text-xs text-slate-500">
                    {msg.agent_name}
                    {msg.latency_ms ? ` · ${msg.latency_ms}ms` : ""}
                  </p>
                )}
              </div>
              {msg.role === "user" && (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-700">
                  <User className="h-4 w-4 text-slate-300" />
                </div>
              )}
            </div>
          ))}

          {sending && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-800 border border-slate-700">
                <Bot className="h-4 w-4 text-[#90FCA6]" />
              </div>
              <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-slate-800 bg-slate-950 px-4 py-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-3 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 focus-within:border-[#90FCA6]/40">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your cloud costs..."
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-white placeholder-slate-500 outline-none"
              disabled={sending}
            />
            <button
              onClick={() => handleSend()}
              disabled={sending || !input.trim()}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#90FCA6] text-slate-900 transition-colors hover:bg-[#7dec94] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-slate-600">
            AI responses may not always be accurate. Verify important data.
          </p>
        </div>
      </div>
    </div>
  )
}
