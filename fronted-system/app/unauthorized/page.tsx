import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ShieldAlert } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function UnauthorizedPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Try to find user's org
  const { data: memberData } = await supabase
    .from("organization_members")
    .select("org_id, organizations(org_slug)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single()

  let userOrgSlug = null
  if (memberData && memberData.organizations) {
    const org = memberData.organizations as any
    userOrgSlug = org.org_slug
  }

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-[500px] space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Access Denied</h1>
            <p className="text-muted-foreground">You don't have permission to access this organization</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>What happened?</CardTitle>
            <CardDescription>You attempted to access an organization that you're not a member of.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              If you believe this is an error, please contact the organization administrator to request access.
            </p>
            <div className="flex flex-col gap-2">
              {userOrgSlug ? (
                <Button asChild>
                  <Link href={`/${userOrgSlug}/dashboard`}>Go to My Dashboard</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/onboarding/organization">Create Organization</Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href="/login">Sign Out</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
