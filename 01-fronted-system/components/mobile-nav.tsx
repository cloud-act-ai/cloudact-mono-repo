"use client"

/**
 * Mobile Navigation Overlay
 *
 * Flat grouped navigation matching desktop sidebar.
 * Full dark mode support. Theme toggle in footer.
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
  Building,
  UserPlus,
  BarChart3,
  HelpCircle,
  LogOut,
  Network,
  Bell,
  AlertTriangle,
  Calendar,
  History,
  Settings,
  MessageSquare,
  FileText,
  Minus,
  Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { getOrgDetails } from "@/actions/organization-locale"

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

// --- Navigation Data (same structure as sidebar) ---
interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
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
        { title: "Chat", href: `/${orgSlug}/chat`, icon: MessageSquare },
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
        { title: "Subscriptions", href: `/${orgSlug}/integrations/subscriptions`, icon: CreditCard },
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
      <div className="absolute inset-y-0 left-0 w-[280px] bg-white shadow-xl flex flex-col animate-in slide-in-from-left duration-200 z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg overflow-hidden bg-white border border-slate-200 shadow-sm flex items-center justify-center flex-shrink-0">
              {logoUrl ? (
                <Image src={logoUrl} alt={formattedOrgName} width={36} height={36} className="object-contain" />
              ) : (
                <Building2 className="h-4 w-4 text-slate-400" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-black text-slate-900 tracking-wide uppercase leading-tight truncate">
                {formattedOrgName}
              </p>
              <p className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase leading-tight">
                Cost Analytics
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Navigation Content - OpenClaw grouped style */}
        <div className="flex-1 overflow-y-auto py-1">
          {navGroups.map((group) => {
            const isGroupCollapsed = collapsedGroups.has(group.label)
            return (
              <div key={group.label}>
                {/* Group Label with toggle */}
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full px-4 pt-4 pb-2 flex items-center justify-between group cursor-pointer"
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

                {/* Group Items */}
                {!isGroupCollapsed && (
                  <div className="px-2 pb-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const active = item.placeholder ? false : isActive(item.href.split("?")[0], item.href.endsWith("/dashboard"))

                      return (
                        <button
                          key={item.href}
                          type="button"
                          onClick={() => !item.placeholder && handleNavigation(item.href)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors rounded-lg min-h-[42px]",
                            active
                              ? "bg-[#90FCA6]/15 text-slate-900 font-semibold"
                              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                            item.placeholder && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <Icon className={cn(
                            "h-4 w-4 flex-shrink-0",
                            active ? "text-[#16a34a]" : ""
                          )} />
                          <span className="text-sm">{item.title}</span>
                          {item.placeholder && (
                            <span className="ml-auto text-[11px] font-medium text-[var(--cloudact-coral)] bg-[var(--cloudact-coral)]/10 px-1.5 py-0.5 rounded-full">
                              Beta
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
        <div className="border-t border-slate-100 p-4 space-y-3">
          {/* User Info */}
          <button
            type="button"
            onClick={() => handleNavigation(`/${orgSlug}/settings/personal`)}
            className={cn(
              "w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors min-h-[44px]",
              isActive(`/${orgSlug}/settings/personal`)
                ? "bg-slate-100"
                : "hover:bg-slate-50"
            )}
          >
            <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-[var(--cloudact-mint)] to-[var(--cloudact-mint-light)]">
              <span className="text-[var(--cloudact-mint-text)] text-[11px] font-semibold">
                {getUserInitials(userName)}
              </span>
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-xs font-semibold text-slate-900 truncate">{userName}</p>
              <p className="text-xs text-slate-500 truncate">{userEmail}</p>
            </div>
          </button>

          {/* Actions */}
          <div className="flex gap-2">
            <Link
              href="/user-docs"
              target="_blank"
              className="flex-1 flex items-center justify-center gap-2 h-10 px-3 text-[11px] font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Help
            </Link>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex-1 flex items-center justify-center gap-2 h-10 px-3 text-[11px] font-medium text-slate-500 bg-slate-50 hover:bg-slate-100 hover:text-slate-700 rounded-lg transition-colors"
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
