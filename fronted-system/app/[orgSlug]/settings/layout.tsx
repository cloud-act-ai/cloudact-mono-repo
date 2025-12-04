"use client"

import { useParams, usePathname } from "next/navigation"
import Link from "next/link"
import { User, Shield, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useState, useEffect } from "react"

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const pathname = usePathname()
  const orgSlug = params.orgSlug as string

  const [userRole, setUserRole] = useState<string | null>(null)
  const isOwner = userRole === "owner"

  useEffect(() => {
    const fetchUserRole = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: membership } = await supabase
        .from("organization_members")
        .select("role, organizations!inner(org_slug)")
        .eq("user_id", user.id)
        .eq("organizations.org_slug", orgSlug)
        .single()

      if (membership) {
        setUserRole(membership.role)
      }
    }
    fetchUserRole()
  }, [orgSlug])

  const isActive = (path: string) => pathname === path

  // Don't show settings nav tabs on pages accessed from sidebar
  const isMembersPage = pathname.includes("/settings/members")
  const isIntegrationsPage = pathname.includes("/settings/integrations")
  const isOnboardingPage = pathname.includes("/settings/onboarding")
  const showSettingsNav = !isMembersPage && !isIntegrationsPage && !isOnboardingPage

  const navItems = [
    {
      href: `/${orgSlug}/settings/profile`,
      label: "Personal",
      icon: User,
      show: true,
    },
    {
      href: `/${orgSlug}/settings/security`,
      label: "Security",
      icon: Shield,
      show: true,
    },
    {
      href: `/${orgSlug}/settings/danger`,
      label: "Danger",
      icon: AlertTriangle,
      show: true,
      danger: true,
    },
  ]

  const visibleNavItems = navItems.filter(item => item.show)

  return (
    <div className="space-y-6">
      {showSettingsNav && (
        <>
          <div>
            <h1 className="console-page-title">Settings</h1>
            <p className="console-subheading mt-1">
              Manage your personal account, organization, and security settings
            </p>
          </div>

          {/* Navigation Tabs - CloudAct Style with Teal/Coral */}
          <div className="console-tabs">
            {visibleNavItems.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-state={active ? "active" : "inactive"}
                  className={cn(
                    "console-tab flex items-center gap-2",
                    item.danger && "text-[#FF6E50] hover:text-[#FF6E50]",
                    item.danger && active && "text-[#FF6E50] border-b-[#FF6E50]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </>
      )}

      {/* Page Content */}
      {children}
    </div>
  )
}
