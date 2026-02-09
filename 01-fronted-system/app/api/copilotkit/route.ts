/**
 * CopilotKit Runtime API Route
 *
 * Proxies requests from the CopilotKit frontend SDK to 07-org-chat-backend.
 * SECURITY: Authenticates via Supabase session server-side.
 * Never trusts client-provided X-Org-Slug or X-API-Key headers.
 */

import { NextRequest, NextResponse } from "next/server"
import { getAuthContext } from "@/lib/auth-cache"

const CHAT_BACKEND_URL = process.env.NEXT_PUBLIC_CHAT_BACKEND_URL || "http://localhost:8002"

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Get org_slug from request, then authenticate server-side
    const clientOrgSlug = request.headers.get("X-Org-Slug") || ""
    if (!clientOrgSlug || !/^[a-z0-9_]{3,50}$/.test(clientOrgSlug)) {
      return NextResponse.json(
        { error: "Invalid or missing X-Org-Slug header" },
        { status: 400 }
      )
    }

    // Server-side auth: validate user session and get org API key
    const authCtx = await getAuthContext(clientOrgSlug)
    if (!authCtx?.apiKey || !authCtx?.auth?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized: invalid session or org membership" },
        { status: 401 }
      )
    }

    const body = await request.json()

    // Forward to chat backend with SERVER-VALIDATED credentials (not client headers)
    const response = await fetch(`${CHAT_BACKEND_URL}/copilotkit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Org-Slug": clientOrgSlug,
        "X-API-Key": authCtx.apiKey,
        "X-User-Id": authCtx.auth.user.id,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: "Chat backend request failed" },
        { status: response.status }
      )
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
