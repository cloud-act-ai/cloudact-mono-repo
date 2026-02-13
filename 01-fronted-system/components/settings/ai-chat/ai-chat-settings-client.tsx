"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { ProviderSelector } from "@/components/settings/ai-chat/provider-selector"
import { ModelSelector } from "@/components/settings/ai-chat/model-selector"
import { CredentialPicker } from "@/components/settings/ai-chat/credential-picker"
import { AdvancedSettings } from "@/components/settings/ai-chat/advanced-settings"
import { SetupPrompt } from "@/components/settings/ai-chat/setup-prompt"
import { getChatSettings, saveChatSettings, getProviders } from "@/actions/chat-settings"
import type { ChatSettings, ProviderInfo } from "@/lib/chat/constants"
import { Save, Loader2, CheckCircle2, AlertTriangle } from "lucide-react"

interface AIChatSettingsClientProps {
  apiKey: string
  userId?: string
}

export function AIChatSettingsClient({ apiKey, userId }: AIChatSettingsClientProps) {
  const params = useParams<{ orgSlug: string }>()
  const orgSlug = params.orgSlug

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existing, setExisting] = useState<ChatSettings | undefined>()
  const [providers, setProviders] = useState<ProviderInfo[]>([])

  // Form state
  const [provider, setProvider] = useState("OPENAI")
  const [modelId, setModelId] = useState("gpt-4o")
  const [modelName, setModelName] = useState("GPT-4o")
  const [credentialId, setCredentialId] = useState("")
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(4096)
  const [maxHistoryMessages, setMaxHistoryMessages] = useState(50)
  const [includeOrgContext, setIncludeOrgContext] = useState(true)
  const [enableMemory, setEnableMemory] = useState(true)
  const [systemPromptExtra, setSystemPromptExtra] = useState("")

  // Load existing settings
  useEffect(() => {
    async function load() {
      setLoading(true)

      const [settingsResult, providersResult] = await Promise.all([
        getChatSettings(orgSlug, apiKey),
        getProviders(orgSlug, apiKey),
      ])

      if (settingsResult.success && settingsResult.data) {
        const s = settingsResult.data
        setExisting(s)
        setProvider(s.provider)
        setModelId(s.model_id)
        setModelName(s.model_name || s.model_id)
        setCredentialId(s.credential_id)
        setTemperature(s.temperature)
        setMaxTokens(s.max_tokens)
        setMaxHistoryMessages(s.max_history_messages)
        setIncludeOrgContext(s.include_org_context)
        setEnableMemory(s.enable_memory)
        setSystemPromptExtra(s.system_prompt_extra || "")
      } else if (!settingsResult.success) {
        setError(settingsResult.error || "Failed to load settings")
      }

      if (providersResult.success && providersResult.providers) {
        setProviders(providersResult.providers)
      }

      setLoading(false)
    }
    load()
  }, [orgSlug, apiKey])

  const handleAdvancedChange = useCallback((field: string, value: number | boolean | string) => {
    switch (field) {
      case "temperature":
        setTemperature(value as number)
        break
      case "maxTokens":
        setMaxTokens(value as number)
        break
      case "maxHistoryMessages":
        setMaxHistoryMessages(value as number)
        break
      case "includeOrgContext":
        setIncludeOrgContext(value as boolean)
        break
      case "enableMemory":
        setEnableMemory(value as boolean)
        break
      case "systemPromptExtra":
        setSystemPromptExtra(value as string)
        break
    }
  }, [])

  const handleSave = async () => {
    if (!credentialId) {
      setError("Please select an API key credential")
      return
    }

    setSaving(true)
    setError(null)
    setSaved(false)

    const result = await saveChatSettings(
      orgSlug,
      {
        provider,
        credential_id: credentialId,
        model_id: modelId,
        model_name: modelName,
        temperature,
        max_tokens: maxTokens,
        max_history_messages: maxHistoryMessages,
        include_org_context: includeOrgContext,
        enable_memory: enableMemory,
        system_prompt_extra: systemPromptExtra || undefined,
      },
      apiKey
    )

    setSaving(false)

    if (result.success) {
      setSaved(true)
      setExisting(result.data)
      setTimeout(() => setSaved(false), 3000)
    } else {
      setError(result.error || "Failed to save settings")
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    )
  }

  const credentialStatus: Record<string, boolean> = {}
  providers.forEach((p) => {
    credentialStatus[p.provider] = p.has_credential
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="console-page-title">AI Chat Settings</h1>
        <p className="mt-1 console-body">
          Configure your LLM provider and model for CloudAct AI assistant.
        </p>
      </div>

      {!existing && <SetupPrompt />}

      <div className="space-y-8">
        {/* Provider Selection */}
        <ProviderSelector
          value={provider}
          onChange={(p) => {
            setProvider(p)
            setCredentialId("")
            // Set default model for the new provider
            const providerInfo = providers.find((pi) => pi.provider === p)
            if (providerInfo?.models?.[0]) {
              setModelId(providerInfo.models[0].id)
              setModelName(providerInfo.models[0].name)
            }
          }}
          credentialStatus={credentialStatus}
        />

        {/* Credential Selection */}
        <CredentialPicker
          orgSlug={orgSlug}
          provider={provider}
          value={credentialId}
          onChange={setCredentialId}
          providers={providers}
        />

        {/* Model Selection */}
        <ModelSelector
          provider={provider}
          value={modelId}
          onChange={(id, name) => {
            setModelId(id)
            setModelName(name)
          }}
        />

        {/* Advanced Settings */}
        <AdvancedSettings
          temperature={temperature}
          maxTokens={maxTokens}
          maxHistoryMessages={maxHistoryMessages}
          includeOrgContext={includeOrgContext}
          enableMemory={enableMemory}
          systemPromptExtra={systemPromptExtra}
          onChange={handleAdvancedChange}
        />

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Save Button */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving || !credentialId}
            className="inline-flex items-center gap-2 rounded-lg bg-[#90FCA6] px-6 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-[#7dec94] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {existing ? "Update Settings" : "Save Settings"}
          </button>

          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-[var(--cloudact-mint-text)]">
              <CheckCircle2 className="h-4 w-4" />
              Settings saved
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
