"use client"

import { Gem } from "lucide-react"
import { GenAIProviderPageTemplate, ProviderConfig } from "@/components/genai/provider-page-template"
import { getPaygPricingByProvider } from "@/lib/data/genai/genai-payg-pricing"
import {
  GENAI_COMMITMENT_PRICING,
} from "@/lib/data/genai/genai-commitment-pricing"
import {
  GENAI_INFRASTRUCTURE_PRICING,
} from "@/lib/data/genai/genai-infrastructure-pricing"

// Google API key validation
function validateGeminiKey(credential: string): { valid: boolean; error?: string } {
  if (!credential || credential.length < 20) {
    return { valid: false, error: "API key is too short. Google API keys are typically 39 characters." }
  }
  if (!credential.startsWith("AIza")) {
    return { valid: false, error: "Google API keys typically start with 'AIza'. Please check your key." }
  }
  return { valid: true }
}

// Provider configuration
const GEMINI_CONFIG: ProviderConfig = {
  id: "gemini",
  name: "Google Gemini",
  description: "Gemini 2.5, Gemini 2.0, Gemini 1.5 Pro/Flash with 1M+ context window and multimodal capabilities",
  icon: <Gem className="h-7 w-7" />,
  color: "#4285F4",
  placeholder: "AIza...",
  helperText: "Enter your Google AI Studio API key starting with 'AIza'. You can generate one in Google AI Studio.",
  docsUrl: "https://aistudio.google.com/app/apikey",
  docsSteps: [
    'Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" class="text-[#007AFF] font-medium hover:underline">Google AI Studio API Keys</a> and sign in with your Google account',
    'Click <strong>"Create API key"</strong> button',
    'Select an existing Google Cloud project or create a new one (e.g., "acme-inc-genai")',
    '<strong>Important:</strong> Copy the API key immediately - it starts with <code>AIza</code>',
    '<strong>Enable API:</strong> If prompted, enable the <a href="https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com" target="_blank" rel="noopener noreferrer" class="text-[#007AFF] font-medium hover:underline">Generative Language API</a> for your project',
    '<strong>Billing (Optional):</strong> Free tier is generous, but for production use, enable billing at <a href="https://console.cloud.google.com/billing" target="_blank" rel="noopener noreferrer" class="text-[#007AFF] font-medium hover:underline">Google Cloud Billing</a>',
    '<strong>Troubleshooting:</strong> If you get "API key not valid": (1) Verify key starts with AIza, (2) Ensure Generative Language API is enabled, (3) Check key has no IP/referrer restrictions, (4) Try creating a new key',
  ],
  validateCredential: validateGeminiKey,
}

export default function GeminiIntegrationPage() {
  // Get Gemini-specific pricing data
  const paygPricing = getPaygPricingByProvider("gemini")

  // GCP Vertex AI commitment pricing (GSU)
  const commitmentPricing = GENAI_COMMITMENT_PRICING.filter(
    (p) => p.provider === "gcp_vertex_pt"
  )

  // GCP GPU/TPU infrastructure pricing
  const infrastructurePricing = GENAI_INFRASTRUCTURE_PRICING.filter(
    (p) => p.cloud_provider === "gcp"
  )

  return (
    <GenAIProviderPageTemplate
      config={GEMINI_CONFIG}
      paygPricing={paygPricing}
      commitmentPricing={commitmentPricing}
      infrastructurePricing={infrastructurePricing}
    />
  )
}
