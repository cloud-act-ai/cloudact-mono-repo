/**
 * Dates and Notes Section
 * Start date, end date (optional) pickers and notes field
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
  endDate?: Date | undefined
  setEndDate?: (date: Date | undefined) => void
  error: string | null
  setError: (error: string | null) => void
  submitting: boolean
}

export function DatesNotesSection({
  formData,
  setFormData,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  error,
  setError,
  submitting,
}: DatesNotesSectionProps) {
  // Validate end date is after start date
  const isEndDateValid = !endDate || !startDate || endDate >= startDate

  return (
    <>
      {/* Date Fields Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            Can be in the past for backdated subscriptions.
          </p>
        </div>

        {/* End Date (Optional) */}
        {setEndDate && (
          <div className="space-y-2">
            <Label>End Date (optional)</Label>
            <DatePicker
              date={endDate}
              onSelect={(date) => {
                if (error && error.includes("end date")) {
                  setError(null)
                }
                setEndDate(date)
              }}
              placeholder="No end date"
              disabled={submitting}
              showPresets={true}
              data-testid="end-date-picker"
            />
            {!isEndDateValid && (
              <p className="text-xs text-[#FF6C5E]">
                End date must be after start date.
              </p>
            )}
            {isEndDateValid && (
              <p className="text-xs text-muted-foreground">
                Leave empty for ongoing subscriptions.
              </p>
            )}
          </div>
        )}
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
