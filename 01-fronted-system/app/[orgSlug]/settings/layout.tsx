"use client"

import { usePathname, useParams } from "next/navigation"
import Link from "next/link"
import {
  User,
  Building2,
  CreditCard,
  Network,
  UserPlus,
  Shield,
} from "lucide-react"

const settingsNav = [
  { id: "personal", label: "Personal", icon: User, href: "personal" },
  { id: "organization", label: "Organization", icon: Building2, href: "organization" },
  { id: "billing", label: "Billing", icon: CreditCard, href: "billing" },
  { id: "hierarchy", label: "Hierarchy", icon: Network, href: "hierarchy" },
  { id: "invite", label: "Team", icon: UserPlus, href: "invite" },
  { id: "security", label: "Security", icon: Shield, href: "security" },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const getCurrentSection = () => {
    const path = pathname.split("/").pop()
    return settingsNav.find(nav => nav.href === path)?.id || "personal"
  }

  const currentSection = getCurrentSection()

  return (
    <div className="min-h-screen bg-white relative">
      {/* Premium gradient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[400px] -right-[200px] w-[800px] h-[800px] rounded-full bg-gradient-to-br from-[#90FCA6]/8 via-transparent to-transparent blur-3xl" />
        <div className="absolute -bottom-[300px] -left-[200px] w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-[#FF6C5E]/5 via-transparent to-transparent blur-3xl" />
      </div>

      {/* Mobile Settings Header - Only visible on mobile */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-b border-black/[0.04]">
        <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
          {settingsNav.map((item) => {
            const isActive = currentSection === item.id
            const Icon = item.icon

            return (
              <Link
                key={item.id}
                href={`/${orgSlug}/settings/${item.href}`}
                className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-[#90FCA6] text-black font-semibold shadow-sm"
                    : "bg-black/[0.04] text-black/60 hover:bg-black/[0.06]"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[13px]">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="relative min-h-screen pt-16 lg:pt-0">
        <div className="max-w-5xl mx-auto px-6 py-8 lg:py-12">
          {children}
        </div>
      </main>
    </div>
  )
}
