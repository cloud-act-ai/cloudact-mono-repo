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
  const { state } = useSidebar()
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

  // Clean editorial styling - coral hover highlight
  const itemClass = "h-[26px] px-3 text-[12px] font-medium text-slate-600 hover:bg-[#FF6E50]/10 hover:text-[#FF6E50] rounded-md mx-2 transition-colors"
  const activeItemClass = "h-[26px] px-3 text-[12px] font-semibold text-[#FF6E50] bg-[#FF6E50]/10 rounded-md mx-2"

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
      className="py-2 px-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
      onClick={() => toggleSection(section)}
    >
      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
        {title}
      </span>
      {isExpanded ? (
        <ChevronDown className="h-3 w-3 text-slate-400" />
      ) : (
        <ChevronRight className="h-3 w-3 text-slate-400" />
      )}
    </div>
  )

  return (
    <Sidebar collapsible="icon" className="border-r border-slate-100 bg-white" {...props}>
      {/* Header: Logo + Org Name */}
      <div className={cn(
        "border-b border-slate-100 hidden md:block",
        isCollapsed ? "p-2" : "px-4 py-3"
      )}>
        <Link
          href={`/${orgSlug}/cost-dashboards/overview`}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <div className={cn(
            "flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-[#007A78] to-[#14B8A6] flex items-center justify-center",
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
              <Building2 className="h-4 w-4 text-white" />
            )}
          </div>
          {!isCollapsed && (
            <span className="text-[13px] font-semibold text-slate-900 truncate max-w-[140px]">
              {formattedOrgName}
            </span>
          )}
        </Link>
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
            <div className="pb-2">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/cost-dashboards/overview`, true) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/cost-dashboards/overview`}>
                    <LayoutDashboard className="h-3.5 w-3.5 mr-2" />
                    Overview
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
                    <Receipt className="h-3.5 w-3.5 mr-2" />
                    Subscriptions
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
                    <Sparkles className="h-3.5 w-3.5 mr-2" />
                    GenAI
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
                    <Cloud className="h-3.5 w-3.5 mr-2" />
                    Cloud
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
            <div className="pb-2">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/pipelines/subscription-runs`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/pipelines/subscription-runs`}>
                    <RefreshCw className="h-3.5 w-3.5 mr-2" />
                    Subscription Runs
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
                    <Workflow className="h-3.5 w-3.5 mr-2" />
                    Cost Runs
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
                    <Cpu className="h-3.5 w-3.5 mr-2" />
                    GenAI Runs
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
            <div className="px-4 py-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#007A78] to-[#14B8A6] flex items-center justify-center flex-shrink-0">
                <span className="text-white text-[11px] font-semibold">
                  {getUserInitials(userName)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-slate-900 truncate">
                  {formatUserName(userName)}
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  {userEmail}
                </p>
              </div>
            </div>
          )}
          {isCollapsed && (
            <div className="flex justify-center py-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#007A78] to-[#14B8A6] flex items-center justify-center">
                <span className="text-white text-[11px] font-semibold">
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
            <div className="pb-2">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/integrations/cloud-providers`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/integrations/cloud-providers`}>
                    <Server className="h-3.5 w-3.5 mr-2" />
                    Cloud Providers
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
                    <Brain className="h-3.5 w-3.5 mr-2" />
                    LLM Providers
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
                    <SubscriptionIcon className="h-3.5 w-3.5 mr-2" />
                    Subscriptions
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
                  <User className="h-4 w-4 text-slate-500" />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {!isCollapsed && activeSection === "settings" && (
            <div className="pb-2">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    isActive(`/${orgSlug}/settings/personal`) ? activeItemClass : itemClass
                  )}
                >
                  <Link href={`/${orgSlug}/settings/personal`}>
                    <User className="h-3.5 w-3.5 mr-2" />
                    Profile
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
                      <Building className="h-3.5 w-3.5 mr-2" />
                      Organization
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
                    <BarChart3 className="h-3.5 w-3.5 mr-2" />
                    Usage & Quotas
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
                    <UserPlus className="h-3.5 w-3.5 mr-2" />
                    Team Members
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
                      <CreditCard className="h-3.5 w-3.5 mr-2" />
                      Billing
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
                "h-9 px-3 text-[12px] font-medium text-[#007A78]",
                "hover:bg-[#007A78]/5 rounded-lg mx-2 transition-colors",
                isCollapsed && "justify-center px-2"
              )}
            >
              <Link href="/user-docs" target="_blank">
                <HelpCircle className={cn("h-3.5 w-3.5", isCollapsed ? "" : "mr-2")} />
                {!isCollapsed && "Get Help"}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Sign Out */}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              disabled={isLoading}
              className={cn(
                "h-9 px-3 text-[12px] font-medium text-slate-500",
                "hover:bg-slate-50 hover:text-slate-700 rounded-lg mx-2 transition-colors",
                isCollapsed && "justify-center px-2"
              )}
            >
              <LogOut className={cn("h-3.5 w-3.5", isCollapsed ? "" : "mr-2")} />
              {!isCollapsed && (isLoading ? "Signing out..." : "Sign Out")}
            </SidebarMenuButton>
          </SidebarMenuItem>

        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
