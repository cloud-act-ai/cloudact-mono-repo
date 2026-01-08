/**
 * Route constants for consistent navigation
 */

export const ROUTES = {
  // Public routes
  HOME: "/",
  LOGIN: "/login",
  SIGNUP: "/signup",
  RESET_PASSWORD: "/reset-password",
  UNAUTHORIZED: "/unauthorized",

  // Onboarding
  ONBOARDING_BILLING: "/onboarding/billing",
  ONBOARDING_SUCCESS: "/onboarding/success",

  // Auth callbacks
  AUTH_CALLBACK: "/auth/callback",
  AUTH_SUCCESS: "/auth/success",

  // Settings
  SETTINGS_PERSONAL: "/settings/personal",
  SETTINGS_SECURITY: "/settings/security",

  // Dynamic routes (functions)
  orgDashboard: (orgSlug: string) => `/${orgSlug}/dashboard`,
  orgSettings: (orgSlug: string) => `/${orgSlug}/settings`,
  invite: (token: string) => `/invite/${token}`,
} as const

export type RouteKey = keyof typeof ROUTES
