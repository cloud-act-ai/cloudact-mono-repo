/**
 * Template Conversion Info Card
 * Shows audit trail when form is pre-filled from template
 */

import { Card, CardContent } from "@/components/ui/card"
import type { FormDataWithAudit } from "./shared"

interface TemplateConversionCardProps {
  formData: FormDataWithAudit
  isFromTemplate: boolean
}

export function TemplateConversionCard({ formData, isFromTemplate }: TemplateConversionCardProps) {
  if (!isFromTemplate || !formData.source_currency || formData.source_price === undefined) {
    return null
  }

  const sourcePriceFormatted = formData.source_price.toFixed(2)
  const exchangeRateFormatted = formData.exchange_rate_used ? formData.exchange_rate_used.toFixed(4) : null

  return (
    <Card className="bg-[#90FCA6]/5 border-[#90FCA6]/20">
      <CardContent className="pt-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-[#1a7a3a]">Template Price Converted</p>
          <p className="text-sm text-[#1a7a3a]">
            Original template price: <span className="font-semibold">${sourcePriceFormatted} {formData.source_currency}</span>
            {exchangeRateFormatted && formData.exchange_rate_used !== 1 && (
              <span className="text-slate-500 ml-2">
                (rate: {exchangeRateFormatted})
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500">
            This price has been automatically converted to your organization&apos;s currency ({formData.currency}).
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
