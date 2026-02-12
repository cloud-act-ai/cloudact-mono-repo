"use client"

interface AdvancedSettingsProps {
  temperature: number
  maxTokens: number
  maxHistoryMessages: number
  includeOrgContext: boolean
  enableMemory: boolean
  systemPromptExtra: string
  onChange: (field: string, value: number | boolean | string) => void
}

export function AdvancedSettings({
  temperature,
  maxTokens,
  maxHistoryMessages,
  includeOrgContext,
  enableMemory,
  systemPromptExtra,
  onChange,
}: AdvancedSettingsProps) {
  return (
    <div className="space-y-6">
      <h3 className="text-sm font-medium text-gray-600 dark:text-slate-300">Advanced Settings</h3>

      {/* Temperature */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-gray-500 dark:text-slate-400">Temperature</label>
          <span className="text-sm text-gray-900 dark:text-white font-mono">{temperature.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={temperature}
          onChange={(e) => onChange("temperature", parseFloat(e.target.value))}
          className="w-full accent-[#90FCA6]"
        />
        <div className="flex justify-between text-xs text-gray-400 dark:text-slate-600 mt-1">
          <span>Precise</span>
          <span>Creative</span>
        </div>
      </div>

      {/* Max Tokens */}
      <div>
        <label className="mb-2 block text-sm text-gray-500 dark:text-slate-400">Max Output Tokens</label>
        <select
          value={maxTokens}
          onChange={(e) => onChange("maxTokens", parseInt(e.target.value))}
          className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
        >
          <option value={1024}>1,024</option>
          <option value={2048}>2,048</option>
          <option value={4096}>4,096 (default)</option>
          <option value={8192}>8,192</option>
          <option value={16384}>16,384</option>
          <option value={32768}>32,768</option>
        </select>
      </div>

      {/* Max History */}
      <div>
        <label className="mb-2 block text-sm text-gray-500 dark:text-slate-400">Max History Messages</label>
        <select
          value={maxHistoryMessages}
          onChange={(e) => onChange("maxHistoryMessages", parseInt(e.target.value))}
          className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
        >
          <option value={10}>10 messages</option>
          <option value={25}>25 messages</option>
          <option value={50}>50 messages (default)</option>
          <option value={100}>100 messages</option>
          <option value={200}>200 messages</option>
        </select>
      </div>

      {/* Toggles */}
      <div className="space-y-3">
        <label className="flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-slate-400">Include org context in system prompt</span>
          <input
            type="checkbox"
            checked={includeOrgContext}
            onChange={(e) => onChange("includeOrgContext", e.target.checked)}
            className="rounded border-gray-300 dark:border-slate-600 accent-[#90FCA6]"
          />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-slate-400">Enable conversation memory</span>
          <input
            type="checkbox"
            checked={enableMemory}
            onChange={(e) => onChange("enableMemory", e.target.checked)}
            className="rounded border-gray-300 dark:border-slate-600 accent-[#90FCA6]"
          />
        </label>
      </div>

      {/* Custom System Prompt */}
      <div>
        <label className="mb-2 block text-sm text-gray-500 dark:text-slate-400">Custom Instructions (optional)</label>
        <textarea
          value={systemPromptExtra}
          onChange={(e) => onChange("systemPromptExtra", e.target.value)}
          placeholder="Add custom instructions appended to the system prompt..."
          rows={3}
          maxLength={2000}
          className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
        />
        <p className="mt-1 text-xs text-gray-400 dark:text-slate-600">{systemPromptExtra.length}/2000</p>
      </div>
    </div>
  )
}
