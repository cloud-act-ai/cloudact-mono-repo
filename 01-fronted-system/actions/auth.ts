"use server"

import { createClient } from "@/lib/supabase/server"
import {
  checkLoginSecurity,
  handleLoginFailure,
  handleLoginSuccess,
  checkAuthRateLimit,
  logSecurityEvent,
} from "./security"

/**
 * Auth Server Actions
 *
 * Server-side authentication actions with integrated security:
 * - Rate limiting
 * - Account lockout
 * - Security event logging
 */

// ============================================
// Types
// ============================================

export interface LoginResult {
  success: boolean
  error?: string
  userId?: string
  redirectTo?: string
  rateLimitRemaining?: number
}

export interface SignupResult {
  success: boolean
  error?: string
  userId?: string
  rateLimitRemaining?: number
}

export interface ForgotPasswordResult {
  success: boolean
  error?: string
  rateLimitRemaining?: number
}

// ============================================
// Login Action
// ============================================

/**
 * Server-side login with security checks.
 * Includes rate limiting, account lockout, and security logging.
 */
export async function loginWithSecurity(
  email: string,
  password: string
): Promise<LoginResult> {
  const normalizedEmail = email.trim().toLowerCase()

  // Security checks (rate limiting + account lockout)
  const securityCheck = await checkLoginSecurity(normalizedEmail)
  if (!securityCheck.allowed) {
    return {
      success: false,
      error: securityCheck.reason || "Too many login attempts",
      rateLimitRemaining: securityCheck.rateLimitRemaining,
    }
  }

  try {
    const supabase = await createClient()

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (authError) {
      // Record failed login attempt
      await handleLoginFailure(normalizedEmail, authError.message)

      return {
        success: false,
        error: "Invalid email or password",
        rateLimitRemaining: securityCheck.rateLimitRemaining,
      }
    }

    if (!authData.user) {
      await handleLoginFailure(normalizedEmail, "No user returned")

      return {
        success: false,
        error: "Login failed",
        rateLimitRemaining: securityCheck.rateLimitRemaining,
      }
    }

    // Record successful login
    await handleLoginSuccess(normalizedEmail, authData.user.id)

    // Update last login timestamp (non-blocking)
    void (async () => {
      try {
        await supabase.rpc("update_last_login", { p_user_id: authData.user.id })
      } catch {
        // Ignore errors
      }
    })()

    // Determine redirect destination
    const { data: orgData } = await supabase
      .from("organization_members")
      .select(`org_id, organizations!inner(org_slug)`)
      .eq("user_id", authData.user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle()

    let redirectTo = "/onboarding/billing"
    if (orgData?.organizations) {
      const orgs = orgData.organizations
      const org = Array.isArray(orgs) ? orgs[0] : orgs
      if (org && typeof org === "object" && "org_slug" in org && typeof org.org_slug === "string") {
        redirectTo = `/${org.org_slug}/dashboard`
      }
    }

    return {
      success: true,
      userId: authData.user.id,
      redirectTo,
      rateLimitRemaining: securityCheck.rateLimitRemaining,
    }
  } catch (err) {
    console.error("[loginWithSecurity] Error:", err)
    await handleLoginFailure(normalizedEmail, "Unexpected error")

    return {
      success: false,
      error: "An unexpected error occurred",
    }
  }
}

// ============================================
// Signup Rate Limit Check
// ============================================

/**
 * Check signup rate limit before proceeding.
 * Call this from client-side before signup attempt.
 */
export async function checkSignupRateLimit(email?: string): Promise<{
  allowed: boolean
  error?: string
  remaining?: number
}> {
  const rateLimit = await checkAuthRateLimit("signup", email)

  if (!rateLimit.allowed) {
    await logSecurityEvent({
      eventType: "rate_limit_exceeded",
      severity: "warning",
      email,
      message: "Signup rate limit exceeded",
    })

    return {
      allowed: false,
      error: rateLimit.message,
      remaining: rateLimit.remaining,
    }
  }

  return {
    allowed: true,
    remaining: rateLimit.remaining,
  }
}

/**
 * Log signup success event.
 */
export async function logSignupSuccess(email: string, userId: string): Promise<void> {
  await logSecurityEvent({
    eventType: "signup_success",
    severity: "info",
    email,
    userId,
    message: "New user signup",
  })
}

/**
 * Log signup failure event.
 */
export async function logSignupFailure(email: string, reason: string): Promise<void> {
  await logSecurityEvent({
    eventType: "signup_failed",
    severity: "warning",
    email,
    message: reason,
  })
}

// ============================================
// Password Reset Rate Limit Check
// ============================================

/**
 * Check forgot password rate limit.
 */
export async function checkForgotPasswordRateLimit(email: string): Promise<{
  allowed: boolean
  error?: string
  remaining?: number
}> {
  const rateLimit = await checkAuthRateLimit("forgot_password", email)

  if (!rateLimit.allowed) {
    await logSecurityEvent({
      eventType: "rate_limit_exceeded",
      severity: "warning",
      email,
      message: "Password reset rate limit exceeded",
    })

    return {
      allowed: false,
      error: rateLimit.message,
      remaining: rateLimit.remaining,
    }
  }

  return {
    allowed: true,
    remaining: rateLimit.remaining,
  }
}

/**
 * Log password reset request.
 */
export async function logPasswordResetRequest(email: string): Promise<void> {
  await logSecurityEvent({
    eventType: "password_reset_requested",
    severity: "info",
    email,
    message: "Password reset requested",
  })
}

/**
 * Log password reset completion.
 */
export async function logPasswordResetComplete(email: string, userId?: string): Promise<void> {
  await logSecurityEvent({
    eventType: "password_reset_completed",
    severity: "info",
    email,
    userId,
    message: "Password reset completed",
  })
}
