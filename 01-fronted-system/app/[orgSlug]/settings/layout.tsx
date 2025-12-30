"use client"

import { usePathname, useParams } from "next/navigation"
import { useRef, useEffect, useState } from "react"
import Link from "next/link"
import {
  User,
  Building2,
  CreditCard,
  Network,
  UserPlus,
  Shield,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

const settingsNav = [
  { id: "personal", label: "Personal", icon: User, href: "personal" },
  { id: "organization", label: "Organization", icon: Building2, href: "organization" },
  { id: "billing", label: "Billing", icon: CreditCard, href: "billing" },
  { id: "hierarchy", label: "Hierarchy", icon: Network, href: "hierarchy" },
  { id: "invite", label: "Team", icon: UserPlus, href: "invite" },
  { id: "security", label: "Security", icon: Shield, href: "security" },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const params = useParams()
  const orgSlug = params.orgSlug as string
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [showLeftFade, setShowLeftFade] = useState(false)
  const [showRightFade, setShowRightFade] = useState(true)

  const getCurrentSection = () => {
    const path = pathname.split("/").pop()
    return settingsNav.find(nav => nav.href === path)?.id || "personal"
  }

  const currentSection = getCurrentSection()

  // Handle scroll position for fade indicators
  const handleScroll = () => {
    const container = scrollContainerRef.current
    if (!container) return

    const { scrollLeft, scrollWidth, clientWidth } = container
    setShowLeftFade(scrollLeft > 8)
    setShowRightFade(scrollLeft < scrollWidth - clientWidth - 8)
  }

  // Scroll to active tab on mount
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const activeTab = container.querySelector('[data-active="true"]')
    if (activeTab) {
      const containerRect = container.getBoundingClientRect()
      const tabRect = activeTab.getBoundingClientRect()
      const scrollLeft = tabRect.left - containerRect.left - 16 + container.scrollLeft
      container.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' })
    }

    handleScroll()
  }, [currentSection])

  // Scroll helpers for chevron buttons
  const scrollLeft = () => {
    scrollContainerRef.current?.scrollBy({ left: -120, behavior: 'smooth' })
  }

  const scrollRight = () => {
    scrollContainerRef.current?.scrollBy({ left: 120, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-white relative">
      {/* Premium gradient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[400px] -right-[200px] w-[800px] h-[800px] rounded-full bg-gradient-to-br from-[#90FCA6]/8 via-transparent to-transparent blur-3xl" />
        <div className="absolute -bottom-[300px] -left-[200px] w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-[#FF6C5E]/5 via-transparent to-transparent blur-3xl" />
      </div>

      {/* Mobile Settings Header - Premium scrollable tabs with fade indicators */}
      <div className="md:hidden sticky top-14 left-0 right-0 z-30 bg-white/95 backdrop-blur-xl border-b border-black/[0.04]">
        <div className="relative">
          {/* Left fade indicator with scroll button */}
          <div
            className={`absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-white/95 via-white/80 to-transparent z-10 flex items-center justify-start pl-1 transition-opacity duration-200 ${
              showLeftFade ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <button
              onClick={scrollLeft}
              className="h-8 w-8 rounded-full bg-white/90 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-700 active:scale-95 transition-all"
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable tabs container */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex items-center gap-2 px-4 py-3 overflow-x-auto scrollbar-hide scroll-smooth"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {settingsNav.map((item) => {
              const isActive = currentSection === item.id
              const Icon = item.icon

              return (
                <Link
                  key={item.id}
                  href={`/${orgSlug}/settings/${item.href}`}
                  data-active={isActive}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-full whitespace-nowrap transition-all flex-shrink-0 ${
                    isActive
                      ? "bg-[#90FCA6] text-black font-semibold shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="text-[13px]">{item.label}</span>
                </Link>
              )
            })}
          </div>

          {/* Right fade indicator with scroll button */}
          <div
            className={`absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white/95 via-white/80 to-transparent z-10 flex items-center justify-end pr-1 transition-opacity duration-200 ${
              showRightFade ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <button
              onClick={scrollRight}
              className="h-8 w-8 rounded-full bg-white/90 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-700 active:scale-95 transition-all"
              aria-label="Scroll right"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area - Extra padding on mobile to account for settings tabs */}
      <main className="relative min-h-screen pt-4 md:pt-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6 lg:py-12">
          {children}
        </div>
      </main>
    </div>
  )
}
