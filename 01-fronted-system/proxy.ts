/**
 * Proxy for Route Protection (Next.js 16+)
 *
 * !!! IMPORTANT FOR AI AGENTS !!!
 * - Next.js 16+ uses proxy.ts, NOT middleware.ts
 * - DO NOT create a middleware.ts file - it will conflict with this file
 * - Session refresh logic is in: ./lib/supabase/middleware.ts (utility, not Next.js middleware)
 * - @see https://nextjs.org/docs/messages/middleware-to-proxy
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
 * @see 00-requirements-docs/05_SECURITY.md for full security documentation
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
    "/demo-components",
    "/pagination-demo",
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

  // Run Supabase session update for protected routes
  const response = await updateSession(request)

  // Add pathname header for layout to use (avoids extra headers() call)
  if (response.headers) {
    response.headers.set("x-pathname", path)
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|csv|ico|json|webmanifest|xml|txt|woff|woff2)$).*)"],
}
