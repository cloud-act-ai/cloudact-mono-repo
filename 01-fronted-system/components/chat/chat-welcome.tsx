"use client"

/**
 * Welcome screen shown when no conversation is active.
 * Includes suggestion buttons AND a text input for custom messages.
 */

import { useState, useRef, useCallback } from "react"
import { Sparkles, TrendingUp, Bell, BarChart3, Send, MessageSquare } from "lucide-react"

const SUGGESTIONS = [
  { icon: TrendingUp, text: "What are my total cloud costs this month?", category: "Costs" },
  { icon: BarChart3, text: "Compare AWS costs month over month", category: "Trends" },
  { icon: Bell, text: "Create an alert when GCP exceeds $5,000", category: "Alerts" },
  { icon: MessageSquare, text: "Show my OpenAI token usage this week", category: "Usage" },
]

interface ChatWelcomeProps {
  onSendMessage: (message: string) => void
}

export function ChatWelcome({ onSendMessage }: ChatWelcomeProps) {
  const [input, setInput] = useState("")
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text) return
    setInput("")
    onSendMessage(text)
  }, [input, onSendMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  return (
    <div className="flex flex-1 flex-col">
      {/* Centered content */}
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-lg text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--cloudact-mint)]/10 border border-[var(--cloudact-mint)]/30">
            <Sparkles className="h-8 w-8 text-[var(--cloudact-mint-dark)]" />
          </div>
          <h2 className="mb-2 text-2xl font-semibold text-gray-900 dark:text-white">CloudAct AI</h2>
          <p className="mb-8 text-sm text-gray-500 dark:text-slate-400">
            Ask about your cloud costs, usage, alerts, and more.
            Powered by your configured LLM provider.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion.text}
                onClick={() => onSendMessage(suggestion.text)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSendMessage(suggestion.text) } }}
                className="group flex items-start gap-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 p-4 text-left transition-colors hover:border-[var(--cloudact-mint)]/30 hover:bg-gray-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--cloudact-mint)]/40"
                aria-label={`Ask: ${suggestion.text}`}
              >
                <suggestion.icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400 dark:text-slate-500 transition-colors group-hover:text-[var(--cloudact-mint-dark)]" />
                <div>
                  <p className="text-xs font-medium text-gray-400 dark:text-slate-500 mb-1">{suggestion.category}</p>
                  <p className="text-sm text-gray-700 dark:text-slate-300">{suggestion.text}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Input field at bottom */}
      <div className="border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-3 rounded-xl border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 px-4 py-3 transition-colors focus-within:border-[var(--cloudact-mint)]/40">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your cloud costs..."
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 outline-none"
              aria-label="Chat message input"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--cloudact-mint-dark)] text-white transition-colors hover:bg-[var(--cloudact-mint-text)] disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-400 dark:text-slate-600">
            AI responses may not always be accurate. Verify important data.
          </p>
        </div>
      </div>
    </div>
  )
}
