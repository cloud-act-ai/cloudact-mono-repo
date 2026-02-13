"use client"

import { cn } from "@/lib/utils"
import { LLM_PROVIDERS } from "@/lib/chat/constants"

interface ModelSelectorProps {
  provider: string
  value: string
  onChange: (modelId: string, modelName: string) => void
}

export function ModelSelector({ provider, value, onChange }: ModelSelectorProps) {
  const providerConfig = LLM_PROVIDERS.find((p) => p.id === provider)
  const models = providerConfig?.models || []

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-600 dark:text-[var(--text-muted)]">Model</label>
      <div className="space-y-2">
        {models.map((model) => (
          <button
            key={model.id}
            onClick={() => onChange(model.id, model.name)}
            className={cn(
              "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-all",
              value === model.id
                ? "border-[#90FCA6]/40 bg-[#90FCA6]/5"
                : "border-gray-200 dark:border-[var(--text-secondary)] bg-gray-50 dark:bg-[var(--text-primary)]/50 hover:border-gray-300 dark:hover:border-[var(--text-secondary)]"
            )}
          >
            <span className="text-sm text-gray-900 dark:text-white">{model.name}</span>
            <span className="text-xs text-gray-500 dark:text-[var(--text-tertiary)] font-mono">{model.id}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
