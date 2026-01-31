import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Cookie, Shield, Settings, BarChart3 } from "lucide-react"
import "../premium.css"

export const metadata: Metadata = {
  title: "Cookie Policy | CloudAct.ai",
  description: "Learn how CloudAct.ai uses cookies and similar technologies to improve your experience and analyze site traffic.",
  openGraph: {
    title: "Cookie Policy | CloudAct.ai",
    description: "CloudAct.ai cookie policy and tracking technologies.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

const COOKIE_TYPES = [
  {
    icon: Shield,
    title: "Essential Cookies",
    description: "Required for the website to function properly. These cookies enable core functionality such as security, network management, and accessibility.",
    examples: ["Session management", "Authentication", "Security tokens", "Load balancing"],
    canDisable: false,
  },
  {
    icon: Settings,
    title: "Functional Cookies",
    description: "Enable enhanced functionality and personalization. These cookies remember your preferences and settings.",
    examples: ["Language preferences", "Theme settings", "Form data", "User preferences"],
    canDisable: true,
  },
  {
    icon: BarChart3,
    title: "Analytics Cookies",
    description: "Help us understand how visitors interact with our website by collecting and reporting information anonymously.",
    examples: ["Page views", "Navigation patterns", "Feature usage", "Error tracking"],
    canDisable: true,
  },
]

const THIRD_PARTY_SERVICES = [
  { name: "Google Analytics", purpose: "Website analytics and traffic analysis", type: "Analytics" },
  { name: "Stripe", purpose: "Payment processing and fraud prevention", type: "Essential" },
  { name: "Supabase", purpose: "Authentication and session management", type: "Essential" },
  { name: "Vercel", purpose: "Website hosting and performance analytics", type: "Analytics" },
]

export default function CookiesPage() {
  const lastUpdated = "December 30, 2024"

  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero ca-page-hero-compact">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Cookie className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Legal
          </div>
          <h1 className="ca-page-hero-title">
            Cookie <span className="ca-hero-highlight-mint">Policy</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            Learn how we use cookies and similar technologies to improve your experience.
          </p>
          <p className="ca-legal-updated">Last updated: {lastUpdated}</p>
        </div>
      </section>

      {/* Cookie Overview */}
      <section className="ca-legal-section">
        <div className="ca-legal-container">
          <div className="ca-legal-intro">
            <Cookie className="w-12 h-12 ca-icon-mint" aria-hidden="true" />
            <h2>What Are Cookies?</h2>
            <p>
              Cookies are small text files that are stored on your device when you visit a website.
              They help websites remember your preferences, understand how you use the site, and
              provide a better experience. CloudAct.ai uses cookies and similar technologies to
              ensure our platform works properly and to improve our services.
            </p>
          </div>

          {/* Cookie Types */}
          <div className="ca-cookie-types">
            <h2 className="ca-legal-section-title">Types of Cookies We Use</h2>
            <div className="ca-cookie-types-grid">
              {COOKIE_TYPES.map((type) => {
                const Icon = type.icon
                return (
                  <div key={type.title} className="ca-cookie-type-card">
                    <div className="ca-cookie-type-header">
                      <div className="ca-cookie-type-icon">
                        <Icon className="w-6 h-6" aria-hidden="true" />
                      </div>
                      <div className="ca-cookie-type-meta">
                        <h3 className="ca-cookie-type-title">{type.title}</h3>
                        <span className={`ca-cookie-type-badge ${type.canDisable ? "ca-cookie-optional" : "ca-cookie-required"}`}>
                          {type.canDisable ? "Optional" : "Required"}
                        </span>
                      </div>
                    </div>
                    <p className="ca-cookie-type-desc">{type.description}</p>
                    <div className="ca-cookie-type-examples">
                      <span className="ca-cookie-examples-label">Examples:</span>
                      <ul>
                        {type.examples.map((example) => (
                          <li key={example}>{example}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Third Party Services */}
          <div className="ca-legal-block">
            <h2 className="ca-legal-section-title">Third-Party Services</h2>
            <p>
              We use trusted third-party services that may set their own cookies. These services
              help us provide and improve our platform:
            </p>
            <div className="ca-third-party-table">
              <div className="ca-third-party-header">
                <span>Service</span>
                <span>Purpose</span>
                <span>Type</span>
              </div>
              {THIRD_PARTY_SERVICES.map((service) => (
                <div key={service.name} className="ca-third-party-row">
                  <span className="ca-third-party-name">{service.name}</span>
                  <span className="ca-third-party-purpose">{service.purpose}</span>
                  <span className={`ca-third-party-type ca-third-party-type-${service.type.toLowerCase()}`}>
                    {service.type}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Managing Cookies */}
          <div className="ca-legal-block">
            <h2 className="ca-legal-section-title">Managing Your Cookie Preferences</h2>
            <p>
              You have control over the cookies stored on your device. Here are your options:
            </p>
            <div className="ca-cookie-management">
              <div className="ca-cookie-option">
                <h4>Browser Settings</h4>
                <p>
                  Most web browsers allow you to control cookies through their settings. You can
                  typically find these in the "Options" or "Preferences" menu of your browser.
                </p>
              </div>
              <div className="ca-cookie-option">
                <h4>Opt-Out Links</h4>
                <p>
                  For analytics cookies, you can opt out using:
                </p>
                <ul>
                  <li>
                    <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">
                      Google Analytics Opt-out
                    </a>
                  </li>
                </ul>
              </div>
              <div className="ca-cookie-option">
                <h4>Impact of Disabling Cookies</h4>
                <p>
                  Please note that disabling certain cookies may affect the functionality of our
                  website. Essential cookies cannot be disabled as they are necessary for the
                  site to function properly.
                </p>
              </div>
            </div>
          </div>

          {/* Updates */}
          <div className="ca-legal-block">
            <h2 className="ca-legal-section-title">Updates to This Policy</h2>
            <p>
              We may update this Cookie Policy from time to time to reflect changes in our practices
              or for legal, operational, or regulatory reasons. We will notify you of any material
              changes by posting the updated policy on this page with a new "Last Updated" date.
            </p>
          </div>

          {/* Contact */}
          <div className="ca-legal-block">
            <h2 className="ca-legal-section-title">Contact Us</h2>
            <p>
              If you have questions about our use of cookies or this Cookie Policy, please contact us:
            </p>
            <div className="ca-legal-contact">
              <p>
                <strong>CloudAct Inc.</strong><br />
                100 S Murphy Ave, STE 200 PMB4013<br />
                Sunnyvale, CA 94086<br />
                United States
              </p>
              <p>
                Email: <a href="mailto:privacy@cloudact.ai">privacy@cloudact.ai</a>
              </p>
            </div>
          </div>

          {/* Related Links */}
          <div className="ca-legal-related">
            <h3>Related Policies</h3>
            <div className="ca-legal-related-links">
              <Link href="/privacy" className="ca-legal-related-link">
                Privacy Policy
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link href="/terms" className="ca-legal-related-link">
                Terms of Service
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link href="/security" className="ca-legal-related-link">
                Security
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
