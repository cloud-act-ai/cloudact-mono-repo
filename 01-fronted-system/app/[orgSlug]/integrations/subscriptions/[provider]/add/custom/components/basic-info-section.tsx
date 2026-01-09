/**
 * Basic Information Section
 * Plan name and display name fields
 */

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { FormDataWithAudit } from "./shared"

interface BasicInfoSectionProps {
  formData: FormDataWithAudit
  setFormData: (data: FormDataWithAudit) => void
  error: string | null
  setError: (error: string | null) => void
  submitting: boolean
}

export function BasicInfoSection({
  formData,
  setFormData,
  error,
  setError,
  submitting,
}: BasicInfoSectionProps) {
  return (
    <>
      {/* Plan Name */}
      <div className="space-y-2">
        <Label htmlFor="plan_name">Plan Name *</Label>
        <Input
          id="plan_name"
          placeholder="e.g., Enterprise"
          maxLength={50}
          value={formData.plan_name}
          onChange={(e) => {
            if (error && error.includes("Plan name")) {
              setError(null)
            }
            setFormData({ ...formData, plan_name: e.target.value })
          }}
          disabled={submitting}
          required
          data-testid="plan-name-input"
        />
        <p className="text-xs text-muted-foreground">
          This will be converted to uppercase (e.g., ENTERPRISE). Max 50 characters.
        </p>
      </div>

      {/* Display Name */}
      <div className="space-y-2">
        <Label htmlFor="display_name">Display Name (optional)</Label>
        <Input
          id="display_name"
          placeholder="e.g., Enterprise Plan"
          maxLength={100}
          value={formData.display_name}
          onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
          disabled={submitting}
        />
      </div>
    </>
  )
}
