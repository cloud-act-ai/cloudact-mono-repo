/**
 * Application constants
 */

// Trial period configuration
export const DEFAULT_TRIAL_DAYS = parseInt(
  process.env.NEXT_PUBLIC_DEFAULT_TRIAL_DAYS || "14",
  10
)

// API URLs
export const API_SERVICE_URL =
  process.env.NEXT_PUBLIC_API_SERVICE_URL || "http://localhost:8000"
export const PIPELINE_SERVICE_URL =
  process.env.NEXT_PUBLIC_PIPELINE_SERVICE_URL || "http://localhost:8001"
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
