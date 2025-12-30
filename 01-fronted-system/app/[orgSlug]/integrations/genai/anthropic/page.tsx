"use client"

import { Sparkles } from "lucide-react"
import { GenAIProviderPageTemplate, ProviderConfig } from "@/components/genai/provider-page-template"
import { getPaygPricingByProvider } from "@/lib/data/genai/genai-payg-pricing"
import {
  GENAI_COMMITMENT_PRICING,
} from "@/lib/data/genai/genai-commitment-pricing"
import {
  getInfraPricingByCloudProvider,
} from "@/lib/data/genai/genai-infrastructure-pricing"

// Anthropic API key validation
function validateAnthropicKey(credential: string): { valid: boolean; error?: string } {
  if (!credential || credential.length < 20) {
    return { valid: false, error: "API key is too short. Anthropic keys are typically 100+ characters." }
  }
  if (!credential.startsWith("sk-ant-")) {
    return { valid: false, error: "Anthropic API keys must start with 'sk-ant-'. Please check your key." }
  }
  return { valid: true }
}

// Provider configuration
const ANTHROPIC_CONFIG: ProviderConfig = {
  id: "anthropic",
  name: "Anthropic",
  description: "Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku and other Claude models with advanced reasoning",
  icon: <Sparkles className="h-7 w-7" />,
  color: "#D4A574",
  placeholder: "sk-ant-...",
  helperText: "Enter your Anthropic API key starting with 'sk-ant-'. You can find this in your Anthropic Console.",
  docsUrl: "https://console.anthropic.com/settings/keys",
  docsSteps: [
    'Go to <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" class="text-[#007AFF] font-medium hover:underline">Anthropic Console API Keys</a> and sign in',
    'Click <strong>"Create Key"</strong> button',
    'Give it a descriptive name (e.g., "CloudAct - Acme Inc Production")',
    '<strong>Important:</strong> Copy the key immediately - it starts with <code>sk-ant-</code> and will only be shown once!',
    'Go to <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer" class="text-[#007AFF] font-medium hover:underline">Billing Settings</a> to add credits or set up a payment method',
    '<strong>Rate Limits:</strong> View your current tier and limits at <a href="https://console.anthropic.com/settings/limits" target="_blank" rel="noopener noreferrer" class="text-[#007AFF] font-medium hover:underline">Rate Limits</a>',
    '<strong>Troubleshooting:</strong> If validation fails, verify: (1) Key starts with sk-ant-, (2) Account has credits, (3) Key has not been revoked in the console',
  ],
  validateCredential: validateAnthropicKey,
}

export default function AnthropicIntegrationPage() {
  // Get Anthropic-specific pricing data
  const paygPricing = getPaygPricingByProvider("anthropic")

  // AWS Bedrock commitment pricing for Claude models
  const commitmentPricing = GENAI_COMMITMENT_PRICING.filter(
    (p) => p.provider === "aws_bedrock_pt"
  )

  // AWS infrastructure for Bedrock/self-hosted Claude deployment
  const infrastructurePricing = getInfraPricingByCloudProvider("aws")

  return (
    <GenAIProviderPageTemplate
      config={ANTHROPIC_CONFIG}
      paygPricing={paygPricing}
      commitmentPricing={commitmentPricing}
      infrastructurePricing={infrastructurePricing}
    />
  )
}
