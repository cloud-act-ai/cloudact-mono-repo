"use client"

import { MessageSquare, Key, Cpu, SlidersHorizontal } from "lucide-react"

const STEPS = [
  {
    icon: Key,
    title: "1. Set up your API key",
    description: "Configure an integration with your LLM provider (OpenAI, Anthropic, Gemini, or DeepSeek).",
  },
  {
    icon: Cpu,
    title: "2. Choose provider & model",
    description: "Select which provider and model to use for your AI assistant.",
  },
  {
    icon: SlidersHorizontal,
    title: "3. Fine-tune parameters",
    description: "Adjust temperature, token limits, and other advanced options.",
  },
  {
    icon: MessageSquare,
    title: "4. Start chatting",
    description: "Open the chat and start asking about your cloud costs, usage, and alerts.",
  },
]

export function SetupPrompt() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-[var(--text-secondary)] bg-gray-50 dark:bg-[var(--text-primary)]/30 p-6">
      <h3 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">Getting Started</h3>
      <div className="space-y-4">
        {STEPS.map((step) => (
          <div key={step.title} className="flex gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white dark:bg-[var(--text-primary)] border border-gray-200 dark:border-[var(--text-secondary)]">
              <step.icon className="h-5 w-5 text-gray-400 dark:text-[var(--text-muted)]" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{step.title}</p>
              <p className="text-xs text-gray-500 dark:text-[var(--text-muted)]">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
