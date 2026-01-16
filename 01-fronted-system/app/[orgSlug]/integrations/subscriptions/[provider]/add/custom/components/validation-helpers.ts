/**
 * Validation Helpers
 * Form validation logic extracted from main component
 */

import type { SelectedHierarchy } from "@/components/hierarchy/cascading-hierarchy-selector"
import type { FormDataWithAudit } from "./shared"

interface ValidationResult {
  isValid: boolean
  error?: string
}

/**
 * Validate form before submission
 */
export function validateForm(
  formData: FormDataWithAudit,
  startDate: Date | undefined,
  selectedHierarchy: SelectedHierarchy | null,
  orgCurrency: string,
  endDate?: Date | undefined
): ValidationResult {
  // Validate plan name
  if (!formData.plan_name || !formData.plan_name.trim()) {
    return { isValid: false, error: "Plan name is required" }
  }

  if (formData.plan_name.trim().length > 50) {
    return { isValid: false, error: "Plan name cannot exceed 50 characters" }
  }

  // Validate start date
  if (!startDate) {
    return { isValid: false, error: "Start date is required" }
  }

  // Validate end date if provided
  if (endDate && startDate && endDate < startDate) {
    return { isValid: false, error: "End date must be after start date" }
  }

  // Validate hierarchy selection (all levels required)
  if (!selectedHierarchy) {
    return { isValid: false, error: "Hierarchy assignment is required. Please select all hierarchy levels." }
  }
  if (!selectedHierarchy.entity_id || !selectedHierarchy.level_code || !selectedHierarchy.path) {
    return { isValid: false, error: "Incomplete hierarchy selection. Please select all hierarchy levels from top to bottom." }
  }

  // Ensure numeric fields have valid values before validation
  const finalUnitPrice = formData.unit_price ?? 0
  const finalSeats = formData.seats ?? (formData.pricing_model === 'PER_SEAT' ? 1 : 0)

  // Validate inputs
  if (finalUnitPrice < 0) {
    return { isValid: false, error: "Price cannot be negative" }
  }
  if (finalSeats < 0) {
    return { isValid: false, error: "Seats cannot be negative" }
  }
  // Validate seats for PER_SEAT plans
  if (formData.pricing_model === 'PER_SEAT' && finalSeats < 1) {
    return { isValid: false, error: "Per-seat plans require at least 1 seat" }
  }
  // Validate upper bound for seats
  if (finalSeats > 10000) {
    return { isValid: false, error: "Seats cannot exceed 10,000" }
  }

  // Validate currency matches org default
  if (formData.currency !== orgCurrency) {
    return { isValid: false, error: `Currency must match organization default (${orgCurrency})` }
  }

  return { isValid: true }
}

/**
 * Extract final validated values for submission
 */
export function getFinalValues(formData: FormDataWithAudit) {
  return {
    finalUnitPrice: formData.unit_price ?? 0,
    finalSeats: formData.seats ?? (formData.pricing_model === 'PER_SEAT' ? 1 : 0),
  }
}
