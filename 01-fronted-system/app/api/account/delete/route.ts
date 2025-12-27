import { NextRequest, NextResponse } from "next/server"
import { confirmAccountDeletion } from "@/actions/account"

// Token validation - must be base64 format and reasonable length
const isValidToken = (token: string): boolean => {
  if (!token || token.length < 20 || token.length > 500) return false
  // Check for base64 or hex format (common for tokens)
  return /^[a-zA-Z0-9_\-+/=]+$/.test(token)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get("token")

    if (!token || !isValidToken(token)) {
      return NextResponse.redirect(
        new URL("/login?error=invalid_deletion_token", request.url)
      )
    }

    const result = await confirmAccountDeletion(token)

    if (!result.success) {
      // Redirect to login with error
      const errorMessage = encodeURIComponent(result.error || "Failed to delete account")
      return NextResponse.redirect(
        new URL(`/login?deletion_error=${errorMessage}`, request.url)
      )
    }

    // Success - redirect to login with success message
    return NextResponse.redirect(
      new URL("/login?account_deleted=true", request.url)
    )
  } catch {
    return NextResponse.redirect(
      new URL("/login?error=deletion_failed", request.url)
    )
  }
}
