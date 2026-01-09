/**
 * Dates and Notes Section
 * Start date picker and notes field
 */

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import type { FormDataWithAudit } from "./shared"

interface DatesNotesSectionProps {
  formData: FormDataWithAudit
  setFormData: (data: FormDataWithAudit) => void
  startDate: Date | undefined
  setStartDate: (date: Date | undefined) => void
  error: string | null
  setError: (error: string | null) => void
  submitting: boolean
}

export function DatesNotesSection({
  formData,
  setFormData,
  startDate,
  setStartDate,
  error,
  setError,
  submitting,
}: DatesNotesSectionProps) {
  return (
    <>
      {/* Start Date */}
      <div className="space-y-2">
        <Label>Start Date *</Label>
        <DatePicker
          date={startDate}
          onSelect={(date) => {
            if (error && (error.includes("date") || error.includes("past"))) {
              setError(null)
            }
            setStartDate(date)
          }}
          placeholder="Select start date"
          disabled={submitting}
          showPresets={true}
          data-testid="start-date-picker"
        />
        <p className="text-xs text-muted-foreground">
          Can be in the past for backdated subscriptions. Historical costs will be calculated automatically.
        </p>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Input
          id="notes"
          placeholder="e.g., Team subscription for design team"
          maxLength={500}
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          disabled={submitting}
        />
      </div>
    </>
  )
}
