/**
 * User-Friendly Error Message Mapping
 *
 * FIX GAP-007: Maps technical error messages to user-friendly equivalents
 * Prevents exposing database errors, stack traces, and internal details to users
 *
 * Usage:
 *   const friendlyMessage = getUserFriendlyError(technicalError)
 */

interface ErrorMapping {
  keywords: string[]
  message: string
  supportNeeded: boolean
}

const ERROR_MAPPINGS: ErrorMapping[] = [
  // ===== Database Errors =====
  {
    keywords: ["duplicate key", "unique constraint", "already exists"],
    message: "This organization already exists. If you believe this is an error, please contact support.",
    supportNeeded: true,
  },
  {
    keywords: ["relation", "does not exist", "table"],
    message: "System setup incomplete. Please contact support to complete initialization.",
    supportNeeded: true,
  },
  {
    keywords: ["dataset", "bigquery", "not found"],
    message: "Workspace initialization failed. Please try again or contact support.",
    supportNeeded: true,
  },
  {
    keywords: ["foreign key", "constraint", "violates"],
    message: "Data validation error. Please contact support.",
    supportNeeded: true,
  },
  {
    keywords: ["permission denied", "access denied", "insufficient privileges"],
    message: "Access denied. Please verify your account permissions or contact support.",
    supportNeeded: true,
  },

  // ===== Network Errors =====
  {
    keywords: ["fetch failed", "network error", "ENOTFOUND"],
    message: "Connection error. Please check your internet connection and try again.",
    supportNeeded: false,
  },
  {
    keywords: ["ECONNREFUSED", "connection refused", "ETIMEDOUT"],
    message: "Unable to reach our servers. Please try again in a moment.",
    supportNeeded: false,
  },
  {
    keywords: ["timeout", "timed out", "request timeout"],
    message: "Request timed out. Please try again.",
    supportNeeded: false,
  },
  {
    keywords: ["502", "503", "bad gateway", "service unavailable"],
    message: "Our servers are temporarily busy. Please try again in a few moments.",
    supportNeeded: false,
  },

  // ===== Authentication Errors =====
  {
    keywords: ["not authenticated", "auth", "session expired"],
    message: "Your session expired. Please sign in again.",
    supportNeeded: false,
  },
  {
    keywords: ["unauthorized", "forbidden", "not allowed"],
    message: "Access denied. Please verify your account.",
    supportNeeded: false,
  },
  {
    keywords: ["invalid token", "token expired", "jwt"],
    message: "Authentication error. Please sign in again.",
    supportNeeded: false,
  },

  // ===== Stripe/Payment Errors =====
  {
    keywords: ["checkout session not found", "session expired"],
    message: "Payment session expired. Please start over from the billing page.",
    supportNeeded: false,
  },
  {
    keywords: ["subscription not found", "stripe subscription"],
    message: "Subscription not found. Please contact support.",
    supportNeeded: true,
  },
  {
    keywords: ["payment failed", "card declined", "insufficient funds"],
    message: "Payment failed. Please check your payment method and try again.",
    supportNeeded: false,
  },
  {
    keywords: ["invalid price", "price not found"],
    message: "Selected plan is no longer available. Please choose a different plan.",
    supportNeeded: false,
  },

  // ===== Validation Errors =====
  {
    keywords: ["invalid", "validation", "format"],
    message: "Invalid input. Please check your information and try again.",
    supportNeeded: false,
  },
  {
    keywords: ["required", "missing", "cannot be empty"],
    message: "Please fill in all required fields.",
    supportNeeded: false,
  },
  {
    keywords: ["too long", "exceeds maximum", "length"],
    message: "Input is too long. Please shorten and try again.",
    supportNeeded: false,
  },
  {
    keywords: ["too short", "minimum length"],
    message: "Input is too short. Please provide more information.",
    supportNeeded: false,
  },

  // ===== Rate Limiting =====
  {
    keywords: ["rate limit", "too many requests", "throttle"],
    message: "Too many requests. Please wait a moment and try again.",
    supportNeeded: false,
  },

  // ===== Backend/API Errors =====
  {
    keywords: ["internal server error", "500"],
    message: "An error occurred on our end. Please try again or contact support if the issue persists.",
    supportNeeded: true,
  },
  {
    keywords: ["not configured", "missing configuration"],
    message: "System configuration error. Please contact support.",
    supportNeeded: true,
  },

  // ===== Bootstrap/System Errors =====
  {
    keywords: ["bootstrap", "initialization", "system setup"],
    message: "System initialization in progress. Please try again in a few moments.",
    supportNeeded: false,
  },
  {
    keywords: ["tables missing", "incomplete setup"],
    message: "System setup incomplete. Please contact support.",
    supportNeeded: true,
  },
]

const DEFAULT_ERROR_MESSAGE = "Something went wrong. Please try again or contact support if the issue persists."

/**
 * Convert a technical error message to a user-friendly message
 *
 * @param technicalError - Raw error message from backend/database/network
 * @returns User-friendly error message
 */
export function getUserFriendlyError(technicalError: string | undefined | null): string {
  if (!technicalError || typeof technicalError !== "string") {
    return DEFAULT_ERROR_MESSAGE
  }

  const lowerError = technicalError.toLowerCase()

  // Find first matching error mapping
  for (const mapping of ERROR_MAPPINGS) {
    if (mapping.keywords.some(keyword => lowerError.includes(keyword.toLowerCase()))) {
      return mapping.message
    }
  }

  // No specific mapping found - return default
  return DEFAULT_ERROR_MESSAGE
}

/**
 * Check if an error requires support intervention
 *
 * @param technicalError - Raw error message
 * @returns true if user should contact support, false if they can retry
 */
export function errorNeedsSupport(technicalError: string | undefined | null): boolean {
  if (!technicalError || typeof technicalError !== "string") {
    return false // Unknown errors are retryable by default
  }

  const lowerError = technicalError.toLowerCase()

  for (const mapping of ERROR_MAPPINGS) {
    if (mapping.keywords.some(keyword => lowerError.includes(keyword.toLowerCase()))) {
      return mapping.supportNeeded
    }
  }

  return false // Default: assume retryable
}

/**
 * Get a complete error response for display
 *
 * @param technicalError - Raw error message
 * @returns Object with friendly message, retry flag, and support flag
 */
export function getErrorDetails(technicalError: string | undefined | null): {
  message: string
  isRetryable: boolean
  needsSupport: boolean
} {
  const message = getUserFriendlyError(technicalError)
  const needsSupport = errorNeedsSupport(technicalError)

  return {
    message,
    isRetryable: !needsSupport,
    needsSupport,
  }
}
