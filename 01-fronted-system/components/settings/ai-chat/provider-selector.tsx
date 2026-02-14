"use client"

import { cn } from "@/lib/utils"
import { LLM_PROVIDERS } from "@/lib/chat/constants"

interface ProviderSelectorProps {
  value: string
  onChange: (provider: string) => void
  credentialStatus?: Record<string, boolean>
}

export function ProviderSelector({ value, onChange, credentialStatus }: ProviderSelectorProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-600 dark:text-[var(--text-muted)]">LLM Provider</label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {LLM_PROVIDERS.map((provider) => {
          const hasCred = credentialStatus?.[provider.id]
          return (
            <button
              key={provider.id}
              onClick={() => onChange(provider.id)}
              className={cn(
                "rounded-xl border p-4 text-left transition-all",
                value === provider.id
                  ? "border-[#90FCA6]/40 bg-[#90FCA6]/5"
                  : "border-gray-200 dark:border-[var(--text-secondary)] bg-gray-50 dark:bg-[var(--text-primary)]/50 hover:border-gray-300 dark:hover:border-[var(--text-secondary)]"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{provider.name}</span>
                {hasCred !== undefined && (
                  <span
                    className={cn(
                      "text-xs",
                      hasCred ? "text-[#16a34a] dark:text-[#90FCA6]" : "text-gray-400 dark:text-[var(--text-tertiary)]"
                    )}
                  >
                    {hasCred ? "Key configured" : "No key"}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-[var(--text-tertiary)]">
                {provider.models.length} models available
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
