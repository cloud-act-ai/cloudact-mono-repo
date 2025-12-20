"use client"

/**
 * BigQuery-Style Mobile Header
 *
 * Matches the sidebar design with:
 * - Logo + Org Name (logo from URL or Building2 fallback)
 * - Clean, compact styling
 * - Hamburger menu toggle
 */

import { useSidebar } from "@/components/ui/sidebar"
import { Menu, X, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { UserMenu } from "@/components/user-menu"
import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { getOrgDetails } from "@/actions/organization-locale"

// Format org name: "guruInc_11242025" → "Guru Inc"
function formatOrgName(name: string): string {
  const withoutDate = name.replace(/_\d{8}$/, "")
  const acronymPatterns = [
    { pattern: /saas/gi, replacement: "SaaS" },
    { pattern: /\bapi\b/gi, replacement: "API" },
    { pattern: /\bai\b/gi, replacement: "AI" },
    { pattern: /\bllm\b/gi, replacement: "LLM" },
    { pattern: /\bgcp\b/gi, replacement: "GCP" },
    { pattern: /\baws\b/gi, replacement: "AWS" },
  ]
  let processed = withoutDate.replace(/[_-]/g, " ")
  for (const { pattern, replacement } of acronymPatterns) {
    processed = processed.replace(pattern, replacement)
  }
  processed = processed.replace(/([a-z])([A-Z])/g, "$1 $2")
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
  const { openMobile, setOpenMobile } = useSidebar()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const formattedOrgName = formatOrgName(orgName)

  // Fetch org logo
  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const result = await getOrgDetails(orgSlug)
        if (result.success && result.org?.logoUrl) {
          setLogoUrl(result.org.logoUrl)
        }
      } catch (error) {
        console.error("Failed to fetch org logo:", error)
      }
    }
    fetchLogo()
  }, [orgSlug])

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-[#E5E5EA] bg-white px-4 md:hidden">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpenMobile(!openMobile)}
          className="h-9 w-9 text-[#1C1C1E] hover:bg-[#007A78]/5 focus:ring-2 focus:ring-[#007A78] focus:ring-offset-2"
          aria-label={openMobile ? "Close menu" : "Open menu"}
          aria-expanded={openMobile}
        >
          {openMobile ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </Button>

        {/* Logo + Org Name - matches sidebar header */}
        <Link
          href={`/${orgSlug}/cost-dashboards/overview`}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md overflow-hidden bg-gradient-to-br from-[#007A78] to-[#14B8A6]">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={formattedOrgName}
                width={32}
                height={32}
                className="object-contain"
              />
            ) : (
              <Building2 className="h-4 w-4 text-white" />
            )}
          </div>
          <span className="text-[14px] font-semibold text-[#1C1C1E] truncate max-w-[140px]">
            {formattedOrgName}
          </span>
        </Link>
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
