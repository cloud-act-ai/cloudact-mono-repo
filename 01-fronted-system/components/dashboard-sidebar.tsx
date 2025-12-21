"use client"

/**
 * BigQuery-Style Dashboard Sidebar
 *
 * Clean, compact navigation:
 * - Always expanded main sections (Cost Dashboards, Pipelines, Integrations)
 * - Settings section collapsible with chevron
 * - Rounded coral hover/active highlight (no left line)
 * - Icons on all menu items
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
  // Cost Dashboards icons
  LayoutDashboard,
  Receipt,
  Sparkles,
  Cloud,
  // Pipelines icons
  RefreshCw,
  Workflow,
  Cpu,
  // Integrations icons
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
      const isAcronym = acronymPatterns.some(({ replacement }) =>
        word === replacement || word.toUpperCase() === word
      )
      if (isAcronym) return word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(" ")
  return words
}

// Get user initials from name (first letter of first name + first letter of last name)
function getUserInitials(name: string): string {
  if (!name) return "U"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase()
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// Capitalize first letter of each word in name
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
  orgPlan,
  billingStatus,
  memberCount,
  userRole,
  userName,
  userEmail,
  ...props
}: DashboardSidebarProps) {
  const pathname = usePathname()
  const [isLoading, setIsLoading] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoLoading, setLogoLoading] = useState(true)
  const [integrationsExpanded, setIntegrationsExpanded] = useState<boolean>(
    pathname?.includes("/integrations") || true  // Open by default
  )
  const [settingsExpanded, setSettingsExpanded] = useState<boolean>(
    pathname?.includes("/settings") || pathname?.includes("/billing") || true  // Expanded by default
  )

  const formattedOrgName = formatOrgName(orgName)
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  // Fetch org logo with loading state and cleanup to prevent memory leaks
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
        // Don't throw - gracefully fall back to default icon
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
    window.location.href = "/login"
  }

  // Active state helper
  const isActive = (path: string, exact = false) => {
    if (!pathname) return false
    if (exact) return pathname === path
    return pathname === path || pathname.startsWith(path + "/")
  }

  // Rounded coral hover/active styles (no left line)
  const hoverClass = "hover:bg-[#FF6E50]/10 rounded-md mx-2 transition-all duration-150"
  const activeClass = "bg-[#FF6E50]/15 text-[#FF6E50] font-medium rounded-md mx-2"

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-white" {...props}>
      {/* Header: Logo + Org Name - Hidden on mobile (md:block) since MobileHeader shows this */}
      <div className={cn(
        "border-b border-border hidden md:block",
        isCollapsed ? "p-2" : "px-4 py-3"
      )}>
          <Link
            href={`/${orgSlug}/cost-dashboards/overview`}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className={cn(
              "flex-shrink-0 rounded-md overflow-hidden bg-gradient-to-br from-[#007A78] to-[#14B8A6] flex items-center justify-center",
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
              <span className="text-[14px] font-semibold text-[#1C1C1E] truncate max-w-[160px]">
                {formattedOrgName}
              </span>
            )}
          </Link>
        </div>

      <SidebarContent className="px-0 py-1 overflow-y-auto">
        <SidebarMenu className="gap-0">

          {/* Cost Dashboards Section */}
          {!isCollapsed && (
            <div className="pt-2 pb-1 px-4">
              <span className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">
                Cost Dashboards
              </span>
            </div>
          )}
          {isCollapsed && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="h-11 rounded-xl justify-center px-2">
                <Link href={`/${orgSlug}/cost-dashboards/overview`}>
                  <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {!isCollapsed && (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "h-[28px] px-3 text-[13px] font-normal text-[#3C3C43]",
                    hoverClass,
                    isActive(`/${orgSlug}/cost-dashboards/overview`, true) && activeClass
                  )}
                >
                  <Link href={`/${orgSlug}/cost-dashboards/overview`}>
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Cost Overview
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "h-[28px] px-3 text-[13px] font-normal text-[#3C3C43]",
                    hoverClass,
                    isActive(`/${orgSlug}/cost-dashboards/subscription-costs`) && activeClass
                  )}
                >
                  <Link href={`/${orgSlug}/cost-dashboards/subscription-costs`}>
                    <Receipt className="h-4 w-4 mr-2" />
                    Subscription Costs
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "h-[28px] px-3 text-[13px] font-normal text-[#3C3C43]",
                    hoverClass,
                    isActive(`/${orgSlug}/cost-dashboards/genai-costs`) && activeClass
                  )}
                >
                  <Link href={`/${orgSlug}/cost-dashboards/genai-costs`}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    GenAI Costs
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "h-[28px] px-3 text-[13px] font-normal text-[#3C3C43]",
                    hoverClass,
                    isActive(`/${orgSlug}/cost-dashboards/cloud-costs`) && activeClass
                  )}
                >
                  <Link href={`/${orgSlug}/cost-dashboards/cloud-costs`}>
                    <Cloud className="h-4 w-4 mr-2" />
                    Cloud Costs
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </>
          )}

          {/* Pipelines Section */}
          {!isCollapsed && (
            <div className="pt-3 pb-1 px-4">
              <span className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">
                Pipelines
              </span>
            </div>
          )}
          {isCollapsed && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="h-11 rounded-xl justify-center px-2">
                <Link href={`/${orgSlug}/pipelines/subscription-runs`}>
                  <Workflow className="h-4 w-4 text-muted-foreground" />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {!isCollapsed && (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "h-[28px] px-3 text-[13px] font-normal text-[#3C3C43]",
                    hoverClass,
                    isActive(`/${orgSlug}/pipelines/subscription-runs`) && activeClass
                  )}
                >
                  <Link href={`/${orgSlug}/pipelines/subscription-runs`}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Subscription Runs
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "h-[28px] px-3 text-[13px] font-normal text-[#3C3C43]",
                    hoverClass,
                    isActive(`/${orgSlug}/pipelines/cost-runs`) && activeClass
                  )}
                >
                  <Link href={`/${orgSlug}/pipelines/cost-runs`}>
                    <Workflow className="h-4 w-4 mr-2" />
                    Cost Runs
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "h-[28px] px-3 text-[13px] font-normal text-[#3C3C43]",
                    hoverClass,
                    isActive(`/${orgSlug}/pipelines/genai-runs`) && activeClass
                  )}
                >
                  <Link href={`/${orgSlug}/pipelines/genai-runs`}>
                    <Cpu className="h-4 w-4 mr-2" />
                    GenAI Runs
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </>
          )}


        </SidebarMenu>
      </SidebarContent>

      {/* Footer: User Profile + Integrations + Settings + Get Help + Sign Out */}
      <SidebarFooter className="px-0 py-1 mt-auto border-t border-border">
        <SidebarMenu className="gap-0">

          {/* User Profile Section */}
          {!isCollapsed && (
            <div className="px-4 py-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#007A78] to-[#14B8A6] flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-semibold">
                  {getUserInitials(userName)}
                </span>
              </div>
              <span className="text-[15px] font-semibold text-[#1C1C1E] truncate">
                {formatUserName(userName)}
              </span>
            </div>
          )}
          {isCollapsed && (
            <div className="flex justify-center py-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#007A78] to-[#14B8A6] flex items-center justify-center">
                <span className="text-white text-xs font-semibold">
                  {getUserInitials(userName)}
                </span>
              </div>
            </div>
          )}

          {/* Integrations Section - Same style as top sections */}
          {!isCollapsed && (
            <div
              className="pt-3 pb-1 px-4 flex items-center justify-between cursor-pointer hover:bg-[#007A78]/5 transition-all duration-150"
              onClick={() => setIntegrationsExpanded(!integrationsExpanded)}
            >
              <span className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">
                Integrations
              </span>
              {integrationsExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
          )}
          {/* Integrations Sub-items */}
          {integrationsExpanded && !isCollapsed && (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "h-[28px] px-3 text-[13px] font-normal text-[#3C3C43]",
                    hoverClass,
                    isActive(`/${orgSlug}/integrations/cloud-providers`) && activeClass
                  )}
                >
                  <Link href={`/${orgSlug}/integrations/cloud-providers`}>
                    <Server className="h-4 w-4 mr-2" />
                    Cloud Providers
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "h-[28px] px-3 text-[13px] font-normal text-[#3C3C43]",
                    hoverClass,
                    isActive(`/${orgSlug}/integrations/llm`) && activeClass
                  )}
                >
                  <Link href={`/${orgSlug}/integrations/llm`}>
                    <Brain className="h-4 w-4 mr-2" />
                    LLM Providers
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "h-[28px] px-3 text-[13px] font-normal text-[#3C3C43]",
                    hoverClass,
                    isActive(`/${orgSlug}/integrations/subscriptions`) && activeClass
                  )}
                >
                  <Link href={`/${orgSlug}/integrations/subscriptions`}>
                    <SubscriptionIcon className="h-4 w-4 mr-2" />
                    Subscriptions
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </>
          )}

          {/* Settings Section - Same style as top sections */}
          {!isCollapsed && (
            <div
              className="pt-3 pb-1 px-4 flex items-center justify-between cursor-pointer hover:bg-[#007A78]/5 transition-all duration-150"
              onClick={() => setSettingsExpanded(!settingsExpanded)}
            >
              <span className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">
                Settings
              </span>
              {settingsExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
          )}
          {/* Settings Sub-items */}
          {settingsExpanded && !isCollapsed && (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "h-[28px] px-3 text-[13px] font-normal text-[#3C3C43]",
                    hoverClass,
                    isActive(`/${orgSlug}/settings/personal`) && activeClass
                  )}
                >
                  <Link href={`/${orgSlug}/settings/personal`}>
                    <User className="h-4 w-4 mr-2" />
                    Personal
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {userRole === "owner" && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className={cn(
                      "h-[28px] px-3 text-[13px] font-normal text-[#3C3C43]",
                      hoverClass,
                      isActive(`/${orgSlug}/settings/organization`) && activeClass
                    )}
                  >
                    <Link href={`/${orgSlug}/settings/organization`}>
                      <Building className="h-4 w-4 mr-2" />
                      Organization
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "h-[28px] px-3 text-[13px] font-normal text-[#3C3C43]",
                    hoverClass,
                    isActive(`/${orgSlug}/settings/quota-usage`) && activeClass
                  )}
                >
                  <Link href={`/${orgSlug}/settings/quota-usage`}>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Usage & Quotas
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "h-[28px] px-3 text-[13px] font-normal text-[#3C3C43]",
                    hoverClass,
                    isActive(`/${orgSlug}/settings/invite`) && activeClass
                  )}
                >
                  <Link href={`/${orgSlug}/settings/invite`}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Invite
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {userRole === "owner" && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className={cn(
                      "h-[28px] px-3 text-[13px] font-normal text-[#3C3C43]",
                      hoverClass,
                      isActive(`/${orgSlug}/billing`, true) && activeClass
                    )}
                  >
                    <Link href={`/${orgSlug}/billing`}>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Billing
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </>
          )}

          {/* Get Help - Inline with other footer items */}
          <SidebarMenuItem className="mt-2">
            <SidebarMenuButton
              asChild
              className={cn(
                "h-11 px-3 text-[13px] font-normal text-[#007A78]",
                "hover:bg-[#007A78]/10 rounded-xl mx-2 transition-all duration-150 focus-visible:outline-[#007A78] focus-visible:ring-[#007A78]",
                isCollapsed && "justify-center px-2"
              )}
            >
              <Link href="/user-docs" target="_blank">
                <HelpCircle className={cn("h-4 w-4", isCollapsed ? "" : "mr-2")} />
                {!isCollapsed && "Get Help"}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Sign Out - Always visible */}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              disabled={isLoading}
              className={cn(
                "h-11 px-3 text-[13px] font-normal text-[#FF6E50]",
                "hover:bg-[#FF6E50]/10 rounded-xl mx-2 transition-all duration-150 focus-visible:outline-[#007A78] focus-visible:ring-[#007A78]",
                isCollapsed && "justify-center px-2"
              )}
            >
              <LogOut className={cn("h-4 w-4", isCollapsed ? "" : "mr-2")} />
              {!isCollapsed && (isLoading ? "Signing out..." : "Sign Out")}
            </SidebarMenuButton>
          </SidebarMenuItem>

        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
