import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If Supabase is not configured, allow the request to continue
  // (login page will show appropriate error)
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  try {
    // Refresh session if expired - this can throw if refresh token is invalid
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    // If auth error (invalid refresh token, expired session, etc.), clear cookies and redirect to login
    if (error) {
      console.error("[Middleware] Auth error:", error.message, error.code)

      // Clear all Supabase auth cookies to prevent repeated errors
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      url.searchParams.set("redirectTo", request.nextUrl.pathname)
      url.searchParams.set("reason", "session_expired")

      const response = NextResponse.redirect(url)

      // Clear auth cookies - look for Supabase auth cookies
      const cookiesToClear = request.cookies.getAll().filter(
        (c) => c.name.startsWith("sb-") || c.name.includes("supabase")
      )
      cookiesToClear.forEach((cookie) => {
        response.cookies.delete(cookie.name)
      })

      return response
    }

    // If no user and trying to access protected route, redirect to login
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      url.searchParams.set("redirectTo", request.nextUrl.pathname)
      return NextResponse.redirect(url)
    }

    // User is authenticated, continue with the refreshed session
    return supabaseResponse
  } catch (error) {
    // Catch any unexpected errors during auth (network errors, etc.)
    console.error("[Middleware] Unexpected auth error:", error)

    // Clear cookies and redirect to login
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("redirectTo", request.nextUrl.pathname)
    url.searchParams.set("reason", "auth_error")

    const response = NextResponse.redirect(url)

    // Clear auth cookies
    const cookiesToClear = request.cookies.getAll().filter(
      (c) => c.name.startsWith("sb-") || c.name.includes("supabase")
    )
    cookiesToClear.forEach((cookie) => {
      response.cookies.delete(cookie.name)
    })

    return response
  }
}
