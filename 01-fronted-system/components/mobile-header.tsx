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

function formatOrgName(name: string): string {
  // Strip trailing date suffix (e.g., "_01022026") for legacy slug-based names
  const withoutDate = name.replace(/_\d{8}$/, "")

  // If name looks like a proper name (contains spaces or mixed case), return as-is
  // This preserves intentional brand names like "CloudAct Inc", "OpenAI", etc.
  if (withoutDate.includes(" ") || /[a-z][A-Z]/.test(withoutDate)) {
    return withoutDate.trim()
  }

  // For legacy slug-based names (e.g., "acme_inc"), convert to readable format
  const acronymPatterns = [
    { pattern: /\bsaas\b/gi, replacement: "SaaS" },
    { pattern: /\bapi\b/gi, replacement: "API" },
    { pattern: /\bai\b/gi, replacement: "AI" },
    { pattern: /\bgenai\b/gi, replacement: "GenAI" },
    { pattern: /\bgcp\b/gi, replacement: "GCP" },
    { pattern: /\baws\b/gi, replacement: "AWS" },
  ]

  let processed = withoutDate.replace(/[_-]/g, " ")

  // Apply acronym replacements
  for (const { pattern, replacement } of acronymPatterns) {
    processed = processed.replace(pattern, replacement)
  }

  // Capitalize each word (for slug-based names only)
  const words = processed
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const isAcronym = acronymPatterns.some(
        ({ replacement }) => word === replacement || word.toUpperCase() === word
      )
      if (isAcronym) return word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(" ")

  return words
}

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
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 md:hidden pt-[env(safe-area-inset-top,0px)]">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsNavOpen(true)}
            className="h-10 w-10 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Logo + Org Name */}
          <Link
            href={`/${orgSlug}/cost-dashboards/overview`}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={formattedOrgName}
                  width={32}
                  height={32}
                  className="object-contain"
                />
              ) : (
                <Building2 className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              )}
            </div>
            <span className="text-[12px] font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[120px]">
              {formattedOrgName}
            </span>
          </Link>
        </div>

        {/* Chat shortcut */}
        <Link
          href={`/${orgSlug}/chat`}
          className="h-10 w-10 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
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
