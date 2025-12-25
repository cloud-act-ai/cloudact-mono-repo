"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { Gem, Loader2, Check, AlertCircle, ArrowLeft, DollarSign, CreditCard, RotateCcw, Pencil, Save, X } from "lucide-react"
import Link from "next/link"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { IntegrationConfigCard, IntegrationStatus } from "@/components/integration-config-card"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getIntegrations,
  setupIntegration,
  validateIntegration,
  deleteIntegration,
  listLLMPricing,
  updateLLMPricing,
  resetLLMPricing,
  listSaaSSubscriptions,
  updateSaaSSubscription,
  resetSaaSSubscriptions,
  LLMPricing,
  SaaSSubscription,
} from "@/actions/integrations"

// Client-side API key format validation
function validateGeminiKey(credential: string): { valid: boolean; error?: string } {
  if (!credential || credential.length < 20) {
    return { valid: false, error: "API key is too short. Google API keys are typically 39 characters." }
  }
  if (!credential.startsWith("AIza")) {
    return { valid: false, error: "Google Gemini API keys typically start with 'AIza'. Please check your key." }
  }
  return { valid: true }
}

export default function GeminiIntegrationPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [integration, setIntegration] = useState<IntegrationStatus | undefined>()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Pricing and Subscriptions state
  const [pricing, setPricing] = useState<LLMPricing[]>([])
  const [subscriptions, setSubscriptions] = useState<SaaSSubscription[]>([])
  const [pricingLoading, setPricingLoading] = useState(false)
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false)

  // Edit state
  const [editingPricing, setEditingPricing] = useState<string | null>(null)
  const [editingSubscription, setEditingSubscription] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, any>>({})

  // Load integration status
  const loadIntegration = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const result = await getIntegrations(orgSlug)

    if (result.success && result.integrations) {
      const geminiIntegration = result.integrations?.integrations?.["GEMINI"]
      setIntegration(geminiIntegration)
    } else {
      setError(result.error || "Failed to load integration status")
    }

    setIsLoading(false)
  }, [orgSlug])

  // Load pricing
  const loadPricing = useCallback(async () => {
    setPricingLoading(true)
    const result = await listLLMPricing(orgSlug, "gemini")
    if (result.success && result.pricing) {
      setPricing(result.pricing)
    }
    setPricingLoading(false)
  }, [orgSlug])

  // Load subscriptions
  const loadSubscriptions = useCallback(async () => {
    setSubscriptionsLoading(true)
    const result = await listSaaSSubscriptions(orgSlug, "gemini")
    if (result.success && result.subscriptions) {
      setSubscriptions(result.subscriptions)
    }
    setSubscriptionsLoading(false)
  }, [orgSlug])

  useEffect(() => {
    void loadIntegration()
  }, [loadIntegration])

  // Load pricing and subscriptions when integration is valid
  useEffect(() => {
    if (integration?.status === "VALID") {
      void loadPricing()
      void loadSubscriptions()
    }
  }, [integration?.status, loadPricing, loadSubscriptions])

  // Clear success message after delay
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  // Clear error message after delay
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 10000)
      return () => clearTimeout(timer)
    }
  }, [error])

  // Handle setup
  const handleSetup = async (credential: string) => {
    setError(null)
    setSuccessMessage(null)

    const result = await setupIntegration({
      orgSlug,
      provider: "gemini",
      credential,
    })

    if (result.success) {
      setSuccessMessage(
        result.validationStatus === "VALID"
          ? "Google Gemini API key connected and validated successfully!"
          : `Google Gemini API key saved (Status: ${result.validationStatus})`
      )
      await loadIntegration()
    } else {
      setError(result.error || result.message || "Setup failed. Please check your API key and try again.")
    }
  }

  // Handle validate
  const handleValidate = async () => {
    setError(null)
    setSuccessMessage(null)

    const result = await validateIntegration(orgSlug, "gemini")

    if (result.validationStatus === "VALID") {
      setSuccessMessage("Google Gemini API key validated successfully!")
    } else {
      setError(result.error || "Validation failed")
    }

    await loadIntegration()
  }

  // Handle delete
  const handleDelete = async () => {
    setError(null)
    setSuccessMessage(null)

    const result = await deleteIntegration(orgSlug, "gemini")

    if (result.success) {
      setSuccessMessage("Google Gemini integration removed")
      setPricing([])
      setSubscriptions([])
      await loadIntegration()
    } else {
      setError(result.error || "Delete failed")
    }
  }

  // Handle pricing update
  const handlePricingUpdate = async (modelId: string) => {
    const values = editValues[modelId]
    if (!values) return

    const result = await updateLLMPricing(orgSlug, "gemini", modelId, {
      input_price_per_1k: parseFloat(values.input_price_per_1k),
      output_price_per_1k: parseFloat(values.output_price_per_1k),
    })

    if (result.success) {
      setSuccessMessage(`Pricing updated for ${modelId}`)
      setEditingPricing(null)
      await loadPricing()
    } else {
      setError(result.error || "Failed to update pricing")
    }
  }

  // Handle subscription update
  const handleSubscriptionUpdate = async (planName: string) => {
    const values = editValues[planName]
    if (!values) return

    const result = await updateSaaSSubscription(orgSlug, "gemini", planName, {
      quantity: parseInt(values.quantity),
      unit_price_usd: parseFloat(values.unit_price_usd),
    })

    if (result.success) {
      setSuccessMessage(`Subscription updated for ${planName}`)
      setEditingSubscription(null)
      await loadSubscriptions()
    } else {
      setError(result.error || "Failed to update subscription")
    }
  }

  // Handle reset pricing
  const handleResetPricing = async () => {
    if (!confirm("Reset all pricing to default values? This cannot be undone.")) return

    const result = await resetLLMPricing(orgSlug, "gemini")
    if (result.success) {
      setSuccessMessage("Pricing reset to defaults")
      await loadPricing()
    } else {
      setError(result.error || "Failed to reset pricing")
    }
  }

  // Handle reset subscriptions
  const handleResetSubscriptions = async () => {
    if (!confirm("Reset all subscriptions to default values? This cannot be undone.")) return

    const result = await resetSaaSSubscriptions(orgSlug, "gemini")
    if (result.success) {
      setSuccessMessage("Subscriptions reset to defaults")
      await loadSubscriptions()
    } else {
      setError(result.error || "Failed to reset subscriptions")
    }
  }

  // Start editing pricing
  const startEditPricing = (model: LLMPricing) => {
    setEditingPricing(model.model_id)
    setEditValues({
      ...editValues,
      [model.model_id]: {
        input_price_per_1k: model.input_price_per_1k,
        output_price_per_1k: model.output_price_per_1k,
      }
    })
  }

  // Start editing subscription
  const startEditSubscription = (sub: SaaSSubscription) => {
    setEditingSubscription(sub.plan_name)
    setEditValues({
      ...editValues,
      [sub.plan_name]: {
        quantity: sub.quantity,
        unit_price_usd: sub.unit_price_usd,
      }
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#1a7a3a]" />
      </div>
    )
  }

  const isConnected = integration?.status === "VALID"

  return (
    <div className="space-y-6">
      {/* Header with back link */}
      <div className="flex items-center gap-4">
        <Link href={`/${orgSlug}/integrations/llm`}>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground h-11 rounded-xl">
            <ArrowLeft className="h-4 w-4 mr-1" />
            LLM Providers
          </Button>
        </Link>
      </div>

      {/* Enhanced Provider Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-blue-50 via-white to-white p-6 shadow-sm">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#4285F4] to-[#1A73E8]" />
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center flex-shrink-0 ring-1 ring-blue-200/50 shadow-sm">
            <Gem className="h-8 w-8 text-[#4285F4]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-[28px] font-bold text-black tracking-tight">Google Gemini Integration</h1>
              {isConnected && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#90FCA6]/10 animate-pulse">
                  <div className="h-2 w-2 rounded-full bg-[#90FCA6]" />
                  <span className="text-[11px] font-bold text-[#1a7a3a] uppercase tracking-wide">Connected</span>
                </div>
              )}
            </div>
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              Connect your Google AI Studio API key to track Gemini Pro, Flash, and Gemma model usage with comprehensive cost tracking
            </p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive" className="border-[#FF6C5E]/30 bg-[#FF6C5E]/5">
          <AlertCircle className="h-4 w-4 text-[#FF6C5E]" />
          <AlertTitle className="text-[#FF6C5E]">Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="border-[#90FCA6]/20 bg-[#F0FDFA]">
          <Check className="h-4 w-4 text-[#1a7a3a]" />
          <AlertTitle className="text-[#1a7a3a]">Success</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* Integration Card */}
      <IntegrationConfigCard
        provider="gemini"
        providerName="Google Gemini"
        providerDescription="Gemini Pro, Gemini Flash, Gemma, and other Gemini models"
        icon={<Gem className="h-6 w-6" />}
        placeholder="AIza..."
        inputType="text"
        helperText="Enter your Google AI Studio API key starting with 'AIza'. You can find this in Google AI Studio."
        integration={integration}
        onSetup={handleSetup}
        onValidate={handleValidate}
        onDelete={handleDelete}
        isLoading={isLoading}
        validateCredentialFormat={validateGeminiKey}
      />

      {/* Pricing & Subscriptions Management - Only show when connected */}
      {isConnected && (
        <Accordion type="multiple" className="w-full">
          {/* Subscriptions Section */}
          <AccordionItem value="subscriptions" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-[#1a7a3a]" />
                <span className="font-semibold">Subscriptions</span>
                <span className="console-subheading ml-2">
                  ({subscriptions.length} plans)
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="console-body">
                    Manage your Google Gemini subscription tiers and quantities.
                  </p>
                  <Button variant="outline" size="sm" onClick={handleResetSubscriptions} className="console-button-secondary">
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Reset to Defaults
                  </Button>
                </div>

                {subscriptionsLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-[#1a7a3a]" />
                    <span className="ml-2 console-body">Loading subscriptions...</span>
                  </div>
                ) : subscriptions.length === 0 ? (
                  <p className="console-body text-center py-4">
                    No subscriptions found. Use "Reset to Defaults" to initialize with default subscription data.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plan Name</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Unit Price (USD)</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subscriptions.map((sub) => (
                        <TableRow key={sub.plan_name}>
                          <TableCell className="font-medium">{sub.plan_name}</TableCell>
                          <TableCell className="text-right">
                            {editingSubscription === sub.plan_name ? (
                              <Input
                                type="number"
                                className="w-24 ml-auto"
                                value={editValues[sub.plan_name]?.quantity ?? sub.quantity}
                                onChange={(e) => setEditValues({
                                  ...editValues,
                                  [sub.plan_name]: {
                                    ...editValues[sub.plan_name],
                                    quantity: e.target.value
                                  }
                                })}
                              />
                            ) : (
                              sub.quantity
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {editingSubscription === sub.plan_name ? (
                              <Input
                                type="number"
                                step="0.01"
                                className="w-28 ml-auto"
                                value={editValues[sub.plan_name]?.unit_price_usd ?? sub.unit_price_usd}
                                onChange={(e) => setEditValues({
                                  ...editValues,
                                  [sub.plan_name]: {
                                    ...editValues[sub.plan_name],
                                    unit_price_usd: e.target.value
                                  }
                                })}
                              />
                            ) : (
                              `$${sub.unit_price_usd.toFixed(2)}`
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {editingSubscription === sub.plan_name ? (
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleSubscriptionUpdate(sub.plan_name)}
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingSubscription(null)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEditSubscription(sub)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Pricing Section */}
          <AccordionItem value="pricing" className="border rounded-lg px-4 mt-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-[#FF6C5E]" />
                <span className="font-semibold">Model Pricing</span>
                <span className="console-subheading ml-2">
                  ({pricing.length} models)
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="console-body">
                    Configure pricing per 1K tokens for each model.
                  </p>
                  <Button variant="outline" size="sm" onClick={handleResetPricing} className="console-button-secondary">
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Reset to Defaults
                  </Button>
                </div>

                {pricingLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-[#1a7a3a]" />
                    <span className="ml-2 console-body">Loading pricing...</span>
                  </div>
                ) : pricing.length === 0 ? (
                  <p className="console-body text-center py-4">
                    No pricing found. Use "Reset to Defaults" to initialize with default pricing data.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead className="text-right">Input ($/1K)</TableHead>
                        <TableHead className="text-right">Output ($/1K)</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pricing.map((model) => (
                        <TableRow key={model.model_id}>
                          <TableCell className="font-medium">
                            {model.model_name || model.model_id}
                          </TableCell>
                          <TableCell className="text-right">
                            {editingPricing === model.model_id ? (
                              <Input
                                type="number"
                                step="0.0001"
                                className="w-28 ml-auto"
                                value={editValues[model.model_id]?.input_price_per_1k ?? model.input_price_per_1k}
                                onChange={(e) => setEditValues({
                                  ...editValues,
                                  [model.model_id]: {
                                    ...editValues[model.model_id],
                                    input_price_per_1k: e.target.value
                                  }
                                })}
                              />
                            ) : (
                              `$${model.input_price_per_1k.toFixed(4)}`
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {editingPricing === model.model_id ? (
                              <Input
                                type="number"
                                step="0.0001"
                                className="w-28 ml-auto"
                                value={editValues[model.model_id]?.output_price_per_1k ?? model.output_price_per_1k}
                                onChange={(e) => setEditValues({
                                  ...editValues,
                                  [model.model_id]: {
                                    ...editValues[model.model_id],
                                    output_price_per_1k: e.target.value
                                  }
                                })}
                              />
                            ) : (
                              `$${model.output_price_per_1k.toFixed(4)}`
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {editingPricing === model.model_id ? (
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handlePricingUpdate(model.model_id)}
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingPricing(null)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEditPricing(model)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* Help Section */}
      <div className="rounded-lg border border-[#90FCA6]/20 p-4 bg-[#F0FDFA]">
        <h3 className="console-card-title mb-2">How to get your Google Gemini API key</h3>
        <ol className="list-decimal list-inside space-y-2 console-body">
          <li>Go to <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-[#1a7a3a] underline">Google AI Studio</a></li>
          <li>Click "Create API Key"</li>
          <li>Select your Google Cloud project (or create a new one)</li>
          <li>Copy the API key immediately</li>
        </ol>
        <p className="console-body mt-3">
          <strong>Note:</strong> Make sure you have enabled the Gemini API in your Google Cloud project.
        </p>
      </div>
    </div>
  )
}
