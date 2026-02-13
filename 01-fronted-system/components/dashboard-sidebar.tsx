"use client"

/**
 * Dashboard Sidebar - matches mobile nav style
 *
 * Independent collapse (all sections open by default).
 * Plus/Minus toggles. Mint active state. Flat grouped navigation.
 *
 * Section order (matches mobile nav):
 * 1. AI Chat, 2. Account Summary, 3. Cost Analytics,
 * 4. Pipelines, 5. Integrations, 6. Notifications, 7. Org Settings
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
  CreditCard,
  User,
  Building,
  UserPlus,
  HelpCircle,
  Minus,
  Plus,
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
  MessageSquare,
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { getOrgDetails } from "@/actions/organization-locale"

type SectionId = "dashboards" | "cost-analytics" | "pipelines" | "integrations" | "notifications" | "chat" | "settings"

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
      const isAcronym = acronymPatterns.some(({ replacement }) =>
        word === replacement || word.toUpperCase() === word
      )
      if (isAcronym) return word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(" ")

  return words
}

function getUserInitials(name: string): string {
  if (!name) return "U"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase()
  }
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
  // All sections expanded by default (like mobile nav)
  const [openSections, setOpenSections] = useState<Set<SectionId>>(
    new Set(["chat", "dashboards", "cost-analytics", "pipelines", "integrations", "notifications", "settings"])
  )

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
  // Font: 14px nav items (industry standard: Notion, GitHub, Stripe)
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
      <span className="text-[11px] font-semibold text-slate-400 tracking-wide">
        {title}
        {badge && (
          <span className="ml-2 rounded-full bg-[var(--cloudact-coral)]/10 px-1.5 py-0.5 text-[11px] font-medium text-[var(--cloudact-coral)]">
            {badge}
          </span>
        )}
      </span>
      <span className="text-slate-300 group-hover:text-slate-500 transition-colors">
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
        isCollapsed ? "p-2" : "px-4 py-3"
      )}>
        <div className="flex items-center justify-between">
          <Link
            href={`/${orgSlug}/cost-dashboards/overview`}
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
                <Building2 className="h-4 w-4 text-slate-400" />
              )}
            </div>
            {!isCollapsed && (
              <span className="text-sm font-bold text-[var(--text-primary)] truncate max-w-[140px] tracking-tight">
                {formattedOrgName}
              </span>
            )}
          </Link>
          {/* Collapse/Expand Toggle Button */}
          <button
            onClick={toggleSidebar}
            className={cn(
              "flex-shrink-0 h-7 w-7 rounded-md flex items-center justify-center",
              "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]",
              "transition-all duration-200 ease-in-out",
              "focus-visible:outline-2 focus-visible:outline-[var(--cloudact-mint)] focus-visible:outline-offset-2",
              isCollapsed && "mx-auto"
            )}
            title={isCollapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <SidebarContent className="px-0 py-2 overflow-y-auto">
        <SidebarMenu className="gap-0">

          {/* AI Chat Section */}
          {!isCollapsed && (
            <SectionHeader
              title="AI Chat"
              section="chat"
              isExpanded={openSections.has("chat")}
              badge="Beta"
            />
          )}
          {isCollapsed && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="h-10 rounded-lg justify-center px-2 mx-1">
                <Link href={`/${orgSlug}/chat`}>
                  <MessageSquare className="h-4 w-4 text-slate-500" />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {!isCollapsed && openSections.has("chat") && (
            <div className="px-2 pb-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/chat`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/chat`}>
                    <MessageSquare className="h-4 w-4 flex-shrink-0" />
                    <span>Chat</span>
                    <span className="ml-auto rounded-full bg-[var(--cloudact-coral)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--cloudact-coral)]">Beta</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/settings/ai-chat`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/settings/ai-chat`}>
                    <Settings className="h-4 w-4 flex-shrink-0" />
                    <span>Chat Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </div>
          )}

          {/* Account Summary Section */}
          {!isCollapsed && (
            <SectionHeader
              title="Account Summary"
              section="dashboards"
              isExpanded={openSections.has("dashboards")}
            />
          )}
          {isCollapsed && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="h-10 rounded-lg justify-center px-2 mx-1">
                <Link href={`/${orgSlug}/dashboard`}>
                  <LayoutDashboard className="h-4 w-4 text-slate-500" />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {!isCollapsed && openSections.has("dashboards") && (
            <div className="px-2 pb-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/dashboard`, true) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/dashboard`}>
                    <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </div>
          )}

          {/* Cost Analytics Section */}
          {!isCollapsed && (
            <SectionHeader
              title="Cost Analytics"
              section="cost-analytics"
              isExpanded={openSections.has("cost-analytics")}
            />
          )}
          {isCollapsed && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="h-10 rounded-lg justify-center px-2 mx-1">
                <Link href={`/${orgSlug}/cost-dashboards/overview`}>
                  <TrendingUp className="h-4 w-4 text-slate-500" />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {!isCollapsed && openSections.has("cost-analytics") && (
            <div className="px-2 pb-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/cost-dashboards/overview`, true) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/cost-dashboards/overview`}>
                    <BarChart3 className="h-4 w-4 flex-shrink-0" />
                    <span>Overview</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/cost-dashboards/genai-costs`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/cost-dashboards/genai-costs`}>
                    <Sparkles className="h-4 w-4 flex-shrink-0" />
                    <span>GenAI</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/cost-dashboards/cloud-costs`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/cost-dashboards/cloud-costs`}>
                    <Cloud className="h-4 w-4 flex-shrink-0" />
                    <span>Cloud</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/cost-dashboards/subscription-costs`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/cost-dashboards/subscription-costs`}>
                    <Receipt className="h-4 w-4 flex-shrink-0" />
                    <span>Subscription</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </div>
          )}

          {/* Pipelines Section */}
          {!isCollapsed && (
            <SectionHeader
              title="Pipelines"
              section="pipelines"
              isExpanded={openSections.has("pipelines")}
            />
          )}
          {isCollapsed && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="h-10 rounded-lg justify-center px-2 mx-1">
                <Link href={`/${orgSlug}/pipelines/subscription-runs`}>
                  <Workflow className="h-4 w-4 text-slate-500" />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {!isCollapsed && openSections.has("pipelines") && (
            <div className="px-2 pb-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/pipelines/subscription-runs`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/pipelines/subscription-runs`}>
                    <RefreshCw className="h-4 w-4 flex-shrink-0" />
                    <span>Subscription Runs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/pipelines/cloud-runs`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/pipelines/cloud-runs`}>
                    <Workflow className="h-4 w-4 flex-shrink-0" />
                    <span>Cloud Runs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/pipelines/genai-runs`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/pipelines/genai-runs`}>
                    <Cpu className="h-4 w-4 flex-shrink-0" />
                    <span>GenAI Runs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </div>
          )}

          {/* Integrations Section */}
          {!isCollapsed && (
            <SectionHeader
              title="Integrations"
              section="integrations"
              isExpanded={openSections.has("integrations")}
            />
          )}
          {isCollapsed && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="h-10 rounded-lg justify-center px-2 mx-1">
                <Link href={`/${orgSlug}/integrations`}>
                  <Server className="h-4 w-4 text-slate-500" />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {!isCollapsed && openSections.has("integrations") && (
            <div className="px-2 pb-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/integrations/cloud-providers`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/integrations/cloud-providers`}>
                    <Server className="h-4 w-4 flex-shrink-0" />
                    <span>Cloud Providers</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/integrations/genai`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/integrations/genai`}>
                    <Brain className="h-4 w-4 flex-shrink-0" />
                    <span>GenAI Providers</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/integrations/subscriptions`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/integrations/subscriptions`}>
                    <SubscriptionIcon className="h-4 w-4 flex-shrink-0" />
                    <span>Subscriptions</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </div>
          )}

          {/* Notifications Section */}
          {!isCollapsed && (
            <SectionHeader
              title="Notifications"
              section="notifications"
              isExpanded={openSections.has("notifications")}
            />
          )}
          {isCollapsed && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="h-10 rounded-lg justify-center px-2 mx-1">
                <Link href={`/${orgSlug}/notifications`}>
                  <Bell className="h-4 w-4 text-slate-500" />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {!isCollapsed && openSections.has("notifications") && (
            <div className="px-2 pb-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/notifications`, true) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/notifications`}>
                    <Bell className="h-4 w-4 flex-shrink-0" />
                    <span>Overview</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/notifications?tab=channels`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/notifications?tab=channels`}>
                    <Settings className="h-4 w-4 flex-shrink-0" />
                    <span>Channels</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/notifications?tab=alerts`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/notifications?tab=alerts`}>
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    <span>Alert Rules</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/notifications?tab=summaries`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/notifications?tab=summaries`}>
                    <Calendar className="h-4 w-4 flex-shrink-0" />
                    <span>Summaries</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/notifications?tab=history`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/notifications?tab=history`}>
                    <History className="h-4 w-4 flex-shrink-0" />
                    <span>History</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </div>
          )}

          {/* Org Settings Section */}
          {!isCollapsed && (
            <SectionHeader
              title="Org Settings"
              section="settings"
              isExpanded={openSections.has("settings")}
            />
          )}
          {isCollapsed && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="h-10 rounded-lg justify-center px-2 mx-1">
                <Link href={`/${orgSlug}/settings/organization`}>
                  <Settings className="h-4 w-4 text-slate-500" />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {!isCollapsed && openSections.has("settings") && (
            <div className="px-2 pb-0.5">
              {userRole === "owner" && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className={cn(
                      isActive(`/${orgSlug}/settings/organization`) ? activeItemClass : itemClass
                    )}
                  >
                    <Link href={`/${orgSlug}/settings/organization`}>
                      <Building className="h-4 w-4 flex-shrink-0" />
                      <span>Organization</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {userRole === "owner" && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className={cn(
                      isActive(`/${orgSlug}/settings/hierarchy`) ? activeItemClass : itemClass
                    )}
                  >
                    <Link href={`/${orgSlug}/settings/hierarchy`}>
                      <Network className="h-4 w-4 flex-shrink-0" />
                      <span>Hierarchy</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/settings/quota-usage`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/settings/quota-usage`}>
                    <BarChart3 className="h-4 w-4 flex-shrink-0" />
                    <span>Usage & Quotas</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/settings/invite`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/settings/invite`}>
                    <UserPlus className="h-4 w-4 flex-shrink-0" />
                    <span>Team Members</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {userRole === "owner" && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className={cn(
                      isActive(`/${orgSlug}/billing`, true) ? activeItemClass : itemClass
                    )}
                  >
                    <Link href={`/${orgSlug}/billing`}>
                      <CreditCard className="h-4 w-4 flex-shrink-0" />
                      <span>Billing</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </div>
          )}

        </SidebarMenu>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="px-0 py-2 mt-auto border-t border-[var(--border-subtle)]">
        <SidebarMenu className="gap-0">

          {/* User Profile - Clickable to navigate to profile page */}
          {!isCollapsed && (
            <Link
              href={`/${orgSlug}/settings/personal`}
              className={cn(
                "px-4 py-3 flex items-center gap-3 hover:bg-[var(--surface-hover)] transition-colors cursor-pointer group rounded-md mx-2 mb-1",
                isActive(`/${orgSlug}/settings/personal`) && "bg-[var(--cloudact-mint)]/10"
              )}
            >
              <div className={cn(
                "h-9 w-9 rounded-lg border flex items-center justify-center flex-shrink-0 shadow-sm transition-all",
                isActive(`/${orgSlug}/settings/personal`)
                  ? "bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] border-[var(--cloudact-mint)]"
                  : "bg-gradient-to-br from-slate-100 to-slate-200 border-slate-200 group-hover:from-[var(--cloudact-mint)] group-hover:to-[var(--cloudact-mint-light)]"
              )}>
                <span className={cn(
                  "text-xs font-bold transition-colors",
                  isActive(`/${orgSlug}/settings/personal`)
                    ? "text-[var(--cloudact-mint-text)]"
                    : "text-slate-600 group-hover:text-[var(--cloudact-mint-text)]"
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
              href={`/${orgSlug}/settings/personal`}
              className="flex justify-center py-2"
              title="Profile"
            >
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center transition-all",
                isActive(`/${orgSlug}/settings/personal`)
                  ? "bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] ring-2 ring-[var(--cloudact-mint)]/30"
                  : "bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] hover:ring-2 hover:ring-[var(--cloudact-mint)]/30"
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
