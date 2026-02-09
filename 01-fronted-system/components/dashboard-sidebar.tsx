"use client"

/**
 * OpenClaw-Inspired Dashboard Sidebar
 *
 * Flat grouped navigation with collapsible sections.
 * Header: brand logo + title + subtitle.
 * Section headers with toggle (minus/plus).
 * Active item: light mint highlight.
 * Clean two-zone layout: scrollable nav + sticky footer.
 * Theme toggle (system/light/dark) in footer.
 * Full dark mode support.
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
  Bell,
  AlertTriangle,
  Calendar,
  History,
  MessageSquare,
  FileText,
  Minus,
  Plus,
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { getOrgDetails } from "@/actions/organization-locale"

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
  placeholder?: boolean
}

interface NavGroup {
  label: string
  items: NavItem[]
}

function getNavGroups(orgSlug: string, userRole: string): NavGroup[] {
  const isOwner = userRole === "owner"

  return [
    {
      label: "Chat",
      items: [
        { title: "Chat", href: `/${orgSlug}/chat`, icon: MessageSquare, placeholder: true },
      ],
    },
    {
      label: "Control",
      items: [
        { title: "Dashboard", href: `/${orgSlug}/dashboard`, icon: LayoutDashboard },
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
    {
      label: "Resources",
      items: [
        { title: "Docs", href: "/user-docs", icon: FileText },
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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const formattedOrgName = formatOrgName(orgName)
  const { state, toggleSidebar } = useSidebar()
  const isCollapsed = state === "collapsed"

  const navGroups = getNavGroups(orgSlug, userRole)

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
      return pathname === url.pathname && !window.location.search.includes("tab=")
    }
    return pathname === url.pathname && window.location.search.includes(`tab=${tab}`)
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-slate-200/60 bg-white" {...props}>
      {/* Header: Hamburger + Logo + Brand */}
      <div className={cn(
        "border-b border-slate-200/60 hidden md:block",
        isCollapsed ? "p-2" : "px-4 py-3"
      )}>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            className={cn(
              "flex-shrink-0 h-8 w-8 rounded-md flex items-center justify-center",
              "text-slate-500 hover:text-slate-700",
              "hover:bg-slate-100",
              "transition-all duration-200",
              isCollapsed && "mx-auto"
            )}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>

          {!isCollapsed && (
            <Link
              href={`/${orgSlug}/dashboard`}
              className="flex items-center gap-2.5 hover:opacity-80 transition-opacity flex-1 min-w-0"
            >
              <div className={cn(
                "flex-shrink-0 rounded-lg overflow-hidden flex items-center justify-center",
                "h-9 w-9 border border-slate-200 bg-white shadow-sm"
              )}>
                {logoLoading ? (
                  <div className="h-4 w-4 animate-pulse bg-slate-100 rounded" />
                ) : logoUrl ? (
                  <Image src={logoUrl} alt={formattedOrgName} width={36} height={36} className="object-contain" />
                ) : (
                  <Image
                    src="/logos/cloudact-icon.svg"
                    alt="CloudAct"
                    width={24}
                    height={24}
                    className="opacity-80"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.style.display = "none"
                    }}
                  />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-black text-slate-900 tracking-wide uppercase leading-tight truncate">
                  {formattedOrgName}
                </p>
                <p className="text-[9px] font-semibold text-slate-400 tracking-wider uppercase leading-tight">
                  Cost Analytics
                </p>
              </div>
            </Link>
          )}
        </div>
      </div>

      <SidebarContent className="px-0 py-1 overflow-y-auto">
        <SidebarMenu className="gap-0">
          {navGroups.map((group) => {
            const isGroupCollapsed = collapsedGroups.has(group.label)

            return (
              <div key={group.label}>
                {/* Group Label with toggle */}
                {!isCollapsed && (
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className="w-full px-4 pt-5 pb-2 flex items-center justify-between group cursor-pointer"
                  >
                    <span className="text-[11px] font-semibold text-slate-400 tracking-wide">
                      {group.label}
                    </span>
                    <span className="text-slate-300 group-hover:text-slate-500 transition-colors">
                      {isGroupCollapsed
                        ? <Plus className="h-3.5 w-3.5" />
                        : <Minus className="h-3.5 w-3.5" />
                      }
                    </span>
                  </button>
                )}

                {/* Collapsed sidebar: show only first item icon */}
                {isCollapsed && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild className="h-10 rounded-lg justify-center px-2 mx-1 my-0.5">
                      <Link href={group.items[0].href}>
                        {(() => {
                          const Icon = group.items[0].icon
                          return <Icon className="h-4 w-4 text-slate-500" />
                        })()}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {/* Expanded: show items when group is not collapsed */}
                {!isCollapsed && !isGroupCollapsed && (
                  <div className="pb-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const href = item.href
                      const isNotificationItem = href.includes("/notifications")
                      let active: boolean
                      if (item.placeholder) {
                        active = false
                      } else if (isNotificationItem) {
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
                              "h-[36px] px-4 text-[13px] font-medium rounded-lg mx-2 transition-all duration-150",
                              "flex items-center gap-3",
                              active
                                ? "font-semibold text-slate-900 bg-[#90FCA6]/15"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                              item.placeholder && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            <Link href={item.placeholder ? "#" : href} onClick={item.placeholder ? (e) => e.preventDefault() : undefined}>
                              <Icon className={cn(
                                "h-4 w-4 flex-shrink-0",
                                active ? "text-[#16a34a]" : ""
                              )} />
                              <span>{item.title}</span>
                              {item.placeholder && (
                                <span className="ml-auto text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                  Soon
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
            )
          })}
        </SidebarMenu>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="px-0 py-2 mt-auto border-t border-slate-200/60">
        <SidebarMenu className="gap-0">


          {/* User Profile */}
          {!isCollapsed && (
            <Link
              href={`/${orgSlug}/settings/personal`}
              className={cn(
                "px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors cursor-pointer group rounded-md mx-2 mb-1",
                isActive(`/${orgSlug}/settings/personal`) && "bg-[#90FCA6]/10"
              )}
            >
              <div className={cn(
                "h-8 w-8 rounded-lg border flex items-center justify-center flex-shrink-0 shadow-sm transition-all",
                isActive(`/${orgSlug}/settings/personal`)
                  ? "bg-gradient-to-br from-[#90FCA6] to-[#6EE890] border-[#90FCA6]"
                  : "bg-gradient-to-br from-slate-100 to-slate-200 border-slate-200 group-hover:from-[#90FCA6]/30 group-hover:to-[#90FCA6]/20"
              )}>
                <span className={cn(
                  "text-xs font-bold transition-colors",
                  isActive(`/${orgSlug}/settings/personal`)
                    ? "text-[#0a0a0b]"
                    : "text-slate-600"
                )}>
                  {getUserInitials(userName)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-slate-800 truncate">
                  {formatUserName(userName)}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
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
                "bg-gradient-to-br from-[#90FCA6] to-[#6EE890]",
                isActive(`/${orgSlug}/settings/personal`) && "ring-2 ring-[#90FCA6]/30"
              )}>
                <span className="text-[#0a0a0b] text-[11px] font-semibold">
                  {getUserInitials(userName)}
                </span>
              </div>
            </Link>
          )}

          {/* Sign Out */}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              disabled={isLoading}
              className={cn(
                "h-[34px] px-4 text-[11px] font-medium text-slate-500",
                "hover:bg-slate-50 hover:text-slate-800 rounded-md mx-2 transition-colors",
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
