import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Log an error and return a user-friendly error message.
 * Used in server actions to standardize error handling.
 */
export function logError(context: string, error: unknown): string {
  const message = error instanceof Error ? error.message : "An unexpected error occurred"
  console.error(`[${context}]`, error)
  return message
}
