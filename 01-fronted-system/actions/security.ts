"use server"

import { createServiceRoleClient } from "@/lib/supabase/server"
import { headers } from "next/headers"

/**
 * Security Actions Module
 *
 * Provides:
 * - IP-based rate limiting for auth routes
 * - Security event logging
 * - Account lockout checks
 *
 * All functions use service_role client to bypass RLS.
 */

// ============================================
// Rate Limiting Configuration
// ============================================

interface RateLimitConfig {
  maxRequests: number
  windowSeconds: number
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  login: { maxRequests: 5, windowSeconds: 300 }, // 5 attempts per 5 minutes
  signup: { maxRequests: 3, windowSeconds: 600 }, // 3 attempts per 10 minutes
  forgot_password: { maxRequests: 3, windowSeconds: 600 }, // 3 attempts per 10 minutes
}

// ============================================
// Client Info Extraction
// ============================================

export async function getClientInfo(): Promise<{
  ip: string
  userAgent: string
}> {
  const headersList = await headers()

  // Get IP address (check various headers for proxied requests)
  const forwardedFor = headersList.get("x-forwarded-for")
  const realIp = headersList.get("x-real-ip")
  const cfConnectingIp = headersList.get("cf-connecting-ip") // Cloudflare

  let ip = "unknown"
  if (cfConnectingIp) {
    ip = cfConnectingIp
  } else if (forwardedFor) {
    // x-forwarded-for can be comma-separated, take the first (original client)
    ip = forwardedFor.split(",")[0].trim()
  } else if (realIp) {
    ip = realIp
  }

  const userAgent = headersList.get("user-agent") || "unknown"

  return { ip, userAgent }
}

// ============================================
// Rate Limiting Functions
// ============================================

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetInSeconds: number
  message?: string
}

/**
 * Check rate limit for auth actions (login, signup, forgot_password)
 * Uses IP-based limiting since user isn't authenticated yet.
 */
export async function checkAuthRateLimit(
  action: "login" | "signup" | "forgot_password",
  email?: string
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[action]
  if (!config) {
    return { allowed: true, remaining: 999, resetInSeconds: 0 }
  }

  try {
    const { ip } = await getClientInfo()
    const supabase = createServiceRoleClient()

    // Check rate limit via DB function
    const { data, error } = await supabase.rpc("check_auth_rate_limit", {
      p_ip_address: ip,
      p_action_type: action,
      p_max_requests: config.maxRequests,
      p_window_seconds: config.windowSeconds,
      p_email: email || null,
    })

    if (error) {
      console.error("[checkAuthRateLimit] DB error:", error)
      // On error, allow the request (fail open for availability)
      return { allowed: true, remaining: config.maxRequests, resetInSeconds: config.windowSeconds }
    }

    const allowed = data === true

    // Get remaining attempts
    const { data: remaining } = await supabase.rpc("get_auth_rate_limit_remaining", {
      p_ip_address: ip,
      p_action_type: action,
      p_max_requests: config.maxRequests,
      p_window_seconds: config.windowSeconds,
    })

    return {
      allowed,
      remaining: remaining ?? 0,
      resetInSeconds: config.windowSeconds,
      message: allowed
        ? undefined
        : `Too many ${action} attempts. Please try again in ${Math.ceil(config.windowSeconds / 60)} minutes.`,
    }
  } catch (err) {
    console.error("[checkAuthRateLimit] Error:", err)
    // Fail open
    return { allowed: true, remaining: config.maxRequests, resetInSeconds: config.windowSeconds }
  }
}

// ============================================
// Security Event Logging
// ============================================

export type SecurityEventType =
  | "login_failed"
  | "login_success"
  | "signup_failed"
  | "signup_success"
  | "password_reset_requested"
  | "password_reset_completed"
  | "rate_limit_exceeded"
  | "suspicious_activity"
  | "session_expired"
  | "invalid_token"
  | "account_locked"
  | "account_unlocked"
  | "mfa_failed"
  | "mfa_success"
  | "api_key_invalid"
  | "permission_denied"

export type SecuritySeverity = "info" | "warning" | "error" | "critical"

export interface SecurityEventInput {
  eventType: SecurityEventType
  severity?: SecuritySeverity
  message?: string
  userId?: string
  email?: string
  orgId?: string
  orgSlug?: string
  metadata?: Record<string, unknown>
}

/**
 * Log a security event to the security_events table.
 * Automatically captures IP address and user agent from request headers.
 */
export async function logSecurityEvent(input: SecurityEventInput): Promise<string | null> {
  try {
    const { ip, userAgent } = await getClientInfo()
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase.rpc("log_security_event", {
      p_event_type: input.eventType,
      p_severity: input.severity || "info",
      p_message: input.message || null,
      p_user_id: input.userId || null,
      p_email: input.email || null,
      p_ip_address: ip,
      p_user_agent: userAgent,
      p_org_id: input.orgId || null,
      p_org_slug: input.orgSlug || null,
      p_metadata: input.metadata || {},
    })

    if (error) {
      console.error("[logSecurityEvent] DB error:", error)
      return null
    }

    return data as string
  } catch (err) {
    console.error("[logSecurityEvent] Error:", err)
    return null
  }
}

// ============================================
// Account Lockout Functions
// ============================================

export interface AccountLockStatus {
  locked: boolean
  lockedUntil?: Date
  failedAttempts: number
}

/**
 * Check if an account is locked due to too many failed login attempts.
 */
export async function checkAccountLocked(email: string): Promise<AccountLockStatus> {
  try {
    const supabase = createServiceRoleClient()

    const { data: isLocked, error: lockError } = await supabase.rpc("is_account_locked", {
      p_email: email.toLowerCase(),
    })

    if (lockError) {
      console.error("[checkAccountLocked] DB error:", lockError)
      return { locked: false, failedAttempts: 0 }
    }

    // Get profile details for more info
    const { data: profile } = await supabase
      .from("profiles")
      .select("failed_login_attempts, locked_until")
      .eq("email", email.toLowerCase())
      .single()

    return {
      locked: isLocked === true,
      lockedUntil: profile?.locked_until ? new Date(profile.locked_until) : undefined,
      failedAttempts: profile?.failed_login_attempts ?? 0,
    }
  } catch (err) {
    console.error("[checkAccountLocked] Error:", err)
    return { locked: false, failedAttempts: 0 }
  }
}

/**
 * Record a failed login attempt. Returns true if account is now locked.
 */
export async function recordFailedLogin(
  email: string,
  maxAttempts: number = 5,
  lockoutMinutes: number = 15
): Promise<boolean> {
  try {
    const supabase = createServiceRoleClient()

    const { data: shouldLock, error } = await supabase.rpc("increment_failed_login", {
      p_email: email.toLowerCase(),
      p_max_attempts: maxAttempts,
      p_lockout_minutes: lockoutMinutes,
    })

    if (error) {
      console.error("[recordFailedLogin] DB error:", error)
      return false
    }

    // If account was locked, log security event
    if (shouldLock === true) {
      await logSecurityEvent({
        eventType: "account_locked",
        severity: "warning",
        email: email.toLowerCase(),
        message: `Account locked after ${maxAttempts} failed login attempts`,
        metadata: { lockoutMinutes },
      })
    }

    return shouldLock === true
  } catch (err) {
    console.error("[recordFailedLogin] Error:", err)
    return false
  }
}

/**
 * Reset failed login attempts after successful login.
 */
export async function resetFailedLogin(email: string): Promise<void> {
  try {
    const supabase = createServiceRoleClient()

    const { error } = await supabase.rpc("reset_failed_login", {
      p_email: email.toLowerCase(),
    })

    if (error) {
      console.error("[resetFailedLogin] DB error:", error)
    }
  } catch (err) {
    console.error("[resetFailedLogin] Error:", err)
  }
}

// ============================================
// Combined Auth Security Check
// ============================================

export interface AuthSecurityCheckResult {
  allowed: boolean
  reason?: string
  rateLimitRemaining?: number
  accountLocked?: boolean
  lockedUntil?: Date
}

/**
 * Combined security check for login attempts.
 * Checks both rate limiting and account lockout.
 */
export async function checkLoginSecurity(email: string): Promise<AuthSecurityCheckResult> {
  // Check rate limiting first
  const rateLimit = await checkAuthRateLimit("login", email)
  if (!rateLimit.allowed) {
    // Log rate limit exceeded
    await logSecurityEvent({
      eventType: "rate_limit_exceeded",
      severity: "warning",
      email,
      message: "Login rate limit exceeded",
    })

    return {
      allowed: false,
      reason: rateLimit.message,
      rateLimitRemaining: rateLimit.remaining,
    }
  }

  // Check account lockout
  const lockStatus = await checkAccountLocked(email)
  if (lockStatus.locked) {
    return {
      allowed: false,
      reason: `Account temporarily locked. Try again after ${lockStatus.lockedUntil?.toLocaleTimeString() || "15 minutes"}.`,
      accountLocked: true,
      lockedUntil: lockStatus.lockedUntil,
    }
  }

  return {
    allowed: true,
    rateLimitRemaining: rateLimit.remaining,
  }
}

/**
 * Handle login failure - record attempt and log event.
 */
export async function handleLoginFailure(email: string, reason: string): Promise<void> {
  // Record failed attempt (may trigger lockout)
  const accountLocked = await recordFailedLogin(email)

  // Log the failure
  await logSecurityEvent({
    eventType: "login_failed",
    severity: accountLocked ? "warning" : "info",
    email,
    message: reason,
    metadata: { accountLocked },
  })
}

/**
 * Handle login success - reset counters and log event.
 */
export async function handleLoginSuccess(email: string, userId: string): Promise<void> {
  // Reset failed login attempts
  await resetFailedLogin(email)

  // Log success
  await logSecurityEvent({
    eventType: "login_success",
    severity: "info",
    email,
    userId,
    message: "Successful login",
  })
}
