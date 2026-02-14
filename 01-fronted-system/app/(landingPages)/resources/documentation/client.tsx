"use client"

import Link from "next/link"
import { site } from "@/lib/site"
import {
  ArrowRight,
  FileCode,
  BookOpen,
  Code,
  Sparkles,
  ArrowLeft,
  Terminal,
  Puzzle,
  Shield,
  Zap,
} from "lucide-react"

// Documentation sections
const DOC_SECTIONS = [
  {
    id: "getting-started",
    icon: Zap,
    title: "Getting Started",
    description: "Quick start guides and first steps",
    links: [
      { title: "Quick Start Guide", href: "/docs/quick-start" },
      { title: "Installation", href: "/docs/installation" },
      { title: "First Pipeline", href: "/docs/first-pipeline" },
    ],
    color: "mint",
  },
  {
    id: "api-reference",
    icon: Code,
    title: "API Reference",
    description: "Complete API documentation",
    links: [
      { title: "REST API", href: "/docs/api/reference" },
      { title: "Authentication", href: "/docs/api/auth" },
      { title: "Rate Limits", href: "/docs/api/rate-limits" },
    ],
    color: "coral",
  },
  {
    id: "integrations",
    icon: Puzzle,
    title: "Integrations",
    description: "Connect your cloud providers",
    links: [
      { title: "AWS Integration", href: "/docs/integrations/aws" },
      { title: "GCP Integration", href: "/docs/integrations/gcp" },
      { title: "Azure Integration", href: "/docs/integrations/azure" },
    ],
    color: "blue",
  },
  {
    id: "security",
    icon: Shield,
    title: "Security & Compliance",
    description: "Security practices and compliance",
    links: [
      { title: "Security Overview", href: "/docs/security" },
      { title: "SOC 2 Compliance", href: "/docs/compliance/soc2" },
      { title: "Data Handling", href: "/docs/security/data" },
    ],
    color: "purple",
  },
]

// Popular docs
const POPULAR_DOCS = [
  {
    id: "api-reference",
    category: "API",
    title: "API Reference & Integration Guide",
    description: "Complete documentation for integrating CloudAct.ai with your cloud providers and existing workflows.",
    href: "/docs/api/reference",
  },
  {
    id: "webhooks",
    category: "API",
    title: "Webhooks & Events",
    description: "Set up real-time notifications for cost anomalies, budget alerts, and system events.",
    href: "/docs/api/webhooks",
  },
  {
    id: "sdk-python",
    category: "SDK",
    title: "Python SDK Documentation",
    description: "Install and use the CloudAct Python SDK for programmatic access to cost data.",
    href: "/docs/sdk/python",
  },
  {
    id: "terraform",
    category: "Infrastructure",
    title: "Terraform Provider",
    description: "Manage CloudAct resources as code with our official Terraform provider.",
    href: "/docs/terraform",
  },
]

export function DocumentationPageClient() {
  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <Link href="/resources" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Resources
          </Link>
          <div className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <FileCode className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Documentation
          </div>
          <h1 className="ca-page-hero-title">
            Developer{" "}
            <span className="font-semibold">Documentation</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            Complete API reference, integration guides, and developer documentation for CloudAct.ai.
          </p>

          {/* Quick links */}
          <div className="flex flex-wrap gap-3 mt-6">
            <Link
              href="/docs/quick-start"
              className="ca-btn-hero-primary"
              style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}
            >
              <Zap className="w-4 h-4" />
              Quick Start
            </Link>
            <Link
              href="/docs/api/reference"
              className="ca-btn-hero-secondary"
              style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}
            >
              <Terminal className="w-4 h-4" />
              API Reference
            </Link>
          </div>
        </div>
      </section>

      {/* Documentation Sections */}
      <section className="ca-resources-categories-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <BookOpen className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Browse Docs
          </span>
          <h2 className="ca-section-title">Documentation Sections</h2>
          <p className="ca-section-subtitle">
            Find what you need to integrate and build with CloudAct.ai
          </p>
        </div>

        <div className="ca-resources-categories-grid">
          {DOC_SECTIONS.map((section) => {
            const Icon = section.icon
            return (
              <div
                key={section.id}
                className={`ca-resources-category-card ca-resources-category-${section.color}`}
              >
                <div className={`ca-resources-category-icon ca-resources-category-icon-${section.color}`}>
                  <Icon className="w-7 h-7" aria-hidden="true" />
                </div>
                <h3 className="ca-resources-category-title">{section.title}</h3>
                <p className="ca-resources-category-desc">{section.description}</p>
                <ul className="mt-4 space-y-2">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
                      >
                        <ArrowRight className="w-3 h-3" />
                        {link.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      {/* Popular Docs */}
      <section className="ca-resources-featured-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Sparkles className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Popular
          </span>
          <h2 className="ca-section-title">Most Viewed Documentation</h2>
          <p className="ca-section-subtitle">
            The docs developers access most frequently
          </p>
        </div>

        <div className="ca-resources-featured-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {POPULAR_DOCS.map((doc) => (
            <Link
              key={doc.id}
              href={doc.href}
              className="ca-resources-featured-card"
            >
              <div className="ca-resources-featured-category">{doc.category}</div>
              <h3 className="ca-resources-featured-title">{doc.title}</h3>
              <p className="ca-resources-featured-desc">{doc.description}</p>
              <div className="ca-resources-featured-meta">
                <span className="text-sm text-slate-500">View documentation</span>
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>

        <div className="ca-resources-view-all">
          <Link href="/docs" className="ca-btn-hero-primary" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
            Browse All Documentation
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <div className="ca-final-cta-badge" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
            <Terminal className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Start Building
          </div>
          <h2 className="ca-final-cta-title">{`Ready to Integrate ${site.name}?`}</h2>
          <p className="ca-final-cta-subtitle">
            Get your API key and start building in minutes.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/signup" className="ca-btn-cta-primary" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
              Get API Key
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
            <Link href="/docs/api/reference" className="ca-btn-cta-secondary" style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}>
              View API Reference
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
