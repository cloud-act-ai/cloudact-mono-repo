import { NextRequest, NextResponse } from "next/server"
import { confirmAccountDeletion } from "@/actions/account"

// Token validation - must be base64 format and reasonable length
const isValidToken = (token: string): boolean => {
  if (!token || token.length < 20 || token.length > 500) return false
  // Check for base64 or hex format (common for tokens)
  return /^[a-zA-Z0-9_\-+/=]+$/.test(token)
}

// GET renders a confirmation page that submits via POST (CSRF-safe)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get("token")

  if (!token || !isValidToken(token)) {
    return NextResponse.redirect(
      new URL("/login?error=invalid_deletion_token", request.url)
    )
  }

  // Render a minimal confirmation page that auto-submits via POST
  const html = `<!DOCTYPE html>
<html><head><title>Confirm Account Deletion</title>
<style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#fafafa}
.card{background:white;padding:2rem;border-radius:1rem;box-shadow:0 2px 8px rgba(0,0,0,0.1);text-align:center;max-width:400px}
button{background:#FF6C5E;color:white;border:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;margin-top:1rem}
button:hover{background:#e55a4d}a{color:#666;text-decoration:none;display:block;margin-top:1rem;font-size:13px}</style></head>
<body><div class="card">
<h2>Confirm Account Deletion</h2>
<p style="color:#666;font-size:14px">This action is permanent and cannot be undone.</p>
<form method="POST" action="/api/account/delete">
<input type="hidden" name="token" value="${token.replace(/"/g, '&quot;')}" />
<button type="submit">Delete My Account</button>
</form>
<a href="/login">Cancel</a>
</div></body></html>`

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  })
}

// POST performs the actual deletion (CSRF-safe: requires form submission)
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const token = formData.get("token") as string

    if (!token || !isValidToken(token)) {
      return NextResponse.redirect(
        new URL("/login?error=invalid_deletion_token", request.url)
      )
    }

    const result = await confirmAccountDeletion(token)

    if (!result.success) {
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
