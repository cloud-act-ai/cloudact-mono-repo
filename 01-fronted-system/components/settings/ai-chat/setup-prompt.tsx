"use client"

import { MessageSquare, Key, Cpu, Settings } from "lucide-react"

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
    icon: Settings,
    title: "3. Configure settings",
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
    <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-6">
      <h3 className="mb-4 text-lg font-medium text-white">Getting Started</h3>
      <div className="space-y-4">
        {STEPS.map((step) => (
          <div key={step.title} className="flex gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-800 border border-slate-700">
              <step.icon className="h-5 w-5 text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">{step.title}</p>
              <p className="text-xs text-slate-400">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
