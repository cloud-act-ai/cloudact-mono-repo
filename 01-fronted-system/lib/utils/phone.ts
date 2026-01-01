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

// Country-specific phone format patterns
const PHONE_FORMAT_BY_COUNTRY: Record<string, { pattern: number[]; placeholder: string }> = {
  "+1": { pattern: [3, 3, 4], placeholder: "555-123-4567" }, // US/Canada: XXX-XXX-XXXX
  "+91": { pattern: [5, 5], placeholder: "98765-43210" }, // India: XXXXX-XXXXX
  "+44": { pattern: [4, 3, 4], placeholder: "7911-123-4567" }, // UK: XXXX-XXX-XXXX
  "+61": { pattern: [3, 3, 3], placeholder: "412-345-678" }, // Australia: XXX-XXX-XXX
  "+49": { pattern: [3, 4, 4], placeholder: "151-1234-5678" }, // Germany: XXX-XXXX-XXXX
  "+33": { pattern: [1, 2, 2, 2, 2], placeholder: "6-12-34-56-78" }, // France: X-XX-XX-XX-XX
  "+81": { pattern: [3, 4, 4], placeholder: "090-1234-5678" }, // Japan: XXX-XXXX-XXXX
  "+86": { pattern: [3, 4, 4], placeholder: "138-1234-5678" }, // China: XXX-XXXX-XXXX
  "+65": { pattern: [4, 4], placeholder: "9123-4567" }, // Singapore: XXXX-XXXX
  "+971": { pattern: [2, 3, 4], placeholder: "50-123-4567" }, // UAE: XX-XXX-XXXX
  "+55": { pattern: [2, 5, 4], placeholder: "11-98765-4321" }, // Brazil: XX-XXXXX-XXXX
  "+52": { pattern: [3, 3, 4], placeholder: "555-123-4567" }, // Mexico: XXX-XXX-XXXX
  "+7": { pattern: [3, 3, 4], placeholder: "912-345-6789" }, // Russia: XXX-XXX-XXXX
}

/**
 * Format phone number based on country code
 *
 * @param value - Raw phone input
 * @param countryCode - Country code (e.g., "+1", "+91")
 * @returns Formatted phone number with dashes
 */
export function formatPhoneNumber(value: string, countryCode: string): string {
  // Remove all non-digits
  const digits = value.replace(/\D/g, "")

  // Get format pattern for country, default to generic 3-3-4
  const format = PHONE_FORMAT_BY_COUNTRY[countryCode] || { pattern: [3, 3, 4], placeholder: "" }
  const pattern = format.pattern

  // Build formatted string based on pattern
  let result = ""
  let digitIndex = 0

  for (let i = 0; i < pattern.length && digitIndex < digits.length; i++) {
    const groupSize = pattern[i]
    const group = digits.slice(digitIndex, digitIndex + groupSize)
    result += (result ? "-" : "") + group
    digitIndex += groupSize
  }

  return result
}

/**
 * Get placeholder for phone input based on country
 *
 * @param countryCode - Country code (e.g., "+1", "+91")
 * @returns Placeholder string
 */
export function getPhonePlaceholder(countryCode: string): string {
  const format = PHONE_FORMAT_BY_COUNTRY[countryCode]
  return format?.placeholder || "123-456-7890"
}
