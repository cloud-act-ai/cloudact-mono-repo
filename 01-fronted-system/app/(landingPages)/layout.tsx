"use client"

import type React from "react"
import Link from "next/link"
import { useState, useEffect } from "react"
import { ArrowRight, Menu, X, Shield, Lock, CreditCard } from "lucide-react"
import "./landing.css"
import "./premium.css"

// Static data moved outside component to prevent re-creation on each render
const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/solutions", label: "Solutions" },
  { href: "/resources", label: "Resources" },
  { href: "/about", label: "About" },
] as const

// Comprehensive structured data for AI agents and search engines
const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://cloudact.ai/#organization",
  name: "CloudAct.ai",
  alternateName: "CloudAct",
  url: "https://cloudact.ai",
  logo: {
    "@type": "ImageObject",
    url: "https://cloudact.ai/logo.png",
    width: 512,
    height: 512,
  },
  sameAs: [
    "https://twitter.com/cloudact_ai",
    "https://linkedin.com/company/cloudact",
    "https://github.com/cloudact",
  ],
  description:
    "CloudAct.ai is an enterprise cost intelligence platform that helps engineering teams monitor, analyze, and optimize GenAI and cloud infrastructure costs across AWS, Azure, GCP, OpenAI, Anthropic, and more.",
  foundingDate: "2024",
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+1-800-936-0383",
    contactType: "sales",
    availableLanguage: ["English"],
  },
  address: {
    "@type": "PostalAddress",
    addressCountry: "US",
  },
}

const SOFTWARE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": "https://cloudact.ai/#software",
  name: "CloudAct.ai",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "FinOps, Cloud Cost Management",
  operatingSystem: "Web Browser",
  offers: {
    "@type": "AggregateOffer",
    lowPrice: "0",
    highPrice: "499",
    priceCurrency: "USD",
    offerCount: "3",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.95",
    reviewCount: "14000",
    bestRating: "5",
    worstRating: "1",
  },
  featureList: [
    "Real-time cloud cost tracking",
    "GenAI usage monitoring (OpenAI, Anthropic, Google)",
    "Multi-cloud support (AWS, Azure, GCP)",
    "AI-powered cost optimization recommendations",
    "Custom dashboards and reporting",
    "Budget alerts and forecasting",
    "SOC 2 Type II certified security",
  ],
}

const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://cloudact.ai/#website",
  url: "https://cloudact.ai",
  name: "CloudAct.ai",
  description: "Enterprise GenAI and Cloud Cost Intelligence Platform",
  publisher: { "@id": "https://cloudact.ai/#organization" },
  potentialAction: {
    "@type": "SearchAction",
    target: "https://cloudact.ai/search?q={search_term_string}",
    "query-input": "required name=search_term_string",
  },
}

const JSON_LD_STRING = JSON.stringify([ORGANIZATION_JSON_LD, SOFTWARE_JSON_LD, WEBSITE_JSON_LD])

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    // Guard against SSR - window is not available during server-side rendering
    if (typeof window === "undefined") return

    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    // Check initial scroll position
    handleScroll()
    // Use passive listener for better scroll performance
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <div className="flex min-h-screen flex-col font-sans antialiased bg-white">
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-mint focus:text-black focus:rounded-lg focus:font-medium focus:outline-none focus:ring-2 focus:ring-mint focus:ring-offset-2"
        style={{ zIndex: 'var(--z-skip-link)' }}
      >
        Skip to main content
      </a>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON_LD_STRING }} />
      <header
        className={`sticky top-0 z-50 w-full transition-all duration-300 ${scrolled
          ? "border-b border-gray-200 bg-white/95 backdrop-blur-md shadow-sm"
          : "bg-white"
          }`}
      >
        <div className="container flex h-16 items-center justify-between px-4 md:px-12">
          <Link
            href="/"
            className="flex items-center gap-2 text-2xl md:text-3xl font-bold text-mint-text tracking-tight hover:text-mint-dark transition-colors focus:outline-none focus:ring-2 focus:ring-mint focus:ring-offset-2 rounded-lg px-2 -ml-2"
          >
            CloudAct.ai
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-8" aria-label="Main navigation">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-gray-900 text-[15px] font-medium hover:text-mint-text transition-colors focus:outline-none focus:ring-2 focus:ring-mint focus:ring-offset-2 rounded px-2 py-1"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop Auth Buttons */}
          <div className="hidden md:flex items-center gap-4">
            <Link
              href="/login"
              className="text-ca-blue font-semibold text-sm hover:text-ca-blue-dark hover:underline transition-colors focus:outline-none focus:ring-2 focus:ring-mint focus:ring-offset-2 rounded px-3 py-2"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="cloudact-btn-primary focus:outline-none focus:ring-2 focus:ring-mint focus:ring-offset-2"
            >
              Get Started
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden flex h-10 w-10 items-center justify-center rounded-lg hover:bg-mint/10 transition-colors focus:outline-none focus:ring-2 focus:ring-mint focus:ring-offset-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5 text-mint-text" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5 text-mint-text" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-200 bg-white" role="navigation" aria-label="Mobile navigation">
            <nav className="container px-4 py-6 space-y-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block text-gray-900 text-base font-medium hover:text-mint-text hover:bg-mint/5 transition-colors rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-mint focus:ring-offset-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-4 space-y-3 border-t border-gray-200 mt-4">
                <Link
                  href="/login"
                  className="block py-3 px-3 text-ca-blue font-semibold hover:text-ca-blue-dark hover:bg-mint/5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-mint focus:ring-offset-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="cloudact-btn-primary w-full justify-center focus:outline-none focus:ring-2 focus:ring-mint focus:ring-offset-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      <main id="main-content" className="flex-1 bg-white" tabIndex={-1}>{children}</main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="container px-4 md:px-12 py-12 md:py-16 max-w-[1400px] mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8 mb-12">
            <div className="col-span-2 space-y-4">
              <div className="text-2xl font-bold text-mint-text tracking-tight">
                CloudAct.ai
              </div>
              <p className="text-sm text-gray-600 leading-relaxed max-w-xs">
                The enterprise standard for GenAI and cloud cost intelligence.
              </p>
              <div className="flex gap-4">
                <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-[var(--cloudact-bg-mint)] transition-colors text-gray-600 hover:text-mint-text">
                  <span className="sr-only">X (Twitter)</span>
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                </a>
                <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-[var(--cloudact-bg-mint)] transition-colors text-gray-600 hover:text-mint-text">
                  <span className="sr-only">LinkedIn</span>
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
                </a>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-gray-900">Platform</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/features" className="text-gray-600 hover:text-mint-text transition-colors">Features</Link></li>
                <li><Link href="/pricing" className="text-gray-600 hover:text-mint-text transition-colors">Pricing</Link></li>
                <li><Link href="/solutions" className="text-gray-600 hover:text-mint-text transition-colors">Solutions</Link></li>
                <li><Link href="/changelog" className="text-gray-600 hover:text-mint-text transition-colors">Changelog</Link></li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-gray-900">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/about" className="text-gray-600 hover:text-mint-text transition-colors">About Us</Link></li>
                <li><Link href="/careers" className="text-gray-600 hover:text-mint-text transition-colors">Careers</Link></li>
                <li><Link href="/resources" className="text-gray-600 hover:text-mint-text transition-colors">Resources</Link></li>
                <li><Link href="/contact" className="text-gray-600 hover:text-mint-text transition-colors">Contact</Link></li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-gray-900">Resources</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/blog" className="text-gray-600 hover:text-mint-text transition-colors">Blog</Link></li>
                <li><Link href="/docs" className="text-gray-600 hover:text-mint-text transition-colors">Documentation</Link></li>
                <li><Link href="/help" className="text-gray-600 hover:text-mint-text transition-colors">Help Center</Link></li>
                <li><Link href="/guides" className="text-gray-600 hover:text-mint-text transition-colors">Guides</Link></li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-gray-900">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/privacy" className="text-gray-600 hover:text-mint-text transition-colors">Privacy</Link></li>
                <li><Link href="/terms" className="text-gray-600 hover:text-mint-text transition-colors">Terms</Link></li>
                <li><Link href="/security" className="text-gray-600 hover:text-mint-text transition-colors">Security</Link></li>
                <li><Link href="/compliance" className="text-gray-600 hover:text-mint-text transition-colors">Compliance</Link></li>
              </ul>
            </div>
          </div>

          {/* Trust Badges */}
          <div className="border-t border-gray-200 pt-8">
            <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 mb-8">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Shield className="h-4 w-4 text-mint" />
                <span>SOC 2 Certified</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Lock className="h-4 w-4 text-mint" />
                <span>GDPR Compliant</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CreditCard className="h-4 w-4 text-mint" />
                <span>Secure Payments via Stripe</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
              <p className="text-sm text-gray-600">© 2025 CloudAct.ai. All rights reserved.</p>
              <div className="flex gap-6 text-sm text-gray-600">
                <Link href="/privacy" className="hover:text-mint-text transition-colors">Privacy Policy</Link>
                <Link href="/terms" className="hover:text-mint-text transition-colors">Terms of Service</Link>
                <Link href="/cookies" className="hover:text-mint-text transition-colors">Cookie Policy</Link>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
