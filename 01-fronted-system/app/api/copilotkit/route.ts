/**
 * CopilotKit Runtime API Route
 *
 * This endpoint proxies requests from the CopilotKit frontend SDK
 * to the 07-org-chat-backend service via the AG-UI protocol.
 *
 * Currently a placeholder — will be implemented when CopilotKit
 * is added as a dependency for production streaming chat.
 */

import { NextRequest, NextResponse } from "next/server"

const CHAT_BACKEND_URL = process.env.NEXT_PUBLIC_CHAT_BACKEND_URL || "http://localhost:8002"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const response = await fetch(`${CHAT_BACKEND_URL}/copilotkit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Org-Slug": request.headers.get("X-Org-Slug") || "",
        "X-API-Key": request.headers.get("X-API-Key") || "",
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
