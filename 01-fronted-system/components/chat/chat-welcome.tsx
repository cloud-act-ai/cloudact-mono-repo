"use client"

/**
 * Welcome screen shown when no conversation is active.
 */

import { MessageSquare, TrendingUp, Bell, BarChart3 } from "lucide-react"

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
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 border border-slate-700">
          <MessageSquare className="h-8 w-8 text-[#90FCA6]" />
        </div>
        <h2 className="mb-2 text-2xl font-semibold text-white">CloudAct AI</h2>
        <p className="mb-8 text-sm text-slate-400">
          Ask about your cloud costs, usage, alerts, and more.
          Powered by your configured LLM provider.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.text}
              onClick={() => onSendMessage(suggestion.text)}
              className="group flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-800/50 p-4 text-left transition-colors hover:border-[#90FCA6]/30 hover:bg-slate-800"
            >
              <suggestion.icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500 transition-colors group-hover:text-[#90FCA6]" />
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">{suggestion.category}</p>
                <p className="text-sm text-slate-300">{suggestion.text}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
