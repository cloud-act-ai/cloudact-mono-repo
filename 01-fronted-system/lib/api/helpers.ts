/**
 * API Helper Functions
 *
 * Shared utilities for API calls and date handling.
 */

/**
 * Get the API service URL from environment variables
 */
export function getApiServiceUrl(): string {
  return process.env.NEXT_PUBLIC_API_SERVICE_URL || "http://localhost:8000"
}

/**
 * Get the Pipeline service URL from environment variables
 */
export function getPipelineServiceUrl(): string {
  return process.env.NEXT_PUBLIC_PIPELINE_SERVICE_URL || "http://localhost:8001"
}

/**
 * Fetch with timeout wrapper
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Get today's date in UTC (YYYY-MM-DD format)
 */
export function getTodayDateUTC(): string {
  const now = new Date()
  return now.toISOString().split("T")[0]
}

/**
 * Get the first day of the current month in UTC (YYYY-MM-DD format)
 */
export function getMonthStartUTC(): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}-01`
}

/**
 * Get the last day of the current month in UTC (YYYY-MM-DD format)
 */
export function getMonthEndUTC(): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const lastDay = new Date(Date.UTC(year, month + 1, 0))
  return lastDay.toISOString().split("T")[0]
}

/**
 * Format date to ISO string (YYYY-MM-DD)
 */
export function formatDateISO(date: Date): string {
  return date.toISOString().split("T")[0]
}
