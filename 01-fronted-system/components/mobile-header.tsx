"use client"

/**
 * Mobile Header with Navigation Overlay
 *
 * Clean header for mobile with:
 * - Hamburger menu toggle
 * - Org logo and name
 * - Full-screen navigation overlay (contains user profile)
 */

import { useState, useEffect } from "react"
import { Menu, Building2, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import Link from "next/link"
import { getOrgDetails } from "@/actions/organization-locale"
import { MobileNav } from "@/components/mobile-nav"
import { formatOrgName, orgRoutes } from "@/lib/nav-data"

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
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const formattedOrgName = formatOrgName(orgName)
  const routes = orgRoutes(orgSlug)

  // Fetch org logo
  useEffect(() => {
    let isMounted = true

    const fetchLogo = async () => {
      try {
        const result = await getOrgDetails(orgSlug)
        if (isMounted && result.success && result.org?.logoUrl) {
          setLogoUrl(result.org.logoUrl)
        }
      } catch (logoError) {
        // Non-critical: logo fetch failed, component will show fallback icon
        if (process.env.NODE_ENV === "development") {
          console.warn("[MobileHeader] Failed to fetch org logo:", logoError)
        }
      }
    }
    fetchLogo()

    return () => {
      isMounted = false
    }
  }, [orgSlug])

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--surface-primary)] px-4 md:hidden pt-[env(safe-area-inset-top,0px)]">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsNavOpen(true)}
            className="h-10 w-10 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Logo + Org Name */}
          <Link
            href={routes.home}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg overflow-hidden bg-[var(--surface-primary)] border border-[var(--border-medium)] shadow-sm">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={formattedOrgName}
                  width={32}
                  height={32}
                  className="object-contain"
                />
              ) : (
                <Building2 className="h-4 w-4 text-[var(--text-muted)]" />
              )}
            </div>
            <span className="text-[12px] font-semibold text-[var(--text-primary)] truncate max-w-[120px]">
              {formattedOrgName}
            </span>
          </Link>
        </div>

        {/* Chat shortcut */}
        <Link
          href={routes.chat}
          className="h-10 w-10 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Open chat"
        >
          <MessageSquare className="h-5 w-5" />
        </Link>
      </header>

      {/* Mobile Navigation Overlay */}
      <MobileNav
        isOpen={isNavOpen}
        onClose={() => setIsNavOpen(false)}
        orgSlug={orgSlug}
        orgName={orgName}
        userName={user?.full_name || user?.email?.split("@")[0] || "User"}
        userEmail={user?.email || ""}
        userRole={userRole || "member"}
      />
    </>
  )
}
