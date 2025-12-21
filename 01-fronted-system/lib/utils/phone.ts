/**
 * Phone number validation utilities
 *
 * Provides country-specific phone number validation with length checks.
 *
 * Used in:
 * - Signup form (app/signup/page.tsx)
 */

// Phone number length requirements by country code
const PHONE_LENGTH_BY_COUNTRY: Record<string, { min: number; max: number }> = {
  "+1": { min: 10, max: 10 }, // US/Canada
  "+91": { min: 10, max: 10 }, // India
  "+44": { min: 10, max: 11 }, // UK
  "+61": { min: 9, max: 9 }, // Australia
  "+49": { min: 10, max: 11 }, // Germany
  "+33": { min: 9, max: 9 }, // France
  "+81": { min: 10, max: 10 }, // Japan
  "+86": { min: 11, max: 11 }, // China
  "+65": { min: 8, max: 8 }, // Singapore
  "+971": { min: 9, max: 9 }, // UAE
  "+55": { min: 10, max: 11 }, // Brazil
  "+52": { min: 10, max: 10 }, // Mexico
  "+7": { min: 10, max: 10 }, // Russia/Kazakhstan
}

/**
 * Validate phone number with country-specific rules
 *
 * @param phone - Phone number (allows formatting like spaces, dashes, parens)
 * @param countryCode - Country code (e.g., "+1", "+91")
 * @returns true if valid, false otherwise
 */
export function isValidPhone(phone: string, countryCode: string): boolean {
  // Extract digits only (allows formatting like spaces, dashes, parens)
  const digitsOnly = phone.replace(/\D/g, "")

  // Must have at least some digits
  if (digitsOnly.length === 0) return false

  // Get expected length for this country code
  const expected = PHONE_LENGTH_BY_COUNTRY[countryCode] || { min: 7, max: 15 }

  return digitsOnly.length >= expected.min && digitsOnly.length <= expected.max
}

/**
 * Get expected phone format hint for country
 *
 * @param countryCode - Country code (e.g., "+1", "+91")
 * @returns Hint text like "10 digits" or "9-11 digits"
 */
export function getPhoneHint(countryCode: string): string {
  const expected = PHONE_LENGTH_BY_COUNTRY[countryCode]
  if (!expected) return "7-15 digits"
  if (expected.min === expected.max) return `${expected.min} digits`
  return `${expected.min}-${expected.max} digits`
}
