"use client"

/**
 * Mobile Navigation Overlay
 *
 * Full-screen navigation for mobile devices with:
 * - Clean editorial design matching desktop sidebar
 * - Accordion sections (one open at a time)
 * - Coral hover/active highlights
 *
 * Main Content:
 * - Dashboard, Cost Analytics, Pipelines, Integrations, Org Settings
 *
 * Footer:
 * - User Profile (clickable → /settings/personal)
 * - Get Help, Sign Out
 */

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import Image from "next/image"
import {
  X,
  Building2,
  LayoutDashboard,
  Receipt,
  Sparkles,
  Cloud,
  RefreshCw,
  Workflow,
  Cpu,
  Server,
  Brain,
  CreditCard,
  User,
  Building,
  UserPlus,
  BarChart3,
  HelpCircle,
  LogOut,
  ChevronDown,
  ChevronRight,
  Network,
  TrendingUp,
  Bell,
  AlertTriangle,
  Calendar,
  History,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { getOrgDetails } from "@/actions/organization-locale"

type SectionId = "cost-analytics" | "pipelines" | "integrations" | "notifications" | "settings" | null

interface MobileNavProps {
  isOpen: boolean
  onClose: () => void
  orgSlug: string
  orgName: string
  userName: string
  userEmail: string
  userRole: string
}

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
  // Accordion: only one section open at a time (null = all collapsed)
  const [activeSection, setActiveSection] = useState<SectionId>("cost-analytics")
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const formattedOrgName = formatOrgName(orgName)

  // Auto-expand section based on current route
  useEffect(() => {
    if (!pathname) return

    // Dashboard is a direct link, not a section
    if (pathname.includes("/cost-dashboards") && !pathname.includes("/cost-dashboards/overview")) {
      // GenAI, Cloud, Subscription costs go to cost-analytics
      setActiveSection("cost-analytics")
    } else if (pathname.includes("/pipelines")) {
      setActiveSection("pipelines")
    } else if (pathname.includes("/integrations")) {
      setActiveSection("integrations")
    } else if (pathname.includes("/notifications")) {
      setActiveSection("notifications")
    } else if (pathname.includes("/settings") || pathname.includes("/billing")) {
      setActiveSection("settings")
    }
  }, [pathname])

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
          console.warn("[MobileNav] Failed to fetch org logo:", logoError)
        }
      }
    }
    fetchLogo()

    return () => {
      isMounted = false
    }
  }, [orgSlug])

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  const handleNavigation = (href: string) => {
    router.push(href)
    // Close after navigation starts
    setTimeout(() => onClose(), 150)
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    // AUTH-004/005: Server-side auth cache has 5-second TTL, no client-side clearing needed
    window.location.href = "/login"
  }

  const isActive = (path: string, exact = false) => {
    if (!pathname) return false
    if (exact) return pathname === path
    return pathname === path || pathname.startsWith(path + "/")
  }

  const toggleSection = (section: SectionId) => {
    // Toggle: collapse if same section clicked, otherwise expand new section
    setActiveSection((prev) => (prev === section ? null : section))
  }

  if (!isOpen) return null

  const NavItem = ({
    href,
    icon: Icon,
    label,
    isItemActive,
  }: {
    href: string
    icon: React.ComponentType<{ className?: string }>
    label: string
    isItemActive: boolean
  }) => (
    <button
      type="button"
      onClick={() => handleNavigation(href)}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors rounded-lg min-h-[44px]",
        isItemActive
          ? "bg-[var(--cloudact-coral)]/10 text-[var(--cloudact-coral)] font-semibold"
          : "text-slate-600 hover:bg-[var(--cloudact-coral)]/10 hover:text-[var(--cloudact-coral)]"
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="text-[13px]">{label}</span>
    </button>
  )

  const SectionHeader = ({
    title,
    section,
    isExpanded,
  }: {
    title: string
    section: Exclude<SectionId, null>
    isExpanded: boolean
  }) => (
    <button
      type="button"
      onClick={() => toggleSection(section)}
      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors min-h-[44px]"
    >
      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
        {title}
      </span>
      {isExpanded ? (
        <ChevronDown className="h-4 w-4 text-slate-400" />
      ) : (
        <ChevronRight className="h-4 w-4 text-slate-400" />
      )}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Navigation Panel - z-10 ensures it's above the backdrop */}
      <div className="absolute inset-y-0 left-0 w-[280px] bg-white shadow-xl flex flex-col animate-in slide-in-from-left duration-200 z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg overflow-hidden bg-white border border-gray-200 shadow-sm flex items-center justify-center flex-shrink-0">
              {logoUrl ? (
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
            <span className="text-[13px] font-semibold text-slate-900 truncate">
              {formattedOrgName}
            </span>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Navigation Content */}
        <div className="flex-1 overflow-y-auto py-4">
          {/* Dashboard - Direct link to main summary dashboard */}
          <div className="px-2 pb-2">
            <button
              type="button"
              onClick={() => handleNavigation(`/${orgSlug}/dashboard`)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors rounded-lg min-h-[44px]",
                isActive(`/${orgSlug}/dashboard`, true)
                  ? "bg-[var(--cloudact-coral)]/10 text-[var(--cloudact-coral)] font-semibold"
                  : "text-slate-600 hover:bg-[var(--cloudact-coral)]/10 hover:text-[var(--cloudact-coral)]"
              )}
            >
              <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
              <span className="text-[13px]">Dashboard</span>
            </button>
          </div>

          {/* Cost Analytics */}
          <SectionHeader
            title="Cost Analytics"
            section="cost-analytics"
            isExpanded={activeSection === "cost-analytics"}
          />
          {activeSection === "cost-analytics" && (
            <div className="px-2 pb-2 space-y-0.5">
              <NavItem
                href={`/${orgSlug}/cost-dashboards/overview`}
                icon={BarChart3}
                label="Overview"
                isItemActive={isActive(`/${orgSlug}/cost-dashboards/overview`, true)}
              />
              <NavItem
                href={`/${orgSlug}/cost-dashboards/genai-costs`}
                icon={Sparkles}
                label="GenAI"
                isItemActive={isActive(`/${orgSlug}/cost-dashboards/genai-costs`)}
              />
              <NavItem
                href={`/${orgSlug}/cost-dashboards/cloud-costs`}
                icon={Cloud}
                label="Cloud"
                isItemActive={isActive(`/${orgSlug}/cost-dashboards/cloud-costs`)}
              />
              <NavItem
                href={`/${orgSlug}/cost-dashboards/subscription-costs`}
                icon={Receipt}
                label="Subscription"
                isItemActive={isActive(`/${orgSlug}/cost-dashboards/subscription-costs`)}
              />
            </div>
          )}

          {/* Pipelines */}
          <SectionHeader
            title="Pipelines"
            section="pipelines"
            isExpanded={activeSection === "pipelines"}
          />
          {activeSection === "pipelines" && (
            <div className="px-2 pb-2 space-y-0.5">
              <NavItem
                href={`/${orgSlug}/pipelines/subscription-runs`}
                icon={RefreshCw}
                label="Subscription Runs"
                isItemActive={isActive(`/${orgSlug}/pipelines/subscription-runs`)}
              />
              <NavItem
                href={`/${orgSlug}/pipelines/cloud-runs`}
                icon={Workflow}
                label="Cloud Runs"
                isItemActive={isActive(`/${orgSlug}/pipelines/cloud-runs`)}
              />
              <NavItem
                href={`/${orgSlug}/pipelines/genai-runs`}
                icon={Cpu}
                label="GenAI Runs"
                isItemActive={isActive(`/${orgSlug}/pipelines/genai-runs`)}
              />
            </div>
          )}

          {/* Integrations - Moved to main nav for better accessibility */}
          <SectionHeader
            title="Integrations"
            section="integrations"
            isExpanded={activeSection === "integrations"}
          />
          {activeSection === "integrations" && (
            <div className="px-2 pb-2 space-y-0.5">
              <NavItem
                href={`/${orgSlug}/integrations/cloud-providers`}
                icon={Server}
                label="Cloud Providers"
                isItemActive={isActive(`/${orgSlug}/integrations/cloud-providers`)}
              />
              <NavItem
                href={`/${orgSlug}/integrations/genai`}
                icon={Brain}
                label="GenAI Providers"
                isItemActive={isActive(`/${orgSlug}/integrations/genai`)}
              />
              <NavItem
                href={`/${orgSlug}/integrations/subscriptions`}
                icon={CreditCard}
                label="Subscriptions"
                isItemActive={isActive(`/${orgSlug}/integrations/subscriptions`)}
              />
            </div>
          )}

          {/* Notifications */}
          <SectionHeader
            title="Notifications"
            section="notifications"
            isExpanded={activeSection === "notifications"}
          />
          {activeSection === "notifications" && (
            <div className="px-2 pb-2 space-y-0.5">
              <NavItem
                href={`/${orgSlug}/notifications`}
                icon={Bell}
                label="Overview"
                isItemActive={isActive(`/${orgSlug}/notifications`, true)}
              />
              <NavItem
                href={`/${orgSlug}/notifications?tab=channels`}
                icon={Settings}
                label="Channels"
                isItemActive={false}
              />
              <NavItem
                href={`/${orgSlug}/notifications?tab=alerts`}
                icon={AlertTriangle}
                label="Alert Rules"
                isItemActive={false}
              />
              <NavItem
                href={`/${orgSlug}/notifications?tab=summaries`}
                icon={Calendar}
                label="Summaries"
                isItemActive={false}
              />
              <NavItem
                href={`/${orgSlug}/notifications?tab=history`}
                icon={History}
                label="History"
                isItemActive={false}
              />
            </div>
          )}

          {/* Org Settings - Moved to main nav for better accessibility */}
          <SectionHeader
            title="Org Settings"
            section="settings"
            isExpanded={activeSection === "settings"}
          />
          {activeSection === "settings" && (
            <div className="px-2 pb-2 space-y-0.5">
              {userRole === "owner" && (
                <NavItem
                  href={`/${orgSlug}/settings/organization`}
                  icon={Building}
                  label="Organization"
                  isItemActive={isActive(`/${orgSlug}/settings/organization`)}
                />
              )}
              {userRole === "owner" && (
                <NavItem
                  href={`/${orgSlug}/settings/hierarchy`}
                  icon={Network}
                  label="Hierarchy"
                  isItemActive={isActive(`/${orgSlug}/settings/hierarchy`)}
                />
              )}
              <NavItem
                href={`/${orgSlug}/settings/quota-usage`}
                icon={BarChart3}
                label="Usage & Quotas"
                isItemActive={isActive(`/${orgSlug}/settings/quota-usage`)}
              />
              <NavItem
                href={`/${orgSlug}/settings/invite`}
                icon={UserPlus}
                label="Invite"
                isItemActive={isActive(`/${orgSlug}/settings/invite`)}
              />
              {userRole === "owner" && (
                <NavItem
                  href={`/${orgSlug}/billing`}
                  icon={CreditCard}
                  label="Billing"
                  isItemActive={isActive(`/${orgSlug}/billing`, true)}
                />
              )}
            </div>
          )}

        </div>

        {/* Compact Footer - User Info & Actions */}
        <div className="border-t border-slate-100 p-4 space-y-3">
          {/* User Info - Clickable to navigate to profile */}
          <button
            type="button"
            onClick={() => handleNavigation(`/${orgSlug}/settings/personal`)}
            className={cn(
              "w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors min-h-[44px]",
              isActive(`/${orgSlug}/settings/personal`)
                ? "bg-[var(--cloudact-mint)]/10"
                : "hover:bg-slate-50"
            )}
          >
            <div className={cn(
              "h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all",
              isActive(`/${orgSlug}/settings/personal`)
                ? "bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)] ring-2 ring-[var(--cloudact-mint)]/30"
                : "bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)]"
            )}>
              <span className="text-[var(--cloudact-mint-text)] text-[11px] font-semibold">
                {getUserInitials(userName)}
              </span>
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[12px] font-semibold text-slate-900 truncate">
                {userName}
              </p>
              <p className="text-[10px] text-slate-500 truncate">
                {userEmail}
              </p>
            </div>
          </button>

          {/* Actions */}
          <div className="flex gap-2">
            <Link
              href="/user-docs"
              target="_blank"
              className="flex-1 flex items-center justify-center gap-2 h-10 px-3 text-[12px] font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Help
            </Link>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex-1 flex items-center justify-center gap-2 h-10 px-3 text-[12px] font-medium text-slate-500 bg-slate-50 hover:bg-slate-100 hover:text-slate-700 rounded-lg transition-colors"
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
