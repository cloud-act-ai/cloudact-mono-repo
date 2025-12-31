import type { Metadata } from "next"
import Link from "next/link"
import {
  Newspaper,
  ArrowRight,
  Download,
  Mail,
  Image as ImageIcon,
  FileText,
  Quote,
  Calendar,
  ExternalLink,
} from "lucide-react"
import "../premium.css"

export const metadata: Metadata = {
  title: "Press | CloudAct.ai",
  description: "Press and media resources for CloudAct.ai. Download brand assets, press releases, and contact our communications team.",
  openGraph: {
    title: "Press | CloudAct.ai",
    description: "Press and media resources for CloudAct.ai.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

const PRESS_RELEASES = [
  {
    date: "December 2024",
    title: "CloudAct.ai Launches AI-Powered Cost Anomaly Detection",
    description: "New feature helps enterprises catch cloud cost overruns before they impact budgets.",
  },
  {
    date: "October 2024",
    title: "CloudAct.ai Announces GenAI Cost Tracking for OpenAI and Anthropic",
    description: "First FinOps platform to offer unified tracking for LLM API spending.",
  },
  {
    date: "August 2024",
    title: "CloudAct.ai Raises Series A to Expand FinOps Platform",
    description: "Funding will accelerate product development and go-to-market expansion.",
  },
]

const MEDIA_RESOURCES = [
  {
    icon: ImageIcon,
    title: "Brand Assets",
    description: "Logos, icons, and brand guidelines",
    action: "Download Kit",
    href: "mailto:press@cloudact.ai?subject=Brand Assets Request",
  },
  {
    icon: FileText,
    title: "Fact Sheet",
    description: "Company overview and key facts",
    action: "Download PDF",
    href: "mailto:press@cloudact.ai?subject=Fact Sheet Request",
  },
  {
    icon: Quote,
    title: "Executive Bios",
    description: "Leadership team biographies",
    action: "View Bios",
    href: "/about#team",
  },
]

const COMPANY_FACTS = [
  { label: "Founded", value: "2023" },
  { label: "Headquarters", value: "Sunnyvale, CA" },
  { label: "Team Size", value: "20+ employees" },
  { label: "Global Presence", value: "8 countries" },
  { label: "Customers", value: "340+ teams" },
  { label: "Integrations", value: "50+ platforms" },
]

export default function PressPage() {
  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow">
            <Newspaper className="w-4 h-4" />
            Press & Media
          </div>
          <h1 className="ca-page-hero-title">
            <span className="ca-hero-highlight-mint">CloudAct</span> in the News
          </h1>
          <p className="ca-page-hero-subtitle">
            Press releases, media resources, and contact information for journalists and analysts.
          </p>
          <div className="ca-hero-cta-group">
            <a href="mailto:press@cloudact.ai?subject=Media Inquiry" className="ca-btn-hero-primary">
              Contact Press Team
              <ArrowRight className="w-5 h-5" />
            </a>
            <a href="mailto:press@cloudact.ai?subject=Brand Assets Request" className="ca-btn-hero-secondary">
              <Download className="w-5 h-5" />
              Download Brand Kit
            </a>
          </div>
        </div>
      </section>

      {/* Press Releases Section */}
      <section className="ca-section-white">
        <div className="ca-section-container">
          <div className="ca-section-header-centered">
            <span className="ca-section-eyebrow">
              <FileText className="w-4 h-4" />
              Press Releases
            </span>
            <h2 className="ca-section-title">Latest announcements</h2>
          </div>

          <div className="ca-press-releases-list">
            {PRESS_RELEASES.map((release, i) => (
              <div key={i} className="ca-press-release-card">
                <div className="ca-press-release-date">
                  <Calendar className="w-4 h-4" />
                  {release.date}
                </div>
                <h3 className="ca-press-release-title">{release.title}</h3>
                <p className="ca-press-release-desc">{release.description}</p>
                <a
                  href={`mailto:press@cloudact.ai?subject=Press Release: ${release.title}`}
                  className="ca-press-release-link"
                >
                  Read Full Release
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Media Resources Section */}
      <section className="ca-section-gray">
        <div className="ca-section-container">
          <div className="ca-section-header-centered">
            <span className="ca-section-eyebrow">
              <Download className="w-4 h-4" />
              Media Resources
            </span>
            <h2 className="ca-section-title">Press kit and assets</h2>
          </div>

          <div className="ca-press-resources-grid">
            {MEDIA_RESOURCES.map((resource, i) => {
              const Icon = resource.icon
              return (
                <div key={i} className="ca-press-resource-card">
                  <div className="ca-press-resource-icon">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="ca-press-resource-title">{resource.title}</h3>
                  <p className="ca-press-resource-desc">{resource.description}</p>
                  <a href={resource.href} className="ca-press-resource-link">
                    {resource.action}
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Company Facts Section */}
      <section className="ca-section-white">
        <div className="ca-section-container">
          <div className="ca-section-header-centered">
            <h2 className="ca-section-title">Company at a Glance</h2>
          </div>

          <div className="ca-press-facts-grid">
            {COMPANY_FACTS.map((fact, i) => (
              <div key={i} className="ca-press-fact">
                <span className="ca-press-fact-label">{fact.label}</span>
                <span className="ca-press-fact-value">{fact.value}</span>
              </div>
            ))}
          </div>

          <div className="ca-press-boilerplate">
            <h3>About CloudAct.ai</h3>
            <p>
              CloudAct.ai is the unified platform for cloud, GenAI, and SaaS cost management.
              Our AI-powered solution helps engineering and finance teams gain visibility into
              their spending, optimize costs, and make data-driven decisions. Founded in 2023,
              CloudAct.ai is trusted by over 340 teams worldwide and has helped customers save
              over $2.4 million in cloud costs. The company is headquartered in Sunnyvale,
              California with a remote-first team across 8 countries.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="ca-section-gray">
        <div className="ca-section-container">
          <div className="ca-press-contact">
            <h2 className="ca-press-contact-title">Media Contact</h2>
            <p className="ca-press-contact-desc">
              For press inquiries, interview requests, or media resources, please contact our communications team.
            </p>
            <a href="mailto:press@cloudact.ai" className="ca-press-contact-email">
              <Mail className="w-5 h-5" />
              press@cloudact.ai
            </a>
            <p className="ca-press-contact-note">
              We typically respond to media inquiries within 24 hours.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <h2 className="ca-final-cta-title">Want to Learn More?</h2>
          <p className="ca-final-cta-subtitle">
            Explore our platform or get in touch with our team.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/demo" className="ca-btn-cta-primary">
              Request Demo
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/about" className="ca-btn-cta-secondary">
              About Us
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
