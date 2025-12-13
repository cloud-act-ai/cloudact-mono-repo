"use client"

import { useParams, usePathname } from "next/navigation"
import Link from "next/link"
import { User, Shield, AlertTriangle, Globe } from "lucide-react"
import { cn } from "@/lib/utils"

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const pathname = usePathname()
  const orgSlug = params.orgSlug as string

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
      color: "#8E8E93", // Neutral
    },
    {
      href: `/${orgSlug}/settings/organization`,
      label: "Organization",
      icon: Globe,
      show: true,
      color: "#007A78", // Teal for organization
    },
    {
      href: `/${orgSlug}/settings/security`,
      label: "Security",
      icon: Shield,
      show: true,
      color: "#8E8E93", // Neutral
    },
    {
      href: `/${orgSlug}/settings/danger`,
      label: "Danger",
      icon: AlertTriangle,
      show: true,
      danger: true,
      color: "#FF6E50", // Coral for danger
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

          {/* Navigation Tabs - CloudAct Style with Neutral/Teal/Coral */}
          <div className="console-tabs">
            {visibleNavItems.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              const isTeal = item.color === "#007A78"
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-state={active ? "active" : "inactive"}
                  className={cn(
                    "console-tab flex items-center gap-2",
                    item.danger && "text-[#FF6E50] hover:text-[#FF6E50]",
                    item.danger && active && "text-[#FF6E50] border-b-[#FF6E50]",
                    isTeal && "text-[#007A78] hover:text-[#007A78]",
                    isTeal && active && "text-[#007A78] border-b-[#007A78]",
                    !item.danger && !isTeal && "text-[#8E8E93]",
                    !item.danger && !isTeal && active && "text-[#8E8E93] border-b-[#8E8E93]"
                  )}
                >
                  <Icon className="h-4 w-4" style={{ color: item.color }} />
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
