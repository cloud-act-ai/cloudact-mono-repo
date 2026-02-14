import type { Metadata } from "next"
import Link from "next/link"
import { siteTitle } from "@/lib/site"
import {
  Book,
  Code,
  Zap,
  Cloud,
  Cpu,
  CreditCard,
  ArrowRight,
  FileCode,
  Terminal,
  GitBranch,
  Database,
  Lock,
  Webhook,
  Settings,
  BarChart3,
  Sparkles,
  ExternalLink,
} from "lucide-react"
import "../premium.css"

export const metadata: Metadata = {
  title: siteTitle("Documentation"),
  description: "Complete documentation for CloudAct.ai. API reference, integration guides, SDKs, and best practices for cloud cost optimization.",
  openGraph: {
    title: siteTitle("Documentation"),
    description: "API reference, integration guides, and developer documentation.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

const QUICK_START_GUIDES = [
  {
    icon: Zap,
    title: "Quick Start",
    description: "Get up and running in 5 minutes",
    href: "/docs/quick-start",
    time: "5 min",
  },
  {
    icon: Cloud,
    title: "Connect Cloud Providers",
    description: "AWS, Azure, GCP integration guide",
    href: "/integrations",
    time: "10 min",
  },
  {
    icon: Cpu,
    title: "GenAI Cost Tracking",
    description: "Monitor LLM API costs",
    href: "/features#genai",
    time: "8 min",
  },
  {
    icon: CreditCard,
    title: "SaaS Subscriptions",
    description: "Track software subscriptions",
    href: "/features#saas",
    time: "6 min",
  },
]

const API_SECTIONS = [
  {
    icon: Terminal,
    title: "REST API Reference",
    description: "Complete API documentation with examples",
    href: "/docs/api/reference",
  },
  {
    icon: Lock,
    title: "Authentication",
    description: "API keys, OAuth, and security",
    href: "/docs/api/reference",
  },
  {
    icon: Database,
    title: "Data Models",
    description: "Cost data schemas and types",
    href: "/docs/api/reference",
  },
  {
    icon: Webhook,
    title: "Webhooks",
    description: "Real-time event notifications",
    href: "/docs/api/reference",
  },
]

const SDK_LIBRARIES = [
  { name: "JavaScript/TypeScript", status: "Available", href: "/docs/api/reference" },
  { name: "Python", status: "Available", href: "/docs/api/reference" },
  { name: "Go", status: "Coming Soon", href: "/docs/api/reference" },
  { name: "Ruby", status: "Coming Soon", href: "/docs/api/reference" },
]

const DOC_CATEGORIES = [
  {
    icon: Book,
    title: "Guides",
    description: "Step-by-step tutorials and how-tos",
    articles: [
      { title: "Setting up cost alerts", href: "/features#alerts" },
      { title: "Creating custom reports", href: "/features#analytics" },
      { title: "Team management", href: "/docs/api/reference" },
      { title: "Budget management", href: "/pricing" },
    ],
  },
  {
    icon: GitBranch,
    title: "Integrations",
    description: "Connect your tools and services",
    articles: [
      { title: "AWS Cost Explorer", href: "/integrations" },
      { title: "Google Cloud Billing", href: "/integrations" },
      { title: "Azure Cost Management", href: "/integrations" },
      { title: "OpenAI API", href: "/integrations" },
    ],
  },
  {
    icon: BarChart3,
    title: "Analytics",
    description: "Understand your cost data",
    articles: [
      { title: "Dashboard overview", href: "/features#analytics" },
      { title: "Cost allocation", href: "/features#analytics" },
      { title: "Trend analysis", href: "/features#analytics" },
      { title: "Forecasting", href: "/features#analytics" },
    ],
  },
  {
    icon: Settings,
    title: "Configuration",
    description: "Customize your setup",
    articles: [
      { title: "Organization settings", href: "/docs/api/reference" },
      { title: "User permissions", href: "/docs/api/reference" },
      { title: "Notification settings", href: "/features#alerts" },
      { title: "Data retention", href: "/security" },
    ],
  },
]

const RESOURCES = [
  { title: "API Status", description: "Real-time API status and uptime", href: "https://status.cloudact.ai", external: true },
  { title: "Changelog", description: "Latest updates and releases", href: "/resources/blog", external: false },
  { title: "Postman Collection", description: "Import our API collection", href: "/docs/api/reference", external: false },
  { title: "OpenAPI Spec", description: "Download OpenAPI 3.0 spec", href: "/docs/api/reference", external: false },
]

export default function DocsPage() {
  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Book className="w-4 h-4" style={{ color: '#ffffff' }} />
            Documentation
          </div>
          <h1 className="ca-page-hero-title">
            Developer{" "}
            <span className="ca-hero-highlight-mint">Documentation</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            Everything you need to integrate CloudAct.ai. Guides, API reference, SDKs, and best practices.
          </p>
          <div className="ca-hero-buttons">
            <Link href="/docs/quick-start" className="ca-btn-hero-primary" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
              Quick Start Guide
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/docs/api/reference" className="ca-btn-hero-secondary" style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}>
              API Reference
            </Link>
          </div>
        </div>
      </section>

      {/* Quick Start */}
      <section className="ca-docs-quickstart-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Zap className="w-4 h-4" style={{ color: '#ffffff' }} />
            Get Started
          </span>
          <h2 className="ca-section-title">Quick Start Guides</h2>
          <p className="ca-section-subtitle">
            Get up and running with CloudAct.ai in minutes
          </p>
        </div>

        <div className="ca-docs-quickstart-grid">
          {QUICK_START_GUIDES.map((guide) => {
            const Icon = guide.icon
            return (
              <Link key={guide.title} href={guide.href} className="ca-docs-quickstart-card">
                <div className="ca-docs-quickstart-icon">
                  <Icon className="w-6 h-6" />
                </div>
                <div className="ca-docs-quickstart-content">
                  <h3 className="ca-docs-quickstart-title">{guide.title}</h3>
                  <p className="ca-docs-quickstart-desc">{guide.description}</p>
                </div>
                <div className="ca-docs-quickstart-footer">
                  <span className="ca-docs-quickstart-time">{guide.time}</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* API Reference */}
      <section className="ca-docs-api-section">
        <div className="ca-docs-api-container">
          <div className="ca-docs-api-header">
            <div className="ca-docs-api-icon">
              <FileCode className="w-8 h-8" />
            </div>
            <div>
              <h2 className="ca-docs-api-title">API Reference</h2>
              <p className="ca-docs-api-desc">
                Complete REST API documentation with request/response examples
              </p>
            </div>
          </div>

          <div className="ca-docs-api-grid">
            {API_SECTIONS.map((section) => {
              const Icon = section.icon
              return (
                <Link key={section.title} href={section.href} className="ca-docs-api-card">
                  <Icon className="w-5 h-5 ca-icon-mint" />
                  <h3 className="ca-docs-api-card-title">{section.title}</h3>
                  <p className="ca-docs-api-card-desc">{section.description}</p>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )
            })}
          </div>

          <div className="ca-docs-api-cta">
            <Link href="/docs/api/reference" className="ca-btn-hero-secondary" style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}>
              View Full API Reference
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* SDKs */}
      <section className="ca-docs-sdk-section">
        <div className="ca-section-header-centered">
          <div className="ca-docs-sdk-icon">
            <Code className="w-8 h-8" />
          </div>
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Code className="w-4 h-4" style={{ color: '#ffffff' }} />
            SDKs & Libraries
          </span>
          <h2 className="ca-section-title">Official SDKs</h2>
          <p className="ca-section-subtitle">
            Client libraries for popular programming languages
          </p>
        </div>

        <div className="ca-docs-sdk-grid">
          {SDK_LIBRARIES.map((sdk) => (
            <Link
              key={sdk.name}
              href={sdk.href}
              className={`ca-docs-sdk-card ${sdk.status === "Coming Soon" ? "ca-docs-sdk-card-disabled" : ""}`}
            >
              <span className="ca-docs-sdk-name">{sdk.name}</span>
              <span className={`ca-docs-sdk-status ${sdk.status === "Available" ? "ca-docs-sdk-available" : "ca-docs-sdk-coming"}`}>
                {sdk.status}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Documentation Categories */}
      <section className="ca-docs-categories-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <FileCode className="w-4 h-4" style={{ color: '#ffffff' }} />
            Browse Documentation
          </span>
          <h2 className="ca-section-title">Documentation Categories</h2>
        </div>

        <div className="ca-docs-categories-grid">
          {DOC_CATEGORIES.map((category) => {
            const Icon = category.icon
            return (
              <div key={category.title} className="ca-docs-category-card">
                <div className="ca-docs-category-header">
                  <div className="ca-docs-category-icon">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="ca-docs-category-title">{category.title}</h3>
                    <p className="ca-docs-category-desc">{category.description}</p>
                  </div>
                </div>
                <ul className="ca-docs-category-articles">
                  {category.articles.map((article) => (
                    <li key={article.title}>
                      <Link href={article.href} className="ca-docs-article-link">
                        {article.title}
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      {/* Additional Resources */}
      <section className="ca-docs-resources-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <ExternalLink className="w-4 h-4" style={{ color: '#ffffff' }} />
            Resources
          </span>
          <h2 className="ca-section-title">Additional Resources</h2>
        </div>

        <div className="ca-docs-resources-grid">
          {RESOURCES.map((resource) => (
            <Link
              key={resource.title}
              href={resource.href}
              className="ca-docs-resource-card"
              {...(resource.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              <div className="ca-docs-resource-content">
                <h3 className="ca-docs-resource-title">{resource.title}</h3>
                <p className="ca-docs-resource-desc">{resource.description}</p>
              </div>
              {resource.external ? (
                <ExternalLink className="w-5 h-5" />
              ) : (
                <ArrowRight className="w-5 h-5" />
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <div className="ca-final-cta-badge" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
            <Sparkles className="w-4 h-4" style={{ color: '#ffffff' }} />
            Need Help?
          </div>
          <h2 className="ca-final-cta-title">Can't Find What You're Looking For?</h2>
          <p className="ca-final-cta-subtitle">
            Our support team is here to help. Contact us or visit our help center for assistance.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/help" className="ca-btn-cta-primary" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
              Visit Help Center
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/contact" className="ca-btn-cta-secondary" style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}>
              Contact Support
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
