"use client"

import { Telescope } from "lucide-react"
import { GenAIProviderPageTemplate, ProviderConfig } from "@/components/genai/provider-page-template"
import {
  GENAI_INFRASTRUCTURE_PRICING,
} from "@/lib/data/genai/genai-infrastructure-pricing"
import type { GenAIPAYGPricing } from "@/lib/data/genai/genai-payg-pricing"
import type { GenAICommitmentPricing } from "@/lib/data/genai/genai-commitment-pricing"

// DeepSeek API key validation
function validateDeepSeekKey(credential: string): { valid: boolean; error?: string } {
  if (!credential || credential.length < 20) {
    return { valid: false, error: "API key is too short. DeepSeek keys are typically 50+ characters." }
  }
  if (!credential.startsWith("sk-")) {
    return { valid: false, error: "DeepSeek API keys must start with 'sk-'. Please check your key." }
  }
  return { valid: true }
}

// Provider configuration
const DEEPSEEK_CONFIG: ProviderConfig = {
  id: "deepseek",
  name: "DeepSeek",
  description: "DeepSeek-V3, DeepSeek-R1, and Coder models with exceptional price-performance ratio",
  icon: <Telescope className="h-7 w-7" />,
  color: "#7C3AED",
  placeholder: "sk-...",
  helperText: "Enter your DeepSeek API key starting with 'sk-'. You can find this in your DeepSeek dashboard.",
  docsUrl: "https://platform.deepseek.com/api_keys",
  docsSteps: [
    'Go to <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer" class="text-[#007AFF] font-medium hover:underline">DeepSeek Platform API Keys</a>',
    'Sign in with your account or <a href="https://platform.deepseek.com/sign_up" target="_blank" rel="noopener noreferrer" class="text-[#007AFF] font-medium hover:underline">create a new account</a>',
    'Click <strong>"Create new API key"</strong> button',
    '<strong>Important:</strong> Copy the key immediately - it starts with <code>sk-</code> and will only be shown once!',
    '<strong>Free Credits:</strong> New accounts receive free credits. Check your balance at <a href="https://platform.deepseek.com/usage" target="_blank" rel="noopener noreferrer" class="text-[#007AFF] font-medium hover:underline">Usage Dashboard</a>',
    '<strong>Top Up:</strong> Add credits at <a href="https://platform.deepseek.com/top_up" target="_blank" rel="noopener noreferrer" class="text-[#007AFF] font-medium hover:underline">Top Up</a> when needed',
    '<strong>Troubleshooting:</strong> If validation fails, verify: (1) Key starts with sk-, (2) Account has credits, (3) Key has not been deleted',
  ],
  validateCredential: validateDeepSeekKey,
}

// DeepSeek pricing data (inline since not in main data file yet)
const DEEPSEEK_PAYG_PRICING: GenAIPAYGPricing[] = [
  {
    provider: "deepseek",
    model: "deepseek-chat",
    model_family: "deepseek-v3",
    model_version: "latest",
    region: "global",
    input_per_1m: 0.14,
    output_per_1m: 0.28,
    cached_input_per_1m: 0.014,
    cached_write_per_1m: null,
    batch_input_per_1m: null,
    batch_output_per_1m: null,
    cached_discount_pct: 90,
    batch_discount_pct: 0,
    volume_tier: "standard",
    volume_discount_pct: 0,
    free_tier_input_tokens: 0,
    free_tier_output_tokens: 0,
    rate_limit_rpm: 60,
    rate_limit_tpm: 1000000,
    context_window: 64000,
    max_output_tokens: 8192,
    supports_vision: false,
    supports_streaming: true,
    supports_tools: true,
    sla_uptime_pct: 99.9,
    effective_from: "2024-12-01",
    effective_to: null,
    status: "active",
    last_updated: "2024-12-26",
    notes: "DeepSeek V3 Chat",
  },
  {
    provider: "deepseek",
    model: "deepseek-reasoner",
    model_family: "deepseek-r1",
    model_version: "latest",
    region: "global",
    input_per_1m: 0.55,
    output_per_1m: 2.19,
    cached_input_per_1m: 0.14,
    cached_write_per_1m: null,
    batch_input_per_1m: null,
    batch_output_per_1m: null,
    cached_discount_pct: 75,
    batch_discount_pct: 0,
    volume_tier: "standard",
    volume_discount_pct: 0,
    free_tier_input_tokens: 0,
    free_tier_output_tokens: 0,
    rate_limit_rpm: 60,
    rate_limit_tpm: 1000000,
    context_window: 64000,
    max_output_tokens: 8192,
    supports_vision: false,
    supports_streaming: true,
    supports_tools: false,
    sla_uptime_pct: 99.9,
    effective_from: "2025-01-20",
    effective_to: null,
    status: "active",
    last_updated: "2024-12-26",
    notes: "DeepSeek R1 Reasoning",
  },
  {
    provider: "deepseek",
    model: "deepseek-coder",
    model_family: "deepseek-coder",
    model_version: "v2.5",
    region: "global",
    input_per_1m: 0.14,
    output_per_1m: 0.28,
    cached_input_per_1m: 0.014,
    cached_write_per_1m: null,
    batch_input_per_1m: null,
    batch_output_per_1m: null,
    cached_discount_pct: 90,
    batch_discount_pct: 0,
    volume_tier: "standard",
    volume_discount_pct: 0,
    free_tier_input_tokens: 0,
    free_tier_output_tokens: 0,
    rate_limit_rpm: 60,
    rate_limit_tpm: 1000000,
    context_window: 128000,
    max_output_tokens: 8192,
    supports_vision: false,
    supports_streaming: true,
    supports_tools: true,
    sla_uptime_pct: 99.9,
    effective_from: "2024-12-01",
    effective_to: null,
    status: "active",
    last_updated: "2024-12-26",
    notes: "DeepSeek Coder V2.5",
  },
]

export default function DeepSeekIntegrationPage() {
  // DeepSeek PAYG pricing
  const paygPricing = DEEPSEEK_PAYG_PRICING

  // DeepSeek doesn't have commitment pricing (API-only)
  const commitmentPricing: GenAICommitmentPricing[] = []

  // No infrastructure pricing for DeepSeek API
  const infrastructurePricing: typeof GENAI_INFRASTRUCTURE_PRICING = []

  return (
    <GenAIProviderPageTemplate
      config={DEEPSEEK_CONFIG}
      paygPricing={paygPricing}
      commitmentPricing={commitmentPricing}
      infrastructurePricing={infrastructurePricing}
    />
  )
}
