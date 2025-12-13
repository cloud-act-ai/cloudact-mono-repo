"use client"

import { useSidebar } from "@/components/ui/sidebar"
import { BarChart3, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { UserMenu } from "@/components/user-menu"

interface MobileHeaderProps {
  orgName: string
  orgSlug: string
  user?: {
    email: string
    full_name?: string
    avatar_url?: string
  }
  userRole?: string
}

export function MobileHeader({ orgName, orgSlug, user, userRole }: MobileHeaderProps) {
  const { openMobile, setOpenMobile } = useSidebar()

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-[#E5E5EA] bg-white/95 backdrop-blur-md px-4 md:hidden shadow-sm">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpenMobile(!openMobile)}
          className="h-9 w-9 text-[#007A78] hover:bg-[#007A78]/10 hover:text-[#005F5D] focus:ring-2 focus:ring-[#007A78] focus:ring-offset-2"
          aria-label={openMobile ? "Close menu" : "Open menu"}
          aria-expanded={openMobile}
        >
          {openMobile ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </Button>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#007A78] to-[#14B8A6] shadow-sm">
            <BarChart3 className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-[#007A78] truncate max-w-[140px]">{orgName}</span>
        </div>
      </div>

      {/* User Menu - Only show if user data is provided */}
      {user && (
        <UserMenu
          user={user}
          orgSlug={orgSlug}
          userRole={userRole}
          className="h-9 w-9"
        />
      )}
    </header>
  )
}
