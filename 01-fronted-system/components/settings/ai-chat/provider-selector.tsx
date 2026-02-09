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
      <label className="mb-2 block text-sm font-medium text-slate-300">LLM Provider</label>
      <div className="grid grid-cols-2 gap-3">
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
                  : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">{provider.name}</span>
                {hasCred !== undefined && (
                  <span
                    className={cn(
                      "text-xs",
                      hasCred ? "text-[#90FCA6]" : "text-slate-500"
                    )}
                  >
                    {hasCred ? "Key configured" : "No key"}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {provider.models.length} models available
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
