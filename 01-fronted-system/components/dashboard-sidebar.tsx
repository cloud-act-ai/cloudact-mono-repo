"use client"

/**
 * OpenClaw-Inspired Dashboard Sidebar
 *
 * Flat grouped navigation with always-visible sections.
 * No accordion - all groups visible, items show directly.
 * Clean two-zone layout: scrollable nav + sticky footer.
 * Theme toggle (system/light/dark) in footer.
 * Mint accent for active items. Full dark mode support.
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
  CreditCard,
  User,
  Building,
  UserPlus,
  HelpCircle,
  BarChart3,
  LayoutDashboard,
  Receipt,
  Sparkles,
  Cloud,
  RefreshCw,
  Workflow,
  Cpu,
  Server,
  Brain,
  CreditCard as SubscriptionIcon,
  Network,
  PanelLeftClose,
  PanelLeft,
  Settings,
  TrendingUp,
  Bell,
  AlertTriangle,
  Calendar,
  History,
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { getOrgDetails } from "@/actions/organization-locale"
import { ThemeToggle } from "@/components/theme-toggle"

function formatOrgName(name: string): string {
  const withoutDate = name.replace(/_\d{8}$/, "")
  if (withoutDate.includes(" ") || /[a-z][A-Z]/.test(withoutDate)) {
    return withoutDate.trim()
  }
  const acronymPatterns = [
    { pattern: /\bsaas\b/gi, replacement: "SaaS" },
    { pattern: /\bapi\b/gi, replacement: "API" },
    { pattern: /\bai\b/gi, replacement: "AI" },
    { pattern: /\bgenai\b/gi, replacement: "GenAI" },
    { pattern: /\bgcp\b/gi, replacement: "GCP" },
    { pattern: /\baws\b/gi, replacement: "AWS" },
  ]
  let processed = withoutDate.replace(/[_-]/g, " ")
  for (const { pattern, replacement } of acronymPatterns) {
    processed = processed.replace(pattern, replacement)
  }
  return processed
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const isAcronym = acronymPatterns.some(({ replacement }) =>
        word === replacement || word.toUpperCase() === word
      )
      if (isAcronym) return word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(" ")
}

function getUserInitials(name: string): string {
  if (!name) return "U"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function formatUserName(name: string): string {
  if (!name) return "User"
  return name
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

// --- Navigation Data ---
interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  ownerOnly?: boolean
}

interface NavGroup {
  label: string
  items: NavItem[]
}

function getNavGroups(orgSlug: string, userRole: string): NavGroup[] {
  const isOwner = userRole === "owner"

  return [
    {
      label: "Dashboard",
      items: [
        { title: "Dashboard", href: `/${orgSlug}/dashboard`, icon: LayoutDashboard },
      ],
    },
    {
      label: "Cost Analytics",
      items: [
        { title: "Overview", href: `/${orgSlug}/cost-dashboards/overview`, icon: BarChart3 },
        { title: "GenAI Costs", href: `/${orgSlug}/cost-dashboards/genai-costs`, icon: Sparkles },
        { title: "Cloud Costs", href: `/${orgSlug}/cost-dashboards/cloud-costs`, icon: Cloud },
        { title: "Subscriptions", href: `/${orgSlug}/cost-dashboards/subscription-costs`, icon: Receipt },
      ],
    },
    {
      label: "Pipelines",
      items: [
        { title: "Subscription Runs", href: `/${orgSlug}/pipelines/subscription-runs`, icon: RefreshCw },
        { title: "Cloud Runs", href: `/${orgSlug}/pipelines/cloud-runs`, icon: Workflow },
        { title: "GenAI Runs", href: `/${orgSlug}/pipelines/genai-runs`, icon: Cpu },
      ],
    },
    {
      label: "Integrations",
      items: [
        { title: "Cloud Providers", href: `/${orgSlug}/integrations/cloud-providers`, icon: Server },
        { title: "GenAI Providers", href: `/${orgSlug}/integrations/genai`, icon: Brain },
        { title: "Subscriptions", href: `/${orgSlug}/integrations/subscriptions`, icon: SubscriptionIcon },
      ],
    },
    {
      label: "Notifications",
      items: [
        { title: "Overview", href: `/${orgSlug}/notifications`, icon: Bell },
        { title: "Channels", href: `/${orgSlug}/notifications?tab=channels`, icon: Settings },
        { title: "Alert Rules", href: `/${orgSlug}/notifications?tab=alerts`, icon: AlertTriangle },
        { title: "Summaries", href: `/${orgSlug}/notifications?tab=summaries`, icon: Calendar },
        { title: "History", href: `/${orgSlug}/notifications?tab=history`, icon: History },
      ],
    },
    {
      label: "Settings",
      items: [
        ...(isOwner ? [{ title: "Organization", href: `/${orgSlug}/settings/organization`, icon: Building }] : []),
        ...(isOwner ? [{ title: "Hierarchy", href: `/${orgSlug}/settings/hierarchy`, icon: Network }] : []),
        { title: "Usage & Quotas", href: `/${orgSlug}/settings/quota-usage`, icon: BarChart3 },
        { title: "Team Members", href: `/${orgSlug}/settings/invite`, icon: UserPlus },
        ...(isOwner ? [{ title: "Billing", href: `/${orgSlug}/billing`, icon: CreditCard }] : []),
      ],
    },
  ]
}

// --- Sidebar Component ---

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

  const formattedOrgName = formatOrgName(orgName)
  const { state, toggleSidebar } = useSidebar()
  const isCollapsed = state === "collapsed"

  const navGroups = getNavGroups(orgSlug, userRole)

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
    return () => { isMounted = false }
  }, [orgSlug])

  const handleLogout = async () => {
    setIsLoading(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    if (typeof window !== "undefined") window.location.href = "/login"
  }

  const isActive = (path: string, exact = false) => {
    if (!pathname) return false
    if (exact) return pathname === path
    return pathname === path || pathname.startsWith(path + "/")
  }

  // Check active for notification tab URLs
  const isActiveNotification = (href: string) => {
    if (!pathname) return false
    const url = new URL(href, "http://localhost")
    const tab = url.searchParams.get("tab")
    if (!tab) {
      // "Overview" - active only when no tab param in current URL
      return pathname === url.pathname && !window.location.search.includes("tab=")
    }
    return pathname === url.pathname && window.location.search.includes(`tab=${tab}`)
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900" {...props}>
      {/* Header: Logo + Org Name + Toggle */}
      <div className={cn(
        "border-b border-slate-200/60 dark:border-slate-700/60 hidden md:block",
        isCollapsed ? "p-2" : "px-4 py-3"
      )}>
        <div className="flex items-center justify-between">
          <Link
            href={`/${orgSlug}/cost-dashboards/overview`}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity flex-1 min-w-0"
          >
            <div className={cn(
              "flex-shrink-0 rounded-lg overflow-hidden flex items-center justify-center",
              "h-8 w-8 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm",
              "transition-all duration-200 hover:border-[var(--cloudact-mint)] hover:shadow-md"
            )}>
              {logoLoading ? (
                <div className="h-4 w-4 animate-pulse bg-slate-100 dark:bg-slate-700 rounded" />
              ) : logoUrl ? (
                <Image src={logoUrl} alt={formattedOrgName} width={32} height={32} className="object-contain" />
              ) : (
                <Building2 className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              )}
            </div>
            {!isCollapsed && (
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate max-w-[140px] tracking-tight">
                {formattedOrgName}
              </span>
            )}
          </Link>
          <button
            onClick={toggleSidebar}
            className={cn(
              "flex-shrink-0 h-7 w-7 rounded-md flex items-center justify-center",
              "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300",
              "hover:bg-slate-100 dark:hover:bg-slate-800",
              "transition-all duration-200 ease-in-out",
              "focus-visible:outline-2 focus-visible:outline-[var(--cloudact-mint)] focus-visible:outline-offset-2",
              isCollapsed && "mx-auto"
            )}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <SidebarContent className="px-0 py-1 overflow-y-auto">
        <SidebarMenu className="gap-0">
          {navGroups.map((group) => (
            <div key={group.label}>
              {/* Group Label */}
              {!isCollapsed && (
                <div className="px-4 pt-4 pb-1 flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
                </div>
              )}

              {/* Collapsed: show only first item icon */}
              {isCollapsed && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className="h-10 rounded-lg justify-center px-2 mx-1 my-0.5">
                    <Link href={group.items[0].href}>
                      {(() => {
                        const Icon = group.items[0].icon
                        return <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      })()}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* Expanded: show all items */}
              {!isCollapsed && (
                <div className="pb-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const href = item.href
                    const isNotificationItem = href.includes("/notifications")
                    let active: boolean
                    if (isNotificationItem) {
                      // For notification items with query params, use special check
                      if (typeof window !== "undefined") {
                        active = isActiveNotification(href)
                      } else {
                        active = isActive(href.split("?")[0], !href.includes("?"))
                      }
                    } else {
                      active = isActive(href, href.endsWith("/dashboard"))
                    }

                    return (
                      <SidebarMenuItem key={href}>
                        <SidebarMenuButton
                          asChild
                          className={cn(
                            "h-[34px] px-3 text-[13px] font-medium rounded-md mx-2 transition-all duration-150",
                            "flex items-center gap-3",
                            active
                              ? cn(
                                  "font-semibold text-slate-900 dark:text-slate-100",
                                  "bg-slate-100 dark:bg-slate-800",
                                  "relative before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2",
                                  "before:w-[3px] before:h-4 before:bg-[var(--cloudact-mint)] before:rounded-r-full"
                                )
                              : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200"
                          )}
                        >
                          <Link href={href}>
                            <Icon className={cn(
                              "h-4 w-4 flex-shrink-0",
                              active ? "text-slate-700 dark:text-slate-300" : ""
                            )} />
                            <span>{item.title}</span>
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
      <SidebarFooter className="px-0 py-2 mt-auto border-t border-slate-200/60 dark:border-slate-700/60">
        <SidebarMenu className="gap-0">

          {/* Theme Toggle */}
          {!isCollapsed && (
            <div className="px-4 py-2 flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Theme</span>
              <ThemeToggle compact />
            </div>
          )}

          {/* User Profile */}
          {!isCollapsed && (
            <Link
              href={`/${orgSlug}/settings/personal`}
              className={cn(
                "px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer group rounded-md mx-2 mb-1",
                isActive(`/${orgSlug}/settings/personal`) && "bg-slate-100 dark:bg-slate-800"
              )}
            >
              <div className={cn(
                "h-8 w-8 rounded-lg border flex items-center justify-center flex-shrink-0 shadow-sm transition-all",
                isActive(`/${orgSlug}/settings/personal`)
                  ? "bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] border-[var(--cloudact-mint)]"
                  : "bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 border-slate-200 dark:border-slate-600 group-hover:from-[var(--cloudact-mint)] group-hover:to-[var(--cloudact-mint-light)]"
              )}>
                <span className={cn(
                  "text-xs font-bold transition-colors",
                  isActive(`/${orgSlug}/settings/personal`)
                    ? "text-[var(--cloudact-mint-text)]"
                    : "text-slate-600 dark:text-slate-300 group-hover:text-[var(--cloudact-mint-text)]"
                )}>
                  {getUserInitials(userName)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-slate-900 dark:group-hover:text-slate-100">
                  {formatUserName(userName)}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                  {userEmail}
                </p>
              </div>
            </Link>
          )}
          {isCollapsed && (
            <Link
              href={`/${orgSlug}/settings/personal`}
              className="flex justify-center py-2"
              title="Profile"
            >
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center transition-all",
                "bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)]",
                isActive(`/${orgSlug}/settings/personal`) && "ring-2 ring-[var(--cloudact-mint)]/30"
              )}>
                <span className="text-[var(--cloudact-mint-text)] text-[11px] font-semibold">
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
                "h-[34px] px-3 text-[13px] font-medium text-slate-500 dark:text-slate-400",
                "hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 rounded-md mx-2 transition-colors",
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
                "h-[34px] px-3 text-[13px] font-medium text-slate-500 dark:text-slate-400",
                "hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 rounded-md mx-2 transition-colors",
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
