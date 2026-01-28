"use client"

import type React from "react"
import Link from "next/link"
import Image from "next/image"
import { useState, useEffect } from "react"
import {
  ArrowRight,
  Menu,
  X,
  ChevronDown,
  Mail,
  Phone,
  MapPin,
} from "lucide-react"
import "./landing.css"
import "./premium.css"
import { site } from "@/lib/site"

// Clean Menu Data Structure (C3.ai style - no icons)
const PLATFORM_MENU = {
  title: "Platform",
  columns: [
    {
      heading: "Products",
      items: [
        { href: "/features#genai", title: "GenAI Costs", desc: "Track OpenAI, Anthropic & LLM spending" },
        { href: "/features#cloud", title: "Cloud Infrastructure", desc: "AWS, Azure, GCP cost management" },
        { href: "/features#saas", title: "SaaS Subscriptions", desc: "Monitor all your SaaS spending" },
      ],
    },
    {
      heading: "Capabilities",
      items: [
        { href: "/features#analytics", title: "Analytics & Reports", desc: "AI-powered insights and forecasting" },
        { href: "/features#alerts", title: "Smart Alerts", desc: "Anomaly detection and notifications" },
        { href: "/features#optimization", title: "Cost Optimization", desc: "Automated savings recommendations" },
      ],
    },
  ],
}

const SOLUTIONS_MENU = {
  title: "Solutions",
  columns: [
    {
      heading: "By Role",
      items: [
        { href: "/solutions#engineering", title: "Engineering Teams", desc: "Cost visibility and attribution" },
        { href: "/solutions#finops", title: "FinOps Teams", desc: "Enterprise cost intelligence" },
        { href: "/solutions#finance", title: "Finance Teams", desc: "Budget management and reporting" },
      ],
    },
    {
      heading: "By Company",
      items: [
        { href: "/solutions#startups", title: "Startups", desc: "Scale with cost control" },
        { href: "/solutions#enterprise", title: "Enterprise", desc: "Security, SSO, and compliance" },
        { href: "/solutions#partners", title: "Partners & MSPs", desc: "Multi-tenant management" },
      ],
    },
  ],
}

const RESOURCES_MENU = {
  title: "Resources",
  columns: [
    {
      heading: "Learn",
      items: [
        { href: "/resources", title: "Blog & Guides", desc: "FinOps best practices" },
        { href: "/resources#documentation", title: "Documentation", desc: "API reference and guides" },
        { href: "/resources#case-studies", title: "Case Studies", desc: "Customer success stories" },
      ],
    },
  ],
}

const COMPANY_MENU = {
  title: "Company",
  columns: [
    {
      heading: "About",
      items: [
        { href: "/about", title: "About Us", desc: "Our mission and story" },
        { href: "/careers", title: "Careers", desc: "Join our team" },
        { href: "/contact", title: "Contact", desc: "Get in touch" },
      ],
    },
    {
      heading: "Connect",
      items: [
        { href: "/partners", title: "Partners", desc: "Partner with us" },
        { href: "/investors", title: "Investors", desc: "Investor relations" },
        { href: "/press", title: "Press", desc: "Media inquiries" },
      ],
    },
  ],
}

// Comprehensive structured data for AI agents and search engines
const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${site.url}/#organization`,
  name: site.name,
  alternateName: site.company,
  url: site.url,
  logo: {
    "@type": "ImageObject",
    url: `${site.url}/android-chrome-512x512.png`,
    width: 512,
    height: 512,
  },
  sameAs: [
    site.social.twitter,
    site.social.linkedin,
    site.social.github,
  ],
  description:
    `${site.name} is an enterprise cost intelligence platform that helps engineering teams monitor, analyze, and optimize GenAI and cloud infrastructure costs across AWS, Azure, GCP, OpenAI, Anthropic, and more.`,
  foundingDate: "2024",
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+1-850-988-7471",
    contactType: "sales",
    availableLanguage: ["English"],
  },
  address: {
    "@type": "PostalAddress",
    streetAddress: "100 S Murphy Ave, STE 200 PMB4013",
    addressLocality: "Sunnyvale",
    addressRegion: "CA",
    postalCode: "94086",
    addressCountry: "US",
  },
}

const SOFTWARE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": `${site.url}/#software`,
  name: site.name,
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
    "Enterprise-grade security",
  ],
}

const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${site.url}/#website`,
  url: site.url,
  name: site.name,
  description: "Enterprise GenAI and Cloud Cost Intelligence Platform",
  publisher: { "@id": `${site.url}/#organization` },
  potentialAction: {
    "@type": "SearchAction",
    target: `${site.url}/search?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
}

const JSON_LD_STRING = JSON.stringify([ORGANIZATION_JSON_LD, SOFTWARE_JSON_LD, WEBSITE_JSON_LD])

// Desktop Mega Menu Dropdown (C3.ai style - clean columns, no icons)
function MegaMenuDropdown({ menu }: { menu: typeof PLATFORM_MENU }) {
  return (
    <div className="ca-nav-item">
      <button type="button" className="ca-nav-item-trigger" aria-expanded="false" aria-haspopup="true">
        {menu.title}
        <ChevronDown aria-hidden="true" />
      </button>
      <div className="ca-mega-menu">
        <div className="ca-mega-menu-columns">
          {menu.columns.map((column) => (
            <div key={column.heading} className="ca-mega-menu-column">
              <div className="ca-mega-menu-column-heading">{column.heading}</div>
              <ul className="ca-mega-menu-column-list">
                {column.items.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="ca-mega-menu-link">
                      <span className="ca-mega-menu-link-title">{item.title}</span>
                      <span className="ca-mega-menu-link-desc">{item.desc}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Mobile Accordion Menu (C3.ai style - clean text, no icons)
function MobileAccordion({
  menu,
  isOpen,
  onToggle,
  onLinkClick,
}: {
  menu: typeof PLATFORM_MENU
  isOpen: boolean
  onToggle: () => void
  onLinkClick: () => void
}) {
  return (
    <div className="ca-mobile-accordion">
      <button
        type="button"
        className="ca-mobile-accordion-trigger"
        onClick={onToggle}
        aria-expanded={isOpen}
        data-open={isOpen}
      >
        {menu.title}
        <ChevronDown aria-hidden="true" />
      </button>
      <div className="ca-mobile-accordion-content" data-open={isOpen}>
        {menu.columns.map((column) => (
          <div key={column.heading} className="ca-mobile-accordion-group">
            <div className="ca-mobile-accordion-heading">{column.heading}</div>
            {column.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="ca-mobile-accordion-item"
                onClick={onLinkClick}
              >
                {item.title}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [openAccordion, setOpenAccordion] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    handleScroll()
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileMenuOpen])

  // Close mobile menu on route change
  const handleMobileLinkClick = () => {
    setMobileMenuOpen(false)
    setOpenAccordion(null)
  }

  return (
    <div className="ca-page-wrapper">
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="ca-skip-link"
      >
        Skip to main content
      </a>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON_LD_STRING }} />

      {/* Premium Header with Mega Menu */}
      <header className={`ca-header ${scrolled ? 'ca-header-scrolled' : ''}`}>
        <div className="ca-header-inner">
          <Link href="/" className="ca-header-logo">
            {/* FIX BUG-001: Remove CSS height/width overrides to prevent aspect ratio warning */}
            <Image
              src="/logos/cloudact-logo-black.svg"
              alt={site.name}
              width={160}
              height={32}
              priority
            />
          </Link>

          {/* Desktop Navigation with Mega Menus */}
          <nav className="ca-nav-desktop" aria-label="Main navigation">
            <Link href="/" className="ca-nav-link">
              Home
            </Link>
            <MegaMenuDropdown menu={PLATFORM_MENU} />
            <MegaMenuDropdown menu={SOLUTIONS_MENU} />
            <Link href="/pricing" className="ca-nav-link">
              Pricing
            </Link>
            <Link href="/user-docs" className="ca-nav-link">
              Docs
            </Link>
            <MegaMenuDropdown menu={COMPANY_MENU} />
          </nav>

          {/* Desktop Auth Buttons */}
          <div className="ca-header-actions">
            <Link href="/login" className="ca-nav-link-signin">
              Sign In
            </Link>
            <Link href="/signup" className="ca-btn ca-btn-primary">
              Get Started
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            className="ca-mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      {/* Mobile Menu with Accordions - OUTSIDE header to avoid backdrop-filter stacking context issue */}
      {mobileMenuOpen && (
        <div id="mobile-menu" className="ca-mobile-menu" role="navigation" aria-label="Mobile navigation">
          <nav className="ca-mobile-menu-nav">
            <Link
              href="/"
              className="ca-mobile-nav-link"
              onClick={handleMobileLinkClick}
            >
              Home
            </Link>
            <MobileAccordion
              menu={PLATFORM_MENU}
              isOpen={openAccordion === "platform"}
              onToggle={() => setOpenAccordion(openAccordion === "platform" ? null : "platform")}
              onLinkClick={handleMobileLinkClick}
            />
            <MobileAccordion
              menu={SOLUTIONS_MENU}
              isOpen={openAccordion === "solutions"}
              onToggle={() => setOpenAccordion(openAccordion === "solutions" ? null : "solutions")}
              onLinkClick={handleMobileLinkClick}
            />
            <Link
              href="/pricing"
              className="ca-mobile-nav-link"
              onClick={handleMobileLinkClick}
            >
              Pricing
            </Link>
            <Link
              href="/user-docs"
              className="ca-mobile-nav-link"
              onClick={handleMobileLinkClick}
            >
              Docs
            </Link>
            <MobileAccordion
              menu={COMPANY_MENU}
              isOpen={openAccordion === "company"}
              onToggle={() => setOpenAccordion(openAccordion === "company" ? null : "company")}
              onLinkClick={handleMobileLinkClick}
            />

            <div className="ca-mobile-menu-divider" />

            <Link
              href="/login"
              className="ca-mobile-nav-link"
              onClick={handleMobileLinkClick}
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="ca-btn ca-btn-primary ca-btn-lg ca-mobile-cta"
              onClick={handleMobileLinkClick}
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </Link>
          </nav>
        </div>
      )}

      <main id="main-content" className="ca-main" tabIndex={-1}>{children}</main>

      {/* Premium Footer */}
      <footer className="ca-footer">
        <div className="ca-footer-inner">
          {/* Footer Grid */}
          <div className="ca-footer-grid">
            {/* Brand Column */}
            <div className="ca-footer-brand">
              <Link href="/" className="ca-footer-logo">
                {/* FIX BUG-001: Remove CSS height/width overrides */}
                <Image
                  src="/logos/cloudact-logo-black.svg"
                  alt={site.name}
                  width={140}
                  height={28}
                />
              </Link>
              <p className="ca-footer-tagline">
                Enterprise GenAI, Cloud & Subscription Cost Management
              </p>

              {/* Contact Info */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <MapPin className="w-4 h-4" />
                  <span>100 S Murphy Ave, STE 200 PMB4013, Sunnyvale, CA 94086</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Phone className="w-4 h-4" />
                  <a href="tel:+18509887471" className="hover:text-gray-900">(850) 988-7471</a>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Mail className="w-4 h-4" />
                  <a href="mailto:info@cloudact.ai" className="hover:text-gray-900">info@cloudact.ai</a>
                </div>
              </div>

              <div className="ca-footer-social mt-4">
                <a href="https://twitter.com/cloudact_ai" target="_blank" rel="noopener noreferrer" className="ca-social-link" aria-label="X (Twitter)">
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                </a>
                <a href="https://linkedin.com/company/cloudact" target="_blank" rel="noopener noreferrer" className="ca-social-link" aria-label="LinkedIn">
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
                </a>
                <a href="https://github.com/cloudact" target="_blank" rel="noopener noreferrer" className="ca-social-link" aria-label="GitHub">
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
                </a>
              </div>
            </div>

            {/* Links Columns */}
            <div className="ca-footer-links-group">
              <div className="ca-footer-col">
                <h4 className="ca-footer-heading">Platform</h4>
                <ul className="ca-footer-links">
                  <li><Link href="/features">Features</Link></li>
                  <li><Link href="/pricing">Pricing</Link></li>
                  <li><Link href="/solutions">Solutions</Link></li>
                  <li><Link href="/demo">Request Demo</Link></li>
                </ul>
              </div>
              <div className="ca-footer-col">
                <h4 className="ca-footer-heading">Company</h4>
                <ul className="ca-footer-links">
                  <li><Link href="/about">About Us</Link></li>
                  <li><Link href="/careers">Careers</Link></li>
                  <li><Link href="/partners">Partners</Link></li>
                  <li><Link href="/investors">Investors</Link></li>
                  <li><Link href="/contact">Contact Us</Link></li>
                </ul>
              </div>
              <div className="ca-footer-col">
                <h4 className="ca-footer-heading">Legal</h4>
                <ul className="ca-footer-links">
                  <li><Link href="/privacy">Privacy</Link></li>
                  <li><Link href="/terms">Terms</Link></li>
                  <li><Link href="/security">Security</Link></li>
                  <li><Link href="/compliance">Compliance</Link></li>
                </ul>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="ca-footer-bottom">
            <p className="ca-footer-copyright">&copy; {new Date().getFullYear()} {site.company} All rights reserved.</p>
            <div className="ca-footer-legal-links">
              <Link href="/privacy">Privacy Policy</Link>
              <Link href="/terms">Terms of Service</Link>
              <Link href="/cookies">Cookie Policy</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
