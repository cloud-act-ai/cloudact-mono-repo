"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { Brain, Loader2, Check, AlertCircle, ArrowLeft, DollarSign, RotateCcw, Pencil, Save, X, Trash2, Plus, Plug } from "lucide-react"
import Link from "next/link"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { IntegrationConfigCard, IntegrationStatus } from "@/components/integration-config-card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  getIntegrations,
  setupIntegration,
  validateIntegration,
  deleteIntegration,
  listLLMPricing,
  updateLLMPricing,
  resetLLMPricing,
  resetSaaSSubscriptions,
  createSaaSSubscription,
  deleteSaaSSubscription,
  createLLMPricing,
  deleteLLMPricing,
  LLMPricing,
  SaaSSubscription,
  SaaSSubscriptionCreate,
  LLMPricingCreate,
} from "@/actions/integrations"

// Client-side API key format validation
function validateOpenAIKey(credential: string): { valid: boolean; error?: string } {
  if (!credential || credential.length < 20) {
    return { valid: false, error: "API key is too short. OpenAI keys are typically 50+ characters." }
  }
  if (!credential.startsWith("sk-")) {
    return { valid: false, error: "OpenAI API keys must start with 'sk-'. Please check your key." }
  }
  return { valid: true }
}

export default function OpenAIIntegrationPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const [integration, setIntegration] = useState<IntegrationStatus | undefined>()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Pricing and Subscriptions state
  const [pricing, setPricing] = useState<LLMPricing[]>([])
  const [pricingLoading, setPricingLoading] = useState(false)

  // Edit state
  const [editingPricing, setEditingPricing] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, unknown>>({})

  // Loading states for CRUD operations
  const [deletingSubscription, setDeletingSubscription] = useState<string | null>(null)
  const [savingPricing, setSavingPricing] = useState<string | null>(null)
  const [deletingPricing, setDeletingPricing] = useState<string | null>(null)
  const [resettingPricing, setResettingPricing] = useState(false)
  const [resettingSubscriptions, setResettingSubscriptions] = useState(false)
  const [creatingSubscription, setCreatingSubscription] = useState(false)
  const [creatingPricing, setCreatingPricing] = useState(false)

  // Dialog states
  const [deleteSubDialog, setDeleteSubDialog] = useState<{ open: boolean; sub: SaaSSubscription | null }>({ open: false, sub: null })
  const [deletePricingDialog, setDeletePricingDialog] = useState<{ open: boolean; model: LLMPricing | null }>({ open: false, model: null })
  const [resetPricingDialog, setResetPricingDialog] = useState(false)
  const [resetSubDialog, setResetSubDialog] = useState(false)

  // Create modal states
  const [createSubModal, setCreateSubModal] = useState(false)
  const [createPricingModal, setCreatePricingModal] = useState(false)

  // Generate a unique subscription ID
  const generateSubscriptionId = () => {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    return new Date().toISOString().split('T')[0]
  }

  const [newSubscription, setNewSubscription] = useState<SaaSSubscriptionCreate>({
    subscription_id: generateSubscriptionId(),
    plan_name: '',
    quantity: 1,
    unit_price_usd: 0,
    effective_date: getTodayDate(),
    tier_type: 'paid',
  })
  const [newPricing, setNewPricing] = useState<LLMPricingCreate>({
    model_id: '',
    model_name: '',
    input_price_per_1k: 0,
    output_price_per_1k: 0,
    effective_date: getTodayDate(),
  })

  // Load integration status
  const loadIntegration = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const result = await getIntegrations(orgSlug)

    if (result.success && result.integrations) {
      const openaiIntegration = result.integrations.integrations["OPENAI"]
      setIntegration(openaiIntegration)
    } else {
      setError(result.error || "Failed to load integration status")
    }

    setIsLoading(false)
  }, [orgSlug])

  // Load pricing
  const loadPricing = useCallback(async () => {
    setPricingLoading(true)
    const result = await listLLMPricing(orgSlug, "openai")
    if (result.success && result.pricing) {
      setPricing(result.pricing)
    }
    setPricingLoading(false)
  }, [orgSlug])


  useEffect(() => {
    loadIntegration()
  }, [loadIntegration])

  // Load pricing when integration is valid
  useEffect(() => {
    if (integration?.status === "VALID") {
      loadPricing()
    }
  }, [integration?.status, loadPricing])

  // Clear success message after delay
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 15000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  // Clear error message after delay
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 20000)
      return () => clearTimeout(timer)
    }
  }, [error])

  // Handle setup
  const handleSetup = async (credential: string) => {
    setError(null)
    setSuccessMessage(null)

    const result = await setupIntegration({
      orgSlug,
      provider: "openai",
      credential,
    })

    if (result.success) {
      setSuccessMessage(
        result.validationStatus === "VALID"
          ? "OpenAI API key connected and validated successfully!"
          : `OpenAI API key saved (Status: ${result.validationStatus})`
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

    const result = await validateIntegration(orgSlug, "openai")

    if (result.validationStatus === "VALID") {
      setSuccessMessage("OpenAI API key validated successfully!")
    } else {
      setError(result.error || "Validation failed")
    }

    await loadIntegration()
  }

  // Handle delete
  const handleDelete = async () => {
    setError(null)
    setSuccessMessage(null)

    const result = await deleteIntegration(orgSlug, "openai")

    if (result.success) {
      setSuccessMessage("OpenAI integration removed")
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

    const inputPrice = parseFloat(values.input_price_per_1k)
    const outputPrice = parseFloat(values.output_price_per_1k)
    if (isNaN(inputPrice) || inputPrice < 0) {
      setError("Input price must be a non-negative number")
      return
    }
    if (isNaN(outputPrice) || outputPrice < 0) {
      setError("Output price must be a non-negative number")
      return
    }

    setSavingPricing(modelId)
    setError(null)
    const result = await updateLLMPricing(orgSlug, "openai", modelId, {
      input_price_per_1k: inputPrice,
      output_price_per_1k: outputPrice,
    })
    setSavingPricing(null)

    if (result.success) {
      setSuccessMessage(`Pricing updated for ${modelId}`)
      setEditingPricing(null)
      await loadPricing()
    } else {
      setError(result.error || "Failed to update pricing")
    }
  }


  // Handle reset pricing
  const handleResetPricing = async () => {
    setResettingPricing(true)
    setError(null)
    const result = await resetLLMPricing(orgSlug, "openai")
    setResettingPricing(false)
    setResetPricingDialog(false)

    if (result.success) {
      setSuccessMessage("Pricing reset to defaults")
      await loadPricing()
    } else {
      setError(result.error || "Failed to reset pricing")
    }
  }

  // Handle reset subscriptions
  const handleResetSubscriptions = async () => {
    setResettingSubscriptions(true)
    setError(null)
    const result = await resetSaaSSubscriptions(orgSlug, "openai")
    setResettingSubscriptions(false)
    setResetSubDialog(false)

    if (result.success) {
      setSuccessMessage("Subscriptions reset to defaults")
      await loadSubscriptions()
    } else {
      setError(result.error || "Failed to reset subscriptions")
    }
  }

  // Handle delete subscription
  const handleDeleteSubscription = async () => {
    const sub = deleteSubDialog.sub
    if (!sub) return

    setDeletingSubscription(sub.plan_name)
    setError(null)
    const provider = sub.provider as "openai" | "anthropic" | "gemini" | "custom"
    const result = await deleteSaaSSubscription(orgSlug, provider, sub.plan_name)
    setDeletingSubscription(null)
    setDeleteSubDialog({ open: false, sub: null })

    if (result.success) {
      setSuccessMessage(`Subscription "${sub.plan_name}" deleted`)
      await loadSubscriptions()
    } else {
      setError(result.error || "Failed to delete subscription")
    }
  }

  // Handle delete pricing
  const handleDeletePricing = async () => {
    const model = deletePricingDialog.model
    if (!model) return

    setDeletingPricing(model.model_id)
    setError(null)
    const result = await deleteLLMPricing(orgSlug, "openai", model.model_id)
    setDeletingPricing(null)
    setDeletePricingDialog({ open: false, model: null })

    if (result.success) {
      setSuccessMessage(`Pricing for "${model.model_name || model.model_id}" deleted`)
      await loadPricing()
    } else {
      setError(result.error || "Failed to delete pricing")
    }
  }

  // Handle create subscription
  const handleCreateSubscription = async () => {
    const planName = newSubscription.plan_name.trim()
    if (!planName) {
      setError("Plan name is required")
      return
    }
    if (!/^[a-zA-Z0-9_]{1,50}$/.test(planName)) {
      setError("Plan name must be 1-50 characters, alphanumeric with underscores only (no spaces or special characters)")
      return
    }
    if (newSubscription.unit_price_usd < 0) {
      setError("Price must be non-negative")
      return
    }
    if (newSubscription.quantity < 0) {
      setError("Quantity must be non-negative")
      return
    }

    setCreatingSubscription(true)
    setError(null)

    const subscriptionData: SaaSSubscriptionCreate = {
      ...newSubscription,
      subscription_id: newSubscription.subscription_id || generateSubscriptionId(),
      effective_date: newSubscription.effective_date || getTodayDate(),
      plan_name: planName,
    }

    const provider = "openai" as const
    const result = await createSaaSSubscription(orgSlug, provider, subscriptionData)
    setCreatingSubscription(false)

    if (result.success) {
      setSuccessMessage(`Subscription "${planName}" created`)
      setCreateSubModal(false)
      setNewSubscription({
        subscription_id: generateSubscriptionId(),
        plan_name: '',
        quantity: 1,
        unit_price_usd: 0,
        effective_date: getTodayDate(),
        tier_type: 'paid',
      })
      await loadSubscriptions()
    } else {
      setError(result.error || "Failed to create subscription")
    }
  }

  // Handle create pricing
  const handleCreatePricing = async () => {
    if (!newPricing.model_id.trim()) {
      setError("Model ID is required")
      return
    }
    if (newPricing.input_price_per_1k < 0 || newPricing.output_price_per_1k < 0) {
      setError("Prices must be non-negative")
      return
    }

    setCreatingPricing(true)
    setError(null)
    const result = await createLLMPricing(orgSlug, "openai", newPricing)
    setCreatingPricing(false)

    if (result.success) {
      setSuccessMessage(`Pricing for "${newPricing.model_name || newPricing.model_id}" created`)
      setCreatePricingModal(false)
      setNewPricing({
        model_id: '',
        model_name: '',
        input_price_per_1k: 0,
        output_price_per_1k: 0,
        effective_date: getTodayDate(),
      })
      await loadPricing()
    } else {
      setError(result.error || "Failed to create pricing")
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isConnected = integration?.status === "VALID"

  return (
    <div className="space-y-8">
      {/* Header with back link */}
      <div className="flex items-center gap-3">
        <Link href={`/${orgSlug}/settings/integrations`}>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            All Integrations
          </Button>
        </Link>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#007A78]/10 to-[#14B8A6]/10">
            <Brain className="h-6 w-6 text-[#007A78]" />
          </div>
          <h1 className="console-page-title">OpenAI Integration</h1>
        </div>
        <p className="console-subheading ml-12">
          Connect your OpenAI API key to track usage, costs, and access GPT models.
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="border-[#007A78]/20 bg-[#F0FDFA]">
          <Check className="h-4 w-4 text-[#007A78]" />
          <AlertTitle className="text-[#007A78]">Success</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* ===== SECTION 1: Connect & Pricing ===== */}
      <div className="space-y-6">
        <h2 className="console-heading flex items-center gap-2">
          <Plug className="h-5 w-5 text-[#007A78]" />
          Connect
        </h2>

        {/* Integration Card */}
        <IntegrationConfigCard
          provider="openai"
          providerName="OpenAI"
          providerDescription="GPT-4, GPT-4 Turbo, GPT-3.5, DALL-E, and other OpenAI models"
          icon={<Brain className="h-6 w-6" />}
          placeholder="sk-..."
          inputType="text"
          helperText="Enter your OpenAI API key starting with 'sk-'. You can find this in your OpenAI dashboard."
          integration={integration}
          onSetup={handleSetup}
          onValidate={handleValidate}
          onDelete={handleDelete}
          isLoading={isLoading}
          validateCredentialFormat={validateOpenAIKey}
        />

        {/* Model Pricing - Only show when connected */}
        {isConnected && (
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#FF6E50]/10">
                    <DollarSign className="h-5 w-5 text-[#FF6E50]" />
                  </div>
                  <div>
                    <CardTitle className="console-card-title">Model Pricing</CardTitle>
                    <CardDescription className="console-small">
                      Configure pricing per 1K tokens for cost calculation
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  {pricing.length} models
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCreatePricingModal(true)} className="console-button-secondary">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Model
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setResetPricingDialog(true)}
                    className="console-button-secondary"
                    disabled={resettingPricing}
                  >
                    {resettingPricing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                    Reset
                  </Button>
                </div>

                {pricingLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-[#007A78]" />
                  </div>
                ) : pricing.length === 0 ? (
                  <p className="console-body text-center py-4 text-slate-500">
                    No pricing configured. Click "Reset" to load default pricing.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead className="text-right">Input ($/1K)</TableHead>
                        <TableHead className="text-right">Output ($/1K)</TableHead>
                        <TableHead className="text-right w-24">Actions</TableHead>
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
                                min="0"
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
                                min="0"
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
                                  disabled={savingPricing === model.model_id}
                                >
                                  {savingPricing === model.model_id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Save className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingPricing(null)}
                                  disabled={savingPricing === model.model_id}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEditPricing(model)}
                                  disabled={deletingPricing === model.model_id}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => setDeletePricingDialog({ open: true, model })}
                                  disabled={deletingPricing === model.model_id}
                                >
                                  {deletingPricing === model.model_id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Help Section */}
      <div className="rounded-lg border border-[#007A78]/20 p-4 bg-[#F0FDFA]">
        <h3 className="console-card-title mb-2">How to get your OpenAI API key</h3>
        <ol className="list-decimal list-inside space-y-2 console-body">
          <li>Go to <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-[#007A78] underline">OpenAI API Keys</a></li>
          <li>Click "Create new secret key"</li>
          <li>Give it a name (e.g., "CloudAct Integration")</li>
          <li>Copy the key immediately (it won't be shown again)</li>
        </ol>
        <p className="console-body mt-3">
          <strong>Note:</strong> Make sure your OpenAI account has billing enabled to use the API.
        </p>
      </div>

      {/* Dialogs */}
      <Dialog open={deleteSubDialog.open} onOpenChange={(open) => setDeleteSubDialog({ open, sub: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Subscription</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the subscription "{deleteSubDialog.sub?.plan_name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSubDialog({ open: false, sub: null })}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSubscription}
              disabled={!!deletingSubscription}
            >
              {deletingSubscription ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deletePricingDialog.open} onOpenChange={(open) => setDeletePricingDialog({ open, model: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Pricing</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete pricing for "{deletePricingDialog.model?.model_name || deletePricingDialog.model?.model_id}"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePricingDialog({ open: false, model: null })}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeletePricing}
              disabled={!!deletingPricing}
            >
              {deletingPricing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetSubDialog} onOpenChange={setResetSubDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Subscriptions</DialogTitle>
            <DialogDescription>
              Reset all subscriptions to default values? This will replace all current subscription data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetSubDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetSubscriptions}
              disabled={resettingSubscriptions}
            >
              {resettingSubscriptions ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Reset to Defaults
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetPricingDialog} onOpenChange={setResetPricingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Pricing</DialogTitle>
            <DialogDescription>
              Reset all pricing to default values? This will replace all current pricing data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPricingDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetPricing}
              disabled={resettingPricing}
            >
              {resettingPricing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Reset to Defaults
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createSubModal} onOpenChange={setCreateSubModal}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Add OpenAI Subscription Plan</DialogTitle>
            <DialogDescription>
              Create a new subscription plan. Plan name must use underscores instead of spaces.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="sub-plan" className="text-right">
                Plan Name <span className="text-red-500">*</span>
              </Label>
              <div className="col-span-3">
                <Input
                  id="sub-plan"
                  placeholder="e.g., TIER1, MY_CUSTOM_PLAN"
                  value={newSubscription.plan_name}
                  onChange={(e) => setNewSubscription({ ...newSubscription, plan_name: e.target.value.replace(/\s/g, '_') })}
                />
                <p className="text-xs text-slate-500 mt-1">Alphanumeric and underscores only</p>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="sub-quantity" className="text-right">Quantity</Label>
              <Input
                id="sub-quantity"
                type="number"
                min="0"
                placeholder="0"
                className="col-span-3"
                value={newSubscription.quantity === 0 ? "" : newSubscription.quantity}
                onChange={(e) => setNewSubscription({ ...newSubscription, quantity: e.target.value === "" ? 0 : parseInt(e.target.value) })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="sub-price" className="text-right">Price (USD)</Label>
              <Input
                id="sub-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="col-span-3"
                value={newSubscription.unit_price_usd === 0 ? "" : newSubscription.unit_price_usd}
                onChange={(e) => setNewSubscription({ ...newSubscription, unit_price_usd: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="sub-date" className="text-right">Effective Date</Label>
              <Input
                id="sub-date"
                type="date"
                className="col-span-3"
                value={newSubscription.effective_date}
                onChange={(e) => setNewSubscription({ ...newSubscription, effective_date: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="sub-tier" className="text-right">Tier Type</Label>
              <Select
                value={newSubscription.tier_type || 'paid'}
                onValueChange={(value) => setNewSubscription({ ...newSubscription, tier_type: value as "free" | "paid" | "trial" | "enterprise" })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="sub-rpm" className="text-right">RPM Limit</Label>
              <Input
                id="sub-rpm"
                type="number"
                min="0"
                placeholder="Optional"
                className="col-span-3"
                value={newSubscription.rpm_limit || ''}
                onChange={(e) => setNewSubscription({ ...newSubscription, rpm_limit: e.target.value ? parseInt(e.target.value) : undefined })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="sub-tpm" className="text-right">TPM Limit</Label>
              <Input
                id="sub-tpm"
                type="number"
                min="0"
                placeholder="Optional"
                className="col-span-3"
                value={newSubscription.tpm_limit || ''}
                onChange={(e) => setNewSubscription({ ...newSubscription, tpm_limit: e.target.value ? parseInt(e.target.value) : undefined })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateSubModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSubscription} disabled={creatingSubscription}>
              {creatingSubscription ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Create Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createPricingModal} onOpenChange={setCreatePricingModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Model Pricing</DialogTitle>
            <DialogDescription>
              Add pricing configuration for a new model.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="price-model-id" className="text-right">Model ID</Label>
              <Input
                id="price-model-id"
                placeholder="e.g., gpt-4-turbo"
                className="col-span-3"
                value={newPricing.model_id}
                onChange={(e) => setNewPricing({ ...newPricing, model_id: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="price-model-name" className="text-right">Display Name</Label>
              <Input
                id="price-model-name"
                placeholder="e.g., GPT-4 Turbo"
                className="col-span-3"
                value={newPricing.model_name || ''}
                onChange={(e) => setNewPricing({ ...newPricing, model_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="price-input" className="text-right">Input ($/1K)</Label>
              <Input
                id="price-input"
                type="number"
                step="0.0001"
                min="0"
                placeholder="0.0000"
                className="col-span-3"
                value={newPricing.input_price_per_1k === 0 ? "" : newPricing.input_price_per_1k}
                onChange={(e) => setNewPricing({ ...newPricing, input_price_per_1k: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="price-output" className="text-right">Output ($/1K)</Label>
              <Input
                id="price-output"
                type="number"
                step="0.0001"
                min="0"
                placeholder="0.0000"
                className="col-span-3"
                value={newPricing.output_price_per_1k === 0 ? "" : newPricing.output_price_per_1k}
                onChange={(e) => setNewPricing({ ...newPricing, output_price_per_1k: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="price-date" className="text-right">Effective Date</Label>
              <Input
                id="price-date"
                type="date"
                className="col-span-3"
                value={newPricing.effective_date}
                onChange={(e) => setNewPricing({ ...newPricing, effective_date: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePricingModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreatePricing} disabled={creatingPricing}>
              {creatingPricing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Add Pricing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
