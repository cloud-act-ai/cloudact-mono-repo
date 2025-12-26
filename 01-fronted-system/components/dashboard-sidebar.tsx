"use client"

/**
 * Editorial Dashboard Sidebar
 *
 * Clean, compact navigation with:
 * - Accordion behavior (one section expanded at a time)
 * - Auto-expand based on current route
 * - Subscription page styling (smaller fonts, slate colors)
 * - Teal left accent for active items
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
  ChevronDown,
  ChevronRight,
  ChevronLeft,
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
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { getOrgDetails } from "@/actions/organization-locale"

type SectionId = "dashboards" | "pipelines" | "integrations" | "settings"

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
  // Accordion: only one section open at a time
  const [activeSection, setActiveSection] = useState<SectionId>("dashboards")

  const formattedOrgName = formatOrgName(orgName)
  const { state, toggleSidebar } = useSidebar()
  const isCollapsed = state === "collapsed"

  // Auto-expand section based on current route
  useEffect(() => {
    if (!pathname) return

    if (pathname.includes("/cost-dashboards")) {
      setActiveSection("dashboards")
    } else if (pathname.includes("/pipelines")) {
      setActiveSection("pipelines")
    } else if (pathname.includes("/integrations")) {
      setActiveSection("integrations")
    } else if (pathname.includes("/settings") || pathname.includes("/billing")) {
      setActiveSection("settings")
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
    if (typeof window !== "undefined") window.location.href = "/login"
  }

  const toggleSection = (section: SectionId) => {
    setActiveSection(section)
  }

  // Active state helper
  const isActive = (path: string, exact = false) => {
    if (!pathname) return false
    if (exact) return pathname === path
    return pathname === path || pathname.startsWith(path + "/")
  }

  // Premium editorial styling - refined menu items with subtle interactions
  // Using text-sm (14px) for better readability, subtle hover states
  const itemClass = cn(
    "h-[36px] px-3 text-sm font-medium text-slate-600",
    "hover:bg-slate-100 hover:text-slate-900",
    "rounded-md mx-2 transition-all duration-200",
    "flex items-center gap-3"
  )
  const activeItemClass = cn(
    "h-[36px] px-3 text-sm font-semibold text-[var(--cloudact-mint-text)]",
    "bg-[var(--cloudact-mint)]/10 rounded-md mx-2",
    "flex items-center gap-3",
    "relative before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2",
    "before:w-[3px] before:h-4 before:bg-[var(--cloudact-mint)] before:rounded-r-full"
  )

  // Section icons for visual hierarchy - slightly larger
  const sectionIcons: Record<SectionId, React.ReactNode> = {
    dashboards: <BarChart3 className="h-4 w-4" />,
    pipelines: <Workflow className="h-4 w-4" />,
    integrations: <Server className="h-4 w-4" />,
    settings: <Settings className="h-4 w-4" />,
  }

  const SectionHeader = ({
    title,
    section,
    isExpanded
  }: {
    title: string
    section: SectionId
    isExpanded: boolean
  }) => (
    <div
      className={cn(
        "py-3 px-4 flex items-center justify-between cursor-pointer group",
        "hover:bg-slate-50 transition-colors duration-200",
        isExpanded && "bg-slate-50/50"
      )}
      onClick={() => toggleSection(section)}
    >
      <div className="flex items-center gap-2.5">
        <span className={cn(
          "text-slate-400 transition-colors group-hover:text-slate-600",
          isExpanded && "text-[var(--cloudact-mint-text)]"
        )}>
          {sectionIcons[section]}
        </span>
        <span className={cn(
          "text-xs font-semibold uppercase tracking-wider transition-colors",
          isExpanded ? "text-slate-900" : "text-slate-500 group-hover:text-slate-700"
        )}>
          {title}
        </span>
      </div>
      <div className={cn(
        "h-5 w-5 rounded-md flex items-center justify-center transition-all",
        isExpanded ? "bg-[var(--cloudact-mint)]/10" : "bg-transparent"
      )}>
        {isExpanded ? (
          <ChevronDown className={cn(
            "h-3.5 w-3.5 transition-colors",
            isExpanded ? "text-[var(--cloudact-mint-text)]" : "text-slate-400"
          )} />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-500" />
        )}
      </div>
    </div>
  )

  return (
    <Sidebar collapsible="icon" className="border-r border-slate-100 bg-white" {...props}>
      {/* Header: Logo + Org Name + Toggle */}
      <div className={cn(
        "border-b border-slate-100 hidden md:block",
        isCollapsed ? "p-2" : "px-4 py-3"
      )}>
        <div className="flex items-center justify-between">
          <Link
            href={`/${orgSlug}/cost-dashboards/overview`}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity flex-1 min-w-0"
          >
            <div className={cn(
              "flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] flex items-center justify-center",
              "h-8 w-8"
            )}>
              {logoLoading ? (
                <div className="h-4 w-4 animate-pulse bg-white/20 rounded" />
              ) : logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={formattedOrgName}
                  width={32}
                  height={32}
                  className="object-contain"
                />
              ) : (
                <Building2 className="h-4 w-4 text-[var(--cloudact-mint-text)]" />
              )}
            </div>
            {!isCollapsed && (
              <span className="text-sm font-bold text-slate-900 truncate max-w-[140px] tracking-tight">
                {formattedOrgName}
              </span>
            )}
          </Link>
          {/* Collapse/Expand Toggle Button */}
          <button
            onClick={toggleSidebar}
            className={cn(
              "flex-shrink-0 h-7 w-7 rounded-md flex items-center justify-center",
              "text-slate-400 hover:text-slate-600 hover:bg-slate-100",
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

          {/* Cost Dashboards Section */}
          {!isCollapsed && (
            <SectionHeader
              title="Dashboards"
              section="dashboards"
              isExpanded={activeSection === "dashboards"}
            />
          )}
          {isCollapsed && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="h-10 rounded-lg justify-center px-2 mx-1">
                <Link href={`/${orgSlug}/cost-dashboards/overview`}>
                  <LayoutDashboard className="h-4 w-4 text-slate-500" />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {!isCollapsed && activeSection === "dashboards" && (
            <div className="pb-2 space-y-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/cost-dashboards/overview`, true) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/cost-dashboards/overview`}>
                    <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
                    <span>Overview</span>
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
                    <span>Subscriptions</span>
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
            </div>
          )}

          {/* Pipelines Section */}
          {!isCollapsed && (
            <SectionHeader
              title="Pipelines"
              section="pipelines"
              isExpanded={activeSection === "pipelines"}
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
          {!isCollapsed && activeSection === "pipelines" && (
            <div className="pb-2 space-y-0.5">
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
                    isActive(`/${orgSlug}/pipelines/cost-runs`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/pipelines/cost-runs`}>
                    <Workflow className="h-4 w-4 flex-shrink-0" />
                    <span>Cost Runs</span>
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

        </SidebarMenu>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="px-0 py-2 mt-auto border-t border-slate-100">
        <SidebarMenu className="gap-0">

          {/* User Profile - First */}
          {!isCollapsed && (
            <div className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors cursor-pointer group rounded-md mx-2 mb-1">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:from-[var(--cloudact-mint)] group-hover:to-[var(--cloudact-mint-light)] transition-all">
                <span className="text-slate-600 group-hover:text-[var(--cloudact-mint-text)] text-xs font-bold">
                  {getUserInitials(userName)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-slate-900">
                  {formatUserName(userName)}
                </p>
                <p className="text-[11px] text-slate-400 truncate group-hover:text-slate-500">
                  {userEmail}
                </p>
              </div>
            </div>
          )}
          {isCollapsed && (
            <div className="flex justify-center py-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] flex items-center justify-center">
                <span className="text-[var(--cloudact-mint-text)] text-[11px] font-semibold">
                  {getUserInitials(userName)}
                </span>
              </div>
            </div>
          )}

          {/* Integrations Section */}
          {!isCollapsed && (
            <SectionHeader
              title="Integrations"
              section="integrations"
              isExpanded={activeSection === "integrations"}
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
          {!isCollapsed && activeSection === "integrations" && (
            <div className="pb-2 space-y-0.5">
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
                    isActive(`/${orgSlug}/integrations/llm`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/integrations/llm`}>
                    <Brain className="h-4 w-4 flex-shrink-0" />
                    <span>LLM Providers</span>
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

          {/* Settings Section */}
          {!isCollapsed && (
            <SectionHeader
              title="Settings"
              section="settings"
              isExpanded={activeSection === "settings"}
            />
          )}
          {isCollapsed && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="h-10 rounded-lg justify-center px-2 mx-1">
                <Link href={`/${orgSlug}/settings/personal`}>
                  <Settings className="h-4 w-4 text-slate-500" />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {!isCollapsed && activeSection === "settings" && (
            <div className="pb-2 space-y-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/settings/personal`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/settings/personal`}>
                    <User className="h-4 w-4 flex-shrink-0" />
                    <span>Profile</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

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

          {/* Get Help */}
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className={cn(
                "h-[36px] px-3 text-sm font-medium text-[var(--cloudact-blue)]",
                "hover:bg-[var(--cloudact-blue)]/5 rounded-md mx-2 transition-colors",
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
                "h-[36px] px-3 text-sm font-medium text-slate-500",
                "hover:bg-slate-100 hover:text-slate-800 rounded-md mx-2 transition-colors",
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
