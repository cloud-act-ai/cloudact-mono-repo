/**
 * Shared API Helper Functions
 *
 * Common utilities used across server actions for API calls.
 * Centralized here to avoid duplication and ensure consistency.
 */

// ============================================
// API URL Helpers
// ============================================

/**
 * Get the API service URL from environment.
 * Throws if not configured.
 */
export function getApiServiceUrl(): string {
  const url = process.env.API_SERVICE_URL || process.env.NEXT_PUBLIC_API_SERVICE_URL
  if (!url) {
    throw new Error("API_SERVICE_URL is not configured")
  }
  return url
}

// ============================================
// Fetch Helpers
// ============================================

/**
 * Fetch with timeout to prevent hanging requests.
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns Response from fetch
 * @throws Error if request times out
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 30000
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`)
    }
    throw error
  }
}

/**
 * Safely parse JSON response with error handling.
 * Returns fallback for empty responses, throws for parse errors.
 *
 * @param response - Fetch response object
 * @param fallback - Default value if response is empty
 * @returns Parsed JSON or fallback
 */
export async function safeJsonParse<T>(response: Response, fallback: T): Promise<T> {
  try {
    const text = await response.text()
    if (!text || text.trim() === "") {
      return fallback
    }
    // Size limit check (10MB)
    if (text.length > 10 * 1024 * 1024) {
      console.warn("Response body too large, returning fallback")
      return fallback
    }
    return JSON.parse(text) as T
  } catch (error) {
    console.error("Failed to parse JSON response:", error)
    throw new Error(
      `Failed to parse backend response: ${error instanceof Error ? error.message : "Invalid JSON"}`
    )
  }
}

// ============================================
// Date Helpers (UTC)
// ============================================

/**
 * Get today's date in YYYY-MM-DD format (UTC).
 * Uses UTC to match backend BigQuery queries.
 */
export function getTodayDateUTC(): string {
  return new Date().toISOString().split("T")[0]
}

/**
 * Get the first day of the current month in YYYY-MM-DD format (UTC).
 */
export function getMonthStartUTC(): string {
  const today = new Date()
  // Use UTC methods for consistency with backend
  return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-01`
}

/**
 * Check if a date string is in the past (before today UTC).
 *
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns true if date is before today (UTC)
 */
export function isDateInPastUTC(dateStr: string): boolean {
  const todayUTC = getTodayDateUTC()
  return dateStr < todayUTC
}

// ============================================
// Error Extraction
// ============================================

/**
 * Extract error message from various error response formats.
 *
 * @param errorText - Raw error text (may be JSON or plain text)
 * @returns Extracted error message
 */
export function extractErrorMessage(errorText: string): string {
  try {
    const json = JSON.parse(errorText)
    return json.detail || json.message || json.error || errorText
  } catch {
    return errorText
  }
}

// ============================================
// Validation Helpers
// ============================================

/**
 * Validate org slug format.
 * Must be 3-50 alphanumeric characters or underscores.
 */
export function isValidOrgSlug(slug: string): boolean {
  return /^[a-zA-Z0-9_]{3,50}$/.test(slug)
}

/**
 * Validate subscription ID format.
 * Subscription IDs should be alphanumeric with underscores/hyphens, 5-100 chars.
 */
export function isValidSubscriptionId(id: string): boolean {
  if (!id || typeof id !== "string") return false
  return /^[a-zA-Z0-9_-]{5,100}$/.test(id)
}
