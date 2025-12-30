"use client"

import { Brain } from "lucide-react"
import { GenAIProviderPageTemplate, ProviderConfig } from "@/components/genai/provider-page-template"
import {
  getPaygPricingByProvider,
} from "@/lib/data/genai/genai-payg-pricing"
import {
  GENAI_COMMITMENT_PRICING,
} from "@/lib/data/genai/genai-commitment-pricing"
import {
  getInfraPricingByCloudProvider,
} from "@/lib/data/genai/genai-infrastructure-pricing"

// OpenAI API key validation
function validateOpenAIKey(credential: string): { valid: boolean; error?: string } {
  if (!credential || credential.length < 20) {
    return { valid: false, error: "API key is too short. OpenAI keys are typically 50+ characters." }
  }
  if (!credential.startsWith("sk-")) {
    return { valid: false, error: "OpenAI API keys must start with 'sk-'. Please check your key." }
  }
  return { valid: true }
}

// Provider configuration
const OPENAI_CONFIG: ProviderConfig = {
  id: "openai",
  name: "OpenAI",
  description: "GPT-4o, GPT-4, GPT-3.5 Turbo, o1, DALL-E, and Whisper models with real-time cost tracking",
  icon: <Brain className="h-7 w-7" />,
  color: "#10A37F",
  placeholder: "sk-...",
  helperText: "Enter your OpenAI API key starting with 'sk-'. You can find this in your OpenAI dashboard.",
  docsUrl: "https://platform.openai.com/api-keys",
  docsSteps: [
    'Go to <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" class="text-[#007AFF] font-medium hover:underline">OpenAI API Keys</a> and sign in to your account',
    'Click <strong>"Create new secret key"</strong> button in the top right',
    'Give it a descriptive name (e.g., "CloudAct - Acme Inc Production")',
    '<strong>Important:</strong> Copy the key immediately - it will only be shown once! The key starts with <code>sk-</code>',
    'Go to <a href="https://platform.openai.com/settings/organization/billing" target="_blank" rel="noopener noreferrer" class="text-[#007AFF] font-medium hover:underline">Billing Settings</a> and ensure you have a payment method added',
    '<strong>Recommended:</strong> Set usage limits in <a href="https://platform.openai.com/settings/organization/limits" target="_blank" rel="noopener noreferrer" class="text-[#007AFF] font-medium hover:underline">Usage Limits</a> to control costs',
    '<strong>Troubleshooting:</strong> If validation fails, verify: (1) Key starts with sk-, (2) Billing is active, (3) Key has not been revoked',
  ],
  validateCredential: validateOpenAIKey,
}

export default function OpenAIIntegrationPage() {
  // Get OpenAI-specific pricing data
  const paygPricing = getPaygPricingByProvider("openai")

  // OpenAI uses Azure OpenAI for PTU commitment pricing
  const commitmentPricing = GENAI_COMMITMENT_PRICING.filter(
    (p) => p.provider === "azure_openai_ptu"
  )

  // Azure infrastructure for self-hosted OpenAI models
  const infrastructurePricing = getInfraPricingByCloudProvider("azure")

  return (
    <GenAIProviderPageTemplate
      config={OPENAI_CONFIG}
      paygPricing={paygPricing}
      commitmentPricing={commitmentPricing}
      infrastructurePricing={infrastructurePricing}
    />
  )
}
