/**
 * Chat system constants and type definitions.
 */

// API service URL (for chat settings CRUD via server actions)
export const API_SERVICE_URL =
  process.env.API_SERVICE_URL || process.env.NEXT_PUBLIC_API_SERVICE_URL || "http://localhost:8000"

// Limits
export const MAX_CONVERSATIONS = 10
export const MAX_MESSAGE_LENGTH = 10000

// Supported LLM providers
export const LLM_PROVIDERS = [
  {
    id: "OPENAI",
    name: "OpenAI",
    icon: "openai",
    models: [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
    ],
  },
  {
    id: "ANTHROPIC",
    name: "Anthropic",
    icon: "anthropic",
    models: [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
      { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
      { id: "claude-haiku-4-20250514", name: "Claude Haiku 4" },
    ],
  },
  {
    id: "GEMINI",
    name: "Google Gemini",
    icon: "gemini",
    models: [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gemini-2.0-pro", name: "Gemini 2.0 Pro" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
    ],
  },
  {
    id: "DEEPSEEK",
    name: "DeepSeek",
    icon: "deepseek",
    models: [
      { id: "deepseek-chat", name: "DeepSeek Chat" },
      { id: "deepseek-reasoner", name: "DeepSeek Reasoner" },
    ],
  },
] as const

// Types
export interface ChatMessage {
  id: string
  conversation_id: string
  role: "user" | "assistant"
  content: string
  agent_name?: string
  model_id?: string
  latency_ms?: number
  created_at: string
  isError?: boolean
  isStreaming?: boolean
}

export interface Conversation {
  conversation_id: string
  title?: string
  provider: string
  model_id: string
  message_count: number
  status: string
  created_at: string
  last_message_at?: string
}

export interface ChatSettings {
  setting_id: string
  org_slug: string
  provider: string
  credential_id: string
  model_id: string
  model_name?: string
  temperature: number
  max_tokens: number
  include_org_context: boolean
  enable_memory: boolean
  max_history_messages: number
  system_prompt_extra?: string
  is_active: boolean
  configured_by?: string
  created_at: string
  updated_at?: string
}

export interface ChatSettingsInput {
  provider: string
  credential_id: string
  model_id: string
  model_name?: string
  temperature?: number
  max_tokens?: number
  include_org_context?: boolean
  enable_memory?: boolean
  max_history_messages?: number
  system_prompt_extra?: string
}

export interface ProviderInfo {
  provider: string
  models: { id: string; name: string }[]
  has_credential: boolean
  credential_id?: string
}
