"use client"

/**
 * Mobile Navigation Overlay
 *
 * Flat grouped navigation matching desktop sidebar.
 * Full dark mode support. Theme toggle in footer.
 *
 * Navigation data sourced from lib/nav-data.ts (shared with sidebar).
 */

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import Image from "next/image"
import {
  X,
  Building2,
  HelpCircle,
  LogOut,
  Minus,
  Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { getOrgDetails } from "@/actions/organization-locale"
import {
  getNavGroups,
  orgRoutes,
  formatOrgName,
  getUserInitials,
} from "@/lib/nav-data"

interface MobileNavProps {
  isOpen: boolean
  onClose: () => void
  orgSlug: string
  orgName: string
  userName: string
  userEmail: string
  userRole: string
}

export function MobileNav({
  isOpen,
  onClose,
  orgSlug,
  orgName,
  userName,
  userEmail,
  userRole,
}: MobileNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const formattedOrgName = formatOrgName(orgName)
  const navGroups = getNavGroups(orgSlug, userRole)
  const routes = orgRoutes(orgSlug)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }

  useEffect(() => {
    let isMounted = true
    const fetchLogo = async () => {
      try {
        const result = await getOrgDetails(orgSlug)
        if (isMounted && result.success && result.org?.logoUrl) {
          setLogoUrl(result.org.logoUrl)
        }
      } catch {}
    }
    fetchLogo()
    return () => { isMounted = false }
  }, [orgSlug])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [isOpen])

  const handleNavigation = (href: string) => {
    router.push(href)
    setTimeout(() => onClose(), 150)
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const isActive = (path: string, exact = false) => {
    if (!pathname) return false
    if (exact) return pathname === path
    return pathname === path || pathname.startsWith(path + "/")
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

      {/* Navigation Panel */}
      <div className="absolute inset-y-0 left-0 w-[280px] bg-[var(--surface-primary)] shadow-xl flex flex-col animate-in slide-in-from-left duration-200 z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg overflow-hidden bg-[var(--surface-primary)] border border-[var(--border-medium)] shadow-sm flex items-center justify-center flex-shrink-0">
              {logoUrl ? (
                <Image src={logoUrl} alt={formattedOrgName} width={36} height={36} className="object-contain" />
              ) : (
                <Building2 className="h-4 w-4 text-[var(--text-muted)]" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-black text-[var(--text-primary)] tracking-wide uppercase leading-tight truncate">
                {formattedOrgName}
              </p>
              <p className="text-[length:var(--text-xs)] font-semibold text-[var(--text-muted)] tracking-wider uppercase leading-tight">
                Cost Analytics
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
          >
            <X className="h-5 w-5 text-[var(--text-tertiary)]" />
          </button>
        </div>

        {/* Navigation Content */}
        <div className="flex-1 overflow-y-auto py-1">
          {navGroups.map((group) => {
            const isGroupCollapsed = collapsedGroups.has(group.label)
            return (
              <div key={group.id}>
                {/* Group Label with toggle */}
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full px-4 pt-4 pb-2 flex items-center justify-between group cursor-pointer"
                >
                  <span className="text-[length:var(--text-xs)] font-semibold text-[var(--text-muted)] tracking-wide">
                    {group.label}
                  </span>
                  <span className="text-[var(--text-muted)] group-hover:text-[var(--text-tertiary)] transition-colors">
                    {isGroupCollapsed
                      ? <Plus className="h-3.5 w-3.5" />
                      : <Minus className="h-3.5 w-3.5" />
                    }
                  </span>
                </button>

                {/* Group Items */}
                {!isGroupCollapsed && (
                  <div className="px-2 pb-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const active = isActive(item.href.split("?")[0], item.exactMatch)

                      return (
                        <button
                          key={item.href}
                          type="button"
                          onClick={() => handleNavigation(item.href)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors rounded-lg min-h-[42px]",
                            active
                              ? "bg-[var(--cloudact-mint)]/15 text-[var(--text-primary)] font-semibold"
                              : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                          )}
                        >
                          <Icon className={cn(
                            "h-4 w-4 flex-shrink-0",
                            active ? "text-[#16a34a]" : ""
                          )} />
                          <span className="text-sm">{item.title}</span>
                          {item.badge && (
                            <span className="ml-auto rounded-full bg-[var(--cloudact-coral)]/10 px-1.5 py-0.5 text-[length:var(--text-xs)] font-medium text-[var(--cloudact-coral)]">
                              {item.badge}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border-subtle)] p-4 space-y-3">
          {/* User Info */}
          <button
            type="button"
            onClick={() => handleNavigation(routes.profile)}
            className={cn(
              "w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors min-h-[44px]",
              isActive(routes.profile)
                ? "bg-[var(--surface-secondary)]"
                : "hover:bg-[var(--surface-hover)]"
            )}
          >
            <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)]">
              <span className="text-[var(--cloudact-mint-text)] text-[length:var(--text-xs)] font-semibold">
                {getUserInitials(userName)}
              </span>
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{userName}</p>
              <p className="text-xs text-[var(--text-tertiary)] truncate">{userEmail}</p>
            </div>
          </button>

          {/* Actions */}
          <div className="flex gap-2">
            <Link
              href="/user-docs"
              target="_blank"
              className="flex-1 flex items-center justify-center gap-2 h-10 px-3 text-[length:var(--text-xs)] font-medium text-[var(--text-secondary)] bg-[var(--surface-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] rounded-lg transition-colors"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Help
            </Link>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex-1 flex items-center justify-center gap-2 h-10 px-3 text-[length:var(--text-xs)] font-medium text-[var(--text-tertiary)] bg-[var(--surface-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)] rounded-lg transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              {isLoggingOut ? "..." : "Sign Out"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
