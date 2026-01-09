/**
 * Cost Preview Card
 * Shows calculated total cost and monthly rate
 */

import { Card, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/i18n"
import { calculateTotalCost, calculateMonthlyCost, type FormDataWithAudit } from "./shared"

interface CostPreviewCardProps {
  formData: FormDataWithAudit
}

export function CostPreviewCard({ formData }: CostPreviewCardProps) {
  if (!formData.unit_price || formData.unit_price <= 0) {
    return null
  }

  const basePrice = formData.unit_price ?? 0
  const totalCost = calculateTotalCost(basePrice, formData.pricing_model, formData.seats)
  const monthlyCost = calculateMonthlyCost(totalCost, formData.billing_cycle)

  return (
    <Card className="bg-[#90FCA6]/5 border-border">
      <CardContent className="pt-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Cost Preview</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Total Cost:</span>
              <span className="ml-2 font-semibold text-[#FF6C5E]">
                {formatCurrency(totalCost, formData.currency || "USD")}
                /{formData.billing_cycle || "monthly"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Monthly Rate:</span>
              <span className="ml-2 font-semibold">
                {formatCurrency(monthlyCost, formData.currency || "USD")}
                /month
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
