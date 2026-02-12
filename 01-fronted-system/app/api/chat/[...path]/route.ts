/**
 * Chat Backend Proxy API Route
 *
 * Proxies REST calls from browser to 07-org-chat-backend (internal-only service).
 * SECURITY: Authenticates via Supabase session server-side.
 * Never trusts client-provided credentials — validates server-side.
 *
 * Routes proxied:
 *   POST /api/chat/{org_slug}/send             → POST /api/v1/chat/{org_slug}/send
 *   POST /api/chat/{org_slug}/stream           → POST /api/v1/chat/{org_slug}/stream (SSE)
 *   GET  /api/chat/{org_slug}/conversations     → GET  /api/v1/chat/{org_slug}/conversations
 *   GET  /api/chat/{org_slug}/conversations/{id}/messages → GET /api/v1/chat/{org_slug}/conversations/{id}/messages
 *   GET  /api/chat/{org_slug}/messages/search?q=... → GET /api/v1/chat/{org_slug}/messages/search?q=...
 *   GET  /api/chat/{org_slug}/settings/status   → GET  /api/v1/chat/{org_slug}/settings/status
 *   PATCH /api/chat/{org_slug}/conversations/{id}/rename → PATCH /api/v1/chat/{org_slug}/conversations/{id}/rename
 */

import { NextRequest, NextResponse } from "next/server"
import { getAuthContext } from "@/lib/auth-cache"

const CHAT_BACKEND_URL = process.env.CHAT_BACKEND_URL || process.env.NEXT_PUBLIC_CHAT_BACKEND_URL || "http://localhost:8002"

function extractOrgSlug(pathSegments: string[]): string | null {
  // pathSegments = ["org_slug", "send"] or ["org_slug", "conversations", ...]
  return pathSegments[0] || null
}

function isStreamEndpoint(pathSegments: string[]): boolean {
  // pathSegments = ["org_slug", "stream"]
  return pathSegments.length === 2 && pathSegments[1] === "stream"
}

async function proxyRequest(request: NextRequest, method: string) {
  try {
    const url = new URL(request.url)
    // path after /api/chat/ e.g. "org_slug/send" or "org_slug/conversations"
    const pathMatch = url.pathname.replace(/^\/api\/chat\//, "")
    const pathSegments = pathMatch.split("/").filter(Boolean)

    const orgSlug = extractOrgSlug(pathSegments)
    if (!orgSlug || !/^[a-z0-9_]{3,50}$/.test(orgSlug)) {
      return NextResponse.json(
        { error: "Invalid or missing org_slug" },
        { status: 400 }
      )
    }

    // Server-side auth: validate user session and get org API key
    const authCtx = await getAuthContext(orgSlug)
    if (!authCtx?.apiKey || !authCtx?.auth?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized: invalid session or org membership" },
        { status: 401 }
      )
    }

    // Build backend URL with query parameters preserved
    const backendPath = `/api/v1/chat/${pathSegments.join("/")}`
    const backendUrl = new URL(`${CHAT_BACKEND_URL}${backendPath}`)
    // Forward query parameters (e.g., ?q=search_term)
    url.searchParams.forEach((value, key) => {
      backendUrl.searchParams.set(key, value)
    })

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Org-Slug": orgSlug,
      "X-API-Key": authCtx.apiKey,
      "X-User-Id": authCtx.auth.user.id,
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    }

    if (method === "POST" || method === "PATCH") {
      try {
        const body = await request.json()
        fetchOptions.body = JSON.stringify(body)
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON in request body" },
          { status: 400 }
        )
      }
    }

    const response = await fetch(backendUrl.toString(), fetchOptions)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: "Chat backend request failed" }))
      return NextResponse.json(
        { error: errorData.detail || errorData.message || "Request failed" },
        { status: response.status }
      )
    }

    // SSE streaming: pass through the stream directly
    if (isStreamEndpoint(pathSegments) && response.body) {
      return new Response(response.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { error: "Failed to connect to chat backend" },
      { status: 502 }
    )
  }
}

export async function GET(request: NextRequest) {
  return proxyRequest(request, "GET")
}

export async function POST(request: NextRequest) {
  return proxyRequest(request, "POST")
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request, "DELETE")
}

export async function PATCH(request: NextRequest) {
  return proxyRequest(request, "PATCH")
}
