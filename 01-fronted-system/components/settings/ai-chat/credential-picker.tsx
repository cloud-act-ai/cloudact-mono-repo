"use client"

import { cn } from "@/lib/utils"
import type { ProviderInfo } from "@/lib/chat/constants"
import Link from "next/link"
import { Key, ExternalLink } from "lucide-react"

interface CredentialPickerProps {
  orgSlug: string
  provider: string
  value: string
  onChange: (credentialId: string) => void
  providers?: ProviderInfo[]
}

export function CredentialPicker({
  orgSlug,
  provider,
  value,
  onChange,
  providers,
}: CredentialPickerProps) {
  const providerInfo = providers?.find((p) => p.provider === provider)
  const hasCredential = providerInfo?.has_credential
  const credentialId = providerInfo?.credential_id

  if (!hasCredential) {
    return (
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-600 dark:text-slate-300">API Key</label>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <Key className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500 dark:text-amber-400" />
            <div>
              <p className="text-sm text-amber-700 dark:text-amber-200">No API key configured for {provider}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                Set up your {provider} integration first to use this provider.
              </p>
              <Link
                href={`/${orgSlug}/integrations/genai/${provider.toLowerCase()}`}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#90FCA6] hover:underline"
              >
                Configure Integration
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-600 dark:text-slate-300">API Key</label>
      <button
        onClick={() => credentialId && onChange(credentialId)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all",
          value === credentialId
            ? "border-[#90FCA6]/40 bg-[#90FCA6]/5"
            : "border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 hover:border-gray-300 dark:hover:border-slate-600"
        )}
      >
        <Key className="h-4 w-4 text-[#90FCA6]" />
        <div>
          <p className="text-sm text-gray-900 dark:text-white">
            {provider} API Key
          </p>
          <p className="text-xs text-gray-500 dark:text-slate-500">
            Encrypted with GCP KMS · {credentialId?.slice(0, 12)}...
          </p>
        </div>
      </button>
    </div>
  )
}
