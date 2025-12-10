/**
 * Proxy for Route Protection (Next.js 16+)
 *
 * SECURITY MEASURES IMPLEMENTED:
 * 1. Public Routes: Explicit whitelist of unauthenticated paths
 * 2. Nested Path Handling: /invite/[token], /onboarding/organization supported
 * 3. Session Validation: Supabase session check for protected routes
 * 4. Static Asset Bypass: _next/static, images excluded via matcher
 *
 * PUBLIC ROUTES:
 * - Landing: /, /features, /pricing, /solutions, /about, /contact, etc.
 * - Auth: /login, /signup, /forgot-password, /reset-password
 * - Onboarding: /onboarding, /invite, /unauthorized
 *
 * @see docs/SECURITY.md for full security documentation
 */

import { updateSession } from "@/lib/supabase/middleware"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname

  const publicPaths = [
    "/",
    "/features",
    "/pricing",
    "/solutions",
    "/integrations",
    "/resources",
    "/about",
    "/contact",
    "/security",
    "/user-docs",
    "/privacy",
    "/terms",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/invite",
    "/onboarding",
    "/unauthorized",
  ]

  // Check if path is a public path or starts with a public path prefix
  // This handles both exact matches (e.g., /login) and nested paths (e.g., /invite/[token])
  const isPublicPath = publicPaths.includes(path) ||
    publicPaths.some((publicPath) => path.startsWith(publicPath + "/"))

  // Skip middleware for public paths, auth callbacks, and API routes
  if (
    isPublicPath ||
    path.startsWith("/auth/") ||
    path.startsWith("/api/")
  ) {
    return NextResponse.next()
  }

  // Only run Supabase session update for protected routes
  return await updateSession(request)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|csv)$).*)"],
}
