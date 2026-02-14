/**
 * Pricing Section
 * Unit price, billing cycle, pricing model, and currency fields
 */

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SUPPORTED_CURRENCIES, getCurrencySymbol } from "@/lib/i18n"
import type { BillingCycle } from "@/actions/subscription-providers"
import type { FormDataWithAudit } from "./shared"

interface PricingSectionProps {
  formData: FormDataWithAudit
  setFormData: (data: FormDataWithAudit) => void
  orgCurrency: string
  error: string | null
  setError: (error: string | null) => void
  submitting: boolean
}

export function PricingSection({
  formData,
  setFormData,
  orgCurrency,
  error,
  setError,
  submitting,
}: PricingSectionProps) {
  return (
    <>
      {/* Price and Billing Cycle */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="space-y-2">
          <Label htmlFor="unit_price">Unit Price *</Label>
          <div className="relative">
            <Input
              id="unit_price"
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00"
              value={formData.unit_price ?? ""}
              onFocus={(e) => {
                if (error && error.includes("price")) {
                  setError(null)
                }
                e.target.select()
                const input = e.target as HTMLInputElement
                if (input.value) {
                  setTimeout(() => input.setSelectionRange(0, input.value.length), 0)
                }
              }}
              onChange={(e) => {
                const value = e.target.value
                if (value === "") {
                  setFormData({ ...formData, unit_price: undefined as any })
                } else {
                  const parsed = parseFloat(value)
                  if (!isNaN(parsed) && parsed >= 0) {
                    setFormData({ ...formData, unit_price: parsed })
                  }
                }
              }}
              onBlur={(e) => {
                if (e.target.value === "" || formData.unit_price === undefined) {
                  setFormData({ ...formData, unit_price: 0 })
                }
              }}
              disabled={submitting}
              required
              className="pl-8"
              data-testid="unit-price-input"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {SUPPORTED_CURRENCIES.find(c => c.code === formData.currency)?.symbol || "$"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Price in {formData.currency}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="billing_cycle">Billing Cycle *</Label>
          <Select
            value={formData.billing_cycle}
            onValueChange={(value) => setFormData({ ...formData, billing_cycle: value as BillingCycle })}
            disabled={submitting}
            required
          >
            <SelectTrigger id="billing_cycle">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="annual">Annual</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Pricing Model and Currency */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="space-y-2">
          <Label htmlFor="pricing_model">Pricing Model *</Label>
          <Select
            value={formData.pricing_model}
            onValueChange={(value) => setFormData({ ...formData, pricing_model: value as 'PER_SEAT' | 'FLAT_FEE' })}
            disabled={submitting}
            required
          >
            <SelectTrigger id="pricing_model">
              <SelectValue placeholder="Select pricing model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FLAT_FEE">Flat Fee</SelectItem>
              <SelectItem value="PER_SEAT">Per Seat</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <div className="flex items-center h-10 px-3 rounded-md border border-border bg-[#90FCA6]/5 text-foreground">
            <span className="font-medium">{formData.currency}</span>
            <span className="ml-2 text-muted-foreground">
              ({getCurrencySymbol(formData.currency || orgCurrency)})
            </span>
            <span className="ml-auto text-xs text-muted-foreground">Locked to org default</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Currency is set to your organization's default ({orgCurrency}) for consistent reporting.
          </p>
        </div>
      </div>

      {/* Seats */}
      <div className="space-y-2">
        <Label htmlFor="seats">Seats *</Label>
        <Input
          id="seats"
          type="number"
          min={0}
          max={10000}
          step="1"
          placeholder="1"
          value={formData.seats ?? ""}
          onFocus={(e) => {
            if (error && error.includes("seat")) {
              setError(null)
            }
            e.target.select()
            const input = e.target as HTMLInputElement
            if (input.value) {
              setTimeout(() => input.setSelectionRange(0, input.value.length), 0)
            }
          }}
          onChange={(e) => {
            const value = e.target.value
            if (value === "") {
              setFormData({ ...formData, seats: undefined as any })
            } else {
              const parsed = parseInt(value, 10)
              if (!isNaN(parsed) && parsed >= 0 && parsed <= 10000) {
                setFormData({ ...formData, seats: parsed })
              }
            }
          }}
          onBlur={(e) => {
            if (e.target.value === "" || formData.seats === undefined) {
              const defaultSeats = formData.pricing_model === 'PER_SEAT' ? 1 : 0
              setFormData({ ...formData, seats: defaultSeats })
            }
          }}
          disabled={submitting}
          required
          data-testid="seats-input"
        />
        <p className="text-xs text-muted-foreground">
          {formData.pricing_model === 'PER_SEAT'
            ? 'Number of seats for this subscription (minimum 1 for per-seat plans)'
            : 'Number of seats for tracking purposes'}
        </p>
      </div>
    </>
  )
}
