"use client"

/**
 * Dashboard Sidebar - matches mobile nav style
 *
 * Independent collapse (all sections open by default).
 * Plus/Minus toggles. Mint active state. Flat grouped navigation.
 *
 * Navigation data sourced from lib/nav-data.ts (shared with mobile-nav).
 *
 * Footer: User Profile, Get Help, Sign Out
 */

import type * as React from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  LogOut,
  Building2,
  HelpCircle,
  Minus,
  Plus,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { getOrgDetails } from "@/actions/organization-locale"
import {
  type SectionId,
  getNavGroups,
  orgRoutes,
  formatOrgName,
  getUserInitials,
  formatUserName,
} from "@/lib/nav-data"
import { ThemeToggle } from "@/components/theme-toggle"

interface DashboardSidebarProps extends React.ComponentProps<typeof Sidebar> {
  orgSlug: string
  orgName: string
  orgPlan: string
  billingStatus: string
  memberCount: number
  userRole: string
  userName: string
  userEmail: string
}

export function DashboardSidebar({
  orgSlug,
  orgName,
  orgPlan: _orgPlan,
  billingStatus: _billingStatus,
  memberCount: _memberCount,
  userRole,
  userName,
  userEmail,
  ...props
}: DashboardSidebarProps) {
  const pathname = usePathname()
  const [isLoading, setIsLoading] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoLoading, setLogoLoading] = useState(true)

  const navGroups = getNavGroups(orgSlug, userRole)
  const routes = orgRoutes(orgSlug)
  const allSectionIds = navGroups.map(g => g.id)
  const [openSections, setOpenSections] = useState<Set<SectionId>>(new Set(allSectionIds))

  const formattedOrgName = formatOrgName(orgName)
  const { state, toggleSidebar } = useSidebar()
  const isCollapsed = state === "collapsed"

  // Auto-expand the section matching current route
  useEffect(() => {
    if (!pathname) return

    let section: SectionId | null = null
    if (pathname.endsWith("/dashboard") || pathname.includes("/dashboard/")) {
      section = "dashboards"
    } else if (pathname.includes("/cost-dashboards")) {
      section = "cost-analytics"
    } else if (pathname.includes("/pipelines")) {
      section = "pipelines"
    } else if (pathname.includes("/integrations")) {
      section = "integrations"
    } else if (pathname.includes("/notifications")) {
      section = "notifications"
    } else if (pathname.includes("/chat")) {
      section = "chat"
    } else if (pathname.includes("/settings") || pathname.includes("/billing")) {
      section = "settings"
    }

    if (section) {
      setOpenSections(prev => {
        if (prev.has(section!)) return prev
        const next = new Set(prev)
        next.add(section!)
        return next
      })
    }
  }, [pathname])

  // Fetch org logo
  useEffect(() => {
    let isMounted = true

    const fetchLogo = async () => {
      if (!orgSlug) {
        if (isMounted) setLogoLoading(false)
        return
      }

      try {
        if (isMounted) setLogoLoading(true)
        const result = await getOrgDetails(orgSlug)
        if (isMounted && result.success && result.org?.logoUrl) {
          setLogoUrl(result.org.logoUrl)
        }
      } catch (error) {
        console.error("Failed to fetch org logo:", error)
      } finally {
        if (isMounted) setLogoLoading(false)
      }
    }
    fetchLogo()

    return () => {
      isMounted = false
    }
  }, [orgSlug])

  const handleLogout = async () => {
    setIsLoading(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    // AUTH-004/005: Server-side auth cache has 5-second TTL, no client-side clearing needed
    if (typeof window !== "undefined") window.location.href = "/login"
  }

  const toggleSection = (section: SectionId) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  // Active state helper
  const isActive = (path: string, exact = false) => {
    if (!pathname) return false
    if (exact) return pathname === path
    return pathname === path || pathname.startsWith(path + "/")
  }

  // Match mobile nav style: clean flat buttons with mint active state
  const itemClass = cn(
    "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors rounded-lg min-h-[42px]",
    "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]",
    "text-sm"
  )
  const activeItemClass = cn(
    "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors rounded-lg min-h-[42px]",
    "bg-[var(--cloudact-mint)]/15 text-[var(--text-primary)] font-semibold",
    "text-sm [&_svg]:text-[#16a34a]"
  )

  const SectionHeader = ({
    title,
    section,
    isExpanded,
    badge,
  }: {
    title: string
    section: SectionId
    isExpanded: boolean
    badge?: string
  }) => (
    <button
      onClick={() => toggleSection(section)}
      className="w-full px-4 pt-4 pb-2 flex items-center justify-between group cursor-pointer"
    >
      <span className="text-[length:var(--text-xs)] font-semibold text-[var(--text-muted)] tracking-wide">
        {title}
        {badge && (
          <span className="ml-2 rounded-full bg-[var(--cloudact-coral)]/10 px-1.5 py-0.5 text-[length:var(--text-xs)] font-medium text-[var(--cloudact-coral)]">
            {badge}
          </span>
        )}
      </span>
      <span className="text-[var(--text-muted)] group-hover:text-[var(--text-tertiary)] transition-colors">
        {isExpanded
          ? <Minus className="h-3.5 w-3.5" />
          : <Plus className="h-3.5 w-3.5" />
        }
      </span>
    </button>
  )

  return (
    <Sidebar collapsible="icon" className="border-r border-[var(--border-subtle)] bg-[var(--surface-primary)]" {...props}>
      {/* Header: Logo + Org Name + Toggle */}
      <div className={cn(
        "border-b border-[var(--border-subtle)] hidden md:block",
        isCollapsed ? "p-2 flex flex-col items-center gap-2" : "px-4 py-3"
      )}>
        {isCollapsed ? (
          <>
            {/* Collapsed: logo centered on top, toggle below */}
            <Link
              href={routes.home}
              className="hover:opacity-80 transition-opacity"
            >
              <div className={cn(
                "flex-shrink-0 rounded-lg overflow-hidden flex items-center justify-center",
                "h-8 w-8 border border-[var(--border-medium)] bg-[var(--surface-primary)] shadow-sm",
                "transition-all duration-200 hover:border-[var(--cloudact-mint)] hover:shadow-md"
              )}>
                {logoLoading ? (
                  <div className="h-4 w-4 animate-pulse bg-gray-100 rounded" />
                ) : logoUrl ? (
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
            </Link>
            <button
              onClick={toggleSidebar}
              className={cn(
                "h-7 w-7 rounded-md flex items-center justify-center",
                "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]",
                "transition-all duration-200 ease-in-out",
                "focus-visible:outline-2 focus-visible:outline-[var(--cloudact-mint)] focus-visible:outline-offset-2"
              )}
              title="Expand sidebar (⌘B)"
              aria-label="Expand sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <Link
              href={routes.home}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity flex-1 min-w-0"
            >
              <div className={cn(
                "flex-shrink-0 rounded-lg overflow-hidden flex items-center justify-center",
                "h-8 w-8 border border-[var(--border-medium)] bg-[var(--surface-primary)] shadow-sm",
                "transition-all duration-200 hover:border-[var(--cloudact-mint)] hover:shadow-md"
              )}>
                {logoLoading ? (
                  <div className="h-4 w-4 animate-pulse bg-gray-100 rounded" />
                ) : logoUrl ? (
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
              <span className="text-sm font-bold text-[var(--text-primary)] truncate max-w-[140px] tracking-tight">
                {formattedOrgName}
              </span>
            </Link>
            <button
              onClick={toggleSidebar}
              className={cn(
                "flex-shrink-0 h-7 w-7 rounded-md flex items-center justify-center",
                "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]",
                "transition-all duration-200 ease-in-out",
                "focus-visible:outline-2 focus-visible:outline-[var(--cloudact-mint)] focus-visible:outline-offset-2"
              )}
              title="Collapse sidebar (⌘B)"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <SidebarContent className="px-0 py-2 overflow-y-auto">
        <SidebarMenu className="gap-0">

          {navGroups.map((group) => (
            <div key={group.id}>
              {/* Collapsed: single icon per group */}
              {isCollapsed && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className="h-10 rounded-lg justify-center px-2 mx-1">
                    <Link href={group.collapsedHref}>
                      <group.collapsedIcon className="h-4 w-4 text-[var(--text-tertiary)]" />
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* Expanded: section header + items */}
              {!isCollapsed && (
                <SectionHeader
                  title={group.label}
                  section={group.id}
                  isExpanded={openSections.has(group.id)}
                  badge={group.badge}
                />
              )}
              {!isCollapsed && openSections.has(group.id) && (
                <div className="px-2 pb-0.5">
                  {group.items.map((item) => {
                    const active = isActive(item.href.split("?")[0], item.exactMatch)
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          className={cn(active ? activeItemClass : itemClass)}
                        >
                          <Link href={item.href}>
                            <item.icon className="h-4 w-4 flex-shrink-0" />
                            <span>{item.title}</span>
                            {item.badge && (
                              <span className="ml-auto rounded-full bg-[var(--cloudact-coral)]/10 px-2 py-0.5 text-[length:var(--text-xs)] font-medium text-[var(--cloudact-coral)]">
                                {item.badge}
                              </span>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </div>
              )}
            </div>
          ))}

        </SidebarMenu>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="px-0 py-2 mt-auto border-t border-[var(--border-subtle)]">
        <SidebarMenu className="gap-0">

          {/* Theme Toggle */}
          <ThemeToggle collapsed={isCollapsed} />

          {/* User Profile - Clickable to navigate to profile page */}
          {!isCollapsed && (
            <Link
              href={routes.profile}
              className={cn(
                "px-4 py-3 flex items-center gap-3 hover:bg-[var(--surface-hover)] transition-colors cursor-pointer group rounded-md mx-2 mb-1",
                isActive(routes.profile) && "bg-[var(--cloudact-mint)]/10"
              )}
            >
              <div className={cn(
                "h-9 w-9 rounded-lg border flex items-center justify-center flex-shrink-0 shadow-sm transition-all",
                isActive(routes.profile)
                  ? "bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] border-[var(--cloudact-mint)]"
                  : "bg-gradient-to-br from-[var(--surface-secondary)] to-[var(--surface-hover)] border-[var(--border-light)] group-hover:from-[var(--cloudact-mint)] group-hover:to-[var(--cloudact-mint-light)]"
              )}>
                <span className={cn(
                  "text-xs font-bold transition-colors",
                  isActive(routes.profile)
                    ? "text-[var(--cloudact-mint-text)]"
                    : "text-[var(--text-tertiary)] group-hover:text-[var(--cloudact-mint-text)]"
                )}>
                  {getUserInitials(userName)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                  {formatUserName(userName)}
                </p>
                <p className="text-xs text-[var(--text-muted)] truncate group-hover:text-[var(--text-tertiary)]">
                  {userEmail}
                </p>
              </div>
            </Link>
          )}
          {isCollapsed && (
            <Link
              href={routes.profile}
              className="flex justify-center py-2"
              title="Profile"
            >
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center transition-all",
                isActive(routes.profile)
                  ? "bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] ring-2 ring-[var(--cloudact-mint)]/30"
                  : "bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] hover:ring-2 hover:ring-[var(--cloudact-mint)]/30"
              )}>
                <span className="text-[var(--cloudact-mint-text)] text-[length:var(--text-xs)] font-semibold">
                  {getUserInitials(userName)}
                </span>
              </div>
            </Link>
          )}

          {/* Get Help */}
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className={cn(
                "h-[36px] px-3 text-sm font-medium text-[var(--text-secondary)]",
                "hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] rounded-md mx-2 transition-colors",
                "flex items-center gap-3",
                isCollapsed && "justify-center px-2"
              )}
            >
              <Link href="/user-docs" target="_blank">
                <HelpCircle className="h-4 w-4 flex-shrink-0" />
                {!isCollapsed && <span>Get Help</span>}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Sign Out */}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              disabled={isLoading}
              className={cn(
                "h-[36px] px-3 text-sm font-medium text-[var(--text-tertiary)]",
                "hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] rounded-md mx-2 transition-colors",
                "flex items-center gap-3",
                isCollapsed && "justify-center px-2"
              )}
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              {!isCollapsed && <span>{isLoading ? "Signing out..." : "Sign Out"}</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>

        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
